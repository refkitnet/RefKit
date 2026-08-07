import {
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type PayoutRequestReceivedEmailProps = {
  programName: string;
  affiliateId: string;
  amount: number;
  currency: string;
};

export function PayoutRequestReceivedEmail({
  programName,
  affiliateId,
  amount,
  currency,
}: PayoutRequestReceivedEmailProps) {
  const formattedAmount = (amount / 100).toFixed(2);

  return (
    <RefKitEmail preview={`New payout request for ${programName}`}>
      <EmailHeading>New payout request</EmailHeading>
      <EmailText>
        Affiliate {affiliateId} requested a payout of {formattedAmount}{" "}
        {currency.toUpperCase()} for {programName}.
      </EmailText>
    </RefKitEmail>
  );
}

export default PayoutRequestReceivedEmail;
