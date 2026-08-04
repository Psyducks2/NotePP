type FindBarProps = {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onFindNext: () => void;
  onClose: () => void;
  replaceQuery: string;
  onReplaceQueryChange: (value: string) => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
};

export function FindBar({
  open,
  query,
  onQueryChange,
  onFindNext,
  onClose,
  replaceQuery,
  onReplaceQueryChange,
  onReplaceOne,
  onReplaceAll,
}: FindBarProps) {
  if (!open) return null;

  return (
    <div className="find-bar" role="search" aria-label="Localizar e substituir">
      <button
        type="button"
        className="find-bar-close"
        title="Fechar (Esc)"
        aria-label="Fechar localizar"
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="find-bar-row">
        <label className="sr-only" htmlFor="find-query">
          Localizar
        </label>
        <input
          id="find-query"
          autoFocus
          className="find-bar-input"
          placeholder="Localizar"
          aria-label="Localizar"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onFindNext();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button type="button" onClick={onFindNext} disabled={!query}>
          Próximo
        </button>
      </div>

      <div className="find-bar-row">
        <label className="sr-only" htmlFor="find-replace">
          Substituir por
        </label>
        <input
          id="find-replace"
          className="find-bar-input"
          placeholder="Substituir por"
          aria-label="Substituir por"
          value={replaceQuery}
          onChange={(e) => onReplaceQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onReplaceOne();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <button type="button" onClick={onReplaceOne} disabled={!query}>
          Substituir
        </button>
        <button type="button" onClick={onReplaceAll} disabled={!query}>
          Substituir tudo
        </button>
      </div>
    </div>
  );
}
