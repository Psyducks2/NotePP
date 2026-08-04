<p align="center">
  <img src="docs/assets/banner.png" alt="NotePP — bloco de notas rápido, offline e open source para Linux" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-742F4C" alt="Licença MIT" />
  <img src="https://img.shields.io/badge/platform-Linux-8E425C" alt="Plataforma Linux" />
  <img src="https://img.shields.io/badge/status-v1-C07180" alt="Status v1" />
</p>

# NotePP

Editor de texto para Linux (estilo Bloco de Notas): abas, autosave configurável,
sessão persistente, abrir/salvar `.txt`/`.md`, ditado por voz com Whisper e um
sistema de temas com a identidade Rosa/Vinho.

Open source (MIT) — abra o código, corrija e recompile.

## Recursos

- Abas múltiplas com sessão persistente entre reinícios
- Autosave configurável (no arquivo em disco ou só na sessão)
- Abrir/salvar `.txt`/`.md`, arquivos recentes, arrastar e soltar
- Localizar/substituir no editor
- Ditado por voz local via Whisper, com limpeza de texto opcional e histórico
- 4 temas prontos (Aurora Rosé, Papel Envelhecido, Vinho Noturno, Ameixa
  Meia-noite) + tema personalizado com paleta própria

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

## Temas

Configurações → **Aparência**. Escolha um dos 4 temas curados ou clique em
**Personalizado** para abrir um editor de cores (Acento, Papel, Fundo escuro,
Texto, e uma seção avançada com Destaque/Erro/Sucesso). A troca é aplicada
imediatamente e persiste entre sessões.

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

## Contribuindo

Projeto open source sob licença MIT. Issues e pull requests são bem-vindos —
abra o código, corrija o que encontrar e mande um PR.

## Docs

- Spec: `docs/superpowers/specs/2026-08-03-notepp-design.md`
- Plano: `docs/superpowers/plans/2026-08-03-notepp-mvp.md`
- Identidade visual: `docs/superpowers/specs/2026-08-03-notepp-visual-identity-design.md`
