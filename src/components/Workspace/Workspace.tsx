import TabBar from "./TabBar";
import EditorCard from "./EditorCard";
import { useTabsStore } from "../../store/useTabsStore";

/** Workspace container: tab strip + the active editor card. */
export default function Workspace() {
  const tabsCount = useTabsStore((s) => s.tabs.length);

  if (tabsCount === 0) {
    // No file open: show a blank document surface (editor area visible, empty).
    return (
      <section className="app-workspace">
        <EditorCard />
      </section>
    );
  }

  return (
    <section className="app-workspace">
      <TabBar />
      {<EditorCard />}
    </section>
  );
}
