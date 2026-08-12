import { lazy, Suspense, Component, type ReactNode } from "react";
import Toolbar from "./Toolbar";
import CodeEditor from "./CodeEditor";
import PreviewPane from "./PreviewPane";
import TocPanel from "../Toc/TocPanel";

// live 视图 = ProseMirror/TipTap（已全量替换 CM6 live）。懒加载其依赖链
// （@tiptap/*、tiptap-markdown、prosemirror-*）只为避免拖慢首屏；加载期间与
// 运行时崩溃均以 CM6 live 兜底，绝不让整窗白屏。
const ProseMirrorEditor = lazy(() => import("./ProseMirrorEditor"));

/**
 * live 视图崩溃保护：TipTap 运行时若抛错，退回 CM6 live 而非让整个编辑器卡片
 * 白屏（用户此前最反感的症状）。属安全网，不改变「live = TipTap」的决定。
 */
class LiveErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[live] ProseMirror live view crashed, falling back to CM6:", err);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

import { usePanesStore } from "../../store/usePanesStore";
import { useConfigStore } from "../../store/useConfigStore";
import type { Pane } from "../../types";

/**
 * 编辑器卡片：顶部 Toolbar，下方内容区按 `usePanesStore` 渲染 pane。
 * single 布局一个 pane；split 布局两个 pane 左右并排，宽度由 splitRatio 决定。
 * 每个 pane：edit/live 渲染 CodeEditor，preview 渲染 PreviewPane。
 */
export default function EditorCard() {
  const layout = usePanesStore((s) => s.layout);
  const panes = usePanesStore((s) => s.panes);
  const splitRatio = usePanesStore((s) => s.splitRatio);

  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);

  const renderPane = (pane: Pane) => {
    if (pane.viewMode === "preview") {
      return <PreviewPane paneId={pane.id} tabId={pane.tabId ?? ""} />;
    }
    // live 视图 = ProseMirror/TipTap（已全量替换 CM6 live；加载期/崩溃均 CM6 兜底）。
    if (pane.viewMode === "live") {
      const cmFallback = <CodeEditor paneId={pane.id} tabId={pane.tabId} viewMode="live" />;
      return (
        <LiveErrorBoundary fallback={cmFallback}>
          <Suspense fallback={cmFallback}>
            <ProseMirrorEditor paneId={pane.id} tabId={pane.tabId} viewMode="live" />
          </Suspense>
        </LiveErrorBoundary>
      );
    }
    return (
      <CodeEditor
        paneId={pane.id}
        tabId={pane.tabId}
        viewMode={pane.viewMode === "edit" ? "edit" : "live"}
      />
    );
  };

  // Right-docked outline (default): a standalone panel on the editor's right
  // edge. The left-docked case is owned by the sidebar, not the editor.
  const showRightToc = tocPosition === "right" && tocVisible;

  return (
    <div className="editor-card">
      <Toolbar />
      <div className="editor-pane">
        {layout === "single" ? (
          panes[0] ? renderPane(panes[0]) : null
        ) : (
          <>
            <div className="editor-split" style={{ flexBasis: `${Math.round(splitRatio * 100)}%` }}>
              {panes[0] ? renderPane(panes[0]) : null}
            </div>
            <div
              className="editor-split"
              style={{ flexBasis: `${Math.round((1 - splitRatio) * 100)}%` }}
            >
              {panes[1] ? renderPane(panes[1]) : null}
            </div>
          </>
        )}
        {showRightToc ? <TocPanel /> : null}
      </div>
    </div>
  );
}
