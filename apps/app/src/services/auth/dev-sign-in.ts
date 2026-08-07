import { eq } from "drizzle-orm";
import { allSeedUserIds } from "@/db/seed/ids";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { isDevSignInEnabled } from "@/services/auth/dev-sign-in-env";

export { isDevSignInEnabled } from "@/services/auth/dev-sign-in-env";

function assertDevSignInEnabled() {
  if (!isDevSignInEnabled()) {
    throw new AppError(
      "forbidden",
      "dev_sign_in_disabled",
      "Dev sign-in is disabled in this environment.",
      403
    );
  }
}

async function getSeedUser(userId: string) {
  const seedUserIds = new Set<string>(allSeedUserIds());

  if (!seedUserIds.has(userId)) {
    throw new AppError(
      "invalid_request",
      "invalid_seed_user",
      "Unknown seed user.",
      400
    );
  }

  const [user] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError(
      "not_found",
      "seed_user_missing",
      "Seed user not found. Run npm run db:seed.",
      404
    );
  }

  return user;
}

export async function createDevSession(userId: string) {
  assertDevSignInEnabled();

  const user = await getSeedUser(userId);
  const ctx = await getAuth().$context;

  if (!("test" in ctx) || !ctx.test) {
    throw new AppError(
      "internal",
      "dev_sign_in_unavailable",
      "Dev sign-in helpers are not configured.",
      500
    );
  }

  const login = await ctx.test.login({ userId: user.id });

  return {
    user,
    cookies: login.cookies,
  };
}
