import { useTabsStore } from "../store/tabsStore";
import { newTab, closeActiveTab } from "../lib/fileActions";
import { flushTab } from "../lib/autosave";
import { updateWindowTitle } from "../lib/fileActions";

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const setActive = useTabsStore((s) => s.setActive);

  return (
    <div className="tab-bar" role="tablist" aria-label="Abas abertas">
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        const accessibleName = tab.dirty
          ? `${tab.title} (não salvo)`
          : tab.title;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={accessibleName}
            className={`tab ${selected ? "active" : ""}`}
            onClick={() => {
              setActive(tab.id);
              void updateWindowTitle();
            }}
          >
            <span className="tab-title">
              {tab.dirty && <span className="dirty-dot" aria-hidden="true" />}
              {tab.title}
            </span>
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              aria-label={`Fechar ${tab.title}`}
              title="Fechar"
              onClick={(e) => {
                e.stopPropagation();
                void (async () => {
                  await flushTab(tab.id);
                  useTabsStore.getState().closeTab(tab.id);
                  await updateWindowTitle();
                })();
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                void (async () => {
                  await flushTab(tab.id);
                  useTabsStore.getState().closeTab(tab.id);
                  await updateWindowTitle();
                })();
              }}
            >
              <span aria-hidden="true">×</span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="tab-new"
        aria-label="Nova aba"
        title="Nova aba (Ctrl+N)"
        onClick={() => newTab()}
      >
        <span aria-hidden="true">+</span>
      </button>
      <button
        type="button"
        className="tab-close-active sr-only"
        onClick={() => void closeActiveTab()}
      >
        Fechar aba
      </button>
    </div>
  );
}
