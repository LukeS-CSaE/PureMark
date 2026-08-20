/**
 * 标签页右键菜单"打开文件目录"功能测试。
 *
 * 背景：运行中从资源管理器打开新文件不再自动切换侧栏文件目录
 * （避免目录被永久带走），改由 tab 右键菜单"打开文件目录"主动触发
 * switchFolderRoot。本文件覆盖：
 *   ① buildTabMenu 含 openFolder 项，无路径的空白 tab 上禁用；
 *   ② 触发后建文件夹树并写入 UI store（currentFolder + 侧栏展开）；
 *   ③ lastFolder 被持久化（经 useConfigStore.update）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab } from "../types";

// mock 掉 Tauri 相关依赖：文件树命令直接返回空树，store 桥为 no-op。
vi.mock("../commands/fsCommands", () => ({
  buildTree: vi.fn(async () => []),
  renameFileCmd: vi.fn(),
  deleteFileCmd: vi.fn(),
  createFileCmd: vi.fn(),
  createDirCmd: vi.fn(),
  revealInExplorerCmd: vi.fn(),
  readFileText: vi.fn(),
}));
vi.mock("../lib/tauri", () => ({
  storeGet: vi.fn(async () => null),
  storeSet: vi.fn(async () => undefined),
}));

const { buildTabMenu } = await import("../lib/tabContextMenu");
const { buildTree } = await import("../commands/fsCommands");
const { useUIStore } = await import("../store/useUIStore");
const { useConfigStore } = await import("../store/useConfigStore");

function makeTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "tab-1",
    path: "D:\\notes\\demo.md",
    name: "demo.md",
    content: "# hi",
    savedContent: "# hi",
    dirty: false,
    diskSignature: null,
    cursor: { line: 1, col: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState({ currentFolder: null, sidebarVisible: false });
});

describe("buildTabMenu — openFolder 项", () => {
  it("有路径的 tab 包含可用的'切换到该文件的目录'项", () => {
    const items = buildTabMenu(makeTab());
    const item = items.find((i) => i.id === "openFolder");
    expect(item).toBeDefined();
    expect(item?.label).toBe("切换到该文件的目录");
    expect(item?.disabled).toBeFalsy();
  });

  it("未保存的空白 tab（无路径）上禁用", () => {
    const items = buildTabMenu(makeTab({ path: "", name: "未命名" }));
    const item = items.find((i) => i.id === "openFolder");
    expect(item?.disabled).toBe(true);
  });
});

describe("openFolder 触发效果 — switchFolderRoot", () => {
  it("以 tab 文件所在目录建树并切换侧栏目录", async () => {
    const items = buildTabMenu(makeTab());
    const item = items.find((i) => i.id === "openFolder");
    item?.run?.();
    // run 内部是 async 的 void 调用，等一拍让 Promise 落地。
    await vi.waitFor(() => {
      expect(buildTree).toHaveBeenCalledWith("D:\\notes");
    });
    const ui = useUIStore.getState();
    expect(ui.currentFolder).toBe("D:\\notes");
    expect(ui.sidebarVisible).toBe(true);
  });

  it("lastFolder 持久化到配置", async () => {
    const updateSpy = vi.spyOn(useConfigStore.getState(), "update");
    const items = buildTabMenu(makeTab({ path: "/root/notes/a.md" }));
    items.find((i) => i.id === "openFolder")?.run?.();
    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ lastFolder: "/root/notes" });
    });
    updateSpy.mockRestore();
  });

  it("buildTree 失败时不抛异常、不写 currentFolder", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(buildTree).mockRejectedValueOnce(new Error("denied"));
    const items = buildTabMenu(makeTab());
    expect(() => items.find((i) => i.id === "openFolder")?.run?.()).not.toThrow();
    await vi.waitFor(() => {
      expect(errSpy).toHaveBeenCalled();
    });
    expect(useUIStore.getState().currentFolder).toBeNull();
    errSpy.mockRestore();
  });
});
