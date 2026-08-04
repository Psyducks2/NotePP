import { useEffect, useMemo, useState } from "react";
import { insertAtCursor } from "../lib/editorBridge";
import { onDictationRecorded } from "../lib/dictation";
import {
  deleteDictationEntry,
  discardAllDictationEntries,
  loadDictationHistory,
  setDictationEntryDiscarded,
  type DictationEntry,
} from "../lib/dictationHistory";
import { updateWindowTitle } from "../lib/fileActions";
import { createTabId, titleFromPath, useTabsStore } from "../store/tabsStore";

type DictationHistoryProps = {
  open: boolean;
  onClose: () => void;
};

function dayLabel(timestampMs: number): string {
  const date = new Date(timestampMs);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86_400_000);

  if (diffDays === 0) return "HOJE";
  if (diffDays === 1) return "ONTEM";
  return date
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();
}

function timeLabel(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function textOf(entry: DictationEntry): string {
  return entry.cleanedText ?? entry.rawText;
}

export function DictationHistory({ open, onClose }: DictationHistoryProps) {
  const [entries, setEntries] = useState<DictationEntry[]>([]);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    void loadDictationHistory()
      .then(setEntries)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    refresh();
    return onDictationRecorded((entry) => setEntries((e) => [entry, ...e]));
  }, [open]);

  const visible = useMemo(
    () => entries.filter((e) => e.discarded === showDiscarded),
    [entries, showDiscarded],
  );

  const groups = useMemo(() => {
    const map = new Map<string, DictationEntry[]>();
    for (const entry of visible) {
      const label = dayLabel(entry.timestampMs);
      const list = map.get(label);
      if (list) list.push(entry);
      else map.set(label, [entry]);
    }
    return Array.from(map.entries());
  }, [visible]);

  if (!open) return null;

  const insert = (entry: DictationEntry) => {
    insertAtCursor(`${textOf(entry).trim()} `);
    onClose();
  };

  const openInNewTab = (entry: DictationEntry) => {
    const id = createTabId();
    useTabsStore.getState().addTab({
      id,
      title: titleFromPath(null),
      content: textOf(entry),
      cursor: 0,
    });
    void updateWindowTitle();
    onClose();
  };

  const copy = (entry: DictationEntry) => {
    void navigator.clipboard.writeText(textOf(entry));
  };

  const discard = (id: string) => {
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, discarded: true } : x)));
    void setDictationEntryDiscarded(id, true);
  };

  const restore = (id: string) => {
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, discarded: false } : x)));
    void setDictationEntryDiscarded(id, false);
  };

  const removeForever = (id: string) => {
    setEntries((e) => e.filter((x) => x.id !== id));
    void deleteDictationEntry(id);
  };

  const clearAll = () => {
    setEntries((e) => e.map((x) => (x.discarded ? x : { ...x, discarded: true })));
    void discardAllDictationEntries();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-history"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-header">
          <h2 id="history-title">Histórico de ditados</h2>
          <div className="history-header-actions">
            <button
              type="button"
              className={showDiscarded ? "active" : ""}
              onClick={() => setShowDiscarded((s) => !s)}
            >
              {showDiscarded ? "Ver ativas" : "Mostrar descartadas"}
            </button>
            {!showDiscarded && (
              <button type="button" onClick={clearAll} disabled={visible.length === 0}>
                Limpar tudo
              </button>
            )}
          </div>
        </div>

        <div className="history-list">
          {loading && <p className="hint">Carregando…</p>}
          {!loading && groups.length === 0 && (
            <p className="hint">
              {showDiscarded
                ? "Nenhum item descartado."
                : "Nenhum ditado ainda. Use o botão de microfone para começar."}
            </p>
          )}
          {groups.map(([label, items]) => (
            <section key={label} className="history-group">
              <h3>{label}</h3>
              {items.map((entry) => (
                <article key={entry.id} className="history-entry">
                  <span className="history-time">{timeLabel(entry.timestampMs)}</span>
                  <p className="history-text">{textOf(entry)}</p>
                  <div className="history-actions">
                    {entry.discarded ? (
                      <>
                        <button type="button" onClick={() => restore(entry.id)}>
                          Restaurar
                        </button>
                        <button type="button" onClick={() => removeForever(entry.id)}>
                          Excluir
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" title="Inserir no cursor" onClick={() => insert(entry)}>
                          Inserir
                        </button>
                        <button type="button" onClick={() => openInNewTab(entry)}>
                          Nova aba
                        </button>
                        <button type="button" onClick={() => copy(entry)}>
                          Copiar
                        </button>
                        <button type="button" onClick={() => discard(entry.id)}>
                          Descartar
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
