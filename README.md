# NotePP

Editor de texto para Linux (estilo Bloco de Notas): abas, autosave configurável, sessão persistente e abrir/salvar `.txt` / `.md`.

Open source (MIT) — abra o código, corrija e recompile.

## Requisitos

- Node.js 20+ (recomendado 24)
- Rust (stable) via [rustup](https://rustup.rs/)
- Dependências Linux (Ubuntu/Debian):

```bash
sudo apt install -y build-essential pkg-config libwebkit2gtk-4.1-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf \
  libasound2-dev
```

Para aceleração GPU do Whisper (opcional, Vulkan):

```bash
sudo apt install -y libvulkan-dev glslc
# depois compile com:
# cd src-tauri && cargo build --release --features whisper-gpu
# ou: npm run tauri build -- -- --features whisper-gpu
```

No app: Configurações → Voz → **Acelerar Whisper com GPU** (pede confirmação).
## Desenvolvimento

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Artefatos em `src-tauri/target/release/bundle/` (AppImage/deb conforme o host).

## Dados

| Tipo | Caminho |
|------|---------|
| Sessão | `~/.local/share/notepp/session.json` |
| Config | `~/.config/notepp/settings.json` |

## Atalhos

| Atalho | Ação |
|--------|------|
| Ctrl+N | Nova aba |
| Ctrl+O | Abrir |
| Ctrl+S | Salvar |
| Ctrl+Shift+S | Salvar como |
| Ctrl+W | Fechar aba |
| Ctrl+Tab | Próxima aba |
| Ctrl+F | Localizar |
| Ctrl+ / Ctrl- | Aumentar/diminuir fonte |
| Ctrl+0 | Restaurar tamanho da fonte |

## Docs

- Spec: `docs/superpowers/specs/2026-08-03-notepp-design.md`
- Plano: `docs/superpowers/plans/2026-08-03-notepp-mvp.md`
