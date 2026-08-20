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
import { getBlockOps } from "./lib/blockOpsRegistry";
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
import { readFileTextWithEncoding } from "./commands/fsCommands";
import { switchFolderRoot } from "./lib/fileOps";
import { dirOf } from "./lib/pathUtils";

/**
 * Open a file launched via an external file association (double-click / "Open
 * with" / single-instance forward). Opens the document in the focused pane.
 *
 * `switchFolder`：仅冷启动传 true —— 把侧栏目录切到文件所在文件夹；
 * 运行中再从资源管理器打开新文件时不再自动切换（避免文件目录被永久
 * 带走），改由标签页右键“打开文件目录”主动切换。
 */
async function openFileFromAssociation(path: string, switchFolder: boolean) {
  try {
    // 编码自动检测（UTF-8 / GBK / GB2312 / Big5 / UTF-16），保存时按原编码写回。
    const { content, encoding, hadBom } = await readFileTextWithEncoding(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    openInFocusedPane({ path, name, content, encoding, hadBom });

    if (switchFolder) {
      // 文件树自动高亮当前文件（FileTree 用 node.path 匹配活动 tab path）。
      await switchFolderRoot(dirOf(path));
    }
  } catch (err) {
    console.error("Failed to open file from association:", err);
  }
}

/**
 * 块级快捷键入口（Ctrl+D / Alt+ArrowUp / Alt+ArrowDown）。
 * 挂在窗口级而非编辑器 keymap：编辑器级绑定只有焦点恰好在可编辑区才
 * 生效，且部分组合会被 WebView2 / 系统层吞掉；窗口级保证 focus 在
 * PureMark 内即触发。句柄由各视图注册（见 blockOpsRegistry）：
 * MarkdownView → TipTap 顶层块；CodeEditor → 空行分隔段落。
 * 焦点在表单控件（设置面板输入框等）内时放行，避免误操作文档。
 *
 * 移动键历史：初版用 Ctrl+PageUp/PageDown，与 Windows 系统导航/选择
 * 逻辑冲突；现改为 VS Code 风格的 Alt+↑ / Alt+↓，无系统级冲突。
 */
function runBlockOps(op: "duplicate" | "up" | "down"): void {
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return;
  }
  const handle = getBlockOps(usePanesStore.getState().focusedPaneId);
  if (!handle) return;
  if (op === "duplicate") handle.duplicate();
  else handle.move(op === "up" ? -1 : 1);
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
      await openFileFromAssociation(pending, true);
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
    // 块操作：复制当前块到下方 / 上移 / 下移（窗口级，见 runBlockOps）。
    "Ctrl+D": () => runBlockOps("duplicate"),
    "Cmd+D": () => runBlockOps("duplicate"),
    "Alt+ArrowUp": () => runBlockOps("up"),
    "Alt+ArrowDown": () => runBlockOps("down"),
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
  // 运行中打开不再自动切换文件目录（冷启动才切）：避免用户在资源管理器
  // 里双击别的文件后，侧栏目录被永久带走；需要切换时用标签页右键菜单
  // 的“打开文件目录”主动触发（见 tabContextMenu）。
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    void (async () => {
      const fn = await listen<string>("open-file", (e) => {
        void openFileFromAssociation(e.payload, false);
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
