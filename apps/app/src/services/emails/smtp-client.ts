import nodemailer, { type Transporter } from "nodemailer";
import { getServerEnv } from "@/lib/env";

let smtpTransport: Transporter | null = null;

export function getSmtpTransport() {
  if (smtpTransport) {
    return smtpTransport;
  }

  const env = getServerEnv();

  if (!env.SMTP_HOST) {
    throw new Error("SMTP_HOST is not configured.");
  }

  const secure = env.SMTP_SECURE === "true";

  smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? (secure ? 465 : 587),
    secure,
    requireTLS: !secure,
    auth: env.SMTP_USER && env.SMTP_PASSWORD
      ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASSWORD,
        }
      : undefined,
  });

  return smtpTransport;
}

export function resetSmtpTransport() {
  smtpTransport?.close();
  smtpTransport = null;
}
