import {
  EmailHeading,
  EmailMuted,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type SupportRequestEmailProps = {
  preview: string;
  requestTypeLabel: string;
  userName: string | null;
  userEmail: string;
  userId: string;
  message: string;
  attachmentName?: string | null;
};

export function SupportRequestEmail({
  preview,
  requestTypeLabel,
  userName,
  userEmail,
  userId,
  message,
  attachmentName,
}: SupportRequestEmailProps) {
  return (
    <RefKitEmail preview={preview}>
      <EmailHeading>{requestTypeLabel}</EmailHeading>
      <EmailText>
        From: {userName?.trim() || "Unknown name"} ({userEmail})
      </EmailText>
      <EmailMuted>User ID: {userId}</EmailMuted>
      <EmailText>{message}</EmailText>
      {attachmentName ? (
        <EmailMuted>Attachment: {attachmentName}</EmailMuted>
      ) : null}
    </RefKitEmail>
  );
}

export default SupportRequestEmail;
