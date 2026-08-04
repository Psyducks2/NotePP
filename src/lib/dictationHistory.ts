import { invoke } from "@tauri-apps/api/core";

export type DictationEntry = {
  id: string;
  timestampMs: number;
  rawText: string;
  cleanedText: string | null;
  discarded: boolean;
};

export async function loadDictationHistory(): Promise<DictationEntry[]> {
  return invoke<DictationEntry[]>("load_dictation_history");
}

export async function recordDictationEntry(
  rawText: string,
  cleanedText: string | null,
): Promise<DictationEntry> {
  return invoke<DictationEntry>("record_dictation_entry", {
    rawText,
    cleanedText,
  });
}

export async function setDictationEntryDiscarded(
  id: string,
  discarded: boolean,
): Promise<void> {
  await invoke("set_dictation_entry_discarded", { id, discarded });
}

export async function discardAllDictationEntries(): Promise<void> {
  await invoke("discard_all_dictation_entries");
}

export async function deleteDictationEntry(id: string): Promise<void> {
  await invoke("delete_dictation_entry", { id });
}
