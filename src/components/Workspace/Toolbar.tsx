import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { openFileDialog, readFileText } from "../../commands/fsCommands";
import { newUntitledInFocusedPane, openInFocusedPane } from "../../lib/paneRouter";
import Button from "../ui/Button";
import ViewSwitcher from "./ViewSwitcher";
import { useConfigStore } from "../../store/useConfigStore";
import Icon from "../ui/Icon";

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

  async function handleNew() {
    newUntitledInFocusedPane();
  }

  async function handleOpen() {
    const path = await openFileDialog();
    if (!path) return;
    const content = await readFileText(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    openInFocusedPane({ path, name, content });
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
        <Button icon="Search" title="查找" onClick={() => setSearchOpen(true)} />
        <Button icon="Settings" title="设置" onClick={() => setConfigOpen(true)} />
      </div>
    </div>
  );
}
