import { useTabsStore } from "../../store/useTabsStore";
import { activateTabInFocusedPane } from "../../lib/paneRouter";
import { requestCloseTab } from "../../lib/closeGuard";
import Icon from "../ui/Icon";

/** Multi-tab strip with dirty dots and per-tab close buttons. */
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);

  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item${tab.id === activeId ? " active" : ""}`}
          onClick={() => activateTabInFocusedPane(tab.id)}
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
