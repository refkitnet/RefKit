import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetServerEnvCache,
  validateServerEnv,
} from "@/lib/env";

function configureValidSelfHostedEnvironment() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("REFKIT_EDITION", "self-hosted");
  vi.stubEnv("APP_URL", "https://refkit.example.com");
  vi.stubEnv("UPLOADS_DIR", "/var/lib/refkit/uploads");
  vi.stubEnv("SELF_HOSTED_SETUP_TOKEN", "s".repeat(32));
  vi.stubEnv("REFKIT_RUNTIME_METADATA_FILE", "/app/runtime-metadata.json");
  vi.stubEnv("EMAIL_DELIVERY", "smtp");
  vi.stubEnv("EMAIL_FROM_ADDRESS", "auth@refkit.example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_SECURE", "false");
  resetServerEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("Self-Hosted production environment", () => {
  it("accepts an HTTPS instance with persistent uploads and operator SMTP", () => {
    configureValidSelfHostedEnvironment();

    expect(validateServerEnv()).toMatchObject({
      REFKIT_EDITION: "self-hosted",
      APP_URL: "https://refkit.example.com",
      EMAIL_DELIVERY: "smtp",
      SMTP_HOST: "smtp.example.com",
      UPLOADS_DIR: "/var/lib/refkit/uploads",
    });
  });

  it.each([
    ["APP_URL", "http://refkit.example.com", "must use HTTPS"],
    ["APP_URL", "https://user:pass@refkit.example.com/path?x=1#fragment", "must be an exact origin"],
    ["PAYOUT_DETAILS_ENCRYPTION_KEY", "not-base64", "must be canonical base64"],
    ["UPLOADS_DIR", "", "UPLOADS_DIR is required"],
    ["SELF_HOSTED_SETUP_TOKEN", "", "SELF_HOSTED_SETUP_TOKEN is required"],
    ["REFKIT_RUNTIME_METADATA_FILE", "", "REFKIT_RUNTIME_METADATA_FILE is required"],
    ["SMTP_HOST", "", "SMTP_HOST is required"],
  ])("rejects an invalid %s", (name, value, message) => {
    configureValidSelfHostedEnvironment();
    vi.stubEnv(name, value);
    resetServerEnvCache();

    expect(() => validateServerEnv()).toThrow(message);
  });

  it("rejects log-only email delivery", () => {
    configureValidSelfHostedEnvironment();
    vi.stubEnv("EMAIL_DELIVERY", "log");
    resetServerEnvCache();

    expect(() => validateServerEnv()).toThrow(
      "requires EMAIL_DELIVERY=resend or EMAIL_DELIVERY=smtp"
    );
  });

  it("rejects log-only delivery for RefKit Cloud production", () => {
    configureValidSelfHostedEnvironment();
    vi.stubEnv("REFKIT_EDITION", "cloud");
    vi.stubEnv("EMAIL_DELIVERY", "log");
    vi.stubEnv("RESEND_API_KEY", "re_configured");
    resetServerEnvCache();

    expect(() => validateServerEnv()).toThrow(
      "Production email delivery cannot use log mode"
    );
  });

  it("requires a managed provisioning secret for RefKit Cloud production", () => {
    configureValidSelfHostedEnvironment();
    vi.stubEnv("REFKIT_EDITION", "cloud");
    vi.stubEnv("EMAIL_DELIVERY", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_configured");
    vi.stubEnv("MANAGED_CONNECTIONS_PROVISIONING_SECRET", "");
    resetServerEnvCache();

    expect(() => validateServerEnv()).toThrow(
      "MANAGED_CONNECTIONS_PROVISIONING_SECRET is required"
    );
  });
});
