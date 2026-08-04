use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};

use cpal::traits::StreamTrait;
use tauri::State;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::voice::audio::{
    has_audio_signal, normalize_peak, open_capture_stream, rms_energy, MIN_RMS_ENERGY,
};
use crate::voice::models::whisper_model_path;

const TARGET_SAMPLE_RATE: u32 = 16_000;

pub struct DictationState {
    active: AtomicBool,
    buffer: Arc<Mutex<Vec<f32>>>,
    captured_rate: Mutex<u32>,
    stop_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl Default for DictationState {
    fn default() -> Self {
        Self {
            active: AtomicBool::new(false),
            buffer: Arc::new(Mutex::new(Vec::new())),
            captured_rate: Mutex::new(TARGET_SAMPLE_RATE),
            stop_tx: Mutex::new(None),
        }
    }
}

#[derive(Default)]
pub struct WhisperCache {
    /// Cache key is `"{model_id}|gpu={0|1}"` so toggling GPU reloads the context.
    loaded: Mutex<Option<(String, Arc<WhisperContext>)>>,
}

fn cache_key(model_id: &str, use_gpu: bool) -> String {
    format!("{model_id}|gpu={}", if use_gpu { 1 } else { 0 })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhisperGpuStatus {
    /// True when this binary was compiled with the `whisper-gpu` (Vulkan) feature.
    pub compiled_with_gpu: bool,
}

#[tauri::command]
pub fn whisper_gpu_status() -> WhisperGpuStatus {
    WhisperGpuStatus {
        compiled_with_gpu: cfg!(feature = "whisper-gpu"),
    }
}

#[tauri::command]
pub fn start_dictation(
    state: State<DictationState>,
    device_id: Option<String>,
) -> Result<(), String> {
    if state.active.swap(true, Ordering::SeqCst) {
        return Err("Ditado já em andamento".to_string());
    }
    state.buffer.lock().unwrap().clear();

    let (ready_tx, ready_rx) = mpsc::channel::<Result<u32, String>>();
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let buffer = state.buffer.clone();

    std::thread::spawn(move || {
        let (stream, sample_rate) = match open_capture_stream(device_id.as_deref(), buffer) {
            Ok(v) => v,
            Err(e) => {
                let _ = ready_tx.send(Err(e));
                return;
            }
        };
        if let Err(e) = stream.play() {
            let _ = ready_tx.send(Err(format!("Erro ao iniciar gravação: {e}")));
            return;
        }

        let _ = ready_tx.send(Ok(sample_rate));

        // Keep the stream alive on this thread until told to stop; dropping it here
        // (rather than trying to move it back across threads) stops the capture.
        let _ = stop_rx.recv();
        drop(stream);
    });

    match ready_rx.recv() {
        Ok(Ok(rate)) => {
            *state.captured_rate.lock().unwrap() = rate;
            *state.stop_tx.lock().unwrap() = Some(stop_tx);
            Ok(())
        }
        Ok(Err(e)) => {
            state.active.store(false, Ordering::SeqCst);
            Err(e)
        }
        Err(_) => {
            state.active.store(false, Ordering::SeqCst);
            Err("Falha ao iniciar gravação".to_string())
        }
    }
}

#[tauri::command]
pub fn stop_dictation(state: State<DictationState>) -> Result<(), String> {
    if let Some(tx) = state.stop_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    state.active.store(false, Ordering::SeqCst);
    // Give the capture thread a moment to flush its last callback and drop the stream.
    std::thread::sleep(std::time::Duration::from_millis(150));
    Ok(())
}

// Whisper hallucinates non-speech annotations (e.g. "[MÚSICA DE FUNDO]") when fed
// silence or near-silence — a well-documented behavior from its training data.
// Below these thresholds we skip transcription entirely rather than let it invent text.
const MIN_DICTATION_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 3 / 5; // 0.6s

fn resample_linear(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate || input.is_empty() {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = ((input.len() as f64) / ratio).round() as usize;
    let mut output = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let a = input.get(idx).copied().unwrap_or(0.0);
        let b = input.get(idx + 1).copied().unwrap_or(a);
        output.push(a + (b - a) * frac);
    }
    output
}

fn load_whisper_context(
    cache: &WhisperCache,
    model_id: &str,
    use_gpu: bool,
) -> Result<Arc<WhisperContext>, String> {
    let key = cache_key(model_id, use_gpu);
    let mut guard = cache.loaded.lock().unwrap();
    if let Some((id, ctx)) = guard.as_ref() {
        if id == &key {
            return Ok(ctx.clone());
        }
    }
    let path = whisper_model_path(model_id)?;
    if !path.exists() {
        return Err("Modelo de voz não baixado".to_string());
    }
    let path_str = path.to_string_lossy().into_owned();

    // GPU only works when the binary was built with `whisper-gpu` (Vulkan).
    // Even then, honour the user's opt-in — never force GPU without consent.
    let want_gpu = use_gpu && cfg!(feature = "whisper-gpu");
    let mut ctx_params = WhisperContextParameters::default();
    ctx_params.use_gpu(want_gpu);

    let ctx = WhisperContext::new_with_params(&path_str, ctx_params)
        .map_err(|e| format!("Erro ao carregar modelo de voz: {e}"))?;
    let ctx = Arc::new(ctx);
    *guard = Some((key, ctx.clone()));
    Ok(ctx)
}

#[tauri::command]
pub fn transcribe_dictation(
    state: State<DictationState>,
    whisper_cache: State<WhisperCache>,
    model_id: String,
    use_gpu: bool,
) -> Result<String, String> {
    let raw_samples = std::mem::take(&mut *state.buffer.lock().unwrap());
    if raw_samples.is_empty() {
        return Ok(String::new());
    }
    let captured_rate = *state.captured_rate.lock().unwrap();
    let mut samples = resample_linear(&raw_samples, captured_rate, TARGET_SAMPLE_RATE);

    if samples.len() < MIN_DICTATION_SAMPLES || !has_audio_signal(&samples) {
        return Ok(String::new());
    }
    // Quiet USB mics (H510 etc.) often peak far below Whisper's comfort zone —
    // normalize before STT so we don't feed near-silence that triggers hallucinations.
    normalize_peak(&mut samples, 0.7);

    let ctx = load_whisper_context(&whisper_cache, &model_id, use_gpu)?;
    let mut whisper_state = ctx
        .create_state()
        .map_err(|e| format!("Erro ao preparar transcrição: {e}"))?;

    // Beam search + no temperature fallback: the default greedy path retries at
    // higher temperatures when logprob is bad, which invents fluent Portuguese
    // nonsense (classic Whisper hallucination). Keep temperature fixed at 0.
    let mut params = FullParams::new(SamplingStrategy::BeamSearch {
        beam_size: 5,
        patience: -1.0,
    });
    params.set_language(Some("pt"));
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);
    params.set_no_speech_thold(0.6);
    params.set_temperature(0.0);
    params.set_temperature_inc(0.0);
    params.set_logprob_thold(-0.8);
    params.set_entropy_thold(2.4);
    params.set_no_context(true);
    params.set_single_segment(false);
    // Bias toward ordinary spoken Portuguese without inventing content.
    params.set_initial_prompt("Ditados em português do Brasil.");
    let threads = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4);
    params.set_n_threads(threads);

    whisper_state
        .full(params, &samples)
        .map_err(|e| format!("Erro na transcrição: {e}"))?;

    let mut text = String::new();
    for segment in whisper_state.as_iter() {
        text.push_str(&segment.to_string());
    }
    let text = text.trim().to_string();

    // Last line of defense: even with the gates above, Whisper can still hallucinate
    // a single bracketed non-speech annotation (e.g. "[MÚSICA DE FUNDO]") on borderline
    // audio. Treat that as "nothing was said" rather than inserting it as dictated text.
    if is_non_speech_annotation(&text) {
        return Ok(String::new());
    }

    Ok(text)
}

fn is_non_speech_annotation(text: &str) -> bool {
    let inner = text.trim().strip_prefix('[').and_then(|s| s.strip_suffix(']'));
    match inner {
        Some(inner) => !inner.is_empty() && inner.len() < 80 && !inner.contains('['),
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_bracketed_hallucinations() {
        assert!(is_non_speech_annotation("[MÚSICA DE FUNDO]"));
        assert!(is_non_speech_annotation("[Texto limpo e claro]"));
        assert!(is_non_speech_annotation("  [silêncio]  "));
    }

    #[test]
    fn real_speech_is_not_flagged() {
        assert!(!is_non_speech_annotation(""));
        assert!(!is_non_speech_annotation(
            "Então, cara, eu queria criar um roteiro novo para gravar amanhã."
        ));
        assert!(!is_non_speech_annotation("[não fechado"));
        assert!(!is_non_speech_annotation(
            "ele disse [isso] no meio da frase, sabe"
        ));
    }

    #[test]
    fn rms_energy_flags_silence() {
        let silence = vec![0.0f32; 16_000];
        assert!(rms_energy(&silence) < MIN_RMS_ENERGY);

        let tone: Vec<f32> = (0..16_000)
            .map(|i| (i as f32 * 0.1).sin() * 0.5)
            .collect();
        assert!(rms_energy(&tone) > MIN_RMS_ENERGY);
    }

    #[test]
    fn short_clip_is_below_minimum_duration() {
        let quarter_second = vec![0.5f32; TARGET_SAMPLE_RATE as usize / 4];
        assert!(quarter_second.len() < MIN_DICTATION_SAMPLES);
    }
}
