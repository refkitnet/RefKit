import {
  EmailButton,
  EmailHeading,
  EmailMuted,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type AffiliateInvitedEmailProps = {
  url: string;
  programName: string;
};

export function AffiliateInvitedEmail({
  url,
  programName,
}: AffiliateInvitedEmailProps) {
  return (
    <RefKitEmail preview={`You have been invited to ${programName}`}>
      <EmailHeading>You&apos;re invited to {programName}</EmailHeading>
      <EmailText>
        You have been added as an affiliate. Click the button below to sign in
        and view your affiliate links.
      </EmailText>
      <EmailButton href={url}>Sign in to RefKit</EmailButton>
      <EmailMuted>
        If you did not expect this invitation, you can ignore this email.
      </EmailMuted>
    </RefKitEmail>
  );
}

export default AffiliateInvitedEmail;
