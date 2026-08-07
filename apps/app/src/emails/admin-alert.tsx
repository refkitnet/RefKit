import {
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type AdminAlertEmailProps = {
  preview: string;
  message: string;
};

export function AdminAlertEmail({ preview, message }: AdminAlertEmailProps) {
  return (
    <RefKitEmail preview={preview}>
      <EmailHeading>{preview}</EmailHeading>
      <EmailText>{message}</EmailText>
    </RefKitEmail>
  );
}

export default AdminAlertEmail;
