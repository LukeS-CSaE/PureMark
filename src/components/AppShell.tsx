import Header from "./Header/Header";
import Sidebar from "./Sidebar/Sidebar";
import Workspace from "./Workspace/Workspace";
import StatusBar from "./StatusBar/StatusBar";
import SearchPanel from "./dialogs/SearchPanel";
import SettingsPanel from "./dialogs/SettingsPanel";
import UnsavedDialog from "./dialogs/UnsavedDialog";
import ConflictResolvePage from "./dialogs/ConflictResolvePage";
import ExternalChangeBar from "./dialogs/ExternalChangeBar";
import ContextMenu from "./ContextMenu";
import { useUIStore } from "../store/useUIStore";
import { useConfigStore } from "../store/useConfigStore";

/**
 * Top-level layout: header + (sidebar | workspace) + status bar, with the
 * search and settings popovers rendered as fixed overlays on top.
 * 需求1 的确认弹窗 / 冲突解决页 / 外部改动提示条也在此顶层挂载。
 */
export default function AppShell() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const configOpen = useUIStore((s) => s.configOpen);
  const showScrollbar = useConfigStore((s) => s.config.showScrollbar);

  return (
    <div className={`app-shell${showScrollbar ? "" : " hide-scrollbars"}`}>
      <Header />
      <div className="app-body">
        {sidebarVisible && <Sidebar />}
        <Workspace />
      </div>
      <StatusBar />
      {searchOpen && <SearchPanel />}
      {configOpen && <SettingsPanel />}

      {/* 需求1：非阻塞提示条 + 确认弹窗 + 冲突解决页（顶层 overlay） */}
      <ExternalChangeBar />
      <UnsavedDialog />
      <ConflictResolvePage />

      {/* 需求2：自定义右键菜单（受 useUIStore.contextMenu 驱动，portal 至 body） */}
      <ContextMenu />
    </div>
  );
}
