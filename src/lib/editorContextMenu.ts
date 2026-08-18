/**
 * 编辑器自定义右键菜单项构造（需求2 / T1）。
 *
 * - 撤销/重做/全选走 @codemirror/commands（保证 undo 栈与选区一致）。
 * - 剪切/复制/粘贴走剪贴板 API + view.dispatch(replaceSelection)：在 Tauri
 *   WebView 下比 CM 的合成 ClipboardEvent 更可靠，且 replaceSelection 产生的
 *   事务是可撤销的（undo 栈保持一致，满足设计 §7.2）。
 * - 格式项复用 markdownKeymap 的 toggleWrap/toggleHeading/toggleLink，
 *   通过 formatCommand(name) 取得 Command。
 */
import { type EditorView } from "@codemirror/view";
import { undo, redo, selectAll } from "@codemirror/commands";
import type { MenuItem } from "../types";
import { formatCommand } from "../lib/cm/markdownKeymap";

/** 复制当前选区文本到系统剪贴板。 */
function copySelection(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  void navigator.clipboard?.writeText(text);
}

/** 剪切：复制后删除选区（删除事务可撤销）。 */
function cutSelection(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const text = view.state.sliceDoc(from, to);
  view.dispatch(view.state.replaceSelection(""));
  void navigator.clipboard?.writeText(text);
}

/** 粘贴：从剪贴板读取并插入（插入事务可撤销，保留 undo 栈）。 */
function pasteText(view: EditorView): void {
  view.focus();
  void navigator.clipboard?.readText().then((text) => {
    if (text) view.dispatch(view.state.replaceSelection(text));
  });
}

/** 包一层：先聚焦编辑器再执行 CM 命令 / 自定义动作。 */
function runOn(view: EditorView, fn: (v: EditorView) => void): () => void {
  return () => {
    view.focus();
    fn(view);
  };
}

/** 构造编辑器（edit / CM-live 兜底）的菜单项列表。 */
export function buildEditorMenu(view: EditorView): MenuItem[] {
  const { from, to } = view.state.selection.main;
  const hasSelection = from !== to;
  return [
    { id: "undo", label: "撤销", icon: "Undo2", shortcut: "Ctrl+Z", run: runOn(view, undo) },
    { id: "redo", label: "重做", icon: "Redo2", shortcut: "Ctrl+Y", run: runOn(view, redo) },
    { separator: true, id: "sep-edit-1" },
    {
      id: "cut",
      label: "剪切",
      icon: "Scissors",
      shortcut: "Ctrl+X",
      disabled: !hasSelection,
      run: runOn(view, cutSelection),
    },
    {
      id: "copy",
      label: "复制",
      icon: "Copy",
      shortcut: "Ctrl+C",
      disabled: !hasSelection,
      run: runOn(view, copySelection),
    },
    {
      id: "paste",
      label: "粘贴",
      icon: "ClipboardPaste",
      shortcut: "Ctrl+V",
      run: runOn(view, pasteText),
    },
    {
      id: "selectAll",
      label: "全选",
      icon: "Type",
      shortcut: "Ctrl+A",
      run: runOn(view, selectAll),
    },
    { separator: true, id: "sep-edit-2" },
    {
      id: "bold",
      label: "加粗",
      icon: "Bold",
      shortcut: "Ctrl+B",
      run: runOn(view, (v) => void formatCommand("bold")(v)),
    },
    {
      id: "italic",
      label: "斜体",
      icon: "Italic",
      shortcut: "Ctrl+I",
      run: runOn(view, (v) => void formatCommand("italic")(v)),
    },
    {
      id: "strike",
      label: "删除线",
      icon: "Strikethrough",
      shortcut: "Ctrl+Shift+X",
      run: runOn(view, (v) => void formatCommand("strike")(v)),
    },
    {
      id: "code",
      label: "行内代码",
      icon: "Code",
      shortcut: "Ctrl+E",
      run: runOn(view, (v) => void formatCommand("code")(v)),
    },
    {
      id: "link",
      label: "插入链接",
      icon: "Link",
      shortcut: "Ctrl+K",
      run: runOn(view, (v) => void formatCommand("link")(v)),
    },
  ];
}
