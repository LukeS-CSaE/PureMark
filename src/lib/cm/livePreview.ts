/**
 * 行级实时渲染的 `ViewPlugin` (line-decoration 方案).
 *
 * 核心思路: 把文档按 syntaxTree 的顶层 block-level 节点切块, 给每行
 * 加一个 `LineDecoration` (CSS class), 字号 / 字重 / 缩进 / 引用线全部
 * 由 `live.css` 的 `.cm-md-block-*` 规则驱动. 光标始终在可编辑文本内,
 * 因此:
 *   - 编辑已渲染文本时字号自动保持 (用户核心需求)
 *   - 语法标记 `#` `**` `>` 始终可见 (由 `cm-tok-md-*` 类淡显)
 *   - 无 widget / click 坐标错位 bug
 *   - 无 `.cm-live` 自愈补丁
 *
 * 与旧 widget-replacement 方案的根本差异: 不再 `marked.parse` 整行 HTML,
 * 也不再 `Decoration.replace` 替换文本. `LineDecoration` 只设置属性 / 类,
 * 不改文本内容, 因此 RangeSetBuilder 没有 from/to 顺序问题, 也没有光标
 * 跳段问题.
 */
import { Decoration, EditorView, ViewPlugin } from "@codemirror/view";
import { syntaxTreeAvailable } from "@codemirror/language";
import { RangeSetBuilder, type EditorState } from "@codemirror/state";
import type { DecorationSet, PluginValue, ViewUpdate } from "@codemirror/view";

import {
  blockClass,
  collectBlocks,
  type Block,
} from "./liveRender";

/* -------------------------------------------------------------------------- *
 * Plugin
 * -------------------------------------------------------------------------- */

class LivePreviewPlugin implements PluginValue {
  decorations: DecorationSet = Decoration.none;
  private forceNext = false;

  constructor(private readonly view: EditorView) {
    console.log("[livePreview] constructor");
    this.rebuild();
    console.log("[livePreview] initial decorations", this.decorations.size);
    if (this.decorations.size === 0) this.forceNext = true;
  }

  update(update: ViewUpdate): void {
    // IME composition 中不要重建 (避免装饰闪烁干扰候选框).
    if (update.view.composing) {
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    const treeReady = syntaxTreeAvailable(update.state, update.state.doc.length);
    if (
      this.forceNext ||
      update.docChanged ||
      update.viewportChanged ||
      !treeReady
    ) {
      if (this.forceNext) console.log("[livePreview] update triggered by forceNext");
      if (update.docChanged) console.log("[livePreview] update triggered by docChanged");
      if (update.viewportChanged) console.log("[livePreview] update triggered by viewportChanged");
      if (!treeReady) console.log("[livePreview] update triggered by tree not ready");
      this.forceNext = false;
      this.rebuild();
    }
  }

  private rebuild(): void {
    const state = this.view.state;
    const docLen = state.doc.length;
    if (docLen === 0) {
      this.decorations = Decoration.none;
      console.log("[livePreview] rebuild empty doc");
      return;
    }
    if (!syntaxTreeAvailable(state, docLen)) {
      this.forceNext = true;
      // 保留现有装饰，避免 tree 未就绪时装饰集被清空 → 样式闪烁/消失.
      this.decorations = this.decorations.map(state.changes());
      console.log("[livePreview] rebuild tree not ready, keep existing", this.decorations.size);
      return;
    }

    const blocks = collectBlocks(state);
    const builder = new RangeSetBuilder<Decoration>();
    for (const block of blocks) {
      addBlockLineDecorations(builder, state, block);
    }
    this.decorations = builder.finish();
    console.log("[livePreview] rebuild ok", this.decorations.size, "blocks", blocks.length);
  }
}

/**
 * 给一个块里每一行加 `LineDecoration` (CSS class). 空行也加, 保持块的
 * 视觉连续性 (例如 H2 下边框不被空行打断).
 *
 * LineDecoration 用 `line.from` 作为插入点, 不需要 from/to 区间, 因此
 * RangeSetBuilder.add 不会因 from 顺序问题报错 — 多个 line.from 严格
 * 递增即可, 文档行号天然递增.
 */
function addBlockLineDecorations(
  builder: RangeSetBuilder<Decoration>,
  state: EditorState,
  block: Block,
): void {
  const cls = blockClass(block.kind);
  if (!cls) return; // paragraph / table: 使用默认正文样式, 无额外 class
  for (let ln = block.startLine; ln <= block.endLine; ln++) {
    const line = state.doc.line(ln);
    const deco = Decoration.line({
      attributes: { class: cls },
    });
    builder.add(line.from, line.from, deco);
  }
}

/* -------------------------------------------------------------------------- *
 * Module exports
 * -------------------------------------------------------------------------- */

export const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (plugin) => plugin.decorations,
});

/** 兼容旧 import: liveCompartment 用 []. */
export const noDecorations = Decoration.none;
