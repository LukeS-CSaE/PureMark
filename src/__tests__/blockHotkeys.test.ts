/**
 * 块级快捷键纯逻辑测试（无需 DOM，fake editor 捕获事务）。
 *
 * 覆盖：
 * - topLevelBlock：光标所在顶层块的 index / from / node；
 * - duplicateBlockDown：副本插入到当前块正下方，光标落入副本；
 * - moveBlock：上/下移交换相邻块，边界返回 false，光标随块移动。
 */
import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import {
  topLevelBlock,
  duplicateBlockDown,
  moveBlock,
} from "../lib/prosemirror/blockHotkeys";
import { buildEditorExtensions } from "../lib/prosemirror/editorExtensions";

const schema = getSchema(buildEditorExtensions());

const para = (t: string) => schema.nodes.paragraph.create(null, schema.text(t));
const heading = (t: string) =>
  schema.nodes.heading.create({ level: 2 }, schema.text(t));

function makeState(blocks: ReturnType<typeof para>[], cursorIn: number) {
  const doc = schema.nodes.doc.create(null, blocks);
  // 计算第 cursorIn 个块内部的文本位置（块起始 + 1）。
  let pos = 0;
  for (let i = 0; i < cursorIn; i += 1) pos += blocks[i].nodeSize;
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos + 1),
  });
  return { state, doc };
}

/** fake editor：dispatch 被捕获，测试手动 apply 事务得到新 state。 */
function fakeEditor(state: EditorState): { editor: Editor; dispatched: Transaction[] } {
  const dispatched: Transaction[] = [];
  const editor = {
    state,
    isEditable: true,
    view: { dispatch: (tr: Transaction) => void dispatched.push(tr) },
  } as unknown as Editor;
  return { editor, dispatched };
}

describe("topLevelBlock", () => {
  it("返回光标所在顶层块的 index / from / node", () => {
    const a = para("aaa");
    const b = heading("bbb");
    const { state } = makeState([a, b], 1);
    const info = topLevelBlock(state);
    expect(info).not.toBeNull();
    expect(info!.index).toBe(1);
    expect(info!.from).toBe(a.nodeSize);
    expect(info!.node.textContent).toBe("bbb");
  });
});

describe("duplicateBlockDown", () => {
  it("在当前块正下方插入副本，光标落入副本", () => {
    const a = para("aaa");
    const b = para("bbb");
    const { state } = makeState([a, b], 0);
    const { editor, dispatched } = fakeEditor(state);

    expect(duplicateBlockDown(editor)).toBe(true);
    expect(dispatched).toHaveLength(1);
    const next = state.apply(dispatched[0]);
    expect(next.doc.childCount).toBe(3);
    expect(next.doc.child(0).textContent).toBe("aaa");
    expect(next.doc.child(1).textContent).toBe("aaa");
    expect(next.doc.child(2).textContent).toBe("bbb");
    // 光标在副本内（位置落在第一个块之后、第二个块之内）。
    const $head = next.selection.$head;
    expect($head.index(0)).toBe(1);
  });

  it("只读编辑器返回 false 且不 dispatch", () => {
    const { state } = makeState([para("aaa")], 0);
    const { editor, dispatched } = fakeEditor(state);
    (editor as unknown as { isEditable: boolean }).isEditable = false;
    expect(duplicateBlockDown(editor)).toBe(false);
    expect(dispatched).toHaveLength(0);
  });
});

describe("moveBlock", () => {
  it("下移：与下一块交换位置", () => {
    const a = para("aaa");
    const b = para("bbb");
    const c = para("ccc");
    const { state } = makeState([a, b, c], 0);
    const { editor, dispatched } = fakeEditor(state);

    expect(moveBlock(editor, 1)).toBe(true);
    const next = state.apply(dispatched[0]);
    expect(next.doc.child(0).textContent).toBe("bbb");
    expect(next.doc.child(1).textContent).toBe("aaa");
    expect(next.doc.child(2).textContent).toBe("ccc");
    // 光标随块移动到 index 1。
    expect(next.selection.$head.index(0)).toBe(1);
  });

  it("上移：与上一块交换位置", () => {
    const a = para("aaa");
    const b = para("bbb");
    const { state } = makeState([a, b], 1);
    const { editor, dispatched } = fakeEditor(state);

    expect(moveBlock(editor, -1)).toBe(true);
    const next = state.apply(dispatched[0]);
    expect(next.doc.child(0).textContent).toBe("bbb");
    expect(next.doc.child(1).textContent).toBe("aaa");
    expect(next.selection.$head.index(0)).toBe(0);
  });

  it("首块上移 / 末块下移返回 false", () => {
    const a = para("aaa");
    const b = para("bbb");
    const s0 = makeState([a, b], 0);
    const e0 = fakeEditor(s0.state);
    expect(moveBlock(e0.editor, -1)).toBe(false);

    const s1 = makeState([a, b], 1);
    const e1 = fakeEditor(s1.state);
    expect(moveBlock(e1.editor, 1)).toBe(false);
    expect(e0.dispatched).toHaveLength(0);
    expect(e1.dispatched).toHaveLength(0);
  });

  it("表格作为整体块移动", () => {
    const cellP = schema.nodes.paragraph.create(null, schema.text("cell"));
    const table = schema.nodes.table.create(null, [
      schema.nodes.tableRow.create(null, [
        schema.nodes.tableCell.create(null, [cellP]),
      ]),
    ]);
    const p = para("after");
    const doc = schema.nodes.doc.create(null, [table, p]);
    // 光标落在表格单元格内（table@0 → row@1 → cell@2 → 段落@3 → 文本 4）。
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 5),
    });
    const { editor, dispatched } = fakeEditor(state);

    expect(moveBlock(editor, 1)).toBe(true);
    const next = state.apply(dispatched[0]);
    expect(next.doc.child(0).type.name).toBe("paragraph");
    expect(next.doc.child(1).type.name).toBe("table");
  });
});
