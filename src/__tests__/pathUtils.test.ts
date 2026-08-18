import { describe, it, expect } from "vitest";
import { dirOf } from "../lib/pathUtils";

describe("dirOf", () => {
  it("returns parent dir for a Windows backslash path", () => {
    expect(dirOf("C:\\Users\\a\\notes\\file.md")).toBe("C:\\Users\\a\\notes");
  });

  it("returns parent dir for a POSIX path", () => {
    expect(dirOf("/home/user/docs/readme.md")).toBe("/home/user/docs");
  });

  it("handles a file directly under a drive root", () => {
    expect(dirOf("C:\\file.md")).toBe("C:");
  });

  it("returns the input when it has no directory component", () => {
    expect(dirOf("relative.md")).toBe("relative.md");
  });

  it("collapses repeated separators", () => {
    expect(dirOf("C:\\\\a\\\\b.md")).toBe("C:\\a");
  });
});
