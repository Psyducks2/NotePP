use std::fs;

use serde::{Deserialize, Serialize};

use crate::paths::session_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTab {
    pub id: String,
    pub title: String,
    pub path: Option<String>,
    pub content: String,
    pub cursor: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    pub tabs: Vec<SessionTab>,
    pub active_id: Option<String>,
}

#[tauri::command]
pub fn load_session() -> Result<SessionState, String> {
    let path = session_path()?;
    if !path.exists() {
        return Ok(SessionState {
            tabs: vec![],
            active_id: None,
        });
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Erro ao ler sessão: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Sessão inválida: {e}"))
}

#[tauri::command]
pub fn save_session(session: SessionState) -> Result<(), String> {
    let path = session_path()?;
    let raw = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Erro ao serializar sessão: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Erro ao gravar sessão: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_roundtrip_json() {
        let session = SessionState {
            active_id: Some("tab-1".into()),
            tabs: vec![SessionTab {
                id: "tab-1".into(),
                title: "nota.md".into(),
                path: Some("/tmp/nota.md".into()),
                content: "# ola".into(),
                cursor: Some(2),
            }],
        };
        let raw = serde_json::to_string(&session).unwrap();
        assert!(raw.contains("activeId"));
        assert!(raw.contains("nota.md"));
        let back: SessionState = serde_json::from_str(&raw).unwrap();
        assert_eq!(back.tabs.len(), 1);
        assert_eq!(back.tabs[0].content, "# ola");
    }
}
