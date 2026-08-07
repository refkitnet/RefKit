import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import {
  deliverEmail,
  EmailDeliveryError,
} from "@/services/emails/deliver";

const { getResendClient, resendSend } = vi.hoisted(() => {
  const resendSend = vi.fn();

  return {
    resendSend,
    getResendClient: vi.fn(() => ({
      emails: {
        send: resendSend,
      },
    })),
  };
});

vi.mock("@/services/emails/resend-client", () => ({
  getResendClient,
}));

describe("deliverEmail", () => {
  beforeEach(() => {
    resendSend.mockReset();
    getResendClient.mockClear();
    process.env.EMAIL_DELIVERY = "log";
    resetServerEnvCache();
  });

  it("logs support email locally instead of calling Resend", async () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await deliverEmail({
      template: "support-request",
      to: "support@refkit.net",
      subject: "[Support inquiry] dev@example.com",
      html: "<p>Help</p>",
      replyTo: "dev@example.com",
      logDetails: [
        "requestType: Support inquiry",
        "message:",
        "Need help with payouts.",
      ],
    });

    expect(getResendClient).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();

    const output = stdoutSpy.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain("[refkit:email:local]");
    expect(output).toContain("template: support-request");
    expect(output).toContain("to: support@refkit.net");
    expect(output).toContain("replyTo: dev@example.com");
    expect(output).toContain("Need help with payouts.");

    stdoutSpy.mockRestore();
  });

  it("resolves after Resend accepts the email", async () => {
    process.env.EMAIL_DELIVERY = "resend";
    resetServerEnvCache();
    resendSend.mockResolvedValue({
      data: { id: "email_accepted" },
      error: null,
    });

    await expect(
      deliverEmail({
        template: "magic-link",
        to: "dev@example.com",
        subject: "Sign in",
        html: "<p>Sign in</p>",
      })
    ).resolves.toBeUndefined();
  });

  it("rejects when Resend resolves with a provider error", async () => {
    process.env.EMAIL_DELIVERY = "resend";
    resetServerEnvCache();
    resendSend.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "Invalid recipient",
      },
    });

    const delivery = deliverEmail({
      template: "magic-link",
      to: "invalid@example.com",
      subject: "Sign in",
      html: "<p>Sign in</p>",
    });

    await expect(delivery).rejects.toBeInstanceOf(EmailDeliveryError);
    await expect(delivery).rejects.toThrow(
      "Resend email delivery failed: Invalid recipient"
    );
  });

  it("preserves thrown Resend transport failures", async () => {
    process.env.EMAIL_DELIVERY = "resend";
    resetServerEnvCache();
    resendSend.mockRejectedValue(new Error("Connection failed"));

    await expect(
      deliverEmail({
        template: "magic-link",
        to: "dev@example.com",
        subject: "Sign in",
        html: "<p>Sign in</p>",
      })
    ).rejects.toThrow("Connection failed");
  });
});
