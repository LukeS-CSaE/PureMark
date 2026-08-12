/**
 * CodeMirror 6 host component (design §1.1, task T02 step 2.10).
 *
 * Replaces the MVP `EditorPane.tsx` (a single controlled `<textarea>`), whose
 * "one global editor" assumption cannot survive two simultaneously mounted
 * panes.
 *
 * Lifecycle contract:
 *   • the `EditorView` is created **once** and destroyed only on unmount;
 *     font, theme, live mode and editability are swapped through compartments
 *     (design §8.1 — never rebuild the view to change configuration);
 *   • `viewMode === 'live'` additionally toggles the `.cm-live` class on the
 *     CodeMirror root, which is what `live.css` keys its block-level
 *     typography off (`.cm-md-block-*` rules);
 *   • switching documents snapshots the outgoing scroll offset and restores the
 *     incoming one (design §8.2);
 *   • the caret is reported to `usePanesStore.setPaneCursor` only — writing
 *     `useTabsStore.setCursor` is forbidden because two panes can share a
 *     buffer while having different carets (R-10).
 *
 * 行级重写为 line-decoration 方案后, 不再有 widget / click 坐标错位 bug,
 * 因此删除了旧版的 `.cm-live` 自愈补丁 (约 60 行防御代码). `.cm-live` 类
 * 现在只在 `viewMode` 变化时 toggle 一次, 由 `livePreviewPlugin` 的
 * `LineDecoration` 驱动块级样式, 不再需要每帧重盖.
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
import {
  createEditorState,
  darkCompartment,
  editableCompartment,
  fontCompartment,
  liveCompartment,
  reconfigure,
  syncAnnotation,
} from "../../lib/cm/setup";
import { fontTheme } from "../../lib/cm/cmTheme";
import { livePreviewPlugin } from "../../lib/cm/livePreview";

export interface CodeEditorProps {
  paneId: PaneId;
  /** Document to display, or `null` for the empty state. */
  tabId: string | null;
  /** Only the two editable modes reach this component; `preview` uses `PreviewPane`. */
  viewMode: "edit" | "live";
}

/** Read a tab's current content without subscribing to the store. */
function readContent(tabId: string | null): string {
  if (!tabId) return "";
  return useTabsStore.getState().tabs.find((tab) => tab.id === tabId)?.content ?? "";
}

export default function CodeEditor({ paneId, tabId, viewMode }: CodeEditorProps) {
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
  /**
   * Tracks the last live-mode flag the editor root was actually stamped with,
   * so the live-mode effect below can short-circuit no-op re-runs (e.g. when
   * a parent `setPaneCursor` re-renders the pane).
   */
  const liveActiveRef = useRef<boolean | null>(null);

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
    // 以 props.viewMode 为准，避免 pane store 与 props 不同步导致 live
    // 插件初始状态错误.
    const liveOnMount = viewMode === "live";
    console.log("[CodeEditor] mount paneId", paneId, "viewMode", viewMode, "liveOnMount", liveOnMount);

    const state = createEditorState({
      doc: readContent(initialTabId),
      fontFamily: config.fontFamily,
      fontSize: config.fontSize,
      dark: useUIStore.getState().resolvedTheme === "dark",
      editable: true,
      liveExtension: liveOnMount ? livePreviewPlugin : [],
      onUpdate: (update) => updateHandlerRef.current(update),
    });

    const instance = new EditorView({ state, parent: host });
    // Stamp the `.cm-live` container class on mount so the first paint already
    // has the parent selector matched for `.cm-md-block-*` rules in `live.css`.
    instance.dom.classList.toggle("cm-live", liveOnMount);
    liveActiveRef.current = liveOnMount;
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

  // ---- live decorations + `.cm-live` container class ------------------------
  // IMPORTANT: depend on `viewMode` ONLY. Including `view` in the deps
  // causes the effect to re-run on every setView round trip during
  // mount/cleanup, which calls `reconfigure` again and forces CodeMirror to
  // rebuild the live plugin.
  useEffect(() => {
    const instance = viewRef.current;
    if (!instance) return;
    const live = viewMode === "live";
    console.log("[CodeEditor] viewMode effect", "current", liveActiveRef.current, "target", live);
    if (liveActiveRef.current === live) return;
    liveActiveRef.current = live;
    reconfigure(instance, liveCompartment, live ? livePreviewPlugin : []);
    instance.dom.classList.toggle("cm-live", live);
    console.log("[CodeEditor] reconfigured live", live, "classList has cm-live", instance.dom.classList.contains("cm-live"));
  }, [viewMode]);

  // ---- editability ----------------------------------------------------------
  // Both `edit` and `live` are always editable, even when no document is open
  // (mirrors the ProseMirror live view). Edits made with no file open are not
  // written back to the tab store — they live in the editor instance only,
  // exactly like the live view.
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
    // The new content must be laid out before the offset means anything.
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

  // ---- scroll sync registration (Bug #2) ------------------------------------
  // `view.scrollDOM` only exists after the EditorView is created, so this
  // effect runs on the view-changed transition. `getTabId` reads the live store
  // so tab swaps inside the pane do not require re-registering.
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

  return (
    <div
      ref={hostRef}
      className="code-editor"
      onMouseDownCapture={() => focusPane(paneId)}
      onFocusCapture={() => focusPane(paneId)}
    />
  );
}
