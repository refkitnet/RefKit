import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  apps,
  apiKeys,
  commissionRules,
  programs,
  type App,
} from "@/db/schema";
import { assertRefKitNetworkAccessible } from "@/lib/closed-beta.server";
import { AppError } from "@/lib/errors";
import {
  assertDeploymentCapability,
  getDeploymentCapabilities,
} from "@/lib/deployment";
import { encryptTestApiKey, hashApiKey } from "@/lib/crypto";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { ListParams, listWithCursor } from "@/lib/pagination";
import {
  isRevenueSource,
  type RevenueSource,
} from "@/lib/revenue-source";
import { getTrackingOrigin } from "@/lib/tracking-origin";
import {
  listOrganizationsForUser,
  requireOrganizationMembership,
} from "@/services/organizations";
import {
  assertCanSetRevenueSource,
  assertRevenueSourceMutable,
} from "@/services/revenue/guards";
import { writeAuditLog } from "@/services/audit";
import { createInitialAppAgreement } from "@/services/apps/agreement";
import { buildRawKey } from "@/services/api-keys";
import {
  createProgramRecords,
  resolveProgramDestinationUrl,
  rethrowProgramCreateError,
  validateCommissionRule,
  type CreateProgramInput,
} from "@/services/programs";
import {
  requireAppAccess,
  requireAppInOrganization,
} from "@/services/scoping";

async function assertTrackingOriginAvailable(
  trackingOrigin: string,
  excludeAppId?: string
) {
  const db = getDb();
  const [existing] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(
      excludeAppId
        ? and(
            eq(apps.trackingOrigin, trackingOrigin),
            ne(apps.id, excludeAppId)
          )
        : eq(apps.trackingOrigin, trackingOrigin)
    )
    .limit(1);

  if (existing) {
    throw new AppError(
      "conflict",
      "tracking_origin_taken",
      "Another app already uses this website origin for tracking.",
      409
    );
  }
}

type CreateAppInput = {
  organizationId: string;
  name: string;
  websiteUrl?: string | null;
  revenueSource?: RevenueSource;
  defaultProgram?: Omit<CreateProgramInput, "appId">;
};

export type AppWithDefault = App & {
  defaultProgramId: string | null;
};

export async function getDefaultProgramIds(appIds: string[]) {
  const result = new Map<string, string>();

  if (appIds.length === 0) {
    return result;
  }

  const db = getDb();
  const rows = await db
    .select({ appId: programs.appId, programId: programs.id })
    .from(programs)
    .where(
      and(
        inArray(programs.appId, appIds),
        eq(programs.isDefault, true)
      )
    );

  for (const row of rows) {
    result.set(row.appId, row.programId);
  }

  return result;
}

async function withDefaultProgram(app: App): Promise<AppWithDefault> {
  const defaults = await getDefaultProgramIds([app.id]);
  return {
    ...app,
    defaultProgramId: defaults.get(app.id) ?? null,
  };
}

export async function createApp(
  userId: string,
  input: CreateAppInput
) {
  await requireOrganizationMembership(userId, input.organizationId);

  const capabilities = getDeploymentCapabilities();

  if (!capabilities.managed_stripe && input.revenueSource === "stripe") {
    throw new AppError(
      "invalid_request",
      "managed_revenue_source_unavailable",
      "Self-Hosted Apps use API revenue reporting.",
      400
    );
  }

  const revenueSource = capabilities.managed_stripe
    ? (input.revenueSource ?? "stripe")
    : "api";

  if (!isRevenueSource(revenueSource)) {
    throw new AppError(
      "invalid_request",
      "invalid_revenue_source",
      "Revenue source must be stripe or api.",
      400
    );
  }

  const db = getDb();
  const appId = generateId(ID_PREFIXES.app);
  const testApiKeyId = generateId(ID_PREFIXES.apiKey);
  const { rawKey: testApiKey, prefix: testApiKeyPrefix } = buildRawKey(
    "app",
    true
  );

  if (input.defaultProgram) {
    validateCommissionRule(
      input.defaultProgram.currency,
      input.defaultProgram.commissionRule
    );
  }

  const trackingOrigin = input.websiteUrl
    ? getTrackingOrigin(input.websiteUrl)
    : null;

  if (trackingOrigin) {
    await assertTrackingOriginAvailable(trackingOrigin);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(apps).values({
        id: appId,
        organizationId: input.organizationId,
        name: input.name,
        revenueSource,
        websiteUrl: input.websiteUrl ?? null,
        trackingOrigin,
      });

      await tx.insert(apiKeys).values({
        id: testApiKeyId,
        userId,
        organizationId: input.organizationId,
        appId,
        kind: "app",
        prefix: testApiKeyPrefix,
        keyHash: hashApiKey(testApiKey),
        testKey: null,
        testKeyEncrypted: encryptTestApiKey(testApiKey),
        name: "Onboarding test key",
      });

      await createInitialAppAgreement(
        {
          appId,
          appName: input.name,
          publishedByUserId: userId,
        },
        tx
      );

      if (input.defaultProgram) {
        const destinationUrl = resolveProgramDestinationUrl(
          input.websiteUrl ?? null,
          input.defaultProgram.destinationUrl
        );

        await createProgramRecords({
          executor: tx,
          userId,
          appId,
          name: input.defaultProgram.name,
          slug: input.defaultProgram.slug,
          currency: input.defaultProgram.currency,
          destinationUrl,
          commissionRule: input.defaultProgram.commissionRule,
          minimumPayoutAmount: input.defaultProgram.minimumPayoutAmount,
          supportedPayoutMethods: input.defaultProgram.supportedPayoutMethods,
          allowSelfReferral: input.defaultProgram.allowSelfReferral,
          promotionCodeFallback: input.defaultProgram.promotionCodeFallback,
          joinPageEnabled: input.defaultProgram.joinPageEnabled,
          joinPageApproval: input.defaultProgram.joinPageApproval,
          isDefault: true,
        });
      }
    });
  }
  catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
      && "constraint" in error
      && typeof error.constraint === "string"
      && error.constraint.includes("tracking_origin")
    ) {
      throw new AppError(
        "conflict",
        "tracking_origin_taken",
        "Another app already uses this website origin for tracking.",
        409
      );
    }

    rethrowProgramCreateError(error);
  }

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  return {
    ...(await withDefaultProgram(app)),
    testApiKey,
    testApiKeyId,
  };
}

export async function listAppsForUser(userId: string) {
  const organizations = await listOrganizationsForUser(userId);

  if (organizations.length === 0) {
    return [];
  }

  const db = getDb();
  const organizationIds = organizations.map((org) => org.id);

  const result = await db
    .select({
      id: apps.id,
      organizationId: apps.organizationId,
      name: apps.name,
      logoUrl: apps.logoUrl,
      networkVisible: apps.networkVisible,
      defaultProgramId: programs.id,
    })
    .from(apps)
    .leftJoin(
      programs,
      and(eq(programs.appId, apps.id), eq(programs.isDefault, true))
    )
    .where(inArray(apps.organizationId, organizationIds))
    .orderBy(asc(apps.createdAt));

  if (getDeploymentCapabilities().official_network) {
    return result;
  }

  return result.map((app) => ({ ...app, networkVisible: false }));
}

export async function listApps(
  userId: string,
  organizationId: string,
  params: ListParams
) {
  await requireOrganizationMembership(userId, organizationId);

  const limit = params.limit ?? 25;

  return listWithCursor<App>({
    table: apps,
    columns: {
      id: apps.id,
      createdAt: apps.createdAt,
    },
    where: eq(apps.organizationId, organizationId),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function getAppById(userId: string, appId: string) {
  const app = await requireAppAccess(userId, appId);
  return withDefaultProgram(app);
}

export async function setDefaultProgram(
  userId: string,
  appId: string,
  programId: string
) {
  await requireAppAccess(userId, appId);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM ${apps}
      WHERE ${apps.id} = ${appId}
      FOR UPDATE
    `);

    const [lockedApp] = await tx
      .select()
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1);

    const [program] = await tx
      .select()
      .from(programs)
      .where(
        and(eq(programs.id, programId), eq(programs.appId, appId))
      )
      .limit(1);

    if (!program) {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    if (program.status === "disabled") {
      throw new AppError(
        "invalid_request",
        "default_program_disabled",
        "A disabled program cannot be the app default.",
        400
      );
    }

    if (lockedApp.networkVisible) {
      if (program.status !== "active") {
        throw new AppError(
          "conflict",
          "network_default_program_active_required",
          "The default program must be active while the app is visible in the RefKit Network.",
          409
        );
      }

      const [rule] = await tx
        .select({ id: commissionRules.id })
        .from(commissionRules)
        .where(
          and(
            eq(commissionRules.programId, program.id),
            eq(commissionRules.isDefault, true),
            eq(commissionRules.isActive, true)
          )
        )
        .limit(1);

      if (!rule) {
        throw new AppError(
          "conflict",
          "network_default_program_terms_required",
          "Publish program terms before making this the visible default.",
          409
        );
      }
    }

    await tx
      .update(programs)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(programs.appId, appId));

    await tx
      .update(programs)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(programs.id, programId));
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "app.default_program_updated",
    resourceType: "app",
    resourceId: appId,
    metadata: { default_program_id: programId },
  });

  return getAppById(userId, appId);
}

export async function setAppNetworkVisibility(
  userId: string,
  appId: string,
  visible: boolean
) {
  assertDeploymentCapability("official_network");
  await requireAppAccess(userId, appId);

  if (visible) {
    assertRefKitNetworkAccessible();
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM ${apps}
      WHERE ${apps.id} = ${appId}
      FOR UPDATE
    `);

    const [lockedApp] = await tx
      .select()
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1);

    if (visible) {
      if (lockedApp.status !== "active") {
        throw new AppError(
          "conflict",
          "network_app_active_required",
          "Only active apps can be shown in the RefKit Network.",
          409
        );
      }

      if (!lockedApp.logoUrl) {
        throw new AppError(
          "invalid_request",
          "app_logo_required",
          "Upload an app logo before showing the app in the RefKit Network.",
          400
        );
      }

      const [row] = await tx
        .select({ program: programs, ruleId: commissionRules.id })
        .from(programs)
        .innerJoin(
          commissionRules,
          and(
            eq(commissionRules.programId, programs.id),
            eq(commissionRules.isDefault, true),
            eq(commissionRules.isActive, true)
          )
        )
        .where(
          and(
            eq(programs.appId, appId),
            eq(programs.isDefault, true),
            eq(programs.status, "active")
          )
        )
        .limit(1);

      if (!row) {
        throw new AppError(
          "conflict",
          "network_default_program_required",
          "Choose an active default program with published terms before showing the app in the RefKit Network.",
          409
        );
      }
    }

    await tx
      .update(apps)
      .set({ networkVisible: visible, updatedAt: new Date() })
      .where(eq(apps.id, appId));
  });

  await writeAuditLog({
    actorUserId: userId,
    action: visible ? "app.network_enabled" : "app.network_disabled",
    resourceType: "app",
    resourceId: appId,
  });

  return getAppById(userId, appId);
}

export async function updateAppWebsiteUrl(
  userId: string,
  appId: string,
  websiteUrl: string
) {
  await requireAppAccess(userId, appId);

  const trackingOrigin = getTrackingOrigin(websiteUrl);
  await assertTrackingOriginAvailable(trackingOrigin, appId);

  const db = getDb();

  try {
    const [app] = await db
      .update(apps)
      .set({
        websiteUrl,
        trackingOrigin,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId))
      .returning();

    await db
      .update(programs)
      .set({
        destinationUrl: websiteUrl,
        updatedAt: new Date(),
      })
      .where(eq(programs.appId, appId));

    return app;
  }
  catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(
        "conflict",
        "tracking_origin_taken",
        "Another app already uses this website origin for tracking.",
        409
      );
    }

    throw error;
  }
}

export async function updateAppRevenueSource(
  userId: string,
  appId: string,
  revenueSource: RevenueSource
) {
  await requireAppAccess(userId, appId);

  if (!getDeploymentCapabilities().managed_stripe && revenueSource !== "api") {
    throw new AppError(
      "invalid_request",
      "managed_revenue_source_unavailable",
      "Self-Hosted Apps use API revenue reporting.",
      400
    );
  }

  if (!isRevenueSource(revenueSource)) {
    throw new AppError(
      "invalid_request",
      "invalid_revenue_source",
      "Revenue source must be stripe or api.",
      400
    );
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    const [lockedApp] = await tx
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.id, appId))
      .for("update")
      .limit(1);

    if (!lockedApp) {
      throw new AppError("not_found", "app_not_found", "App not found.", 404);
    }

    await assertCanSetRevenueSource(appId, revenueSource, tx);

    const [app] = await tx
      .update(apps)
      .set({
        revenueSource,
        updatedAt: new Date(),
      })
      .where(eq(apps.id, appId))
      .returning();

    return app;
  });
}

export async function assertAppRevenueSourceMutable(appId: string) {
  await assertRevenueSourceMutable(appId);
}

export function serializeApp(app: App & { defaultProgramId?: string | null }) {
  const capabilities = getDeploymentCapabilities();

  return {
    id: app.id,
    organization_id: app.organizationId,
    name: app.name,
    revenue_source: app.revenueSource,
    website_url: app.websiteUrl,
    logo_url: app.logoUrl,
    network_visible: capabilities.official_network
      ? app.networkVisible
      : false,
    default_program_id: app.defaultProgramId ?? null,
    status: app.status,
    integration_issue: app.integrationIssue,
    integration_issue_at: app.integrationIssueAt
      ? app.integrationIssueAt.toISOString()
      : null,
    created_at: app.createdAt.toISOString(),
    updated_at: app.updatedAt.toISOString(),
  };
}

export { requireAppAccess, requireAppInOrganization };
