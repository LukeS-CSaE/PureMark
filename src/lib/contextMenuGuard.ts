/**
 * Right-click suppression for the main app surfaces (iter2-ext T05 / N-18).
 *
 * The user requirement is that the native browser context menu does not pop up
 * over the app's content surfaces — workspace, editor pane, file tree, preview
 * pane — but it MUST continue to work inside form controls (paste in inputs,
 * spell-check in textareas) and inside the CodeMirror editor.
 *
 * The pure function `shouldSuppressContextMenu` is split out from the React
 * effect so it can be unit-tested without jsdom; the listener itself is
 * installed by `App.tsx` in the capture phase so it runs before CM6's own
 * contextmenu handler (which would otherwise eat the event first).
 */

const SUPPRESS_SELECTOR = ".app-workspace, .editor-pane, .file-tree, .preview-content";

/**
 * Form controls and the CodeMirror host — the default right-click menu is
 * useful here (paste, spell-check, native CM commands).
 */
const EXEMPT_SELECTOR =
  "input, textarea, button, select, [contenteditable], .cm-content, .cm-editor";

/**
 * Whether a contextmenu event on `target` should be suppressed.
 *
 * Returns `true` when the right-click originated inside one of the app's
 * content surfaces. The caller should `preventDefault()` +
 * `stopPropagation()` to keep the browser's native menu from popping up.
 *
 * Returns `false` for `null` targets, non-Element targets, and targets inside
 * the exempt list (form controls, CodeMirror host).
 */
export function shouldSuppressContextMenu(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { closest?: (sel: string) => Element | null };
  if (typeof el.closest !== "function") return false;
  // Exempt interactive elements first — the default menu is useful there.
  if (el.closest(EXEMPT_SELECTOR)) return false;
  return el.closest(SUPPRESS_SELECTOR) !== null;
}