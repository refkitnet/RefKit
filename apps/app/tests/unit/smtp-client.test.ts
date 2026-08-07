import { afterEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/lib/env";

const { createTransport, close } = vi.hoisted(() => ({
  createTransport: vi.fn(),
  close: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import {
  getSmtpTransport,
  resetSmtpTransport,
} from "@/services/emails/smtp-client";

afterEach(() => {
  resetSmtpTransport();
  vi.unstubAllEnvs();
  resetServerEnvCache();
  createTransport.mockReset();
  close.mockReset();
});

describe("SMTP transport security", () => {
  it.each([
    ["false", 587, true],
    ["true", 465, false],
  ])(
    "configures SMTP_SECURE=%s with the expected TLS behavior",
    (secure, port, requireTLS) => {
      vi.stubEnv("EMAIL_DELIVERY", "smtp");
      vi.stubEnv("EMAIL_FROM_ADDRESS", "auth@refkit.example.com");
      vi.stubEnv("SMTP_HOST", "smtp.example.com");
      vi.stubEnv("SMTP_PORT", String(port));
      vi.stubEnv("SMTP_SECURE", secure);
      resetServerEnvCache();
      createTransport.mockReturnValue({ close });

      getSmtpTransport();

      expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({
        host: "smtp.example.com",
        port,
        secure: secure === "true",
        requireTLS,
      }));
    }
  );
});
