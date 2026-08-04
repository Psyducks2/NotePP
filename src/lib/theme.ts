export type ThemeSeeds = {
  paper: string;
  inkText: string;
  ink900: string;
  onInk: string;
  pen: string;
  highlighter: string;
  danger: string;
  success: string;
};

export type ThemeDefinition = {
  id: string;
  name: string;
  mode: "light" | "dark";
  seeds: ThemeSeeds;
};

export const CURATED_THEMES: ThemeDefinition[] = [
  {
    id: "aurora-rose",
    name: "Aurora Rosé",
    mode: "light",
    seeds: {
      paper: "#fdf5f6",
      inkText: "#2a1620",
      ink900: "#2a1420",
      onInk: "#fbeef1",
      pen: "#8e425c",
      highlighter: "#e2941f",
      danger: "#c1432e",
      success: "#2f8a5b",
    },
  },
  {
    id: "papel-envelhecido",
    name: "Papel Envelhecido",
    mode: "light",
    seeds: {
      paper: "#f4ecda",
      inkText: "#3a2318",
      ink900: "#3a1f2c",
      onInk: "#f6ece2",
      pen: "#742f4c",
      highlighter: "#b8752a",
      danger: "#a83a28",
      success: "#3a7a52",
    },
  },
  {
    id: "vinho-noturno",
    name: "Vinho Noturno",
    mode: "dark",
    seeds: {
      paper: "#241019",
      inkText: "#f1dde3",
      ink900: "#160a10",
      onInk: "#f6e6ea",
      pen: "#da8d95",
      highlighter: "#e2a53f",
      danger: "#e17b64",
      success: "#4fb37e",
    },
  },
  {
    id: "ameixa-meia-noite",
    name: "Ameixa Meia-noite",
    mode: "dark",
    seeds: {
      paper: "#1a0d15",
      inkText: "#f3e2e7",
      ink900: "#0f0710",
      onInk: "#f7e8ec",
      pen: "#c07180",
      highlighter: "#e6b04a",
      danger: "#e88a72",
      success: "#5cc28c",
    },
  },
];

export const DEFAULT_THEME_ID = CURATED_THEMES[0].id;

export function findCuratedTheme(id: string): ThemeDefinition | undefined {
  return CURATED_THEMES.find((t) => t.id === id);
}

export function resolveActiveSeeds(
  themeId: string,
  customTheme: ThemeSeeds | null,
): ThemeSeeds {
  if (themeId === "custom" && customTheme) {
    return customTheme;
  }
  return (
    findCuratedTheme(themeId)?.seeds ??
    findCuratedTheme(DEFAULT_THEME_ID)!.seeds
  );
}

const SEED_PROPERTIES: Record<keyof ThemeSeeds, string> = {
  paper: "--seed-paper",
  inkText: "--seed-ink-text",
  ink900: "--seed-ink-900",
  onInk: "--seed-on-ink",
  pen: "--seed-pen",
  highlighter: "--seed-highlighter",
  danger: "--seed-danger",
  success: "--seed-success",
};

export function applyTheme(seeds: ThemeSeeds): void {
  const root = document.documentElement.style;
  for (const key of Object.keys(SEED_PROPERTIES) as (keyof ThemeSeeds)[]) {
    root.setProperty(SEED_PROPERTIES[key], seeds[key]);
  }
}
