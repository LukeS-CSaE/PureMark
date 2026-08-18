/**
 * Unit tests for `src/lib/closeGuard.ts::requestCloseTab` — the upgraded
 * "confirm before discarding unsaved changes" decision, now with conflict
 * detection and a three-state custom dialog (设计 T04 / 需求1).
 *
 * The zustand stores, the native Tauri confirm dialog, the conflict detector
 * and the custom dialog are all mocked so the pure decision logic can be
 * asserted without a Tauri runtime.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab } from "../types";

const closeTab = vi.fn();
const saveTab = vi.fn();
const openConflictView = vi.fn();
let tabs: EditorTab[] = [];

vi.mock("../store/useTabsStore", () => ({
  useTabsStore: {
    getState: () => ({ tabs, closeTab, saveTab }),
  },
}));

vi.mock("../store/useUIStore", () => ({
  useUIStore: {
    getState: () => ({ openConflictView }),
  },
}));

const confirmUnsaved = vi.fn<(name: string) => Promise<boolean>>();
const confirmClose = vi.fn<
  (conflict: boolean, names?: string[]) => Promise<string>
>();

vi.mock("../components/dialogs/UnsavedDialog", () => ({
  confirmUnsaved: (name: string) => confirmUnsaved(name),
  confirmClose: (conflict: boolean, names?: string[]) => confirmClose(conflict, names),
}));

const detectConflict = vi.fn<
  (tab: EditorTab) => Promise<{
    hasConflict: boolean;
    diskContent: string;
    diskSignature: { mtimeMs: number; size: number; hash: string };
  }>
>();

vi.mock("../lib/conflictGuard", () => ({
  detectConflict: (tab: EditorTab) => detectConflict(tab),
  buildConflictViewModel: vi.fn(),
}));

const { requestCloseTab } = await import("../lib/closeGuard");

function makeTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "t1",
    path: "/root/a.md",
    name: "a.md",
    content: "x",
    savedContent: "x",
    dirty: false,
    diskSignature: null,
    cursor: { line: 1, col: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  closeTab.mockReset();
  saveTab.mockReset();
  openConflictView.mockReset();
  confirmUnsaved.mockReset();
  confirmClose.mockReset();
  detectConflict.mockReset();
  tabs = [];
});

describe("requestCloseTab — clean tab", () => {
  it("closes immediately without asking", async () => {
    tabs = [makeTab({ dirty: false })];
    await requestCloseTab("t1");
    expect(confirmUnsaved).not.toHaveBeenCalled();
    expect(confirmClose).not.toHaveBeenCalled();
    expect(closeTab).toHaveBeenCalledWith("t1");
  });
});

describe("requestCloseTab — dirty tab, no conflict", () => {
  it("asks for confirmation and closes when the user confirms", async () => {
    tabs = [makeTab({ dirty: true })];
    detectConflict.mockResolvedValue({
      hasConflict: false,
      diskContent: "x",
      diskSignature: { mtimeMs: 1, size: 1, hash: "h" },
    });
    confirmUnsaved.mockResolvedValue(true);

    await requestCloseTab("t1");

    expect(detectConflict).toHaveBeenCalledTimes(1);
    expect(confirmUnsaved).toHaveBeenCalledWith("a.md");
    expect(closeTab).toHaveBeenCalledWith("t1");
  });

  it("keeps the tab open when the user cancels", async () => {
    tabs = [makeTab({ dirty: true })];
    detectConflict.mockResolvedValue({
      hasConflict: false,
      diskContent: "x",
      diskSignature: { mtimeMs: 1, size: 1, hash: "h" },
    });
    confirmUnsaved.mockResolvedValue(false);

    await requestCloseTab("t1");

    expect(confirmUnsaved).toHaveBeenCalledWith("a.md");
    expect(closeTab).not.toHaveBeenCalled();
  });
});

describe("requestCloseTab — dirty tab, conflict", () => {
  it("offers view-conflict and opens the resolve page without closing", async () => {
    tabs = [makeTab({ dirty: true, content: "mine", savedContent: "saved" })];
    detectConflict.mockResolvedValue({
      hasConflict: true,
      diskContent: "disk",
      diskSignature: { mtimeMs: 9, size: 4, hash: "d" },
    });
    confirmClose.mockResolvedValue("viewConflict");

    await requestCloseTab("t1");

    expect(confirmClose).toHaveBeenCalledWith(true, ["a.md"]);
    expect(openConflictView).toHaveBeenCalledTimes(1);
    expect(closeTab).not.toHaveBeenCalled();
    expect(saveTab).not.toHaveBeenCalled();
  });

  it("saves then closes when the user picks 保存", async () => {
    tabs = [makeTab({ dirty: true })];
    detectConflict.mockResolvedValue({
      hasConflict: true,
      diskContent: "disk",
      diskSignature: { mtimeMs: 9, size: 4, hash: "d" },
    });
    confirmClose.mockResolvedValue("save");

    await requestCloseTab("t1");

    expect(saveTab).toHaveBeenCalledWith("t1");
    expect(closeTab).toHaveBeenCalledWith("t1");
  });

  it("discards and closes when the user picks 不保存", async () => {
    tabs = [makeTab({ dirty: true })];
    detectConflict.mockResolvedValue({
      hasConflict: true,
      diskContent: "disk",
      diskSignature: { mtimeMs: 9, size: 4, hash: "d" },
    });
    confirmClose.mockResolvedValue("discard");

    await requestCloseTab("t1");

    expect(saveTab).not.toHaveBeenCalled();
    expect(closeTab).toHaveBeenCalledWith("t1");
  });

  it("keeps the tab open when the user cancels", async () => {
    tabs = [makeTab({ dirty: true })];
    detectConflict.mockResolvedValue({
      hasConflict: true,
      diskContent: "disk",
      diskSignature: { mtimeMs: 9, size: 4, hash: "d" },
    });
    confirmClose.mockResolvedValue("cancel");

    await requestCloseTab("t1");

    expect(closeTab).not.toHaveBeenCalled();
    expect(openConflictView).not.toHaveBeenCalled();
  });
});

describe("requestCloseTab — unknown id", () => {
  it("is a no-op when the tab does not exist", async () => {
    tabs = [makeTab({ id: "other" })];
    await requestCloseTab("t1");
    expect(confirmUnsaved).not.toHaveBeenCalled();
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("is a no-op when there are no tabs at all", async () => {
    tabs = [];
    await expect(requestCloseTab("t1")).resolves.toBeUndefined();
    expect(closeTab).not.toHaveBeenCalled();
  });
});
