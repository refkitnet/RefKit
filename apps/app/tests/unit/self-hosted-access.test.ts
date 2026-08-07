import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as connectStripe } from "@/app/api/v1/stripe/connect-link/route";
import { GET as browseNetwork } from "@/app/api/v1/network/apps/route";
import { POST as contactSupport } from "@/app/api/v1/support/route";
import { POST as exportManagedData } from "@/app/api/v1/managed-data-subjects/export/route";
import { GET as apiIndex } from "@/app/api/v1/route";
import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { validateAdminAccess } from "@/services/admin/gate";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Self-Hosted private access", () => {
  it("closes public registration without referring visitors to RefKit Cloud", async () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    const response = await register(
      new Request("https://refkit.example/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Visitor",
          email: "visitor@example.com",
          primary_mode: "owner",
        }),
      })
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("registration_closed");
    expect(body.error.message).not.toContain("refkit.net");
  });

  it("blocks managed Stripe before authentication or provider access", async () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    const response = await connectStripe(
      new Request("https://refkit.example/api/v1/stripe/connect-link", {
        method: "POST",
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "capability_unavailable" },
    });
  });

  it("uses the database administrator flag without a Cloud allowlist", () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");
    vi.stubEnv("ADMIN_EMAIL_ALLOWLIST", "");

    expect(validateAdminAccess("admin@example.com", true)).toBe(true);
    expect(validateAdminAccess("admin@example.com", false)).toBe(false);
  });

  it("blocks managed data access before authentication", async () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    const response = await exportManagedData(
      new Request("https://refkit.example/v1/managed-data-subjects/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_customer_id: "customer_identity_1234",
        }),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "capability_unavailable" },
    });
  });

  it("omits Cloud-only endpoints from the API index", async () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    const response = await apiIndex();
    const body = await response.json();

    expect(body.endpoints).not.toContain("POST /v1/support");
    expect(body.endpoints).not.toContain("GET /v1/network/apps");
    expect(body.endpoints).not.toContain("POST /v1/stripe/connect-link");
    expect(body.endpoints).not.toContain(
      "POST /v1/managed-data-subjects/export"
    );
    expect(body.endpoints).toContain("POST /v1/transactions");
  });

  it.each([
    [
      "official Network",
      () => browseNetwork(new Request("https://refkit.example/v1/network/apps")),
    ],
    [
      "RefKit support",
      () => contactSupport(new Request("https://refkit.example/v1/support", {
        method: "POST",
      })),
    ],
    [
      "Stripe webhooks",
      () => stripeWebhook(new Request("https://refkit.example/api/webhooks/stripe", {
        method: "POST",
      })),
    ],
  ])("blocks %s before provider or authentication access", async (_name, call) => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    const response = await call();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "capability_unavailable" },
    });
  });
});
