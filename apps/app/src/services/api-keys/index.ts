import { randomBytes } from "crypto";
import { and, eq, isNull, or, lt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apiKeys, apps } from "@/db/schema";
import {
  decryptTestApiKey,
  encryptTestApiKey,
  hashApiKey,
} from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";

export type ApiKeyKind = "app" | "affiliate" | "managed";

export function buildRawKey(
  kind: ApiKeyKind,
  testMode: boolean
): { rawKey: string; prefix: string } {
  const prefix =
    kind === "managed"
      ? "rk_managed_"
      : kind === "affiliate"
      ? "rk_aff_"
      : testMode
        ? "rk_test_app_"
        : "rk_app_";
  const secret = randomBytes(32).toString("base64url");
  return {
    prefix,
    rawKey: `${prefix}${secret}`,
  };
}

type CreateApiKeyInput = {
  userId: string;
  kind: ApiKeyKind;
  organizationId?: string;
  appId?: string;
  name?: string;
  testMode?: boolean;
};

export async function assertAppBelongsToOrganization(
  appId: string,
  organizationId: string,
  options?: { forAuth?: boolean }
) {
  const db = getDb();

  const [app] = await db
    .select({ organizationId: apps.organizationId })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app || app.organizationId !== organizationId) {
    if (options?.forAuth) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    throw new AppError(
      "invalid_request",
      "app_organization_mismatch",
      "App does not belong to the organization.",
      400
    );
  }
}

export async function createApiKey(input: CreateApiKeyInput) {
  if (input.kind === "managed") {
    throw new AppError(
      "invalid_request",
      "managed_key_internal_only",
      "Managed keys can only be issued through managed provisioning.",
      400
    );
  }
  if (input.kind === "app" && !input.organizationId) {
    throw new AppError(
      "invalid_request",
      "organization_required",
      "App API keys require an organization.",
      400
    );
  }

  if (input.testMode && input.kind !== "app") {
    throw new AppError(
      "invalid_request",
      "test_mode_app_only",
      "Test-mode keys are only available for app API keys.",
      400
    );
  }

  if (input.appId && input.organizationId) {
    await assertAppBelongsToOrganization(input.appId, input.organizationId);
  }

  const db = getDb();
  const id = generateId(ID_PREFIXES.apiKey);
  const { rawKey, prefix } = buildRawKey(input.kind, input.testMode ?? false);

  await db.insert(apiKeys).values({
    id,
    userId: input.userId,
    organizationId: input.organizationId ?? null,
    appId: input.appId ?? null,
    kind: input.kind,
    prefix,
    keyHash: hashApiKey(rawKey),
    testKey: null,
    testKeyEncrypted: input.testMode ? encryptTestApiKey(rawKey) : null,
    name: input.name ?? null,
  });

  const [created] = await db
    .select({
      id: apiKeys.id,
      kind: apiKeys.kind,
      prefix: apiKeys.prefix,
      name: apiKeys.name,
      organizationId: apiKeys.organizationId,
      appId: apiKeys.appId,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);

  return {
    ...created,
    key: rawKey,
  };
}

type RecoverableTestApiKeyRow = {
  id: string;
  testKey: string | null;
  testKeyEncrypted: string | null;
};

export async function readRecoverableTestApiKey(
  key: RecoverableTestApiKeyRow
): Promise<string | null> {
  if (key.testKeyEncrypted) {
    return decryptTestApiKey(key.testKeyEncrypted);
  }

  if (!key.testKey) {
    return null;
  }

  // Legacy plaintext rows cannot be encrypted in SQL because the root key is
  // available only at runtime. Migrate each row when setup status first reads it.
  const encrypted = encryptTestApiKey(key.testKey);
  const db = getDb();

  await db
    .update(apiKeys)
    .set({
      testKey: null,
      testKeyEncrypted: encrypted,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apiKeys.id, key.id),
        eq(apiKeys.testKey, key.testKey),
        isNull(apiKeys.testKeyEncrypted)
      )
    );

  return key.testKey;
}

export async function listApiKeys(userId: string, organizationId?: string) {
  const db = getDb();

  const conditions = [
    eq(apiKeys.userId, userId),
    isNull(apiKeys.revokedAt),
  ];

  if (organizationId) {
    conditions.push(eq(apiKeys.organizationId, organizationId));
  }

  return db
    .select({
      id: apiKeys.id,
      kind: apiKeys.kind,
      prefix: apiKeys.prefix,
      name: apiKeys.name,
      organizationId: apiKeys.organizationId,
      appId: apiKeys.appId,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(...conditions));
}

export async function revokeApiKey(userId: string, keyId: string) {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new AppError(
      "not_found",
      "api_key_not_found",
      "API key not found.",
      404
    );
  }

  if (existing.revokedAt) {
    throw new AppError(
      "conflict",
      "api_key_already_revoked",
      "API key is already revoked.",
      409
    );
  }

  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeys.id, keyId));

  return { id: keyId, revoked: true };
}

export async function findApiKeyByRawKey(rawKey: string) {
  const db = getDb();
  const keyHash = hashApiKey(rawKey);

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  return key ?? null;
}

export async function findApiKeyByRawKeyIncludingRevoked(rawKey: string) {
  const db = getDb();
  const keyHash = hashApiKey(rawKey);

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  return key ?? null;
}

export async function touchApiKeyLastUsed(keyId: string) {
  const db = getDb();
  const oneMinuteAgo = new Date(Date.now() - 60_000);

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, keyId),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, oneMinuteAgo))
      )
    );
}
