import { usePanesStore } from "../../store/usePanesStore";
import { useToc } from "../../hooks/useToc";
import TocList from "./TocList";

/**
 * Outline panel for the focused pane (iter2-ext N-16).
 *
 * Reads `focusedPaneId` from `usePanesStore` and feeds it to `useToc`, which
 * returns the heading list plus a `jump` callback. Visibility is computed
 * inside `useToc` (it combines `tocVisible` with the sidebar shape, §3.3), so
 * when the outline should be hidden for this placement we render nothing and
 * the host layout doesn't need to know.
 *
 * The host decides *where* the panel goes — the left sidebar (Sidebar.tsx) or
 * the right edge of the editor (EditorCard.tsx) — and only mounts this
 * component for its own position. This component never writes `useUIStore`
 * / `useConfigStore` itself; toggle + position actions live in the toolbar.
 */
export default function TocPanel() {
  const paneId = usePanesStore((s) => s.focusedPaneId);
  const { items, jump, visible } = useToc(paneId);

  if (!visible) return null;

  return (
    <div className="toc-panel">
      <div className="toc-head">目录</div>
      <div className="toc-scroll scroll-thin">
        <TocList items={items} onJump={jump} />
      </div>
    </div>
  );
}
