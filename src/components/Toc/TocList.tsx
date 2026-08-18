import type { TocItem } from "../../types";

export interface TocListProps {
  /** Headings of the current document, in document order. */
  items: TocItem[];
  /** Called when the user clicks a heading; wires to `jumpToHeading` (T03). */
  onJump: (item: TocItem) => void;
}

/**
 * Renders the document outline as an indented, clickable list.
 *
 * Indentation follows each heading's `level` (h1 sits shallowest, h6 deepest),
 * so the visual hierarchy mirrors the Markdown source. Clicking an item calls
 * `onJump` — in practice `useToc` wires this to `jumpToHeading`, which focuses
 * the target pane then scrolls it (T03). When the document has no headings we
 * show an empty-state hint instead of a blank panel (PM N-07).
 */
export default function TocList({ items, onJump }: TocListProps) {
  if (items.length === 0) {
    return <div className="toc-empty"> </div>;
  }

  return (
    <ul className="toc-list">
      {items.map((item) => (
        <li key={item.id} className="toc-item">
          <button
            type="button"
            className="toc-link"
            title={item.text}
            style={{ paddingLeft: 10 + (item.level - 1) * 14 }}
            onClick={() => onJump(item)}
          >
            {item.text}
          </button>
        </li>
      ))}
    </ul>
  );
}
