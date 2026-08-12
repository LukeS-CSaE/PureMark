/**
 * Unit tests for the global hotkey registry (iter2-ext T05 / N-17).
 *
 * vitest runs under `environment: "node"` without jsdom (see
 * `vitest.config.ts`), so we cannot render the React hook end-to-end. Instead
 * we verify the two pure pieces the hook is built from — `matchHotkey` and
 * `createHotkeyHandler` — and confirm both the routing and the `preventDefault`
 * contract the hook must uphold.
 */
import { describe, expect, it, vi } from "vitest";
import {
  matchHotkey,
  createHotkeyHandler,
  type HotkeyMap,
} from "../hooks/useHotkeys";

function mockKeyEvent(
  key: string,
  ctrlKey = false,
  metaKey = false,
): KeyboardEvent {
  return {
    key,
    ctrlKey,
    metaKey,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe("matchHotkey", () => {
  it("matches Ctrl+F when ctrlKey is set", () => {
    const cb = vi.fn();
    expect(matchHotkey({ "Ctrl+F": cb }, mockKeyEvent("f", true))).toBe(cb);
  });

  it("matches Cmd+F when metaKey is set", () => {
    const cb = vi.fn();
    expect(matchHotkey({ "Cmd+F": cb }, mockKeyEvent("f", false, true))).toBe(cb);
  });

  it("returns null when no modifier is pressed", () => {
    const cb = vi.fn();
    expect(matchHotkey({ "Ctrl+F": cb }, mockKeyEvent("f"))).toBeNull();
  });

  it("is case-insensitive on the key letter", () => {
    const cb = vi.fn();
    expect(matchHotkey({ "Ctrl+F": cb }, mockKeyEvent("F", true))).toBe(cb);
  });

  it("returns null when the key letter differs", () => {
    expect(matchHotkey({ "Ctrl+F": vi.fn() }, mockKeyEvent("g", true))).toBeNull();
  });

  it("matches an entry whose only modifier is Ctrl+Cmd (either suffices)", () => {
    // The matcher treats any "ctrl" or "cmd" token as the modifier check;
    // either ctrlKey or metaKey satisfies it. This is what lets a single
    // "Ctrl+F" entry cover mac users (who press Cmd).
    const cb = vi.fn();
    const map: HotkeyMap = { "Ctrl+F": cb };
    expect(matchHotkey(map, mockKeyEvent("f", true, false))).toBe(cb);
    expect(matchHotkey(map, mockKeyEvent("f", false, true))).toBe(cb);
  });
});

describe("createHotkeyHandler", () => {
  it("calls preventDefault and the matched callback on a hit", () => {
    const cb = vi.fn();
    const handler = createHotkeyHandler({ "Ctrl+F": cb });
    const e = mockKeyEvent("f", true);
    handler(e);
    expect(cb).toHaveBeenCalledOnce();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("does not call preventDefault when nothing matches", () => {
    const cb = vi.fn();
    const handler = createHotkeyHandler({ "Ctrl+F": cb });
    const e = mockKeyEvent("g", true);
    handler(e);
    expect(cb).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("does not call preventDefault for plain key presses", () => {
    const cb = vi.fn();
    const handler = createHotkeyHandler({ "Ctrl+F": cb });
    const e = mockKeyEvent("f");
    handler(e);
    expect(cb).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("calls each registered callback exactly once per keypress", () => {
    const cbS = vi.fn();
    const cbW = vi.fn();
    const handler = createHotkeyHandler({
      "Ctrl+S": cbS,
      "Cmd+S": cbS,
      "Ctrl+W": cbW,
    });
    handler(mockKeyEvent("s", true));
    expect(cbS).toHaveBeenCalledOnce();
    expect(cbW).not.toHaveBeenCalled();
  });
});