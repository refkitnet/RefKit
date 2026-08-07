import {
  getDeploymentCapabilities,
  type DeploymentCapability,
} from "@/lib/deployment";

export const API_ENDPOINTS = [
  "GET /v1/admin/affiliates",
  "POST /v1/admin/affiliates/:id/disable",
  "GET /v1/admin/apps",
  "POST /v1/admin/apps/:id/integration-issue",
  "GET /v1/admin/audit-logs",
  "GET /v1/admin/clicks",
  "POST /v1/admin/commission-adjustments",
  "GET /v1/admin/commission-entries",
  "GET /v1/admin/customers",
  "POST /v1/admin/email-diagnostic",
  "GET /v1/admin/organization-members",
  "GET /v1/admin/organizations",
  "GET /v1/admin/payout-batches",
  "GET /v1/admin/payout-batches/:id/csv",
  "GET /v1/admin/payout-items",
  "GET /v1/admin/payout-requests",
  "GET /v1/admin/payout-runs (compatibility alias)",
  "GET /v1/admin/payout-runs/:id/csv (compatibility alias)",
  "GET /v1/admin/program-affiliates",
  "POST /v1/admin/program-affiliates/:id/disable",
  "GET /v1/admin/programs",
  "POST /v1/admin/programs/:id/disable",
  "GET /v1/admin/referrals",
  "GET /v1/admin/stripe-connections",
  "GET /v1/admin/stripe-events",
  "POST /v1/admin/stripe-events/:id/reprocess",
  "GET /v1/admin/transactions",
  "POST /v1/admin/users",
  "GET /v1/affiliate/data-export",
  "POST /v1/affiliate/delete-account",
  "POST /v1/affiliate/programs/:programId/join",
  "GET /v1/affiliate/programs/:programId/links",
  "POST /v1/affiliate/programs/:programId/links",
  "DELETE /v1/affiliate/programs/:programId/links/:linkId",
  "GET /v1/affiliate-links",
  "GET /v1/api-keys",
  "POST /v1/api-keys",
  "DELETE /v1/api-keys/:id",
  "GET /v1/apps",
  "POST /v1/apps",
  "GET /v1/apps/:id",
  "PATCH /v1/apps/:id",
  "GET /v1/apps/:id/agreement",
  "PATCH /v1/apps/:id/agreement",
  "DELETE /v1/apps/:id/logo",
  "POST /v1/apps/:id/logo",
  "GET /v1/apps/:id/overview",
  "GET /v1/apps/:id/setup-status",
  "DELETE /v1/apps/:id/webhook",
  "GET /v1/apps/:id/webhook",
  "PUT /v1/apps/:id/webhook",
  "GET /v1/apps/:id/webhook/deliveries",
  "POST /v1/apps/:id/webhook/rotate-secret",
  "POST /v1/apps/:id/webhook/test",
  "POST /v1/capture (public browser or App-scoped API key)",
  "GET /v1/clicks",
  "GET /v1/commissions",
  "POST /v1/commissions/:id/reject",
  "POST /v1/commissions/:id/release",
  "POST /v1/identify",
  "GET /v1/join/:programSlug",
  "POST /v1/join/:programSlug",
  "POST /v1/join/:programSlug/confirm",
  "GET /v1/me",
  "PATCH /v1/me",
  "DELETE /v1/me/photo",
  "POST /v1/me/photo",
  "POST /v1/managed-connections/provision",
  "DELETE /v1/managed-connections/:id",
  "POST /v1/managed-connections/:id/credentials/:ackId/acknowledge",
  "POST /v1/managed-connections/:id/credentials/rotate",
  "POST /v1/managed-connections/:id/reconnect",
  "POST /v1/managed-connections/:id/suspend",
  "POST /v1/managed-connections/:id/uninstall",
  "POST /v1/managed-data-subjects/export",
  "POST /v1/managed-data-subjects/redact",
  "GET /v1/network/apps",
  "GET /v1/network/programs (compatibility alias)",
  "GET /v1/organizations",
  "POST /v1/organizations",
  "GET /v1/payout-balance",
  "GET /v1/payout-batches",
  "POST /v1/payout-batches",
  "POST /v1/payout-batches/:id/affiliates/:programAffiliateId/mark-paid",
  "POST /v1/payout-batches/:id/cancel",
  "GET /v1/payout-batches/:id/csv",
  "POST /v1/payout-batches/:id/dispatch",
  "GET /v1/payout-batches/:id/items",
  "POST /v1/payout-batches/:id/items/:itemId/resolve",
  "POST /v1/payout-batches/:id/mark-paid",
  "GET /v1/payout-details",
  "PUT /v1/payout-details",
  "GET /v1/payout-executions/:executionId",
  "POST /v1/payout-executions/:executionId/failed",
  "POST /v1/payout-executions/:executionId/succeeded",
  "GET /v1/payout-requests",
  "POST /v1/payout-requests",
  "POST /v1/payout-requests/:id/decline",
  "GET /v1/program-affiliates",
  "POST /v1/program-affiliates",
  "POST /v1/program-affiliates/:id/approve",
  "POST /v1/program-affiliates/:id/disable",
  "POST /v1/program-affiliates/:id/enable",
  "GET /v1/program-affiliates/:id/links",
  "POST /v1/program-affiliates/:id/links",
  "PATCH /v1/program-affiliates/:id/links/:linkId",
  "DELETE /v1/program-affiliates/:id/links/:linkId",
  "GET /v1/programs",
  "POST /v1/programs",
  "GET /v1/programs/:id",
  "PATCH /v1/programs/:id",
  "POST /v1/programs/:id/acknowledge-disable",
  "POST /v1/programs/:id/disable",
  "GET /v1/programs/:id/overview",
  "POST /v1/programs/:id/pause",
  "POST /v1/programs/:id/resume",
  "GET /v1/programs/:id/terms",
  "POST /v1/programs/:id/terms",
  "GET /v1/ready-payouts",
  "POST /v1/ready-payouts/:programAffiliateId/mark-paid",
  "POST /v1/ready-payouts/csv",
  "GET /v1/referrals",
  "POST /v1/stripe/claim-pending-install",
  "POST /v1/stripe/connect-link",
  "POST /v1/stripe/disconnect",
  "POST /v1/support",
  "GET /v1/transactions",
  "POST /v1/transactions",
  "POST /v1/transactions/disputes",
  "POST /v1/transactions/refunds",
] as const;

function requiredCapability(
  endpoint: string
): DeploymentCapability | null {
  const path = endpoint.split(" ")[1] ?? "";

  if (path.startsWith("/v1/managed-")) {
    return "managed_connections";
  }

  if (path.startsWith("/v1/network/")) {
    return "official_network";
  }

  if (
    path.startsWith("/v1/stripe/")
    || path.startsWith("/v1/admin/stripe-")
  ) {
    return "managed_stripe";
  }

  if (path === "/v1/support") {
    return "refkit_support";
  }

  return null;
}

export function availableApiEndpoints() {
  const capabilities = getDeploymentCapabilities();

  return API_ENDPOINTS.filter((endpoint) => {
    const capability = requiredCapability(endpoint);
    return capability === null || capabilities[capability];
  });
}

export async function GET() {
  return Response.json({
    version: "v1",
    message: "RefKit REST API",
    endpoints: availableApiEndpoints(),
  });
}
