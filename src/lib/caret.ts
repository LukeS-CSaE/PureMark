/** Compute the 1-based line/column for a given character offset. */
export function lineColFromOffset(
  value: string,
  offset: number,
): { line: number; col: number } {
  const before = value.slice(0, offset);
  const lines = before.split("\n");
  const line = lines.length;
  const col = (lines[lines.length - 1] ?? "").length + 1;
  return { line, col };
}
