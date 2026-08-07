import { z } from "zod";
import { AppError } from "@/lib/errors";

export async function parseJsonBody<T extends z.ZodTypeAny>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (mediaType !== "application/json" && !mediaType?.endsWith("+json")) {
    throw new AppError(
      "invalid_request",
      "invalid_request_body",
      "Request body must be valid JSON.",
      400
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  }
  catch {
    throw new AppError(
      "invalid_request",
      "invalid_request_body",
      "Request body must be valid JSON.",
      400
    );
  }

  return schema.parse(body);
}

export function toIso(date: Date): string {
  return date.toISOString();
}
