import {
  EmailButton,
  EmailHeading,
  EmailMuted,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type MagicLinkEmailProps = {
  url: string;
};

export function MagicLinkEmail({ url }: MagicLinkEmailProps) {
  return (
    <RefKitEmail preview="Sign in to RefKit">
      <EmailHeading>Sign in to RefKit</EmailHeading>
      <EmailText>
        Click the button below to sign in. This link expires in 5 minutes.
      </EmailText>
      <EmailButton href={url}>Sign in</EmailButton>
      <EmailMuted>
        If you did not request this email, you can ignore it.
      </EmailMuted>
    </RefKitEmail>
  );
}

export default MagicLinkEmail;
