/**
 * 新建文档保存时，保存对话框默认定位到侧栏文件目录：
 *  - saveTab 对无路径 tab 把（侧栏目录 / lastFolder）传给保存对话框；
 *  - fsCommands.saveFileDialog 将目录与文件名拼成 defaultPath 传给系统对话框；
 *  - 用户取消时保持脏状态不落盘。
 *
 * 只 mock 底层 Tauri 插件（dialog / fs / invoke），fsCommands 与 store 走真实链路。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  dialogSave: vi.fn(async (_opts: unknown) => null as string | null),
  writeTextFile: vi.fn(async (_p: string, _c: string) => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: (...args: unknown[]) => mocks.dialogSave(...(args as [unknown])),
  ask: vi.fn(async () => true),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(async () => ""),
  writeTextFile: (...args: unknown[]) => mocks.writeTextFile(...(args as [string, string])),
  stat: vi.fn(async () => ({ mtime: new Date(), size: 0 })),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {
    throw new Error("no rust in tests");
  }),
}));

vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const { useTabsStore } = await import("../store/useTabsStore");
const { useUIStore } = await import("../store/useUIStore");
const { useConfigStore } = await import("../store/useConfigStore");
const { saveFileDialog } = await import("../commands/fsCommands");

function reset(): void {
  useTabsStore.setState({ tabs: [], activeId: null });
  useUIStore.setState({ currentFolder: null, tree: [] });
  useConfigStore.setState((s) => ({ config: { ...s.config, lastFolder: null } }));
  mocks.dialogSave.mockClear();
  mocks.dialogSave.mockResolvedValue(null);
  mocks.writeTextFile.mockClear();
}

beforeEach(reset);

/** 打开一个无路径的空白 tab 并返回其 id。 */
function openUntitled(): string {
  useTabsStore.getState().newUntitled();
  const tab = useTabsStore.getState().tabs[0];
  useTabsStore.getState().updateContent(tab.id, "# 新内容");
  return tab.id;
}

describe("saveTab — 保存对话框默认定位侧栏文件目录", () => {
  it("侧栏有目录时对话框 defaultPath 落在该目录下", async () => {
    useUIStore.setState({ currentFolder: "C:\\docs\\notes" });
    const id = openUntitled();
    const name = useTabsStore.getState().tabs[0].name;
    await useTabsStore.getState().saveTab(id);
    expect(mocks.dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: `C:\\docs\\notes\\${name}` }),
    );
  });

  it("侧栏无目录时回退 config.lastFolder", async () => {
    useConfigStore.setState((s) => ({
      config: { ...s.config, lastFolder: "D:\\last" },
    }));
    const id = openUntitled();
    await useTabsStore.getState().saveTab(id);
    expect(mocks.dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: expect.stringContaining("D:\\last\\") }),
    );
  });

  it("两者皆无时仅预填文件名（目录交给 OS 决定）", async () => {
    const id = openUntitled();
    await useTabsStore.getState().saveTab(id);
    const { defaultPath } = mocks.dialogSave.mock.calls[0][0] as { defaultPath?: string };
    expect(defaultPath).not.toContain("\\");
    expect(defaultPath).not.toContain("/");
  });

  it("用户取消时保持 tab 脏状态、不落盘", async () => {
    useUIStore.setState({ currentFolder: "C:\\docs\\notes" });
    mocks.dialogSave.mockResolvedValueOnce(null);
    const id = openUntitled();
    await useTabsStore.getState().saveTab(id);
    expect(mocks.writeTextFile).not.toHaveBeenCalled();
    expect(useTabsStore.getState().tabs[0].dirty).toBe(true);
  });
});

describe("fsCommands.saveFileDialog — defaultPath 拼接", () => {
  it("目录 + 文件名拼成完整 defaultPath", async () => {
    mocks.dialogSave.mockResolvedValueOnce("C:\\docs\\notes\\新文件.md");
    const result = await saveFileDialog("新文件.md", "C:\\docs\\notes");
    expect(mocks.dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:\\docs\\notes\\新文件.md" }),
    );
    expect(result).toBe("C:\\docs\\notes\\新文件.md");
  });

  it("目录带尾部分隔符时不产生双分隔符", async () => {
    mocks.dialogSave.mockResolvedValueOnce(null);
    await saveFileDialog("a.md", "C:\\docs\\");
    expect(mocks.dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "C:\\docs\\a.md" }),
    );
  });

  it("无目录时仅预填文件名", async () => {
    mocks.dialogSave.mockResolvedValueOnce(null);
    await saveFileDialog("未命名.md");
    expect(mocks.dialogSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "未命名.md" }),
    );
  });
});
