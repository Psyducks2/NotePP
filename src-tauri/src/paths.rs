use std::fs;
use std::path::PathBuf;

const APP_NAME: &str = "notepp";

pub fn data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "Não foi possível resolver XDG data dir".to_string())?;
    let dir = base.join(APP_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar data dir: {e}"))?;
    Ok(dir)
}

pub fn config_dir() -> Result<PathBuf, String> {
    let base =
        dirs::config_dir().ok_or_else(|| "Não foi possível resolver XDG config dir".to_string())?;
    let dir = base.join(APP_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("Falha ao criar config dir: {e}"))?;
    Ok(dir)
}

pub fn session_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("session.json"))
}

pub fn settings_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("settings.json"))
}

pub fn dictation_history_path() -> Result<PathBuf, String> {
    Ok(data_dir()?.join("dictation-history.json"))
}
