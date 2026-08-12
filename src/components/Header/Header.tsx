import WindowControls from "./WindowControls";
import logoUrl from "../../assets/logo.png";

/**
 * 40px custom title bar: app logo + product name on the left, window controls
 * on the right.
 *
 * The bar and each of its non-interactive children carry
 * `data-tauri-drag-region` because Tauri tests the attribute on the exact
 * event target and never walks up ancestors — a container-only attribute
 * would leave most of the strip undraggable. The logo additionally sets
 * `draggable={false}` so the browser's native image drag does not swallow the
 * window-drag gesture.
 */
export default function Header() {
  return (
    <header className="app-header" data-tauri-drag-region>
      <div className="flex items-center gap-2" data-tauri-drag-region>
        <img
          src={logoUrl}
          alt=""
          width={18}
          height={18}
          className="rounded-[4px]"
          draggable={false}
          data-tauri-drag-region
        />
        <span className="text-[15px] font-bold" data-tauri-drag-region>
          PureMark
        </span>
      </div>
      <WindowControls />
    </header>
  );
}
