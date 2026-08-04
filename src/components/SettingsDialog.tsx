import { useState } from "react";
import { persistCurrentSettings } from "../lib/session";
import { useSettingsStore } from "../store/settingsStore";
import { ThemeSettings } from "./ThemeSettings";
import { VoiceSettings } from "./VoiceSettings";

type SettingsDialogProps = {
  open: boolean;
  onClose: () => void;
};

type Tab = "appearance" | "general" | "voice";

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const autosaveToFile = useSettingsStore((s) => s.autosaveToFile);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const [tab, setTab] = useState<Tab>("appearance");

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title">Configurações</h2>

        <div className="settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "appearance"}
            className={tab === "appearance" ? "active" : ""}
            onClick={() => setTab("appearance")}
          >
            Aparência
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "general"}
            className={tab === "general" ? "active" : ""}
            onClick={() => setTab("general")}
          >
            Geral
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "voice"}
            className={tab === "voice" ? "active" : ""}
            onClick={() => setTab("voice")}
          >
            Voz para texto
          </button>
        </div>

        {tab === "appearance" ? (
          <ThemeSettings />
        ) : tab === "general" ? (
          <>
            <label className="setting-row">
              <input
                type="checkbox"
                checked={autosaveToFile}
                onChange={(e) =>
                  void persistCurrentSettings({ autosaveToFile: e.target.checked })
                }
              />
              Autosave no arquivo do disco
            </label>

            <label className="setting-row">
              <input
                type="checkbox"
                checked={wordWrap}
                onChange={(e) =>
                  void persistCurrentSettings({ wordWrap: e.target.checked })
                }
              />
              Quebra de linha
            </label>

            <label className="setting-row">
              Tamanho da fonte
              <input
                type="number"
                min={10}
                max={32}
                value={fontSize}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  const clamped = Number.isFinite(parsed)
                    ? Math.min(32, Math.max(10, parsed))
                    : 15;
                  void persistCurrentSettings({ fontSize: clamped });
                }}
              />
            </label>

            <p className="hint">
              Com autosave no arquivo desligado, alterações ficam só na sessão
              até você usar Salvar.
            </p>
          </>
        ) : (
          <VoiceSettings />
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
