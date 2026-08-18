/**
 * 表格单元格序列化测试（无 DOM 依赖）。
 *
 * 背景：用户文档表格单元格内普遍用 `<br>` 换行、列表条目承载多行信息。
 * 解析侧 html:true 把 `<br>` 解析为 hardBreak、`<ul>` 解析为列表节点；
 * 本测试锁定重序列化（编辑过的表格）时这些格式不丢失：
 * - hardBreak → `<br>`；
 * - bulletList / orderedList / taskList → `- ` / `1. ` / `- [x] ` 前缀条目，`<br>` 拼接；
 * - 竖线转义、marks 保留。
 */
import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { buildEditorExtensions } from "../lib/prosemirror/editorExtensions";
import {
  buildMarkdownSerializer,
  serializeNodeToMarkdown,
  tableCellInternals,
} from "../lib/prosemirror/markdownSerializer";

const schema = getSchema(buildEditorExtensions());
const { cellToMarkdown, escapeCell } = tableCellInternals;

const para = (...children: PMNode[]) => schema.nodes.paragraph.create(null, children);
const text = (t: string, marks?: PMNode["marks"]) => schema.text(t, marks);

function cell(...blocks: PMNode[]): PMNode {
  return schema.nodes.tableCell.create(null, blocks);
}

describe("cellToMarkdown（单元格 → GFM 单行）", () => {
  it("段落内 hardBreak 输出 <br>", () => {
    const c = cell(para(text("第一行"), schema.nodes.hardBreak.create(), text("第二行")));
    expect(cellToMarkdown(c)).toBe("第一行<br>第二行");
  });

  it("段落 + bulletList 以 <br> 拼接并保留列表前缀", () => {
    const list = schema.nodes.bulletList.create(null, [
      schema.nodes.listItem.create(null, [para(text("条目一"))]),
      schema.nodes.listItem.create(null, [para(text("条目二"))]),
    ]);
    const c = cell(para(text("说明")), list);
    expect(cellToMarkdown(c)).toBe("说明<br>- 条目一<br>- 条目二");
  });

  it("orderedList 输出数字前缀", () => {
    const list = schema.nodes.orderedList.create(null, [
      schema.nodes.listItem.create(null, [para(text("步一"))]),
      schema.nodes.listItem.create(null, [para(text("步二"))]),
    ]);
    expect(cellToMarkdown(cell(list))).toBe("1. 步一<br>2. 步二");
  });

  it("taskList 输出勾选状态", () => {
    const list = schema.nodes.taskList.create(null, [
      schema.nodes.taskItem.create({ checked: true }, [para(text("已完成"))]),
      schema.nodes.taskItem.create({ checked: false }, [para(text("待办"))]),
    ]);
    expect(cellToMarkdown(cell(list))).toBe("- [x] 已完成<br>- [ ] 待办");
  });

  it("竖线转义且 marks 保留", () => {
    const bold = schema.marks.bold.create();
    const c = cell(para(text("a|b", [bold])));
    expect(cellToMarkdown(c)).toBe("**a\\|b**");
  });

  it("escapeCell 只转义竖线", () => {
    expect(escapeCell("x|y|z")).toBe("x\\|y\\|z");
  });
});

describe("整表序列化（buildMarkdownSerializer）", () => {
  it("单元格 <br> 与列表在重序列化后保留", () => {
    const header = schema.nodes.tableRow.create(null, [
      schema.nodes.tableHeader.create(null, [para(text("列一"))]),
      schema.nodes.tableHeader.create(null, [para(text("列二"))]),
    ]);
    const row = schema.nodes.tableRow.create(null, [
      cell(para(text("标题"), schema.nodes.hardBreak.create(), text("* 条目"))),
      cell(
        para(text("说明")),
        schema.nodes.bulletList.create(null, [
          schema.nodes.listItem.create(null, [para(text("子项 A"))]),
          schema.nodes.listItem.create(null, [para(text("子项 B"))]),
        ]),
      ),
    ]);
    const table = schema.nodes.table.create(null, [header, row]);
    const serializer = buildMarkdownSerializer(schema);
    const md = serializeNodeToMarkdown(table, serializer);
    expect(md).toContain("| 列一 | 列二 |");
    expect(md).toContain("| 标题<br>* 条目 | 说明<br>- 子项 A<br>- 子项 B |");
  });
});
