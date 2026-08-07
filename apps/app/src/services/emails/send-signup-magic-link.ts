import { render } from "@react-email/components";
import { SignupMagicLinkEmail } from "@/emails/signup-magic-link";
import { deliverEmail } from "@/services/emails/deliver";

export async function sendSignupMagicLinkEmail(email: string, url: string) {
  const html = await render(SignupMagicLinkEmail({ url }));

  await deliverEmail({
    template: "signup-magic-link",
    to: email,
    subject: "Finish creating your RefKit account",
    html,
    links: [url],
  });
}
