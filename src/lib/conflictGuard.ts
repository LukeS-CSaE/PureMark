/**
 * 文件内容冲突检测服务层（设计 §2 / T01）。
 *
 * 提供：
 *  - `captureDiskState` 拍摄某路径的磁盘基线（mtime+size+内容hash）
 *  - `detectConflict`   检测单个 tab 是否存在「磁盘已被外部改动」的冲突
 *  - `buildConflictViewModel` 构造冲突解决页所需的视图模型
 *
 * 本模块是纯函数（仅依赖 fsCommands + fileHash），不引用任何 store，
 * 以避免循环依赖（store 会反过来引用本模块）。
 */
import type {
  EditorTab,
  DiskSignature,
  ConflictState,
  ConflictViewModel,
  FileMeta,
} from "../types";
import { readFileMeta, readFileText } from "../commands/fsCommands";
import { fnv1a } from "./fileHash";

/** 读取磁盘元信息（封装 plugin-fs 的 stat）；文件不存在时返回 exists:false。 */
export async function readMeta(path: string): Promise<FileMeta> {
  return readFileMeta(path);
}

/**
 * 拍摄某路径当前磁盘状态为 `DiskSignature`。
 *
 * - `content` 已提供时直接用它算 hash（避免重复读盘，例如保存后）；
 * - 否则读取磁盘内容算 hash。
 * - 无路径（未保存文档）或文件不存在时返回 `null`。
 */
export async function captureDiskState(
  path: string,
  content?: string,
): Promise<DiskSignature | null> {
  if (!path) return null;
  const meta = await readFileMeta(path);
  if (!meta.exists) return null;
  const text = content ?? (await readFileText(path));
  return { mtimeMs: meta.mtimeMs, size: meta.size, hash: fnv1a(text) };
}

/**
 * 检测单个 tab 是否存在「磁盘已被外部改动」的冲突。
 *
 * 仅当 tab 有路径且为脏（dirty）时才有意义；其余情况返回 hasConflict:false。
 * 以内容 hash 为准判定冲突，忽略部分编辑器仅改动 mtime 造成的误报。
 */
export async function detectConflict(tab: EditorTab): Promise<ConflictState> {
  if (!tab.path || !tab.dirty) {
    return {
      hasConflict: false,
      diskContent: "",
      diskSignature: tab.diskSignature ?? { mtimeMs: 0, size: 0, hash: "" },
    };
  }
  const meta = await readFileMeta(tab.path);
  const diskContent = await readFileText(tab.path);
  const newSig: DiskSignature = {
    mtimeMs: meta.mtimeMs,
    size: meta.size,
    hash: fnv1a(diskContent),
  };
  const hasConflict = tab.diskSignature ? newSig.hash !== tab.diskSignature.hash : true;
  return { hasConflict, diskContent, diskSignature: newSig };
}

/** 由 tab 与磁盘内容构造冲突解决页所需的视图模型（内存内容为当前快照）。 */
export function buildConflictViewModel(
  tab: EditorTab,
  diskContent: string,
  diskMtimeMs: number,
): ConflictViewModel {
  return {
    tabId: tab.id,
    name: tab.name,
    path: tab.path,
    diskContent,
    memoryContent: tab.content,
    diskMtimeMs,
    memoryDirty: tab.dirty,
  };
}
