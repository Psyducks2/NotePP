# NotePP — Design Spec (MVP)

**Date:** 2026-08-03  
**Status:** Approved

## Summary

NotePP is a Linux desktop notepad (open source) that replaces a simple text editor. Hybrid model: edit files on disk and keep unsaved drafts / session recovery (Windows 10 Notepad–like). Inspired by Joplin’s openness, not its notebook/sync model.

## Goals

- Multi-tab text editing
- Autosave with settings toggle for writing to the file on disk
- Session restore on reopen (tabs, content, active tab)
- Open / Save / Save As for `.txt`, `.md`, `.text`, and all files
- Close without Ctrl+S still persists (file and/or session)
- Codebase easy to open, fix, and rebuild

## Non-goals (v2+)

- Markdown preview
- Cloud sync
- Notebooks/folders (Joplin-style)
- Syntax highlighting for code
- Official Flatpak/distro packages

## Stack

- Tauri 2 + React + TypeScript + Vite
- CodeMirror 6 (plain text)
- Zustand for tab/settings state
- Session JSON under XDG data dir
- Settings JSON under XDG config dir

## Persistence

| Kind | Location |
|------|----------|
| Session | `~/.local/share/notepp/session.json` |
| Settings | `~/.config/notepp/settings.json` |

### Settings defaults

- `autosaveToFile`: `true`
- `wordWrap`: `true`
- `fontSize`: `15`

### Autosave rules

- Debounce ~1s while typing; flush on tab close and app close
- If tab has path and `autosaveToFile` is on → write file
- If untitled or toggle off → session only
- Explicit Save / Save As always writes the chosen path

## UX

- UI language: Portuguese (Brazil)
- Menus: Arquivo, Editar, Exibir, Configurações
- Shortcuts: Ctrl+N/O/S/Shift+S, Ctrl+W, Ctrl+Tab, Ctrl+F
- Status: “Salvo” / “Salvando…”
- Light theme; readable UI + monospace editor fonts

## Architecture

Frontend owns tabs + editor; Rust commands own file I/O, dialogs, session, and settings. Frontend invokes commands; never writes arbitrary paths without user dialog or previously opened path.
