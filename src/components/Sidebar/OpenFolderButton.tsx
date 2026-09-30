import { openFolderDialog } from "../../commands/fsCommands";
import { switchFolderRoot } from "../../lib/fileOps";
import Icon from "../ui/Icon";

/** Icon button that opens a folder and builds its tree. */
export default function OpenFolderButton() {
  async function handleOpen() {
    const folder = await openFolderDialog();
    if (!folder) return;
    // 目录切换统一走 switchFolderRoot（建树 + setFolder + 持久化 + 展开侧栏）。
    await switchFolderRoot(folder);
  }

  return (
    <button
      type="button"
      className="btn-icon"
      title="打开文件夹"
      aria-label="打开文件夹"
      onClick={() => void handleOpen()}
    >
      <Icon name="FolderOpen" size={16} />
    </button>
  );
}
