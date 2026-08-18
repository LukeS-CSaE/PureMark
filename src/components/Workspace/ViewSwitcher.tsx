import { usePanesStore } from "../../store/usePanesStore";
import { useConfigStore } from "../../store/useConfigStore";
import type { ViewMode } from "../../types";
import Icon from "../ui/Icon";

/** 视图分段控件选项。编辑（edit）仅在开启 CodeMirror 源码编辑器时出现。 */
const MODE_OPTIONS: { mode: ViewMode; icon: "Edit3" | "FileText" | "Eye"; label: string }[] = [
  { mode: "edit", icon: "Edit3", label: "编辑" },
  { mode: "live", icon: "FileText", label: "实时" },
  { mode: "preview", icon: "Eye", label: "预览" },
];

/** 聚焦 pane 的视图模式分段控件。 */
export default function ViewSwitcher() {
  const viewMode = usePanesStore((s) => s.getFocusedPane().viewMode);
  const focusedPaneId = usePanesStore((s) => s.focusedPaneId);
  const setPaneViewMode = usePanesStore((s) => s.setPaneViewMode);
  const useCmSource = useConfigStore((s) => s.config.useCodeMirrorSource);

  // 未开启 CM 源码编辑器时，edit 已合并进 live，不暴露独立「编辑」选项。
  const options = useCmSource ? MODE_OPTIONS : MODE_OPTIONS.filter((o) => o.mode !== "edit");
  // edit 合并进 live：当前为 edit（旧配置/默认视图=edit）时高亮「实时」。
  const activeMode: ViewMode = !useCmSource && viewMode === "edit" ? "live" : viewMode;

  return (
    <div className="segment-group flex items-center">
      {options.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          className={`segment${activeMode === opt.mode ? " active" : ""}`}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={activeMode === opt.mode}
          onClick={() => setPaneViewMode(focusedPaneId, opt.mode)}
        >
          <Icon name={opt.icon} size={14} />
        </button>
      ))}
    </div>
  );
}
