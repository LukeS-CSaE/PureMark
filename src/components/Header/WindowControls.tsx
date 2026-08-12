import { minimizeWindow, toggleMaximizeWindow, closeWindow } from "../../lib/tauri";
import Icon from "../ui/Icon";

/** Minimize / maximize / close buttons wired to the Tauri window API. */
export default function WindowControls() {
  return (
    <div className="flex items-center gap-2 text-foreground-subtle">
      <button
        type="button"
        className="btn-icon"
        title="最小化"
        aria-label="最小化"
        onClick={() => void minimizeWindow()}
      >
        <Icon name="Minus" size={16} />
      </button>
      <button
        type="button"
        className="btn-icon"
        title="最大化"
        aria-label="最大化"
        onClick={() => void toggleMaximizeWindow()}
      >
        <Icon name="Square" size={14} />
      </button>
      <button
        type="button"
        className="btn-icon"
        title="关闭"
        aria-label="关闭"
        onClick={() => void closeWindow()}
      >
        <Icon name="X" size={16} />
      </button>
    </div>
  );
}
