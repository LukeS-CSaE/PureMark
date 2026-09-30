/**
 * 系统终端的前端桥接层。
 *
 * 把 Rust 侧 `terminal_*` 命令与 `terminal-data` / `terminal-exit` 事件封装成
 * 一组易用的函数，供 `useTerminalStore` 与 `TerminalPanel` 调用。所有命令都走
 * 应用自有命令（非第三方 shell 插件），事件名与 `src-tauri/src/terminal.rs` 一致。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** 单块终端输出（与 Rust `TerminalData` 对应）。 */
export interface TerminalData {
  sessionId: string;
  stream: "stdout" | "stderr";
  data: string;
}

/** 会话退出通知（与 Rust `TerminalExit` 对应）。 */
export interface TerminalExit {
  sessionId: string;
  code: number | null;
}

/** 智能体探测结果（与 Rust `AgentProbe` 对应）。 */
export interface AgentProbe {
  name: string;
  path: string | null;
}

/** 启动一个终端会话（id 由前端生成）。 */
export function spawnTerminal(
  sessionId: string,
  opts?: { shell?: string; cwd?: string },
): Promise<void> {
  return invoke("terminal_spawn", {
    sessionId,
    shell: opts?.shell ?? null,
    cwd: opts?.cwd ?? null,
  });
}

/** 向会话 stdin 写入原始数据（整行命令需带 `\n`，控制字符用 `\x03` 等）。 */
export function writeTerminal(sessionId: string, data: string): Promise<void> {
  return invoke("terminal_write", { sessionId, data });
}

/** 终止会话（kill 进程，后端随后发 `terminal-exit`）。 */
export function killTerminal(sessionId: string): Promise<void> {
  return invoke("terminal_kill", { sessionId });
}

/** 探测一批本地智能体是否安装。 */
export function detectAgents(names: string[]): Promise<AgentProbe[]> {
  return invoke("terminal_detect_agents", { names });
}

/** 监听终端输出块（全局唯一，建议在 App 层注册一次）。 */
export function onTerminalData(cb: (d: TerminalData) => void): Promise<UnlistenFn> {
  return listen<TerminalData>("terminal-data", (e) => cb(e.payload));
}

/** 监听终端会话退出。 */
export function onTerminalExit(cb: (d: TerminalExit) => void): Promise<UnlistenFn> {
  return listen<TerminalExit>("terminal-exit", (e) => cb(e.payload));
}
