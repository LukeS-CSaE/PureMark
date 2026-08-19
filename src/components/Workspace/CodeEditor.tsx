/**
 * CodeMirror 6 源码编辑器宿主（统一视图重构，2026-08）。
 *
 * 作为「编辑」视图在 `useCodeMirrorSource` 开启时呈现；与 live / preview
 * （统一 ProseMirror 渲染核心）共享同一套外壳令牌（--editor-pad-* / 滚动容器
 * 模型 / 卡片底色 / 设计令牌），保证三视图布局与样式统一；其内容为原始
 * markdown 文本（等宽字体），这是「编辑」视图的固有语义。
 *
 * 生命周期契约（与原实现一致，仅去掉已废弃的 CM live 装饰路径）：
 *   • `EditorView` 只创建一次，字体 / 主题 / 可编辑性通过 Compartment 切换，
 *     绝不为改配置而重建视图（设计 §8.1）；
 *   • 文档切换时快照 / 恢复滚动偏移（设计 §8.2）；
 *   • 通过 `useDocSync` 注册 EditorHandle，并接 ①②③ 三路同步（写回 / 回填 /
 *     同文件分屏 peer 转发），使保存、脏标记、分屏与 ProseMirror 路径一致；
 *   • 注册滚动容器（kind=editor），支撑 split 下 编辑↔预览 的同步滚动。
 */
import { useEffect, useRef, useState } from "react";
import { EditorView, type ViewUpdate } from "@codemirror/view";
import type { PaneId } from "../../types";
import { useConfigStore } from "../../store/useConfigStore";
import { usePanesStore } from "../../store/usePanesStore";
import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { useDocSync } from "../../hooks/useDocSync";
import { focusPane } from "../../lib/paneRouter";
import { registerScrollPane } from "../../lib/scrollSync";
import { registerToc, unregisterToc } from "../../lib/tocRegistry";
import { registerBlockOps, unregisterBlockOps } from "../../lib/blockOpsRegistry";
import { cmDuplicateDown, cmMoveBlock } from "../../lib/cmBlockOps";
import {
  createEditorState,
  darkCompartment,
  editableCompartment,
  fontCompartment,
  reconfigure,
  syncAnnotation,
} from "../../lib/cm/setup";
import { fontTheme } from "../../lib/cm/cmTheme";
import { buildEditorMenu } from "../../lib/editorContextMenu";

export interface CodeEditorProps {
  paneId: PaneId;
  /** Document to display, or `null` for the empty state. */
  tabId: string | null;
}

/** Read a tab's current content without subscribing to the store. */
function readContent(tabId: string | null): string {
  if (!tabId) return "";
  return useTabsStore.getState().tabs.find((tab) => tab.id === tabId)?.content ?? "";
}

export default function CodeEditor({ paneId, tabId }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [view, setView] = useState<EditorView | null>(null);

  const fontFamily = useConfigStore((s) => s.config.fontFamily);
  const fontSize = useConfigStore((s) => s.config.fontSize);
  const isDark = useUIStore((s) => s.resolvedTheme === "dark");

  const docSync = useDocSync(view, tabId, paneId);

  /** Per-document scroll offsets for this pane (design §8.2 snapshot/restore). */
  const scrollByTab = useRef<Map<string, number>>(new Map());
  const mountedTabRef = useRef<string | null>(null);
  const updateHandlerRef = useRef<(update: ViewUpdate) => void>(() => {});

  // Keep the update handler fresh without recreating the view.
  useEffect(() => {
    updateHandlerRef.current = (update: ViewUpdate): void => {
      docSync.onUpdate(update);
      if (!update.selectionSet && !update.docChanged) return;
      const head = update.state.selection.main.head;
      const line = update.state.doc.lineAt(head);
      usePanesStore
        .getState()
        .setPaneCursor(paneId, { line: line.number, col: head - line.from + 1 });
    };
  });

  // ---- mount / unmount (exactly once) --------------------------------------
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const config = useConfigStore.getState().config;
    const panes = usePanesStore.getState();
    const initialTabId = panes.getPane(paneId)?.tabId ?? null;

    const state = createEditorState({
      doc: readContent(initialTabId),
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      dark: useUIStore.getState().resolvedTheme === "dark",
      editable: true,
      // 统一重构后 CM 仅作源码编辑器，不再承载 live 装饰路径。
      liveExtension: [],
      onUpdate: (update) => updateHandlerRef.current(update),
      extraExtensions: [],
    });

    const instance = new EditorView({ state, parent: host });
    mountedTabRef.current = initialTabId;
    viewRef.current = instance;
    setView(instance);

    return () => {
      instance.destroy();
      viewRef.current = null;
      setView(null);
    };
    // The view is intentionally created once; every input below is applied
    // through a compartment reconfiguration instead of a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneId]);

  // ---- font metrics ---------------------------------------------------------
  useEffect(() => {
    const instance = viewRef.current;
    if (!instance) return;
    reconfigure(instance, fontCompartment, fontTheme(fontFamily, fontSize));
  }, [view, fontFamily, fontSize]);

  // ---- dark flag ------------------------------------------------------------
  useEffect(() => {
    const instance = viewRef.current;
    if (!instance) return;
    reconfigure(instance, darkCompartment, EditorView.darkTheme.of(isDark));
  }, [view, isDark]);

  // ---- editability (always editable) ---------------------------------------
  useEffect(() => {
    const instance = viewRef.current;
    if (!instance) return;
    reconfigure(instance, editableCompartment, EditorView.editable.of(true));
  }, [view]);

  // ---- document swap (with scroll snapshot / restore) -----------------------
  useEffect(() => {
    const instance = viewRef.current;
    if (!instance) return;

    const previous = mountedTabRef.current;
    if (previous === tabId) return;

    if (previous !== null) {
      scrollByTab.current.set(previous, instance.scrollDOM.scrollTop);
    }
    mountedTabRef.current = tabId;

    const content = readContent(tabId);
    instance.dispatch({
      changes: { from: 0, to: instance.state.doc.length, insert: content },
      selection: { anchor: 0 },
      annotations: syncAnnotation.of(true),
    });

    const restored = tabId ? (scrollByTab.current.get(tabId) ?? 0) : 0;
    usePanesStore.getState().setPaneScroll(paneId, restored);
    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => {
            if (viewRef.current) viewRef.current.scrollDOM.scrollTop = restored;
          })
        : 0;
    return () => {
      if (raf !== 0 && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    };
  }, [view, tabId, paneId]);

  // ---- scroll sync registration (split 编辑↔预览 同步) ----------------------
  useEffect(() => {
    if (!view) return;
    const unregister = registerScrollPane({
      paneId,
      kind: "editor",
      el: view.scrollDOM,
      getTabId: () => usePanesStore.getState().getPane(paneId)?.tabId ?? null,
    });
    return unregister;
  }, [view, paneId]);

  // ---- TOC adapter registration (目录点击跳转,edit 视图走 CM 行号语义) ----
  useEffect(() => {
    if (!view) return;
    registerToc(paneId, {
      getMarkdown: () => view.state.doc.toString(),
      scrollToHeading(line) {
        const lineInfo = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
        view.dispatch({
          selection: { anchor: lineInfo.from },
          effects: EditorView.scrollIntoView(lineInfo.from, { y: "start" }),
        });
      },
    });
    return () => unregisterToc(paneId);
  }, [view, paneId]);

  // ---- 块快捷键注册（Ctrl+D 复制 / Alt+↑·↓ 移动，窗口级热键驱动）----
  // 源码视图以「空行分隔的段落」为块单位；操作后视口跟随光标。
  useEffect(() => {
    if (!view) return;
    registerBlockOps(paneId, {
      duplicate: () => {
        const pos = view.state.selection.main.head;
        const change = cmDuplicateDown(view.state, pos);
        if (!change) return false;
        view.dispatch({
          changes: { from: change.from, to: change.to, insert: change.insert },
          selection: { anchor: change.cursor },
          effects: EditorView.scrollIntoView(change.cursor, { y: "center" }),
        });
        view.focus();
        return true;
      },
      move: (dir) => {
        const pos = view.state.selection.main.head;
        const change = cmMoveBlock(view.state, pos, dir);
        if (!change) return false;
        view.dispatch({
          changes: { from: change.from, to: change.to, insert: change.insert },
          selection: { anchor: change.cursor },
          effects: EditorView.scrollIntoView(change.cursor, { y: "center" }),
        });
        view.focus();
        return true;
      },
    });
    return () => unregisterBlockOps(paneId);
  }, [view, paneId]);

  return (
    <div
      ref={hostRef}
      className="code-editor"
      data-pane-id={paneId}
      data-view="edit"
      onMouseDownCapture={() => focusPane(paneId)}
      onFocusCapture={() => focusPane(paneId)}
      onContextMenu={(e: import("react").MouseEvent) => {
        // 需求2：编辑视图自定义右键菜单。全局 guard 已在 capture 阶段
        // preventDefault 压制原生菜单，这里在冒泡阶段打开自定义菜单。
        e.preventDefault();
        focusPane(paneId);
        const v = viewRef.current;
        if (!v) return;
        const pane = usePanesStore.getState().getPane(paneId);
        useUIStore.getState().openContextMenu({
          x: e.clientX,
          y: e.clientY,
          scope: "editor",
          items: buildEditorMenu(v),
          payload: { tabId: pane?.tabId ?? undefined },
        });
      }}
    />
  );
}
