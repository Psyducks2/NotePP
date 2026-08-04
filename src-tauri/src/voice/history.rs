use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::paths::dictation_history_path;

/// Hard cap so the history file can't grow unbounded over months of daily use.
const MAX_ENTRIES: usize = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationEntry {
    pub id: String,
    /// Milliseconds since the Unix epoch — plain numbers are trivial to sort/group
    /// by day on the frontend without pulling in a date-parsing dependency.
    pub timestamp_ms: u64,
    pub raw_text: String,
    pub cleaned_text: Option<String>,
    #[serde(default)]
    pub discarded: bool,
}

fn load_all() -> Result<Vec<DictationEntry>, String> {
    let path = dictation_history_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Erro ao ler histórico: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&raw).map_err(|e| format!("Histórico inválido: {e}"))
}

fn save_all(entries: &[DictationEntry]) -> Result<(), String> {
    let path = dictation_history_path()?;
    let raw = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Erro ao serializar histórico: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("Erro ao gravar histórico: {e}"))
}

#[tauri::command]
pub fn load_dictation_history() -> Result<Vec<DictationEntry>, String> {
    load_all()
}

#[tauri::command]
pub fn record_dictation_entry(
    raw_text: String,
    cleaned_text: Option<String>,
) -> Result<DictationEntry, String> {
    let mut entries = load_all()?;
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let entry = DictationEntry {
        id: format!("dict-{timestamp_ms}-{}", entries.len()),
        timestamp_ms,
        raw_text,
        cleaned_text,
        discarded: false,
    };
    entries.insert(0, entry.clone());
    entries.truncate(MAX_ENTRIES);
    save_all(&entries)?;
    Ok(entry)
}

#[tauri::command]
pub fn set_dictation_entry_discarded(id: String, discarded: bool) -> Result<(), String> {
    let mut entries = load_all()?;
    let Some(entry) = entries.iter_mut().find(|e| e.id == id) else {
        return Err("Item do histórico não encontrado".to_string());
    };
    entry.discarded = discarded;
    save_all(&entries)
}

#[tauri::command]
pub fn discard_all_dictation_entries() -> Result<(), String> {
    let mut entries = load_all()?;
    for entry in entries.iter_mut() {
        entry.discarded = true;
    }
    save_all(&entries)
}

#[tauri::command]
pub fn delete_dictation_entry(id: String) -> Result<(), String> {
    let mut entries = load_all()?;
    entries.retain(|e| e.id != id);
    save_all(&entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_round_trips_camel_case() {
        let entry = DictationEntry {
            id: "dict-1-0".to_string(),
            timestamp_ms: 1_700_000_000_000,
            raw_text: "ola mundo".to_string(),
            cleaned_text: Some("Olá, mundo!".to_string()),
            discarded: false,
        };
        let raw = serde_json::to_string(&entry).unwrap();
        assert!(raw.contains("timestampMs"));
        assert!(raw.contains("rawText"));
        assert!(raw.contains("cleanedText"));
        let back: DictationEntry = serde_json::from_str(&raw).unwrap();
        assert_eq!(back.raw_text, "ola mundo");
    }

    #[test]
    fn missing_discarded_defaults_to_false() {
        let legacy = r#"{"id":"x","timestampMs":1,"rawText":"a","cleanedText":null}"#;
        let entry: DictationEntry = serde_json::from_str(legacy).unwrap();
        assert!(!entry.discarded);
    }
}
