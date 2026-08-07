import {
  EmailCallout,
  EmailHeading,
  EmailText,
  RefKitEmail,
} from "@/emails/email-layout";

type ProgramClosingEmailProps = {
  programName: string;
  amount: number;
  currency: string;
};

export function ProgramClosingEmail({
  programName,
  amount,
  currency,
}: ProgramClosingEmailProps) {
  const formattedAmount = (amount / 100).toFixed(2);

  return (
    <RefKitEmail preview={`${programName} affiliate program is closing`}>
      <EmailHeading>Program closing notice</EmailHeading>
      <EmailText>
        The {programName} affiliate program has been disabled. New commissions
        will no longer accrue.
      </EmailText>
      <EmailCallout>
        You have an approved payable balance of {formattedAmount}{" "}
        {currency.toUpperCase()}. Please request a payout or contact the
        developer if you have questions.
      </EmailCallout>
    </RefKitEmail>
  );
}

export default ProgramClosingEmail;
