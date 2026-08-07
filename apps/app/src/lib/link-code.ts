import { randomInt } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import { affiliateLinks } from "@/db/schema";
import { AppError } from "@/lib/errors";

const LINK_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const DEFAULT_LINK_LABEL = "Default link";

export { DEFAULT_LINK_LABEL };

export function normalizeLinkCode(code: string) {
  return code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateLinkCode(): string {
  let code = "";

  for (let i = 0; i < 8; i++) {
    code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }

  return code;
}

export async function generateUniqueLinkCode(
  appId: string,
  executor?: DbExecutor
) {
  const db = executor ?? getDb();

  for (let attempt = 0; attempt < 10; attempt++) {
    const linkCode = generateLinkCode();

    const [existingLink] = await db
      .select({ id: affiliateLinks.id })
      .from(affiliateLinks)
      .where(
        and(
          eq(affiliateLinks.appId, appId),
          eq(affiliateLinks.linkCode, linkCode)
        )
      )
      .limit(1);

    if (!existingLink) {
      return linkCode;
    }
  }

  throw new AppError(
    "internal",
    "link_code_generation_failed",
    "Could not generate a unique link code.",
    500
  );
}
