import type { AccountMode } from "@/db/schema";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/services/audit";
import { registerPendingUser } from "@/services/users/register";

export type CreateBetaUserInput = {
  name: string;
  email: string;
  primaryMode: AccountMode;
  callbackUrl?: string;
};

export async function createBetaUser(
  adminUserId: string,
  input: CreateBetaUserInput,
  requestHeaders: Headers
) {
  const user = await registerPendingUser({
    name: input.name,
    email: input.email,
    primaryMode: input.primaryMode,
    allowVerifiedAccount: true,
  });

  await auth.api.signInMagicLink({
    body: {
      email: user.email,
      name: user.name ?? input.name,
      callbackURL: input.callbackUrl ?? "/",
      metadata: { type: "account_signup" },
    },
    headers: requestHeaders,
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: "beta_user.invited",
    resourceType: "user",
    resourceId: user.id,
    metadata: {
      email: user.email,
      primary_mode: user.primaryMode,
    },
  });

  return user;
}
