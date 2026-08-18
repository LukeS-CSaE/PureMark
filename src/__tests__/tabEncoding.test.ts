/**
 * useTabsStore 编码链路测试（非 UTF-8 中文文档支持）：
 *  - openTab 保存检测到的 encoding / hadBom（缺省 utf-8 / false）；
 *  - saveTab 按原编码写回（GBK 文档不会被改写成 UTF-8）；
 *  - reloadFromDisk 无外部内容时重新检测磁盘编码并更新 tab。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  writeFileTextWithEncoding: vi.fn(async (_p: string, _c: string, _e?: string, _b?: boolean) => undefined),
  readFileTextWithEncoding: vi.fn(async (_p: string) => ({
    content: "",
    encoding: "utf-8",
    hadBom: false,
  })),
}));

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

vi.mock("../commands/fsCommands", () => ({
  readFileText: vi.fn(async () => ""),
  readFileTextWithEncoding: (...args: unknown[]) =>
    mocks.readFileTextWithEncoding(...(args as [string])),
  readFileMeta: vi.fn(async () => ({ exists: false, mtimeMs: 0, size: 0 })),
  writeFileText: vi.fn(async () => undefined),
  writeFileTextWithEncoding: (...args: unknown[]) =>
    mocks.writeFileTextWithEncoding(...(args as [string, string, string, boolean])),
  saveFileDialog: vi.fn(async () => null),
  openFileDialog: vi.fn(async () => null),
  openFolderDialog: vi.fn(async () => null),
  buildTree: vi.fn(async () => []),
}));

const { useTabsStore } = await import("../store/useTabsStore");

function reset(): void {
  useTabsStore.setState({ tabs: [], activeId: null });
  mocks.writeFileTextWithEncoding.mockClear();
  mocks.readFileTextWithEncoding.mockClear();
  mocks.readFileTextWithEncoding.mockResolvedValue({
    content: "",
    encoding: "utf-8",
    hadBom: false,
  });
}

beforeEach(reset);

describe("openTab — 编码信息落 tab", () => {
  it("保存检测到的 GBK 编码与 BOM 标记", () => {
    useTabsStore.getState().openTab({
      path: "C:\\docs\\gbk.md",
      name: "gbk.md",
      content: "# 中文",
      encoding: "gb18030",
      hadBom: false,
    });
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.encoding).toBe("gb18030");
    expect(tab.hadBom).toBe(false);
  });

  it("未提供编码时缺省 utf-8 / 无 BOM（新建文档 / 旧调用方）", () => {
    useTabsStore.getState().openTab({ path: "C:\\docs\\a.md", name: "a.md", content: "" });
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.encoding).toBe("utf-8");
    expect(tab.hadBom).toBe(false);
  });
});

describe("saveTab — 按原编码写回", () => {
  it("GBK 文档以 gb18030 写回，不改写成 UTF-8", async () => {
    useTabsStore.getState().openTab({
      path: "C:\\docs\\gbk.md",
      name: "gbk.md",
      content: "# 旧内容",
      encoding: "gb18030",
      hadBom: true,
    });
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateContent(id, "# 新内容");
    await useTabsStore.getState().saveTab(id);
    expect(mocks.writeFileTextWithEncoding).toHaveBeenCalledWith(
      "C:\\docs\\gbk.md",
      "# 新内容",
      "gb18030",
      true,
    );
    expect(useTabsStore.getState().tabs[0].dirty).toBe(false);
  });

  it("无编码信息的 tab 按 utf-8 写回", async () => {
    useTabsStore.getState().openTab({ path: "C:\\docs\\a.md", name: "a.md", content: "x" });
    const id = useTabsStore.getState().tabs[0].id;
    useTabsStore.getState().updateContent(id, "y");
    await useTabsStore.getState().saveTab(id);
    expect(mocks.writeFileTextWithEncoding).toHaveBeenCalledWith(
      "C:\\docs\\a.md",
      "y",
      "utf-8",
      false,
    );
  });
});

describe("reloadFromDisk — 重新检测编码", () => {
  it("未传入磁盘内容时重新检测并更新 tab 编码", async () => {
    useTabsStore.getState().openTab({
      path: "C:\\docs\\a.md",
      name: "a.md",
      content: "旧",
      encoding: "utf-8",
    });
    mocks.readFileTextWithEncoding.mockResolvedValueOnce({
      content: "新（外部改成 GBK 了）",
      encoding: "gb18030",
      hadBom: false,
    });
    await useTabsStore.getState().reloadFromDisk("C:\\docs\\a.md");
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.content).toBe("新（外部改成 GBK 了）");
    expect(tab.encoding).toBe("gb18030");
  });

  it("传入磁盘内容（fileWatcher 路径）时沿用原编码，不重新读盘", async () => {
    useTabsStore.getState().openTab({
      path: "C:\\docs\\a.md",
      name: "a.md",
      content: "旧",
      encoding: "big5",
    });
    await useTabsStore.getState().reloadFromDisk("C:\\docs\\a.md", "外部内容");
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.content).toBe("外部内容");
    expect(tab.encoding).toBe("big5");
    expect(mocks.readFileTextWithEncoding).not.toHaveBeenCalled();
  });
});
