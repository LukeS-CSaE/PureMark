# PureMark

> A minimal, local-first Markdown editor. No accounts. No cloud sync. No telemetry. Just writing.

[![Built with Tauri](https://img.shields.io/badge/Built%20with-Tauri%202-24C8D8?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-38B2AC?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Screenshots

<!-- TODO: Add actual screenshots here -->
*Coming soon*

---

## Features

### Editing

- **Dual editor engines** — CodeMirror 6 for source editing, TipTap / ProseMirror for live WYSIWYG rendering
- **Three view modes** per pane — `edit` (source with syntax highlighting) / `live` (Typora-style real-time rendering) / `preview` (read-only)
- **Split view** — side-by-side panes with independent view modes; edit the same file or two different files
- **Multi-tab** — open, switch, close documents; unsaved tabs show a dirty indicator
- **Clipboard image paste** — `Ctrl+V` an image, it saves to `assets/` and inserts the relative path automatically
- **Table context menu** — right-click inside a table to insert rows above/below, delete rows, insert columns left/right
- **Block operations** — `Ctrl+D` to duplicate a block, `Alt+↑` / `Alt+↓` to move it
- **In-app search** — `Ctrl+F` with match highlighting and scroll-to-match in all views

### File Management

- **File tree sidebar** — browse folders, filter `.md` / `.markdown` only, resizable
- **File associations** — double-click a `.md` file to open it in PureMark (single-instance, focuses existing window)
- **Auto-save drafts** — local draft saving protects against accidental loss; `Ctrl+S` writes back to the original file
- **External change detection** — watches open files for disk modifications, shows a conflict bar, and offers a diff view for resolution
- **Non-UTF-8 encoding support** — auto-detects GBK / GB2312 / GB18030 / Big5 / UTF-16 and preserves the original encoding on save

### Appearance

- **Acrylic blur window** — frameless window with native DWM blur on Windows
- **Light / Dark / Auto** themes — follows system preference by default
- **7 accent colors** — sky, blue, green, purple, orange, red, pink; instantly applied and persisted
- **Custom titlebar** — minimal, draggable, with native window controls
- **Window geometry memory** — restores exact size, position, and maximized state across restarts

### Other

- **TOC (Table of Contents)** — auto-parsed from headings, click to jump, supports left/right panel position
- **Status bar** — live line/column, word count, character count, encoding, and language
- **Scroll position memory** — per-tab scroll restoration when switching between documents and views
- **Scroll sync** — synchronized scrolling between edit and preview in split mode

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (or npm)
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/<your-username>/puremark.git
cd puremark

# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm tauri dev

# Type check only
npx tsc -p tsconfig.app.json --noEmit

# Run tests
npx vitest run

# Production build
pnpm tauri build
```

The built executable will be in `src-tauri/target/release/`.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save file |
| `Ctrl+N` | New document |
| `Ctrl+W` | Close current tab |
| `Ctrl+F` | Open search panel |
| `Ctrl+D` | Duplicate current block |
| `Alt+↑` | Move block up |
| `Alt+↓` | Move block down |
| `Ctrl+R` / `F5` | Refresh (with dirty guard) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri 2](https://tauri.app) (Rust + WebView2) |
| Frontend | [React 18](https://react.dev) + [TypeScript 5.5](https://www.typescriptlang.org) |
| Build | [Vite 5](https://vitejs.dev) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) (`@theme inline` token system) |
| Source editor | [CodeMirror 6](https://codemirror.net) |
| Live editor | [TipTap 2](https://tiptap.dev) / [ProseMirror](https://prosemirror.net) |
| State management | [Zustand](https://github.com/pmndrs/zustand) |
| Icons | [Lucide](https://lucide.dev) |
| Code highlighting | [highlight.js](https://highlightjs.org) (via lowlight) |
| Testing | [Vitest](https://vitest.dev) |

### Rust Backend

Custom Tauri commands:
- `build_tree` — recursive directory scan for Markdown files
- `read_text_auto` — encoding-aware text reading (GBK/Big5/UTF-16 auto-detection)
- `write_text_enc` — encoding-preserving text writing
- `write_binary_file` — binary file write (clipboard image saving)
- `take_launch_file` — retrieve file path from CLI argument (file association)

---

## Project Structure

```
prueMd/
├── src/                          # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── Header/               # Custom titlebar + window controls
│   │   ├── Sidebar/              # File tree + TOC panel
│   │   ├── Workspace/            # TabBar, CodeEditor (CM6), MarkdownView (TipTap)
│   │   ├── dialogs/              # Search, Settings, Unsaved, Conflict resolution
│   │   └── ui/                   # Icon, Button, Select, Toggle primitives
│   ├── store/                    # Zustand stores (tabs, UI, config, panes)
│   ├── lib/                      # Pure logic (path, diff, search, TOC, theme, ...)
│   │   ├── cm/                   # CodeMirror 6 setup + theme + keymaps
│   │   └── prosemirror/          # TipTap extensions, serializer, block ops
│   ├── hooks/                    # React hooks (hotkeys, auto-save, theme, ...)
│   ├── commands/                 # Tauri command bridges (fs, dialog)
│   └── styles/                   # Global CSS + theme tokens
├── src-tauri/                    # Rust backend
│   ├── src/lib.rs                # Tauri commands + app builder
│   ├── capabilities/             # Permission configuration
│   └── tauri.conf.json           # Window / bundle / file association config
├── docs/                         # Design documents and user manual
└── public/                       # Static assets
```

---

## Design Philosophy

- **Local-first**: Your files are plain `.md` files on disk. No database, no vendor lock-in.
- **Minimal**: Clean UI with no distractions. The tool gets out of your way.
- **Performance**: Lightweight by design — marked for parsing, highlight.js for highlighting, no Electron bloat.
- **Byte-fidelity**: Source-preserving serializer ensures unchanged blocks are written back byte-identically.

---

## License

[MIT](LICENSE)
