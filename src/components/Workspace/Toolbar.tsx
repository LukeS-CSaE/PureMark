import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { openFileDialog, readFileTextWithEncoding } from "../../commands/fsCommands";
import { newUntitledInFocusedPane, openInFocusedPane } from "../../lib/paneRouter";
import { guardRefresh } from "../../lib/refreshGuard";
import Button from "../ui/Button";
import ViewSwitcher from "./ViewSwitcher";
import { useConfigStore } from "../../store/useConfigStore";
import Icon from "../ui/Icon";
import type { TocPosition } from "../../types";

/**
 * 46px toolbar: file actions, the view switcher, and search / settings.
 * The quick-format buttons are intentionally hidden; the formatting engine
 * still lives in `src/lib/format.ts` and can be re-surfaced later.
 */
export default function Toolbar() {
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);
  const setConfigOpen = useUIStore((s) => s.setConfigOpen);

  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const tocVisible = useConfigStore((s) => s.config.tocVisible);
  const tocPosition = useConfigStore((s) => s.config.tocPosition);

  function handleToggleSidebar() {
    toggleSidebar();
    useConfigStore.getState().update({ sidebarVisible: !sidebarVisible });
  }

  /** Toggle the outline. Left-docked outlines also flip `sidebarMode`. */
  function handleToggleToc() {
    const next = !tocVisible;
    useConfigStore.getState().update({ tocVisible: next });
    if (tocPosition === "left") {
      useUIStore.getState().setSidebarMode(next ? "toc" : "files");
    }
  }

  /**
   * 切换目录停靠方向（左 / 右）。逻辑与 StatusBar 保持一致：
   * - 切到右时，侧边栏让位给文件树（sidebarMode = 'files'）；
   * - 切回左且目录仍开启时，侧边栏回到目录（sidebarMode = 'toc'）。
   */
  function handleToggleTocPosition() {
    const nextPos: TocPosition = tocPosition === "left" ? "right" : "left";
    useConfigStore.getState().update({ tocPosition: nextPos });
    if (nextPos === "right") {
      useUIStore.getState().setSidebarMode("files");
    } else if (useConfigStore.getState().config.tocVisible) {
      useUIStore.getState().setSidebarMode("toc");
    }
  }

  async function handleNew() {
    newUntitledInFocusedPane();
  }

  async function handleOpen() {
    const path = await openFileDialog();
    if (!path) return;
    // 编码自动检测（UTF-8 / GBK / GB2312 / Big5 / UTF-16），保存时按原编码写回。
    const { content, encoding, hadBom } = await readFileTextWithEncoding(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    openInFocusedPane({ path, name, content, encoding, hadBom });
  }

  async function handleSave() {
    await useTabsStore.getState().saveActive();
  }

  return (
    <div className="toolbar">

      <div className="tool-group">
        <button
          type="button"
          className="btn-icon"
          title={sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
          aria-label={sidebarVisible ? "隐藏侧边栏" : "显示侧边栏"}
          onClick={handleToggleSidebar}
        >
          <Icon name={sidebarVisible ? "PanelLeftClose" : "PanelLeftOpen"} size={16} />
        </button>

        <Button
          icon="ListTree"
          title={tocVisible ? "隐藏目录" : "显示目录"}
          active={tocVisible}
          onClick={handleToggleToc}
        />

        {/* 仅当目录已开启时，才显示"目录停靠左/右切换"按钮 */}
        {tocVisible && (
          <Button
            icon={tocPosition === "left" ? "PanelLeft" : "PanelRight"}
            title={tocPosition === "left" ? "目录移到右侧" : "目录移到左侧"}
            onClick={handleToggleTocPosition}
          />
        )}

        {/* <span className="tool-sep" /> */}

      </div>

      <span className="tool-sep" />

      <div className="tool-group">
        <Button icon="FilePlus" title="新建" onClick={() => void handleNew()} />
        <Button icon="FileText" title="打开文件" onClick={() => void handleOpen()} />
        <Button icon="Save" title="保存 (Ctrl+S)" onClick={() => void handleSave()} />
      </div>

      <span className="tool-sep" />

      <ViewSwitcher />



      <div className="ml-auto tool-group">
        <Button icon="RefreshCw" title="刷新 (Ctrl+R)" onClick={() => void guardRefresh()} />
        <Button icon="Search" title="查找" onClick={() => setSearchOpen(true)} />
        <Button icon="Settings" title="设置" onClick={() => setConfigOpen(true)} />
      </div>
    </div>
  );
}
