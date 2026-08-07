import { createHmac } from "crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 5;

export function hashRateLimitScope(scope: string): string {
  return createHmac("sha256", getServerEnv().IP_HASH_SALT)
    .update(`refkit:rate-limit:v1:${scope}`)
    .digest("hex");
}

export async function checkRateLimit(
  scope: string,
  limit = DEFAULT_LIMIT
): Promise<void> {
  const db = getDb();
  const scopeHash = hashRateLimitScope(scope);
  const windowBucket = String(Math.floor(Date.now() / WINDOW_MS));
  const result = await db.execute(sql`
    WITH pruned AS (
      DELETE FROM rate_limits
      WHERE updated_at < now() - interval '1 hour'
    )
    INSERT INTO rate_limits (scope, window_bucket, count, updated_at)
    VALUES (${scopeHash}, ${windowBucket}, 1, now())
    ON CONFLICT (scope, window_bucket)
    DO UPDATE SET
      count = rate_limits.count + 1,
      updated_at = now()
    RETURNING count
  `);

  const count = Number(result[0]?.count ?? 0);

  if (count > limit) {
    throw new AppError(
      "rate_limited",
      "rate_limit_exceeded",
      "Too many requests. Try again later.",
      429
    );
  }
}
