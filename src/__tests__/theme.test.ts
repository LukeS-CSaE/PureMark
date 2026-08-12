/**
 * Unit tests for `src/lib/theme.ts` (R-15 / R-16 / R-17).
 *
 * The suite runs in the `node` environment, so `window` / `document` are
 * installed as minimal fakes. This doubles as a regression test for the
 * "no DOM available" guards inside the module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, getSystemTheme, resolveTheme, watchSystemTheme } from "../lib/theme";

type Listener = (e: { matches: boolean }) => void;

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener(type: string, l: Listener): void;
  removeEventListener(type: string, l: Listener): void;
}

interface Harness {
  setMatches(v: boolean): void;
  emit(v: boolean): void;
  listenerCount(): number;
}

const g = globalThis as unknown as {
  window?: unknown;
  document?: unknown;
};

const originalWindow = g.window;
const originalDocument = g.document;

/** Install a fake `window.matchMedia` + `document.documentElement`. */
function installDom(initialDark: boolean): Harness {
  let matches = initialDark;
  const listeners = new Set<Listener>();

  const mql: FakeMediaQueryList = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    addEventListener(_type, l) {
      listeners.add(l);
    },
    removeEventListener(_type, l) {
      listeners.delete(l);
    },
  };

  g.window = { matchMedia: () => mql };
  g.document = { documentElement: { dataset: {} as Record<string, string> } };

  return {
    setMatches(v) {
      matches = v;
    },
    emit(v) {
      matches = v;
      for (const l of [...listeners]) l({ matches: v });
    },
    listenerCount: () => listeners.size,
  };
}

function currentDataTheme(): string | undefined {
  const doc = g.document as { documentElement: { dataset: Record<string, string> } };
  return doc.documentElement.dataset.theme;
}

function removeDom(): void {
  delete g.window;
  delete g.document;
}

afterEach(() => {
  if (originalWindow === undefined) delete g.window;
  else g.window = originalWindow;
  if (originalDocument === undefined) delete g.document;
  else g.document = originalDocument;
  vi.restoreAllMocks();
});

describe("getSystemTheme", () => {
  it("returns dark when the OS prefers dark", () => {
    installDom(true);
    expect(getSystemTheme()).toBe("dark");
  });

  it("returns light when the OS prefers light", () => {
    installDom(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("falls back to light without a DOM", () => {
    removeDom();
    expect(getSystemTheme()).toBe("light");
  });

  it("falls back to light when matchMedia throws", () => {
    g.window = {
      matchMedia: () => {
        throw new Error("unsupported");
      },
    };
    expect(getSystemTheme()).toBe("light");
  });
});

describe("resolveTheme", () => {
  beforeEach(() => installDom(true));

  it("passes an explicit light preference through", () => {
    expect(resolveTheme("light")).toBe("light");
  });

  it("passes an explicit dark preference through", () => {
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("delegates to the OS for auto", () => {
    expect(resolveTheme("auto")).toBe("dark");
  });

  it("auto follows the OS when it flips to light", () => {
    const h = installDom(true);
    h.setMatches(false);
    expect(resolveTheme("auto")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("writes the resolved theme onto <html data-theme>", () => {
    installDom(false);
    applyTheme("dark");
    expect(currentDataTheme()).toBe("dark");
    applyTheme("light");
    expect(currentDataTheme()).toBe("light");
  });

  it("is a no-op without a document", () => {
    removeDom();
    expect(() => applyTheme("dark")).not.toThrow();
  });
});

describe("watchSystemTheme", () => {
  it("invokes the callback on OS theme changes", () => {
    const h = installDom(false);
    const cb = vi.fn();
    const stop = watchSystemTheme(cb);

    h.emit(true);
    expect(cb).toHaveBeenCalledWith("dark");

    h.emit(false);
    expect(cb).toHaveBeenLastCalledWith("light");

    stop();
  });

  it("returns a working unsubscribe function", () => {
    const h = installDom(false);
    const cb = vi.fn();
    const stop = watchSystemTheme(cb);
    expect(h.listenerCount()).toBe(1);

    stop();
    expect(h.listenerCount()).toBe(0);

    h.emit(true);
    expect(cb).not.toHaveBeenCalled();
  });

  it("returns a safe no-op unsubscribe without a DOM", () => {
    removeDom();
    const stop = watchSystemTheme(() => undefined);
    expect(() => stop()).not.toThrow();
  });

  it("supports legacy addListener/removeListener WebViews", () => {
    const listeners = new Set<Listener>();
    const legacyMql = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addListener(l: Listener) {
        listeners.add(l);
      },
      removeListener(l: Listener) {
        listeners.delete(l);
      },
    };
    g.window = { matchMedia: () => legacyMql };

    const cb = vi.fn();
    const stop = watchSystemTheme(cb);
    expect(listeners.size).toBe(1);

    for (const l of [...listeners]) l({ matches: true });
    expect(cb).toHaveBeenCalledWith("dark");

    stop();
    expect(listeners.size).toBe(0);
  });
});
