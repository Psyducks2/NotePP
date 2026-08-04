import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type WhisperModelStatus = {
  id: string;
  label: string;
  sizeBytes: number;
  downloaded: boolean;
  recommended: boolean;
};

export type CleanupModelStatus = {
  downloaded: boolean;
  sizeBytes: number;
};

export type DownloadProgress = {
  id: string;
  downloaded: number;
  total: number;
};

export const CLEANUP_MODEL_ID = "cleanup";

export async function listWhisperModels(): Promise<WhisperModelStatus[]> {
  return invoke<WhisperModelStatus[]>("list_whisper_models");
}

export async function downloadWhisperModel(id: string): Promise<void> {
  await invoke("download_whisper_model", { id });
}

export async function deleteWhisperModel(id: string): Promise<void> {
  await invoke("delete_whisper_model", { id });
}

export async function cleanupModelStatus(): Promise<CleanupModelStatus> {
  return invoke<CleanupModelStatus>("cleanup_model_status");
}

export async function downloadCleanupModel(): Promise<void> {
  await invoke("download_cleanup_model");
}

export async function deleteCleanupModel(): Promise<void> {
  await invoke("delete_cleanup_model");
}

export async function cleanTranscript(
  text: string,
  prompt: string,
): Promise<string> {
  return invoke<string>("clean_transcript", { text, prompt });
}

export async function onWhisperDownloadProgress(
  fn: (p: DownloadProgress) => void,
): Promise<() => void> {
  return listen<DownloadProgress>("whisper-download-progress", (e) =>
    fn(e.payload),
  );
}

export async function onCleanupDownloadProgress(
  fn: (p: DownloadProgress) => void,
): Promise<() => void> {
  return listen<DownloadProgress>("cleanup-download-progress", (e) =>
    fn(e.payload),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
