/**
 * 系统终端抽屉（底部面板）。
 *
 * 与 `useTerminalStore` 解耦：本组件只负责渲染与用户输入转发。每个标签是一个
 * 独立的本地 shell 会话（由 Rust 后端 `terminal_*` 命令驱动）。输出区对常见
 * ANSI 颜色转义做轻量渲染，本地智能体（pi / claude 等）按安装检测结果展示为
 * 一键启动按钮 —— 点击会把对应启动模板填充到输入框，补全提示词后回车即可调用。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useTerminalStore,
  KNOWN_AGENTS,
  type TerminalLine,
} from "../../store/useTerminalStore";
import { writeTerminal, detectAgents } from "../../lib/terminal";
import Icon from "../ui/Icon";

/** 各智能体的启动模板（点击后填充到输入框，等待用户补全提示词）。 */
const LAUNCH_TEMPLATES: Record<string, string> = {
  claude: 'claude -p "',
  pi: 'pi "',
  codex: "codex ",
  aider: "aider ",
  gemini: "gemini ",
  opencode: "opencode ",
};

/** ANSI 16 色前景（适配深色终端背景）。 */
const FG: Record<number, string> = {
  30: "#6e7681",
  31: "#ff7b72",
  32: "#7ee787",
  33: "#f2cc60",
  34: "#6cb6ff",
  35: "#d2a8ff",
  36: "#56d4dd",
  37: "#e6edf3",
  90: "#8b949e",
  91: "#ff9b95",
  92: "#aff7b6",
  93: "#f8e08a",
  94: "#9ecbff",
  95: "#e3b8ff",
  96: "#7ad9e6",
  97: "#f0f6fc",
};

/** 把一段可能含 ANSI SGR 转义的文本渲染成带颜色的 React 节点。 */
function renderAnsi(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  let fg = "";
  let bold = false;
  let dim = false;
  let underline = false;

  const flush = (s: string) => {
    if (!s) return;
    parts.push(
      <span
        key={key++}
        style={{
          color: fg || undefined,
          fontWeight: bold ? 700 : undefined,
          opacity: dim ? 0.7 : undefined,
          textDecoration: underline ? "underline" : undefined,
        }}
      >
        {s}
      </span>,
    );
  };

  while ((m = re.exec(text)) !== null) {
    flush(text.slice(last, m.index));
    const codes = m[1]
      .split(";")
      .map((x) => parseInt(x, 10))
      .filter((n) => !Number.isNaN(n));
    for (const c of codes) {
      if (c === 0) {
        fg = "";
        bold = false;
        dim = false;
        underline = false;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 4) underline = true;
      else if (c >= 30 && c <= 37) fg = FG[c] ?? "";
      else if (c >= 90 && c <= 97) fg = FG[c] ?? "";
    }
    last = re.lastIndex;
  }
  flush(text.slice(last));
  return parts;
}

function LineView({ line }: { line: TerminalLine }) {
  const cls =
    line.stream === "stderr"
      ? "t-line t-stderr"
      : line.stream === "system"
        ? "t-line t-system"
        : line.stream === "echo"
          ? "t-line t-echo"
          : "t-line";
  return (
    <div className={cls}>
      {renderAnsi(line.text)}
      {line.text === "" ? " " : null}
    </div>
  );
}

/** 面板默认高度（px），可被顶部拖拽手柄调整。 */
const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 560;

export default function TerminalPanel() {
  const sessions = useTerminalStore((s) => s.sessions);
  const activeId = useTerminalStore((s) => s.activeId);
  const agents = useTerminalStore((s) => s.agents);
  const setActive = useTerminalStore((s) => s.setActive);
  const closeSession = useTerminalStore((s) => s.closeSession);
  const createSession = useTerminalStore((s) => s.createSession);
  const echo = useTerminalStore((s) => s.echo);
  const clear = useTerminalStore((s) => s.clear);
  const pushHistory = useTerminalStore((s) => s.pushHistory);
  const setAgents = useTerminalStore((s) => s.setAgents);

  const [input, setInput] = useState("");
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  const outRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stick = useRef(true);
  const seeded = useRef(false);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId],
  );

  // 首次打开且没有任何会话时，自动创建一个。
  useEffect(() => {
    if (!seeded.current && sessions.length === 0) {
      seeded.current = true;
      createSession();
    }
  }, [sessions.length, createSession]);

  // 探测本地智能体（只跑一次）。
  useEffect(() => {
    let alive = true;
    detectAgents(KNOWN_AGENTS)
      .then((list) => {
        if (alive) setAgents(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [setAgents]);

  // 自动滚到底部（仅当用户本来就在底部时）。
  useEffect(() => {
    const el = outRef.current;
    if (el && stick.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  // 切换标签页时聚焦输入框。
  useEffect(() => {
    if (activeId) inputRef.current?.focus();
  }, [activeId]);

  const installed = agents.filter((a) => a.path);

  const send = () => {
    if (!active) return;
    const cmd = input;
    if (cmd.trim() === "") {
      void writeTerminal(active.id, "\n");
      setInput("");
      return;
    }
    echo(active.id, cmd);
    pushHistory(active.id, cmd);
    void writeTerminal(active.id, cmd + "\n");
    setInput("");
    setHistIdx(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!active) return;
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = active.history;
      if (h.length === 0) return;
      const idx = histIdx === null ? h.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(h[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = active.history;
      if (histIdx === null) return;
      if (histIdx < h.length - 1) {
        const idx = histIdx + 1;
        setHistIdx(idx);
        setInput(h[idx]);
      } else {
        setHistIdx(null);
        setInput("");
      }
    } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      void writeTerminal(active.id, "\x03");
    } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      clear(active.id);
    }
  };

  // 顶部拖拽改高度。
  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const bottom = panel.getBoundingClientRect().bottom;
      const h = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, bottom - ev.clientY));
      setHeight(h);
    };
    const up = () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const launchAgent = (name: string) => {
    const tpl = LAUNCH_TEMPLATES[name] ?? `${name} `;
    setInput(tpl);
    setHistIdx(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(tpl.length, tpl.length);
    });
  };

  return (
    <section className="terminal-panel" ref={panelRef} style={{ height }}>
      <div className="terminal-resize" onMouseDown={onResizeStart} />

      <div className="terminal-tabs">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`terminal-tab${s.id === activeId ? " active" : ""}`}
            onClick={() => setActive(s.id)}
            title={s.cwd ?? ""}
          >
            <span className="terminal-tab-title">
              {s.exited ? "⚠ " : ""}
              {s.title}
            </span>
            <button
              className="terminal-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                closeSession(s.id);
              }}
              aria-label="关闭终端"
            >
              <Icon name="X" size={12} />
            </button>
          </div>
        ))}
        <button
          className="terminal-tab-new"
          onClick={() => createSession()}
          aria-label="新建终端"
          title="新建终端"
        >
          <Icon name="Plus" size={14} />
        </button>
      </div>

      <div className="terminal-toolbar">
        {installed.length > 0 ? (
          <>
            <span className="terminal-toolbar-label">智能体：</span>
            {installed.map((a) => (
              <button
                key={a.name}
                className="terminal-agent-chip"
                onClick={() => launchAgent(a.name)}
                title={`启动 ${a.name}（${a.path}）`}
              >
                {a.name}
              </button>
            ))}
          </>
        ) : (
          <span className="terminal-toolbar-hint">
            未检测到本地智能体（pi / claude 等）
          </span>
        )}
        <span className="terminal-toolbar-spacer" />
        <button
          className="terminal-toolbar-btn"
          onClick={() => active && clear(active.id)}
          title="清空当前终端"
        >
          <Icon name="Trash2" size={13} />
          清空
        </button>
      </div>

      <div
        className="terminal-output"
        ref={outRef}
        onScroll={() => {
          const el = outRef.current;
          if (!el) return;
          stick.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {active ? (
          active.lines.map((line, i) => <LineView key={i} line={line} />)
        ) : (
          <div className="t-line t-system">（无活动终端）</div>
        )}
      </div>

      <div className="terminal-input">
        <span className="terminal-prompt">{active?.exited ? "✕" : "❯"}</span>
        <input
          ref={inputRef}
          className="terminal-input-field"
          value={input}
          spellCheck={false}
          autoComplete="off"
          placeholder={
            active?.exited
              ? "会话已结束，请新建终端"
              : '输入命令并回车，如 claude -p "总结此文档"'
          }
          disabled={active?.exited}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            stick.current = true;
          }}
        />
      </div>
    </section>
  );
}
