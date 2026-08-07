import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  affiliateLinks,
  apps,
  managedConnections,
  programAffiliates,
  programs,
  users,
} from "@/db/schema";
import { assertRefKitNetworkAccessible } from "@/lib/closed-beta.server";
import { AppError } from "@/lib/errors";
import { DEFAULT_LINK_LABEL, generateUniqueLinkCode } from "@/lib/link-code";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { sendJoinSignupReceivedEmailDirect } from "@/services/emails/send-dashboard-emails";
import {
  getCurrentAppAgreement,
  lockAppAgreement,
  recordAgreementAcceptance,
} from "@/services/apps/agreement";
import { getOrganizationOwnerEmails } from "@/services/organizations";
import {
  getCurrentTermsVersion,
  lockProgramTerms,
} from "@/services/programs/terms";
import { emitWebhookEvent } from "@/services/webhooks";

type JoinProgramInput = {
  programSlug: string;
  email: string;
  name?: string;
  appAgreementVersionId: string;
};

type AffiliateUser = typeof users.$inferSelect;

async function assertHostedJoinAvailable(
  appId: string,
  executor: DbExecutor
) {
  const [connection] = await executor
    .select({ status: managedConnections.status })
    .from(managedConnections)
    .where(eq(managedConnections.appId, appId))
    .limit(1);

  if (
    connection?.status === "uninstalled"
    || connection?.status === "redacted"
  ) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }
}

export async function getPublicJoinPageContext(programSlug: string) {
  const db = getDb();
  const [row] = await db
    .select({
      program: programs,
      appName: apps.name,
      appLogoUrl: apps.logoUrl,
    })
    .from(programs)
    .innerJoin(apps, eq(apps.id, programs.appId))
    .where(eq(programs.slug, programSlug))
    .limit(1);

  const program = row?.program;

  if (!program || program.status === "disabled") {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  if (!program.joinPageEnabled) {
    throw new AppError(
      "invalid_request",
      "join_page_disabled",
      "This program does not accept public signups.",
      400
    );
  }

  await assertHostedJoinAvailable(program.appId, db);

  return row;
}

export async function assertPublicJoinProgramMatches(
  programSlug: string,
  programId: string
) {
  const db = getDb();
  const [program] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, programSlug))
    .limit(1);

  if (!program || program.id !== programId) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }
}

export async function ensurePublicJoinUser(
  email: string,
  name: string | undefined
) {
  return findOrCreateUserByEmail(email, name, getDb());
}

async function findOrCreateUserByEmail(
  email: string,
  name: string | undefined,
  executor: DbExecutor
) {
  const normalizedEmail = email.trim().toLowerCase();

  await executor
    .insert(users)
    .values({
      id: generateId(ID_PREFIXES.user),
      email: normalizedEmail,
      name: name ?? null,
      primaryMode: "affiliate",
    })
    .onConflictDoNothing();

  const [user] = await executor
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    throw new AppError(
      "internal",
      "affiliate_user_create_failed",
      "Could not create affiliate user.",
      500
    );
  }

  return user;
}

async function createProgramMembership(input: {
  program: typeof programs.$inferSelect;
  appAgreementVersionId: string;
  resolveUser: (executor: DbExecutor) => Promise<AffiliateUser>;
  requireNetworkDefault?: boolean;
}) {
  const db = getDb();
  const programAffiliateId = generateId(ID_PREFIXES.affiliate);
  const linkId = generateId(ID_PREFIXES.link);

  const join = await db.transaction(async (tx) => {
    await lockProgramTerms(tx, input.program.id);
    await lockAppAgreement(tx, input.program.appId);

    const [lockedProgram] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, input.program.id))
      .limit(1);

    if (!lockedProgram || lockedProgram.status === "disabled") {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    if (input.requireNetworkDefault) {
      const [networkApp] = await tx
        .select({ id: apps.id })
        .from(apps)
        .where(
          and(
            eq(apps.id, lockedProgram.appId),
            eq(apps.status, "active"),
            eq(apps.networkVisible, true)
          )
        )
        .limit(1);

      if (
        !networkApp ||
        lockedProgram.status !== "active" ||
        !lockedProgram.isDefault
      ) {
        throw new AppError(
          "not_found",
          "network_program_not_found",
          "Network program not found.",
          404
        );
      }
    }
    else {
      if (!lockedProgram.joinPageEnabled) {
        throw new AppError(
          "invalid_request",
          "join_page_disabled",
          "This program does not accept public signups.",
          400
        );
      }

      await assertHostedJoinAvailable(lockedProgram.appId, tx);
    }

    const affiliateUser = await input.resolveUser(tx);
    const [existingMembership] = await tx
      .select({ id: programAffiliates.id })
      .from(programAffiliates)
      .where(
        and(
          eq(programAffiliates.programId, lockedProgram.id),
          eq(programAffiliates.userId, affiliateUser.id)
        )
      )
      .limit(1);

    if (existingMembership) {
      throw new AppError(
        "conflict",
        "affiliate_already_exists",
        "You are already signed up for this program.",
        409
      );
    }

    const currentTerms = await getCurrentTermsVersion(lockedProgram.id, tx);

    if (!currentTerms) {
      throw new AppError(
        "internal",
        "terms_version_missing",
        "Program terms are not configured.",
        500
      );
    }

    const currentAgreement = await getCurrentAppAgreement(
      lockedProgram.appId,
      tx
    );

    if (!currentAgreement) {
      throw new AppError(
        "internal",
        "agreement_version_missing",
        "App agreement is not configured.",
        500
      );
    }

    if (input.appAgreementVersionId !== currentAgreement.id) {
      throw new AppError(
        "invalid_request",
        "agreement_version_outdated",
        "App agreement has changed. Refresh and accept the current agreement.",
        400
      );
    }

    const linkCode = await generateUniqueLinkCode(lockedProgram.appId, tx);
    const status =
      lockedProgram.joinPageApproval === "pending" ? "pending" : "active";

    await tx.insert(programAffiliates).values({
      id: programAffiliateId,
      programId: lockedProgram.id,
      userId: affiliateUser.id,
      status,
    });

    await tx.insert(affiliateLinks).values({
      id: linkId,
      appId: lockedProgram.appId,
      programAffiliateId,
      programId: lockedProgram.id,
      linkCode,
      label: DEFAULT_LINK_LABEL,
    });

    await recordAgreementAcceptance(
      {
        programAffiliateId,
        appAgreementVersionId: currentAgreement.id,
      },
      tx
    );

    return { affiliateUser, status };
  });

  await emitWebhookEvent({
    appId: input.program.appId,
    eventType: "affiliate.created",
    livemode: true,
    data: {
      id: programAffiliateId,
      program_id: input.program.id,
      user_id: join.affiliateUser.id,
      status: join.status,
      is_test: false,
    },
  });

  return { ...join, programAffiliateId };
}

async function notifyProgramOwners(input: {
  program: typeof programs.$inferSelect;
  affiliateUser: AffiliateUser;
  fallbackName?: string;
  status: string;
}) {
  const db = getDb();
  const [appRow] = await db
    .select({ organizationId: apps.organizationId })
    .from(apps)
    .where(eq(apps.id, input.program.appId))
    .limit(1);

  if (!appRow) {
    return;
  }

  const ownerEmails = await getOrganizationOwnerEmails(appRow.organizationId);

  for (const to of ownerEmails) {
    await sendJoinSignupReceivedEmailDirect({
      to,
      programName: input.program.name,
      affiliateEmail: input.affiliateUser.email,
      affiliateName:
        input.affiliateUser.name ?? input.fallbackName ?? null,
      status: input.status,
    });
  }
}

export async function joinProgramViaPublicPage(input: JoinProgramInput) {
  const db = getDb();

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, input.programSlug))
    .limit(1);

  if (!program || program.status === "disabled") {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  if (!program.joinPageEnabled) {
    throw new AppError(
      "invalid_request",
      "join_page_disabled",
      "This program does not accept public signups.",
      400
    );
  }

  await assertHostedJoinAvailable(program.appId, db);

  const { affiliateUser, status, programAffiliateId } =
    await createProgramMembership({
      program,
      appAgreementVersionId: input.appAgreementVersionId,
      resolveUser: (tx) => findOrCreateUserByEmail(input.email, input.name, tx),
    });

  await notifyProgramOwners({
    program,
    affiliateUser,
    fallbackName: input.name,
    status,
  });

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  return {
    affiliate,
    program,
    status,
  };
}

export async function joinListedProgramForUser(input: {
  programId: string;
  userId: string;
  appAgreementVersionId: string;
}) {
  assertRefKitNetworkAccessible();

  const db = getDb();
  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, input.programId))
    .limit(1);

  const [networkApp] = program
    ? await db
        .select({ id: apps.id })
        .from(apps)
        .where(
          and(
            eq(apps.id, program.appId),
            eq(apps.status, "active"),
            eq(apps.networkVisible, true)
          )
        )
        .limit(1)
    : [];

  if (
    !program ||
    !networkApp ||
    program.status !== "active" ||
    !program.isDefault
  ) {
    throw new AppError(
      "not_found",
      "network_program_not_found",
      "Network program not found.",
      404
    );
  }

  const { affiliateUser, status, programAffiliateId } =
    await createProgramMembership({
      program,
      appAgreementVersionId: input.appAgreementVersionId,
      requireNetworkDefault: true,
      resolveUser: async (tx) => {
        const [user] = await tx
          .select()
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);

        if (!user) {
          throw new AppError(
            "not_found",
            "user_not_found",
            "User not found.",
            404
          );
        }

        return user;
      },
    });

  await notifyProgramOwners({ program, affiliateUser, status });

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  return { affiliate, program, status };
}
