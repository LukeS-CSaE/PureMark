/**
 * Unit tests for `src/lib/closeGuard.ts::requestCloseTab` — the "confirm before
 * discarding unsaved changes" decision.
 *
 * The zustand store and the native Tauri confirm dialog are mocked so the pure
 * decision logic can be asserted without a Tauri runtime.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorTab } from "../types";

const closeTab = vi.fn();
const confirmUnsaved = vi.fn<(name: string) => Promise<boolean>>();

let tabs: EditorTab[] = [];

vi.mock("../store/useTabsStore", () => ({
  useTabsStore: {
    getState: () => ({ tabs, closeTab }),
  },
}));

vi.mock("../components/dialogs/UnsavedDialog", () => ({
  confirmUnsaved: (name: string) => confirmUnsaved(name),
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
    cursor: { line: 1, col: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  closeTab.mockReset();
  confirmUnsaved.mockReset();
  tabs = [];
});

describe("requestCloseTab — clean tab", () => {
  it("closes immediately without asking", async () => {
    tabs = [makeTab({ dirty: false })];
    await requestCloseTab("t1");
    expect(confirmUnsaved).not.toHaveBeenCalled();
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledWith("t1");
  });
});

describe("requestCloseTab — dirty tab", () => {
  it("asks for confirmation and closes when the user confirms", async () => {
    tabs = [makeTab({ dirty: true })];
    confirmUnsaved.mockResolvedValue(true);

    await requestCloseTab("t1");

    expect(confirmUnsaved).toHaveBeenCalledTimes(1);
    expect(confirmUnsaved).toHaveBeenCalledWith("a.md");
    expect(closeTab).toHaveBeenCalledWith("t1");
  });

  it("keeps the tab open when the user cancels", async () => {
    tabs = [makeTab({ dirty: true })];
    confirmUnsaved.mockResolvedValue(false);

    await requestCloseTab("t1");

    expect(confirmUnsaved).toHaveBeenCalledTimes(1);
    expect(closeTab).not.toHaveBeenCalled();
  });

  it("passes the tab name to the dialog so the prompt is identifiable", async () => {
    tabs = [makeTab({ dirty: true, name: "未命名-1.md" })];
    confirmUnsaved.mockResolvedValue(true);

    await requestCloseTab("t1");

    expect(confirmUnsaved).toHaveBeenCalledWith("未命名-1.md");
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

describe("requestCloseTab — targeting", () => {
  it("only closes the requested tab among several", async () => {
    tabs = [
      makeTab({ id: "a", dirty: false }),
      makeTab({ id: "b", dirty: true, name: "b.md" }),
      makeTab({ id: "c", dirty: false }),
    ];
    confirmUnsaved.mockResolvedValue(true);

    await requestCloseTab("b");

    expect(confirmUnsaved).toHaveBeenCalledWith("b.md");
    expect(closeTab).toHaveBeenCalledTimes(1);
    expect(closeTab).toHaveBeenCalledWith("b");
  });
});
