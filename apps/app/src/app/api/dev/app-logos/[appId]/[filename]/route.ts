import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { AppError, jsonError } from "@/lib/errors";
import {
  LOCAL_LOGO_DIR,
  resolveLocalLogoFilePath,
  usesLocalLogoStorage,
} from "@/lib/logo-storage";

const CONTENT_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ appId: string; filename: string }> }
) {
  try {
    if (!usesLocalLogoStorage()) {
      throw new AppError("not_found", "not_found", "Not found.", 404);
    }

    const { appId, filename } = await context.params;
    const filePath = resolveLocalLogoFilePath(appId, filename);

    if (!filePath || !filePath.startsWith(LOCAL_LOGO_DIR)) {
      throw new AppError("not_found", "not_found", "Logo not found.", 404);
    }

    const bytes = await readFile(filePath);
    const contentType =
      CONTENT_TYPES.get(extname(filename).toLowerCase()) ?? "application/octet-stream";

    return new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  }
  catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    if (
      error instanceof Error
      && "code" in error
      && (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return jsonError(
        new AppError("not_found", "not_found", "Logo not found.", 404)
      );
    }

    console.error(error);

    return jsonError(
      new AppError("internal", "logo_read_failed", "Could not read logo.", 500)
    );
  }
}
