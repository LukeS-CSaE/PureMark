/**
 * 块级操作纯逻辑（TipTap 侧）。
 *
 * 以「顶层文档块」为操作单位（段落 / 标题 / 表格 / 代码块 / 列表等深度 1 节点）：
 *   - duplicateBlockDown 复制当前块到下方；
 *   - moveBlock          当前块上/下移。
 *
 * 按键触发不在本文件的编辑器 keymap 里——编辑器级绑定只有焦点恰好在
 * 可编辑区才生效，且 Ctrl+D 会被 WebView2 / 系统层吞掉。实际触发走
 * App 的窗口级全局热键 → blockOpsRegistry，MarkdownView 挂载时把这两个
 * 函数注册为 pane 的句柄。本扩展只保留 Mod-Shift-X 删除线（补齐设置中
 * 登记但 TipTap 未内置的绑定——TipTap 默认是 Mod-Shift-S）。
 *
 * 纯逻辑函数（topLevelBlock / duplicateBlockDown / moveBlock）只依赖
 * EditorState + 捕获式 dispatch，可 node 环境单测（fake editor 模式，
 * 与 blockContextMenu.test.ts 同源）。
 */
import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";

export interface TopLevelBlock {
  /** 顶层块在 doc 中的 child index。 */
  index: number;
  /** 顶层块起始文档位置。 */
  from: number;
  node: PMNode;
}

/** 取光标所在的顶层块；选区不在任何块内（空文档边界）返回 null。 */
export function topLevelBlock(state: EditorState): TopLevelBlock | null {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const index = $from.index(0);
  let from = 0;
  for (let i = 0; i < index; i += 1) from += state.doc.child(i).nodeSize;
  return { index, from, node: state.doc.child(index) };
}

/** 复制当前顶层块到其正下方，光标落入副本。 */
export function duplicateBlockDown(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const info = topLevelBlock(editor.state);
  if (!info) return false;
  const to = info.from + info.node.nodeSize;
  const tr = editor.state.tr.insert(to, info.node);
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(to + 1)));
  } catch {
    // 边界异常则不移动选区（复制本身已生效）。
  }
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** 当前顶层块与上/下相邻块交换位置，光标随块移动；到边界返回 false。 */
export function moveBlock(editor: Editor, dir: -1 | 1): boolean {
  if (!editor.isEditable) return false;
  const { state } = editor;
  const info = topLevelBlock(state);
  if (!info) return false;
  const target = info.index + dir;
  if (target < 0 || target >= state.doc.childCount) return false;

  const from = info.from;
  const to = from + info.node.nodeSize;
  const tr = state.tr.delete(from, to);

  let insertAt: number;
  if (dir === 1) {
    // 删除后原「下一块」前移到 from，插入到它之后。
    insertAt = from + state.doc.child(info.index + 1).nodeSize;
  } else {
    // 上一块位置不受删除影响，插入到它之前。
    insertAt = from - state.doc.child(info.index - 1).nodeSize;
  }
  tr.insert(insertAt, info.node);
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + 1)));
  } catch {
    // 边界异常则不移动选区。
  }
  tr.scrollIntoView();
  editor.view.dispatch(tr);
  return true;
}

/** TipTap 扩展：仅保留删除线绑定；块复制/移动已提升到窗口级全局热键。 */
export const blockHotkeys = Extension.create({
  name: "blockHotkeys",

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
    };
  },
});
