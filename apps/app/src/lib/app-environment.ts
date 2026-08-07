import { AppError } from "@/lib/errors";

export type AppEnvironment = "test" | "live";

export function parseAppEnvironment(
  searchParams: URLSearchParams,
): AppEnvironment | undefined {
  const value = searchParams.get("environment");

  if (value === null) {
    return undefined;
  }

  if (value === "test" || value === "live") {
    return value;
  }

  throw new AppError(
    "invalid_request",
    "invalid_environment",
    "environment must be test or live.",
    400,
  );
}
