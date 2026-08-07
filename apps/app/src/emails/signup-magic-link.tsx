import {
  EmailButton,
  EmailHeading,
  EmailMuted,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type SignupMagicLinkEmailProps = {
  url: string;
};

export function SignupMagicLinkEmail({ url }: SignupMagicLinkEmailProps) {
  return (
    <RefKitEmail preview="Finish creating your RefKit account">
      <EmailHeading>Finish creating your RefKit account</EmailHeading>
      <EmailText>
        Confirm your email to create your account. This link expires in 5 minutes.
      </EmailText>
      <EmailButton href={url}>Finish signup</EmailButton>
      <EmailMuted>
        If you did not request this email, you can ignore it.
      </EmailMuted>
    </RefKitEmail>
  );
}

export default SignupMagicLinkEmail;
