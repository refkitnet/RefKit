import type { Command } from "commander";
import { apiRequest, handleCommandError } from "../api.js";
import { selectApp } from "./apps.js";
import { getAuthContext } from "./auth.js";

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

function getChecklistItems(status: SetupStatus) {
  const testBillingItems =
    status.revenue_source === "api"
      ? []
      : [{ key: "test_stripe_connected" as const, label: "Stripe test mode connected" }];

  const liveBillingItems =
    status.revenue_source === "api"
      ? []
      : [{ key: "live_stripe_connected" as const, label: "Live Stripe connected" }];

  return {
    test: [
      { key: "program_launched" as const, label: "Program created" },
      { key: "test_api_key_created" as const, label: "Test API key created" },
      { key: "test_api_key_used" as const, label: "Test API key used" },
      ...testBillingItems,
      { key: "test_affiliate_created" as const, label: "Test affiliate link ready" },
      { key: "test_first_click" as const, label: "Test affiliate click tracked" },
      { key: "test_first_identify" as const, label: "Test signup matched" },
      { key: "test_first_revenue_event" as const, label: "Test payment received" },
      { key: "test_first_commission" as const, label: "Test commission created" },
    ],
    production: [
      { key: "production_website_ready" as const, label: "Production website URL" },
      { key: "live_api_key_created" as const, label: "Live API key created" },
      ...liveBillingItems,
    ],
    alarms: [
      {
        key: "unattributed_revenue_alarm" as const,
        label: "Unattributed revenue detected",
      },
    ],
  };
}

function renderChecklist(status: SetupStatus) {
  const lines: string[] = [
    `Revenue source: ${status.revenue_source}`,
    `Test integration: ${
      status.test_integration_complete
        ? "complete"
        : status.production_ready
          ? "optional, not completed"
          : "in progress"
    }`,
  ];
  const checklist = getChecklistItems(status);

  for (const item of checklist.test) {
    const done = status[item.key];
    lines.push(`${done ? "[x]" : "[ ]"} ${item.label}`);
  }

  lines.push("");
  lines.push(`Production setup: ${status.production_ready ? "ready" : "not ready"}`);

  for (const item of checklist.production) {
    const done = status[item.key];
    lines.push(`${done ? "[x]" : "[ ]"} ${item.label}`);
  }

  for (const item of checklist.alarms) {
    if (status[item.key]) {
      lines.push(`[!] ${item.label}`);
    }
  }

  return lines.join("\n");
}

export function registerStatusCommand(program: Command) {
  program
    .command("status")
    .description("Show app setup status")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--app-id <id>", "App ID")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      appId?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let appId = options.appId;

        if (!appId) {
          const app = await selectApp(apiUrl, token);
          appId = app.id;
        }

        const status = await apiRequest<SetupStatus>(
          `/v1/apps/${appId}/setup-status`,
          {
            apiUrl,
            token,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        console.log(renderChecklist(status));
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
