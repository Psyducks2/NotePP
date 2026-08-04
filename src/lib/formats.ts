export const DEFAULT_UNTITLED_NAME = "Sem título.txt";

export function ensureExtension(path: string, fallbackExt = ".txt"): string {
  const base = path.split(/[/\\]/).pop() ?? path;
  if (base.includes(".")) return path;
  return `${path}${fallbackExt}`;
}

export function suggestSaveName(title: string, path: string | null): string {
  if (path) {
    const name = path.split(/[/\\]/).pop();
    if (name) return name;
  }
  if (title && title !== "Sem título") {
    return title.includes(".") ? title : `${title}.txt`;
  }
  return DEFAULT_UNTITLED_NAME;
}
