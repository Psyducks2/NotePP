mod commands;
mod paths;
mod voice;

use commands::files::{pick_open_files, pick_save_file, read_text_file, write_text_file};
use commands::session::{load_session, save_session};
use commands::settings::{load_settings, save_settings};
use voice::audio::{list_audio_input_devices, test_microphone};
use voice::cleanup::{
    cleanup_model_status, clean_transcript, delete_cleanup_model, download_cleanup_model,
};
use voice::dictation::{
    start_dictation, stop_dictation, transcribe_dictation, whisper_gpu_status, DictationState,
    WhisperCache,
};
use voice::history::{
    delete_dictation_entry, discard_all_dictation_entries, load_dictation_history,
    record_dictation_entry, set_dictation_entry_discarded,
};
use voice::models::{delete_whisper_model, download_whisper_model, list_whisper_models};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DictationState::default())
        .manage(WhisperCache::default())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            pick_open_files,
            pick_save_file,
            load_session,
            save_session,
            load_settings,
            save_settings,
            list_whisper_models,
            download_whisper_model,
            delete_whisper_model,
            start_dictation,
            stop_dictation,
            transcribe_dictation,
            whisper_gpu_status,
            cleanup_model_status,
            download_cleanup_model,
            delete_cleanup_model,
            clean_transcript,
            load_dictation_history,
            record_dictation_entry,
            set_dictation_entry_discarded,
            discard_all_dictation_entries,
            delete_dictation_entry,
            list_audio_input_devices,
            test_microphone,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
