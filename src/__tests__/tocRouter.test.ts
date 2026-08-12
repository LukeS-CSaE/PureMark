/**
 * T03 — TOC router + registry (iter2-ext N-07 / N-16).
 *
 * `tocRegistry` is exercised directly (register / lookup / unregister, and
 * per-pane independence). `jumpToHeading` is verified at the orchestration
 * boundary: it must focus the pane *before* scrolling, and be a safe no-op
 * when the pane has no adapter registered.
 *
 * `focusPane` is mocked (the real one lives in `paneRouter`, which pulls in
 * the stores); `tocRegistry` stays real so the adapter map is exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusPane } from "../lib/paneRouter";
import {
  clearTocAdapters,
  getTocAdapter,
  registerToc,
  unregisterToc,
} from "../lib/tocRegistry";
import { jumpToHeading } from "../lib/tocRouter";
import type { TocItem } from "../types";

vi.mock("../lib/paneRouter", () => ({ focusPane: vi.fn() }));

const item: TocItem = { id: "a", level: 1, text: "A", line: 42, index: 0 };

beforeEach(() => {
  clearTocAdapters();
  vi.clearAllMocks();
});

describe("tocRegistry", () => {
  it("registers, looks up and unregisters an adapter by paneId", () => {
    const adapter = { getMarkdown: () => "# x", scrollToHeading: vi.fn() };
    expect(getTocAdapter("A")).toBeUndefined();
    registerToc("A", adapter);
    expect(getTocAdapter("A")).toBe(adapter);
    unregisterToc("A");
    expect(getTocAdapter("A")).toBeUndefined();
  });

  it("keeps adapters for different panes independent", () => {
    const a = { getMarkdown: () => "a", scrollToHeading: vi.fn() };
    const b = { getMarkdown: () => "b", scrollToHeading: vi.fn() };
    registerToc("A", a);
    registerToc("B", b);
    expect(getTocAdapter("A")).toBe(a);
    expect(getTocAdapter("B")).toBe(b);
  });

  it("replaces an existing adapter on re-register", () => {
    const first = { getMarkdown: () => "1", scrollToHeading: vi.fn() };
    const second = { getMarkdown: () => "2", scrollToHeading: vi.fn() };
    registerToc("A", first);
    registerToc("A", second);
    expect(getTocAdapter("A")).toBe(second);
  });
});

describe("jumpToHeading", () => {
  it("focuses the pane first, then scrolls to the heading line", () => {
    const scroll = vi.fn();
    registerToc("A", { getMarkdown: () => "", scrollToHeading: scroll });

    jumpToHeading("A", item);

    const fp = vi.mocked(focusPane);
    expect(fp).toHaveBeenCalledWith("A");
    expect(scroll).toHaveBeenCalledWith(42);
    expect(fp.mock.invocationCallOrder[0]).toBeLessThan(
      scroll.mock.invocationCallOrder[0],
    );
  });

  it("is a safe no-op when the pane has no adapter (no focus, no scroll)", () => {
    // No adapter registered for "A" (cleared in beforeEach).
    jumpToHeading("A", item);
    expect(focusPane).not.toHaveBeenCalled();
  });

  it("does nothing after the adapter is unregistered", () => {
    const scroll = vi.fn();
    registerToc("A", { getMarkdown: () => "", scrollToHeading: scroll });
    unregisterToc("A");
    jumpToHeading("A", item);
    expect(focusPane).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
  });
});
