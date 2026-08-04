import { useTabsStore } from "../store/tabsStore";

type PersistKind = "saving" | "saved" | "error" | "dirty";

function persistState(
  saveStatus: "idle" | "saving" | "saved" | "error",
  dirty: boolean,
): { kind: PersistKind; label: string } {
  switch (saveStatus) {
    case "saving":
      return { kind: "saving", label: "Salvando…" };
    case "error":
      return { kind: "error", label: "Erro ao salvar" };
    case "saved":
    case "idle":
      if (dirty) return { kind: "dirty", label: "Não salvo" };
      return { kind: "saved", label: "Salvo" };
    default: {
      const _exhaustive: never = saveStatus;
      return _exhaustive;
    }
  }
}

export function StatusBar() {
  const saveStatus = useTabsStore((s) => s.saveStatus);
  const activeTab = useTabsStore(
    (s) => s.tabs.find((t) => t.id === s.activeId) ?? null,
  );

  const pathLabel = activeTab?.path ?? "Rascunho de sessão";
  const isFile = Boolean(activeTab?.path);
  const line = activeTab?.cursorLine ?? 1;
  const col = activeTab?.cursorCol ?? 1;
  const persist = persistState(saveStatus, activeTab?.dirty ?? false);

  return (
    <footer
      className="status-bar"
      role="contentinfo"
      aria-label="Status do documento"
    >
      <span
        className={`status-path ${isFile ? "is-file" : "is-draft"}`}
        title={pathLabel}
      >
        {pathLabel}
      </span>
      <span className="status-pos" aria-hidden="true">
        Ln {line}, Col {col}
      </span>
      <span
        className={`status-indicator status-${persist.kind}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="status-dot" aria-hidden="true" />
        {persist.label}
      </span>
    </footer>
  );
}
