import { invoke } from "@tauri-apps/api/core";
import {
  createTabId,
  titleFromPath,
  type Tab,
  useTabsStore,
} from "../store/tabsStore";
import {
  defaultSettings,
  type AppSettings,
  useSettingsStore,
} from "../store/settingsStore";

export type SessionTab = {
  id: string;
  title: string;
  path: string | null;
  content: string;
  cursor?: number;
};

export type SessionState = {
  tabs: SessionTab[];
  activeId: string | null;
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await invoke<AppSettings>("load_settings");
    return {
      autosaveToFile: raw.autosaveToFile ?? defaultSettings.autosaveToFile,
      wordWrap: raw.wordWrap ?? defaultSettings.wordWrap,
      fontSize: raw.fontSize ?? defaultSettings.fontSize,
      recentFiles: raw.recentFiles ?? defaultSettings.recentFiles,
      sttModel: raw.sttModel ?? defaultSettings.sttModel,
      cleanupEnabled: raw.cleanupEnabled ?? defaultSettings.cleanupEnabled,
      cleanupPrompt: raw.cleanupPrompt ?? defaultSettings.cleanupPrompt,
      micDeviceId: raw.micDeviceId ?? defaultSettings.micDeviceId,
      whisperUseGpu: raw.whisperUseGpu ?? defaultSettings.whisperUseGpu,
    };
  } catch {
    return defaultSettings;
  }
}

export async function persistSettings(settings: AppSettings): Promise<void> {
  await invoke("save_settings", { settings });
}

/** Applies `overrides` to the settings store and persists the merged result to disk. */
export async function persistCurrentSettings(
  overrides: Partial<AppSettings> = {},
): Promise<void> {
  useSettingsStore.getState().setSettings(overrides);
  const {
    autosaveToFile,
    wordWrap,
    fontSize,
    recentFiles,
    sttModel,
    cleanupEnabled,
    cleanupPrompt,
    micDeviceId,
    whisperUseGpu,
  } = useSettingsStore.getState();
  await persistSettings({
    autosaveToFile,
    wordWrap,
    fontSize,
    recentFiles,
    sttModel,
    cleanupEnabled,
    cleanupPrompt,
    micDeviceId,
    whisperUseGpu,
  });
}

const MAX_RECENT_FILES = 10;

export async function recordRecentFile(path: string): Promise<void> {
  const recentFiles = [
    path,
    ...useSettingsStore.getState().recentFiles.filter((p) => p !== path),
  ].slice(0, MAX_RECENT_FILES);
  await persistCurrentSettings({ recentFiles });
}

export async function loadSession(): Promise<SessionState> {
  try {
    return await invoke<SessionState>("load_session");
  } catch {
    return { tabs: [], activeId: null };
  }
}

export async function persistSession(): Promise<void> {
  const { tabs, activeId } = useTabsStore.getState();
  const session: SessionState = {
    activeId,
    tabs: tabs.map((t) => ({
      id: t.id,
      title: t.title,
      path: t.path,
      content: t.content,
      cursor: t.cursor,
    })),
  };
  await invoke("save_session", { session });
}

export function applySession(session: SessionState): void {
  if (!session.tabs.length) {
    const id = createTabId();
    useTabsStore.getState().setTabs(
      [
        {
          id,
          title: "Sem título",
          path: null,
          content: "",
          dirty: false,
          cursor: 0,
          cursorLine: 1,
          cursorCol: 1,
        },
      ],
      id,
    );
    return;
  }

  const tabs: Tab[] = session.tabs.map((t) => ({
    id: t.id || createTabId(),
    title: t.title || titleFromPath(t.path),
    path: t.path,
    content: t.content ?? "",
    dirty: false,
    cursor: t.cursor ?? 0,
    cursorLine: 1,
    cursorCol: 1,
  }));
  const activeId =
    (session.activeId && tabs.some((t) => t.id === session.activeId)
      ? session.activeId
      : tabs[0].id) ?? tabs[0].id;
  useTabsStore.getState().setTabs(tabs, activeId);
}

export async function bootApp(): Promise<void> {
  const settings = await loadSettings();
  useSettingsStore.getState().hydrate(settings);
  const session = await loadSession();
  applySession(session);
}
