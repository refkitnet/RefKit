import type { Command } from "commander";
import { apiRequest, handleCommandError } from "../api.js";
import { getAuthContext } from "./auth.js";

const EVENT_TYPES = new Set([
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

function parseEvents(value: string) {
  const events = value.split(",").map((event) => event.trim()).filter(Boolean);
  const invalid = events.find((event) => !EVENT_TYPES.has(event));

  if (invalid) {
    throw new Error(`Unsupported webhook event: ${invalid}`);
  }

  return [...new Set(events)];
}

export function registerWebhookCommands(program: Command) {
  const webhooks = program
    .command("webhooks")
    .description("Configure one outgoing webhook per App");

  webhooks
    .command("get")
    .requiredOption("--app-id <id>", "App ID")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: { appId: string; apiUrl?: string }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest(`/v1/apps/${options.appId}/webhook`, {
          apiUrl,
          token,
        });
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  webhooks
    .command("configure")
    .requiredOption("--app-id <id>", "App ID")
    .requiredOption("--url <url>", "HTTPS webhook URL")
    .requiredOption("--events <events>", "Comma-separated event types")
    .option("--disabled", "Save the endpoint disabled")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: {
      appId: string;
      url: string;
      events: string;
      disabled?: boolean;
      apiUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest(
          `/v1/apps/${options.appId}/webhook`,
          {
            apiUrl,
            token,
            method: "PUT",
            body: {
              url: options.url,
              enabled_events: parseEvents(options.events),
              enabled: !options.disabled,
            },
          }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  for (const action of ["test", "rotate-secret"] as const) {
    webhooks
      .command(action)
      .requiredOption("--app-id <id>", "App ID")
      .option("--api-url <url>", "RefKit API base URL")
      .action(async (options: { appId: string; apiUrl?: string }) => {
        try {
          const { apiUrl, token } = getAuthContext(options);
          const result = await apiRequest(
            `/v1/apps/${options.appId}/webhook/${action}`,
            { apiUrl, token, method: "POST" }
          );
          console.log(JSON.stringify(result, null, 2));
        }
        catch (error) {
          handleCommandError(error);
        }
      });
  }

  webhooks
    .command("deliveries")
    .requiredOption("--app-id <id>", "App ID")
    .option("--limit <count>", "Page size", "25")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: {
      appId: string;
      limit: string;
      apiUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest(
          `/v1/apps/${options.appId}/webhook/deliveries`,
          {
            apiUrl,
            token,
            query: { limit: Number(options.limit) },
          }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  webhooks
    .command("remove")
    .requiredOption("--app-id <id>", "App ID")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: { appId: string; apiUrl?: string }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest(`/v1/apps/${options.appId}/webhook`, {
          apiUrl,
          token,
          method: "DELETE",
        });
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
