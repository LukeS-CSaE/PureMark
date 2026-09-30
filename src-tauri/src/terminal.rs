//! 系统终端：在应用内启动用户本地的 shell，并把它当作一个可交互的终端会话。
//!
//! 设计要点（与 PureMark 其它命令一致，全部走 `#[tauri::command]` + 自定义事件，
//! 不依赖任何第三方 shell 插件，进程直接由 `std::process` 拉起，权限完全自控）：
//!
//! - 每个会话是一个长驻 shell 进程（Windows 用 `cmd.exe`，Unix 用 `$SHELL`/`bash`），
//!   stdin / stdout / stderr 全部管道化。
//! - 后端起两个读线程分别消费 stdout / stderr，按块把字节解码成字符串后通过
//!   `terminal-data` 事件回传前端；会话退出时发 `terminal-exit`。
//! - 前端把用户输入（整行）写入 `terminal-write` 喂给 shell 的 stdin；交互式智能体
//!   （claude / pi 等）的「一次性」调用走各自的 `--print` / 直接传参模式即可。
//! - Windows 上 `cmd.exe` 默认 GBK 输出会产生乱码，启动时先 `chcp 65001` 切到 UTF-8；
//!   个别仍非 UTF-8 的字节块回退用 `encoding_rs::GB18030` 解码。

use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// 单块终端输出（camelCase 对齐前端消费）。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalData {
    /// 会话 id（前端生成，用于区分多个终端标签）。
    pub session_id: String,
    /// 流：`"stdout"` | `"stderr"`。
    pub stream: String,
    /// 解码后的文本块。
    pub data: String,
}

/// 会话退出通知（camelCase 对齐前端消费）。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExit {
    pub session_id: String,
    /// 退出码；被 kill 时为 `null`。
    pub code: Option<i32>,
}

/// 单个智能体可执行文件的探测结果。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentProbe {
    pub name: String,
    /// 命中时的绝对路径，未安装为 `null`。
    pub path: Option<String>,
}

/// 一个 shell 会话的句柄。child / stdin 都用 `Arc<Mutex<_>>` 包裹，
/// 以便 `terminal-kill` 与退出等待线程能各自安全地取用。
pub struct ShellSession {
    pub child: Arc<Mutex<Child>>,
    pub stdin: Arc<Mutex<Option<ChildStdin>>>,
}

/// 全局会话注册表：sessionId -> ShellSession。
pub struct TerminalSessions(pub Mutex<HashMap<String, ShellSession>>);

/// 选择要启动的 shell 程序。
///
/// - 显式传入 `shell` 时直接使用（仅取程序名，不解析参数，保持简单）。
/// - Windows 默认 `cmd.exe`（读取管道 stdin 即逐行执行命令）。
/// - Unix 优先 `$SHELL`，否则 `/bin/bash`。
fn resolve_shell(shell: Option<String>) -> String {
    if let Some(s) = shell {
        if !s.is_empty() {
            return s;
        }
    }
    if cfg!(windows) {
        "cmd.exe".to_string()
    } else if let Ok(sh) = std::env::var("SHELL") {
        if !sh.is_empty() {
            return sh;
        }
        "/bin/bash".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

/// 把累积缓冲中「完整的 UTF-8 前缀」发出去；若尾部是不完整的多字节序列则扣留，
/// 等下一次读到后续字节再判断。`force` 为 true（管道关闭）时不再扣留，整段兜底解码。
///
/// `pending` 会被原地 drained 掉已发出的前缀，仅保留待续的不完整尾部。
fn flush_buffer(
    app: &AppHandle,
    session_id: &str,
    pending: &mut Vec<u8>,
    stream: &'static str,
    force: bool,
) {
    let buf = &pending[..];
    let valid_len = match std::str::from_utf8(buf) {
        Ok(_) => buf.len(),
        Err(e) => {
            let v = e.valid_up_to();
            if e.error_len().is_none() {
                // 错误是因为尾部序列不完整（差几个字节）：扣留尾部，先发前缀。
                v
            } else {
                // 含非法字节：整段回退 GB18030 解码后一次性发出。
                let text = encoding_rs::GB18030.decode(buf).0.into_owned();
                emit_chunk(app, session_id, stream, &text);
                pending.clear();
                return;
            }
        }
    };

    if valid_len == 0 {
        // 还没有任何完整字节（尾部序列尚不完整）。
        if force {
            // 强制模式：连不完整序列也兜底刷出，别丢数据。
            let text = encoding_rs::GB18030.decode(buf).0.into_owned();
            emit_chunk(app, session_id, stream, &text);
        }
        // 非强制：扣留，等待后续字节。
        return;
    }

    let text = String::from_utf8_lossy(&buf[..valid_len]).into_owned();
    emit_chunk(app, session_id, stream, &text);
    pending.drain(..valid_len);
}

fn emit_chunk(app: &AppHandle, session_id: &str, stream: &'static str, text: &str) {
    if text.is_empty() {
        return;
    }
    let _ = app.emit(
        "terminal-data",
        TerminalData {
            session_id: session_id.to_string(),
            stream: stream.to_string(),
            data: text.to_string(),
        },
    );
}

/// 消费一条管道（stdout / stderr），按块解码并持续向前端 emit `terminal-data`。
///
/// 跨读边界的多字节 UTF-8 序列会被暂存在 `pending` 中，直到凑齐完整序列再发出，
/// 避免把一个汉字从中间劈开变成乱码。管道关闭（读到 0 字节）时把残余缓冲强制刷出。
fn pump_pipe(app: AppHandle, session_id: String, pipe: impl Read, stream: &'static str) {
    let mut reader = BufReader::with_capacity(8192, pipe);
    let mut pending: Vec<u8> = Vec::with_capacity(8192);
    let mut tmp = [0u8; 8192];

    loop {
        let n = match reader.read(&mut tmp) {
            Ok(0) => break, // EOF：管道已关闭
            Ok(n) => n,
            Err(_) => break,
        };
        pending.extend_from_slice(&tmp[..n]);

        // 累积到 32KB 就刷一次（长输出也不会让读线程卡太久）。
        if pending.len() >= 32 * 1024 {
            flush_buffer(&app, &session_id, &mut pending, stream, false);
        }
    }

    // EOF：把剩余字节强制刷出（含不完整的尾部多字节序列）。
    if !pending.is_empty() {
        flush_buffer(&app, &session_id, &mut pending, stream, true);
    }
}

/// 启动一个终端会话（若同 id 已存在则忽略）。
#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    session_id: String,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let registry = app.state::<TerminalSessions>();
    {
        let guard = registry.0.lock().unwrap();
        if guard.contains_key(&session_id) {
            return Ok(());
        }
    }

    let prog = resolve_shell(shell);
    let mut cmd = Command::new(&prog);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("无法启动终端（{prog}）：{e}"))?;

    // 取走 stdout / stderr 交给读线程；stdin 留在会话里供写入。
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法获取 stdout 管道".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法获取 stderr 管道".to_string())?;
    let mut stdin = child.stdin.take();

    // Windows：cmd.exe 默认 GBK 输出且会回显命令。先切 UTF-8 并关回显，
    // 让前端本地回显输入、后端只回传真实输出，体验更像真终端。
    if cfg!(windows) {
        if let Some(s) = stdin.as_mut() {
            let _ = s.write_all(b"chcp 65001 >nul\r\necho off\r\n");
            let _ = s.flush();
        }
    }

    let child = Arc::new(Mutex::new(child));
    let stdin = Arc::new(Mutex::new(stdin));

    // 注册会话（先放进去，再起读线程，避免竞态）。
    registry.0.lock().unwrap().insert(
        session_id.clone(),
        ShellSession {
            child: child.clone(),
            stdin: stdin.clone(),
        },
    );

    let app_out = app.clone();
    let sid_out = session_id.clone();
    std::thread::spawn(move || {
        pump_pipe(app_out, sid_out, stdout, "stdout");
    });

    let app_err = app.clone();
    let sid_err = session_id.clone();
    std::thread::spawn(move || {
        pump_pipe(app_err, sid_err, stderr, "stderr");
    });

    // 退出等待线程：child.wait() 返回后发 terminal-exit。
    let app_exit = app.clone();
    let sid_exit = session_id.clone();
    std::thread::spawn(move || {
        let code = child.lock().unwrap().wait().ok().and_then(|s| s.code());
        let _ = app_exit.emit(
            "terminal-exit",
            TerminalExit {
                session_id: sid_exit,
                code,
            },
        );
    });

    Ok(())
}

/// 向指定会话的 shell stdin 写入数据（整行命令或交互式智能体的按键流）。
#[tauri::command]
pub fn terminal_write(app: AppHandle, session_id: String, data: String) -> Result<(), String> {
    let registry = app.state::<TerminalSessions>();
    let guard = registry.0.lock().unwrap();
    let session = guard
        .get(&session_id)
        .ok_or_else(|| "终端会话不存在或已关闭".to_string())?;
    let mut stdin = session.stdin.lock().unwrap();
    if let Some(s) = stdin.as_mut() {
        s.write_all(data.as_bytes())
            .map_err(|e| format!("写入终端失败：{e}"))?;
        s.flush().map_err(|e| format!("刷新终端失败：{e}"))?;
    }
    Ok(())
}

/// 终止指定会话（kill 进程并移出注册表）。
#[tauri::command]
pub fn terminal_kill(app: AppHandle, session_id: String) -> Result<(), String> {
    let registry = app.state::<TerminalSessions>();
    if let Some(session) = registry.0.lock().unwrap().remove(&session_id) {
        let _ = session.child.lock().unwrap().kill();
    }
    Ok(())
}

/// 探测一批本地智能体可执行文件是否安装（按 `where` / `command -v`）。
#[tauri::command]
pub fn terminal_detect_agents(names: Vec<String>) -> Vec<AgentProbe> {
    names
        .into_iter()
        .map(|name| AgentProbe {
            name: name.clone(),
            path: which(&name),
        })
        .collect()
}

/// 定位可执行文件：Windows 用 `where`，Unix 用 `command -v`，取首行。
fn which(name: &str) -> Option<String> {
    let (prog, args): (&str, Vec<String>) = if cfg!(windows) {
        ("where", vec![name.to_string()])
    } else {
        (
            "sh",
            vec!["-c".to_string(), format!("command -v '{name}'")],
        )
    };
    let out = Command::new(prog).args(args).output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let first = text.lines().next()?.trim();
    if first.is_empty() {
        None
    } else {
        Some(first.to_string())
    }
}
