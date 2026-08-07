import { describe, expect, it } from "vitest";
import {
  homePathForDefaultMode,
  homePathForProfile,
} from "@/lib/dashboard-nav";

describe("homePathForDefaultMode", () => {
  it("routes each mode to its home", () => {
    expect(homePathForDefaultMode("owner")).toBe("/dashboard");
    expect(homePathForDefaultMode("affiliate")).toBe("/affiliate");
    expect(homePathForDefaultMode(null)).toBe("/dashboard");
  });
});

describe("homePathForProfile", () => {
  it("routes admins to the admin panel over their default mode", () => {
    expect(
      homePathForProfile({
        is_admin: true,
        default_mode: "affiliate",
      })
    ).toBe("/dashboard/admin");
    expect(
      homePathForProfile({
        is_admin: false,
        default_mode: "affiliate",
      })
    ).toBe("/affiliate");
  });
});
