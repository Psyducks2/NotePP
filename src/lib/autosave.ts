import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { useTabsStore, type Tab } from "../store/tabsStore";
import { persistSession } from "./session";

const DEBOUNCE_MS = 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function writeTabToDisk(tab: Tab): Promise<void> {
  if (!tab.path) return;
  await invoke("write_text_file", { path: tab.path, contents: tab.content });
  useTabsStore.getState().markSaved(tab.id);
}

export async function saveTabNow(tab: Tab, forceFile = false): Promise<void> {
  const { autosaveToFile } = useSettingsStore.getState();
  useTabsStore.getState().setSaveStatus("saving");
  try {
    if (tab.path && (forceFile || autosaveToFile)) {
      await writeTabToDisk(tab);
    } else {
      useTabsStore.getState().markSaved(tab.id);
    }
    await persistSession();
  } catch {
    useTabsStore.getState().setSaveStatus("error");
    throw new Error("Falha ao salvar");
  }
}

export function scheduleAutosave(tabId: string): void {
  const existing = timers.get(tabId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(tabId);
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab || !tab.dirty) return;
    void saveTabNow(tab).catch(() => {
      /* status already set */
    });
  }, DEBOUNCE_MS);
  timers.set(tabId, timer);
}

export async function flushTab(tabId: string): Promise<void> {
  const existing = timers.get(tabId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(tabId);
  }
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (tab.dirty || !tab.path) {
    await saveTabNow(tab);
  } else {
    await persistSession();
  }
}

export async function flushAll(): Promise<void> {
  for (const [id, timer] of timers) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const { tabs } = useTabsStore.getState();
  const { autosaveToFile } = useSettingsStore.getState();
  useTabsStore.getState().setSaveStatus("saving");
  try {
    for (const tab of tabs) {
      if (tab.path && autosaveToFile && tab.dirty) {
        await writeTabToDisk(tab);
      } else if (tab.dirty) {
        useTabsStore.getState().markSaved(tab.id);
      }
    }
    await persistSession();
    useTabsStore.getState().setSaveStatus("saved");
  } catch {
    useTabsStore.getState().setSaveStatus("error");
  }
}
