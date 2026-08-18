/**
 * 搜索跳转高亮（live / preview 共用的 ProseMirror decoration）。
 *
 * 为什么不用 DOM `surroundContents(<mark>)`：
 *  - live 视图是 editable 的 ProseMirror，外部 DOM 包裹会被 PM 的 mutation
 *    observer 撤销或抛错，高亮一闪即逝；
 *  - 跨文本节点的匹配 `surroundContents` 直接抛错（无跨节点包裹能力）。
 *
 * 用 ProseMirror 原生 inline decoration 高亮 [from,to] 区间，由 view dispatch
 * 的 meta 设置 / 清除，完全走 PM 的数据流，不会被撤销，也天然支持跨节点。
 *
 * TipTap 只接受 `AnyExtension`，故这里用 `Extension.create` 包裹原始 Plugin。
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface SearchHighlightRange {
  from: number;
  to: number;
}

export const searchHighlightKey = new PluginKey<SearchHighlightRange | null>(
  "puremark-search-highlight",
);

export const searchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchHighlightRange | null>({
        key: searchHighlightKey,
        state: {
          init: () => null,
          apply(tr, value) {
            // 显式 meta 控制高亮区间（null = 清除）。
            const meta = tr.getMeta(searchHighlightKey);
            if (meta !== undefined) return meta as SearchHighlightRange | null;
            // 文档内容变化导致原区间越界时自动清除，避免高亮错位。
            if (value && (value.from > tr.doc.content.size || value.to > tr.doc.content.size)) {
              return null;
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const v = searchHighlightKey.getState(state);
            if (!v) return DecorationSet.empty;
            const size = state.doc.content.size;
            if (v.from < 0 || v.to > size || v.from >= v.to) return DecorationSet.empty;
            return DecorationSet.create(state.doc, [
              Decoration.inline(v.from, v.to, { class: "pm-search-hl" }),
            ]);
          },
        },
      }),
    ];
  },
});
