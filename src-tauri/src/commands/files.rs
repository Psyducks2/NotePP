use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FilePath};

/// Paths passed on the CLI when the OS opens files with NotePP (`notepp arquivo.txt`).
#[tauri::command]
pub fn launch_file_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .filter(|arg| {
            let path = Path::new(arg);
            path.is_file()
                || path
                    .extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|ext| {
                        matches!(
                            ext.to_ascii_lowercase().as_str(),
                            "txt" | "md" | "markdown" | "text"
                        )
                    })
        })
        .collect()
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Erro ao ler arquivo: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("Erro ao criar pasta: {e}"))?;
        }
    }
    fs::write(&path, contents).map_err(|e| format!("Erro ao gravar arquivo: {e}"))
}

fn file_path_to_string(path: FilePath) -> Option<String> {
    match path {
        FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        FilePath::Url(url) => url.to_file_path().ok().map(|p| p.to_string_lossy().into_owned()),
    }
}

#[tauri::command]
pub fn pick_open_files(app: AppHandle) -> Result<Vec<String>, String> {
    let files = app
        .dialog()
        .file()
        .add_filter("Texto", &["txt", "md", "text"])
        .add_filter("Markdown", &["md"])
        .add_filter("Todos", &["*"])
        .set_title("Abrir")
        .blocking_pick_files();

    Ok(files
        .unwrap_or_default()
        .into_iter()
        .filter_map(file_path_to_string)
        .collect())
}

#[tauri::command]
pub fn pick_save_file(app: AppHandle, default_name: Option<String>) -> Result<Option<String>, String> {
    let mut builder = app
        .dialog()
        .file()
        .add_filter("Texto", &["txt"])
        .add_filter("Markdown", &["md"])
        .add_filter("Texto (.text)", &["text"])
        .add_filter("Todos", &["*"])
        .set_title("Salvar como");

    if let Some(name) = default_name {
        builder = builder.set_file_name(&name);
    }

    Ok(builder.blocking_save_file().and_then(file_path_to_string))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn write_and_read_text_file() {
        let dir = env::temp_dir().join("notepp-qa");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("sample.md");
        let path_str = path.to_string_lossy().to_string();
        write_text_file(path_str.clone(), "# NotePP\n".into()).unwrap();
        let content = read_text_file(path_str).unwrap();
        assert_eq!(content, "# NotePP\n");
    }
}
