import { ask } from "@tauri-apps/plugin-dialog";

/**
 * Wraps the native Tauri confirmation dialog for unsaved/discard decisions.
 * Implemented as a function module (the UI is the OS dialog) but kept under
 * `dialogs/` so it is co-located with the other dialog surfaces.
 */
export async function confirmUnsaved(name: string): Promise<boolean> {
  return ask(`「${name}」有未保存的修改，确定关闭吗？`, {
    title: "PureMark",
    kind: "warning",
  });
}
