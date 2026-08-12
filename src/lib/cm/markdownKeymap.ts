/**
 * Markdown inline / block formatting shortcuts for the CodeMirror 6 edit view.
 *
 * These mirror the shortcuts available in the ProseMirror/TipTap live view so
 * that `edit` and `live` behave consistently (task: apply doc-editing
 * shortcuts to the edit pane too).
 *
 * Every command dispatches with `syncAnnotation.of(false)` — it is a genuine
 * user edit (like typing), so the update listener must write it back to the
 * store and forward it to a same-file peer pane; it is NOT a sync backfill.
 */
import { EditorSelection } from "@codemirror/state";
import { type Command, type KeyBinding } from "@codemirror/view";
import { syncAnnotation } from "./setup";

/**
 * Toggle `mark` around the current selection (or cursor). Idempotent:
 *  - Case A: the selection itself already includes the markers → unwrap them.
 *  - Case B: the selection sits *inside* wrapping markers (the char(s) right
 *    before `from` and right after `to` are the mark) → unwrap those. This is
 *    the state right after a wrap, where the cursor lands on the inner text.
 *  - otherwise wrap the selection.
 */
function toggleWrap(mark: string): Command {
  const len = mark.length;
  return ({ state, dispatch }) => {
    const { from, to } = state.selection.main;
    const docLen = state.doc.length;

    // Case A: the markers are part of the selection.
    const selText = state.sliceDoc(from, to);
    if (selText.length >= len * 2 && selText.startsWith(mark) && selText.endsWith(mark)) {
      dispatch(
        state.update({
          changes: [
            { from, to: from + len, insert: "" },
            { from: to - len, to, insert: "" },
          ],
          selection: EditorSelection.range(from, to - len * 2),
          annotations: syncAnnotation.of(false),
        }),
      );
      return true;
    }

    // Case B: selection is nested inside wrapping markers.
    const before = state.sliceDoc(Math.max(0, from - len), from);
    const after = state.sliceDoc(to, Math.min(docLen, to + len));
    if (before === mark && after === mark) {
      const newFrom = from - len;
      const newTo = to - len;
      dispatch(
        state.update({
          changes: [
            { from: newFrom, to: from, insert: "" },
            { from: to, to: to + len, insert: "" },
          ],
          selection: EditorSelection.range(newFrom, newTo),
          annotations: syncAnnotation.of(false),
        }),
      );
      return true;
    }

    // Wrap (cursor or selection).
    dispatch(
      state.update({
        changes: [
          { from, insert: mark },
          { from: to, insert: mark },
        ],
        selection: EditorSelection.range(from + len, to + len),
        annotations: syncAnnotation.of(false),
      }),
    );
    return true;
  };
}

/** Toggle a heading of `level` (1–6) on the line containing the selection.
 *  `level === 0` removes any existing heading. */
function toggleHeading(level: number): Command {
  return ({ state, dispatch }) => {
    const line = state.doc.lineAt(state.selection.main.from);
    const m = /^(#{1,6})\s/.exec(line.text);
    const start = line.from;

    if (m) {
      const hashes = m[1];
      const after = start + hashes.length + 1; // position right after "# "
      if (level === 0 || hashes.length === level) {
        // Remove the heading (same level, or explicit level 0).
        dispatch(
          state.update({
            changes: { from: start, to: after, insert: "" },
            annotations: syncAnnotation.of(false),
          }),
        );
        return true;
      }
      // Different level → rewrite the hashes.
      dispatch(
        state.update({
          changes: { from: start, to: after, insert: "#".repeat(level) + " " },
          annotations: syncAnnotation.of(false),
        }),
      );
      return true;
    }

    if (level === 0) return true; // nothing to remove

    // No heading → add one.
    dispatch(
      state.update({
        changes: { from: start, insert: "#".repeat(level) + " " },
        annotations: syncAnnotation.of(false),
      }),
    );
    return true;
  };
}

/**
 * Insert or format a Markdown link around the selection. Idempotent: if the
 * selection (or the text it sits inside) is already a `[label](url)` link,
 * unwrap to the plain label; otherwise wrap it.
 */
const toggleLink: Command = ({ state, dispatch }) => {
  const { from, to } = state.selection.main;
  const docLen = state.doc.length;
  const text = state.sliceDoc(from, to);
  const linkRe = /^\[([^\]]*)\]\(([^)]*)\)$/;

  // Already a full link → unwrap to plain text.
  if (text.length > 0 && linkRe.test(text)) {
    const mm = linkRe.exec(text)!;
    dispatch(
      state.update({
        changes: { from, to, insert: mm[1] },
        selection: EditorSelection.range(from, from + mm[1].length),
        annotations: syncAnnotation.of(false),
      }),
    );
    return true;
  }

  // Selection sits *inside* a `[label](url)` link → unwrap that link.
  if (from > 0 && to < docLen) {
    let l = from;
    while (l > 0 && state.sliceDoc(l - 1, l) !== "[") l--;
    const lOpen = l - 1; // index of the opening '['
    let r = to;
    while (r < docLen && state.sliceDoc(r, r + 1) !== ")") r++;
    if (lOpen >= 0 && r >= to) {
      const chunk = state.sliceDoc(lOpen, r + 1);
      const m = linkRe.exec(chunk);
      if (m) {
        dispatch(
          state.update({
            changes: { from: lOpen, to: r + 1, insert: m[1] },
            selection: EditorSelection.range(lOpen, lOpen + m[1].length),
            annotations: syncAnnotation.of(false),
          }),
        );
        return true;
      }
    }
  }

  if (text.length > 0) {
    // Wrap selection as link label, select the empty URL.
    const insert = `[${text}](url)`;
    dispatch(
      state.update({
        changes: { from, to, insert },
        selection: EditorSelection.range(from + text.length + 3, from + text.length + 6),
        annotations: syncAnnotation.of(false),
      }),
    );
    return true;
  }

  // Empty selection → insert a stub link, place cursor in the label.
  const insert = "[](url)";
  dispatch(
    state.update({
      changes: { from, insert },
      selection: EditorSelection.range(from + 1, from + 1),
      annotations: syncAnnotation.of(false),
    }),
  );
  return true;
};

/** Bindings applied to the edit (and CM6 live-fallback) view. */
export const markdownFormatKeymap: KeyBinding[] = [
  { key: "Mod-b", run: toggleWrap("**") },
  { key: "Mod-i", run: toggleWrap("*") },
  { key: "Shift-Mod-x", run: toggleWrap("~~") },
  { key: "Mod-e", run: toggleWrap("`") },
  { key: "Mod-k", run: toggleLink },
  { key: "Mod-Alt-1", run: toggleHeading(1) },
  { key: "Mod-Alt-2", run: toggleHeading(2) },
  { key: "Mod-Alt-3", run: toggleHeading(3) },
  { key: "Mod-Alt-4", run: toggleHeading(4) },
  { key: "Mod-Alt-5", run: toggleHeading(5) },
  { key: "Mod-Alt-6", run: toggleHeading(6) },
  { key: "Mod-Alt-0", run: toggleHeading(0) },
];
