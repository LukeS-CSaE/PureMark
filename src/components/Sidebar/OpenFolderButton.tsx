import { openFolderDialog, buildTree } from "../../commands/fsCommands";
import { useUIStore } from "../../store/useUIStore";
import { useConfigStore } from "../../store/useConfigStore";
import Icon from "../ui/Icon";

/** Icon button that opens a folder and builds its tree. */
export default function OpenFolderButton() {
  const setFolder = useUIStore((s) => s.setFolder);
  const updateConfig = useConfigStore((s) => s.update);

  async function handleOpen() {
    const folder = await openFolderDialog();
    if (!folder) return;
    const tree = await buildTree(folder);
    setFolder(folder, tree);
    updateConfig({ lastFolder: folder });
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
