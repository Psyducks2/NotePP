#!/usr/bin/env node
// Builds the cleanup-worker crate and copies it into src-tauri/binaries/ with the
// target-triple suffix Tauri's `externalBin` sidecar mechanism expects. Must run
// before `tauri dev` / `tauri build`, since the sidecar binary isn't produced by
// the frontend build and Tauri won't invoke cargo for it on its own.
import { execFileSync } from "node:child_process";
import { copyFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriDir = join(root, "src-tauri");
const binariesDir = join(tauriDir, "binaries");

const profile = process.argv.includes("--release") ? "release" : "debug";
const cargoArgs = ["build", "-p", "cleanup-worker"];
if (profile === "release") cargoArgs.push("--release");

console.log(`> cargo ${cargoArgs.join(" ")}`);
execFileSync("cargo", cargoArgs, { cwd: tauriDir, stdio: "inherit" });

const triple = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host:"))
  .split(":")[1]
  .trim();

const exeName = process.platform === "win32" ? "cleanup-worker.exe" : "cleanup-worker";
const src = join(tauriDir, "target", profile, exeName);
const destName = process.platform === "win32"
  ? `cleanup-worker-${triple}.exe`
  : `cleanup-worker-${triple}`;
const dest = join(binariesDir, destName);

if (!existsSync(src)) {
  throw new Error(`Binário do cleanup-worker não encontrado em ${src}`);
}

mkdirSync(binariesDir, { recursive: true });
copyFileSync(src, dest);
if (process.platform !== "win32") chmodSync(dest, 0o755);

console.log(`> cleanup-worker sidecar pronto em ${dest}`);
