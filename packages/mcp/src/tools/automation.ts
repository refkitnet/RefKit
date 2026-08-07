import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, type ListResponse } from "../api.js";
import { requireAppKeyAuth, requireSessionAuth } from "../auth.js";
import { runTool } from "./helpers.js";

const webhookEvent = z.enum([
  "affiliate.created",
  "affiliate.approved",
  "affiliate.disabled",
  "referral.created",
  "transaction.created",
  "transaction.refunded",
  "commission.created",
  "commission.reversed",
  "commission.paid",
  "payout.ready",
  "payout.succeeded",
  "payout.failed",
]);

export function registerAutomationTools(server: McpServer) {
  server.registerTool(
    "get_webhook",
    {
      description: "Get the outgoing webhook configured for an App.",
      inputSchema: { app_id: z.string().describe("App ID") },
    },
    async ({ app_id }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/apps/${app_id}/webhook`, { apiUrl, token });
    })
  );

  server.registerTool(
    "configure_webhook",
    {
      description: "Create or update the single outgoing webhook for an App.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        url: z.string().url().describe("HTTPS endpoint URL"),
        enabled_events: z.array(webhookEvent).describe("Event types to deliver"),
        enabled: z.boolean().optional().describe("Whether delivery is enabled"),
      },
    },
    async ({ app_id, url, enabled_events, enabled }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/apps/${app_id}/webhook`, {
        apiUrl,
        token,
        method: "PUT",
        body: { url, enabled_events, enabled: enabled ?? true },
      });
    })
  );

  server.registerTool(
    "test_webhook",
    {
      description: "Send one test delivery to an App webhook.",
      inputSchema: { app_id: z.string().describe("App ID") },
    },
    async ({ app_id }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/apps/${app_id}/webhook/test`, {
        apiUrl,
        token,
        method: "POST",
      });
    })
  );

  server.registerTool(
    "rotate_webhook_secret",
    {
      description: "Rotate an App webhook signing secret and reveal it once.",
      inputSchema: { app_id: z.string().describe("App ID") },
    },
    async ({ app_id }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/apps/${app_id}/webhook/rotate-secret`, {
        apiUrl,
        token,
        method: "POST",
      });
    })
  );

  server.registerTool(
    "list_webhook_deliveries",
    {
      description: "List recent best-effort webhook delivery attempts.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Page size"),
      },
    },
    async ({ app_id, limit }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<ListResponse<unknown>>(
        `/v1/apps/${app_id}/webhook/deliveries`,
        { apiUrl, token, query: { limit } }
      );
    })
  );

  server.registerTool(
    "remove_webhook",
    {
      description: "Remove the outgoing webhook from an App.",
      inputSchema: { app_id: z.string().describe("App ID") },
    },
    async ({ app_id }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/apps/${app_id}/webhook`, {
        apiUrl,
        token,
        method: "DELETE",
      });
    })
  );

  server.registerTool(
    "dispatch_payout_batch",
    {
      description: "Send a prepared payout batch to the configured payout system.",
      inputSchema: { payout_batch_id: z.string().describe("Payout batch ID") },
    },
    async ({ payout_batch_id }) => runTool(async () => {
      const { apiUrl, token } = requireSessionAuth();
      return apiRequest<unknown>(`/v1/payout-batches/${payout_batch_id}/dispatch`, {
        apiUrl,
        token,
        method: "POST",
      });
    })
  );

  server.registerTool(
    "get_payout_execution",
    {
      description: "Fetch payout instructions using REFKIT_API_KEY.",
      inputSchema: { execution_id: z.string().describe("Payout execution ID") },
    },
    async ({ execution_id }) => runTool(async () => {
      const { apiUrl, token } = requireAppKeyAuth();
      return apiRequest<unknown>(`/v1/payout-executions/${execution_id}`, {
        apiUrl,
        token,
      });
    })
  );

  server.registerTool(
    "report_payout_succeeded",
    {
      description: "Report successful payout execution using REFKIT_API_KEY.",
      inputSchema: {
        execution_id: z.string().describe("Payout execution ID"),
        idempotency_key: z.string().describe("Unique callback idempotency key"),
        external_reference: z
          .string()
          .optional()
          .describe("External payment reference"),
      },
    },
    async ({ execution_id, idempotency_key, external_reference }) => runTool(async () => {
      const { apiUrl, token } = requireAppKeyAuth();
      return apiRequest<unknown>(`/v1/payout-executions/${execution_id}/succeeded`, {
        apiUrl,
        token,
        method: "POST",
        headers: { "Idempotency-Key": idempotency_key },
        body: external_reference ? { external_reference } : {},
      });
    })
  );

  server.registerTool(
    "report_payout_failed",
    {
      description: "Report failed payout execution using REFKIT_API_KEY.",
      inputSchema: {
        execution_id: z.string().describe("Payout execution ID"),
        idempotency_key: z.string().describe("Unique callback idempotency key"),
        failure_reason: z.string().describe("Failure reason"),
        external_reference: z
          .string()
          .optional()
          .describe("External payment reference"),
      },
    },
    async ({
      execution_id,
      idempotency_key,
      failure_reason,
      external_reference,
    }) => runTool(async () => {
      const { apiUrl, token } = requireAppKeyAuth();
      return apiRequest<unknown>(`/v1/payout-executions/${execution_id}/failed`, {
        apiUrl,
        token,
        method: "POST",
        headers: { "Idempotency-Key": idempotency_key },
        body: {
          failure_reason,
          ...(external_reference ? { external_reference } : {}),
        },
      });
    })
  );
}
