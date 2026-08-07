import { describe, expect, it } from "vitest";
import {
  buildPathWithoutStripeConnectRedirect,
  readStripeConnectRedirect,
  stripStripeConnectRedirectParams,
} from "@/lib/stripe-connect-redirect";

describe("stripe connection redirect params", () => {
  it("reads connected redirect", () => {
    const params = new URLSearchParams("stripe=connected");

    expect(readStripeConnectRedirect(params)).toEqual({ kind: "connected" });
  });

  it("reads error redirect with message", () => {
    const params = new URLSearchParams(
      "stripe=error&message=Access%20denied"
    );

    expect(readStripeConnectRedirect(params)).toEqual({
      kind: "error",
      message: "Access denied",
    });
  });

  it("strips connection redirect params", () => {
    const params = new URLSearchParams(
      "stripe=connected&program=prg_123"
    );

    const stripped = stripStripeConnectRedirectParams(params);

    expect(stripped.toString()).toBe("program=prg_123");
  });

  it("builds a path without connection redirect params", () => {
    const params = new URLSearchParams(
      "stripe=connected&program=prg_123"
    );

    expect(
      buildPathWithoutStripeConnectRedirect("/dashboard", params)
    ).toBe("/dashboard?program=prg_123");
  });
});
