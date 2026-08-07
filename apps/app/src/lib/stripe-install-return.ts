const ALLOWED_PREFIXES = ["/dashboard", "/dashboard/"];

export function normalizeStripeInstallReturnTo(value: string | null | undefined) {
  if (!value) {
    return "/dashboard";
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return "/dashboard";
  }

  if (!ALLOWED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return "/dashboard";
  }

  return trimmed;
}
