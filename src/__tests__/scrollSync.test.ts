/**
 * Unit tests for the pure functions of the split-view sync module (Bug #2).
 *
 * The DOM-touching `registerScrollPane` is not exercised here — vitest runs
 * under `environment: "node"` without jsdom (see `vitest.config.ts`), so DOM
 * event listeners would never fire. The two pure functions are the only piece
 * that needs a fast, deterministic guarantee: the hosting components wire the
 * rest at runtime.
 */
import { describe, expect, it } from "vitest";
import {
  computeSyncedScrollTop,
  shouldSyncScroll,
} from "../lib/scrollSync";

describe("shouldSyncScroll", () => {
  it("syncs when split shows the same file with one editor + one preview", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "editor" },
      { tabId: "t", kind: "preview" },
    ]);
    expect(r).not.toBeNull();
    expect(r?.sync).toBe(true);
  });

  it("also syncs when the preview is the first pane (editor = B)", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "preview" },
      { tabId: "t", kind: "editor" },
    ]);
    expect(r).not.toBeNull();
    expect(r?.sync).toBe(true);
  });

  it("does not sync when the two panes show different files", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "a", kind: "editor" },
      { tabId: "b", kind: "preview" },
    ]);
    expect(r).toBeNull();
  });

  it("does not sync when both panes are editors (no preview)", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "editor" },
      { tabId: "t", kind: "editor" },
    ]);
    expect(r).toBeNull();
  });

  it("does not sync when both panes are previews", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "preview" },
      { tabId: "t", kind: "preview" },
    ]);
    expect(r).toBeNull();
  });

  it("does not sync in single layout", () => {
    const r = shouldSyncScroll("single", [
      { tabId: "t", kind: "editor" },
      { tabId: "t", kind: "preview" },
    ]);
    expect(r).toBeNull();
  });

  it("does not sync when either pane has no tab", () => {
    expect(
      shouldSyncScroll("split", [
        { tabId: null, kind: "editor" },
        { tabId: "t", kind: "preview" },
      ]),
    ).toBeNull();
    expect(
      shouldSyncScroll("split", [
        { tabId: "t", kind: "editor" },
        { tabId: null, kind: "preview" },
      ]),
    ).toBeNull();
  });

  it("does not sync when there are fewer than two panes", () => {
    const r = shouldSyncScroll("split", [{ tabId: "t", kind: "editor" }]);
    expect(r).toBeNull();
  });

  it("names the editor pane as the leader", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "editor" },
      { tabId: "t", kind: "preview" },
    ]);
    expect(r?.leader).toBe("A");
    expect(r?.follower).toBe("B");
  });

  it("names the editor pane as the leader even when it is the second pane", () => {
    const r = shouldSyncScroll("split", [
      { tabId: "t", kind: "preview" },
      { tabId: "t", kind: "editor" },
    ]);
    expect(r?.leader).toBe("B");
    expect(r?.follower).toBe("A");
  });
});

describe("computeSyncedScrollTop", () => {
  it("returns 0 when the source cannot scroll (content shorter than viewport)", () => {
    const r = computeSyncedScrollTop(50, 100, 100, 1000, 500);
    expect(r).toBe(0);
  });

  it("returns 0 when the dest cannot scroll (content shorter than viewport)", () => {
    const r = computeSyncedScrollTop(500, 1000, 500, 100, 100);
    expect(r).toBe(0);
  });

  it("returns 0 when either side has equal scroll and client heights", () => {
    const r = computeSyncedScrollTop(10, 500, 500, 1000, 500);
    expect(r).toBe(0);
  });

  it("maps the 0.5 ratio to the middle of the dest scroll range", () => {
    // source max = 1000 - 500 = 500; sourceTop = 250 → ratio 0.5
    // dest max = 2000 - 1000 = 1000; 0.5 * 1000 = 500
    const r = computeSyncedScrollTop(250, 1000, 500, 2000, 1000);
    expect(r).toBe(500);
  });

  it("maps the 0.0 ratio to the top", () => {
    const r = computeSyncedScrollTop(0, 1000, 500, 2000, 1000);
    expect(r).toBe(0);
  });

  it("clamps a ratio above 1 to the end of the dest range", () => {
    // sourceTop overshoots sourceMax → ratio clamps to 1
    const r = computeSyncedScrollTop(1000, 1000, 500, 2000, 1000);
    expect(r).toBe(1000);
  });

  it("clamps a ratio below 0 to the top", () => {
    const r = computeSyncedScrollTop(-100, 1000, 500, 2000, 1000);
    expect(r).toBe(0);
  });

  it("rounds the result to the nearest integer", () => {
    // sourceTop = 333, sourceMax = 500 → ratio = 0.666
    // destMax = 1000 → 0.666 * 1000 = 666
    const r = computeSyncedScrollTop(333, 1000, 500, 2000, 1000);
    expect(r).toBe(666);
  });

  it("is independent of source / dest absolute sizes — same ratio gives same dest ratio", () => {
    // Both scenarios sit at source ratio = 0.5; the dest ratio must match
    // regardless of the absolute sizes. NOTE: sourceTop must be sourceMax/2,
    // NOT sourceMax itself, otherwise the ratio is 1.0 and the assertion below
    // never holds. Previous copy had sourceTop = sourceMax, which forced ratio=1
    // and made this invariant test trivially pass-or-fail on the wrong branch.
    const r1 = computeSyncedScrollTop(50, 300, 200, 400, 200);
    const r2 = computeSyncedScrollTop(150, 900, 600, 1200, 600);
    expect(r1 / 200).toBeCloseTo(0.5, 6);
    expect(r2 / 600).toBeCloseTo(0.5, 6);
  });
});
