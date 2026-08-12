import { useTabsStore } from "../../store/useTabsStore";
import { useEditorStats } from "../../hooks/useEditorStats";
import { useConfigStore } from "../../store/useConfigStore";
import { useUIStore } from "../../store/useUIStore";
import type { TocPosition } from "../../types";
import Icon from "../ui/Icon";

/** 34px status bar: cursor position + document stats + TOC controls + encoding. */
export default function StatusBar() {
  const active = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
  const stats = useEditorStats(
    active?.content ?? "",
    active?.cursor ?? { line: 1, col: 1 },
  );

  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);

  function handleToggleToc() {
    const next = !tocVisible;
    useConfigStore.getState().update({ tocVisible: next });
    if (tocPosition === "left") {
      useUIStore.getState().setSidebarMode(next ? "toc" : "files");
    }
  }

  function handleToggleTocPosition() {
    const nextPos: TocPosition = tocPosition === "left" ? "right" : "left";
    useConfigStore.getState().update({ tocPosition: nextPos });
    if (nextPos === "right") {
      useUIStore.getState().setSidebarMode("files");
    } else if (useConfigStore.getState().config.tocVisible) {
      useUIStore.getState().setSidebarMode("toc");
    }
  }

  return (
    <footer className="app-statusbar">
      <div className="status-item">
        <span>{stats.lines} Ln </span>
        <span>{stats.words} words</span>
        <span>{stats.chars} charts</span>
      </div>

      <div className="status-item status-right">
        <div className="segment-group toc-controls" role="group" aria-label="目录控制">
          <button
            type="button"
            className={`segment${tocVisible ? " active" : ""}`}
            title={tocVisible ? "隐藏目录" : "显示目录"}
            aria-pressed={tocVisible}
            onClick={handleToggleToc}
          >
            目录
          </button>
          {tocVisible && (
            <button
              type="button"
              className="segment"
              title={tocPosition === "left" ? "目录移到右侧" : "目录移到左侧"}
              aria-label={tocPosition === "left" ? "目录移到右侧" : "目录移到左侧"}
              onClick={handleToggleTocPosition}
            >
              <Icon name={tocPosition === "left" ? "PanelRight" : "PanelLeft"} size={14} />
            </button>
          )}
        </div>

        <span>UTF-8</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}
