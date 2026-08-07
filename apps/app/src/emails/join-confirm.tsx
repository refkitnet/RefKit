import {
  EmailButton,
  EmailHeading,
  EmailMuted,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type JoinConfirmEmailProps = {
  url: string;
  programName: string;
};

export function JoinConfirmEmail({ url, programName }: JoinConfirmEmailProps) {
  return (
    <RefKitEmail preview={`Confirm your signup for ${programName}`}>
      <EmailHeading>Confirm your signup</EmailHeading>
      <EmailText>
        Confirm your email to finish joining {programName} as an affiliate. This
        link expires in 30 minutes.
      </EmailText>
      <EmailButton href={url}>Confirm and join</EmailButton>
      <EmailMuted>
        If you did not request this email, you can ignore it.
      </EmailMuted>
    </RefKitEmail>
  );
}

export default JoinConfirmEmail;
