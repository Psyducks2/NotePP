import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { insertAtCursor } from "./editorBridge";
import { recordDictationEntry, type DictationEntry } from "./dictationHistory";

export type DictationStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "cleaning"
  | "empty"
  | "error";

type Listener = (status: DictationStatus, error?: string) => void;

let listeners: Listener[] = [];
let status: DictationStatus = "idle";

function setStatus(next: DictationStatus, error?: string): void {
  status = next;
  listeners.forEach((l) => l(next, error));
}

export function getDictationStatus(): DictationStatus {
  return status;
}

export function onDictationStatus(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

type RecordedListener = (entry: DictationEntry) => void;
let recordedListeners: RecordedListener[] = [];

/** Notifies an open history panel about a new entry without it having to poll. */
export function onDictationRecorded(fn: RecordedListener): () => void {
  recordedListeners.push(fn);
  return () => {
    recordedListeners = recordedListeners.filter((l) => l !== fn);
  };
}

// Small local models sometimes mirror a bracketed non-speech annotation (e.g. an
// upstream Whisper hallucination like "[MÚSICA DE FUNDO]") with a bracketed
// placeholder of their own instead of real cleaned text. Never insert that.
function isNonSpeechAnnotation(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("[") &&
    trimmed.endsWith("]") &&
    trimmed.length < 80 &&
    !trimmed.slice(1, -1).includes("[")
  );
}

export async function startDictation(): Promise<void> {
  if (status === "recording") return;
  try {
    const { micDeviceId } = useSettingsStore.getState();
    await invoke("start_dictation", { deviceId: micDeviceId });
    setStatus("recording");
  } catch (e) {
    goIdleAfter("error", String(e), 2500);
  }
}

function goIdleAfter(next: DictationStatus, error?: string, delayMs = 2200): void {
  setStatus(next, error);
  setTimeout(() => setStatus("idle"), delayMs);
}

export async function stopDictationAndInsert(): Promise<void> {
  if (status !== "recording") return;
  setStatus("transcribing");
  try {
    const { sttModel, cleanupEnabled, cleanupPrompt, whisperUseGpu } =
      useSettingsStore.getState();
    await invoke("stop_dictation");
    const rawText = await invoke<string>("transcribe_dictation", {
      modelId: sttModel,
      useGpu: whisperUseGpu,
    });

    // Too short, too quiet, or nothing but a Whisper hallucination — there was
    // nothing usable in the recording. Say so instead of silently doing nothing.
    if (!rawText.trim()) {
      goIdleAfter("empty");
      return;
    }

    let finalText = rawText;
    let cleanedForHistory: string | null = null;
    if (cleanupEnabled) {
      setStatus("cleaning");
      try {
        const cleaned = await invoke<string>("clean_transcript", {
          text: rawText,
          prompt: cleanupPrompt,
        });
        // If cleanup degenerates into a bracketed placeholder, prefer the raw
        // transcript over losing the dictation to a meaningless annotation.
        if (!isNonSpeechAnnotation(cleaned)) {
          finalText = cleaned;
          cleanedForHistory = cleaned;
        }
      } catch {
        // Cleanup model missing or failed — fall back to the raw transcript
        // rather than losing the dictation entirely.
      }
    }

    if (finalText.trim() && !isNonSpeechAnnotation(finalText)) {
      insertAtCursor(`${finalText.trim()} `);
      try {
        const entry = await recordDictationEntry(rawText.trim(), cleanedForHistory);
        recordedListeners.forEach((l) => l(entry));
      } catch {
        // History is a convenience layer — never let it block dictation itself.
      }
      setStatus("idle");
    } else {
      goIdleAfter("empty");
    }
  } catch (e) {
    goIdleAfter("error", String(e), 2500);
  }
}

export async function toggleDictation(): Promise<void> {
  if (status === "recording") {
    await stopDictationAndInsert();
  } else if (status === "idle" || status === "error") {
    await startDictation();
  }
}
