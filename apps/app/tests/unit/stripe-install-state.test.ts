import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  createStripeInstallState,
  verifyStripeInstallState,
} from "@/lib/stripe-install-state";

describe("stripe install state", () => {
  it("round-trips a signed state payload", () => {
    const state = createStripeInstallState(
      "app_test123",
      "user_test456",
      "/dashboard",
      false,
    );
    const payload = verifyStripeInstallState(state);

    expect(payload.appId).toBe("app_test123");
    expect(payload.userId).toBe("user_test456");
    expect(payload.returnTo).toBe("/dashboard");
    expect(payload.livemode).toBe(false);
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("rejects tampered state", () => {
    const state = createStripeInstallState("app_test123", "user_test456");
    const tampered = `${state}x`;

    expect(() => verifyStripeInstallState(tampered)).toThrow(
      "Invalid Stripe install state signature."
    );
  });

  it("rejects expired state", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        appId: "app_test123",
        userId: "user_test456",
        exp: Date.now() - 1000,
      })
    ).toString("base64url");
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    const signature = createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    const state = `${encoded}.${signature}`;

    expect(() => verifyStripeInstallState(state)).toThrow(
      "Stripe install state expired."
    );
  });
});
