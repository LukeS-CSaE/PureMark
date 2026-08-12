import { useEffect, useRef } from "react";
import { useTabsStore } from "../../store/useTabsStore";
import { usePanesStore } from "../../store/usePanesStore";
import { render } from "../../lib/markdown";
import { highlightElement } from "../../lib/highlight";
import { registerScrollPane } from "../../lib/scrollSync";
import { parseToc } from "../../lib/toc";
import { attachHeadingAnchors } from "../../lib/headingAnchors";
import { focusPane } from "../../lib/paneRouter";
import type { PaneId } from "../../types";

interface Props {
  paneId: PaneId;
  tabId: string;
}

/**
 * Live Markdown preview. Re-renders on content change, highlights fenced code
 * blocks and attaches a copy button to each. Also stamps a stable `id` on
 * every rendered heading (T05 / N-07) so outline clicks land on the right
 * DOM element, and reports focus to the pane router so pane-scoped operations
 * (search, replace) target the preview, not the editor.
 */
export default function PreviewPane({ paneId, tabId }: Props) {
  const content = useTabsStore((s) => s.tabs.find((t) => t.id === tabId)?.content ?? "");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = render(content);

    el.querySelectorAll<HTMLElement>("pre code").forEach((block) => {
      highlightElement(block);
    });

    el.querySelectorAll<HTMLElement>("pre").forEach((pre) => {
      if (pre.parentElement?.classList.contains("code-card")) return;
      const card = document.createElement("div");
      card.className = "code-card";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "复制";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? "";
        void navigator.clipboard?.writeText(code);
        btn.textContent = "已复制";
        window.setTimeout(() => {
          btn.textContent = "复制";
        }, 1200);
      });
      pre.parentNode?.insertBefore(card, pre);
      card.appendChild(btn);
      card.appendChild(pre);
    });

    // Stamp stable ids on every <h1..h6> so outline clicks can resolve the
    // matching DOM node. `parseToc` produces the same id sequence the outline
    // panel knows about, so `findHeadingEl` will always succeed here.
    attachHeadingAnchors(el, parseToc(content));
  }, [content]);

  // ---- scroll sync registration (Bug #2) ------------------------------------
  // The preview root is the scroll container (`.preview-content` in
  // preview.css). `getTabId` reads the live store so the panel sees tab swaps
  // without re-registering.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const unregister = registerScrollPane({
      paneId,
      kind: "preview",
      el,
      getTabId: () => usePanesStore.getState().getPane(paneId)?.tabId ?? null,
    });
    return unregister;
  }, [paneId]);

  return (
    <div
      ref={ref}
      className="preview-content scroll-thin"
      data-pane-id={paneId}
      onMouseDownCapture={() => focusPane(paneId)}
      onFocusCapture={() => focusPane(paneId)}
    />
  );
}
