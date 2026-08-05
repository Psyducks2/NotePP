import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabBar } from "./components/TabBar";
import { DictationButton } from "./components/DictationButton";
import { DictationHistory } from "./components/DictationHistory";
import { Editor } from "./components/Editor";
import { FindBar } from "./components/FindBar";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatusBar } from "./components/StatusBar";
import { TitleBarMenu } from "./components/TitleBarMenu";
import { flushAll } from "./lib/autosave";
import {
  closeActiveTab,
  newTab,
  openFiles,
  openPaths,
  openRecentFile,
  saveActive,
  updateWindowTitle,
} from "./lib/fileActions";
import { bootApp, persistCurrentSettings } from "./lib/session";
import { defaultSettings, useSettingsStore } from "./store/settingsStore";
import { useTabsStore } from "./store/tabsStore";
import "./styles/app.css";

export default function App() {
  const [ready, setReady] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findNonce, setFindNonce] = useState(0);
  const [replaceQuery, setReplaceQuery] = useState("");
  const [replaceNonce, setReplaceNonce] = useState(0);
  const [replaceAllNonce, setReplaceAllNonce] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeTab = useTabsStore(
    (s) => s.tabs.find((t) => t.id === s.activeId) ?? null,
  );
  const nextTab = useTabsStore((s) => s.nextTab);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const recentFiles = useSettingsStore((s) => s.recentFiles);

  useEffect(() => {
    void bootApp().then(async () => {
      setReady(true);
      try {
        const launched = await invoke<string[]>("launch_file_paths");
        if (launched.length) {
          await openPaths(launched);
        }
      } catch {
        /* browser preview */
      }
      void updateWindowTitle();
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    void updateWindowTitle();
  }, [ready, activeTab?.id, activeTab?.title]);

  useEffect(() => {
    if (!ready) return;

    const changeFontSize = (next: number) => {
      const clamped = Math.min(32, Math.max(10, next));
      void persistCurrentSettings({ fontSize: clamped });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        changeFontSize(useSettingsStore.getState().fontSize + 1);
      } else if (e.key === "-") {
        e.preventDefault();
        changeFontSize(useSettingsStore.getState().fontSize - 1);
      } else if (e.key === "0") {
        e.preventDefault();
        changeFontSize(defaultSettings.fontSize);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTab();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openFiles();
      } else if (e.key.toLowerCase() === "s" && e.shiftKey) {
        e.preventDefault();
        void saveActive(true).catch(() => {});
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveActive(false).catch(() => {});
      } else if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        void closeActiveTab();
      } else if (e.key === "Tab") {
        e.preventDefault();
        nextTab();
        void updateWindowTitle();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFindOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready, nextTab]);

  useEffect(() => {
    if (!ready) return;
    let unlisten: (() => void) | undefined;
    let closing = false;

    void (async () => {
      try {
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          // destroy() re-enters CloseRequested. On the second pass we must NOT
          // preventDefault or the window stays open forever.
          if (closing) return;

          event.preventDefault();
          closing = true;

          try {
            await Promise.race([
              flushAll(),
              new Promise<void>((resolve) => {
                window.setTimeout(resolve, 1500);
              }),
            ]);
          } catch {
            /* best-effort save */
          }

          try {
            await invoke("quit_app");
          } catch {
            try {
              await getCurrentWindow().destroy();
            } catch {
              closing = false;
            }
          }
        });
      } catch {
        /* not in tauri */
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        unlisten = await getCurrentWindow().onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            void openPaths(event.payload.paths);
          }
        });
      } catch {
        /* not in tauri */
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="app boot">
        <p>Carregando NotePP…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top" aria-label="Barra principal">
        <div className="brand">NotePP</div>
        <TitleBarMenu
          onNew={newTab}
          onOpen={() => void openFiles()}
          onSave={() => void saveActive(false).catch(() => {})}
          onSaveAs={() => void saveActive(true).catch(() => {})}
          onFind={() => setFindOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onHistory={() => setHistoryOpen(true)}
          recentFiles={recentFiles}
          onOpenRecent={(path) => void openRecentFile(path)}
          wordWrap={wordWrap}
          onToggleWrap={() => {
            void persistCurrentSettings({ wordWrap: !wordWrap });
          }}
        />
        <DictationButton />
      </header>

      <TabBar />
      <FindBar
        open={findOpen}
        query={findQuery}
        onQueryChange={setFindQuery}
        onFindNext={() => setFindNonce((n) => n + 1)}
        onClose={() => setFindOpen(false)}
        replaceQuery={replaceQuery}
        onReplaceQueryChange={setReplaceQuery}
        onReplaceOne={() => setReplaceNonce((n) => n + 1)}
        onReplaceAll={() => setReplaceAllNonce((n) => n + 1)}
      />

      <main className="editor-pane" aria-label="Editor">
        <Editor
          findQuery={findQuery}
          findNonce={findNonce}
          replaceQuery={replaceQuery}
          replaceNonce={replaceNonce}
          replaceAllNonce={replaceAllNonce}
        />
      </main>

      <StatusBar />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <DictationHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
