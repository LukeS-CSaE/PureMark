/**
 * Bridge between the (singular) active editor textarea and the toolbar/search
 * UI. The active textarea registers itself on focus so formatting commands and
 * the search panel can read its current value/selection without prop drilling.
 */
let activeTextarea: HTMLTextAreaElement | null = null;

export function setActiveTextarea(el: HTMLTextAreaElement | null): void {
  activeTextarea = el;
}

export function getActiveTextarea(): HTMLTextAreaElement | null {
  return activeTextarea;
}
