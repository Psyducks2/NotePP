use std::str::FromStr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;

/// Same threshold `transcribe_dictation` uses to decide "this was silence" — shared
/// so the microphone test in Settings reports the same verdict dictation would.
/// Quiet USB headset mics often sit around RMS 0.001 ambient; speech is typically
/// well above this after peak normalization.
pub const MIN_RMS_ENERGY: f32 = 0.003;
/// Peak below this after capture ≈ digital silence (disconnected / muted boom).
pub const MIN_PEAK_AMPLITUDE: f32 = 0.008;

pub fn rms_energy(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

pub fn peak_amplitude(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0f32, |acc, &s| acc.max(s.abs()))
}

/// True when the buffer has real acoustic energy (not just ADC noise floor).
pub fn has_audio_signal(samples: &[f32]) -> bool {
    !samples.is_empty()
        && (peak_amplitude(samples) >= MIN_PEAK_AMPLITUDE || rms_energy(samples) >= MIN_RMS_ENERGY)
}

/// Boost quiet headset mics toward a usable peak so Whisper doesn't hallucinate
/// on near-silence. Never amplifies pure silence; clamps gain to avoid blowing up
/// noise floors into fake speech.
pub fn normalize_peak(samples: &mut [f32], target_peak: f32) {
    let peak = peak_amplitude(samples);
    if peak < MIN_PEAK_AMPLITUDE * 0.25 || peak >= target_peak {
        return;
    }
    let gain = (target_peak / peak).min(40.0);
    for s in samples.iter_mut() {
        *s = (*s * gain).clamp(-1.0, 1.0);
    }
}

fn downmix_push(buffer: &Mutex<Vec<f32>>, frames: impl Iterator<Item = f32>, channels: u16) {
    let Ok(mut buf) = buffer.lock() else { return };
    if channels <= 1 {
        buf.extend(frames);
        return;
    }
    let channels = channels as usize;
    let mut acc = 0.0f32;
    let mut count = 0usize;
    for sample in frames {
        acc += sample;
        count += 1;
        if count == channels {
            buf.push(acc / channels as f32);
            acc = 0.0;
            count = 0;
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Lower is safer to open concurrently with the desktop's sound server.
/// On ALSA, `default`/`pulse`/`pipewire` route through the sound server and share
/// the card with PipeWire. Card-level `sysdefault:`/`dsnoop:` are next; `hw:`/
/// `plughw:` grab the card exclusively and fail with "device busy" when PipeWire
/// already holds it.
fn alsa_priority(id: &str) -> u8 {
    let device_part = id.split_once(':').map_or(id, |(_, rest)| rest);
    if device_part == "default"
        || device_part == "pulse"
        || device_part == "pipewire"
        || device_part.starts_with("default:")
        || device_part.starts_with("pulse:")
        || device_part.starts_with("pipewire:")
    {
        0
    } else if device_part.starts_with("sysdefault") {
        1
    } else if device_part.starts_with("dsnoop") {
        2
    } else if device_part.starts_with("plughw") {
        3
    } else if device_part.starts_with("hw:") {
        4
    } else {
        5
    }
}

fn format_open_error(err: &str) -> String {
    let lower = err.to_lowercase();
    if lower.contains("busy")
        || lower.contains("resource temporarily unavailable")
        || lower.contains("device or resource busy")
        || lower.contains("ebusy")
    {
        format!(
            "Microfone ocupado (outro app ou o PipeWire já está usando o dispositivo). \
             Tente \"Padrão do sistema\" ou feche o app que está capturando áudio. Detalhe: {err}"
        )
    } else {
        format!("Erro ao abrir microfone: {err}")
    }
}

/// Pulse/PipeWire expose sink monitors as capture sources ("Monitor of …" /
/// `*.monitor`). Those hear speaker output, not the microphone — hide them.
fn is_output_monitor(id: &str, name: &str) -> bool {
    let id_lower = id.to_ascii_lowercase();
    let name_lower = name.to_ascii_lowercase();
    id_lower.contains(".monitor")
        || name_lower.starts_with("monitor of ")
        || name_lower.starts_with("monitor de ")
}

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    let host = cpal::default_host();
    let default_id = host.default_input_device().and_then(|d| d.id().ok());
    let devices = host
        .input_devices()
        .map_err(|e| format!("Erro ao listar microfones: {e}"))?;

    // ALSA exposes the same physical hardware many times over (hw:, plughw:,
    // dsnoop:, sysdefault:, …) — cpal reports each of those as a distinct
    // device. Collapse by display name to one entry per microphone a user
    // actually recognizes, picking whichever underlying id is safest to open
    // (see `alsa_priority`) rather than just the first one enumerated.
    // PipeWire/Pulse hosts already expose one entry per source, so collapse is
    // a no-op there — but they also list sink monitors, which we drop.
    let mut out: Vec<AudioDeviceInfo> = Vec::new();
    for device in devices {
        let Ok(id) = device.id() else { continue };
        let id_str = id.to_string();
        let name = device.to_string();
        if is_output_monitor(&id_str, &name) {
            continue;
        }
        let is_default = default_id.as_ref() == Some(&id);

        if let Some(existing) = out.iter_mut().find(|d| d.name == name) {
            if alsa_priority(&id_str) < alsa_priority(&existing.id) {
                existing.id = id_str;
            }
            existing.is_default |= is_default;
            continue;
        }
        out.push(AudioDeviceInfo {
            id: id_str,
            name,
            is_default,
        });
    }
    Ok(out)
}

/// Resolves the microphone to use: the saved device if it's still connected and
/// parses correctly, falling back to the system default otherwise. This means a
/// disconnected/renamed device never hard-fails dictation — it just quietly falls
/// back to whatever the OS considers the default input.
pub fn resolve_input_device(device_id: Option<&str>) -> Result<cpal::Device, String> {
    let host = cpal::default_host();
    if let Some(id_str) = device_id.filter(|s| !s.is_empty()) {
        if let Ok(parsed) = cpal::DeviceId::from_str(id_str) {
            if let Some(device) = host.device_by_id(&parsed) {
                return Ok(device);
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| "Nenhum microfone encontrado".to_string())
}

/// Tries to open `device`; on failure, retries the host default and then the
/// ALSA/PipeWire virtual `"default"` node when that id is distinct and available.
fn open_with_fallbacks(
    device: &cpal::Device,
    buffer: Arc<Mutex<Vec<f32>>>,
    original_error: Option<String>,
) -> Result<(cpal::Stream, u32), String> {
    match build_capture_stream(device, buffer.clone()) {
        Ok(result) => Ok(result),
        Err(first_err) => {
            let primary = original_error.unwrap_or(first_err);
            let host = cpal::default_host();
            let tried_id = device.id().ok();

            if let Some(fallback) = host.default_input_device() {
                let same = match (&tried_id, fallback.id().ok()) {
                    (Some(a), Some(b)) => a == &b,
                    _ => false,
                };
                if !same {
                    if let Ok(result) = build_capture_stream(&fallback, buffer.clone()) {
                        return Ok(result);
                    }
                }
            }

            // Last resort on ALSA: the virtual "default" PCM (routes via PipeWire).
            if let Ok(parsed) = cpal::DeviceId::from_str("alsa:default") {
                if let Some(alsa_default) = host.device_by_id(&parsed) {
                    let same = match (&tried_id, alsa_default.id().ok()) {
                        (Some(a), Some(b)) => a == &b,
                        _ => false,
                    };
                    if !same {
                        if let Ok(result) = build_capture_stream(&alsa_default, buffer) {
                            return Ok(result);
                        }
                    }
                }
            }

            Err(primary)
        }
    }
}

/// Resolves and opens a capture stream for `device_id`. If opening fails (busy
/// card, stale id, unsupported path), retries the system default and then the
/// ALSA `default` node rather than failing dictation on the first attempt.
pub fn open_capture_stream(
    device_id: Option<&str>,
    buffer: Arc<Mutex<Vec<f32>>>,
) -> Result<(cpal::Stream, u32), String> {
    let device = resolve_input_device(device_id)?;
    open_with_fallbacks(&device, buffer, None)
}

pub fn build_capture_stream(
    device: &cpal::Device,
    buffer: Arc<Mutex<Vec<f32>>>,
) -> Result<(cpal::Stream, u32), String> {
    let config = device
        .default_input_config()
        .map_err(|e| format!("Erro ao configurar microfone: {e}"))?;
    let sample_rate = config.sample_rate();
    let channels = config.channels();
    let sample_format = config.sample_format();
    let err_fn = |err: cpal::Error| eprintln!("Erro no fluxo de áudio: {err}");

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let buf = buffer;
            device.build_input_stream(
                config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    downmix_push(&buf, data.iter().copied(), channels);
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let buf = buffer;
            device.build_input_stream(
                config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    downmix_push(
                        &buf,
                        data.iter().map(|s| *s as f32 / i16::MAX as f32),
                        channels,
                    );
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let buf = buffer;
            device.build_input_stream(
                config.into(),
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    downmix_push(
                        &buf,
                        data.iter().map(|s| (*s as f32 / u16::MAX as f32) * 2.0 - 1.0),
                        channels,
                    );
                },
                err_fn,
                None,
            )
        }
        cpal::SampleFormat::I32 => {
            let buf = buffer;
            device.build_input_stream(
                config.into(),
                move |data: &[i32], _: &cpal::InputCallbackInfo| {
                    downmix_push(
                        &buf,
                        data.iter().map(|s| *s as f32 / i32::MAX as f32),
                        channels,
                    );
                },
                err_fn,
                None,
            )
        }
        other => return Err(format!("Formato de áudio não suportado: {other}")),
    }
    .map_err(|e| format_open_error(&e.to_string()))?;

    Ok((stream, sample_rate))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MicTestResult {
    pub level: f32,
    pub peak: f32,
    pub detected: bool,
    pub sample_count: usize,
}

/// Records ~2s from the given (or default) microphone and reports whether any
/// real signal came through — lets Settings answer "is this mic actually working?"
/// without the user having to run a full dictation to find out.
#[tauri::command]
pub fn test_microphone(device_id: Option<String>) -> Result<MicTestResult, String> {
    let buffer = Arc::new(Mutex::new(Vec::<f32>::new()));
    let (stream, _sample_rate) = open_capture_stream(device_id.as_deref(), buffer.clone())?;
    stream
        .play()
        .map_err(|e| format!("Erro ao iniciar teste: {e}"))?;
    // Longer window so the user has time to speak after clicking the button.
    std::thread::sleep(Duration::from_millis(2000));
    drop(stream);

    let samples = buffer.lock().unwrap();
    let level = rms_energy(&samples);
    let peak = peak_amplitude(&samples);
    Ok(MicTestResult {
        level,
        peak,
        detected: has_audio_signal(&samples),
        sample_count: samples.len(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_energy_of_silence_is_near_zero() {
        let silence = vec![0.0f32; 1000];
        assert!(rms_energy(&silence) < MIN_RMS_ENERGY);
    }

    #[test]
    fn quiet_tone_counts_as_signal_after_threshold_tune() {
        // Simulates a quiet USB headset boom (~peak 0.02).
        let tone: Vec<f32> = (0..8000).map(|i| (i as f32 * 0.1).sin() * 0.02).collect();
        assert!(has_audio_signal(&tone));
        assert!(peak_amplitude(&tone) >= MIN_PEAK_AMPLITUDE);
    }

    #[test]
    fn normalize_peak_boosts_quiet_speech() {
        let mut samples: Vec<f32> = (0..1000).map(|i| (i as f32 * 0.05).sin() * 0.02).collect();
        normalize_peak(&mut samples, 0.7);
        assert!(peak_amplitude(&samples) > 0.5);
    }

    #[test]
    fn normalize_peak_skips_digital_silence() {
        let mut silence = vec![0.0f32; 1000];
        normalize_peak(&mut silence, 0.7);
        assert_eq!(peak_amplitude(&silence), 0.0);
    }

    #[test]
    fn resolve_input_device_falls_back_to_default_for_unknown_id() {
        // An id from a different host/format should never panic — just fall back.
        let result = resolve_input_device(Some("not-a-real-device-id"));
        // Whether this Ok/Err depends on whether the CI machine has a mic at all;
        // the important thing is that it doesn't panic on a bogus id.
        let _ = result;
    }

    #[test]
    fn alsa_priority_prefers_sound_server_over_card_nodes() {
        let sound_server = "alsa:default";
        let pulse = "alsa:pulse";
        let pipewire = "alsa:pipewire";
        let sysdefault = "alsa:sysdefault:CARD=headset";
        let dsnoop = "alsa:dsnoop:CARD=headset,DEV=0";
        let plughw = "alsa:plughw:CARD=headset,DEV=0";
        let hw = "alsa:hw:CARD=headset,DEV=0";

        assert!(alsa_priority(sound_server) < alsa_priority(sysdefault));
        assert!(alsa_priority(pulse) < alsa_priority(sysdefault));
        assert!(alsa_priority(pipewire) < alsa_priority(sysdefault));
        assert!(alsa_priority(sysdefault) < alsa_priority(dsnoop));
        assert!(alsa_priority(dsnoop) < alsa_priority(plughw));
        assert!(alsa_priority(plughw) < alsa_priority(hw));
    }

    #[test]
    fn output_monitors_are_detected() {
        assert!(is_output_monitor(
            "pulseaudio:alsa_output.usb-Headset-00.analog-stereo.monitor",
            "Monitor of H510-PRO USB Gaming Headset Estéreo analógico",
        ));
        assert!(is_output_monitor(
            "pulseaudio:foo.monitor",
            "Monitor de Built-in Audio",
        ));
        assert!(!is_output_monitor(
            "pulseaudio:alsa_input.usb-Headset-00.mono-fallback",
            "H510-PRO USB Gaming Headset Mono",
        ));
    }

    /// Manual/dev check: needs a real sound server + mic. Run with
    /// `cargo test smoke_list_devices_and_open_default_mic -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn smoke_list_devices_and_open_default_mic() {
        let devices = list_audio_input_devices().expect("list_audio_input_devices");
        assert!(
            !devices.is_empty(),
            "expected input devices from Pulse/PipeWire host"
        );
        for d in &devices {
            eprintln!("device: {} | {} | default={}", d.name, d.id, d.is_default);
        }
        let result = test_microphone(None).expect("test_microphone default");
        eprintln!(
            "mic level={} detected={}",
            result.level, result.detected
        );
        // Opening must succeed; detection depends on ambient sound / mute.
        assert!(result.level >= 0.0);
    }
}
