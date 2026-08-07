import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { createJoinToken, verifyJoinToken } from "@/lib/join-token";

describe("join token", () => {
  it("round-trips a signed join payload", () => {
    const token = createJoinToken({
      programId: "prg_test123",
      email: "Affiliate@Example.com",
      appAgreementVersionId: "aagr_test456",
      name: "Alex Affiliate",
    });
    const payload = verifyJoinToken(token);

    expect(payload.programId).toBe("prg_test123");
    expect(payload.email).toBe("affiliate@example.com");
    expect(payload.appAgreementVersionId).toBe("aagr_test456");
    expect(payload.name).toBe("Alex Affiliate");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it("rejects a tampered token", () => {
    const token = createJoinToken({
      programId: "prg_test123",
      email: "affiliate@example.com",
      appAgreementVersionId: "aagr_test456",
    });
    const tampered = `${token}x`;

    expect(() => verifyJoinToken(tampered)).toThrow(
      "Invalid join token signature."
    );
  });

  it("rejects an expired token", () => {
    const encoded = Buffer.from(
      JSON.stringify({
        programId: "prg_test123",
        email: "affiliate@example.com",
        appAgreementVersionId: "aagr_test456",
        exp: Date.now() - 1000,
      })
    ).toString("base64url");
    const secret = process.env.BETTER_AUTH_SECRET ?? "";
    const signature = createHmac("sha256", secret)
      .update(encoded)
      .digest("base64url");
    const token = `${encoded}.${signature}`;

    expect(() => verifyJoinToken(token)).toThrow("Join token expired.");
  });
});
