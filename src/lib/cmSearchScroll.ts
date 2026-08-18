/**
 * CodeMirror 6 专用的搜索跳转滚动工具。
 *
 * 与 `searchScroll.ts`（ProseMirror / 通用 DOM）分离，因为这里直接依赖 CM6 的
 * `EditorView`，不能污染纯逻辑模块（search.ts 在 node 环境下单测，不能引入 CM6）。
 *
 * 关键改进：之前 `scrollToLine` 用 `defaultLineHeight` 手算 `scrollTop`，一旦行高
 * 测不准（未首绘时 defaultLineHeight=0、或 CSS 继承行高与渲染行高不一致）就会整行
 * 偏移，临近两条匹配"串行"。这里改用 CM6 原生 `EditorView.scrollIntoView` +
 * 从真实相邻行块测得的精确行高，坐标换算与边界 clamp 全部交给 CM6，消除手算误差。
 */
import { EditorView } from "@codemirror/view";
import { SEARCH_TARGET_LINE } from "./searchScroll";
import { syncAnnotation } from "./cm/setup";

/** 安全 clamp 偏移到 [0, docLength]（与 useDocSync 的 clampOffset 同逻辑）。 */
function clampOffset(view: EditorView, offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(view.state.doc.length, Math.floor(offset)));
}

/**
 * 精确测量 CM6 渲染行高：取相邻两行块的像素差。
 * 这比 `defaultLineHeight`（未首绘时可能为 0）和 CSS `line-height` 继承解析都准。
 */
export function measureCmLineHeight(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines >= 2) {
    const a = view.lineBlockAt(doc.line(1).from).top;
    const b = view.lineBlockAt(doc.line(2).from).top;
    const d = b - a;
    if (d > 0) return d;
  }
  const dlh = (view as unknown as { defaultLineHeight?: number }).defaultLineHeight;
  if (typeof dlh === "number" && dlh > 0) return dlh;
  const cs = getComputedStyle(view.contentDOM);
  const lh = parseFloat(cs.lineHeight);
  if (!Number.isNaN(lh)) return lh;
  const fs = parseFloat(cs.fontSize) || 16;
  return fs * 1.5;
}

/**
 * 将 CM6 视图滚动到指定源行，使匹配行停在视口第 `targetLine` 行（默认第 4 行）。
 * 可选同时设置选中范围（搜索跳转场景：选中+滚动必须在同一事务，否则 CM6
 * 两次独立 dispatch 之间内部状态/插件可能触发额外滚动覆盖目标位置）。
 *
 * 实现：用原生 `EditorView.scrollIntoView(pos, { y: "start", yMargin: ... })`，
 * 由 CM6 自身负责坐标换算与边界 clamp。第 1~3 行与文档结尾由 CM6 的滚动上限自然
 * 停在顶/底（不强制钉在第 4 行，但"能跳 + 滚动到位"）。
 *
 * @param view       CM6 EditorView
 * @param lineNo     1-based markdown 行号
 * @param match      匹配的 markdown 偏移（用于把精确匹配位置滚到目标行，而非仅行首）
 * @param selection  可选：同事务设置的选中范围 {from, to}。传入时本函数同时完成
 *                   选中+滚动，调用方无需再单独调 setSelection。
 * @param targetLine 匹配行停在第几行（1-based，默认第 4 行）
 */
export function cmScrollToLine(
  view: EditorView,
  lineNo: number,
  match: { start: number; end: number } | undefined,
  options?: {
    /** 同事务设置的选中范围（搜索跳转：选中+滚动合一，防两次 dispatch 串行干扰） */
    selection?: { from: number; to: number };
    /** 匹配行停在第几行（1-based，默认第 4 行） */
    targetLine?: number;
  },
): void {
  const targetLine = options?.targetLine ?? SEARCH_TARGET_LINE;
  const doc = view.state.doc;
  const ln = Math.min(Math.max(1, lineNo), doc.lines);
  const line = doc.line(ln);
  // 滚到匹配位置本身（而非行首），保证选中的匹配文字正好落在目标行。
  const pos = match ? Math.min(Math.max(line.from, match.start), line.to) : line.from;
  const lh = measureCmLineHeight(view);

  // 构建单一事务：选中（可选）+ 滚动效果 + 同步标注
  const sel = options?.selection
    ? { selection: { anchor: clampOffset(view, options.selection.from), head: clampOffset(view, options.selection.to) } }
    : {};

  view.dispatch({
    ...sel,
    effects: EditorView.scrollIntoView(pos, {
      y: "start",
      yMargin: (targetLine - 1) * lh,
    }),
    annotations: syncAnnotation.of(true),
  });
}
