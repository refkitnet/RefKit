import { render } from "@react-email/components";
import { PayoutPaidEmail } from "@/emails/payout-paid";
import { PayoutReportReadyEmail } from "@/emails/payout-report-ready";
import { PayoutRequestDeclinedEmail } from "@/emails/payout-request-declined";
import { PayoutRequestReceivedEmail } from "@/emails/payout-request-received";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendPayoutRequestReceivedEmailDirect(input: {
  to: string;
  programName: string;
  programAffiliateId: string;
  amount: number;
  currency: string;
}) {
  const html = await render(
    PayoutRequestReceivedEmail({
      programName: input.programName,
      affiliateId: input.programAffiliateId,
      amount: input.amount,
      currency: input.currency,
    })
  );

  await deliverEmail({
    template: "payout-request-received",
    to: input.to,
    subject: `New payout request for ${input.programName}`,
    html,
  });
}

export async function sendPayoutRequestDeclinedEmailDirect(input: {
  to: string;
  programName: string;
  reason: string;
}) {
  const html = await render(
    PayoutRequestDeclinedEmail({
      programName: input.programName,
      reason: input.reason,
    })
  );

  await deliverEmail({
    template: "payout-request-declined",
    to: input.to,
    subject: `Payout request declined for ${input.programName}`,
    html,
  });
}

export async function sendPayoutReportReadyEmailDirect(input: {
  to: string;
  programName: string;
  payoutBatchId: string;
}) {
  const html = await render(
    PayoutReportReadyEmail({
      programName: input.programName,
      payoutRunId: input.payoutBatchId,
    })
  );

  await deliverEmail({
    template: "payout-report-ready",
    to: input.to,
    subject: `Payout report ready for ${input.programName}`,
    html,
  });
}

export async function sendPayoutPaidEmailDirect(input: {
  to: string;
  programName: string;
  amount: number;
  currency: string;
}) {
  const html = await render(
    PayoutPaidEmail({
      programName: input.programName,
      amount: input.amount,
      currency: input.currency,
    })
  );

  await deliverEmail({
    template: "payout-paid",
    to: input.to,
    subject: `Payout marked paid for ${input.programName}`,
    html,
  });
}
