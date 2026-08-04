use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::paths::data_dir;
use crate::voice::download::download_file_with_progress;

const CLEANUP_MODEL_URL: &str = "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf";
const CLEANUP_MODEL_FILENAME: &str = "qwen2.5-1.5b-instruct-q4_k_m.gguf";
const CLEANUP_MODEL_SIZE_BYTES: u64 = 1_117_320_736;
const CLEANUP_DOWNLOAD_ID: &str = "cleanup";

fn cleanup_model_dir() -> Result<PathBuf, String> {
    let dir = data_dir()?.join("llm-models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar pasta de modelos: {e}"))?;
    Ok(dir)
}

fn cleanup_model_path() -> Result<PathBuf, String> {
    Ok(cleanup_model_dir()?.join(CLEANUP_MODEL_FILENAME))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupModelStatus {
    pub downloaded: bool,
    pub size_bytes: u64,
}

#[tauri::command]
pub fn cleanup_model_status() -> Result<CleanupModelStatus, String> {
    Ok(CleanupModelStatus {
        downloaded: cleanup_model_path()?.exists(),
        size_bytes: CLEANUP_MODEL_SIZE_BYTES,
    })
}

#[tauri::command]
pub async fn download_cleanup_model(app: AppHandle) -> Result<(), String> {
    let dest = cleanup_model_path()?;
    download_file_with_progress(
        &app,
        "cleanup-download-progress",
        CLEANUP_DOWNLOAD_ID,
        CLEANUP_MODEL_URL,
        &dest,
    )
    .await
}

#[tauri::command]
pub fn delete_cleanup_model() -> Result<(), String> {
    let path = cleanup_model_path()?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Erro ao remover modelo: {e}"))?;
    }
    Ok(())
}

#[derive(Serialize)]
struct WorkerRequest<'a> {
    model_path: String,
    system_prompt: &'a str,
    text: &'a str,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum WorkerResponse {
    Ok { text: String },
    Err { error: String },
}

/// The cleanup LLM (llama.cpp via llama-cpp-2) runs in a separate `cleanup-worker`
/// process rather than in-process, because llama.cpp and whisper.cpp (used for
/// dictation) each vendor their own copy of ggml under identical symbol names —
/// linking both into one binary fails at link time. Cargo builds cleanup-worker as
/// a workspace sibling, so it always lands next to the main executable.
fn worker_binary_path() -> Result<PathBuf, String> {
    let exe =
        std::env::current_exe().map_err(|e| format!("Erro ao localizar aplicativo: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Erro ao localizar aplicativo".to_string())?;
    let name = if cfg!(windows) {
        "cleanup-worker.exe"
    } else {
        "cleanup-worker"
    };
    let path = dir.join(name);
    if !path.exists() {
        return Err("Worker de limpeza não encontrado".to_string());
    }
    Ok(path)
}

#[tauri::command]
pub fn clean_transcript(text: String, prompt: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Ok(String::new());
    }
    let model_path = cleanup_model_path()?;
    if !model_path.exists() {
        return Err("Modelo de limpeza não baixado".to_string());
    }
    let worker = worker_binary_path()?;

    let request = WorkerRequest {
        model_path: model_path.to_string_lossy().into_owned(),
        system_prompt: &prompt,
        text: &text,
    };
    let payload = serde_json::to_vec(&request).map_err(|e| format!("Erro interno: {e}"))?;

    let mut child = Command::new(worker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Erro ao iniciar limpeza: {e}"))?;

    child
        .stdin
        .take()
        .ok_or_else(|| "Erro ao iniciar limpeza".to_string())?
        .write_all(&payload)
        .map_err(|e| format!("Erro ao enviar texto: {e}"))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Erro ao executar limpeza: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let response: WorkerResponse = serde_json::from_str(stdout.trim()).map_err(|_| {
        let stderr = String::from_utf8_lossy(&output.stderr);
        format!("Resposta inválida da limpeza: {stderr}")
    })?;

    match response {
        WorkerResponse::Ok { text } => Ok(text),
        WorkerResponse::Err { error } => Err(error),
    }
}
