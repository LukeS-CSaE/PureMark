# PRD · 禁用 WebView 右键菜单（自定义重写）

> 类型：增量需求 PRD（聚焦变更部分） · 简单 PRD 格式
> 关联代码：`src/lib/contextMenuGuard.ts`、`src/App.tsx`、`src/components/Workspace/CodeEditor.tsx`、`src/components/Sidebar/FileTree.tsx`、`src/components/Workspace/TabBar.tsx`、`src/lib/format.ts`、`src-tauri/src/lib.rs`、`src-tauri/capabilities/default.json`

## 1. 产品目标（一句话）

全面禁用 Tauri WebView 的原生右键菜单，并在编辑器、文件树、标签页等需要右键的表面提供自绘的自定义上下文菜单，统一交互与视觉。

## 2. 背景与现状（对照真实代码）

**已实现：**
- `src/lib/contextMenuGuard.ts` + `App.tsx` 在 **capture 阶段** `preventDefault` 抑制 `.app-workspace, .editor-pane, .file-tree, .pm-live` 的原生右键。
- 但 EXEMPT 列表 `input, textarea, button, select, [contenteditable], .cm-content, .cm-editor` **保留原生菜单** —— CodeMirror 编辑器内仍弹出原生菜单。
- 已有单测 `src/__tests__/contextMenu.test.ts` 覆盖 `shouldSuppressContextMenu` 纯函数。

**现状缺口（本需求要解决）：**
- 编辑器（CM6）、文件树、标签页等「需要右键」的表面**没有任何自定义菜单**；用户要求「需要右键的全部重写」。
- `lib/format.ts` 已具备 `applyFormat`（bold/italic/strike/code/link/image/quote/ul/ol/task/table/h1-3），编辑器格式菜单项技术上可直接复用。
- 写文件命令缺失：`src-tauri/src/lib.rs` 仅有 `build_tree` / `readFileText` 读命令，无 rename/delete/create；文件树菜单的写操作需新增 Rust 命令。

## 3. 用户故事

- 作为用户，我希望在编辑器 / 文件树 / 标签页右键时看到与应用风格一致的菜单，而不是浏览器 / CM 原生菜单。
- 作为用户，我希望右键菜单提供常用操作（复制粘贴、加粗等格式、打开 / 重命名 / 删除文件、关闭其他标签等）。
- 作为用户，我不希望禁用原生菜单后丢失关键能力（如输入框的粘贴、拼写检查）。

## 4. 需求池

### P0（必须）
1. **全局禁用原生右键（含编辑器）**：将 `.cm-content` / `.cm-editor` 从 EXEMPT 移除（或保留但用 CM 扩展接管），使编辑器内原生菜单也被压制——但必须用自定义菜单接管（见下）。
2. **自定义上下文菜单组件**：新增 `ContextMenu`（portal，定位于光标；支持图标 / 禁用态 / 分隔线 / 可选子菜单），状态受控于轻量 store（建议 `useUIStore` 增 `contextMenu` 字段或独立 Provider）。
3. **编辑器右键菜单（edit / live）**：通过 CM6 扩展 `EditorView.domEventHandlers({ contextmenu })` 接管；菜单项：撤销 / 重做、剪切 / 复制 / 粘贴 / 全选、加粗 / 斜体 / 删除线 / 行内代码 / 插入链接（调用 `lib/format.ts` + CM 命令）。
4. **文件树右键菜单**：在 `FileTree` 的 file / dir 节点 `onContextMenu` —— 文件：打开 / 在资源管理器中显示 / 复制路径 / 重命名 / 删除；目录：打开 / 新建文件 / 新建文件夹 / 复制路径 / 重命名 / 删除。
5. **标签页右键菜单**：在 `TabBar` 的 `tab-item` `onContextMenu` —— 关闭 / 关闭其他 / 关闭右侧 / 关闭左侧 / 关闭全部 / 复制路径 / 在资源管理器中显示。
6. **菜单通用交互**：点击空白 / 滚动 / 按 `Esc` 关闭；菜单溢出视口时自动翻转定位。

### P1（应该）
7. **预览窗格右键菜单**（`.pm-live` 已是压制区）：选中文字时提供「复制」，否则提供「复制 HTML」等（必要性见 Q4）。
8. **输入框策略**：搜索框 / 设置输入建议**保留原生菜单**（可靠粘贴 / 拼写）；或在其上也提供轻量自定义菜单（含粘贴 / 复制 / 剪切 / 全选）。见 Q1。
9. **文件树写操作真实实现**：新增 Rust 命令 `rename_file` / `delete_file` / `create_file` / `create_dir`，并在 `capabilities/default.json` 授权（已有 `fs(**)` / `dialog` 基础）。

### P2（可选）
10. **子菜单**（如「插入」含链接 / 图片 / 表格）。
11. **键盘可达**：方向键导航 + `Enter` 触发 + `Esc` 关闭；菜单项随 accent 主题色高亮。
12. 扩展 `contextMenu.test.ts` 覆盖 CM / 文件树 / 标签场景。

## 5. UI / 交互设计稿

### 自定义菜单统一外观（ASCII）
```text
┌──────────────────────┐
│ ↶ 撤销        Ctrl+Z │
│ ↷ 重做        Ctrl+Y │
├──────────────────────┤
│ ✂ 剪切       Ctrl+X │
│ ⧉ 复制       Ctrl+C │
│ ⤓ 粘贴       Ctrl+V │
│ ⊞ 全选       Ctrl+A │
├──────────────────────┤
│ B 加粗       Ctrl+B │
│ I 斜体       Ctrl+I │
│ S 删除线  Ctrl+Shift+X│
│ <> 行内代码   Ctrl+E │
│ 🔗 插入链接   Ctrl+K │
└──────────────────────┘
```

### 菜单项层级（P0）
- **编辑器（edit / live）**
  ```
  撤销 / 重做
  剪切 / 复制 / 粘贴 / 全选
  加粗 / 斜体 / 删除线 / 行内代码 / 插入链接
  ```
- **文件树 · 文件**
  ```
  打开
  在资源管理器中显示
  复制路径
  ──
  重命名
  删除
  ```
- **文件树 · 目录**
  ```
  打开
  新建文件
  新建文件夹
  复制路径
  ──
  重命名
  删除
  ```
- **标签页**
  ```
  关闭
  关闭其他
  关闭右侧标签
  关闭左侧标签
  关闭全部
  ──
  复制路径
  在资源管理器中显示
  ```

## 6. 对现有功能的影响与风险

- **风险 1**：禁用 CM 原生菜单会移除原生「粘贴」与可能的拼写检查建议。需在自定义菜单补齐 粘贴 / 剪切 / 复制 / 全选（P0 已含）。本项目 markdown 编辑器默认未开启拼写检查，影响低。
- **风险 2**：自定义「粘贴」到 CM 需用 `dispatch` 插入并保留 undo 栈，不能简单用 `execCommand`。
- **风险 3**：输入框（搜索 / 设置）若也禁用原生菜单，粘贴可靠性下降；**建议保留原生**（见 Q1）。
- **风险 4**：Rust 写文件命令需新增并授权（`capabilities` 已含 `fs(**)` / `dialog`，但缺 rename/delete/create 命令实现）。
- **风险 5**：capture 阶段压制须保持「先于 CM 自身 contextmenu 处理」。建议分工：全局 guard 仍负责 `preventDefault`，CM 扩展负责弹自定义菜单；二者并存不冲突。

## 7. 待确认问题

1. **输入框（搜索框、设置输入、TOC 搜索）是否也要自定义右键菜单**，还是保留原生（**推荐保留原生**以保证粘贴 / 拼写）？
2. 编辑器中是否需要「粘贴为纯文本」等进阶项？
3. **文件树「重命名 / 删除 / 新建文件 / 新建文件夹」是否本期一并实现**（需新增 Rust 命令），还是本期仅做菜单壳、真实操作留待后续？
4. **预览窗格是否需要右键菜单**（P1，待确认必要性）？
5. 自定义菜单是否要求键盘可达（方向键导航）？**默认要求**。
6. 编辑器菜单的「撤销 / 重做 / 剪切 / 复制 / 粘贴 / 全选」是否走 CM 命令（**建议走 CM 命令**以保证 undo 栈与选区一致）还是 Clipboard API？
7. 菜单项随 accent 主题色高亮是否必要？
