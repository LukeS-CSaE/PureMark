/**
 * 图片粘贴核心逻辑的纯函数测试（无需 DOM / Tauri）。
 *
 * 覆盖：
 *   - hasImageItem：剪贴板项列表含/不含图片的同步判定
 *   - extensionForMime：MIME → 扩展名映射
 *   - buildImageFileName：时间戳文件名格式
 *   - handleImagePaste：完整流程（mock writeBinaryFile）与无图片回退
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  hasImageItem,
  extensionForMime,
  buildImageFileName,
  handleImagePaste,
} from "../lib/pasteImage";

// mock 掉 Tauri 写入命令（纯函数测试不需要真实文件系统）。
vi.mock("../commands/fsCommands", () => ({
  writeBinaryFile: vi.fn(async () => undefined),
}));

/** 构造一个 fake DataTransferItemList（仅含 kind/type 即可满足判定逻辑）。 */
function fakeItems(entries: Array<{ kind: string; type: string }>): DataTransferItemList {
  const obj: Record<number, { kind: string; type: string; getAsFile: () => Blob | null }> = {};
  entries.forEach((e, i) => {
    obj[i] = {
      kind: e.kind,
      type: e.type,
      getAsFile: () => (e.kind === "file" ? new Blob(["png-data"], { type: e.type }) : null),
    };
  });
  return {
    length: entries.length,
    ...obj,
    add: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
    [Symbol.iterator]: function* () { for (let i = 0; i < entries.length; i++) yield obj[i]; },
  } as unknown as DataTransferItemList;
}

/** 构造一个 fake DataTransfer（含 items 和 clipboardData 接口）。 */
function fakeDataTransfer(entries: Array<{ kind: string; type: string }>): DataTransfer {
  const items = fakeItems(entries);
  return { items } as unknown as DataTransfer;
}

describe("hasImageItem", () => {
  it("含 image/png 项时返回 true", () => {
    const items = fakeItems([{ kind: "file", type: "image/png" }]);
    expect(hasImageItem(items)).toBe(true);
  });

  it("仅含 text/plain 项时返回 false", () => {
    const items = fakeItems([{ kind: "string", type: "text/plain" }]);
    expect(hasImageItem(items)).toBe(false);
  });

  it("空列表时返回 false", () => {
    const items = fakeItems([]);
    expect(hasImageItem(items)).toBe(false);
  });

  it("含 image/jpeg 项时返回 true", () => {
    const items = fakeItems([{ kind: "file", type: "image/jpeg" }]);
    expect(hasImageItem(items)).toBe(true);
  });
});

describe("extensionForMime", () => {
  it("image/png → png", () => {
    expect(extensionForMime("image/png")).toBe("png");
  });

  it("image/jpeg → jpg", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
  });

  it("image/gif → gif", () => {
    expect(extensionForMime("image/gif")).toBe("gif");
  });

  it("image/webp → webp", () => {
    expect(extensionForMime("image/webp")).toBe("webp");
  });

  it("未知 MIME 默认 png", () => {
    expect(extensionForMime("image/x-unknown")).toBe("png");
  });

  it("空字符串默认 png", () => {
    expect(extensionForMime("")).toBe("png");
  });
});

describe("buildImageFileName", () => {
  it("格式为 image-YYYYMMDD-HHmmss.ext", () => {
    const now = new Date(2026, 7, 21, 14, 30, 22); // 月份从 0 开始：7 = 八月
    const name = buildImageFileName("image/png", now);
    expect(name).toBe("image-20260821-143022.png");
  });

  it("jpeg 类型生成 .jpg 扩展名", () => {
    const now = new Date(2026, 0, 1, 9, 5, 3);
    const name = buildImageFileName("image/jpeg", now);
    expect(name).toBe("image-20260101-090503.jpg");
  });

  it("补零正确（单位数日月时分秒）", () => {
    const now = new Date(2026, 2, 5, 3, 7, 9); // 3月5日 03:07:09
    const name = buildImageFileName("image/gif", now);
    expect(name).toBe("image-20260305-030709.gif");
  });
});

describe("handleImagePaste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("剪贴板无图片时返回 null", async () => {
    const dt = fakeDataTransfer([{ kind: "string", type: "text/plain" }]);
    const result = await handleImagePaste(dt, "D:\\notes\\doc.md");
    expect(result).toBeNull();
  });

  it("剪贴板含图片时返回相对路径（assets/xxx.png）", async () => {
    const dt = fakeDataTransfer([{ kind: "file", type: "image/png" }]);
    const result = await handleImagePaste(dt, "D:\\notes\\doc.md");
    expect(result).not.toBeNull();
    expect(result).toMatch(/^assets\/image-\d{8}-\d{6}\.png$/);
  });

  it("Windows 路径正确处理（反斜杠分隔）", async () => {
    const dt = fakeDataTransfer([{ kind: "file", type: "image/png" }]);
    const result = await handleImagePaste(dt, "D:\\notes\\sub\\doc.md");
    expect(result).toMatch(/^assets\/image-.*\.png$/);
    // 验证 writeBinaryFile 被调用时传入了正确的绝对路径
    const { writeBinaryFile } = await import("../commands/fsCommands");
    expect(writeBinaryFile).toHaveBeenCalledTimes(1);
    const calledPath = (writeBinaryFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledPath).toContain("D:\\notes\\sub\\assets\\");
  });

  it("Unix 路径正确处理（正斜杠分隔）", async () => {
    const dt = fakeDataTransfer([{ kind: "file", type: "image/png" }]);
    const result = await handleImagePaste(dt, "/home/user/notes/doc.md");
    expect(result).toMatch(/^assets\/image-.*\.png$/);
    const { writeBinaryFile } = await import("../commands/fsCommands");
    const calledPath = (writeBinaryFile as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledPath).toContain("/home/user/notes/assets/");
  });

  it("调用 writeBinaryFile 写入 Uint8Array 数据", async () => {
    const dt = fakeDataTransfer([{ kind: "file", type: "image/png" }]);
    await handleImagePaste(dt, "/tmp/doc.md");
    const { writeBinaryFile } = await import("../commands/fsCommands");
    expect(writeBinaryFile).toHaveBeenCalledTimes(1);
    const data = (writeBinaryFile as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(data).toBeInstanceOf(Uint8Array);
  });
});
