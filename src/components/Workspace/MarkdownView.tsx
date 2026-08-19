/**
 * 统一的 Markdown 渲染视图（ProseMirror / TipTap）。
 *
 * edit / live / preview 三视图共用同一渲染核心，从根上保证「显示效果完全一致」：
 *   - `editable=true`  → live（可编辑 WYSIWYG）
 *   - `editable=false` → preview（只读渲染）
 *
 * 二者使用同一 schema（`buildEditorExtensions`）、同一 CSS（`pm.css`）、同一
 * 滚动容器模型（`.pm-live`），渲染结果（DOM 结构 + 样式）像素级一致。
 *
 * 写回（可编辑）：源码保留型序列化 → 保存字节级一致；
 * 回填：订阅 tab store，外部变更整体 `setContent`（`emitUpdate=false` 防写回循环）。
 * 搜索跳转：DOM 文本定位 + 滚到第 4 行 + ProseMirror decoration 高亮（1.5s 清除）。
 * 滚动同步：注册滚动容器（可编辑=editor / 只读=preview），补齐原 live 未注册
 *   导致 split 下 live↔preview 不同步的缺口。
 * TOC 锚点：仅只读视图挂载标题 id（可编辑视图因 PM 会重排 DOM，沿用原 live 行为）。
 */
import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { buildEditorExtensions } from "../../lib/prosemirror/editorExtensions";
import type { MarkdownSerializer } from "prosemirror-markdown";
import { useTabsStore } from "../../store/useTabsStore";
import { usePanesStore } from "../../store/usePanesStore";
import { registerScrollPane } from "../../lib/scrollSync";
import { parseToc, resolveHeadingOrdinal } from "../../lib/toc";
import { registerToc, unregisterToc } from "../../lib/tocRegistry";
import { registerBlockOps, unregisterBlockOps } from "../../lib/blockOpsRegistry";
import { duplicateBlockDown, moveBlock } from "../../lib/prosemirror/blockHotkeys";
import { attachHeadingAnchors } from "../../lib/headingAnchors";
import { focusPane } from "../../lib/paneRouter";
import { registerEditor, unregisterEditor, type EditorHandle } from "../../lib/editorRegistry";
import { scrollToMatchOrdinal } from "../../lib/searchScroll";
import { searchHighlightKey } from "../../lib/prosemirror/searchHighlight";
import { buildMarkdownSerializer, serializeNodeToMarkdown } from "../../lib/prosemirror/markdownSerializer";
import { serializeSourcePreserving } from "../../lib/prosemirror/sourcePreserving";
import { buildBlockMenu } from "../../lib/prosemirror/blockContextMenu";
import { useUIStore } from "../../store/useUIStore";
import type { PaneId } from "../../types";
import "../../styles/pm.css";

interface Props {
  paneId: PaneId;
  tabId: string | null;
  /** true=live(可编辑) / false=preview(只读)。两者渲染核心完全一致。 */
  editable: boolean;
}

/** 把当前 PM 文档序列化为 markdown（源码保留；失配时退化为整文档默认序列化）。 */
function serializeCurrent(
  editor: Editor,
  originalDoc: PMNode | null,
  original: string,
  serializer: MarkdownSerializer | null,
): string {
  const fallback = (): string => {
    const md = (editor.storage as Record<string, any>).markdown;
    return md && typeof md.getMarkdown === "function" ? md.getMarkdown() : "";
  };
  if (!serializer || !originalDoc) return fallback();
  const result = serializeSourcePreserving(
    editor.state.doc,
    originalDoc,
    original,
    (node) => serializeNodeToMarkdown(node, serializer),
  );
  return result.matched ? result.markdown : fallback();
}

export default function MarkdownView({ paneId, tabId, editable }: Props) {
  const content = useTabsStore((s) => s.tabs.find((t) => t.id === tabId)?.content ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 字节保真基准：本编辑器实例最初加载的 markdown 与其解析后的 PM 文档。
  const originalRef = useRef<string>("");
  const originalDocRef = useRef<PMNode | null>(null);
  const serializerRef = useRef<MarkdownSerializer | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const currentTabRef = useRef<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // tab 切换时重置保真基准（与旧 live 视图同源）。
  if (tabId && currentTabRef.current !== tabId) {
    currentTabRef.current = tabId;
    const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
    originalRef.current = tab ? tab.content : "";
    originalDocRef.current = null;
    serializerRef.current = null;
    lastWrittenRef.current = null;
  }

  const editor = useEditor(
    {
      extensions: buildEditorExtensions(),
      content: content || "",
      editable,
      // 只读/SSR 渲染：显式 false 让 tipTap 在挂载后（useEffect）再实例化编辑器，
      // 规避开发期 "SSR detected" 告警并防止 hydration 不匹配。
      immediatelyRender: false,
      editorProps: { attributes: { class: "pm-editor" } },
      onUpdate: ({ editor }) => {
        if (!editable || !tabId) return;
        const md = serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current);
        lastWrittenRef.current = md;
        useTabsStore.getState().updateContent(tabId, md);
      },
    },
    [tabId, editable],
  );

  // serializer 在 schema 就绪后构建一次；同时冻结最初解析出的 PM 文档作为保真基准。
  useEffect(() => {
    if (editor && !serializerRef.current) {
      serializerRef.current = buildMarkdownSerializer(editor.schema);
    }
    if (editor && !originalDocRef.current) {
      originalDocRef.current = editor.state.doc;
    }
  }, [editor]);

  // 内容变化 → 重新解析 markdown 进 TipTap（editable:false 时 emitUpdate=false 防写回；
  // editable 时外部变更同样整体 setContent）。与 live 视图的回填逻辑同源。
  useEffect(() => {
    if (!editor || !editor.view) return;
    if (content !== lastWrittenRef.current) {
      lastWrittenRef.current = content;
      try {
        editor.commands.setContent(content || "", false);
      } catch (err) {
        console.error("[markdown-view] 回填内容失败（已吞掉，避免白屏）：", err);
      }
    }
    // 只读视图挂载 TOC 标题锚点（可编辑视图因 PM 会重排 DOM 暂不挂载，沿用原 live 行为）。
    // 注意：必须独立于上面的内容变更 guard——live→preview 切换时编辑器重建，
    // 但 lastWrittenRef 仍等于 store 内容（live 的 onUpdate 写过），guard 会跳过
    // 本 effect 的剩余部分，导致新预览编辑器的标题没有 id、TOC 点击无法跳转。
    if (!editable) {
      attachHeadingAnchors(editor.view.dom as HTMLElement, parseToc(content));
    }
  }, [content, editor, editable]);

  // 滚动同步：可编辑=editor / 只读=preview（补齐原 live 未注册导致不同步的缺口）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const unregister = registerScrollPane({
      paneId,
      kind: editable ? "editor" : "preview",
      el,
      getTabId: () => usePanesStore.getState().getPane(paneId)?.tabId ?? null,
    });
    return unregister;
  }, [paneId, editable]);

  // ── 搜索跳转：注册 EditorHandle，由 SearchPanel 的 jumpTo 通用逻辑驱动 ──
  const clearHighlight = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
    const view = editor?.view;
    if (view) {
      try {
        view.dispatch(view.state.tr.setMeta(searchHighlightKey, null));
      } catch {
        /* ignore */
      }
    }
  }, [editor]);

  useEffect(() => {
    if (!editor || !tabId) return;
    const handle: EditorHandle = {
      paneId,
      tabId,
      // 可编辑：走源码保留序列化，保证保存字节级一致；只读：直接返回 store 中的 markdown。
      getValue() {
        return editable
          ? serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current)
          : (useTabsStore.getState().tabs.find((t) => t.id === tabId)?.content ?? "");
      },
      getSelection() {
        if (!editable) return { start: 0, end: 0 };
        const { from, to } = editor.state.selection;
        return { start: from, end: to };
      },
      setSelection() {
        if (!editable) return;
        editor.commands.focus();
      },
      replaceRange(from, to, insert, select) {
        if (!editable) return;
        editor.chain().focus().insertContentAt({ from, to }, insert).run();
        if (select) editor.commands.setTextSelection({ from: select.start, to: select.end });
      },
      getCursor() {
        if (!editable) return { line: 1, col: 1 };
        const head = editor.state.selection.head;
        const text = editor.state.doc.textBetween(0, head, "\n");
        const lines = text.split("\n");
        return { line: lines.length, col: lines[lines.length - 1].length + 1 };
      },
      focus() {
        if (editable) editor.commands.focus();
      },
      scrollToOffset() {
        if (editable) editor.commands.focus();
      },
      scrollToLine(_lineNo, match, ordinal) {
        if (!editor?.view) return;
        const pmDom = editor.view.dom as HTMLElement;
        clearHighlight();
        const storeContent =
          useTabsStore.getState().tabs.find((t) => t.id === tabId)?.content ?? "";
        const matchText = match ? storeContent.slice(match.start, match.end) : "";
        if (!matchText) return;
        // 用 ordinal 精确定位 + 直接滚动；返回的 located 复用于高亮，
        // 保证「滚动」与「高亮」严格落在同一处（不再各自定位导致错位）。
        const located = scrollToMatchOrdinal(pmDom, ordinal ?? 0, matchText);
        if (!located) return;
        try {
          const from = editor.view.posAtDOM(located.node, located.start);
          const to = editor.view.posAtDOM(located.node, located.end);
          editor.view.dispatch(editor.state.tr.setMeta(searchHighlightKey, { from, to }));
          highlightTimerRef.current = setTimeout(() => clearHighlight(), 1500);
        } catch {
          // posAtDOM 边界失败则放弃高亮（滚动已生效）。
        }
      },
    };
    registerEditor(paneId, handle);
    return () => unregisterEditor(paneId);
  }, [editor, paneId, tabId, editable, clearHighlight]);

  // ── TOC 跳转:注册 TocAdapter,由 tocRouter.jumpToHeading 驱动 ──
  // 此前整个代码库无人注册 adapter,导致「点击目录标题编辑区不跳转」。
  // preview 走 tocRouter 的 DOM 锚点路径,不需要 adapter;
  // live(及 CM 关闭时的 edit)在此注册。
  useEffect(() => {
    if (!editor || editable === false) return;
    registerToc(paneId, {
      getMarkdown: () =>
        serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current),
      scrollToHeading(line) {
        const view = editor.view;
        if (!view) return;
        const md = serializeCurrent(editor, originalDocRef.current, originalRef.current, serializerRef.current);
        const ordinal = resolveHeadingOrdinal(md, line);
        if (ordinal === null) return;
        // 按文档顺序取第 ordinal 个标题节点(与 parseToc 的标题序对齐)。
        let seen = 0;
        let targetPos = -1;
        view.state.doc.descendants((node, pos) => {
          if (targetPos >= 0) return false;
          if (node.type.name === "heading") {
            if (seen === ordinal) targetPos = pos;
            seen += 1;
          }
          return true;
        });
        if (targetPos < 0) return;
        try {
          // nodeDOM 直接返回标题节点对应的 DOM（domAtPos 在块前位置会返回
          // 父容器+offset，滚动目标会错成整个编辑区）。
          const dom = view.nodeDOM(targetPos);
          const el =
            dom instanceof HTMLElement ? dom : dom?.parentElement ?? null;
          if (!el) return;
          el.scrollIntoView({ block: "start" });
          // 光标同步移到标题处（与 CM 源码视图的跳转行为一致）。
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.near(view.state.doc.resolve(targetPos)),
            ),
          );
        } catch {
          // 边界失败则放弃跳转。
        }
      },
    });
    return () => unregisterToc(paneId);
  }, [editor, paneId, editable]);

  // ── 块快捷键：注册到 blockOpsRegistry，由 App 窗口级热键驱动 ──
  // Ctrl+D 复制块 / Alt+↑·↓ 移动块。先 focus 再执行，
  // 保证焦点在窗口内任意位置时操作都作用于当前 pane 的编辑器。
  useEffect(() => {
    if (!editor || editable === false) return;
    registerBlockOps(paneId, {
      duplicate: () => {
        editor.view?.focus();
        return duplicateBlockDown(editor);
      },
      move: (dir) => {
        editor.view?.focus();
        return moveBlock(editor, dir);
      },
    });
    return () => unregisterBlockOps(paneId);
  }, [editor, paneId, editable]);

  return (
    <div
      ref={scrollRef}
      className="pm-live scroll-thin"
      data-pane-id={paneId}
      data-view={editable ? "live" : "preview"}
      onMouseDownCapture={() => focusPane(paneId)}
      onFocusCapture={() => focusPane(paneId)}
      onContextMenu={(e: import("react").MouseEvent) => {
        // 文字块右键快捷菜单（仅可编辑视图）：上/下插入段落、删块、
        // 表格内追加行操作。全局 guard 已在 capture 阶段压制原生菜单，
        // 这里在冒泡阶段打开自定义菜单（与 CodeEditor 同源接线）。
        if (!editable || !editor?.view) return;
        e.preventDefault();
        focusPane(paneId);
        // 先把光标移到右键点击处，保证菜单动作作用于点击处的块。
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
        if (pos != null) {
          editor.view.dispatch(
            editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos.pos))),
          );
        }
        useUIStore.getState().openContextMenu({
          x: e.clientX,
          y: e.clientY,
          scope: "editor",
          items: buildBlockMenu(editor),
          payload: { tabId: tabId ?? undefined },
        });
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
