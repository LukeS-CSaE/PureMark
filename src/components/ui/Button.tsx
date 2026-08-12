import type { ReactNode, MouseEventHandler } from "react";
import type { IconName } from "./Icon";
import Icon from "./Icon";

export interface ButtonProps {
  /** Icon name when rendering an icon button. */
  icon?: IconName;
  /** Text label (used for accessibility / tooltips). */
  title?: string;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Marks the button as active (primary-soft background). */
  active?: boolean;
  /** Disables interaction. */
  disabled?: boolean;
  /** Icon pixel size. */
  size?: number;
  /** Children for non-icon (label) buttons. */
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * 30x30 rounded icon button primitive used throughout the toolbar and chrome.
 * When `icon` is provided it renders an icon-only button; otherwise it renders
 * a label button (`children`).
 */
export default function Button({
  icon,
  title,
  className = "",
  active = false,
  disabled = false,
  size = 16,
  children,
  onClick,
}: ButtonProps) {
  const base = `btn-icon${active ? " active" : ""}`;
  const cls = className ? `${base} ${className}` : base;

  return (
    <button
      type="button"
      className={cls}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} size={size} /> : children}
    </button>
  );
}
