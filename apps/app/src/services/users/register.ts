import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users, type AccountMode } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";

type RegisterUserInput = {
  name: string;
  email: string;
  primaryMode: AccountMode;
  allowVerifiedAccount?: boolean;
};

export async function registerPendingUser(input: RegisterUserInput) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  await db
    .insert(users)
    .values({
      id: generateId(ID_PREFIXES.user),
      email,
      name,
      primaryMode: input.primaryMode,
      emailVerified: false,
    })
    .onConflictDoNothing({ target: users.email });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new AppError(
      "internal",
      "signup_user_create_failed",
      "Could not create your account.",
      500
    );
  }

  if (user.emailVerified && !input.allowVerifiedAccount) {
    throw new AppError(
      "conflict",
      "account_exists",
      "An account with this email already exists. Sign in instead.",
      409
    );
  }

  const [updated] = await db
    .update(users)
    .set(user.emailVerified
      ? { primaryMode: input.primaryMode }
      : { name, primaryMode: input.primaryMode })
    .where(eq(users.id, user.id))
    .returning();

  return updated ?? user;
}
