import { useMemo } from "react";
import type { Cursor, EditorStats } from "../types";

/** Count "words": each CJK ideograph counts as one, each latin/number run as one. */
function countWords(value: string): number {
  if (!value) return 0;
  const cjk = value.match(/[一-鿿]/g)?.length ?? 0;
  const latin = value.match(/[A-Za-z0-9_]+(?:['-][A-Za-z0-9_]+)*/g)?.length ?? 0;
  return cjk + latin;
}

/**
 * Pure document statistics. Lines are counted from newlines (empty doc = 1);
 * words use the CJK-aware counter above; chars is the raw character count.
 */
export function computeStats(
  value: string,
): { lines: number; words: number; chars: number } {
  const lines = value.length === 0 ? 1 : value.split("\n").length;
  return { lines, words: countWords(value), chars: value.length };
}

/**
 * Compute the editor statistics for the status bar. `cursor` already carries
 * the 1-based line/col (updated by the textarea on selection change).
 */
export function useEditorStats(content: string, cursor: Cursor): EditorStats {
  return useMemo(() => {
    const { lines, words, chars } = computeStats(content);
    return { line: cursor.line, col: cursor.col, lines, words, chars };
  }, [content, cursor.line, cursor.col]);
}
