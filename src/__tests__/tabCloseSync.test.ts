/**
 * 回归测试：关闭 Tab 后编辑区 pane 必须跟随 TabBar 选中态回退。
 *
 * Bug 根因：requestCloseTab 此前只调用 closeTab（仅回退 activeId），
 * 漏调 detachTab —— 持有该 tab 的 pane 仍指向已删除 id，TabBar 选中态
 * 已回退到相邻 tab，编辑区却停留在旧内容（新建空白文档则表现为空白），
 * 须手动点击相邻标签才恢复。
 *
 * 用真实 zustand store 走全链路（openInFocusedPane / newUntitledInFocusedPane
 * / requestCloseTab），只 mock 确认对话框。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/dialogs/UnsavedDialog", () => ({
  confirmUnsaved: vi.fn().mockResolvedValue(true),
  confirmClose: vi.fn().mockResolvedValue("discard"),
}));

import { useTabsStore } from "../store/useTabsStore";
import { usePanesStore } from "../store/usePanesStore";
import { openInFocusedPane, newUntitledInFocusedPane } from "../lib/paneRouter";
import { requestCloseTab } from "../lib/closeGuard";

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeId: null });
  usePanesStore.setState({
    layout: "single",
    panes: [
      { id: "A", tabId: null, viewMode: "live", cursor: { line: 1, col: 1 }, scrollTop: 0 },
    ],
    focusedPaneId: "A",
    splitRatio: 0.5,
  });
});

describe("关闭 Tab 同步编辑区（detachTab 回归）", () => {
  it("关闭新建空白 Tab：pane 回退到相邻文档且内容可达", async () => {
    openInFocusedPane({ path: "/root/a.md", name: "a.md", content: "hello" });
    const firstId = useTabsStore.getState().activeId!;
    newUntitledInFocusedPane();
    const untitledId = useTabsStore.getState().activeId!;
    expect(untitledId).not.toBe(firstId);
    expect(usePanesStore.getState().getPane("A")?.tabId).toBe(untitledId);

    await requestCloseTab(untitledId);

    // TabBar 选中态（activeId）与编辑区指针（pane.tabId）双双回退。
    expect(useTabsStore.getState().activeId).toBe(firstId);
    const pane = usePanesStore.getState().getPane("A");
    expect(pane?.tabId).toBe(firstId); // 修复前：仍停留在已删除的 untitledId
    // 编辑区据此可渲染相邻文档内容（修复前为空）。
    const tab = useTabsStore.getState().tabs.find((t) => t.id === pane?.tabId);
    expect(tab?.content).toBe("hello");
  });

  it("关闭最后一个 Tab：pane 置 null 进入空状态", async () => {
    newUntitledInFocusedPane();
    const id = useTabsStore.getState().activeId!;
    await requestCloseTab(id);
    expect(useTabsStore.getState().activeId).toBeNull();
    expect(usePanesStore.getState().getPane("A")?.tabId).toBeNull();
  });

  it("分屏下两个 pane 同时持有被关闭 tab 时都被回收", async () => {
    openInFocusedPane({ path: "/root/a.md", name: "a.md", content: "hello" });
    const firstId = useTabsStore.getState().activeId!;
    // 模拟分屏：B 镜像同一文档。
    usePanesStore.getState().setLayout("split");
    usePanesStore.getState().setPaneTab("B", firstId);
    newUntitledInFocusedPane();
    const untitledId = useTabsStore.getState().activeId!;
    usePanesStore.getState().setPaneTab("B", untitledId);

    await requestCloseTab(untitledId);

    expect(usePanesStore.getState().getPane("A")?.tabId).toBe(firstId);
    expect(usePanesStore.getState().getPane("B")?.tabId).toBe(firstId);
  });
});
