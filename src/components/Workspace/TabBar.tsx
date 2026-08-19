import { type MouseEvent } from "react";
import { useTabsStore } from "../../store/useTabsStore";
import { useUIStore } from "../../store/useUIStore";
import { activateTabInFocusedPane } from "../../lib/paneRouter";
import { requestCloseTab } from "../../lib/closeGuard";
import { buildTabMenu } from "../../lib/tabContextMenu";
import { horizontalWheelDelta } from "../../lib/wheelToHorizontal";
import type { EditorTab } from "../../types";
import Icon from "../ui/Icon";

// 滚轮横向滚动：垂直滚轮 → scrollLeft（向下→右、向上→左），滚动条已用
// CSS 隐藏。用回调 ref + 模块级监听器而非 useEffect：
//   ① React 合成 wheel 在 root 上是 passive 的，preventDefault 无效，
//     必须原生监听 + passive:false；
//   ② 不引入 hooks，openFileWiring 测试的 fake 渲染（直接调用组件
//     函数）不受影响。
let wheelEl: HTMLDivElement | null = null;
function onTabBarWheel(e: WheelEvent): void {
  if (!wheelEl) return;
  const delta = horizontalWheelDelta(e.deltaX, e.deltaY);
  if (delta === null) return;
  e.preventDefault();
  wheelEl.scrollLeft += delta;
}
function attachTabBarWheel(el: HTMLDivElement | null): void {
  if (wheelEl) wheelEl.removeEventListener("wheel", onTabBarWheel);
  wheelEl = el;
  if (el) el.addEventListener("wheel", onTabBarWheel, { passive: false });
}

/** Multi-tab strip with dirty dots and per-tab close buttons. */
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);

  return (
    <div className="tab-bar" ref={attachTabBarWheel}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item${tab.id === activeId ? " active" : ""}`}
          onClick={() => activateTabInFocusedPane(tab.id)}
          onContextMenu={(e) => onTabContextMenu(e, tab)}
        >
          <span className="max-w-[180px] truncate">{tab.name}</span>
          {tab.dirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" title="未保存" />
          )}
          <button
            type="button"
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-foreground-subtle hover:bg-surface-3 hover:text-foreground"
            title="关闭"
            aria-label="关闭标签"
            onClick={(e) => {
              e.stopPropagation();
              void requestCloseTab(tab.id);
            }}
          >
            <Icon name="X" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// 需求2：标签页右键 → 自定义菜单（关闭类操作逐项走 requestCloseTab 脏写守卫）
function onTabContextMenu(e: MouseEvent, tab: EditorTab): void {
  e.preventDefault();
  e.stopPropagation();
  useUIStore.getState().openContextMenu({
    x: e.clientX,
    y: e.clientY,
    scope: "tab",
    items: buildTabMenu(tab),
    payload: { tabId: tab.id, path: tab.path },
  });
}
