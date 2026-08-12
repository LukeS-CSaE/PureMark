import { useEffect, useMemo, useRef, useState } from "react";
import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { getFocusedOrAnyEditor } from "../../lib/editorRegistry";
import { findMatches, type SearchMatch, jumpToMatch } from "../../lib/search";
import Icon from "../ui/Icon";

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
    const ed = getFocusedOrAnyEditor();
    if (ed) {
      // Talk to the CM6 EditorHandle (setSelection scrolls into view + focus
      // internally). The legacy textarea bridge returns null in live/edit mode,
      // so a textarea jump would silently no-op here.
      jumpToMatch(ed, m);
    }
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
              >
                <span className="search-result-line">{m.lineNo}</span>
                <span className="search-result-snippet">
                  {m.lineText.slice(0, m.colStart)}
                  <mark className="search-hl">{m.lineText.slice(m.colStart, m.colEnd)}</mark>
                  {m.lineText.slice(m.colEnd)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
