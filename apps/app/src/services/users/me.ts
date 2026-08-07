import { cache } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  commissionRules,
  programAffiliates,
  programs,
  users,
} from "@/db/schema";
import { DEFAULT_LINK_LABEL } from "@/lib/link-code";
import { AppError } from "@/lib/errors";
import { validateAdminAccess } from "@/services/admin/gate";
import { listAppsForUser } from "@/services/apps";
import { listOrganizationsForUser } from "@/services/organizations";
import { homePathForProfile } from "@/lib/dashboard-nav";
import { serializeProgram } from "@/services/programs";
import {
  getLatestAcceptedAgreementsByProgramAffiliateId,
  serializeAppAgreementVersion,
} from "@/services/apps/agreement";
import {
  getDeploymentCapabilities,
  getDeploymentEdition,
} from "@/lib/deployment";
import { getServerEnv } from "@/lib/env";

export function resolveDefaultMode(
  primaryMode: "owner" | "affiliate",
  hasOwnerAccess: boolean,
  hasAffiliateAccess: boolean
) {
  if (hasOwnerAccess && !hasAffiliateAccess) {
    return "owner" as const;
  }

  if (hasAffiliateAccess && !hasOwnerAccess) {
    return "affiliate" as const;
  }

  return primaryMode;
}

async function getDefaultCommissionRulesByProgramId(programIds: string[]) {
  if (programIds.length === 0) {
    return new Map<string, (typeof commissionRules.$inferSelect) | null>();
  }

  const db = getDb();
  const rules = await db
    .select()
    .from(commissionRules)
    .where(
      and(
        inArray(commissionRules.programId, programIds),
        eq(commissionRules.isDefault, true),
        eq(commissionRules.isActive, true)
      )
    );

  const rulesByProgramId = new Map<
    string,
    (typeof commissionRules.$inferSelect) | null
  >();

  for (const programId of programIds) {
    rulesByProgramId.set(programId, null);
  }

  for (const rule of rules) {
    rulesByProgramId.set(rule.programId, rule);
  }

  return rulesByProgramId;
}

async function getDefaultLinkCodesByProgramAffiliateId(
  programAffiliateIds: string[]
) {
  if (programAffiliateIds.length === 0) {
    return new Map<string, string | null>();
  }

  const db = getDb();
  const links = await db
    .select({
      programAffiliateId: affiliateLinks.programAffiliateId,
      linkCode: affiliateLinks.linkCode,
    })
    .from(affiliateLinks)
    .where(
      and(
        inArray(affiliateLinks.programAffiliateId, programAffiliateIds),
        eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
      )
    );

  const linkCodesByProgramAffiliateId = new Map<string, string | null>();

  for (const programAffiliateId of programAffiliateIds) {
    linkCodesByProgramAffiliateId.set(programAffiliateId, null);
  }

  for (const link of links) {
    linkCodesByProgramAffiliateId.set(link.programAffiliateId, link.linkCode);
  }

  return linkCodesByProgramAffiliateId;
}

export async function getMeProfile(userId: string, email: string | null, name: string | null) {
  const db = getDb();

  const [user, organizations, userApps, membershipRows] = await Promise.all([
    db
      .select({
        isAdmin: users.isAdmin,
        primaryMode: users.primaryMode,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .then((rows) => rows[0]),
    listOrganizationsForUser(userId),
    listAppsForUser(userId),
    db
      .select({
        programAffiliate: programAffiliates,
        program: programs,
      })
      .from(programAffiliates)
      .innerJoin(programs, eq(programs.id, programAffiliates.programId))
      .where(eq(programAffiliates.userId, userId)),
  ]);

  const programIds = membershipRows.map((row) => row.program.id);
  const programAffiliateIds = membershipRows.map(
    (row) => row.programAffiliate.id
  );
  const [rulesByProgramId, defaultLinkCodesByProgramAffiliateId, acceptedAgreementsByProgramAffiliateId] =
    await Promise.all([
      getDefaultCommissionRulesByProgramId(programIds),
      getDefaultLinkCodesByProgramAffiliateId(programAffiliateIds),
      getLatestAcceptedAgreementsByProgramAffiliateId(programAffiliateIds),
    ]);

  const programAffiliatesList = membershipRows.map((row) => {
    const acceptedAgreementVersion = acceptedAgreementsByProgramAffiliateId.get(
      row.programAffiliate.id
    );

    return {
      program_affiliate: {
        id: row.programAffiliate.id,
        program_id: row.programAffiliate.programId,
        status: row.programAffiliate.status,
        default_link_code:
          defaultLinkCodesByProgramAffiliateId.get(row.programAffiliate.id) ??
          null,
        created_at: row.programAffiliate.createdAt.toISOString(),
      },
      program: serializeProgram(
        row.program,
        rulesByProgramId.get(row.program.id) ?? null
      ),
      accepted_agreement_version: acceptedAgreementVersion
        ? serializeAppAgreementVersion(acceptedAgreementVersion)
        : null,
    };
  });

  const hasOwnerAccess = organizations.length > 0;
  const hasAffiliateAccess = programAffiliatesList.length > 0;

  const primaryMode = user?.primaryMode ?? "owner";
  const defaultMode = resolveDefaultMode(
    primaryMode,
    hasOwnerAccess,
    hasAffiliateAccess
  );

  const profileEmail = user?.email ?? email;
  const profileName = user?.name ?? name;
  const profileImage = user?.image ?? null;

  return {
    id: userId,
    email: profileEmail,
    name: profileName,
    image: profileImage,
    is_admin: profileEmail
      ? validateAdminAccess(profileEmail, user?.isAdmin ?? false)
      : false,
    primary_mode: primaryMode,
    deployment: {
      edition: getDeploymentEdition(),
      instance_url: getServerEnv().APP_URL,
      capabilities: getDeploymentCapabilities(),
    },
    organizations: organizations.map((org) => ({
      id: org.id,
      name: org.name,
      role: org.role,
      created_at: org.createdAt.toISOString(),
    })),
    apps: userApps.map((app) => ({
      id: app.id,
      name: app.name,
      logo_url: app.logoUrl,
      organization_id: app.organizationId,
      network_visible: app.networkVisible,
      default_program_id: app.defaultProgramId,
    })),
    program_affiliates: programAffiliatesList,
    default_mode: defaultMode,
  };
}

export const getMeProfileForSession = cache(
  async (userId: string, email: string | null, name: string | null) => {
    return getMeProfile(userId, email, name);
  }
);

export async function getDefaultHomePathForUser(
  userId: string,
  email: string | null,
  name: string | null
) {
  const profile = await getMeProfileForSession(userId, email, name);
  return homePathForProfile(profile);
}

export async function getAffiliateMembershipForProgram(
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
