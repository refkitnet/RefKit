import { timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  organizationMembers,
  organizations,
  users,
} from "@/db/schema";
import { isSelfHosted } from "@/lib/deployment";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";

const BOOTSTRAP_LOCK_ID = 7_348_061_413;

export async function getSelfHostedBootstrapStatus() {
  if (!isSelfHosted()) {
    return { setupRequired: false };
  }

  const [administrator] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isAdmin, true))
    .limit(1);

  return { setupRequired: !administrator };
}

function assertSetupToken(actualToken: string) {
  const expectedToken = getServerEnv().SELF_HOSTED_SETUP_TOKEN;

  if (!expectedToken) {
    throw new AppError(
      "internal",
      "setup_not_configured",
      "Self-Hosted setup is not configured.",
      500
    );
  }

  const actual = Buffer.from(actualToken);
  const expected = Buffer.from(expectedToken);

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError(
      "forbidden",
      "invalid_setup_token",
      "The setup token is invalid.",
      403
    );
  }
}

export async function bootstrapSelfHostedAdministrator(input: {
  setupToken: string;
  name: string;
  email: string;
  organizationName: string;
}) {
  if (!isSelfHosted()) {
    throw new AppError("not_found", "not_found", "Not found.", 404);
  }

  assertSetupToken(input.setupToken);

  const db = getDb();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const organizationName = input.organizationName.trim();

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_ID})`);

    const [existingAdministrator] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isAdmin, true))
      .limit(1);

    if (existingAdministrator) {
      throw new AppError(
        "conflict",
        "setup_already_complete",
        "This RefKit instance already has an administrator.",
        409
      );
    }

    await tx
      .insert(users)
      .values({
        id: generateId(ID_PREFIXES.user),
        email,
        name,
        emailVerified: false,
        isAdmin: true,
        primaryMode: "owner",
      })
      .onConflictDoNothing({ target: users.email });

    const [administrator] = await tx
      .update(users)
      .set({
        name,
        isAdmin: true,
        primaryMode: "owner",
        updatedAt: new Date(),
      })
      .where(eq(users.email, email))
      .returning();

    if (!administrator) {
      throw new AppError(
        "internal",
        "setup_admin_create_failed",
        "Could not create the administrator.",
        500
      );
    }

    const [existingMembership] = await tx
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, administrator.id),
          eq(organizationMembers.role, "owner")
        )
      )
      .limit(1);

    let organizationId: string;

    if (existingMembership) {
      const [membership] = await tx
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(eq(organizationMembers.id, existingMembership.id))
        .limit(1);
      organizationId = membership.organizationId;
    }
    else {
      organizationId = generateId(ID_PREFIXES.organization);
      await tx.insert(organizations).values({
        id: organizationId,
        name: organizationName,
      });
      await tx.insert(organizationMembers).values({
        id: generateId("mem"),
        organizationId,
        userId: administrator.id,
        role: "owner",
      });
    }

    return { administrator, organizationId };
  });
}
