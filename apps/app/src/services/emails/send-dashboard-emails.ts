import { render } from "@react-email/components";
import { JoinSignupReceivedEmail } from "@/emails/join-signup-received";
import { ProgramClosingEmail } from "@/emails/program-closing";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendJoinSignupReceivedEmailDirect(input: {
  to: string;
  programName: string;
  affiliateEmail: string;
  affiliateName: string | null;
  status: string;
}) {
  const html = await render(
    JoinSignupReceivedEmail({
      programName: input.programName,
      affiliateEmail: input.affiliateEmail,
      affiliateName: input.affiliateName,
      status: input.status,
    })
  );

  await deliverEmail({
    template: "join-signup-received",
    to: input.to,
    subject: `New affiliate signup for ${input.programName}`,
    html,
  });
}

export async function sendProgramClosingEmailDirect(input: {
  to: string;
  programName: string;
  amount: number;
  currency: string;
}) {
  const html = await render(
    ProgramClosingEmail({
      programName: input.programName,
      amount: input.amount,
      currency: input.currency,
    })
  );

  await deliverEmail({
    template: "program-closing",
    to: input.to,
    subject: `${input.programName} affiliate program is closing`,
    html,
  });
}
