import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  assertCommissionRule,
  normalizeWebsiteUrl,
} from "@refkitnet/validation";
import { z } from "zod";
import { apiRequest, type ListResponse } from "../api.js";
import { requireSessionAuth } from "../auth.js";
import { runTool } from "./helpers.js";

type AppRecord = {
  id: string;
  website_url: string | null;
};

export function registerOwnerTools(server: McpServer) {
  server.registerTool(
    "list_organizations",
    {
      description: "List organizations for the authenticated user.",
    },
    async () => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<{ data: unknown[] }>("/v1/organizations", {
          apiUrl,
          token,
        });
      });
    }
  );

  server.registerTool(
    "create_organization",
    {
      description: "Create a new organization.",
      inputSchema: {
        name: z.string().describe("Organization name"),
      },
    },
    async ({ name }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>("/v1/organizations", {
          apiUrl,
          token,
          method: "POST",
          body: {
            name,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_apps",
    {
      description: "List apps for an organization.",
      inputSchema: {
        organization_id: z.string().describe("Organization ID"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ organization_id, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/apps", {
          apiUrl,
          token,
          query: {
            organization_id,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "get_app",
    {
      description: "Get an app by ID.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
      },
    },
    async ({ app_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/apps/${app_id}`, {
          apiUrl,
          token,
        });
      });
    }
  );

  server.registerTool(
    "create_app",
    {
      description: "Create a new app in an organization.",
      inputSchema: {
        organization_id: z.string().describe("Organization ID"),
        name: z.string().describe("App name"),
        destination_url: z
          .string()
          .optional()
          .describe("Website URL for affiliate links"),
      },
    },
    async ({ organization_id, name, destination_url }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        const body: Record<string, unknown> = {
          organization_id,
          name,
        };

        if (destination_url) {
          body.website_url = normalizeWebsiteUrl(destination_url);
        }

        return apiRequest<unknown>("/v1/apps", {
          apiUrl,
          token,
          method: "POST",
          body,
        });
      });
    }
  );

  server.registerTool(
    "update_app",
    {
      description:
        "Update an app's default program or RefKit Network visibility.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        default_program_id: z
          .string()
          .optional()
          .describe("Program to use as the app default"),
        network_visible: z
          .boolean()
          .optional()
          .describe("Show or hide the app in the RefKit Network"),
      },
    },
    async ({ app_id, default_program_id, network_visible }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/apps/${app_id}`, {
          apiUrl,
          token,
          method: "PATCH",
          body: {
            default_program_id,
            network_visible,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_programs",
    {
      description: "List affiliate programs for an app.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ app_id, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/programs", {
          apiUrl,
          token,
          query: {
            app_id,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "get_program",
    {
      description: "Get a program by ID.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/programs/${program_id}`, {
          apiUrl,
          token,
        });
      });
    }
  );

  server.registerTool(
    "update_program",
    {
      description:
        "Update program settings: name, join page, minimum payout, and payout methods.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        name: z.string().optional().describe("Program name"),
        join_page_enabled: z
          .boolean()
          .optional()
          .describe("Enable or disable the hosted join page"),
        join_page_approval: z
          .enum(["active", "pending"])
          .optional()
          .describe("Join approval mode"),
        minimum_payout_amount: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Minimum payout amount in cents"),
        supported_payout_methods: z
          .array(z.enum(["paypal", "bank_transfer"]))
          .optional()
          .describe("Supported payout methods"),
      },
    },
    async ({
      program_id,
      name,
      join_page_enabled,
      join_page_approval,
      minimum_payout_amount,
      supported_payout_methods,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/programs/${program_id}`, {
          apiUrl,
          token,
          method: "PATCH",
          body: {
            name,
            join_page_enabled,
            join_page_approval,
            minimum_payout_amount,
            supported_payout_methods,
          },
        });
      });
    }
  );

  server.registerTool(
    "get_program_overview",
    {
      description: "Get program stats overview.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return isolated test or live activity (defaults to live)"),
      },
    },
    async ({ program_id, environment }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/programs/${program_id}/overview`, {
          apiUrl,
          token,
          query: { environment },
        });
      });
    }
  );

  server.registerTool(
    "create_program",
    {
      description:
        "Create an affiliate program for an app. Set recurring_duration_months to a positive integer for a limited window, or null for lifetime commissions.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        name: z.string().describe("Program name"),
        slug: z.string().describe("Program slug"),
        currency: z.string().describe("Currency code, e.g. usd"),
        destination_url: z
          .string()
          .optional()
          .describe("Website URL for affiliate links (defaults to app website URL)"),
        reward_type: z.enum(["percent", "fixed"]).describe("Commission type"),
        percent_value: z
          .number()
          .optional()
          .describe("Percent value when reward_type is percent"),
        fixed_amount: z
          .number()
          .optional()
          .describe("Fixed amount in cents when reward_type is fixed"),
        recurring_duration_months: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe(
            "Months of recurring commissions after first paid transaction; null for lifetime (default)"
          ),
      },
    },
    async ({
      app_id,
      name,
      slug,
      currency,
      destination_url,
      reward_type,
      percent_value,
      fixed_amount,
      recurring_duration_months,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        const recurringDurationMonths =
          recurring_duration_months === undefined
            ? null
            : recurring_duration_months;

        assertCommissionRule({
          rewardType: reward_type,
          percentValue: percent_value,
          fixedAmount: fixed_amount,
          recurringDurationMonths,
        });

        const app = await apiRequest<AppRecord>(`/v1/apps/${app_id}`, {
          apiUrl,
          token,
        });
        let websiteUrl = app.website_url;

        if (destination_url) {
          const normalizedDestinationUrl = normalizeWebsiteUrl(destination_url);

          if (!websiteUrl) {
            await apiRequest(`/v1/apps/${app_id}`, {
              apiUrl,
              token,
              method: "PATCH",
              body: {
                website_url: normalizedDestinationUrl,
              },
            });
            websiteUrl = normalizedDestinationUrl;
          }
          else if (normalizedDestinationUrl !== websiteUrl) {
            throw new Error(
              `Program destination URL must match the app website URL (${websiteUrl}).`
            );
          }
        }

        if (!websiteUrl) {
          throw new Error(
            "Set a website URL on the app before creating a program."
          );
        }

        const commissionRule: Record<string, unknown> = {
          reward_type,
          recurring_duration_months: recurringDurationMonths,
        };

        if (reward_type === "percent") {
          commissionRule.percent_value = percent_value;
        }
        else {
          commissionRule.fixed_amount = fixed_amount;
        }

        return apiRequest<unknown>("/v1/programs", {
          apiUrl,
          token,
          method: "POST",
          body: {
            app_id,
            name,
            slug,
            currency,
            destination_url: websiteUrl,
            commission_rule: commissionRule,
          },
        });
      });
    }
  );

  server.registerTool(
    "publish_program_terms",
    {
      description:
        "Publish a new program terms version with an updated commission rule.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        reward_type: z.enum(["percent", "fixed"]).describe("Commission type"),
        percent_value: z
          .number()
          .optional()
          .describe("Percent value when reward_type is percent"),
        fixed_amount: z
          .number()
          .optional()
          .describe("Fixed amount in cents when reward_type is fixed"),
        recurring_duration_months: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe("Recurring window in months; null for lifetime"),
      },
    },
    async ({
      program_id,
      reward_type,
      percent_value,
      fixed_amount,
      recurring_duration_months,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        const recurringDurationMonths =
          recurring_duration_months === undefined
            ? null
            : recurring_duration_months;

        assertCommissionRule({
          rewardType: reward_type,
          percentValue: percent_value,
          fixedAmount: fixed_amount,
          recurringDurationMonths,
        });

        const commissionRule: Record<string, unknown> = {
          reward_type,
          recurring_duration_months: recurringDurationMonths,
        };

        if (reward_type === "percent") {
          commissionRule.percent_value = percent_value;
        }
        else {
          commissionRule.fixed_amount = fixed_amount;
        }

        const body: Record<string, unknown> = {
          commission_rule: commissionRule,
        };

        return apiRequest<unknown>(`/v1/programs/${program_id}/terms`, {
          apiUrl,
          token,
          method: "POST",
          body,
        });
      });
    }
  );

  server.registerTool(
    "publish_app_agreement",
    {
      description:
        "Publish a new developer-written app affiliate agreement.",
      inputSchema: {
        app_id: z.string().describe("App ID"),
        terms_text: z
          .string()
          .describe("Developer-written affiliate agreement text"),
      },
    },
    async ({ app_id, terms_text }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(
          `/v1/apps/${app_id}/agreement`,
          {
            apiUrl,
            token,
            method: "PATCH",
            body: {
              terms_text,
            },
          }
        );
      });
    }
  );

  server.registerTool(
    "pause_program",
    {
      description: "Pause an affiliate program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/programs/${program_id}/pause`, {
          apiUrl,
          token,
          method: "POST",
        });
      });
    }
  );

  server.registerTool(
    "resume_program",
    {
      description: "Resume a paused affiliate program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/programs/${program_id}/resume`, {
          apiUrl,
          token,
          method: "POST",
        });
      });
    }
  );

  server.registerTool(
    "list_affiliates",
    {
      description:
        "List affiliates for a program or across an app. Provide program_id or app_id.",
      inputSchema: {
        program_id: z.string().optional().describe("Program ID"),
        app_id: z.string().optional().describe("App ID (lists all programs)"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return the internal Test affiliate or live affiliates"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, app_id, environment, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/program-affiliates", {
          apiUrl,
          token,
          query: {
            program_id,
            app_id,
            environment,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "create_affiliate",
    {
      description: "Invite or create an affiliate for a program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        email: z.string().describe("Affiliate email"),
        name: z.string().optional().describe("Affiliate name"),
      },
    },
    async ({ program_id, email, name }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        const body: Record<string, unknown> = {
          program_id,
          email,
        };

        if (name) {
          body.name = name;
        }

        return apiRequest<unknown>("/v1/program-affiliates", {
          apiUrl,
          token,
          method: "POST",
          body,
        });
      });
    }
  );

  server.registerTool(
    "approve_affiliate",
    {
      description: "Approve a pending affiliate.",
      inputSchema: {
        affiliate_id: z.string().describe("Affiliate ID"),
      },
    },
    async ({ affiliate_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/program-affiliates/${affiliate_id}/approve`, {
          apiUrl,
          token,
          method: "POST",
        });
      });
    }
  );

  server.registerTool(
    "list_clicks",
    {
      description: "List affiliate clicks for a program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return isolated test or live clicks (defaults to live)"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, environment, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/clicks", {
          apiUrl,
          token,
          query: {
            program_id,
            environment,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_referrals",
    {
      description:
        "List referrals for a program or across an app. Provide program_id or app_id.",
      inputSchema: {
        program_id: z.string().optional().describe("Program ID"),
        app_id: z.string().optional().describe("App ID (lists all programs)"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return isolated test or live referrals (defaults to live)"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, app_id, environment, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/referrals", {
          apiUrl,
          token,
          query: {
            program_id,
            app_id,
            environment,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_transactions",
    {
      description:
        "List payments for a program or across an app. Provide program_id or app_id.",
      inputSchema: {
        program_id: z.string().optional().describe("Program ID"),
        app_id: z.string().optional().describe("App ID (lists all programs)"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return only test or live transactions"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, app_id, environment, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/transactions", {
          apiUrl,
          token,
          query: {
            program_id,
            app_id,
            environment,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "list_commissions",
    {
      description:
        "List commission entries. Developer view when program_id or app_id is set.",
      inputSchema: {
        program_id: z.string().optional().describe("Filter by program ID"),
        app_id: z.string().optional().describe("Filter by app ID"),
        environment: z
          .enum(["test", "live"])
          .optional()
          .describe("Return only test or live commission entries"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, app_id, environment, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/commissions", {
          apiUrl,
          token,
          query: {
            program_id,
            app_id,
            environment,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "reject_commission",
    {
      description: "Reject a flagged commission entry.",
      inputSchema: {
        commission_id: z.string().describe("Commission entry ID"),
        reason: z.string().optional().describe("Optional rejection reason"),
      },
    },
    async ({ commission_id, reason }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/commissions/${commission_id}/reject`, {
          apiUrl,
          token,
          method: "POST",
          body: reason ? { reason } : {},
        });
      });
    }
  );

  server.registerTool(
    "release_commission",
    {
      description: "Release a flagged commission entry for payout.",
      inputSchema: {
        commission_id: z.string().describe("Commission entry ID"),
      },
    },
    async ({ commission_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(`/v1/commissions/${commission_id}/release`, {
          apiUrl,
          token,
          method: "POST",
        });
      });
    }
  );

  server.registerTool(
    "create_payout_run",
    {
      description: "Create a payout batch for a program.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>("/v1/payout-batches", {
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
    "list_payout_runs",
    {
      description:
        "List payout batches. Developer view when program_id or app_id is set.",
      inputSchema: {
        program_id: z.string().optional().describe("Filter by program ID"),
        app_id: z.string().optional().describe("Filter by app ID"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ program_id, app_id, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/payout-batches", {
          apiUrl,
          token,
          query: {
            program_id,
            app_id,
            limit,
          },
        });
      });
    }
  );

  server.registerTool(
    "get_payout_run_items",
    {
      description: "List items in a payout batch.",
      inputSchema: {
        payout_run_id: z.string().describe("Payout batch ID"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size"),
      },
    },
    async ({ payout_run_id, limit }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>(
          `/v1/payout-batches/${payout_run_id}/items`,
          {
            apiUrl,
            token,
            query: {
              limit,
            },
          }
        );
      });
    }
  );

  server.registerTool(
    "list_ready_payouts",
    {
      description: "List affiliate payouts currently ready to pay.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
      },
    },
    async ({ program_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<ListResponse<unknown>>("/v1/ready-payouts", {
          apiUrl,
          token,
          query: { program_id },
        });
      });
    }
  );

  server.registerTool(
    "mark_affiliate_payout_paid",
    {
      description:
        "Mark one current affiliate payout paid. RefKit creates and closes the internal audit batch silently.",
      inputSchema: {
        program_id: z.string().describe("Program ID"),
        program_affiliate_id: z.string().describe("Program affiliate ID"),
        external_reference: z
          .string()
          .optional()
          .describe("External payment reference"),
      },
    },
    async ({ program_id, program_affiliate_id, external_reference }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(
          `/v1/ready-payouts/${program_affiliate_id}/mark-paid`,
          {
            apiUrl,
            token,
            method: "POST",
            body: {
              program_id,
              ...(external_reference ? { external_reference } : {}),
            },
          }
        );
      });
    }
  );

  server.registerTool(
    "mark_payout_run_paid",
    {
      description: "Mark an entire payout batch as paid.",
      inputSchema: {
        payout_run_id: z.string().describe("Payout batch ID"),
      },
    },
    async ({ payout_run_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        return apiRequest<unknown>(
          `/v1/payout-batches/${payout_run_id}/mark-paid`,
          {
            apiUrl,
            token,
            method: "POST",
          }
        );
      });
    }
  );

  server.registerTool(
    "resolve_payout_item",
    {
      description: "Resolve a payout batch item as paid, failed, or pending.",
      inputSchema: {
        payout_run_id: z.string().describe("Payout batch ID"),
        item_id: z.string().describe("Payout item ID"),
        status: z
          .enum(["paid", "failed", "pending"])
          .describe("Resolution status"),
        failure_reason: z
          .string()
          .optional()
          .describe("Failure reason when status is failed"),
        external_reference: z
          .string()
          .optional()
          .describe("External payment reference"),
      },
    },
    async ({
      payout_run_id,
      item_id,
      status,
      failure_reason,
      external_reference,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();

        const body: Record<string, unknown> = {
          status,
        };

        if (failure_reason) {
          body.failure_reason = failure_reason;
        }

        if (external_reference) {
          body.external_reference = external_reference;
        }

        return apiRequest<unknown>(
          `/v1/payout-batches/${payout_run_id}/items/${item_id}/resolve`,
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
    "list_owned_affiliate_links",
    {
      description: "List links for an Affiliate managed by the Developer.",
      inputSchema: {
        program_affiliate_id: z.string().describe("Program affiliate ID"),
      },
    },
    async ({ program_affiliate_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        return apiRequest<ListResponse<unknown>>(
          `/v1/program-affiliates/${program_affiliate_id}/links`,
          { apiUrl, token }
        );
      });
    }
  );

  server.registerTool(
    "create_owned_affiliate_link",
    {
      description: "Create a link for an Affiliate managed by the Developer.",
      inputSchema: {
        program_affiliate_id: z.string().describe("Program affiliate ID"),
        link_code: z.string().describe("Stable value for the via parameter"),
        label: z.string().optional().describe("Link label"),
        utm_source: z.string().optional().describe("UTM source"),
        utm_medium: z.string().optional().describe("UTM medium"),
        utm_campaign: z.string().optional().describe("UTM campaign"),
      },
    },
    async ({
      program_affiliate_id,
      link_code,
      label,
      utm_source,
      utm_medium,
      utm_campaign,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        return apiRequest<unknown>(
          `/v1/program-affiliates/${program_affiliate_id}/links`,
          {
            apiUrl,
            token,
            method: "POST",
            body: {
              link_code,
              label,
              utm_source,
              utm_medium,
              utm_campaign,
            },
          }
        );
      });
    }
  );

  server.registerTool(
    "update_owned_affiliate_link",
    {
      description: "Update link metadata for a Developer-managed Affiliate.",
      inputSchema: {
        program_affiliate_id: z.string().describe("Program affiliate ID"),
        link_id: z.string().describe("Affiliate link ID"),
        label: z.string().optional().describe("Link label"),
        destination_url: z
          .string()
          .url()
          .nullable()
          .optional()
          .describe("Destination URL override"),
        utm_source: z.string().nullable().optional().describe("UTM source"),
        utm_medium: z.string().nullable().optional().describe("UTM medium"),
        utm_campaign: z.string().nullable().optional().describe("UTM campaign"),
      },
    },
    async ({
      program_affiliate_id,
      link_id,
      label,
      destination_url,
      utm_source,
      utm_medium,
      utm_campaign,
    }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        return apiRequest<unknown>(
          `/v1/program-affiliates/${program_affiliate_id}/links/${link_id}`,
          {
            apiUrl,
            token,
            method: "PATCH",
            body: {
              label,
              destination_url,
              utm_source,
              utm_medium,
              utm_campaign,
            },
          }
        );
      });
    }
  );

  server.registerTool(
    "delete_owned_affiliate_link",
    {
      description: "Delete an unused non-default link for a Developer-managed Affiliate.",
      inputSchema: {
        program_affiliate_id: z.string().describe("Program affiliate ID"),
        link_id: z.string().describe("Affiliate link ID"),
      },
    },
    async ({ program_affiliate_id, link_id }) => {
      return runTool(async () => {
        const { apiUrl, token } = requireSessionAuth();
        return apiRequest<unknown>(
          `/v1/program-affiliates/${program_affiliate_id}/links/${link_id}`,
          { apiUrl, token, method: "DELETE" }
        );
      });
    }
  );
}
