import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  programAffiliates,
  programs,
  users,
  type ProgramAffiliate,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { DEFAULT_LINK_LABEL, generateUniqueLinkCode } from "@/lib/link-code";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { writeAuditLog } from "@/services/audit";
import { getProgramIdsForApp, requireProgramAccess } from "@/services/scoping";
import {
  getCurrentAppAgreement,
  recordAgreementAcceptance,
} from "@/services/apps/agreement";
import {
  getCurrentTermsVersion,
} from "@/services/programs/terms";
import { emitWebhookEvent } from "@/services/webhooks";

type CreateAffiliateInput = {
  programId: string;
  email?: string;
  name?: string;
  testMode?: boolean;
};

function testAffiliateEmail(programId: string) {
  return `refkit-test+${programId.replace(/[^a-z0-9]/gi, "")}@refkit.invalid`;
}

async function findOrCreateUserByEmail(email: string, name?: string) {
  const db = getDb();
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing) {
    return existing;
  }

  const userId = generateId(ID_PREFIXES.user);

  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    name: name ?? null,
    primaryMode: "affiliate",
  });

  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return created;
}

async function sendAffiliateInvite(
  email: string,
  name: string | undefined,
  programName: string
) {
  const env = getServerEnv();

  await auth.api.signInMagicLink({
    body: {
      email,
      name,
      callbackURL: `${env.APP_URL}/affiliate`,
      metadata: {
        type: "affiliate_invite",
        program_name: programName,
      },
    },
    headers: new Headers(),
  });
}

export async function createAffiliate(
  userId: string,
  input: CreateAffiliateInput
) {
  const program = await requireProgramAccess(userId, input.programId);
  const testMode = input.testMode ?? false;
  const email = testMode
    ? testAffiliateEmail(input.programId)
    : input.email;

  if (!email) {
    throw new AppError(
      "invalid_request",
      "affiliate_email_required",
      "Affiliate email is required.",
      400
    );
  }

  const db = getDb();

  if (testMode) {
    const [existingTestAffiliate] = await db
      .select()
      .from(programAffiliates)
      .where(
        and(
          eq(programAffiliates.programId, input.programId),
          eq(programAffiliates.isTest, true)
        )
      )
      .limit(1);

    if (existingTestAffiliate) {
      const [existingLink, existingUser] = await Promise.all([
        db
          .select()
          .from(affiliateLinks)
          .where(
            and(
              eq(
                affiliateLinks.programAffiliateId,
                existingTestAffiliate.id
              ),
              eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
            )
          )
          .limit(1)
          .then((rows) => rows[0]),
        db
          .select()
          .from(users)
          .where(eq(users.id, existingTestAffiliate.userId))
          .limit(1)
          .then((rows) => rows[0]),
      ]);

      if (!existingLink || !existingUser) {
        throw new AppError(
          "internal",
          "test_affiliate_incomplete",
          "The test affiliate is not configured correctly.",
          500
        );
      }

      return {
        affiliate: existingTestAffiliate,
        link: existingLink,
        user: existingUser,
        program,
        created: false,
      };
    }
  }

  const affiliateUser = await findOrCreateUserByEmail(
    email,
    testMode ? "Test affiliate" : input.name
  );

  const [existingMembership] = await db
    .select()
    .from(programAffiliates)
    .where(
      and(
        eq(programAffiliates.programId, input.programId),
        eq(programAffiliates.userId, affiliateUser.id)
      )
    )
    .limit(1);

  if (existingMembership) {
    throw new AppError(
      "conflict",
      "affiliate_already_exists",
      "This user is already an affiliate in this program.",
      409
    );
  }

  const programAffiliateId = generateId(ID_PREFIXES.affiliate);
  const linkId = generateId(ID_PREFIXES.link);
  const linkCode = await generateUniqueLinkCode(program.appId);

  const currentTerms = await getCurrentTermsVersion(input.programId);

  if (!currentTerms) {
    throw new AppError(
      "internal",
      "terms_version_missing",
      "Program terms are not configured.",
      500
    );
  }

  const currentAgreement = await getCurrentAppAgreement(program.appId);

  if (!currentAgreement) {
    throw new AppError(
      "internal",
      "agreement_version_missing",
      "App agreement is not configured.",
      500
    );
  }

  await db.transaction(async (tx) => {
    await tx.insert(programAffiliates).values({
      id: programAffiliateId,
      programId: input.programId,
      userId: affiliateUser.id,
      status: "active",
      isTest: testMode,
    });

    await tx.insert(affiliateLinks).values({
      id: linkId,
      appId: program.appId,
      programAffiliateId,
      programId: input.programId,
      linkCode,
      label: DEFAULT_LINK_LABEL,
    });
  });

  await recordAgreementAcceptance({
    programAffiliateId,
    appAgreementVersionId: currentAgreement.id,
  });

  if (!testMode) {
    await sendAffiliateInvite(
      affiliateUser.email,
      affiliateUser.name ?? input.name,
      program.name
    );
  }

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  const [link] = await db
    .select()
    .from(affiliateLinks)
    .where(eq(affiliateLinks.id, linkId))
    .limit(1);

  if (affiliate) {
    await emitWebhookEvent({
      appId: program.appId,
      eventType: "affiliate.created",
      livemode: !affiliate.isTest,
      data: serializeAffiliate(affiliate, affiliateUser, link),
    });
  }

  return {
    affiliate,
    link,
    user: affiliateUser,
    program,
    created: true,
  };
}

export async function listAffiliates(
  userId: string,
  programId: string,
  params: ListParams,
  options: { testMode?: boolean } = {}
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<ProgramAffiliate>({
    table: programAffiliates,
    columns: {
      id: programAffiliates.id,
      createdAt: programAffiliates.createdAt,
    },
    where: and(
      eq(programAffiliates.programId, programId),
      eq(programAffiliates.isTest, options.testMode ?? false)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAffiliatesForApp(
  userId: string,
  appId: string,
  params: ListParams,
  options: { testMode?: boolean } = {}
) {
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<ProgramAffiliate>({
    table: programAffiliates,
    columns: {
      id: programAffiliates.id,
      createdAt: programAffiliates.createdAt,
    },
    where: and(
      inArray(programAffiliates.programId, programIds),
      eq(programAffiliates.isTest, options.testMode ?? false)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function disableAffiliate(
  userId: string,
  programAffiliateId: string,
  options?: {
    skipAccessCheck?: boolean;
    auditAction?: string;
  }
) {
  const db = getDb();

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (!affiliate) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate not found.",
      404
    );
  }

  if (!options?.skipAccessCheck) {
    await requireProgramAccess(userId, affiliate.programId);
  }

  if (affiliate.status !== "active") {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only active programAffiliates can be disabled.",
      400
    );
  }

  const [updated] = await db
    .update(programAffiliates)
    .set({ status: "disabled" })
    .where(
      and(
        eq(programAffiliates.id, programAffiliateId),
        eq(programAffiliates.status, "active")
      )
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only active programAffiliates can be disabled.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: options?.auditAction ?? "affiliate.disabled",
    resourceType: "affiliate",
    resourceId: programAffiliateId,
    metadata: { from_status: affiliate.status, to_status: "disabled" },
  });

  const [program] = await db
    .select({ appId: programs.appId })
    .from(programs)
    .where(eq(programs.id, updated.programId))
    .limit(1);

  if (program) {
    await emitWebhookEvent({
      appId: program.appId,
      eventType: "affiliate.disabled",
      livemode: !updated.isTest,
      data: serializeAffiliate(updated),
    });
  }

  return updated;
}

export async function enableAffiliate(
  userId: string,
  programAffiliateId: string
) {
  const db = getDb();

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (!affiliate) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate not found.",
      404
    );
  }

  await requireProgramAccess(userId, affiliate.programId);

  if (affiliate.status !== "disabled") {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only disabled programAffiliates can be enabled.",
      400
    );
  }

  const [updated] = await db
    .update(programAffiliates)
    .set({ status: "active" })
    .where(
      and(
        eq(programAffiliates.id, programAffiliateId),
        eq(programAffiliates.status, "disabled")
      )
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only disabled programAffiliates can be enabled.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "affiliate.enabled",
    resourceType: "affiliate",
    resourceId: programAffiliateId,
    metadata: { from_status: affiliate.status, to_status: "active" },
  });

  return updated;
}

export function serializeAffiliate(
  affiliate: ProgramAffiliate,
  user?: { email: string; name: string | null; image: string | null },
  link?: { linkCode: string } | null
) {
  return {
    id: affiliate.id,
    program_id: affiliate.programId,
    user_id: affiliate.userId,
    status: affiliate.status,
    is_test: affiliate.isTest,
    link_code: link?.linkCode ?? null,
    email: affiliate.isTest ? null : (user?.email ?? null),
    name: affiliate.isTest ? "Test affiliate" : (user?.name ?? null),
    image: affiliate.isTest ? null : (user?.image ?? null),
    created_at: affiliate.createdAt.toISOString(),
    updated_at: affiliate.updatedAt.toISOString(),
  };
}

export async function getAffiliateDefaultLinks(
  affiliateRows: ProgramAffiliate[]
) {
  if (affiliateRows.length === 0) {
    return new Map<string, { linkCode: string }>();
  }

  const db = getDb();
  const rows = await db
    .select({
      programAffiliateId: affiliateLinks.programAffiliateId,
      linkCode: affiliateLinks.linkCode,
    })
    .from(affiliateLinks)
    .where(
      and(
        inArray(
          affiliateLinks.programAffiliateId,
          affiliateRows.map((row) => row.id)
        ),
        eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
      )
    );

  return new Map(
    rows.map((row) => [
      row.programAffiliateId,
      { linkCode: row.linkCode },
    ])
  );
}

export async function getAffiliateUsers(
  affiliateRows: ProgramAffiliate[]
) {
  if (affiliateRows.length === 0) {
    return new Map<string, { email: string; name: string | null; image: string | null }>();
  }

  const db = getDb();
  const userIds = [...new Set(affiliateRows.map((row) => row.userId))];
  const userMap = new Map<
    string,
    { email: string; name: string | null; image: string | null }
  >();

  for (const userId of userIds) {
    const [user] = await db
      .select({
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user) {
      userMap.set(userId, user);
    }
  }

  return userMap;
}

export async function getProgramById(programId: string) {
  const db = getDb();

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  return program ?? null;
}
