import {
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type JoinSignupReceivedEmailProps = {
  programName: string;
  affiliateEmail: string;
  affiliateName: string | null;
  status: string;
};

export function JoinSignupReceivedEmail({
  programName,
  affiliateEmail,
  affiliateName,
  status,
}: JoinSignupReceivedEmailProps) {
  const displayName = affiliateName ?? affiliateEmail;
  const statusLabel = status === "pending" ? "pending approval" : "active";

  return (
    <RefKitEmail preview={`New affiliate signup for ${programName}`}>
      <EmailHeading>New affiliate signup</EmailHeading>
      <EmailText>
        {displayName} ({affiliateEmail}) signed up for {programName}. Their
        membership is {statusLabel}.
      </EmailText>
      {status === "pending" ? (
        <EmailText>
          Approve them in your RefKit dashboard to activate their tracking
          link.
        </EmailText>
      ) : null}
    </RefKitEmail>
  );
}

export default JoinSignupReceivedEmail;
