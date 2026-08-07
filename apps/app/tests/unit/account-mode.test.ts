import { describe, expect, it } from "vitest";
import { resolveDefaultMode } from "@/services/users/me";

describe("resolveDefaultMode", () => {
  it("uses the selected mode when the account has no memberships", () => {
    expect(resolveDefaultMode("owner", false, false)).toBe("owner");
    expect(resolveDefaultMode("affiliate", false, false)).toBe("affiliate");
  });

  it("routes accounts with only one available mode to that mode", () => {
    expect(resolveDefaultMode("affiliate", true, false)).toBe("owner");
    expect(resolveDefaultMode("owner", false, true)).toBe("affiliate");
  });

  it("uses the selected mode when both modes are available", () => {
    expect(resolveDefaultMode("owner", true, true)).toBe("owner");
    expect(resolveDefaultMode("affiliate", true, true)).toBe("affiliate");
  });
});
