import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  managedAccounts,
  organizationMembers,
  organizations,
  users,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { isSelfHosted } from "@/lib/deployment";
import { generateId, ID_PREFIXES } from "@/lib/ids";

export async function createOrganization(userId: string, name: string) {
  const db = getDb();

  if (isSelfHosted()) {
    const [user] = await db
      .select({
        isAdmin: users.isAdmin,
        primaryMode: users.primaryMode,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || (!user.isAdmin && user.primaryMode !== "owner")) {
      throw new AppError(
        "forbidden",
        "developer_access_required",
        "Administrator-granted Developer access is required to create an organization.",
        403
      );
    }
  }

  const orgId = generateId(ID_PREFIXES.organization);
  const memberId = generateId("mem");

  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({
      id: orgId,
      name,
    });

    await tx.insert(organizationMembers).values({
      id: memberId,
      organizationId: orgId,
      userId,
      role: "owner",
    });
  });

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return organization;
}

export async function listOrganizationsForUser(userId: string) {
  const db = getDb();

  return db
    .select({
      id: organizations.id,
      name: organizations.name,
      role: organizationMembers.role,
      createdAt: organizations.createdAt,
      updatedAt: organizations.updatedAt,
    })
    .from(organizationMembers)
    .innerJoin(
      organizations,
      eq(organizationMembers.organizationId, organizations.id)
    )
    .where(eq(organizationMembers.userId, userId));
}

export async function getOrganizationMembership(
  userId: string,
  organizationId: string
) {
  const db = getDb();

  if (userId.startsWith(`${ID_PREFIXES.managedAccount}_`)) {
    const [managedAccount] = await db
      .select()
      .from(managedAccounts)
      .where(
        and(
          eq(managedAccounts.id, userId),
          eq(managedAccounts.organizationId, organizationId),
          eq(managedAccounts.status, "active")
        )
      )
      .limit(1);

    if (!managedAccount) {
      throw new AppError(
        "not_found",
        "organization_not_found",
        "Organization not found.",
        404
      );
    }

    return {
      id: managedAccount.id,
      organizationId: managedAccount.organizationId,
      userId: null,
      role: "owner",
      createdAt: managedAccount.createdAt,
      updatedAt: managedAccount.updatedAt,
    };
  }

  const [match] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!match) {
    throw new AppError(
      "not_found",
      "organization_not_found",
      "Organization not found.",
      404
    );
  }

  return match;
}

export async function requireOrganizationMembership(
  userId: string,
  organizationId: string
) {
  return getOrganizationMembership(userId, organizationId);
}

export async function getOrganizationOwnerEmails(organizationId: string) {
  const db = getDb();

  const rows = await db
    .select({ email: users.email })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.role, "owner")
      )
    );

  return rows.map((row) => row.email).filter(Boolean);
}
