/**
 * 文字块右键菜单的纯逻辑测试（无需 DOM）：
 * - isInTable：表格内/外判定；
 * - insertParagraphAbove/Below：顶层块边界计算与插入位置（fake editor
 *   捕获事务，不实际 dispatch 到视图）。
 * 菜单构造本身（buildBlockMenu）依赖真实 Editor.can()/chain()，由手动验证覆盖。
 */
import { describe, it, expect, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import {
  isInTable,
  insertParagraphAbove,
  insertParagraphBelow,
} from "../lib/prosemirror/blockContextMenu";
import { buildEditorExtensions } from "../lib/prosemirror/editorExtensions";

const schema = getSchema(buildEditorExtensions());

/** 构造一个 fake editor：共享真实 state，dispatch 被捕获。 */
function fakeEditor(state: EditorState): { editor: Editor; dispatched: Transaction[] } {
  const dispatched: Transaction[] = [];
  const editor = {
    state,
    view: { dispatch: (tr: Transaction) => void dispatched.push(tr) },
    commands: { focus: () => true },
  } as unknown as Editor;
  return { editor, dispatched };
}

describe("isInTable", () => {
  const para = schema.nodes.paragraph.create(null, schema.text("first"));
  const cellP = schema.nodes.paragraph.create(null, schema.text("cell"));
  const table = schema.nodes.table.create(null, [
    schema.nodes.tableRow.create(null, [schema.nodes.tableCell.create(null, [cellP])]),
  ]);
  const doc = schema.nodes.doc.create(null, [para, table]);

  it("光标在普通段落时为 false", () => {
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });
    expect(isInTable(state)).toBe(false);
  });

  it("光标在表格单元格内时为 true", () => {
    // para 占位 [0,7]；table@7 → row@8 → cell@9 → cell段落@10，
    // 单元格文本 "cell" 在 11-14，取 12（文本内部，避免节点边界告警）。
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 12),
    });
    expect(isInTable(state)).toBe(true);
  });
});

describe("insertParagraphAbove / Below", () => {
  const para = schema.nodes.paragraph.create(null, schema.text("first"));
  const doc = schema.nodes.doc.create(null, [para]);

  it("上方插入：落在顶层块起点，选区进入新段落", () => {
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    const { editor, dispatched } = fakeEditor(state);
    insertParagraphAbove(editor);
    expect(dispatched).toHaveLength(1);
    const tr = dispatched[0];
    expect(tr.doc.childCount).toBe(2);
    expect(tr.doc.child(0).type.name).toBe("paragraph");
    expect(tr.doc.child(0).textContent).toBe("");
    expect(tr.doc.child(1).textContent).toBe("first");
    // 新段落正文起点 = 0 + 1
    expect(tr.selection.from).toBe(1);
  });

  it("下方插入：落在顶层块末尾之后，选区进入新段落", () => {
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    const { editor, dispatched } = fakeEditor(state);
    insertParagraphBelow(editor);
    expect(dispatched).toHaveLength(1);
    const tr = dispatched[0];
    expect(tr.doc.childCount).toBe(2);
    expect(tr.doc.child(0).textContent).toBe("first");
    expect(tr.doc.child(1).type.name).toBe("paragraph");
    expect(tr.doc.child(1).textContent).toBe("");
    // 原段落占位 [0,7]，新段落正文起点 = 7 + 1
    expect(tr.selection.from).toBe(8);
  });

  it("插入后调用 focus", () => {
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    const { editor } = fakeEditor(state);
    const focusSpy = vi.fn(() => true);
    (editor as unknown as { commands: { focus: () => boolean } }).commands.focus = focusSpy;
    insertParagraphAbove(editor);
    expect(focusSpy).toHaveBeenCalled();
  });
});
