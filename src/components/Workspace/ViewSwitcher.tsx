import { usePanesStore } from "../../store/usePanesStore";
import type { ViewMode } from "../../types";
import Icon from "../ui/Icon";


const MODE_OPTIONS: { mode: ViewMode; icon: "Edit3" | "FileText" | "Eye"; label: string }[] = [
  { mode: "edit", icon: "Edit3", label: "编辑" },
  { mode: "live", icon: "FileText", label: "实时" },
  { mode: "preview", icon: "Eye", label: "预览" },
];

/** 聚焦 pane 的视图模式分段控件 + single/split 切换。 */
export default function ViewSwitcher() {
  const viewMode = usePanesStore((s) => s.getFocusedPane().viewMode);
  const focusedPaneId = usePanesStore((s) => s.focusedPaneId);
  const setPaneViewMode = usePanesStore((s) => s.setPaneViewMode);

  return (
    <div className="segment-group flex items-center">
      {/* <button
        type="button"
        className={`segment${layout === "split" ? " active" : ""}`}
        title={layout === "split" ? "退出分屏" : "分屏"}
        aria-label={layout === "split" ? "退出分屏" : "分屏"}
        aria-pressed={layout === "split"}
        onClick={() => splitToggle()}
      >
        <Icon name="Columns" size={14} />
      </button> */}
      {MODE_OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          className={`segment${viewMode === opt.mode ? " active" : ""}`}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={viewMode === opt.mode}
          onClick={() => setPaneViewMode(focusedPaneId, opt.mode)}
        >
          <Icon name={opt.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
