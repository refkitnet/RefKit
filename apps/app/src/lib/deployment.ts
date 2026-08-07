import { AppError } from "@/lib/errors";

export const DEPLOYMENT_EDITIONS = ["cloud", "self-hosted"] as const;

export type DeploymentEdition = (typeof DEPLOYMENT_EDITIONS)[number];

export type DeploymentCapability =
  | "cloud_billing"
  | "managed_connections"
  | "managed_stripe"
  | "official_network"
  | "refkit_support";

export type DeploymentCapabilities = {
  cloud_billing: boolean;
  filesystem_uploads: boolean;
  managed_connections: boolean;
  managed_stripe: boolean;
  official_network: boolean;
  refkit_support: boolean;
};

export function getDeploymentEdition(
  environment: NodeJS.ProcessEnv = process.env
): DeploymentEdition {
  const value = environment.REFKIT_EDITION?.trim() || "cloud";

  if (value !== "cloud" && value !== "self-hosted") {
    throw new Error(
      "REFKIT_EDITION must be either cloud or self-hosted."
    );
  }

  return value;
}

export function isSelfHosted(
  environment: NodeJS.ProcessEnv = process.env
) {
  return getDeploymentEdition(environment) === "self-hosted";
}

export function getDeploymentCapabilities(
  edition = getDeploymentEdition()
): DeploymentCapabilities {
  const cloud = edition === "cloud";

  return {
    cloud_billing: cloud,
    filesystem_uploads: !cloud,
    managed_connections: cloud,
    managed_stripe: cloud,
    official_network: cloud,
    refkit_support: cloud,
  };
}

export function assertDeploymentCapability(
  capability: DeploymentCapability
) {
  if (getDeploymentCapabilities()[capability]) {
    return;
  }

  throw new AppError(
    "not_found",
    "capability_unavailable",
    "This capability is not available in this RefKit edition.",
    404
  );
}

export function deploymentCapabilityUnavailableResponse() {
  return Response.json(
    {
      error: {
        type: "not_found",
        code: "capability_unavailable",
        message: "This capability is not available in this RefKit edition.",
      },
    },
    { status: 404 }
  );
}
