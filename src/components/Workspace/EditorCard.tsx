import { Component, type ReactNode } from "react";
import Toolbar from "./Toolbar";
import CodeEditor from "./CodeEditor";
import MarkdownView from "./MarkdownView";
import TocPanel from "../Toc/TocPanel";
import { usePanesStore } from "../../store/usePanesStore";
import { useConfigStore } from "../../store/useConfigStore";
import type { Pane } from "../../types";

/**
 * 视图崩溃保护：TipTap / 渲染异常时不要把整窗拖白。
 * 若用户已开启 CodeMirror 源码编辑器（useCodeMirrorSource），退回 CM 源码视图；
 * 否则降级为空（绝不白屏）。原 live 视图的「CM 兜底」逻辑在此归一。
 */
class ViewErrorBoundary extends Component<
  { cmFallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.error("[view] MarkdownView crashed, degrading:", err);
  }
  render() {
    return this.state.hasError ? this.props.cmFallback : this.props.children;
  }
}

/**
 * 编辑器卡片：顶部 Toolbar，下方内容区按 `usePanesStore` 渲染 pane。
 * single 布局一个 pane；split 布局两个 pane 左右并排，宽度由 splitRatio 决定。
 *
 * 三视图统一渲染核心（ProseMirror / TipTap）：
 *   - preview                → MarkdownView 只读
 *   - live                   → MarkdownView 可编辑
 *   - edit（CM 开启时）      → CodeEditor 源码编辑器
 *   - edit（CM 关闭时）      → 合并进 live（同 MarkdownView 可编辑），保证
 *                              「实时 / 预览」两种形态 + 渲染结果完全一致。
 */
export default function EditorCard() {
  const layout = usePanesStore((s) => s.layout);
  const panes = usePanesStore((s) => s.panes);
  const splitRatio = usePanesStore((s) => s.splitRatio);

  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);
  const useCmSource = useConfigStore((s) => s.config.useCodeMirrorSource);

  const renderPane = (pane: Pane) => {
    const tabId = pane.tabId ?? "";
    // CM 源码编辑器作为「编辑」视图的兜底：live 崩溃时退回到源码，否则降级为空。
    const cmFallback = useCmSource ? <CodeEditor paneId={pane.id} tabId={tabId} /> : null;

    if (pane.viewMode === "preview") {
      return (
        <ViewErrorBoundary cmFallback={null}>
          <MarkdownView paneId={pane.id} tabId={tabId} editable={false} />
        </ViewErrorBoundary>
      );
    }

    // 仅当开启 CodeMirror 源码编辑器时，edit 才是独立的源码视图。
    if (pane.viewMode === "edit" && useCmSource) {
      return <CodeEditor paneId={pane.id} tabId={tabId} />;
    }

    // 其余（live，以及未开启 CM 时的 edit 合并进 live）→ 可编辑 ProseMirror。
    return (
      <ViewErrorBoundary cmFallback={cmFallback}>
        <MarkdownView paneId={pane.id} tabId={tabId} editable />
      </ViewErrorBoundary>
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
