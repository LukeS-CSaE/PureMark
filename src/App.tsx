import { useEffect, useRef } from "react";
import AppShell from "./components/AppShell";
import { useConfigStore } from "./store/useConfigStore";
import { useUIStore } from "./store/useUIStore";
import { useTabsStore } from "./store/useTabsStore";
import { usePanesStore } from "./store/usePanesStore";
import { useHotkeys } from "./hooks/useHotkeys";
import { useAutoSave } from "./hooks/useAutoSave";
import { useTheme } from "./hooks/useTheme";
import { shouldSuppressContextMenu } from "./lib/contextMenuGuard";
import { openInFocusedPane, newUntitledInFocusedPane } from "./lib/paneRouter";
import { requestCloseTab } from "./lib/closeGuard";
import { guardRefresh } from "./lib/refreshGuard";
import { initFileWatchers } from "./lib/fileWatcher";
import {
  registerCloseGuard,
  applyStartupGeometry,
  persistWindowState,
  listenWindowResize,
  focusWindow,
} from "./lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readFileTextWithEncoding, buildTree } from "./commands/fsCommands";
import { dirOf } from "./lib/pathUtils";

/**
 * Open a file launched via an external file association (double-click / "Open
 * with" / single-instance forward). Opens the document in the focused pane and
 * points the sidebar explorer at the file's containing folder so the directory
 * is shown with the current file highlighted.
 */
async function openFileFromAssociation(path: string) {
  try {
    // 编码自动检测（UTF-8 / GBK / GB2312 / Big5 / UTF-16），保存时按原编码写回。
    const { content, encoding, hadBom } = await readFileTextWithEncoding(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    openInFocusedPane({ path, name, content, encoding, hadBom });

    // Feature: show the current file's folder in the explorer. Build the tree
    // for the parent directory; the file itself is highlighted automatically
    // because FileTree matches node.path against the active tab path.
    const folder = dirOf(path);
    try {
      const tree = await buildTree(folder);
      useUIStore.getState().setFolder(folder, tree);
      useConfigStore.getState().update({ lastFolder: folder });
      // Force the explorer visible for THIS launch only (not persisted) so the
      // folder is actually displayed — overriding the stored sidebar preference.
      useUIStore.getState().setSidebarVisible(true);
    } catch (treeErr) {
      console.error("Failed to build folder tree for launched file:", treeErr);
    }
  } catch (err) {
    console.error("Failed to open file from association:", err);
  }
}

/**
 * Root component. Loads the persisted config, restores window geometry, hydrates
 * the pane layout, wires the unsaved-changes close guard, and mounts the app
 * shell. Global hotkeys, theme resolution and draft autosave run for the
 * lifetime of the app.
 */
export default function App() {
  const loadConfig = useConfigStore((s) => s.load);
  const isAnyDirty = useTabsStore((s) => s.isAnyDirty);
  const resizeTimer = useRef<number | null>(null);

  // Resolve `config.theme` -> <html data-theme> + useUIStore.resolvedTheme.
  useTheme();

  // ---------------------------------------------------------------------
  // Single serialized startup sequence (iter2-ext N-06).
  //
  // iter2 had two independent async effects — one restoring `sidebarVisible`
  // from config, one consuming the launch file — with no ordering guarantee
  // between them. Collapsing them into one awaited chain makes the order
  // deterministic, so the file-association collapse can no longer be undone
  // by a late config restore.
  //
  //   loadConfig -> UI restore -> panes.hydrate -> geometry -> launch file
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadConfig();
      if (cancelled) return;

      const cfg = useConfigStore.getState().config;
      useUIStore.getState().setSidebarVisible(cfg.sidebarVisible);
      useUIStore.getState().setSidebarWidth(cfg.sidebarWidth ?? 248);
      // R-25: restore layout / split ratio / per-pane view modes.
      usePanesStore.getState().hydrate(cfg, useTabsStore.getState().activeId);

      // One atomic geometry apply; opens the persistence silence window for its
      // whole duration so the programmatic resize is not written back.
      await applyStartupGeometry();
      if (cancelled) return;

      // File association: pull the path the backend stashed before the
      // frontend was ready to receive `open-file`.
      let pending: string | null = null;
      try {
        pending = await invoke<string | null>("take_launch_file");
      } catch (err) {
        console.error("Failed to read the launch file:", err);
      }
      if (cancelled || !pending) return;

      // Open the document and point the explorer at its folder. The sidebar is
      // forced visible (session-only, not persisted) so the current file's
      // directory is shown on this launch.
      await openFileFromAssociation(pending);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadConfig]);

  // Unsaved-changes close guard + debounced window-size persistence.
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void (async () => {
      const guard = await registerCloseGuard(() => isAnyDirty());
      const resize = await listenWindowResize(() => {
        if (resizeTimer.current) window.clearTimeout(resizeTimer.current);
        resizeTimer.current = window.setTimeout(() => {
          void persistWindowState();
        }, 500);
      });
      cleanup = () => {
        guard();
        resize();
      };
    })();
    return () => cleanup?.();
  }, [isAnyDirty]);

  useHotkeys({
    "Ctrl+S": () => void useTabsStore.getState().saveActive(),
    "Cmd+S": () => void useTabsStore.getState().saveActive(),
    "Ctrl+W": () => {
      const id = useTabsStore.getState().activeId;
      if (id) void requestCloseTab(id);
    },
    "Cmd+W": () => {
      const id = useTabsStore.getState().activeId;
      if (id) void requestCloseTab(id);
    },
    "Ctrl+N": () => newUntitledInFocusedPane(),
    "Cmd+N": () => newUntitledInFocusedPane(),
    "Ctrl+F": () => useUIStore.getState().setSearchOpen(true),
    "Cmd+F": () => useUIStore.getState().setSearchOpen(true),
    // 刷新（需求1）：拦截原生 Ctrl+R / F5，统一走刷新守卫（dev 也不放行）
    "Ctrl+R": () => void guardRefresh(),
    "Cmd+R": () => void guardRefresh(),
    "F5": () => void guardRefresh(),
  });

  // 方案 B：启动实时文件监视（外部改动提示条）
  useEffect(() => {
    initFileWatchers();
  }, []);
  useAutoSave();

  // Suppress the browser's native context menu over the app's content
  // surfaces (workspace / editor pane / file tree / preview pane). Capture
  // phase so it runs before CM6's own contextmenu handler — bubble phase
  // would be eaten first. Form controls and the CM host stay exempt so paste
  // / spell-check / native CM commands continue to work.
  useEffect(() => {
    function onContextMenu(e: MouseEvent): void {
      // 仅 preventDefault 压制原生菜单；不调用 stopPropagation，以便编辑器 /
      // 文件树 / 标签页的自定义右键菜单（bubble 阶段处理器）能正常触发（需求2）。
      if (shouldSuppressContextMenu(e.target)) {
        e.preventDefault();
      }
    }
    window.addEventListener("contextmenu", onContextMenu, { capture: true });
    return () =>
      window.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      } as AddEventListenerOptions);
  }, []);

  // Runtime file opens: another `.md` double-clicked while the app is already
  // running (single-instance forwards it as `open-file`). Kept in its own
  // effect — the launch-time path is handled by the startup sequence above.
  //
  // N-06: a runtime open deliberately does NOT collapse the sidebar; only a
  // cold launch from a file association does.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void (async () => {
      const fn = await listen<string>("open-file", (e) => {
        void openFileFromAssociation(e.payload);
        // Surface the already-running window (double-click a .md while the app
        // is behind another window or minimized). The live instance is the
        // foreground process, so this reliably raises the window on Windows.
        void focusWindow();
      });
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return <AppShell />;
}
