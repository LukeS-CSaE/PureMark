/**
 * 行级实时渲染的块划分 (live preview rewrite, line-decoration 方案).
 *
 * 与旧版 widget-replacement 方案的根本差异: 不再用 `marked.parse` 把整行
 * 替换为 HTML widget, 而是**仅识别每个块的类型**, 由 `livePreview.ts`
 * 给每行加一个 `LineDecoration` (CSS class), 字号 / 字重 / 缩进 / 引用线
 * 全部由 CSS 驱动.
 *
 * 优势:
 *   - 光标始终在可编辑文本内, 编辑时字号自动保持渲染大小 (用户核心需求)
 *   - 语法标记 `#` `**` `>` 等**始终可见** (由 cm-tok-md-* 类淡显, 用户已
 *     确认接受)
 *   - 无 RangeSetBuilder 嵌套 mark 排序问题 (LineDecoration 无 from/to 顺序
 *     约束)
 *   - 无 widget / click 坐标错位 bug
 *
 * 取舍: 多行结构 (列表 / 引用 / 段落软换行) 按行独立装饰, 无跨行
 * `<ul>` / `<blockquote>` 容器 (与旧方案相同的固有代价).
 */
import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/**
 * 块的语义类型. heading 拆出 level (1-6), 因为 H1-H6 字号不同, 必须由
 * 不同的 CSS class 驱动 (.cm-md-block-h1 ~ .cm-md-block-h6).
 */
export type BlockKind =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { kind: "paragraph" }
  | { kind: "list" }
  | { kind: "blockquote" }
  | { kind: "code" }
  | { kind: "hr" }
  | { kind: "table" };

/** 一个 Markdown 块, 即语法树中顶层的一个 block-level 节点. */
export interface Block {
  kind: BlockKind;
  /** 块在源文档中的绝对 offset. */
  from: number;
  to: number;
  /** 块覆盖的 1-based 行号范围 (含). */
  startLine: number;
  endLine: number;
}

/** 走顶层 children, 把每个 block-level 节点转成 Block. */
export function collectBlocks(state: EditorState): Block[] {
  const blocks: Block[] = [];
  const root = syntaxTree(state).topNode;
  let cursor: SyntaxNode | null = root.firstChild;
  while (cursor) {
    const block = nodeToBlock(state, cursor);
    if (block) blocks.push(block);
    cursor = cursor.nextSibling;
  }
  return blocks;
}

function nodeToBlock(state: EditorState, node: SyntaxNode): Block | null {
  const kind = kindFromNodeName(node.name);
  if (!kind) return null;
  const startLine = state.doc.lineAt(node.from).number;
  const endLine = state.doc.lineAt(node.to).number;
  return { kind, from: node.from, to: node.to, startLine, endLine };
}

function kindFromNodeName(name: string): BlockKind | null {
  switch (name) {
    case "ATXHeading1":
    case "SetextHeading1":
      return { kind: "heading", level: 1 };
    case "ATXHeading2":
    case "SetextHeading2":
      return { kind: "heading", level: 2 };
    case "ATXHeading3":
      return { kind: "heading", level: 3 };
    case "ATXHeading4":
      return { kind: "heading", level: 4 };
    case "ATXHeading5":
      return { kind: "heading", level: 5 };
    case "ATXHeading6":
      return { kind: "heading", level: 6 };
    case "Paragraph":
      return { kind: "paragraph" };
    case "BulletList":
    case "OrderedList":
      return { kind: "list" };
    case "Blockquote":
      return { kind: "blockquote" };
    case "FencedCode":
    case "CodeBlock":
      return { kind: "code" };
    case "HorizontalRule":
      return { kind: "hr" };
    case "Table":
      return { kind: "table" };
    default:
      return null;
  }
}

/** 找到包含 lineNumber 的块, 没有则 null. */
export function findBlockByLine(
  blocks: ReadonlyArray<Block>,
  lineNumber: number,
): Block | null {
  for (const b of blocks) {
    if (lineNumber >= b.startLine && lineNumber <= b.endLine) return b;
  }
  return null;
}

/**
 * 把 BlockKind 映射为 CSS class 名 (无 `.` 前缀). paragraph / table 返回
 * null (使用默认正文样式, 不加额外 class).
 */
export function blockClass(kind: BlockKind): string | null {
  switch (kind.kind) {
    case "heading":
      return `cm-md-block-h${kind.level}`;
    case "list":
      return "cm-md-block-list";
    case "blockquote":
      return "cm-md-block-quote";
    case "code":
      return "cm-md-block-code";
    case "hr":
      return "cm-md-block-hr";
    case "paragraph":
    case "table":
      return null;
  }
}
