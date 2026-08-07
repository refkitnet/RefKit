import { SEED_USERS } from "@/db/seed/ids";
import {
  REFKIT_NETWORK_ACCESSIBLE,
  REFKIT_NETWORK_CLOSED_MESSAGE,
} from "@/lib/closed-beta";
import { AppError } from "@/lib/errors";
import {
  assertDeploymentCapability,
  isSelfHosted,
} from "@/lib/deployment";
import { isDevSignInEnabled } from "@/services/auth/dev-sign-in-env";

const seedEmails = new Set(
  Object.values(SEED_USERS).map((user) => user.email.toLowerCase())
);

export function isClosedBetaEnforced() {
  if (isSelfHosted()) {
    return false;
  }

  if (process.env.VITEST === "true") {
    return true;
  }

  return !isDevSignInEnabled();
}

export function assertRefKitNetworkAccessible() {
  assertDeploymentCapability("official_network");

  if (!REFKIT_NETWORK_ACCESSIBLE) {
    throw new AppError(
      "forbidden",
      "network_closed_beta",
      REFKIT_NETWORK_CLOSED_MESSAGE,
      403
    );
  }
}

export function isClosedBetaBypassEmail(email: string) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  const normalized = email.trim().toLowerCase();

  return (
    seedEmails.has(normalized)
    || normalized.endsWith("@refkit.local")
    || normalized.endsWith("@refkit-vitest.test")
  );
}
