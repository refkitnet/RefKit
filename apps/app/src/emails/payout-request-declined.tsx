import {
  EmailCallout,
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type PayoutRequestDeclinedEmailProps = {
  programName: string;
  reason: string;
};

export function PayoutRequestDeclinedEmail({
  programName,
  reason,
}: PayoutRequestDeclinedEmailProps) {
  return (
    <RefKitEmail preview={`Your payout request for ${programName} was declined`}>
      <EmailHeading>Payout request declined</EmailHeading>
      <EmailText>
        Your payout request for {programName} was declined.
      </EmailText>
      <EmailCallout tone="warning">Reason: {reason}</EmailCallout>
    </RefKitEmail>
  );
}

export default PayoutRequestDeclinedEmail;
