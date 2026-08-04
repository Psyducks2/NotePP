function ensureExtension(path, fallbackExt = ".txt") {
  const base = path.split(/[/\\]/).pop() ?? path;
  if (base.includes(".")) return path;
  return `${path}${fallbackExt}`;
}

function suggestSaveName(title, path) {
  if (path) {
    const name = path.split(/[/\\]/).pop();
    if (name) return name;
  }
  if (title && title !== "Sem título") {
    return title.includes(".") ? title : `${title}.txt`;
  }
  return "Sem título.txt";
}

if (ensureExtension("/tmp/nota") !== "/tmp/nota.txt") throw new Error("ext");
if (ensureExtension("/tmp/nota.md") !== "/tmp/nota.md") throw new Error("md");
if (suggestSaveName("x", "/home/a/file.md") !== "file.md") throw new Error("name");

console.log("manual-qa formats: ok");
