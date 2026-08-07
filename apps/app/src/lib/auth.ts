import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  bearer,
  deviceAuthorization,
  magicLink,
  testUtils,
} from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { schema, users } from "@/db/schema";
import { getServerEnv } from "@/lib/env";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAffiliateInviteEmail } from "@/services/emails/send-affiliate-invite";
import { sendJoinConfirmEmail } from "@/services/emails/send-join-confirm";
import { sendMagicLinkEmail } from "@/services/emails/send-magic-link";
import { sendSignupMagicLinkEmail } from "@/services/emails/send-signup-magic-link";

function getTrustedOrigins(appUrl: string) {
  const origins = new Set([appUrl]);

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins];
}

function createAuthInstance() {
  const env = getServerEnv();

  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: getTrustedOrigins(env.APP_URL),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        deviceCode: schema.deviceCode,
      },
    }),
    advanced: {
      database: {
        generateId: ({ model }) => {
          if (model === "user") {
            return generateId(ID_PREFIXES.user);
          }

          if (model === "session") {
            return generateId("ses");
          }

          if (model === "account") {
            return generateId("acc");
          }

          if (model === "verification") {
            return generateId("ver");
          }

          if (model === "deviceCode") {
            return generateId("dvc");
          }

          return generateId("id");
        },
      },
    },
    plugins: [
      bearer(),
      deviceAuthorization({
        verificationUri: "/device",
      }),
      ...(process.env.NODE_ENV !== "production" ? [testUtils()] : []),
      magicLink({
        storeToken: "hashed",
        sendMagicLink: async ({ email, url, metadata }) => {
          const normalizedEmail = email.trim().toLowerCase();
          await checkRateLimit(`magic_link:${normalizedEmail}`);

          if (
            metadata &&
            typeof metadata === "object" &&
            "type" in metadata &&
            metadata.type === "affiliate_invite" &&
            "program_name" in metadata &&
            typeof metadata.program_name === "string"
          ) {
            await sendAffiliateInviteEmail(
              email,
              url,
              metadata.program_name
            );
            return;
          }

          if (
            metadata &&
            typeof metadata === "object" &&
            "type" in metadata &&
            metadata.type === "program_join" &&
            "program_name" in metadata &&
            typeof metadata.program_name === "string"
          ) {
            await sendJoinConfirmEmail(email, url, metadata.program_name);
            return;
          }

          const [user] = await getDb()
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, normalizedEmail))
            .limit(1);

          if (!user) {
            return;
          }

          if (metadata?.type === "account_signup") {
            await sendSignupMagicLinkEmail(email, url);
            return;
          }

          await sendMagicLinkEmail(email, url);
        },
        disableSignUp: true,
      }),
    ],
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | undefined;

export function getAuth() {
  if (!authInstance) {
    authInstance = createAuthInstance();
  }

  return authInstance;
}

export const auth = {
  get api() {
    return getAuth().api;
  },
  get handler() {
    return getAuth().handler;
  },
};

export type Session = ReturnType<typeof getAuth>["$Infer"]["Session"];
