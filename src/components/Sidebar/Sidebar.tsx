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

  // 文件⇄目录合并为单个切换按钮：图标/文案指向切换目标，点击在两种模式间翻转。
  const switchTarget: SidebarMode = sidebarMode === "files" ? "toc" : "files";

  return (
    <aside className="app-sidebar" style={{ width: sidebarWidth }}>
      <div className="app-sidebar-head">
        <span className="explorer-label">文件目录</span>
        <div className="flex items-center gap-0.5">
          {showTocSwitch && (
            <button
              type="button"
              className="segment"
              title={switchTarget === "toc" ? "切换到目录" : "切换到文件"}
              aria-label={switchTarget === "toc" ? "切换到目录" : "切换到文件"}
              onClick={() => selectSidebarMode(switchTarget)}
            >
              {/* 目录侧用 lucide 原生 ListTree（注册键 ListTreeRaw；非 toolbar 的 ListTreeFramed 合成图标） */}
              <Icon name={switchTarget === "toc" ? "ListTreeRaw" : "List"} size={14} />
            </button>
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
