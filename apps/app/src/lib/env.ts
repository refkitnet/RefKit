import { z } from "zod";
import { DEPLOYMENT_EDITIONS } from "@/lib/deployment";

const trimmedOptionalString = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().min(1).optional()
);

const trimmedOptionalUrl = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || undefined : value),
  z.string().url().optional()
);

const payoutDetailsEncryptionKey = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return false;
  }

  return Buffer.from(value, "base64").length === 32;
}, "PAYOUT_DETAILS_ENCRYPTION_KEY must be canonical base64 that decodes to exactly 32 bytes.");

const serverEnvSchema = z.object({
  REFKIT_EDITION: z.enum(DEPLOYMENT_EDITIONS).default("cloud"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  RESEND_API_KEY: trimmedOptionalString,
  RESEND_FROM_EMAIL: z.string().email().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  SMTP_HOST: trimmedOptionalString,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: trimmedOptionalString,
  SMTP_PASSWORD: trimmedOptionalString,
  DEV_API_SECRET: z.string().min(16).optional(),
  MANAGED_CONNECTIONS_PROVISIONING_SECRET: z.string().min(32).optional(),
  PAYOUT_DETAILS_ENCRYPTION_KEY: payoutDetailsEncryptionKey,
  WEBHOOK_ALLOW_PRIVATE_NETWORKS: z.enum(["true", "false"]).optional(),
  IP_HASH_SALT: z.string().min(16),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  APP_URL: z.string().url(),
  UPLOADS_DIR: trimmedOptionalString,
  SELF_HOSTED_SETUP_TOKEN: z.string().min(32).optional(),
  REFKIT_BUILD_VERSION: trimmedOptionalString,
  REFKIT_SOURCE_REVISION: trimmedOptionalString,
  REFKIT_SOURCE_URL: trimmedOptionalUrl,
  REFKIT_RUNTIME_METADATA_FILE: trimmedOptionalString,
  EMAIL_DELIVERY: z.enum(["resend", "smtp", "log"]).optional(),
  ADMIN_ALERT_EMAILS: z.string().optional(),
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
  // Stripe App - required for live installs/webhooks; optional in fixture mode
  STRIPE_SECRET_KEY: trimmedOptionalString,
  STRIPE_APP_INSTALL_URL: trimmedOptionalUrl,
  STRIPE_APP_SECRET: trimmedOptionalString,
  STRIPE_CONNECT_WEBHOOK_SECRET: trimmedOptionalString,
  STRIPE_CONNECT_WEBHOOK_SECRET_TEST: trimmedOptionalString,
  STRIPE_SECRET_KEY_TEST: trimmedOptionalString,
  STRIPE_FIXTURE_MODE: z.enum(["true", "false"]).optional(),
}).superRefine((env, context) => {
  const fromAddress = env.EMAIL_FROM_ADDRESS ?? env.RESEND_FROM_EMAIL;
  const appUrl = new URL(env.APP_URL);

  if (
    appUrl.username
    || appUrl.password
    || appUrl.pathname !== "/"
    || appUrl.search
    || appUrl.hash
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_URL"],
      message: "APP_URL must be an exact origin without credentials, a path, query, or fragment.",
    });
  }

  if (!fromAddress) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["EMAIL_FROM_ADDRESS"],
      message: "EMAIL_FROM_ADDRESS is required (RESEND_FROM_EMAIL remains a supported Cloud alias).",
    });
  }

  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [env.SMTP_USER ? "SMTP_PASSWORD" : "SMTP_USER"],
      message: "SMTP_USER and SMTP_PASSWORD must be configured together.",
    });
  }

  const production = process.env.NODE_ENV === "production";

  if (env.REFKIT_EDITION === "cloud") {
    if (production && env.EMAIL_DELIVERY === "log") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EMAIL_DELIVERY"],
        message: "Production email delivery cannot use log mode.",
      });
    }

    if (production && !env.RESEND_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required for RefKit Cloud email delivery.",
      });
    }

    if (production && !env.MANAGED_CONNECTIONS_PROVISIONING_SECRET) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MANAGED_CONNECTIONS_PROVISIONING_SECRET"],
        message:
          "MANAGED_CONNECTIONS_PROVISIONING_SECRET is required for RefKit Cloud production.",
      });
    }

    return;
  }

  if (!env.UPLOADS_DIR) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["UPLOADS_DIR"],
      message: "UPLOADS_DIR is required for Self-Hosted persistent storage.",
    });
  }

  if (production && !env.SELF_HOSTED_SETUP_TOKEN) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SELF_HOSTED_SETUP_TOKEN"],
      message: "SELF_HOSTED_SETUP_TOKEN is required for Self-Hosted bootstrap.",
    });
  }

  if (production && !env.REFKIT_RUNTIME_METADATA_FILE) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REFKIT_RUNTIME_METADATA_FILE"],
      message: "REFKIT_RUNTIME_METADATA_FILE is required for Self-Hosted release compatibility checks.",
    });
  }

  if (production && (!env.EMAIL_DELIVERY || env.EMAIL_DELIVERY === "log")) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["EMAIL_DELIVERY"],
      message: "Self-Hosted production requires EMAIL_DELIVERY=resend or EMAIL_DELIVERY=smtp.",
    });
  }

  if (env.EMAIL_DELIVERY === "resend" && !env.RESEND_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY is required when EMAIL_DELIVERY=resend.",
    });
  }

  if (env.EMAIL_DELIVERY === "smtp" && !env.SMTP_HOST) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_HOST"],
      message: "SMTP_HOST is required when EMAIL_DELIVERY=smtp.",
    });
  }

  if (production) {
    if (appUrl.protocol !== "https:") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["APP_URL"],
        message: "Self-Hosted production APP_URL must use HTTPS.",
      });
    }
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type StripeEnv = {
  STRIPE_SECRET_KEY: string;
  STRIPE_CONNECT_WEBHOOK_SECRET: string;
};

export function getStripeWebhookSecrets(): string[] {
  const env = getServerEnv();
  const secrets = [
    env.STRIPE_CONNECT_WEBHOOK_SECRET,
    env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(secrets)];
}

export function getStripeSecretKey(livemode: boolean): string {
  const env = getServerEnv();

  if (!livemode && env.STRIPE_SECRET_KEY_TEST) {
    return env.STRIPE_SECRET_KEY_TEST;
  }

  if (!env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY or use fixture mode locally. See docs/stripe.md."
    );
  }

  return env.STRIPE_SECRET_KEY;
}

export type StripeAppEnv = {
  STRIPE_APP_INSTALL_URL: string;
  STRIPE_APP_SECRET: string;
};

let cachedEnv: ServerEnv | null = null;

export function resetServerEnvCache() {
  cachedEnv = null;
}

export function getServerEnv(): ServerEnv {
  if (!cachedEnv) {
    cachedEnv = serverEnvSchema.parse(process.env);
  }

  return cachedEnv;
}

export function getStripeEnv(): StripeEnv {
  const env = getServerEnv();
  const webhookSecrets = getStripeWebhookSecrets();

  if (!env.STRIPE_SECRET_KEY || webhookSecrets.length === 0) {
    throw new Error(
      "Stripe is not configured. Set platform Stripe keys or use fixture mode locally. See docs/stripe.md."
    );
  }

  return {
    STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
    STRIPE_CONNECT_WEBHOOK_SECRET: webhookSecrets[0],
  };
}

export function getStripeAppEnv(): StripeAppEnv {
  const env = getServerEnv();

  if (!env.STRIPE_APP_INSTALL_URL || !env.STRIPE_APP_SECRET) {
    throw new Error(
      "Stripe App installs are not configured. Set STRIPE_APP_INSTALL_URL and STRIPE_APP_SECRET."
    );
  }

  return {
    STRIPE_APP_INSTALL_URL: env.STRIPE_APP_INSTALL_URL,
    STRIPE_APP_SECRET: env.STRIPE_APP_SECRET,
  };
}

export function validateServerEnv(): ServerEnv {
  return getServerEnv();
}

export type EmailDeliveryMode = "resend" | "smtp" | "log";

export function getEmailFromAddress() {
  const env = getServerEnv();
  const value = env.EMAIL_FROM_ADDRESS ?? env.RESEND_FROM_EMAIL;

  if (!value) {
    throw new Error("EMAIL_FROM_ADDRESS is not configured.");
  }

  return value;
}

export function getAdminEmailAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAIL_ALLOWLIST;

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  const env = getServerEnv();

  if (env.EMAIL_DELIVERY) {
    return env.EMAIL_DELIVERY;
  }

  if (
    process.env.NODE_ENV === "development"
    || process.env.NODE_ENV === "test"
  ) {
    return "log";
  }

  try {
    const appHost = new URL(env.APP_URL).hostname;

    if (appHost === "localhost" || appHost === "127.0.0.1") {
      return "log";
    }
  }
  catch {
    // Fall through to Resend.
  }

  return "resend";
}
