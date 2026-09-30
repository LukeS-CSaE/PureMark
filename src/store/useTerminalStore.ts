/**
 * 终端会话的全局状态库（zustand）。
 *
 * 与 `TerminalPanel` 解耦：面板只负责渲染，会话生命周期（启动 / 写入 / 关闭）
 * 与输出缓冲都集中在此。这样即使终端抽屉被收起（UI 不可见），后端 shell 仍在
 * 运行、输出仍在累积，重新打开时不会丢历史。
 *
 * 后端事件监听（`terminal-data` / `terminal-exit`）由 `App.tsx` 在启动时注册一次，
 * 直接调用这里的 `ingest` / `markExited`，保证全局唯一、不重复订阅。
 */
import { create } from "zustand";
import {
  spawnTerminal,
  killTerminal,
  type AgentProbe,
} from "../lib/terminal";

/** 输出行：区分 stdout / stderr / 系统提示 / 本地回显（用户输入）。 */
export interface TerminalLine {
  stream: "stdout" | "stderr" | "system" | "echo";
  text: string;
}

/** 一个终端标签。 */
export interface TerminalSession {
  id: string;
  title: string;
  cwd?: string;
  /** 输出缓冲（受 MAX_LINES 限制，超出从头部丢弃）。 */
  lines: TerminalLine[];
  /** 命令历史（用于输入框 Up/Down）。 */
  history: string[];
  /** 是否已收到后端退出事件。 */
  exited: boolean;
}

/** 缓冲上限，避免超长会话把内存吃爆。 */
const MAX_LINES = 8000;

/** 已知的可一键启动的本地智能体（按检测顺序展示）。 */
export const KNOWN_AGENTS = ["pi", "claude", "codex", "aider", "gemini", "opencode"];

interface TerminalState {
  sessions: TerminalSession[];
  activeId: string | null;
  /** 已探测到的本地智能体（path 非空表示已安装）。 */
  agents: AgentProbe[];

  /** 创建一个 shell 会话（拉起后端进程 + 写入状态）。返回新会话 id。 */
  createSession(cwd?: string): string;
  /** 关闭会话：kill 后端进程并从状态移除。 */
  closeSession(id: string): void;
  /** 切换活动会话。 */
  setActive(id: string): void;

  /** 后端输出块进入缓冲（由 App 的事件监听调用）。 */
  ingest(sessionId: string, stream: "stdout" | "stderr", text: string): void;
  /** 回显用户发出的命令（便于在没有 shell 回显时也能看到输入）。 */
  echo(sessionId: string, text: string): void;
  /** 后端退出通知。 */
  markExited(sessionId: string): void;
  /** 清空某会话输出。 */
  clear(id: string): void;
  /** 记录一条命令历史。 */
  pushHistory(id: string, cmd: string): void;
  /** 写入探测到的智能体列表。 */
  setAgents(agents: AgentProbe[]): void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  sessions: [],
  activeId: null,
  agents: [],

  createSession(cwd) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const title = cwd ? "终端" : "终端";
    // 拉起后端 shell（fire-and-forget；失败由后端报错，前端不阻塞）。
    void spawnTerminal(id, { cwd }).catch((e) => {
      console.error("[terminal] spawn failed:", e);
    });
    set((s) => ({
      sessions: [
        ...s.sessions,
        { id, title, cwd, lines: [], history: [], exited: false },
      ],
      activeId: id,
    }));
    return id;
  },

  closeSession(id) {
    void killTerminal(id).catch(() => {});
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      const activeId =
        s.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeId;
      return { sessions, activeId };
    });
  },

  setActive(id) {
    set({ activeId: id });
  },

  ingest(sessionId, stream, text) {
    if (!text) return;
    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess;
        const lines = sess.lines.concat(
          text.replace(/\r/g, "").split("\n").map((t) => ({ stream, text: t })),
        );
        // 超出上限从头部丢弃（按行粒度，避免截断半个序列）。
        const trimmed =
          lines.length > MAX_LINES ? lines.slice(lines.length - MAX_LINES) : lines;
        return { ...sess, lines: trimmed };
      }),
    }));
  },

  echo(sessionId, text) {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, lines: sess.lines.concat({ stream: "echo", text }) }
          : sess,
      ),
    }));
  },

  markExited(sessionId) {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              exited: true,
              lines: sess.lines.concat({
                stream: "system",
                text: "── 会话已结束 ──",
              }),
            }
          : sess,
      ),
    }));
  },

  clear(id) {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, lines: [] } : sess,
      ),
    }));
  },

  pushHistory(id, cmd) {
    if (!cmd.trim()) return;
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id
          ? { ...sess, history: [...sess.history, cmd].slice(-100) }
          : sess,
      ),
    }));
  },

  setAgents(agents) {
    set({ agents });
  },
}));
