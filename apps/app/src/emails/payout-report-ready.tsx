import {
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type PayoutReportReadyEmailProps = {
  programName: string;
  payoutRunId: string;
};

export function PayoutReportReadyEmail({
  programName,
  payoutRunId,
}: PayoutReportReadyEmailProps) {
  return (
    <RefKitEmail preview={`Payout report ready for ${programName}`}>
      <EmailHeading>Payout report ready</EmailHeading>
      <EmailText>
        The payout report for {programName} is ready to download.
      </EmailText>
      <EmailText mono>
        Run ID: {payoutRunId}
      </EmailText>
    </RefKitEmail>
  );
}

export default PayoutReportReadyEmail;
