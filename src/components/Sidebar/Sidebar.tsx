import { type MouseEvent } from "react";
import OpenFolderButton from "./OpenFolderButton";
import FileTree from "./FileTree";
import TocPanel from "../Toc/TocPanel";
import { useUIStore } from "../../store/useUIStore";
import { useConfigStore } from "../../store/useConfigStore";
import type { SidebarMode } from "../../types";
import Icon from "../ui/Icon";

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

/** Sidebar container: EXPLORER header row (open folder + collapse) + file tree. */
export default function Sidebar() {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth);
  const sidebarMode = useUIStore((s) => s.sidebarMode);

  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);

  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = useUIStore.getState().sidebarWidth;

    const onMove = (ev: globalThis.MouseEvent) => {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX)),
      );
      setSidebarWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      useConfigStore.getState().update({
        sidebarWidth: useUIStore.getState().sidebarWidth,
      });
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // The files⇄toc segmented control only appears when the outline is docked in
  // the left sidebar, mirroring the toolbar's position toggle (iter2-ext N-16).
  const showTocSwitch = tocPosition === "left" && tocVisible;

  const selectSidebarMode = (mode: SidebarMode) => {
    useUIStore.getState().setSidebarMode(mode);
  };

  return (
    <aside className="app-sidebar" style={{ width: sidebarWidth }}>
      <div className="app-sidebar-head">
        <span className="explorer-label">文件目录</span>
        <div className="flex items-center gap-0.5">
          {showTocSwitch && (
            <div className="toc-switch" role="group" aria-label="切换文件树与目录">
              <button
                type="button"
                className={`segment${sidebarMode === "files" ? " active" : ""}`}
                title="文件"
                aria-label="文件"
                aria-pressed={sidebarMode === "files"}
                onClick={() => selectSidebarMode("files")}
              >
                <Icon name="List" size={14} />
              </button>
              <button
                type="button"
                className={`segment${sidebarMode === "toc" ? " active" : ""}`}
                title="目录"
                aria-label="目录"
                aria-pressed={sidebarMode === "toc"}
                onClick={() => selectSidebarMode("toc")}
              >
                <Icon name="ListTree" size={14} />
              </button>
            </div>
          )}
          <OpenFolderButton />
        </div>
      </div>
      <div className="file-card">
        {showTocSwitch && sidebarMode === "toc" ? (
          <TocPanel />
        ) : (
          <div className="file-scroll">
            <FileTree />
          </div>
        )}
      </div>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整侧边栏宽度"
        onMouseDown={startResize}
      />
    </aside>
  );
}
