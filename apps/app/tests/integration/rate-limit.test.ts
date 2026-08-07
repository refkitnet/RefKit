import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { rateLimits } from "@/db/schema";
import {
  checkRateLimit,
  hashRateLimitScope,
} from "@/lib/rate-limit";
import { createTestSuffix } from "../helpers/context";

describe("rate limit storage", () => {
  const storedScopes: string[] = [];

  afterEach(async () => {
    if (storedScopes.length === 0) {
      return;
    }

    await getDb()
      .delete(rateLimits)
      .where(inArray(rateLimits.scope, storedScopes.splice(0)));
  });

  it("stores an HMAC instead of the plaintext logical scope", async () => {
    const email = `rate-limit-${createTestSuffix()}@example.com`;
    const logicalScope = `sign-in:${email}`;
    const scopeHash = hashRateLimitScope(logicalScope);
    storedScopes.push(scopeHash);

    await checkRateLimit(logicalScope);

    const rows = await getDb()
      .select({ scope: rateLimits.scope })
      .from(rateLimits)
      .where(eq(rateLimits.scope, scopeHash));

    expect(rows).toEqual([{ scope: scopeHash }]);
    expect(rows[0]?.scope).not.toContain(email);
  });

  it("prunes globally expired rows while updating a current bucket", async () => {
    const suffix = createTestSuffix();
    const expiredScope = hashRateLimitScope(`expired:${suffix}`);
    const activeLogicalScope = `active:${suffix}`;
    const activeScope = hashRateLimitScope(activeLogicalScope);
    storedScopes.push(expiredScope, activeScope);

    await getDb().insert(rateLimits).values({
      scope: expiredScope,
      windowBucket: `expired-${suffix}`,
      count: 1,
      updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    await checkRateLimit(activeLogicalScope);

    const expiredRows = await getDb()
      .select({ scope: rateLimits.scope })
      .from(rateLimits)
      .where(eq(rateLimits.scope, expiredScope));

    expect(expiredRows).toHaveLength(0);
  });
});
