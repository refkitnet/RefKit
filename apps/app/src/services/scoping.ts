import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  apps,
  managedAccounts,
  programAffiliates,
  programs,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { requireOrganizationMembership } from "@/services/organizations";

export async function requireAppAccess(userId: string, appId: string) {
  const db = getDb();

  if (userId.startsWith("macc_")) {
    const [managed] = await db
      .select({ app: apps })
      .from(managedAccounts)
      .innerJoin(apps, eq(apps.id, managedAccounts.appId))
      .where(
        and(
          eq(managedAccounts.id, userId),
          eq(managedAccounts.appId, appId),
          eq(managedAccounts.status, "active")
        )
      )
      .limit(1);

    if (!managed) {
      throw new AppError("not_found", "app_not_found", "App not found.", 404);
    }

    return managed.app;
  }

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app) {
    throw new AppError("not_found", "app_not_found", "App not found.", 404);
  }

  await requireOrganizationMembership(userId, app.organizationId);

  return app;
}

export async function getProgramIdsForApp(userId: string, appId: string) {
  await requireAppAccess(userId, appId);

  const db = getDb();
  const rows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.appId, appId));

  return rows.map((row) => row.id);
}

export async function requireProgramAccess(userId: string, programId: string) {
  const db = getDb();

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  if (!program) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  await requireAppAccess(userId, program.appId);

  return program;
}

export async function listAppIdsForOrganization(
  userId: string,
  organizationId: string
) {
  await requireOrganizationMembership(userId, organizationId);

  const db = getDb();

  return db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.organizationId, organizationId));
}

export async function requireAppInOrganization(
  userId: string,
  organizationId: string,
  appId: string
) {
  await requireOrganizationMembership(userId, organizationId);

  const db = getDb();

  const [app] = await db
    .select()
    .from(apps)
    .where(
      and(eq(apps.id, appId), eq(apps.organizationId, organizationId))
    )
    .limit(1);

  if (!app) {
    throw new AppError("not_found", "app_not_found", "App not found.", 404);
  }

  return app;
}

export async function requireProgramAffiliate(
  userId: string,
  programId: string
) {
  const db = getDb();

  const [membership] = await db
    .select()
    .from(programAffiliates)
    .where(
      and(
        eq(programAffiliates.userId, userId),
        eq(programAffiliates.programId, programId)
      )
    )
    .limit(1);

  if (!membership) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate membership not found.",
      404
    );
  }

  return membership;
}

export async function resolveProgramListAccess(
  userId: string,
  programId: string
): Promise<"owner" | "affiliate"> {
  try {
    await requireProgramAccess(userId, programId);
    return "owner";
  }
  catch (error) {
    if (
      error instanceof AppError
      && (error.code === "organization_not_found"
        || error.code === "app_not_found"
        || error.code === "program_not_found")
    ) {
      await requireProgramAffiliate(userId, programId);
      return "affiliate";
    }

    throw error;
  }
}
