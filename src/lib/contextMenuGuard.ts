/**
 * Suppression of the WebView native context menu across the whole app
 * (iter2-ext T05 / N-18, 需求2 — "禁用 WebView 原生右键菜单").
 *
 * Strategy (v3): **suppress the native context menu everywhere — no exceptions.**
 *
 *   - Every right-click anywhere in the app is suppressed (preventDefault),
 *     INCLUDING inside `<input>` / `<textarea>`. This is what 需求2 ("禁用
 *     WebView 原生右键菜单") and Q2 ("输入框不需要自定义右键……仅禁用右键即可")
 *     actually ask for: a consistent custom-menu-only experience. Text fields
 *     lose the native menu, but Ctrl+V / Ctrl+A / Ctrl+C still work, so no
 *     real capability is lost.
 *   - This replaces the old allow-list (`.app-workspace`, `.editor-pane`,
 *     `.file-tree`, `.pm-live`) and the v2 "exempt input/textarea" rule.
 *   - CodeMirror's editor (`.cm-content` / `.cm-editor`) is suppressed here;
 *     it raises its own custom menu via a React `onContextMenu` handler (which
 *     also calls `preventDefault`), so the native menu never shows.
 *   - The ProseMirror live view (`.pm-live` / `.ProseMirror`) is *contenteditable*
 *     and suppressed as well (native menu disabled; custom live-view menu is
 *     deferred per 需求2).
 *
 * The pure function `shouldSuppressContextMenu` is split out from the React
 * effect so it can be unit-tested without jsdom; the listener itself is
 * installed by `App.tsx` in the capture phase so it runs before CM6's own
 * contextmenu handler (which would otherwise eat the event first).
 */

/**
 * Optional allow-list of elements that keep the native context menu.
 *
 * Kept empty on purpose: per 需求2 / Q2 the native WebView context menu is
 * disabled *everywhere*, including text inputs. If a future feature genuinely
 * needs the native menu back on some element, list its selector here (e.g.
 * `"input.special"`) — the guard below no-ops when this is empty.
 */
const EXEMPT_SELECTOR = "";

/**
 * Whether a contextmenu event on `target` should be suppressed.
 *
 * Returns `true` (suppress the native menu) for any resolvable `Element`
 * target. The caller should `preventDefault()` (but not `stopPropagation`)
 * so custom menus opened in the bubble phase (editor / file-tree / tabs /
 * search results) still fire.
 *
 * Returns `false` (keep native) only when `target` is `null` or cannot be
 * resolved to an `Element`. With `EXEMPT_SELECTOR` empty (default), no
 * element keeps the native menu.
 */
export function shouldSuppressContextMenu(target: EventTarget | null): boolean {
  // Bail out for non-Element targets to avoid false positives.
  if (!target || typeof target !== "object") return false;

  let el: Element | null = null;
  if (typeof (target as Element).closest === "function") {
    el = target as Element;
  } else {
    // Robustness: a contextmenu target is normally an Element, but fall back
    // to the first node in the composed path if needed.
    const path = (target as { composedPath?: () => EventTarget[] }).composedPath?.();
    const first = path?.[0];
    if (first && typeof (first as Element).closest === "function") {
      el = first as Element;
    }
  }
  if (!el) return false;

  // Suppress everywhere by default. EXEMPT_SELECTOR is intentionally empty
  // (需求2 / Q2: 禁用 WebView 原生右键菜单，含 input/textarea). The guard
  // avoids calling closest("") which would throw on an invalid empty selector.
  if (EXEMPT_SELECTOR && el.closest(EXEMPT_SELECTOR)) return false;
  return true;
}
