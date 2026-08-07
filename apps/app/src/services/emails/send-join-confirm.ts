import { render } from "@react-email/components";
import { JoinConfirmEmail } from "@/emails/join-confirm";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendJoinConfirmEmail(
  email: string,
  url: string,
  programName: string
) {
  const html = await render(JoinConfirmEmail({ url, programName }));

  await deliverEmail({
    template: "join-confirm",
    to: email,
    subject: `Confirm your signup for ${programName}`,
    html,
    links: [url],
  });
}
