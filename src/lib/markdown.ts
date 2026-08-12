/**
 * Markdown rendering. Uses `marked` with GFM enabled (headings, lists, quotes,
 * task lists, tables, strikethrough). Raw HTML is allowed so `<kbd>` and other
 * inline HTML render as authored (local, single-user context).
 */
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Render a Markdown string to HTML. */
export function render(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string;
}

export default render;
