import { render } from "@react-email/components";
import { MagicLinkEmail } from "@/emails/magic-link";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendMagicLinkEmailDirect(email: string, url: string) {
  const html = await render(MagicLinkEmail({ url }));

  await deliverEmail({
    template: "magic-link",
    to: email,
    subject: "Sign in to RefKit",
    html,
    links: [url],
  });
}

export async function sendMagicLinkEmail(email: string, url: string) {
  await sendMagicLinkEmailDirect(email, url);
}
