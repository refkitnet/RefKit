import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../api.js";
import { requireAppKeyAuth } from "../auth.js";
import { runTool } from "./helpers.js";

const minorAmount = z.number().int().min(0).max(2_147_483_647);
const positiveMinorAmount = minorAmount.positive();

export function registerRevenueTools(server: McpServer) {
  server.registerTool(
    "report_payment",
    {
      description:
        "Report one successful payment or renewal to an API-reporting App. Stable IDs make exact retries safe.",
      inputSchema: {
        payment_id: z.string().describe("Stable payment or invoice ID"),
        customer_id: z.string().describe("RefKit Customer ID from identify"),
        program_id: z.string().describe("RefKit Program ID"),
        amount: minorAmount.describe("Amount in integer minor units, including zero"),
        currency: z.string().length(3).describe("Three-letter currency code"),
        paid_at: z.string().datetime().optional().describe("Payment time in ISO 8601"),
      },
    },
    async ({ payment_id, customer_id, program_id, amount, currency, paid_at }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAppKeyAuth();

        return apiRequest<unknown>("/v1/transactions", {
          apiUrl,
          token,
          method: "POST",
          body: {
            payment_id,
            customer_id,
            program_id,
            amount,
            currency,
            paid_at,
          },
        });
      });
    }
  );

  server.registerTool(
    "report_refund",
    {
      description:
        "Report one completed refund for an existing API-reported payment.",
      inputSchema: {
        refund_id: z.string().describe("Stable refund ID"),
        payment_id: z.string().describe("Stable parent payment ID"),
        amount: positiveMinorAmount.describe("Refund amount in integer minor units"),
        refunded_at: z.string().datetime().optional().describe("Refund time in ISO 8601"),
      },
    },
    async ({ refund_id, payment_id, amount, refunded_at }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAppKeyAuth();

        return apiRequest<unknown>("/v1/transactions/refunds", {
          apiUrl,
          token,
          method: "POST",
          body: { refund_id, payment_id, amount, refunded_at },
        });
      });
    }
  );

  server.registerTool(
    "report_dispute",
    {
      description:
        "Report an opened, resolved, lost, or reinstated dispute for an existing API-reported payment.",
      inputSchema: {
        dispute_id: z.string().describe("Stable dispute ID"),
        payment_id: z.string().describe("Stable parent payment ID"),
        status: z
          .enum(["opened", "won", "withdrawn", "lost", "funds_reinstated"])
          .describe("Current provider-neutral dispute status"),
        amount: positiveMinorAmount.describe("Disputed amount in integer minor units"),
        occurred_at: z.string().datetime().optional().describe("Event time in ISO 8601"),
      },
    },
    async ({ dispute_id, payment_id, status, amount, occurred_at }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAppKeyAuth();

        return apiRequest<unknown>("/v1/transactions/disputes", {
          apiUrl,
          token,
          method: "POST",
          body: { dispute_id, payment_id, status, amount, occurred_at },
        });
      });
    }
  );
}
