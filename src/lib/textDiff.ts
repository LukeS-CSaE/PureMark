/**
 * Minimal text diff (design §2, T02 step 2.8).
 *
 * When the store's copy of a document diverges from what a CodeMirror instance
 * holds, replacing the whole document would destroy the caret, the scroll
 * offset and the undo history. Instead we compute the smallest single-range
 * edit that turns `oldText` into `newText` by stripping the common prefix and
 * the common suffix.
 *
 * This is intentionally NOT a general diff algorithm: a single contiguous
 * change covers every realistic case (typing, paste, formatting command,
 * autosave round-trip) and costs O(n) with no allocation.
 */

export interface MinimalChange {
  /** Start offset of the replaced range in `oldText` (0-based, inclusive). */
  from: number;
  /** End offset of the replaced range in `oldText` (0-based, exclusive). */
  to: number;
  /** Text inserted in place of `[from, to)`. */
  insert: string;
}

/**
 * Compute the smallest single-range replacement between two strings.
 * Returns `null` when the strings are identical (nothing to dispatch).
 */
export function minimalChange(oldText: string, newText: string): MinimalChange | null {
  if (oldText === newText) return null;

  const oldLen = oldText.length;
  const newLen = newText.length;
  const maxPrefix = Math.min(oldLen, newLen);

  // Longest common prefix.
  let prefix = 0;
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix += 1;
  }

  // Longest common suffix that does not overlap the prefix on either side.
  const maxSuffix = maxPrefix - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
  ) {
    suffix += 1;
  }

  return {
    from: prefix,
    to: oldLen - suffix,
    insert: newText.slice(prefix, newLen - suffix),
  };
}
