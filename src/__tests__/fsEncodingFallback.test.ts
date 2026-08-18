/**
 * fsCommands 编码感知读写的行为测试：
 *  - 自定义 Rust 命令可用时透传 `read_text_auto` / `write_text_enc` 的结果与参数；
 *  - 命令不可用（浏览器 dev / 旧二进制）时降级为 plugin-fs 的 UTF-8 读写，
 *    绝不把异常抛给调用方。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn((..._args: unknown[]): Promise<unknown> => Promise.resolve(undefined)),
  readTextFile: vi.fn((..._args: unknown[]): Promise<string> => Promise.resolve("")),
  writeTextFile: vi.fn((..._args: unknown[]): Promise<void> => Promise.resolve(undefined)),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mocks.invoke(...args),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: (...args: unknown[]) => mocks.readTextFile(...args),
  writeTextFile: (...args: unknown[]) => mocks.writeTextFile(...args),
  stat: vi.fn(async () => ({ mtime: new Date(), size: 0 })),
}));

const { readFileTextWithEncoding, readFileText, writeFileTextWithEncoding } = await import(
  "../commands/fsCommands"
);

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.readTextFile.mockReset();
  mocks.writeTextFile.mockReset();
  mocks.readTextFile.mockResolvedValue("");
  mocks.writeTextFile.mockResolvedValue(undefined);
});

describe("readFileTextWithEncoding", () => {
  it("透传 read_text_auto 的检测结果（GBK 文档）", async () => {
    mocks.invoke.mockResolvedValueOnce({ content: "# 标题", encoding: "gb18030", hadBom: false });
    const r = await readFileTextWithEncoding("C:\\docs\\a.md");
    expect(mocks.invoke).toHaveBeenCalledWith("read_text_auto", { path: "C:\\docs\\a.md" });
    expect(r).toEqual({ content: "# 标题", encoding: "gb18030", hadBom: false });
  });

  it("命令不可用时降级为 UTF-8 读取，不抛异常", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("command not found"));
    mocks.readTextFile.mockResolvedValueOnce("# hello");
    const r = await readFileTextWithEncoding("C:\\docs\\a.md");
    expect(mocks.readTextFile).toHaveBeenCalledWith("C:\\docs\\a.md");
    expect(r).toEqual({ content: "# hello", encoding: "utf-8", hadBom: false });
  });

  it("readFileText 只返回解码后的文本", async () => {
    mocks.invoke.mockResolvedValueOnce({ content: "正文", encoding: "big5", hadBom: true });
    await expect(readFileText("p")).resolves.toBe("正文");
  });
});

describe("writeFileTextWithEncoding", () => {
  it("按原编码 + BOM 标记调用 write_text_enc", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);
    await writeFileTextWithEncoding("p", "内容", "gb18030", true);
    expect(mocks.invoke).toHaveBeenCalledWith("write_text_enc", {
      path: "p",
      content: "内容",
      encoding: "gb18030",
      withBom: true,
    });
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
  });

  it("缺省参数为 utf-8 / 无 BOM", async () => {
    mocks.invoke.mockResolvedValueOnce(undefined);
    await writeFileTextWithEncoding("p", "x");
    expect(mocks.invoke).toHaveBeenCalledWith("write_text_enc", {
      path: "p",
      content: "x",
      encoding: "utf-8",
      withBom: false,
    });
  });

  it("编码失败（如 Big5 无法表示）时降级为 UTF-8 写入，保证不丢内容", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("部分字符无法用 big5 编码"));
    await writeFileTextWithEncoding("p", "😀", "big5");
    expect(mocks.writeTextFile).toHaveBeenCalledWith("p", "😀");
  });
});
