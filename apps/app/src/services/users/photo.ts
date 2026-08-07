import { put } from "@vercel/blob";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  deleteStoredUserPhoto,
  isLogoStorageConfigured,
  pruneLocalUserPhotoFiles,
  putLocalUserPhoto,
  usesLocalLogoStorage,
} from "@/lib/logo-storage";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMeProfile } from "@/services/users/me";

const MAX_PHOTO_SIZE_BYTES = 1024 * 1024;

const PHOTO_EXTENSIONS = new Map([
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

async function validatePhoto(file: File) {
  const extension = PHOTO_EXTENSIONS.get(file.type);

  if (!extension) {
    throw new AppError(
      "invalid_request",
      "invalid_photo_type",
      "Photo must be a PNG, JPEG, or WebP image.",
      400
    );
  }

  if (file.size === 0 || file.size > MAX_PHOTO_SIZE_BYTES) {
    throw new AppError(
      "invalid_request",
      "invalid_photo_size",
      "Photo must be smaller than 1 MB.",
      400
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!hasExpectedSignature(file.type, bytes)) {
    throw new AppError(
      "invalid_request",
      "invalid_photo_file",
      "Photo file contents do not match its image type.",
      400
    );
  }

  return { bytes, extension };
}

async function storePhoto(
  userId: string,
  extension: string,
  bytes: Uint8Array,
  contentType: string
) {
  if (usesLocalLogoStorage()) {
    return putLocalUserPhoto(userId, extension, bytes);
  }

  const blob = await put(
    `user-photos/${userId}/photo.${extension}`,
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

async function pruneCurrentLocalUserPhoto(userId: string) {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`refkit:user-photo:${userId}`}, 0)
      )
    `);

    const [user] = await tx
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    await pruneLocalUserPhotoFiles(userId, user?.image ?? null);
  });
}

export async function uploadUserPhoto(
  userId: string,
  email: string | null,
  name: string | null,
  file: File
) {
  if (!isLogoStorageConfigured()) {
    throw new AppError(
      "internal",
      "photo_storage_not_configured",
      "Profile photo storage is not configured.",
      500
    );
  }

  await checkRateLimit(`upload-user-photo:${userId}`, 10);

  const { bytes, extension } = await validatePhoto(file);
  const db = getDb();
  let storedImageUrl: string | null = null;
  let replacement: { imageUrl: string; previousImage: string | null };

  try {
    replacement = await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`refkit:user-photo:${userId}`}, 0)
        )
      `);

      const [user] = await tx
        .select({ image: users.image })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(
          "not_found",
          "user_not_found",
          "User not found.",
          404
        );
      }

      const imageUrl = await storePhoto(userId, extension, bytes, file.type);
      storedImageUrl = imageUrl;

      const [updated] = await tx
        .update(users)
        .set({ image: imageUrl, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });

      if (!updated) {
        throw new AppError(
          "not_found",
          "user_not_found",
          "User not found.",
          404
        );
      }

      return { imageUrl, previousImage: user.image };
    });
  }
  catch (error) {
    if (storedImageUrl) {
      await deleteStoredUserPhoto(storedImageUrl).catch(() => undefined);
    }

    throw error;
  }

  if (usesLocalLogoStorage()) {
    await pruneCurrentLocalUserPhoto(userId);
  }
  else if (replacement.previousImage) {
    await deleteStoredUserPhoto(replacement.previousImage);
  }

  return getMeProfile(userId, email, name);
}

export async function removeUserPhoto(
  userId: string,
  email: string | null,
  name: string | null
) {
  const db = getDb();
  const previousImage = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`refkit:user-photo:${userId}`}, 0)
      )
    `);

    const [user] = await tx
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError(
        "not_found",
        "user_not_found",
        "User not found.",
        404
      );
    }

    await tx
      .update(users)
      .set({ image: null, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return user.image;
  });

  if (usesLocalLogoStorage()) {
    await pruneCurrentLocalUserPhoto(userId);
  }
  else if (previousImage) {
    await deleteStoredUserPhoto(previousImage);
  }

  return getMeProfile(userId, email, name);
}

export { MAX_PHOTO_SIZE_BYTES };
