import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ensureExtension, suggestSaveName } from "./formats";
import { flushTab, saveTabNow } from "./autosave";
import { recordRecentFile } from "./session";
import {
  createTabId,
  titleFromPath,
  useTabsStore,
} from "../store/tabsStore";

export async function updateWindowTitle(): Promise<void> {
  const tab = useTabsStore.getState().getActiveTab();
  const name = tab?.title ?? "Sem título";
  try {
    await getCurrentWindow().setTitle(`${name} — NotePP`);
  } catch {
    /* browser preview */
  }
}

export function newTab(): void {
  useTabsStore.getState().addTab();
  void updateWindowTitle();
}

export async function openPaths(paths: string[]): Promise<void> {
  for (const path of paths) {
    let content: string;
    try {
      content = await invoke<string>("read_text_file", { path });
    } catch {
      continue;
    }
    const store = useTabsStore.getState();
    const empty =
      store.tabs.length === 1 &&
      !store.tabs[0].path &&
      !store.tabs[0].content &&
      !store.tabs[0].dirty;
    if (empty) {
      store.setTabs(
        [
          {
            id: store.tabs[0].id,
            title: titleFromPath(path),
            path,
            content,
            dirty: false,
            cursor: 0,
            cursorLine: 1,
            cursorCol: 1,
          },
        ],
        store.tabs[0].id,
      );
    } else {
      store.addTab({
        id: createTabId(),
        title: titleFromPath(path),
        path,
        content,
        dirty: false,
        cursor: 0,
      });
    }
    await recordRecentFile(path);
  }
  await updateWindowTitle();
}

export async function openFiles(): Promise<void> {
  const paths = await invoke<string[]>("pick_open_files");
  if (!paths.length) return;
  await openPaths(paths);
}

export async function openRecentFile(path: string): Promise<void> {
  await openPaths([path]);
}

export async function saveActive(forceDialog = false): Promise<void> {
  const tab = useTabsStore.getState().getActiveTab();
  if (!tab) return;

  if (!tab.path || forceDialog) {
    const picked = await invoke<string | null>("pick_save_file", {
      defaultName: suggestSaveName(tab.title, tab.path),
    });
    if (!picked) return;
    const path = ensureExtension(picked);
    try {
      await invoke("write_text_file", { path, contents: tab.content });
    } catch {
      useTabsStore.getState().setSaveStatus("error");
      throw new Error("Falha ao salvar");
    }
    useTabsStore.getState().markSaved(tab.id, path, titleFromPath(path));
    await recordRecentFile(path);
    await saveTabNow(
      { ...tab, path, title: titleFromPath(path), dirty: false },
      true,
    );
  } else {
    await saveTabNow(tab, true);
  }
  await updateWindowTitle();
}

export async function closeActiveTab(): Promise<void> {
  const { activeId } = useTabsStore.getState();
  if (!activeId) return;
  await flushTab(activeId);
  useTabsStore.getState().closeTab(activeId);
  await updateWindowTitle();
}
