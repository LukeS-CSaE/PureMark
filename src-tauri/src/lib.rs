use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

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
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(LaunchFile(Mutex::new(initial)))
        .invoke_handler(tauri::generate_handler![build_tree, take_launch_file])
        .run(tauri::generate_context!())
        .expect("error while running PureMark");
}
