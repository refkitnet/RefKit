import { render } from "@react-email/components";
import { AffiliateInvitedEmail } from "@/emails/affiliate-invited";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendAffiliateInviteEmailDirect(
  email: string,
  url: string,
  programName: string
) {
  const html = await render(
    AffiliateInvitedEmail({ url, programName })
  );

  await deliverEmail({
    template: "affiliate-invited",
    to: email,
    subject: `You've been invited to ${programName}`,
    html,
    links: [url],
  });
}

export async function sendAffiliateInviteEmail(
  email: string,
  url: string,
  programName: string
) {
  await sendAffiliateInviteEmailDirect(email, url, programName);
}
