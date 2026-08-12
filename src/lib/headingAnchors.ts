/**
 * Heading anchor management for the preview pane (iter2-ext T05 / N-07).
 *
 * `parseToc` (in `./toc`) already produces stable, de-duplicated slugs for
 * every heading. This module mirrors that algorithm so the DOM `id` we set on
 * each rendered `<h1>..<h6>` is byte-identical to the `TocItem.id` the outline
 * panel knows about. Without that contract, clicking an outline entry would
 * never find its DOM counterpart.
 *
 * The module splits into:
 *   - `slugifyHeading` / `dedupeSlugs` — pure, reuse `toc.slugify` internally.
 *   - `applyAnchors`                   — pure DOM-mutation step (testable).
 *   - `attachHeadingAnchors`           — wires `applyAnchors` to a live root.
 *   - `findHeadingEl`                  — DOM lookup used by `tocRouter`.
 */
import { slugify } from "./toc";

export interface AnchorInput {
  text: string;
  line: number;
  index: number;
}

export interface AnchorItem extends AnchorInput {
  id: string;
}

/** URL-friendly heading slug — delegates to `toc.slugify` for algorithm parity. */
export function slugifyHeading(text: string): string {
  return slugify(text);
}

/**
 * Assign stable, de-duplicated ids to a sequence of headings.
 *
 * The algorithm mirrors `parseToc` in `src/lib/toc.ts` exactly so the DOM id
 * we set on each rendered `<h*>` matches the `TocItem.id` the outline panel
 * uses. Empty text degrades to `heading-{index}`. Duplicates suffix with
 * `-1`, `-2`, ... (matching `parseToc`'s `seen` map).
 */
export function dedupeSlugs(items: ReadonlyArray<AnchorInput>): AnchorItem[] {
  const seen = new Map<string, number>();
  const out: AnchorItem[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const base = slugify(item.text);
    let id: string;
    if (base.length === 0) {
      id = `heading-${i}`;
    } else {
      const count = seen.get(base) ?? 0;
      id = count === 0 ? base : `${base}-${count}`;
      seen.set(base, count + 1);
    }
    out.push({ id, text: item.text, line: item.line, index: item.index });
  }
  return out;
}

/**
 * Pure DOM-mutation step: assign each heading element the id from the matching
 * item. Exposed for testing; `attachHeadingAnchors` calls this with the live
 * `querySelectorAll` result.
 *
 * A count mismatch is logged but never throws — the preview pane may briefly
 * hold fewer headings than the outline (e.g. during content updates).
 */
export function applyAnchors(
  headings: ReadonlyArray<HTMLElement>,
  items: ReadonlyArray<{ id: string }>,
): void {
  const len = Math.min(headings.length, items.length);
  if (headings.length !== items.length) {
    console.warn(
      `[headingAnchors] heading count mismatch: DOM has ${headings.length}, items has ${items.length}`,
    );
  }
  for (let i = 0; i < len; i += 1) {
    const heading = headings[i];
    const item = items[i];
    if (!heading || !item) continue;
    heading.id = item.id;
  }
}

/** Set `id` on each `<h1>..<h6>` inside `rootEl` using the supplied items. */
export function attachHeadingAnchors(
  rootEl: HTMLElement,
  items: ReadonlyArray<{ id: string }>,
): void {
  const headings = rootEl.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  applyAnchors(Array.from(headings), items);
}

/**
 * Look up a heading element by id inside `rootEl`. We walk the heading
 * collection instead of `[id="..."]` so we never have to CSS-escape the slug
 * (slugs can contain Unicode letters and digits).
 */
export function findHeadingEl(rootEl: HTMLElement, id: string): HTMLElement | null {
  const headings = rootEl.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
  for (const h of headings) {
    if (h.id === id) return h;
  }
  return null;
}