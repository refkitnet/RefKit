import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { isSelfHosted } from "@/lib/deployment";
import { getServerEnv } from "@/lib/env";

const FILESYSTEM_UPLOADS_DIR = resolve(
  /* turbopackIgnore: true */
  process.env.UPLOADS_DIR ?? join(process.cwd(), ".local")
);
const LOCAL_LOGO_DIR = join(FILESYSTEM_UPLOADS_DIR, "app-logos");
const LOCAL_LOGO_URL_PREFIX = "/api/dev/app-logos/";
const LOCAL_USER_PHOTO_DIR = join(FILESYSTEM_UPLOADS_DIR, "user-photos");
const LOCAL_USER_PHOTO_URL_PREFIX = "/api/dev/user-photos/";

export function usesLocalLogoStorage() {
  if (isSelfHosted()) {
    return true;
  }

  try {
    const appHost = new URL(getServerEnv().APP_URL).hostname;

    return appHost === "localhost" || appHost === "127.0.0.1";
  }
  catch {
    return false;
  }
}

export function isLogoStorageConfigured() {
  return (
    usesLocalLogoStorage()
    || Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
  );
}

export function isLocalLogoUrl(logoUrl: string) {
  return isLocalStoredImageUrl(logoUrl, LOCAL_LOGO_URL_PREFIX);
}

export function isLocalUserPhotoUrl(photoUrl: string) {
  return isLocalStoredImageUrl(photoUrl, LOCAL_USER_PHOTO_URL_PREFIX);
}

function isLocalStoredImageUrl(imageUrl: string, urlPrefix: string) {
  try {
    const pathname = new URL(imageUrl).pathname;

    return pathname.startsWith(urlPrefix);
  }
  catch {
    return false;
  }
}

export function resolveLocalUserPhotoFilePath(userId: string, filename: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");

  if (!safeUserId || !safeFilename || safeFilename.includes("..")) {
    return null;
  }

  const filePath = normalize(join(LOCAL_USER_PHOTO_DIR, safeUserId, safeFilename));

  if (!filePath.startsWith(normalize(LOCAL_USER_PHOTO_DIR))) {
    return null;
  }

  return filePath;
}

export function resolveLocalLogoFilePath(appId: string, filename: string) {
  const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "");

  if (!safeAppId || !safeFilename || safeFilename.includes("..")) {
    return null;
  }

  const filePath = normalize(join(LOCAL_LOGO_DIR, safeAppId, safeFilename));

  if (!filePath.startsWith(normalize(LOCAL_LOGO_DIR))) {
    return null;
  }

  return filePath;
}

function localPathFromStoredImageUrl(imageUrl: string, urlPrefix: string) {
  try {
    const pathname = new URL(imageUrl).pathname;

    if (!pathname.startsWith(urlPrefix)) {
      return null;
    }

    const relativePath = pathname.slice(urlPrefix.length);
    const [entityId, ...filenameParts] = relativePath.split("/");
    const filename = filenameParts.join("/");

    if (!entityId || !filename) {
      return null;
    }

    if (urlPrefix === LOCAL_LOGO_URL_PREFIX) {
      return resolveLocalLogoFilePath(entityId, filename);
    }

    if (urlPrefix === LOCAL_USER_PHOTO_URL_PREFIX) {
      return resolveLocalUserPhotoFilePath(entityId, filename);
    }

    return null;
  }
  catch {
    return null;
  }
}

function localPathFromLogoUrl(logoUrl: string) {
  return localPathFromStoredImageUrl(logoUrl, LOCAL_LOGO_URL_PREFIX);
}

function localPathFromUserPhotoUrl(photoUrl: string) {
  return localPathFromStoredImageUrl(
    photoUrl,
    LOCAL_USER_PHOTO_URL_PREFIX
  );
}

async function pruneLocalImageFiles(
  directory: string,
  activeFilePath: string | null
) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  }
  catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const filePath = join(directory, entry.name);

        if (activeFilePath && normalize(filePath) === normalize(activeFilePath)) {
          return;
        }

        await unlink(filePath);
      })
  );
}

export async function pruneLocalUserPhotoFiles(
  userId: string,
  activePhotoUrl: string | null
) {
  if (!usesLocalLogoStorage()) {
    return;
  }

  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "");

  if (!safeUserId) {
    throw new Error("Invalid local user photo directory.");
  }

  await pruneLocalImageFiles(
    join(LOCAL_USER_PHOTO_DIR, safeUserId),
    activePhotoUrl ? localPathFromUserPhotoUrl(activePhotoUrl) : null
  );
}

export async function pruneLocalLogoFiles(
  appId: string,
  activeLogoUrl: string | null
) {
  if (!usesLocalLogoStorage()) {
    return;
  }

  const safeAppId = appId.replace(/[^a-zA-Z0-9_-]/g, "");

  if (!safeAppId) {
    throw new Error("Invalid local logo directory.");
  }

  await pruneLocalImageFiles(
    join(LOCAL_LOGO_DIR, safeAppId),
    activeLogoUrl ? localPathFromLogoUrl(activeLogoUrl) : null
  );
}

export async function putLocalUserPhoto(
  userId: string,
  extension: string,
  bytes: Uint8Array
) {
  const filename = `${randomUUID()}.${extension}`;
  const filePath = resolveLocalUserPhotoFilePath(userId, filename);

  if (!filePath) {
    throw new Error("Invalid local user photo path.");
  }

  await mkdir(join(LOCAL_USER_PHOTO_DIR, userId.replace(/[^a-zA-Z0-9_-]/g, "")), {
    recursive: true,
  });
  await writeFile(filePath, Buffer.from(bytes));

  return new URL(
    `${LOCAL_USER_PHOTO_URL_PREFIX}${userId}/${filename}`,
    getServerEnv().APP_URL
  ).toString();
}

export async function putLocalLogo(
  appId: string,
  extension: string,
  bytes: Uint8Array
) {
  const filename = `${randomUUID()}.${extension}`;
  const filePath = resolveLocalLogoFilePath(appId, filename);

  if (!filePath) {
    throw new Error("Invalid local logo path.");
  }

  await mkdir(join(LOCAL_LOGO_DIR, appId.replace(/[^a-zA-Z0-9_-]/g, "")), {
    recursive: true,
  });
  await writeFile(filePath, Buffer.from(bytes));

  return new URL(
    `${LOCAL_LOGO_URL_PREFIX}${appId}/${filename}`,
    getServerEnv().APP_URL
  ).toString();
}

export async function deleteStoredLogo(logoUrl: string) {
  await deleteStoredImage(logoUrl);
}

export async function deleteStoredUserPhoto(photoUrl: string) {
  await deleteStoredImage(photoUrl);
}

async function deleteStoredImage(imageUrl: string) {
  if (isLocalLogoUrl(imageUrl)) {
    const filePath = localPathFromLogoUrl(imageUrl);

    if (filePath) {
      await unlink(filePath).catch(() => undefined);
    }

    return;
  }

  if (isLocalUserPhotoUrl(imageUrl)) {
    const filePath = localPathFromUserPhotoUrl(imageUrl);

    if (filePath) {
      await unlink(filePath).catch(() => undefined);
    }

    return;
  }

  if (isSelfHosted()) {
    return;
  }

  const { del } = await import("@vercel/blob");
  await del(imageUrl).catch(() => undefined);
}

export {
  FILESYSTEM_UPLOADS_DIR,
  LOCAL_LOGO_DIR,
  LOCAL_LOGO_URL_PREFIX,
  LOCAL_USER_PHOTO_DIR,
  LOCAL_USER_PHOTO_URL_PREFIX,
};
