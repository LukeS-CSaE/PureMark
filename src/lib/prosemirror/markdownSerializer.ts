/**
 * 单块默认序列化器：基于 prosemirror-markdown 的 `MarkdownSerializer`，针对
 * TipTap 实际 schema 动态构建（只注册 schema 中存在的节点 / 标记类型）。
 *
 * 仅用于「签名变化的块」重生成（未改动块走 sourcePreserving 的字节原样回写）。
 * 表格为 GFM 近似实现：未改动表格因签名匹配而字节保留；仅被编辑的表格走此处
 * 重生成（P4 可进一步对齐风格）。
 */
import { MarkdownSerializer } from "prosemirror-markdown";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";

/* eslint-disable @typescript-eslint/no-explicit-any */
type NodeSerializer = (state: any, node: PMNode, parent: PMNode | null, index: number) => void;
type MarkSerializer = {
  open: string | ((state: any, mark: any) => string);
  close: string | ((state: any, mark: any) => string);
  mixable?: boolean;
  expelEnclosingWhitespace?: boolean;
  expellEnclosingWhitespace?: boolean;
};

const NODE_SERIALIZERS: Record<string, NodeSerializer> = {
  text(state, node) {
    state.text(node.text ?? "");
  },
  paragraph(state, node) {
    state.renderInline(node);
    state.closeBlock(node);
  },
  heading(state, node) {
    const level = (node.attrs.level as number) ?? 1;
    state.write(state.repeat("#", level) + " ");
    state.renderInline(node);
    state.closeBlock(node);
  },
  blockquote(state, node) {
    state.wrapBlock("> ", null, node, () => state.renderContent(node));
  },
  codeBlock(state, node) {
    const params = (node.attrs.params as string) ?? (node.attrs.language as string) ?? "";
    state.write("```" + params + "\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  },
  horizontalRule(state, node) {
    state.write((node.attrs.markup as string) || "---");
    state.closeBlock(node);
  },
  bulletList(state, node) {
    const bullet = (node.attrs.bullet as string) || "-";
    state.renderList(node, "  ", () => bullet + " ");
  },
  orderedList(state, node) {
    const start = (node.attrs.start as number) || 1;
    const maxW = String(start + node.childCount - 1).length;
    const space = state.repeat(" ", maxW + 2);
    state.renderList(node, space, (i: number) => String(start + i).padStart(maxW, " ") + ". ");
  },
  listItem(state, node) {
    state.renderContent(node);
  },
  hardBreak(state, node) {
    state.write("\\");
    state.closeBlock(node);
  },
  image(state, node) {
    const alt = state.esc((node.attrs.alt as string) ?? "");
    const src = (node.attrs.src as string) ?? "";
    const title = node.attrs.title ? ` "${(node.attrs.title as string)}"` : "";
    state.write(`![${alt}](${src}${title})`);
  },
  table(state, node) {
    const colCount = node.firstChild ? node.firstChild.childCount : 0;
    let rowIdx = 0;
    node.forEach((row) => {
      const cells: string[] = [];
      row.forEach((cell) => cells.push(cell.textContent));
      state.write("| " + cells.join(" | ") + " |");
      state.ensureNewLine();
      if (rowIdx === 0) {
        state.write("| " + Array(colCount).fill("---").join(" | ") + " |");
        state.ensureNewLine();
      }
      rowIdx++;
    });
    state.closeBlock(node);
  },
  tableRow(state, node) {
    state.renderContent(node);
  },
  tableCell(state, node) {
    state.renderInline(node);
  },
  tableHeader(state, node) {
    state.renderInline(node);
  },
  taskList(state, node) {
    state.renderContent(node);
  },
  taskItem(state, node) {
    const checked = node.attrs.checked ? "x" : " ";
    state.write(`- [${checked}] `);
    // 任务项内容通常是单个 paragraph，行内渲染以保持 `- [ ] label` 同行。
    node.forEach((child) => {
      if (child.type.name === "paragraph") state.renderInline(child);
      else state.renderContent(child);
    });
    state.closeBlock(node);
  },
};

const MARK_SERIALIZERS: Record<string, MarkSerializer> = {
  bold: { open: "**", close: "**", mixable: true, expelEnclosingWhitespace: true },
  italic: { open: "*", close: "*", mixable: true, expelEnclosingWhitespace: true },
  strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
  code: { open: "`", close: "`", mixable: false, expellEnclosingWhitespace: true },
  link: {
    open: () => "[",
    close: (_state, mark) => {
      const href = (mark.attrs.href as string) ?? "";
      const title = mark.attrs.title ? ` "${(mark.attrs.title as string)}"` : "";
      return `](${href}${title})`;
    },
    mixable: true,
  },
};

export function buildMarkdownSerializer(schema: Schema): MarkdownSerializer {
  const nodes: Record<string, NodeSerializer> = {};
  for (const name of Object.keys(NODE_SERIALIZERS)) {
    if (schema.nodes[name]) nodes[name] = NODE_SERIALIZERS[name];
  }
  const marks: Record<string, MarkSerializer> = {};
  for (const name of Object.keys(MARK_SERIALIZERS)) {
    if (schema.marks[name]) marks[name] = MARK_SERIALIZERS[name];
  }
  return new MarkdownSerializer(nodes as any, marks as any);
}

/** 把单个顶层节点包成 doc 后序列化为 markdown。 */
export function serializeNodeToMarkdown(node: PMNode, serializer: MarkdownSerializer): string {
  const schema = node.type.schema;
  const wrapper = schema.nodes.doc.create(null, [node]);
  return serializer.serialize(wrapper);
}
