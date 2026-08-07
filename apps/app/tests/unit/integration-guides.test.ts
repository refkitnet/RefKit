import { describe, expect, it } from "vitest";
import {
  AGENT_INTEGRATION_GUIDE_URL,
  buildAgentIntegrationPrompt,
} from "@/lib/integration-guides";

describe("buildAgentIntegrationPrompt", () => {
  it("links the maintained guide and includes app-specific context", () => {
    const prompt = buildAgentIntegrationPrompt({
      apiUrl: "https://app.refkit.net/",
      appId: "app_test",
      programId: "prg_test",
      revenueSource: "stripe",
      setupMode: "test",
    });

    expect(prompt).toContain(AGENT_INTEGRATION_GUIDE_URL);
    expect(prompt).toContain("App ID: app_test");
    expect(prompt).toContain("Program ID: prg_test");
    expect(prompt).not.toContain("Program slug:");
    expect(prompt).toContain("Billing: Stripe");
    expect(prompt).toContain(
      "attach the exact stripe_metadata returned by /v1/identify",
    );
    expect(prompt).toContain(
      "Do not implement /v1/transactions or /v1/transactions/refunds",
    );
    expect(prompt).toContain("REFKIT_API_KEY");
    expect(prompt).not.toContain("rk_test_app_");
    expect(prompt).toContain("Do not paste live keys into chat");
    expect(prompt).toContain("npx refkitnet status --app-id app_test");
  });

  it("includes test environment variables when provided", () => {
    const prompt = buildAgentIntegrationPrompt({
      apiUrl: "https://app.refkit.net/",
      appId: "app_test",
      programId: "prg_test",
      revenueSource: "stripe",
      setupMode: "test",
      environmentVariables: [
        "REFKIT_API_URL=https://app.refkit.net",
        "REFKIT_API_KEY=rk_test_app_secret",
      ].join("\n"),
    });

    expect(prompt).toContain("Add these values to the server environment (test key):");
    expect(prompt).toContain("REFKIT_API_URL=https://app.refkit.net");
    expect(prompt).toContain("REFKIT_API_KEY=rk_test_app_secret");
    expect(prompt).not.toContain("Do not paste live keys into chat");
    expect(prompt).toContain("Do not expose it to browser code or commit it");
  });

  it("keeps local API context in the verification command", () => {
    const prompt = buildAgentIntegrationPrompt({
      apiUrl: "http://localhost:3000/",
      appId: "app_local",
      programId: "prg_local",
      revenueSource: "api",
      setupMode: "production",
    });

    expect(prompt).toContain("Billing: RefKit API reporting");
    expect(prompt).toContain(
      "persist the returned customer_id and program_id",
    );
    expect(prompt).toContain(
      "report successful payments to /v1/transactions and refunds to /v1/transactions/refunds",
    );
    expect(prompt).toContain(
      "Do not add RefKit metadata to Stripe objects",
    );
    expect(prompt).toContain("Setup mode: production");
    expect(prompt).toContain(
      "npx refkitnet status --app-id app_local --api-url http://localhost:3000",
    );
  });

  it("does not add a RefKit-hosted guide to Self-Hosted prompts", () => {
    const prompt = buildAgentIntegrationPrompt({
      apiUrl: "https://affiliates.example.com",
      appId: "app_private",
      programId: "prg_private",
      revenueSource: "api",
      setupMode: "production",
      includeExternalGuide: false,
    });

    expect(prompt).not.toContain(AGENT_INTEGRATION_GUIDE_URL);
    expect(prompt).not.toContain("refkit.net");
    expect(prompt).toContain("supplied by this RefKit instance operator");
  });
});
