import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEmailDeliveryMode, getEmailFromAddress } from "@/lib/env";

const REFKIT_EMAIL_SENDER_NAME = "RefKit";

function formatFromAddress(email: string) {
  return `${REFKIT_EMAIL_SENDER_NAME} <${email}>`;
}

export type DeliverEmailAttachment = {
  filename: string;
  content: string;
};

export type DeliverEmailInput = {
  template: string;
  to: string;
  subject: string;
  html: string;
  links?: string[];
  replyTo?: string;
  attachments?: DeliverEmailAttachment[];
  logDetails?: string[];
};

export class EmailDeliveryError extends Error {
  constructor(provider: string, message: string) {
    super(`${provider} email delivery failed: ${message}`);
    this.name = "EmailDeliveryError";
  }
}

export async function deliverEmail(input: DeliverEmailInput) {
  const mode = getEmailDeliveryMode();

  if (mode === "log") {
    logLocalEmail(input);
    return;
  }

  const from = formatFromAddress(getEmailFromAddress());

  if (mode === "smtp") {
    const { getSmtpTransport } = await import("@/services/emails/smtp-client");

    try {
      await getSmtpTransport().sendMail({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        replyTo: input.replyTo,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          encoding: "base64" as const,
        })),
      });
    }
    catch (error) {
      throw new EmailDeliveryError(
        "SMTP",
        error instanceof Error ? error.message : "Unknown SMTP error."
      );
    }

    return;
  }

  const { getResendClient } = await import("@/services/emails/resend-client");

  const result = await getResendClient().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    replyTo: input.replyTo,
    attachments: input.attachments,
  });

  if (result.error) {
    throw new EmailDeliveryError("Resend", result.error.message);
  }
}

function logLocalEmail(input: DeliverEmailInput) {
  const from = formatFromAddress(getEmailFromAddress());
  const divider = "-".repeat(72);

  // Use stdout.write (not console.log) so Next.js console patching cannot
  // reformat long magic-link URLs and insert spaces mid-string.
  process.stdout.write(`\n${divider}\n`);
  process.stdout.write(
    "[refkit:email:local] Email logged instead of sent via Resend\n"
  );
  process.stdout.write(`template: ${input.template}\n`);
  process.stdout.write(`to: ${input.to}\n`);
  process.stdout.write(`from: ${from}\n`);
  process.stdout.write(`subject: ${input.subject}\n`);

  if (input.replyTo) {
    process.stdout.write(`replyTo: ${input.replyTo}\n`);
  }

  if (input.attachments?.length) {
    for (const attachment of input.attachments) {
      process.stdout.write(
        `attachment: ${attachment.filename} (${attachment.content.length} base64 chars)\n`
      );
    }
  }

  if (input.logDetails?.length) {
    for (const detail of input.logDetails) {
      process.stdout.write(`${detail}\n`);
    }
  }

  if (input.links?.length) {
    const linksPath = writeLocalEmailLinks(input.links);
    process.stdout.write(`links file: ${linksPath}\n`);

    for (const link of input.links) {
      process.stdout.write("link:\n");
      process.stdout.write(`${link}\n`);
    }
  }

  process.stdout.write(`${divider}\n`);
}

function writeLocalEmailLinks(links: string[]) {
  const dir = join(process.cwd(), ".local");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "last-email-links.txt");
  writeFileSync(path, `${links.join("\n")}\n`, "utf8");
  return path;
}
