/**
 * CodeMirror 6 base configuration (design §1.1 / §8.1, task T02 step 2.2).
 *
 * Everything that can change at runtime goes through a `Compartment` — the
 * `EditorView` is created exactly once per pane and is NEVER destroyed and
 * rebuilt to apply a new configuration (design §8.1 "扩展注册方式").
 *
 * R-06 (document purity) is structural here: `EditorState.doc` only ever holds
 * the user's plain Markdown. Rendering happens in the view layer via
 * `Decoration`s produced by `livePreview.ts`; nothing in this module writes
 * HTML into the document.
 */
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  type Transaction,
  Prec,
} from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  type ViewUpdate,
} from "@codemirror/view";
import { markdownFormatKeymap } from "./markdownKeymap";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { codeHighlighting, fontTheme } from "./cmTheme";

/**
 * Marks a transaction as originating from the synchronisation layer
 * (store → view backfill, or peer-pane forwarding in a same-file split).
 *
 * Payload semantics (design §8.1):
 *   `true`  — the transaction came *from* the sync layer; the update listener
 *             must NOT write back to the store nor forward it to peers,
 *             otherwise the two panes ping-pong forever.
 *   `false` — a programmatic transaction that still represents a genuine user
 *             edit (`EditorHandle.replaceRange`, i.e. the formatting engine and
 *             search-and-replace). It carries the annotation so the "every
 *             programmatic dispatch is annotated" rule holds, but must still
 *             propagate.
 */
export const syncAnnotation = Annotation.define<boolean>();

/** `true` when the transaction must be ignored by the sync update listener. */
export function isSyncTransaction(tr: Transaction): boolean {
  return tr.annotation(syncAnnotation) === true;
}

/** Font family + font size (`useConfigStore.config`). */
export const fontCompartment = new Compartment();
/** `EditorView.darkTheme` flag (`useUIStore.resolvedTheme`). */
export const darkCompartment = new Compartment();
/** Live-preview decoration plugin on/off (`Pane.viewMode`). */
export const liveCompartment = new Compartment();
/** Editability — a pane with no open document is read-only. */
export const editableCompartment = new Compartment();

/**
 * Static extensions shared by every editor instance.
 *
 * `markdown()` is deliberately configured with `base: markdownLanguage`:
 * the default base is **CommonMark**, under which the GFM node types
 * (`Strikethrough`, `Task`, `Table`, `Autolink`) are never produced. This was
 * verified empirically — see `src/__tests__/markdownNodes.test.ts`, which locks
 * the behaviour down with a regression group. Design §1.1.3 assumed GFM was on
 * by default; it is not.
 */
export function baseExtensions(): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    highlightSpecialChars(),
    EditorView.lineWrapping,
    EditorState.allowMultipleSelections.of(true),
    indentUnit.of("  "),
    // `addKeymap` (default true) installs the Markdown list-continuation
    // bindings through language data, so we must not add them again here.
    markdown({ base: markdownLanguage }),
    codeHighlighting,
    // Markdown formatting shortcuts (Ctrl+B/I/X/E/K, headings) — highest
    // precedence so they win over the default keymap on the edit view.
    Prec.highest(keymap.of(markdownFormatKeymap)),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
  ];
}

export interface EditorSetupOptions {
  /** Initial document text (plain Markdown). */
  doc: string;
  fontFamily: string;
  fontSize: number;
  /** Resolved theme is `dark` — only sets CM6's internal inference flag. */
  dark: boolean;
  /** Whether the pane content is editable (false when no document is open). */
  editable: boolean;
  /**
   * The live-preview extension, or `[]` for the plain source mode. Injected by
   * the caller so that `setup.ts` does not import `livePreview.ts` (which needs
   * `syncAnnotation` from here — that would be a cycle).
   */
  liveExtension: Extension;
  /** Called for every view update; see `hooks/useDocSync.ts`. */
  onUpdate(update: ViewUpdate): void;
}

/** Build the initial `EditorState` for a pane. */
export function createEditorState(options: EditorSetupOptions): EditorState {
  return EditorState.create({
    doc: options.doc,
    extensions: [
      ...baseExtensions(),
      fontCompartment.of(fontTheme(options.fontFamily, options.fontSize)),
      darkCompartment.of(EditorView.darkTheme.of(options.dark)),
      liveCompartment.of(options.liveExtension),
      editableCompartment.of(EditorView.editable.of(options.editable)),
      EditorView.updateListener.of(options.onUpdate),
    ],
  });
}

/**
 * Reconfigure a compartment. Always annotated (`false` — it changes no text,
 * so the sync layer has nothing to do, but the annotation contract holds).
 */
export function reconfigure(
  view: EditorView,
  compartment: Compartment,
  value: Extension,
): void {
  view.dispatch({
    effects: compartment.reconfigure(value),
    annotations: syncAnnotation.of(true),
  });
}
