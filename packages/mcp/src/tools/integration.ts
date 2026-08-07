import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest } from "../api.js";
import { DEFAULT_API_URL } from "../config.js";
import {
  getCredentials,
  requireSessionAuth,
} from "../auth.js";
import { runTool } from "./helpers.js";

type MeResponse = {
  id: string;
  email: string;
  name: string | null;
};

type SetupStatus = {
  revenue_source: "stripe" | "api";
  program_launched: boolean;
  api_key_created: boolean;
  first_click: boolean;
  first_identify: boolean;
  stripe_connected: boolean;
  first_stripe_event: boolean;
  first_revenue_event: boolean;
  first_commission: boolean;
  unattributed_revenue_alarm: boolean;
  test_api_key_created: boolean;
  test_api_key: string | null;
  test_api_key_used: boolean;
  test_affiliate_created: boolean;
  test_first_click: boolean;
  test_first_identify: boolean;
  test_stripe_connected: boolean;
  test_first_revenue_event: boolean;
  test_first_commission: boolean;
  test_integration_complete: boolean;
  live_api_key_created: boolean;
  live_api_key_used: boolean;
  live_stripe_connected: boolean;
  production_website_ready: boolean;
  production_ready: boolean;
};

type ConnectLinkResponse = {
  mode: string;
  url: string | null;
  message?: string;
};

const DOCS_URL = "https://refkit.gitbook.io/docs";
const helpTopics = {
  overview: {
    title: "RefKit Help Center",
    url: DOCS_URL,
  },
  developer_start: {
    title: "Launch your first Program",
    url: `${DOCS_URL}/getting-started/launch-program`,
  },
  affiliate_start: {
    title: "Affiliate quickstart",
    url: `${DOCS_URL}/getting-started/affiliate-quickstart`,
  },
  manual_setup: {
    title: "Manual setup",
    url: `${DOCS_URL}/integrate-refkit/manual-setup`,
  },
  coding_agent_setup: {
    title: "Set up with a coding agent",
    url: `${DOCS_URL}/integrate-refkit/ai-coding-agent`,
  },
  stripe: {
    title: "Connect Stripe",
    url: `${DOCS_URL}/integrate-refkit/stripe`,
  },
  api_revenue: {
    title: "Report revenue with the API",
    url: `${DOCS_URL}/integrate-refkit/api-revenue`,
  },
  testing: {
    title: "Test and go live",
    url: `${DOCS_URL}/integrate-refkit/test-and-go-live`,
  },
  troubleshooting: {
    title: "Troubleshooting",
    url: `${DOCS_URL}/integrate-refkit/troubleshooting`,
  },
  programs: {
    title: "Programs, affiliates, and links",
    url: `${DOCS_URL}/run-your-program/programs-affiliates-links`,
  },
  payouts: {
    title: "Commissions and payouts",
    url: `${DOCS_URL}/run-your-program/commissions-payouts`,
  },
  api_reference: {
    title: "REST API",
    url: `${DOCS_URL}/reference/rest-api`,
  },
  tools: {
    title: "SDK, CLI, and MCP",
    url: `${DOCS_URL}/reference/sdk-cli-mcp`,
  },
} as const;

const helpTopicSchema = z.enum([
  "overview",
  "developer_start",
  "affiliate_start",
  "manual_setup",
  "coding_agent_setup",
  "stripe",
  "api_revenue",
  "testing",
  "troubleshooting",
  "programs",
  "payouts",
  "api_reference",
  "tools",
]);

export function registerIntegrationTools(server: McpServer) {
  server.registerTool(
    "get_auth_status",
    {
      description:
        "Check RefKit authentication status and how to log in. Use before other tools if auth may be missing.",
    },
    async () => {
      return runTool(async () => {
        const credentials = getCredentials();
        const status: Record<string, unknown> = {
          api_url: credentials.apiUrl,
          session_token_configured: Boolean(credentials.sessionToken),
          affiliate_key_configured: Boolean(credentials.affiliateKey),
          config_path: "~/.refkitnet/config.json",
          login_command: "npx refkitnet auth login",
        };

        if (credentials.sessionToken) {
          try {
            const me = await apiRequest<MeResponse>("/v1/me", {
              apiUrl: credentials.apiUrl,
              token: credentials.sessionToken,
            });

            status.authenticated_user = {
              id: me.id,
              email: me.email,
              name: me.name,
            };
          }
          catch (error) {
            status.session_token_valid = false;
            status.session_error =
              error instanceof Error ? error.message : "Invalid session token.";
          }
        }

        return status;
      });
    }
  );

  server.registerTool(
    "get_help",
    {
      description:
        "Get documentation guidance for a user question. Cloud returns its Help Center page; a custom API origin returns operator-documentation guidance without a RefKit Cloud URL.",
      inputSchema: {
        topic: helpTopicSchema
          .optional()
          .describe("Closest help topic. Defaults to the Help Center home page."),
      },
    },
    async ({ topic }) => {
      return runTool(async () => {
        const selectedTopic = topic ?? "overview";
        const page = helpTopics[selectedTopic];
        const { apiUrl } = getCredentials();

        if (apiUrl !== DEFAULT_API_URL) {
          return {
            topic: selectedTopic,
            title: page.title,
            url: null,
            guidance:
              "Use the documentation provided by this Self-Hosted instance operator. RefKit Cloud documentation is not used for a custom API origin.",
          };
        }

        return {
          topic: selectedTopic,
          title: page.title,
          url: page.url,
        };
      });
    }
  );

  server.registerTool(
    "get_setup_status",
    {
      description:
        "Get mode-aware app setup status for test integration and production readiness.",
      inputSchema: {
        app_id: z.string().describe("RefKit app ID"),
      },
    },
    async ({ app_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<SetupStatus>(`/v1/apps/${app_id}/setup-status`, {
          apiUrl,
          token,
        });
      });
    }
  );

  server.registerTool(
    "create_stripe_connect_link",
    {
      description:
        "Create a Stripe App install URL for an app. Returns a URL to open in the browser.",
      inputSchema: {
        app_id: z.string().describe("RefKit app ID"),
      },
    },
    async ({ app_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ConnectLinkResponse>("/v1/stripe/connect-link", {
          apiUrl,
          token,
          method: "POST",
          body: {
            app_id,
          },
        });
      });
    }
  );

  server.registerTool(
    "disconnect_stripe",
    {
      description:
        "Disconnect a Stripe connection for an app. Use before switching revenue_source to api when live Stripe is connected.",
      inputSchema: {
        app_id: z.string().describe("RefKit app ID"),
        livemode: z
          .boolean()
          .optional()
          .describe("Disconnect live (true, default) or test (false) Stripe"),
      },
    },
    async ({ app_id, livemode }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<{
          connection: {
            id: string;
            stripe_account_id: string;
            livemode: boolean;
            status: string;
          };
        }>("/v1/stripe/disconnect", {
          apiUrl,
          token,
          method: "POST",
          body: {
            app_id,
            ...(livemode === undefined ? {} : { livemode }),
          },
        });
      });
    }
  );

  server.registerTool(
    "list_api_keys",
    {
      description: "List API keys for the authenticated user's organization.",
      inputSchema: {
        organization_id: z
          .string()
          .optional()
          .describe("Filter by organization ID"),
      },
    },
    async ({ organization_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<{ data: unknown[] }>("/v1/api-keys", {
          apiUrl,
          token,
          query: {
            organization_id,
          },
        });
      });
    }
  );

  server.registerTool(
    "create_api_key",
    {
      description:
        "Create an API key. Prefer test_mode=true while integrating and create a live app key only for production. The raw key is returned once.",
      inputSchema: {
        kind: z.enum(["app", "affiliate"]).describe("Key kind"),
        organization_id: z.string().optional().describe("Organization ID"),
        app_id: z.string().optional().describe("App ID for app keys"),
        name: z.string().optional().describe("Optional key label"),
        test_mode: z
          .boolean()
          .optional()
          .describe("Create a test-mode app key"),
      },
    },
    async ({ kind, organization_id, app_id, name, test_mode }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>("/v1/api-keys", {
          apiUrl,
          token,
          method: "POST",
          body: {
            kind,
            organization_id,
            app_id,
            name,
            test_mode,
          },
        });
      });
    }
  );

  server.registerTool(
    "revoke_api_key",
    {
      description: "Revoke an API key by ID.",
      inputSchema: {
        key_id: z.string().describe("API key ID"),
      },
    },
    async ({ key_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/api-keys/${key_id}`, {
          apiUrl,
          token,
          method: "DELETE",
        });
      });
    }
  );
}
