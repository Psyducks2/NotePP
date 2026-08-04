use std::path::Path;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total: u64,
}

/// Downloads `url` to `dest`, emitting `event` with progress as bytes arrive.
/// Writes to a `.part` sibling file first and renames atomically on success so a
/// partially downloaded file is never mistaken for a complete one.
pub async fn download_file_with_progress(
    app: &AppHandle,
    event: &str,
    id: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Erro ao baixar: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Erro ao baixar: HTTP {}", resp.status()));
    }
    let total = resp.content_length().unwrap_or(0);

    let tmp_path = dest.with_extension("part");
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| format!("Erro ao criar arquivo: {e}"))?;

    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Erro no download: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Erro ao gravar arquivo: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit(
            event,
            DownloadProgress {
                id: id.to_string(),
                downloaded,
                total,
            },
        );
    }
    file.flush()
        .await
        .map_err(|e| format!("Erro ao gravar arquivo: {e}"))?;
    drop(file);

    tokio::fs::rename(&tmp_path, dest)
        .await
        .map_err(|e| format!("Erro ao finalizar download: {e}"))?;
    Ok(())
}
