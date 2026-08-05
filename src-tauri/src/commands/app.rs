use tauri::AppHandle;

/// Force-quit the process. Used after close is intercepted so we never leave
/// a window stuck in a preventDefault ↔ destroy re-entry loop.
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
