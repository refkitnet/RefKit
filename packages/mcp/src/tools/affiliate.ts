import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, type ListResponse } from "../api.js";
import { getCredentials, requireAffiliateAuth } from "../auth.js";
import { runTool } from "./helpers.js";

type AffiliateLink = {
  id: string;
  program_id?: string;
  link_code?: string;
  label?: string;
  tracking_url?: string;
  url?: string;
  destination_url?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  program_slug?: string;
};

type PayoutBalance = {
  amount: number;
  currency: string;
};

export function registerAffiliateTools(server: McpServer) {
  server.registerTool(
    "browse_refkit_network",
    {
      description:
        "Browse listed programs in the RefKit Network.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
        starting_after: z.string().optional().describe("App pagination cursor"),
      },
    },
    async ({ limit, starting_after }) => {
      return runTool(async () => {
        const { apiUrl } = getCredentials();
        return apiRequest<unknown>("/v1/network/apps", {
          apiUrl,
          query: { limit, starting_after },
        });
      });
    }
  );

  server.registerTool(
    "join_refkit_network_program",
    {
      description:
        "Join or request access to a listed program after accepting its current app agreement.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        app_agreement_version_id: z
          .string()
          .describe("Current app agreement version ID"),
        accepted_program_rules: z.literal(true).describe("Must be true"),
      },
    },
    async ({ program_id, app_agreement_version_id, accepted_program_rules }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();
        return apiRequest<unknown>(
          `/v1/affiliate/programs/${program_id}/join`,
          {
            apiUrl,
            token,
            method: "POST",
            body: { app_agreement_version_id, accepted_program_rules },
          }
        );
      });
    }
  );

  server.registerTool(
    "list_affiliate_links",
    {
      description:
        "List affiliate links for the authenticated affiliate. Requires affiliate key or session.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<ListResponse<AffiliateLink>>("/v1/affiliate-links", {
          apiUrl,
          token,
          query: {
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_program_affiliate_links",
    {
      description:
        "List affiliate links for the authenticated affiliate in a specific program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<ListResponse<AffiliateLink>>(
          `/v1/affiliate/programs/${program_id}/links`,
          {
            apiUrl,
            token,
          }
        );
      });
    }
  );

  server.registerTool(
    "create_program_affiliate_link",
    {
      description:
        "Create an affiliate link for the authenticated affiliate in a program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        label: z
          .string()
          .optional()
          .describe("Display label for the link (defaults to link code)"),
        link_code: z
          .string()
          .optional()
          .describe("Link code for ?via= (required if label omitted)"),
        destination_url: z
          .string()
          .optional()
          .describe("Optional destination URL override"),
        utm_source: z.string().optional().describe("UTM source"),
        utm_medium: z.string().optional().describe("UTM medium"),
        utm_campaign: z.string().optional().describe("UTM campaign"),
      },
    },
    async ({
      program_id,
      label,
      link_code,
      destination_url,
      utm_source,
      utm_medium,
      utm_campaign,
    }) => {
      return runTool(async () => {
        if (!label && !link_code) {
          throw new Error("Provide link_code or label.");
        }

        const { apiUrl, token } = requireAffiliateAuth();

        const body: Record<string, unknown> = {};

        if (label) {
          body.label = label;
        }

        if (link_code) {
          body.link_code = link_code;
        }

        if (destination_url) {
          body.destination_url = destination_url;
        }

        if (utm_source) {
          body.utm_source = utm_source;
        }

        if (utm_medium) {
          body.utm_medium = utm_medium;
        }

        if (utm_campaign) {
          body.utm_campaign = utm_campaign;
        }

        return apiRequest<AffiliateLink>(
          `/v1/affiliate/programs/${program_id}/links`,
          {
            apiUrl,
            token,
            method: "POST",
            body,
          }
        );
      });
    }
  );

  server.registerTool(
    "delete_program_affiliate_link",
    {
      description:
        "Delete an affiliate link for the authenticated affiliate. The default link cannot be removed. Links with recorded clicks cannot be removed.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        link_id: z.string().describe("Link ID"),
      },
    },
    async ({ program_id, link_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<AffiliateLink>(
          `/v1/affiliate/programs/${program_id}/links/${link_id}`,
          {
            apiUrl,
            token,
            method: "DELETE",
          }
        );
      });
    }
  );

  server.registerTool(
    "get_payout_balance",
    {
      description:
        "Get payable commission balance for an affiliate in a program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<PayoutBalance>("/v1/payout-balance", {
          apiUrl,
          token,
          query: {
            program_id,
          },
        });
      });
    }
  );

  server.registerTool(
    "request_payout",
    {
      description: "Submit a payout request for an affiliate program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<unknown>("/v1/payout-requests", {
          apiUrl,
          token,
          method: "POST",
          body: {
            program_id,
          },
        });
      });
    }
  );

  server.registerTool(
    "get_payout_details",
    {
      description:
        "Get saved payout details (PayPal or bank transfer) for an affiliate.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        method: z
          .enum(["paypal", "bank_transfer"])
          .optional()
          .describe("Payout method filter"),
      },
    },
    async ({ program_id, method }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireAffiliateAuth();

        return apiRequest<unknown>("/v1/payout-details", {
          apiUrl,
          token,
          query: {
            program_id,
            method,
          },
        });
      });
    }
  );
}
