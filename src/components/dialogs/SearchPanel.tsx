import { useEffect, useMemo, useRef, useState } from "react";
import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { getFocusedOrAnyEditor, getPeerEditors } from "../../lib/editorRegistry";
import { findMatches, type SearchMatch, jumpToMatch } from "../../lib/search";
import Icon from "../ui/Icon";

/**
 * Build a centered snippet around the match so the highlighted text shows up
 * in the middle of the result row (instead of being clipped off-screen when a
 * line is long). Mirrors how editor search results keep the match centered:
 * take `ctx` chars of leading/trailing context, ellipsize the long side.
 */
const SNIPPET_CTX = 10;
function buildSnippet(lineText: string, colStart: number, colEnd: number) {
  const before = lineText.slice(0, colStart);
  const match = lineText.slice(colStart, colEnd);
  const after = lineText.slice(colEnd);
  const lead = before.length > SNIPPET_CTX ? before.slice(before.length - SNIPPET_CTX) : before;
  const trail = after.length > SNIPPET_CTX ? after.slice(0, SNIPPET_CTX) : after;
  return {
    headEllipsis: before.length > SNIPPET_CTX,
    lead,
    match,
    trail,
    tailEllipsis: after.length > SNIPPET_CTX,
  };
}

/**
 * Find panel (v2). Computes matches via the pure `findMatches` helper, shows a
 * smart count, highlights matches in a scrollable result list, and jumps the
 * active textarea selection to the previous/next match (Enter = next,
 * Shift+Enter = previous, Esc = close). The currently focused match is
 * distinguished with an orange accent.
 */
export default function SearchPanel() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const active = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  const matches: SearchMatch[] = useMemo(
    () => findMatches(active?.content ?? "", query),
    [active?.content, query],
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // Keep the focused result item in view while navigating.
  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function jumpTo(i: number) {
    if (matches.length === 0 || !active) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    const m = matches[idx];

    // 跳转所有展示当前文档的窗格（edit / live / preview 均已注册 EditorHandle）。
    // 用 getPeerEditors(active.id, "__none__") 取同 tabId 的全部 handle，
    // 避免 getFocusedOrAnyEditor() 在分屏/焦点错乱时指向别的文档导致跳转错位。
    let editors = getPeerEditors(active.id, "__none__");
    if (editors.length === 0) {
      const fallback = getFocusedOrAnyEditor();
      if (fallback) editors = [fallback];
    }
    for (const ed of editors) jumpToMatch(ed, m, idx);

    setIndex(idx);
  }

  // Global keys so navigation keeps working after the textarea grabs focus.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setSearchOpen(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        jumpTo(index + (e.shiftKey ? -1 : 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, matches, active?.id]);

  return (
    <div className="popover popover-float" style={{ top: 60, right: 20, width: 320 }}>
      <div className="p-3">
        {/* Search field: icon (left) + input (fill) + close (right) */}
        <div className="search-field">
          <Icon name="Search" size={15} className="search-icon" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="查找…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="search-close"
            title="关闭 (Esc)"
            onClick={() => setSearchOpen(false)}
          >
            <Icon name="X" size={15} />
          </button>
        </div>

        {/* Count + navigation row */}
        <div className="flex items-center justify-between gap-2">
          <span className="search-count">
            {query
              ? matches.length > 0
                ? `找到 ${matches.length} 条匹配结果`
                : "未找到匹配结果"
              : ""}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="btn-icon"
              title="上一个 (Shift+Enter)"
              onClick={() => jumpTo(index - 1)}
            >
              <Icon name="ArrowUp" size={15} />
            </button>
            <button
              type="button"
              className="btn-icon"
              title="下一个 (Enter)"
              onClick={() => jumpTo(index + 1)}
            >
              <Icon name="ArrowDown" size={15} />
            </button>
          </div>
        </div>

        {/* Result list */}
        {matches.length > 0 && (
          <div className="search-result-list">
            {matches.map((m, i) => (
              <button
                type="button"
                key={i}
                ref={i === index ? activeItemRef : undefined}
                className={`search-result-item${i === index ? " active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => jumpTo(i)}
                onContextMenu={(e) => {
                  // 需求2：搜索结果项自定义右键菜单（替换原生，原生已被全局 guard 压制）。
                  e.preventDefault();
                  const matchText = m.lineText.slice(m.colStart, m.colEnd);
                  useUIStore.getState().openContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    scope: "search",
                    items: [
                      { id: "jump", label: "跳转至此结果", icon: "ChevronRight", run: () => jumpTo(i) },
                      { separator: true, id: "sep-s1" },
                      {
                        id: "copyMatch",
                        label: "复制匹配文本",
                        icon: "Copy",
                        run: () => void navigator.clipboard?.writeText(matchText),
                      },
                      {
                        id: "copyLine",
                        label: "复制整行",
                        icon: "ClipboardPaste",
                        run: () => void navigator.clipboard?.writeText(m.lineText),
                      },
                    ],
                  });
                }}
              >
                <span className="search-result-line">{m.lineNo}</span>
                <span className="search-result-snippet">
                  {(() => {
                    const s = buildSnippet(m.lineText, m.colStart, m.colEnd);
                    return (
                      <>
                        {s.headEllipsis && <span className="search-ellipsis">…</span>}
                        {s.lead}
                        <mark className="search-hl">{s.match}</mark>
                        {s.trail}
                        {s.tailEllipsis && <span className="search-ellipsis">…</span>}
                      </>
                    );
                  })()}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
