import { useState } from "react";
import { persistCurrentSettings } from "../lib/session";
import {
  applyTheme,
  CURATED_THEMES,
  resolveActiveSeeds,
  type ThemeSeeds,
} from "../lib/theme";
import { useSettingsStore } from "../store/settingsStore";

const CUSTOM_ID = "custom";

const ADVANCED_LABELS: { key: keyof ThemeSeeds; label: string }[] = [
  { key: "highlighter", label: "Destaque (não salvo)" },
  { key: "danger", label: "Erro" },
  { key: "success", label: "Sucesso" },
];

const BASIC_LABELS: { key: keyof ThemeSeeds; label: string }[] = [
  { key: "pen", label: "Acento" },
  { key: "paper", label: "Papel" },
  { key: "ink900", label: "Fundo escuro" },
  { key: "inkText", label: "Texto" },
];

export function ThemeSettings() {
  const themeId = useSettingsStore((s) => s.themeId);
  const customTheme = useSettingsStore((s) => s.customTheme);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const selectCurated = (id: string) => {
    void persistCurrentSettings({ themeId: id });
    applyTheme(resolveActiveSeeds(id, customTheme));
  };

  const selectCustom = () => {
    const seeds = customTheme ?? resolveActiveSeeds(themeId, null);
    void persistCurrentSettings({ themeId: CUSTOM_ID, customTheme: seeds });
    applyTheme(seeds);
  };

  const updateCustomSeed = (key: keyof ThemeSeeds, value: string) => {
    const base = customTheme ?? resolveActiveSeeds(themeId, null);
    const next: ThemeSeeds = { ...base, [key]: value };
    void persistCurrentSettings({ themeId: CUSTOM_ID, customTheme: next });
    applyTheme(next);
  };

  const activeCustomSeeds = customTheme ?? resolveActiveSeeds(themeId, null);

  return (
    <div className="theme-settings">
      <div className="theme-grid" role="radiogroup" aria-label="Tema">
        {CURATED_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={themeId === theme.id}
            className={
              "theme-card" + (themeId === theme.id ? " active" : "")
            }
            onClick={() => selectCurated(theme.id)}
          >
            <span className="theme-swatch">
              <i style={{ background: theme.seeds.paper }} />
              <i style={{ background: theme.seeds.pen }} />
              <i style={{ background: theme.seeds.ink900 }} />
            </span>
            <span className="theme-card-name">{theme.name}</span>
          </button>
        ))}

        <button
          type="button"
          role="radio"
          aria-checked={themeId === CUSTOM_ID}
          className={
            "theme-card" + (themeId === CUSTOM_ID ? " active" : "")
          }
          onClick={selectCustom}
        >
          <span className="theme-swatch">
            <i style={{ background: activeCustomSeeds.paper }} />
            <i style={{ background: activeCustomSeeds.pen }} />
            <i style={{ background: activeCustomSeeds.ink900 }} />
          </span>
          <span className="theme-card-name">Personalizado</span>
        </button>
      </div>

      {themeId === CUSTOM_ID ? (
        <div className="theme-editor">
          {BASIC_LABELS.map(({ key, label }) => (
            <label className="theme-color-row" key={key}>
              {label}
              <input
                type="color"
                value={activeCustomSeeds[key]}
                onChange={(e) => updateCustomSeed(key, e.target.value)}
              />
            </label>
          ))}

          <button
            type="button"
            className="theme-advanced-toggle"
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? "Ocultar avançado" : "Mostrar avançado"}
          </button>

          {advancedOpen
            ? ADVANCED_LABELS.map(({ key, label }) => (
                <label className="theme-color-row" key={key}>
                  {label}
                  <input
                    type="color"
                    value={activeCustomSeeds[key]}
                    onChange={(e) => updateCustomSeed(key, e.target.value)}
                  />
                </label>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
