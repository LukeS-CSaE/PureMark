# MarkText 实时编辑方案对标与可借鉴点

> 调研日期：2026-09-08 ｜ 对标对象：https://github.com/marktext/marktext
> 结论用途：为 PureMark 的 live 视图（TipTap/ProseMirror）寻找可直接替换/增强的实现方案。

## 背景

MarkText 是 Electron + Vue 3 的 Markdown 编辑器，其"实时预览"不是给 Markdown 源码套装饰层，而是**真·所见即所得**：输入 `## ` 后标记立刻消失、标题立刻成型（Typora 同款）。实现它靠的是自研编辑器内核 **muya**，不是 CodeMirror，也不是 ProseMirror。

研究其方案的价值在于：我们 live 视图走的是 TipTap/ProseMirror，与 muya 属于同一大类（文档模型 + 投影渲染），因此它的周边工程做法（搜索、UI 插件、规范测试、选区桥接）可以直接迁移，而它的内核不值得替换。

## 一、MarkText / muya 的实现拆解

### 1.1 双引擎，而非单引擎

| 视图 | 引擎 | 说明 |
| --- | --- | --- |
| 所见即所得 / 实时预览 | **muya**（自研） | 块级编辑器内核，容器 `contenteditable=true` |
| 源码模式 | CodeMirror 5 | 纯文本 Markdown 编辑 |

两者是**互斥的两个编辑器实例**，切换时销毁/重建并迁移光标。这块是它的 bug 重灾区（sourceCode ↔ normal 切换的 cursor、块状态、`lastEditIndex` 恢复，历史提交里大量修复）。

### 1.2 muya 的分层

仓库里现在有两代 muya 并存：

- **legacy `packages/muyajs`**（v1，JS）：`ContentState` 块树 + mixin 式 controller（`inputCtrl` / `backspaceCtrl` / `updateCtrl` / `formatCtrl` / `paragraphCtrl` / `pasteCtrl` / `tableBlockCtrl`）+ `EventCenter` 事件总线 + `StateRender`（snabbdom）+ `Selection`。
- **v2 `packages/muya`**（`@muyajs/core`，TS 重写）：`EventCenter` / `Editor` / `JSONState`（ot-json1 文档，唯一真值）/ `InlineRenderer`（自定义 lexer + snabbdom）/ `Selection`（选区桥接到 JSON path）/ `Search` / `Clipboard`（turndown ↔ marked）/ `History`（OT-aware）/ `ScrollPage`（根块）/ `Ui`（浮动工具注册表）/ `I18n`。

架构树（来自 v2 README）：

```
Muya
├── EventCenter   自定义 pub/sub
├── Editor        持有运行时模块、路由 DOM 事件
│   ├── JSONState      ot-json1 文档，source of truth
│   ├── InlineRenderer 自定义 lexer + snabbdom vDOM
│   ├── Selection      实时选区桥接到 JSON path
│   ├── Search         正则搜索 + highlight overlay
│   ├── Clipboard      turndown / marked 桥接
│   ├── History        OT-aware undo/redo
│   └── ScrollPage     块树根块
├── Ui            浮动工具/菜单注册表
└── I18n          locale 分发
```

### 1.3 "实时"是怎么做到的

1. 容器 `contenteditable=true`，但**不信任浏览器对 DOM 的修改**：
   拦截 `beforeinput` / `keydown` / `input` / composition 事件。
2. 事件转成**对块树的操作**（createBlock / removeBlock / 改 type / 改 text），标记该块为 dirty。
3. **语法符号的消失是数据层转换，不是 CSS 隐藏**：`updateCtrl` 用正则命中行首 Markdown 语法（`## `、`> `、`- `、` ``` ` 等），直接把当前块的 `type` 改成 heading/blockquote/list/code，**同时从 text 里删掉 marker**，再重渲染该块。
4. **只 patch 脏块**：snabbdom 对单个 block 做 vDOM diff，不重排整篇文档。
5. 渲染后用 `Selection` 模块把光标放回块内对应偏移（v2 用 `{anchor, focus, path}` 描述）。
6. `MutationObserver` 兜底检测 DOM 异常（编辑器崩溃探测）。

### 1.4 它的致命弱点（我们已解决）

muya 的块树**不保存原始文本**。官方 issue #2189 的原话：

> we don't store the document as string with spaces etc but as block structure with minimal information. As a side effect, we need to build the text file when saving the document.

后果（#2189 / #1354）：

- 保存时全文档重写 → 空行被压成一个、列表符号被规范化、setext 标题被改写、脚注被移到文末、表格单元格被重排
- 打开文件即被标记为 modified，Git diff 一片红
- 官方 TODO 至今未完成：保留原列表风格、保留原有序列表编号、SetExt heading 计数、脚注位置、不重排表格单元格

**PureMark 现状**：`src/lib/prosemirror/sourceSlice.ts` 按顶层块切片保留 `src` + `charStart/charEnd`，`sourcePreserving.ts` 用「类型 + attrs + 纯文本」签名比对，未改动块字节原样回写，分隔符按字符偏移精确截取。**这块我们领先，属于优势项，不可回退。**

## 二、可借鉴 / 可替换的点（按 ROI 排序）

### S 级：直接解决我们现有架构债

#### 1. 把搜索/替换下沉到 PM 文档内（对标 `Search` + `selection-change {anchor, focus, path}`）

**我们的现状债**（见 `.workbuddy/memory/MEMORY.md` §6）：`findMatches` 在 Markdown 纯文本上算字符偏移，但 live/preview 是 PM 渲染，Markdown 偏移 ≠ PM 位置，只能靠 `locateMatchText`（DOM 文本匹配 + `lineText` 消歧）+ `scrollElementToLine` 现测行高兜底。这是当前最脆的一环。

**换法**：

- 在 PM doc 上直接遍历文本节点收集匹配，`pos` 天然准确，无需任何消歧；
- 高亮复用现有 `searchHighlight` PM decoration；
- 替换用 `tr.insertText` / `tr.replaceWith`，顺带把**替换功能**补上（我们现在没有）；
- `searchScroll.ts` 可以改用 `view.coordsAtPos(pos)` 定位，删掉行高测量逻辑。

**收益**：删掉 `locateMatchText` 全部消歧逻辑、删掉 cm/PM 双套滚动实现、新增 replace 能力。
**代价**：edit 视图（CM6）仍走字符偏移（那边天然准确），需要保持两套实现但统一接口。

#### 2. UI 插件注册表架构（对标 `Muya.use(Plugin)` + `Ui` registry）

muya 提供一批 opt-in 浮动工具：`InlineFormatToolbar`（选中即出格式栏）、`ParagraphFrontButton` / `ParagraphFrontMenu`（块首 ⋮⋮ 手柄）、`ParagraphQuickInsertMenu`（slash 菜单）、`TableDragBar` / `TableColumnToolbar`、`ImageToolBar` / `ImageResizeBar` / `ImageEditTool`、`LinkTools`、`FootnoteTool`、`CodeBlockLanguageSelector`、`EmojiSelector`。

我们 live 视图目前是"裸"的，一个都没有。

**换法**：新建 `src/lib/prosemirror/ui/` + 扩展注册表，先落两个：

- `InlineFormatToolbar`：TipTap 生态有等价物 `@tiptap/extension-bubble-menu`，成本低；
- `ParagraphFrontMenu`：块首手柄，TipTap 用 `ReactNodeViewRenderer` + `NodeViewWrapper` 可做，或直接用 `dragHandle` 插件思路。

**收益**：这是 live 视图"像 Typora"体感差异最大的部分，且是抄架构不抄代码，工作量可控。

#### 3. 规范一致性测试基线（对标 1347 条 CommonMark 0.31 + GFM 0.29 conformance）

muya v2 拿 CommonMark / GFM spec 当测试基线跑，1347/1347 通过。

**我们的缺口**：`markdownSerializer.ts` 只重生成「签名变化的块」，没有任何规范守护，改错了没人知道。

**换法**：引入 spec 用例集，跑 round-trip 幂等断言：

```
serialize(parse(md)) === serialize(parse(serialize(parse(md))))
```

再对 spec 的 expected HTML 做差异白名单。这是**能立刻上、且能防回归**的，建议优先于任何新功能。

### A 级：值得做

#### 4. 视图切换时的选区 / 撤销栈迁移（对标 `setMarkdown(markdown, cursor)` + OT-aware History）

**现状**：edit(CM6) 与 live(PM) 各一套 undo 栈，跨视图历史断裂。

**换法**（不做完整 OT，成本太高）：

- 用 **Markdown 字符偏移作为中介坐标**做一次投影：PM pos → 块 index + 块内偏移 → Markdown offset → CM6 pos；
- 抽出 `src/lib/prosemirror/posBridge.ts` 承载这层；
- 切换视图时归档 undo 栈（切回时不可 undo，但至少不会出现"撤销到上一个视图的编辑"这种诡异行为）。

#### 5. 块级增量渲染纪律（对标"只 patch 脏块"）

PM 本身是增量的，但 **`MarkdownView.tsx:198` 的 `editor.commands.setContent(content || "", false)` 是全量重灌**——外部文件变更时整篇重建，光标与滚动位置全丢。

**换法**：外部变更时先 diff 出变化的顶层块，只对这些块做 `tr.replaceWith(range, node)`；仅当块数不等或签名全变时才退回 `setContent`。

**附带收益**：memory 里记的"live 点击后装饰消失 bug（根因未复现）"很可能就是全量重灌的副作用，这条纪律能顺带收敛它。

#### 6. Preview 与 live 共用单一渲染出口（对标 `MarkdownToHtml` / `renderToStaticHTML`）

我们 `MarkdownView` 已经用同一 schema、同一 CSS 服务 live(editable) 与 preview(readonly)，**这点比 marktext 做得好**（marktext 的 preview 是另一条链路）。可再前进一步：把静态渲染抽成纯函数 `renderToStaticHTML(stateOrMarkdown, opts)`，供导出 HTML/PDF 复用，避免导出样式与预览漂移。

### B 级：抄思路

| 点 | muya 做法 | 我们的可行动作 |
| --- | --- | --- |
| 剪贴板 | `turndown`（HTML→MD）+ `marked`（MD→HTML）双向桥接 | 粘贴富文本改用 turndown 预处理，比 PM clipboard parser 更可控 |
| TOC | `getTOC()` 由文档模型直接产出 | 对齐成"从 PM doc 出 TOC"单一来源，避免 edit/live/preview 三处不一致 |
| IME | `recordIsComposed()` 单独记录组合输入 | 中文输入是重灾区，需核查 CM6 与 PM 两侧的 composition 处理 |
| XSS | 输出过 DOMPurify（`sanitizeHyperlink` + `isValidAttribute`） | 确认我们 preview 的 HTML 注入路径有同等防护 |

## 三、不建议照搬

| 项 | 原因 |
| --- | --- |
| 换自研引擎替代 TipTap | muya 迭代 4 年以上、上百个 controller 文件；v2 README 自述 "not yet recommended for production use"，且原仓库已归档 |
| 引入 ot-json1 做协同 | 我们无协同需求，白付复杂度 |
| 放弃字节保真 | marktext 的头号痛点，我们的 `sourcePreserving` 是优势 |
| 双引擎互斥切换 | marktext 视图切换是 bug 重灾区；我们 edit/live/preview 共享 `MarkdownView` 同 schema 同 CSS，架构更优，保持 |

## 四、待确认项

1. **S 级第 1 项（搜索下沉 PM）是否要连带把 edit 视图的搜索也改成统一接口？** 两套实现并存会增加维护面，需要定接口边界。
2. **是否引入 `@tiptap/extension-bubble-menu`？** 需确认它与现有 `contextMenuGuard.ts`（全局禁用右键）和亚克力弹层无冲突。
3. **CommonMark spec 用例集如何引入？** 直接用 `commonmark-spec` npm 包，还是解析 `spec.txt`，需确认许可证与体积。
4. **`MarkdownView` 全量 `setContent` 的改造范围**：外部文件变更检测目前在哪一层、能否拿到可靠的块级 diff 输入。
