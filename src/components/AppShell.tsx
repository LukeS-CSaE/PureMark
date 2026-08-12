import Header from "./Header/Header";
import Sidebar from "./Sidebar/Sidebar";
import Workspace from "./Workspace/Workspace";
import StatusBar from "./StatusBar/StatusBar";
import SearchPanel from "./dialogs/SearchPanel";
import SettingsPanel from "./dialogs/SettingsPanel";
import { useUIStore } from "../store/useUIStore";

/**
 * Top-level layout: header + (sidebar | workspace) + status bar, with the
 * search and settings popovers rendered as fixed overlays on top.
 */
export default function AppShell() {
  const sidebarVisible = useUIStore((s) => s.sidebarVisible);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const configOpen = useUIStore((s) => s.configOpen);

  return (
    <div className="app-shell">
      <Header />
      <div className="app-body">
        {sidebarVisible && <Sidebar />}
        <Workspace />
      </div>
      <StatusBar />
      {searchOpen && <SearchPanel />}
      {configOpen && <SettingsPanel />}
    </div>
  );
}
