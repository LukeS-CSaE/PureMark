use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

use encoding_rs::{Encoding, BIG5, GB18030, UTF_16BE, UTF_16LE, UTF_8};

/// Mirrors the frontend `FileNode` type. Serialized with camelCase field names
/// so it can be consumed directly by TypeScript without extra mapping.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FileNode {
    id: String,
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
    depth: i32,
}

/* ---- 非 UTF-8 中文文档读写（encoding_rs） ----------------------------------
 * 检测顺序：BOM（UTF-8/UTF-16LE/BE）→ 合法 UTF-8 → GB18030/Big5 启发式。
 * GB18030 是 GBK/GB2312 的超集，故 gbk / gb2312 文件统一按 gb18030 解码，
 * 写回时也用 gb18030（对 GBK 字符集内的文本字节级等价）。
 * 启发式：同时按 GB18030 与 Big5 解码，统计替换字符 U+FFFD 数量，
 * 取更少的一方；打平时选 GB18030（大陆用户场景占绝对多数）。 */

/// 编码感知的读取结果（camelCase 对齐前端 `FileTextResult`）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadTextResult {
    content: String,
    /// 规范化编码标签：utf-8 / gb18030 / big5 / utf-16le / utf-16be。
    encoding: String,
    /// 原文件是否带 BOM（保存时按原样写回，避免外部工具识别异常）。
    had_bom: bool,
}

/// 统计解码结果中替换字符（U+FFFD）的数量，用于编码猜测的劣化度量。
fn replacement_count(s: &str) -> usize {
    s.chars().filter(|c| *c == '\u{FFFD}').count()
}

/// 把编码对象映射为回传给前端的规范标签。
fn encoding_label(enc: &'static Encoding) -> &'static str {
    if enc == GB18030 {
        "gb18030"
    } else if enc == BIG5 {
        "big5"
    } else if enc == UTF_16LE {
        "utf-16le"
    } else if enc == UTF_16BE {
        "utf-16be"
    } else {
        "utf-8"
    }
}

/// 检测字节序列的编码并解码为 UTF-8 字符串。
fn detect_and_decode(bytes: &[u8]) -> ReadTextResult {
    // ① BOM 优先（带 BOM 的 UTF-8 / UTF-16LE / UTF-16BE）。
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        let (cow, _, _) = UTF_8.decode(rest);
        return ReadTextResult {
            content: cow.into_owned(),
            encoding: "utf-8".to_string(),
            had_bom: true,
        };
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let (cow, _, _) = UTF_16LE.decode(rest);
        return ReadTextResult {
            content: cow.into_owned(),
            encoding: "utf-16le".to_string(),
            had_bom: true,
        };
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        let (cow, _, _) = UTF_16BE.decode(rest);
        return ReadTextResult {
            content: cow.into_owned(),
            encoding: "utf-16be".to_string(),
            had_bom: true,
        };
    }

    // ② 合法 UTF-8 直接返回（绝大多数现代文档）。
    if let Ok(s) = std::str::from_utf8(bytes) {
        return ReadTextResult {
            content: s.to_string(),
            encoding: "utf-8".to_string(),
            had_bom: false,
        };
    }

    // ③ GB18030 vs Big5 启发式：替换字符更少者胜出，打平选 GB18030。
    let (gb_cow, _, _) = GB18030.decode(bytes);
    let (b5_cow, _, _) = BIG5.decode(bytes);
    let gb_bad = replacement_count(&gb_cow);
    let b5_bad = replacement_count(&b5_cow);
    if b5_bad < gb_bad {
        ReadTextResult {
            content: b5_cow.into_owned(),
            encoding: "big5".to_string(),
            had_bom: false,
        }
    } else {
        ReadTextResult {
            content: gb_cow.into_owned(),
            encoding: "gb18030".to_string(),
            had_bom: false,
        }
    }
}

/// 读取文本文件并自动检测编码（UTF-8 / GBK / GB2312 / GB18030 / Big5 / UTF-16）。
#[tauri::command]
fn read_text_auto(path: String) -> Result<ReadTextResult, String> {
    let bytes = fs::read(Path::new(&path)).map_err(|e| e.to_string())?;
    Ok(detect_and_decode(&bytes))
}

/// 把前端传入的编码标签解析为 encoding_rs 编码；未知标签回退 UTF-8。
fn encoding_of(label: &str) -> &'static Encoding {
    match label.to_ascii_lowercase().as_str() {
        "gb18030" | "gbk" | "gb2312" => GB18030,
        "big5" => BIG5,
        "utf-16le" | "utf16le" => UTF_16LE,
        "utf-16be" | "utf16be" => UTF_16BE,
        _ => UTF_8,
    }
}

/// 按指定编码写回文本文件（保存原编码，避免把 GBK 文档改写成 UTF-8）。
/// `with_bom` 为 true 时在文件头补上对应 BOM。编码失败（如 Big5 无法表示
/// 某些字符）时返回错误，由前端决定降级策略，绝不静默丢字。
#[tauri::command]
fn write_text_enc(
    path: String,
    content: String,
    encoding: String,
    with_bom: bool,
) -> Result<(), String> {
    let enc = encoding_of(&encoding);
    let (cow, _, had_errors) = enc.encode(&content);
    if had_errors {
        return Err(format!("部分字符无法用 {} 编码", encoding_label(enc)));
    }
    let mut out: Vec<u8> = Vec::with_capacity(cow.len() + 3);
    if with_bom {
        if enc == UTF_8 {
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        } else if enc == UTF_16LE {
            out.extend_from_slice(&[0xFF, 0xFE]);
        } else if enc == UTF_16BE {
            out.extend_from_slice(&[0xFE, 0xFF]);
        }
    }
    out.extend_from_slice(cow.as_ref());
    fs::write(Path::new(&path), out).map_err(|e| e.to_string())
}

/// Recursively builds the Markdown file tree for a directory.
///
/// Rules (per system design):
/// - Hidden entries (starting with `.`) are ignored.
/// - Only `.md` / `.markdown` files are kept.
/// - A directory is kept only if it (recursively) contains at least one Markdown file.
/// - Directories are listed before files; siblings are sorted by name (case-insensitive).
#[tauri::command]
fn build_tree(path: String) -> Vec<FileNode> {
    build_node(&path, 0)
}

fn build_node(path: &str, depth: i32) -> Vec<FileNode> {
    let dir = Path::new(path);
    let read_dir = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };

    let mut dirs: Vec<FileNode> = Vec::new();
    let mut files: Vec<FileNode> = Vec::new();

    for entry in read_dir.flatten() {
        let pbuf = entry.path();
        let file_name = match pbuf.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        // Skip hidden items (e.g. .git, .DS_Store).
        if file_name.starts_with('.') {
            continue;
        }

        let is_dir = pbuf.is_dir();
        if is_dir {
            let children = build_node(&pbuf.to_string_lossy().to_string(), depth + 1);
            // Only keep directories that actually contain Markdown files.
            if !children.is_empty() {
                dirs.push(FileNode {
                    id: pbuf.to_string_lossy().to_string(),
                    name: file_name,
                    path: pbuf.to_string_lossy().to_string(),
                    is_dir: true,
                    children: Some(children),
                    depth,
                });
            }
        } else {
            let ext = pbuf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext == "md" || ext == "markdown" {
                files.push(FileNode {
                    id: pbuf.to_string_lossy().to_string(),
                    name: file_name,
                    path: pbuf.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                    depth,
                });
            }
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    let mut entries = Vec::with_capacity(dirs.len() + files.len());
    entries.extend(dirs);
    entries.extend(files);
    entries
}

/// Holds the file path the app was launched with (e.g. a double-clicked `.md`
/// opened through file association), pending until the frontend is ready.
struct LaunchFile(pub Mutex<Option<String>>);

/// Extracts the first CLI argument that points to an existing file.
///
/// On Windows/Linux a file opened via association is passed as a CLI argument
/// (`PureMark.exe "C:\path\to\file.md"`). macOS would deliver it through the
/// `RunEvent::Opened` event instead; this app targets Windows primarily.
fn file_from_args(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && std::path::Path::new(a.as_str()).is_file())
        .cloned()
}

#[tauri::command]
fn take_launch_file(state: tauri::State<LaunchFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

/// 父目录路径（用于 rename 构造新全路径 / reveal 在 Linux 下打开父目录）。
fn dir_of(path: &str) -> String {
    let p = Path::new(path);
    p.parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

/// 重命名文件 / 目录到同父目录下的新名称。
#[tauri::command]
fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let parent = Path::new(&path)
        .parent()
        .ok_or_else(|| "无法解析父目录".to_string())?;
    let new_path = parent.join(&new_name);
    fs::rename(Path::new(&path), &new_path).map_err(|e| e.to_string())
}

/// 删除文件（或递归删除目录）。
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(Path::new(&path)).map_err(|e| e.to_string())
    } else {
        fs::remove_file(Path::new(&path)).map_err(|e| e.to_string())
    }
}

/// 新建空文件。
#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    fs::write(Path::new(&path), "").map_err(|e| e.to_string())
}

/// 新建目录（含多级）。
#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(Path::new(&path)).map_err(|e| e.to_string())
}

/// 在资源管理器中显示文件 / 目录（跨平台尽力实现）。
#[tauri::command]
fn reveal_in_explorer(path: String) {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let _ = Command::new("explorer").args(["/select,", &path]).spawn();
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("open").args(["-R", &path]).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let parent = dir_of(&path);
        let _ = Command::new("xdg-open").arg(parent).spawn();
    }
}

/// Application entry point shared by the desktop binary and mobile targets.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial = file_from_args(&args);

    tauri::Builder::default()
        // `single-instance` MUST be registered first. When the app is already
        // running and the user double-clicks another `.md`, the new process exits
        // and forwards the file path to the live instance via the "open-file" event.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = file_from_args(&argv) {
                let _ = app.emit("open-file", path);
            }
            if let Some(w) = app.get_webview_window("main") {
                // Bring the live instance to the front. `unminimize` restores a
                // minimized window, `show` ensures visibility, `setFocus` raises
                // it. Covering all three is what actually surfaces the app on
                // Windows when it was behind other windows or in the taskbar.
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(LaunchFile(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![
            build_tree,
            take_launch_file,
            rename_file,
            delete_file,
            create_file,
            create_dir,
            reveal_in_explorer,
            read_text_auto,
            write_text_enc
        ])
        .run(tauri::generate_context!())
        .expect("error while running PureMark");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// GBK 编码的 "# 中文"（中 = D6 D0，文 = CE C4）。
    fn gbk_bytes() -> Vec<u8> {
        vec![0x23, 0x20, 0xD6, 0xD0, 0xCE, 0xC4]
    }

    #[test]
    fn detects_plain_utf8() {
        let r = detect_and_decode("# 中文文档".as_bytes());
        assert_eq!(r.encoding, "utf-8");
        assert!(!r.had_bom);
        assert_eq!(r.content, "# 中文文档");
    }

    #[test]
    fn detects_utf8_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("正文".as_bytes());
        let r = detect_and_decode(&bytes);
        assert_eq!(r.encoding, "utf-8");
        assert!(r.had_bom);
        assert_eq!(r.content, "正文");
    }

    #[test]
    fn detects_gbk_as_gb18030_and_decodes() {
        let r = detect_and_decode(&gbk_bytes());
        assert_eq!(r.encoding, "gb18030");
        assert!(!r.had_bom);
        assert_eq!(r.content, "# 中文");
    }

    #[test]
    fn detects_utf16le_bom() {
        // "AB" 的 UTF-16LE 字节序
        let bytes = vec![0xFF, 0xFE, 0x41, 0x00, 0x42, 0x00];
        let r = detect_and_decode(&bytes);
        assert_eq!(r.encoding, "utf-16le");
        assert!(r.had_bom);
        assert_eq!(r.content, "AB");
    }

    #[test]
    fn gb18030_round_trip_is_byte_identical_for_gbk_text() {
        // 写回链路的核心保证：GBK 字符集内的文本按 gb18030 编码后字节不变。
        let (cow, _, had_errors) = GB18030.encode("# 中文");
        assert!(!had_errors);
        assert_eq!(cow.as_ref(), gbk_bytes().as_slice());
    }

    #[test]
    fn encoding_of_maps_legacy_labels() {
        assert!(encoding_of("GBK") == GB18030);
        assert!(encoding_of("gb2312") == GB18030);
        assert!(encoding_of("Big5") == BIG5);
        assert!(encoding_of("unknown") == UTF_8);
    }
}
