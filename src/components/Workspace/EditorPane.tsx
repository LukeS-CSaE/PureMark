/**
 * REMOVED IN iter2 (design §2, task T02 step 2.11).
 *
 * The MVP source editor was a single controlled `<textarea>` registered in the
 * global `editorBridge`. Both assumptions break with two simultaneously mounted
 * panes, and a textarea cannot host the live-preview decorations at all.
 *
 * Its replacement is `src/components/Workspace/CodeEditor.tsx` (CodeMirror 6).
 *
 * The file itself could not be unlinked in this environment (the sandbox
 * blocks deletes), so it is left as an empty module. It has no importers —
 * verified by a repository-wide search — and can be deleted outright by anyone
 * with write access to the working tree.
 */
export {};
