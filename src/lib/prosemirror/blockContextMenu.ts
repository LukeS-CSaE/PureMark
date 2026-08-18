/**
 * live（TipTap）视图文字块右键菜单项构造。
 *
 * - 块级操作基于 ProseMirror 位置计算：`$from.before(1)` / `$from.after(1)`
 *   即光标所在顶层块（段落/标题/代码块/表格…）的边界，插入/删除都落在
 *   顶层块粒度，事务可撤销（undo 栈一致）。
 * - 表格行操作直接复用 @tiptap/extension-table 的 addRowBefore /
 *   addRowAfter / deleteRow 命令（`.can()` 决定禁用态）。
 * - 纯函数 `isInTable` 拆出供单测（无需 DOM / Editor 实例）。
 */
import type { Editor } from "@tiptap/core";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import type { MenuItem } from "../../types";

/** 光标是否位于表格内部（任意深度的 table 祖先）。 */
export function isInTable(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") return true;
  }
  return false;
}

/** 在当前顶层块上方插入空段落（光标落入新段落）。 */
export function insertParagraphAbove(editor: Editor): void {
  const { $from, from } = editor.state.selection;
  const pos = $from.depth >= 1 ? $from.before(1) : from;
  const { state, view } = editor;
  const para = state.schema.nodes.paragraph.create();
  const tr = state.tr.insert(pos, para);
  view.dispatch(setSelectionAt(tr, pos + 1));
  editor.commands.focus();
}

/** 在当前顶层块下方插入空段落（光标落入新段落）。 */
export function insertParagraphBelow(editor: Editor): void {
  const { $from, to } = editor.state.selection;
  const pos = $from.depth >= 1 ? $from.after(1) : to;
  const { state, view } = editor;
  const para = state.schema.nodes.paragraph.create();
  const tr = state.tr.insert(pos, para);
  view.dispatch(setSelectionAt(tr, pos + 1));
  editor.commands.focus();
}

/** 删除光标所在的整个顶层块（表格内不可用，避免误删整表）。 */
export function deleteCurrentBlock(editor: Editor): void {
  const { $from } = editor.state.selection;
  if ($from.depth < 1) return;
  const from = $from.before(1);
  const to = $from.after(1);
  editor.view.dispatch(editor.state.tr.delete(from, to));
  editor.commands.focus();
}

/** 构造 tr 并把文本选区移到 pos（新段落正文起点 = 插入位 + 1）。 */
function setSelectionAt(tr: import("@tiptap/pm/state").Transaction, pos: number) {
  return tr.setSelection(TextSelection.create(tr.doc, pos));
}

/** 构造 live 视图右键菜单：块级插入/删除 + 表格行操作（在表格内时追加）。 */
export function buildBlockMenu(editor: Editor): MenuItem[] {
  const inTable = isInTable(editor.state);
  const items: MenuItem[] = [
    {
      id: "insert-para-above",
      label: "在上方插入段落",
      icon: "ArrowUp",
      run: () => insertParagraphAbove(editor),
    },
    {
      id: "insert-para-below",
      label: "在下方插入段落",
      icon: "ArrowDown",
      run: () => insertParagraphBelow(editor),
    },
    {
      id: "delete-block",
      label: "删除当前块",
      icon: "Trash2",
      disabled: inTable,
      run: () => deleteCurrentBlock(editor),
    },
  ];

  if (inTable) {
    items.push(
      { separator: true, id: "sep-table-1" },
      {
        id: "add-row-above",
        label: "在上方插入行",
        icon: "ArrowUp",
        disabled: !editor.can().addRowBefore(),
        run: () => void editor.chain().focus().addRowBefore().run(),
      },
      {
        id: "add-row-below",
        label: "在下方插入行",
        icon: "ArrowDown",
        disabled: !editor.can().addRowAfter(),
        run: () => void editor.chain().focus().addRowAfter().run(),
      },
      {
        id: "delete-row",
        label: "删除当前行",
        icon: "Trash2",
        disabled: !editor.can().deleteRow(),
        run: () => void editor.chain().focus().deleteRow().run(),
      },
    );
  }

  return items;
}
