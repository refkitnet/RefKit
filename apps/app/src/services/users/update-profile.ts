import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { getMeProfile } from "@/services/users/me";

export async function updateUserName(
  userId: string,
  name: string,
  email: string | null
) {
  const db = getDb();
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new AppError(
      "invalid_request",
      "invalid_name",
      "Name is required.",
      400
    );
  }

  if (trimmedName.length > 100) {
    throw new AppError(
      "invalid_request",
      "invalid_name",
      "Name must be 100 characters or fewer.",
      400
    );
  }

  const [updated] = await db
    .update(users)
    .set({ name: trimmedName })
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!updated) {
    throw new AppError(
      "not_found",
      "user_not_found",
      "User not found.",
      404
    );
  }

  return getMeProfile(userId, email, trimmedName);
}
