import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: childProcessMocks.spawn,
}));

import { openBrowser } from "../src/lib/process.js";

describe("openBrowser", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    childProcessMocks.spawn.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  function mockChild() {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    childProcessMocks.spawn.mockReturnValue(child);
    return child;
  }

  it("keeps a missing system opener from crashing the CLI", () => {
    const child = mockChild();

    openBrowser("https://example.com/verify");

    expect(() => child.emit("error", new Error("spawn xdg-open ENOENT"))).not.toThrow();
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("passes Windows URLs to a shell-free launcher as one argument", () => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    mockChild();
    const url = "https://example.com/verify?next=one&calc.exe";

    openBrowser(url);

    expect(childProcessMocks.spawn).toHaveBeenCalledWith(
      "rundll32.exe",
      ["url.dll,FileProtocolHandler", url],
      {
        detached: true,
        stdio: "ignore",
      },
    );
  });

  it("rejects non-HTTP browser URLs", () => {
    expect(() => openBrowser("file:///C:/Windows/System32/calc.exe")).toThrow(
      "Only HTTP and HTTPS URLs can be opened.",
    );
    expect(childProcessMocks.spawn).not.toHaveBeenCalled();
  });
});
