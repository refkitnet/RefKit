import { deliverEmail } from "@/services/emails/deliver";

export async function sendEmailDiagnostic(to: string) {
  await deliverEmail({
    template: "email-diagnostic",
    to,
    subject: "RefKit email delivery test",
    html: [
      "<h1>RefKit email delivery is working</h1>",
      "<p>This message confirms that this RefKit instance can deliver email using its configured provider.</p>",
    ].join(""),
  });
}
