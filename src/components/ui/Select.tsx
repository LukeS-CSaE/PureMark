import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Apple-glass dropdown that matches the app's segmented/switch styling.
 * Rendered through a body portal so the open menu is never clipped by the
 * scrolling settings panel, and flipped upward when there's no room below.
 */
export default function Select({ value, options, onChange, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, below: true });

  const selected = options.find((o) => o.value === value);

  function toggle() {
    const el = triggerRef.current;
    if (!open && el) {
      const r = el.getBoundingClientRect();
      const menuH = Math.min(options.length * 38 + 8, 240);
      const below = r.bottom + menuH <= window.innerHeight - 8;
      setPos({
        top: below ? r.bottom + 6 : r.top - 6,
        left: r.left,
        width: r.width,
        below,
      });
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = triggerRef.current;
      const m = menuRef.current;
      if (t && t.contains(e.target as Node)) return;
      if (m && m.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger${className ? " " + className : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="select-value">{selected?.label ?? value}</span>
        <Icon
          name="ChevronDown"
          size={14}
          className={`select-chevron${open ? " open" : ""}`}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="select-menu"
            role="listbox"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              transform: pos.below ? undefined : "translateY(-100%)",
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`select-option${o.value === value ? " active" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <Icon name="Check" size={13} strokeWidth={3} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
