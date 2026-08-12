/**
 * Pure TOC (table-of-contents) extraction — iter2-ext N-07.
 *
 * `parseToc` walks a Markdown document line by line and returns its ATX
 * headings (`#`..`######`) with their level, cleaned text, 1-based line number
 * and 0-based document index. The extractor is deliberately a *pure* function
 * with no DOM / store / Tauri dependency so it can be unit-tested under
 * vitest's `environment: "node"` (shared knowledge S-11).
 *
 * The single most important invariant (root cause of N-07) is that the fenced
 * code-block state machine skips every `#` that lives inside a ``` or ~~~
 * fence. That is exactly what `marked` does when it renders the preview: it
 * emits `<pre><code>` for fenced blocks and never an `<h*>`. Because both sides
 * skip fences, the heading sequence produced here stays aligned with the
 * `querySelectorAll('h1,...,h6')` order the preview pane later indexes into
 * (T05 / index-based jump). `toc.test.ts` locks this with a back-to-back count
 * comparison against `marked`.
 */
import type { TocItem } from "../types";

/** ATX heading: optional ≤3 leading spaces, 1–6 `#`, then text or EOL. */
const HEADING_RE = /^( {0,3})(#{1,6})(?:\s+(.*?))?\s*$/;

/** Opening fence: a run of ≥3 backticks or tildes (info string ignored). */
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})/;

/** Closing fence: same marker, ≥ opening length, no info string allowed. */
const FENCE_CLOSE_RE = /^( {0,3})(`{3,}|~{3,})\s*$/;

/** Strip inline Markdown emphasis / links / code / html from heading text. */
function cleanText(raw: string): string {
  let s = raw;
  // Images first (so the leading `!` is consumed before the link rule runs).
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links -> visible text.
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Inline code.
  s = s.replace(/`([^`]+)`/g, "$1");
  // Bold, then italic (order matters: `**` before `*`).
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1");
  // Strikethrough.
  s = s.replace(/~~([^~]+)~~/g, "$1");
  // Residual HTML tags.
  s = s.replace(/<[^>]+>/g, "");
  return s.trim();
}

/**
 * Produce a URL/anchor-safe slug from heading text.
 *
 * Keeps Unicode letters and digits (so Chinese headings keep their characters)
 * and replaces runs of whitespace / punctuation with a single dash. Exported
 * for the preview-side anchor scheme used by T05; `parseToc` uses it to build
 * stable React keys.
 */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract the document outline.
 *
 * @param md Markdown source.
 * @returns Headings in document order. Empty input / no headings -> `[]`.
 */
export function parseToc(md: string): TocItem[] {
  if (!md) return [];
  const lines = md.split("\n");
  const items: TocItem[] = [];
  const seen = new Map<string, number>();

  let inFence = false;
  let fenceChar = "";
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (!inFence) {
      const open = FENCE_OPEN_RE.exec(line);
      if (open) {
        const marker = open[2];
        fenceChar = marker[0];
        fenceLen = marker.length;
        inFence = true;
        continue;
      }

      const m = HEADING_RE.exec(line);
      if (m) {
        const level = m[2].length;
        const rawText = (m[3] ?? "").replace(/\s+#+\s*$/, "");
        const text = cleanText(rawText);
        const base = text.length > 0 ? slugify(text) : "";
        let id: string;
        if (base.length === 0) {
          id = `heading-${items.length}`;
        } else {
          const count = seen.get(base) ?? 0;
          id = count === 0 ? base : `${base}-${count}`;
          seen.set(base, count + 1);
        }
        items.push({ id, level, text, line: i + 1, index: items.length });
      }
    } else {
      const close = FENCE_CLOSE_RE.exec(line);
      if (close) {
        const marker = close[2];
        if (marker[0] === fenceChar && marker.length >= fenceLen) {
          inFence = false;
        }
      }
    }
  }

  return items;
}
