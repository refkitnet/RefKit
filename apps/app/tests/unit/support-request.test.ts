import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitSupportRequest } from "@/services/support/submit";

const { sendSupportRequestEmailDirect } = vi.hoisted(() => ({
  sendSupportRequestEmailDirect: vi.fn(),
}));

vi.mock("@/services/emails/send-support-request", () => ({
  sendSupportRequestEmailDirect,
  SUPPORT_EMAIL: "support@refkit.net",
}));

describe("submitSupportRequest", () => {
  beforeEach(() => {
    sendSupportRequestEmailDirect.mockReset();
    sendSupportRequestEmailDirect.mockResolvedValue(undefined);
  });

  it("sends a support email with the trimmed message", async () => {
    await submitSupportRequest({
      userId: "usr_test",
      userEmail: "dev@example.com",
      userName: "Dev User",
      type: "bug_report",
      message: "  Need help with Stripe setup.  ",
    });

    expect(sendSupportRequestEmailDirect).toHaveBeenCalledWith({
      userId: "usr_test",
      userEmail: "dev@example.com",
      userName: "Dev User",
      type: "bug_report",
      typeLabel: "Report a bug",
      message: "Need help with Stripe setup.",
      attachment: null,
    });
  });

  it("requires a valid request type", async () => {
    await expect(
      submitSupportRequest({
        userId: "usr_test",
        userEmail: "dev@example.com",
        userName: "Dev User",
        type: "invalid",
        message: "Help",
      })
    ).rejects.toMatchObject({
      code: "invalid_support_request_type",
    });
  });

  it("requires an account email", async () => {
    await expect(
      submitSupportRequest({
        userId: "usr_test",
        userEmail: null,
        userName: "Dev User",
        type: "support_inquiry",
        message: "Help",
      })
    ).rejects.toMatchObject({
      code: "support_email_required",
    });
  });

  it("requires a message", async () => {
    await expect(
      submitSupportRequest({
        userId: "usr_test",
        userEmail: "dev@example.com",
        userName: "Dev User",
        type: "support_inquiry",
        message: "   ",
      })
    ).rejects.toMatchObject({
      code: "support_message_required",
    });
  });
});
