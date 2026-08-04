# NotePP — Identidade visual, sistema de temas, ícone, banner e README (design)

Data: 2026-08-03

## Contexto

O NotePP hoje usa uma paleta única e fixa definida em `src/styles/app.css` (`:root`),
sem alternância de tema. As Configurações (`SettingsDialog.tsx`) têm abas "Geral" e
"Voz para texto". Não existe ícone/banner com identidade própria (ícones atuais em
`src-tauri/icons/` são o placeholder padrão do Tauri). O README é funcional mas
não comunica identidade visual nem o recurso de temas.

Este documento cobre a v1 de identidade visual do NotePP, para ser lançada junto
com a primeira versão pública do app.

## Paleta escolhida

Rosa/Vinho: `#F3ACAE, #DA8D95, #C07180, #A7586D, #8E425C, #742F4C, #5B1F3D`.

Do claro ao escuro, do rosa suave ao vinho profundo. É a paleta de identidade
de marca do NotePP (usada no ícone, banner e como base dos temas curados).

## 1. Sistema de temas

### 1.1 Tokens semente + derivação via `color-mix()`

Hoje `app.css` define ~16 variáveis de cor. Reescrever cada uma por tema seria
repetitivo e frágil. Em vez disso, cada tema define só **8 cores-semente**:

- `--seed-paper` — superfície de conteúdo (editor, menus, diálogos)
- `--seed-ink-text` — texto sobre `paper`
- `--seed-ink-900` — chrome de navegação (toolbar, trilho de abas, status bar)
- `--seed-on-ink` — texto sobre `ink-900`
- `--seed-pen` — acento de interação (links, botões, foco)
- `--seed-highlighter` — destaque de "não salvo"
- `--seed-danger` — erro
- `--seed-success` — sucesso

As demais variáveis existentes (`--paper-sunken`, `--line`, `--muted-text`,
`--ink-800`, `--ink-700`, `--on-ink-muted`, `--pen-soft`, `--highlighter-soft`,
`--danger-soft`) passam a ser **derivadas em `app.css`** com `color-mix()` a
partir das 8 sementes, por exemplo:

```css
--paper-sunken: color-mix(in srgb, var(--seed-paper) 94%, var(--seed-ink-text) 6%);
--line: color-mix(in srgb, var(--seed-paper) 85%, var(--seed-ink-text) 15%);
--muted-text: color-mix(in srgb, var(--seed-ink-text) 60%, var(--seed-paper) 40%);
--ink-800: color-mix(in srgb, var(--seed-ink-900) 85%, white 15%);
--ink-700: color-mix(in srgb, var(--seed-ink-900) 70%, white 30%);
--on-ink-muted: color-mix(in srgb, var(--seed-on-ink) 65%, var(--seed-ink-900) 35%);
--pen-soft: color-mix(in srgb, var(--seed-pen) 14%, var(--seed-paper) 86%);
--highlighter-soft: color-mix(in srgb, var(--seed-highlighter) 16%, var(--seed-paper) 84%);
--danger-soft: color-mix(in srgb, var(--seed-danger) 14%, var(--seed-paper) 86%);
```

Todo o resto do CSS existente continua a consumir `--paper`, `--pen`, etc. — então
essas variáveis "finais" simplesmente recebem o valor da semente correspondente
(`--paper: var(--seed-paper)`), sem tocar nos ~40 seletores que já existem no
arquivo. Isso limita o raio de mudança a um novo bloco no topo do `app.css`.

`color-mix()` requer WebKitGTK 2.42+ (2023), já coberto pelo `libwebkit2gtk-4.1`
que o README já lista como dependência de build.

### 1.2 Temas curados (4)

Todos dentro da identidade rosa/vinho, para manter a marca consistente:

| id | Nome | Modo | Descrição |
|---|---|---|---|
| `aurora-rose` | Aurora Rosé | claro | papel rosado claro, acento vinho médio (`#8E425C`) — tema padrão |
| `papel-envelhecido` | Papel Envelhecido | claro | papel creme/sépia, acento vinho profundo (`#742F4C`) |
| `vinho-noturno` | Vinho Noturno | escuro | chrome quase preto com matiz vinho, acento rosa vibrante (`#DA8D95`) |
| `ameixa-meia-noite` | Ameixa Meia-noite | escuro | fundo ameixa bem escuro, acento rosa saturado (`#C07180`), mais contraste |

Cada um é um objeto `ThemeDefinition` com as 8 sementes definidas explicitamente
(sem derivação automática de paleta — valores escolhidos à mão para garantir
contraste AA em texto sobre `paper` e sobre `ink-900`).

### 1.3 Tema personalizado

Nova aba **"Aparência"** em `SettingsDialog.tsx`, antes de "Geral". Mostra:

1. Grade de cards, um por tema curado + um card "Personalizado", cada um com
   swatch das cores principais e nome. Clique aplica o tema imediatamente
   (preview ao vivo, sem precisar salvar).
2. Se "Personalizado" estiver selecionado: 4 color-pickers obrigatórios —
   **Acento**, **Papel**, **Fundo escuro**, **Texto** — mais uma seção
   colapsável "Avançado" com **Destaque**, **Erro**, **Sucesso** (default:
   copiados do tema curado mais próximo ao escolher "Personalizado" pela
   primeira vez, editáveis depois).

Interações de edge case:
- Trocar de curado A → curado B: aplica na hora, persiste ao perder o foco/fechar.
- Trocar para "Personalizado" sem ainda ter customizado nada: usa os valores do
  último tema curado ativo como ponto de partida (nunca começa com campos vazios).
- Fechar o diálogo não desfaz a prévia — o tema aplicado ao vivo já é o persistido
  (mesmo padrão dos outros settings do app, que salvam a cada mudança).

### 1.4 Persistência

`AppSettings` (TS e Rust) ganha:

```ts
themeId: string;            // "aurora-rose" | "papel-envelhecido" | "vinho-noturno" | "ameixa-meia-noite" | "custom"
customTheme: ThemeSeeds | null; // as 8 cores, só usado quando themeId === "custom"
```

Rust: `theme_id: String` (`#[serde(default = "default_theme_id")]`) e
`custom_theme: Option<ThemeSeeds>` (`#[serde(default)]`), seguindo o padrão já
usado por `mic_device_id`/`whisper_use_gpu` — configs antigas sem esses campos
carregam com o tema padrão (`aurora-rose`).

Aplicação: uma função `applyTheme(seeds: ThemeSeeds)` em `src/lib/theme.ts` que
escreve as 8 variáveis via `document.documentElement.style.setProperty`,
chamada no boot (`bootApp`, depois de `hydrate`) e sempre que o usuário troca de
tema/edita o personalizado.

## 2. Ícone do programa

Motivo: bloco de notas + caneta — comunica a função do app diretamente.
Estilo flat/minimalista, gradiente da paleta rosa/vinho (`#F3ACAE → #5B1F3D`).

Processo: desenhar um SVG fonte de alta resolução (1024×1024) em
`src-tauri/icons/source.svg` (mantido no repo para poder regenerar no futuro),
depois rodar `npx tauri icon src-tauri/icons/source.svg` para gerar automaticamente
todo o conjunto que `tauri.conf.json` já referencia (`32x32.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns`, `icon.ico`) e os demais tamanhos Windows Store que
já existem na pasta — evita produzir cada formato manualmente.

## 3. Banner (README)

SVG horizontal (~1200×300), logo (símbolo do ícone) + wordmark "NotePP" +
tagline curta ("Bloco de notas rápido, offline e open source para Linux"),
fundo com gradiente sutil da paleta. Exportado para PNG e salvo em
`docs/assets/banner.png` (novo diretório `docs/assets/`), referenciado no topo
do README.

## 4. README

Reescrita mantendo o conteúdo técnico já correto (requisitos, build, dados,
atalhos), acrescentando:

- Banner no topo + badges (licença MIT, plataforma Linux).
- Seção de features atualizada, incluindo "Temas" (4 temas + personalizado).
- Seção "Temas" explicando como trocar/criar tema nas Configurações.
- Seção de contribuição (curta, aponta pro código aberto/MIT já mencionado).

Sem screenshots reais do app (não faz parte deste escopo rodar a UI).

## 5. Varredura de bugs

Revisão de código (sem rodar o app) em `src/components`, `src/store`, `src/lib`
e `src-tauri/src/commands/settings.rs`, focada em lógica, edge cases e fluxo
(ex.: condições de corrida entre autosave e troca de aba, validação de inputs
numéricos, tratamento de erro em `invoke`). Bugs encontrados são corrigidos
diretamente; sem achado é reportado como tal.

## Fora de escopo

- Testar a UI num navegador/app real (é revisão de código, não execução).
- Temas por-componente além dos tokens semente (ex.: temas diferentes para o
  editor CodeMirror em si, além das cores base já usadas por `.editor-host`).
- Ícones de sistema/tray, apenas o ícone do app/bundle.
