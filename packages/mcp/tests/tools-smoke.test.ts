import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTools } from "../src/tools/register.js";

const EXPECTED_TOOL_NAMES = [
  // integration
  "get_auth_status",
  "get_help",
  "get_setup_status",
  "create_stripe_connect_link",
  "disconnect_stripe",
  "list_api_keys",
  "create_api_key",
  "revoke_api_key",
  // provider-neutral revenue
  "report_payment",
  "report_refund",
  "report_dispute",
  // owner
  "list_organizations",
  "create_organization",
  "list_apps",
  "get_app",
  "create_app",
  "update_app",
  "list_programs",
  "get_program",
  "update_program",
  "get_program_overview",
  "create_program",
  "publish_program_terms",
  "publish_app_agreement",
  "pause_program",
  "resume_program",
  "list_affiliates",
  "create_affiliate",
  "approve_affiliate",
  "list_clicks",
  "list_referrals",
  "list_transactions",
  "list_commissions",
  "reject_commission",
  "release_commission",
  "create_payout_run",
  "list_payout_runs",
  "get_payout_run_items",
  "list_ready_payouts",
  "mark_affiliate_payout_paid",
  "mark_payout_run_paid",
  "resolve_payout_item",
  "list_owned_affiliate_links",
  "create_owned_affiliate_link",
  "update_owned_affiliate_link",
  "delete_owned_affiliate_link",
  // automation
  "get_webhook",
  "configure_webhook",
  "test_webhook",
  "rotate_webhook_secret",
  "list_webhook_deliveries",
  "remove_webhook",
  "dispatch_payout_batch",
  "get_payout_execution",
  "report_payout_succeeded",
  "report_payout_failed",
  // affiliate
  "browse_refkit_network",
  "join_refkit_network_program",
  "list_affiliate_links",
  "list_program_affiliate_links",
  "create_program_affiliate_link",
  "delete_program_affiliate_link",
  "get_payout_balance",
  "request_payout",
  "get_payout_details",
];

type Registration = {
  name: string;
  config: {
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  handler: unknown;
};

function captureRegistrations() {
  const registered: Registration[] = [];
  const server = {
    registerTool(
      name: string,
      config: Registration["config"],
      handler: unknown
    ) {
      registered.push({ name, config, handler });
    },
  } as unknown as McpServer;

  registerTools(server);

  return registered;
}

describe("refkit MCP tool surface", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.REFKIT_API_KEY;
    delete process.env.REFKIT_API_URL;
  });

  it("registers exactly the expected tool set", () => {
    const registered = captureRegistrations();
    const names = registered.map((tool) => tool.name);

    expect([...names].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every tool a description and a handler", () => {
    for (const tool of captureRegistrations()) {
      expect(tool.config.description, tool.name).toBeTruthy();
      expect(typeof tool.handler, tool.name).toBe("function");
    }
  });

  it("describes every input schema field", () => {
    for (const tool of captureRegistrations()) {
      for (const [field, schema] of Object.entries(
        tool.config.inputSchema ?? {}
      )) {
        const description = (schema as { description?: string }).description;
        expect(description, `${tool.name}.${field}`).toBeTruthy();
      }
    }
  });

  it("does not return RefKit Cloud help links for a custom API origin", async () => {
    const previousApiUrl = process.env.REFKIT_API_URL;
    process.env.REFKIT_API_URL = "https://refkit.internal.example";

    try {
      const getHelp = captureRegistrations().find(
        (tool) => tool.name === "get_help"
      );
      const result = await (getHelp?.handler as (input: {
        topic: string;
      }) => Promise<{ content: Array<{ text: string }> }>)({
        topic: "api_revenue",
      });
      const payload = JSON.parse(result.content[0].text) as {
        url: string | null;
        guidance: string;
      };

      expect(payload.url).toBeNull();
      expect(payload.guidance).toContain("Self-Hosted instance operator");
      expect(result.content[0].text).not.toContain("refkit.gitbook.io");
    }
    finally {
      if (previousApiUrl === undefined) {
        delete process.env.REFKIT_API_URL;
      }
      else {
        process.env.REFKIT_API_URL = previousApiUrl;
      }
    }
  });

  it.each([
    {
      name: "report_payment",
      path: "/v1/transactions",
      input: {
        payment_id: "pay_123",
        customer_id: "rcus_123",
        program_id: "prg_123",
        amount: 1200,
        currency: "usd",
      },
    },
    {
      name: "report_refund",
      path: "/v1/transactions/refunds",
      input: {
        refund_id: "refund_123",
        payment_id: "pay_123",
        amount: 300,
      },
    },
    {
      name: "report_dispute",
      path: "/v1/transactions/disputes",
      input: {
        dispute_id: "dispute_123",
        payment_id: "pay_123",
        status: "opened",
        amount: 400,
      },
    },
  ])("sends $name to the configured instance", async ({ name, path, input }) => {
    process.env.REFKIT_API_URL = "https://refkit.internal.example";
    process.env.REFKIT_API_KEY = "rk_test_app_example";
    const fetchMock = vi.fn(
      async (_url: URL | string, _request?: RequestInit) => new Response(
        JSON.stringify({ accepted: true }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const registration = captureRegistrations().find(
      (tool) => tool.name === name
    );

    const result = await (registration?.handler as (
      values: Record<string, unknown>
    ) => Promise<{ isError?: boolean }>)(input);
    const [url, request] = fetchMock.mock.calls[0]!;

    expect(result.isError).not.toBe(true);
    expect(String(url)).toBe(`https://refkit.internal.example${path}`);
    expect(request).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer rk_test_app_example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
  });
});
