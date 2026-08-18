/**
 * 同步内容指纹（FNV-1a 32-bit）。
 *
 * 用于文件内容冲突检测（设计 §1.3 / D3）：零依赖、同步执行，避免
 * `crypto.subtle` 的异步开销。返回 8 位十六进制字符串。
 *
 * 仅做「内容是否真的变化」的快速确认，不追求密码学强度。
 */
export function fnv1a(str: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 乘以 FNV prime（0x01000193）；用 Math.imul 保证 32-bit 溢出语义
    hash = Math.imul(hash, 0x01000193);
  }
  // 转无符号 32-bit 后再转十六进制，补零到 8 位
  return (hash >>> 0).toString(16).padStart(8, "0");
}
