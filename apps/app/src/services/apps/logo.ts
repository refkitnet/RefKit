import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apps } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  deleteStoredLogo,
  isLogoStorageConfigured,
  pruneLocalLogoFiles,
  putLocalLogo,
  usesLocalLogoStorage,
} from "@/lib/logo-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAppAccess } from "@/services/scoping";

const MAX_LOGO_SIZE_BYTES = 1024 * 1024;

const LOGO_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function hasExpectedSignature(contentType: string, bytes: Uint8Array) {
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }

  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }

  return false;
}

async function validateLogo(file: File) {
  const extension = LOGO_EXTENSIONS.get(file.type);

  if (!extension) {
    throw new AppError(
      "invalid_request",
      "invalid_logo_type",
      "Logo must be a PNG, JPEG, or WebP image.",
      400
    );
  }

  if (file.size === 0 || file.size > MAX_LOGO_SIZE_BYTES) {
    throw new AppError(
      "invalid_request",
      "invalid_logo_size",
      "Logo must be smaller than 1 MB.",
      400
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasExpectedSignature(file.type, bytes)) {
    throw new AppError(
      "invalid_request",
      "invalid_logo_file",
      "Logo file contents do not match its image type.",
      400
    );
  }

  return { bytes, extension };
}

async function storeLogo(
  appId: string,
  extension: string,
  bytes: Uint8Array,
  contentType: string
) {
  if (usesLocalLogoStorage()) {
    return putLocalLogo(appId, extension, bytes);
  }

  const blob = await put(
    `app-logos/${appId}/logo.${extension}`,
    Buffer.from(bytes),
    {
      access: "public",
      addRandomSuffix: true,
      contentType,
      cacheControlMaxAge: 31536000,
    }
  );

  return blob.url;
}

async function pruneCurrentLocalAppLogo(appId: string) {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`refkit:app-logo:${appId}`}, 0)
      )
    `);

    const [app] = await tx
      .select({ logoUrl: apps.logoUrl })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1);

    await pruneLocalLogoFiles(appId, app?.logoUrl ?? null);
  });
}

export async function uploadAppLogo(
  userId: string,
  appId: string,
  file: File
) {
  await requireAppAccess(userId, appId);

  if (!isLogoStorageConfigured()) {
    throw new AppError(
      "internal",
      "logo_storage_not_configured",
      "App logo storage is not configured.",
      500
    );
  }

  await checkRateLimit(`upload-app-logo:${appId}`, 10);

  const { bytes, extension } = await validateLogo(file);
  const db = getDb();
  let storedLogoUrl: string | null = null;
  let replacement: {
    logoUrl: string;
    previousLogoUrl: string | null;
    updated: typeof apps.$inferSelect;
  };

  try {
    replacement = await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`refkit:app-logo:${appId}`}, 0)
        )
      `);

      const [currentApp] = await tx
        .select({ logoUrl: apps.logoUrl })
        .from(apps)
        .where(eq(apps.id, appId))
        .limit(1);

      if (!currentApp) {
        throw new AppError("not_found", "app_not_found", "App not found.", 404);
      }

      const logoUrl = await storeLogo(appId, extension, bytes, file.type);
      storedLogoUrl = logoUrl;

      const [updated] = await tx
        .update(apps)
        .set({ logoUrl, updatedAt: new Date() })
        .where(eq(apps.id, appId))
        .returning();

      if (!updated) {
        throw new AppError("not_found", "app_not_found", "App not found.", 404);
      }

      return { logoUrl, previousLogoUrl: currentApp.logoUrl, updated };
    });
  }
  catch (error) {
    if (storedLogoUrl) {
      await deleteStoredLogo(storedLogoUrl).catch(() => undefined);
    }

    throw error;
  }

  if (usesLocalLogoStorage()) {
    await pruneCurrentLocalAppLogo(appId);
  }
  else if (replacement.previousLogoUrl) {
    await deleteStoredLogo(replacement.previousLogoUrl);
  }

  return replacement.updated;
}

export async function removeAppLogo(userId: string, appId: string) {
  await requireAppAccess(userId, appId);
  const db = getDb();
  const removed = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`refkit:app-logo:${appId}`}, 0)
      )
    `);

    const [currentApp] = await tx
      .select({ logoUrl: apps.logoUrl, networkVisible: apps.networkVisible })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1);

    if (!currentApp) {
      throw new AppError("not_found", "app_not_found", "App not found.", 404);
    }

    if (currentApp.networkVisible) {
      throw new AppError(
        "conflict",
        "app_logo_in_use",
        "Hide the app from the RefKit Network before removing its logo.",
        409
      );
    }

    const [updated] = await tx
      .update(apps)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(apps.id, appId))
      .returning();

    return { previousLogoUrl: currentApp.logoUrl, updated };
  });

  if (usesLocalLogoStorage()) {
    await pruneCurrentLocalAppLogo(appId);
  }
  else if (removed.previousLogoUrl) {
    await deleteStoredLogo(removed.previousLogoUrl);
  }

  return removed.updated;
}

export { MAX_LOGO_SIZE_BYTES };
