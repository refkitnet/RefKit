import {
  EmailCallout,
  EmailHeading,
  RefKitEmail,
} from "@/emails/email-layout";

type PayoutPaidEmailProps = {
  programName: string;
  amount: number;
  currency: string;
};

export function PayoutPaidEmail({
  programName,
  amount,
  currency,
}: PayoutPaidEmailProps) {
  const formattedAmount = (amount / 100).toFixed(2);

  return (
    <RefKitEmail preview={`Your payout for ${programName} was marked paid`}>
      <EmailHeading>Payout marked paid</EmailHeading>
      <EmailCallout tone="success">
        Your payout of {formattedAmount} {currency.toUpperCase()} for{" "}
        {programName} has been marked paid by the developer.
      </EmailCallout>
    </RefKitEmail>
  );
}

export default PayoutPaidEmail;
