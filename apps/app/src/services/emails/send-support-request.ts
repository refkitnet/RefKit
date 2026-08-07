import { render } from "@react-email/components";
import { SupportRequestEmail } from "@/emails/support-request";
import { deliverEmail } from "@/services/emails/deliver";

export const SUPPORT_EMAIL = "support@refkit.net";

export async function sendSupportRequestEmailDirect(input: {
  userName: string | null;
  userEmail: string;
  userId: string;
  type: string;
  typeLabel: string;
  message: string;
  attachment?: {
    filename: string;
    content: string;
  } | null;
}) {
  const subjectName = input.userName?.trim() || input.userEmail;
  const html = await render(
    SupportRequestEmail({
      preview: `${input.typeLabel} from ${subjectName}`,
      requestTypeLabel: input.typeLabel,
      userName: input.userName,
      userEmail: input.userEmail,
      userId: input.userId,
      message: input.message,
      attachmentName: input.attachment?.filename ?? null,
    })
  );

  await deliverEmail({
    template: "support-request",
    to: SUPPORT_EMAIL,
    replyTo: input.userEmail,
    subject: `[${input.typeLabel}] ${subjectName}`,
    html,
    logDetails: [
      `requestType: ${input.typeLabel}`,
      `user: ${input.userName?.trim() || "Unknown name"} (${input.userEmail})`,
      `userId: ${input.userId}`,
      "message:",
      input.message,
    ],
    attachments: input.attachment
      ? [
          {
            filename: input.attachment.filename,
            content: input.attachment.content,
          },
        ]
      : undefined,
  });
}
