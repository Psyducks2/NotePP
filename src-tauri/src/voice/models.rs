use std::path::PathBuf;

use serde::Serialize;
use tauri::AppHandle;

use crate::paths::data_dir;
use crate::voice::download::download_file_with_progress;

pub struct WhisperModelSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub filename: &'static str,
    pub size_bytes: u64,
    pub recommended: bool,
}

/// Official ggml model files published by ggerganov/whisper.cpp on Hugging Face.
/// Sizes match what's actually served, so the UI never shows a wrong estimate.
pub const WHISPER_MODELS: &[WhisperModelSpec] = &[
    WhisperModelSpec {
        id: "tiny",
        label: "Tiny",
        filename: "ggml-tiny.bin",
        size_bytes: 77_691_713,
        recommended: false,
    },
    WhisperModelSpec {
        id: "base",
        label: "Base",
        filename: "ggml-base.bin",
        size_bytes: 147_951_465,
        recommended: true,
    },
    WhisperModelSpec {
        id: "small",
        label: "Small",
        filename: "ggml-small.bin",
        size_bytes: 487_601_967,
        recommended: false,
    },
    WhisperModelSpec {
        id: "medium",
        label: "Medium",
        filename: "ggml-medium.bin",
        size_bytes: 1_533_763_059,
        recommended: false,
    },
    WhisperModelSpec {
        id: "large",
        label: "Large",
        filename: "ggml-large-v3.bin",
        size_bytes: 3_095_033_483,
        recommended: false,
    },
    WhisperModelSpec {
        id: "turbo",
        label: "Turbo",
        filename: "ggml-large-v3-turbo.bin",
        size_bytes: 1_624_555_275,
        recommended: false,
    },
];

fn find_spec(id: &str) -> Result<&'static WhisperModelSpec, String> {
    WHISPER_MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| format!("Modelo de voz desconhecido: {id}"))
}

fn whisper_models_dir() -> Result<PathBuf, String> {
    let dir = data_dir()?.join("whisper-models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar pasta de modelos: {e}"))?;
    Ok(dir)
}

pub fn whisper_model_path(id: &str) -> Result<PathBuf, String> {
    let spec = find_spec(id)?;
    Ok(whisper_models_dir()?.join(spec.filename))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperModelStatus {
    pub id: String,
    pub label: String,
    pub size_bytes: u64,
    pub downloaded: bool,
    pub recommended: bool,
}

#[tauri::command]
pub fn list_whisper_models() -> Result<Vec<WhisperModelStatus>, String> {
    let dir = whisper_models_dir()?;
    Ok(WHISPER_MODELS
        .iter()
        .map(|m| WhisperModelStatus {
            id: m.id.to_string(),
            label: m.label.to_string(),
            size_bytes: m.size_bytes,
            downloaded: dir.join(m.filename).exists(),
            recommended: m.recommended,
        })
        .collect())
}

#[tauri::command]
pub async fn download_whisper_model(app: AppHandle, id: String) -> Result<(), String> {
    let spec = find_spec(&id)?;
    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        spec.filename
    );
    let dest = whisper_models_dir()?.join(spec.filename);
    download_file_with_progress(&app, "whisper-download-progress", &id, &url, &dest).await
}

#[tauri::command]
pub fn delete_whisper_model(id: String) -> Result<(), String> {
    let path = whisper_model_path(&id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Erro ao remover modelo: {e}"))?;
    }
    Ok(())
}
