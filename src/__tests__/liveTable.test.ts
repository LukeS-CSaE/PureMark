/**
 * live 视图表格支持回归测试（无需 DOM：用 getSchema 验证 schema + 序列化器）。
 *
 * 复现 issue：live 视图下 GFM 表格无法解析/显示 —— 根因是 TipTap 扩展未注册
 * `@tiptap/extension-table`，schema 无 table 节点，tiptap-markdown 解析表格后无处安放。
 */
import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { buildEditorExtensions } from "../lib/prosemirror/editorExtensions";
import { buildMarkdownSerializer, serializeNodeToMarkdown } from "../lib/prosemirror/markdownSerializer";
import { serializeSourcePreserving } from "../lib/prosemirror/sourcePreserving";

function buildTable(schema: Schema, rows: string[][], firstIsHeader: boolean) {
  const cell = (text: string, isHeader: boolean) =>
    (isHeader ? schema.nodes.tableHeader : schema.nodes.tableCell).create(null, [
      schema.nodes.paragraph.create(null, text ? schema.text(text) : null),
    ]);
  const rowNode = (cells: string[], isHeaderRow: boolean) =>
    schema.nodes.tableRow.create(
      null,
      cells.map((t) => cell(t, isHeaderRow)),
    );
  const rowNodes = rows.map((cells, ri) => rowNode(cells, firstIsHeader && ri === 0));
  return schema.nodes.table.create(null, rowNodes);
}

describe("live view table support", () => {
  const schema = getSchema(buildEditorExtensions());
  const serializer = buildMarkdownSerializer(schema);

  it("registers table node family in the editor schema", () => {
    for (const n of ["table", "tableRow", "tableHeader", "tableCell"]) {
      expect(schema.nodes[n]).toBeTruthy();
    }
  });

  it("serializes a table node back to GFM markdown", () => {
    const table = buildTable(schema, [["A", "B"], ["1", "2"]], true);
    const md = serializeNodeToMarkdown(table, serializer);
    expect(md).toContain("|");
    expect(md).toContain("A");
    expect(md).toContain("B");
    expect(md).toContain("---"); // 分隔行
  });

  it("preserves an unmodified table block byte-for-byte (source-preserving)", () => {
    const original = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const table = buildTable(schema, [["A", "B"], ["1", "2"]], true);
    const doc = schema.nodes.doc.create(null, [table]);
    const result = serializeSourcePreserving(doc, doc, original, (n) =>
      serializeNodeToMarkdown(n, serializer),
    );
    expect(result.matched).toBe(true);
    expect(result.markdown).toBe(original);
  });

  it("regenerates an edited table (does not drop content)", () => {
    const original = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const originalDoc = schema.nodes.doc.create(null, [buildTable(schema, [["A", "B"], ["1", "2"]], true)]);
    const editedDoc = schema.nodes.doc.create(null, [buildTable(schema, [["A", "B"], ["9", "9"]], true)]);
    const result = serializeSourcePreserving(editedDoc, originalDoc, original, (n) =>
      serializeNodeToMarkdown(n, serializer),
    );
    expect(result.matched).toBe(true);
    expect(result.markdown).toContain("9");
    expect(result.markdown).not.toContain("| 1 | 2 |");
  });
});
