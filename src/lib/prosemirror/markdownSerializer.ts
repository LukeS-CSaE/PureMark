/**
 * 单块默认序列化器：基于 prosemirror-markdown 的 `MarkdownSerializer`，针对
 * TipTap 实际 schema 动态构建（只注册 schema 中存在的节点 / 标记类型）。
 *
 * 仅用于「签名变化的块」重生成（未改动块走 sourcePreserving 的字节原样回写）。
 * 表格为 GFM 近似实现：未改动表格因签名匹配而字节保留；仅被编辑的表格走此处
 * 重生成（P4 可进一步对齐风格）。
 */
import { MarkdownSerializer } from "prosemirror-markdown";
import type { Mark, Node as PMNode, Schema } from "@tiptap/pm/model";

/* eslint-disable @typescript-eslint/no-explicit-any */
type NodeSerializer = (state: any, node: PMNode, parent: PMNode | null, index: number) => void;
type MarkSerializer = {
  open: string | ((state: any, mark: any) => string);
  close: string | ((state: any, mark: any) => string);
  mixable?: boolean;
  expelEnclosingWhitespace?: boolean;
  expellEnclosingWhitespace?: boolean;
};

/** 单元格内文本：GFM 表格单元格只能单行，竖线必须转义。 */
function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

/** 行内标记包裹（与 MARK_SERIALIZERS 同语法，但输出到单元格单行内）。 */
function applyMarks(text: string, marks: readonly Mark[]): string {
  let t = escapeCell(text);
  for (const mark of marks) {
    switch (mark.type.name) {
      case "bold":
        t = `**${t}**`;
        break;
      case "italic":
        t = `*${t}*`;
        break;
      case "strike":
        t = `~~${t}~~`;
        break;
      case "code":
        t = `\`${t}\``;
        break;
      case "link": {
        const href = (mark.attrs.href as string) ?? "";
        const title = mark.attrs.title ? ` "${mark.attrs.title as string}"` : "";
        t = `[${t}](${href}${title})`;
        break;
      }
    }
  }
  return t;
}

/** 行内内容 → markdown（hardBreak 输出 `<br>`，保留单元格换行语义）。 */
function inlineToMarkdown(node: PMNode): string {
  let out = "";
  node.forEach((child) => {
    if (child.isText) {
      out += applyMarks(child.text ?? "", child.marks);
    } else if (child.type.name === "hardBreak") {
      out += "<br>";
    } else if (child.type.name === "image") {
      const alt = escapeCell((child.attrs.alt as string) ?? "");
      const src = (child.attrs.src as string) ?? "";
      const title = child.attrs.title ? ` "${child.attrs.title as string}"` : "";
      out += `![${alt}](${src}${title})`;
    } else {
      out += inlineToMarkdown(child);
    }
  });
  return out;
}

/** 单个列表项 → `前缀 + 内容`；嵌套列表打平为同级条目（GFM 单元格无法表达嵌套）。 */
function listItemToMarkdown(item: PMNode, marker: string): string {
  const prefix =
    item.type.name === "taskItem" ? (item.attrs.checked ? "- [x] " : "- [ ] ") : `${marker} `;
  const segs: string[] = [];
  item.forEach((child) => {
    if (child.type.name === "paragraph" || child.type.name === "heading") {
      segs.push(inlineToMarkdown(child));
    } else if (child.type.name === "bulletList" || child.type.name === "taskList") {
      child.forEach((sub) => segs.push(listItemToMarkdown(sub, "-")));
    } else if (child.type.name === "orderedList") {
      const start = (child.attrs.start as number) || 1;
      child.forEach((sub, _offset, i) => segs.push(listItemToMarkdown(sub, `${start + i}.`)));
    } else {
      segs.push(escapeCell(child.textContent));
    }
  });
  return prefix + segs.join("<br>");
}

/**
 * 单元格内容 → GFM 单元格单行文本：块级内容（段落/列表）以 `<br>` 拼接。
 * 与解析侧 html:true 对应：源文档单元格里的 `<br>` 换行与 `<ul>` 嵌列表经
 * 编辑后重序列化时不丢失（防脏写：未编辑表格仍走字节原样回写，不受此处影响）。
 */
function cellToMarkdown(cell: PMNode): string {
  const parts: string[] = [];
  cell.forEach((child) => {
    if (child.type.name === "paragraph" || child.type.name === "heading") {
      parts.push(inlineToMarkdown(child));
    } else if (child.type.name === "bulletList" || child.type.name === "taskList") {
      child.forEach((item) => parts.push(listItemToMarkdown(item, "-")));
    } else if (child.type.name === "orderedList") {
      const start = (child.attrs.start as number) || 1;
      child.forEach((item, _offset, i) => parts.push(listItemToMarkdown(item, `${start + i}.`)));
    } else {
      parts.push(escapeCell(child.textContent));
    }
  });
  return parts.join("<br>");
}

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
      // 单元格走 cellToMarkdown：<br> 换行 / 列表 / 标记保留（旧版 textContent 会丢格式）。
      const cells: string[] = [];
      row.forEach((cell) => cells.push(cellToMarkdown(cell)));
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

// 表格单元格序列化辅助函数导出供单测（无 DOM 依赖）。
export const tableCellInternals = {
  cellToMarkdown,
  inlineToMarkdown,
  listItemToMarkdown,
  escapeCell,
};

/** 把单个顶层节点包成 doc 后序列化为 markdown。 */
export function serializeNodeToMarkdown(node: PMNode, serializer: MarkdownSerializer): string {
  const schema = node.type.schema;
  const wrapper = schema.nodes.doc.create(null, [node]);
  return serializer.serialize(wrapper);
}
