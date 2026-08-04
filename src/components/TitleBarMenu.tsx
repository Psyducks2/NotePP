type TitleBarMenuProps = {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFind: () => void;
  onSettings: () => void;
  onHistory: () => void;
  wordWrap: boolean;
  onToggleWrap: () => void;
  recentFiles: string[];
  onOpenRecent: (path: string) => void;
};

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

export function TitleBarMenu({
  onNew,
  onOpen,
  onSave,
  onSaveAs,
  onFind,
  onSettings,
  onHistory,
  wordWrap,
  onToggleWrap,
  recentFiles,
  onOpenRecent,
}: TitleBarMenuProps) {
  return (
    <nav className="menu-bar" aria-label="Menu principal">
      <details className="menu">
        <summary>Arquivo</summary>
        <div className="menu-panel">
          <button type="button" onClick={onNew}>
            Novo <kbd>Ctrl+N</kbd>
          </button>
          <button type="button" onClick={onOpen}>
            Abrir… <kbd>Ctrl+O</kbd>
          </button>
          {recentFiles.length > 0 && (
            <>
              <span className="menu-divider">Recentes</span>
              {recentFiles.map((path) => (
                <button
                  key={path}
                  type="button"
                  title={path}
                  onClick={() => onOpenRecent(path)}
                >
                  {baseName(path)}
                </button>
              ))}
            </>
          )}
          <button type="button" onClick={onSave}>
            Salvar <kbd>Ctrl+S</kbd>
          </button>
          <button type="button" onClick={onSaveAs}>
            Salvar como… <kbd>Ctrl+Shift+S</kbd>
          </button>
        </div>
      </details>

      <details className="menu">
        <summary>Editar</summary>
        <div className="menu-panel">
          <button type="button" onClick={onFind}>
            Localizar… <kbd>Ctrl+F</kbd>
          </button>
          <button type="button" onClick={onHistory}>
            Histórico de ditados…
          </button>
        </div>
      </details>

      <details className="menu">
        <summary>Exibir</summary>
        <div className="menu-panel">
          <button type="button" onClick={onToggleWrap}>
            {wordWrap ? "✓ " : ""}Quebra de linha
          </button>
        </div>
      </details>

      <details className="menu">
        <summary>Configurações</summary>
        <div className="menu-panel">
          <button type="button" onClick={onSettings}>
            Preferências…
          </button>
        </div>
      </details>
    </nav>
  );
}
