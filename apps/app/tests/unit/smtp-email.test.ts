import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import {
  deliverEmail,
  EmailDeliveryError,
} from "@/services/emails/deliver";

const { getSmtpTransport, sendMail } = vi.hoisted(() => ({
  getSmtpTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("@/services/emails/smtp-client", () => ({
  getSmtpTransport,
}));

describe("SMTP email delivery", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_DELIVERY", "smtp");
    vi.stubEnv("EMAIL_FROM_ADDRESS", "auth@refkit.example.com");
    resetServerEnvCache();
    sendMail.mockReset();
    getSmtpTransport.mockReset();
    getSmtpTransport.mockReturnValue({ sendMail });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCache();
  });

  it("uses the configured sender and preserves attachments", async () => {
    sendMail.mockResolvedValue({ messageId: "smtp-message" });

    await deliverEmail({
      template: "diagnostic",
      to: "admin@example.com",
      subject: "Delivery test",
      html: "<p>Ready</p>",
      replyTo: "reply@example.com",
      attachments: [{ filename: "report.txt", content: "dGVzdA==" }],
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: "RefKit <auth@refkit.example.com>",
      to: "admin@example.com",
      subject: "Delivery test",
      html: "<p>Ready</p>",
      replyTo: "reply@example.com",
      attachments: [{
        filename: "report.txt",
        content: "dGVzdA==",
        encoding: "base64",
      }],
    });
  });

  it("wraps SMTP provider failures", async () => {
    sendMail.mockRejectedValue(new Error("Connection refused"));

    const result = deliverEmail({
      template: "diagnostic",
      to: "admin@example.com",
      subject: "Delivery test",
      html: "<p>Ready</p>",
    });

    await expect(result).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(result).rejects.toThrow(
      "SMTP email delivery failed: Connection refused"
    );
  });
});
