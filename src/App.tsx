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
import {
  registerCloseGuard,
  applyStartupGeometry,
  persistWindowState,
  listenWindowResize,
} from "./lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { readFileText } from "./commands/fsCommands";

/** Open a file at an absolute path (used by file-association / "Open with"). */
async function openPath(path: string) {
  try {
    const content = await readFileText(path);
    const name = path.split(/[\\/]/).pop() ?? path;
    openInFocusedPane({ path, name, content });
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

      // N-06: collapse the sidebar for THIS SESSION ONLY. Deliberately not
      // written to config — a later normal launch must honour the user's
      // stored preference.
      useUIStore.getState().setSidebarVisible(false);
      await openPath(pending);
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
  });
  useAutoSave();

  // Suppress the browser's native context menu over the app's content
  // surfaces (workspace / editor pane / file tree / preview pane). Capture
  // phase so it runs before CM6's own contextmenu handler — bubble phase
  // would be eaten first. Form controls and the CM host stay exempt so paste
  // / spell-check / native CM commands continue to work.
  useEffect(() => {
    function onContextMenu(e: MouseEvent): void {
      if (shouldSuppressContextMenu(e.target)) {
        e.preventDefault();
        e.stopPropagation();
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
        void openPath(e.payload);
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
