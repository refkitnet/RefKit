import type { Command } from "commander";
import {
  apiRequest,
  handleCommandError,
  type ListResponse,
} from "../api.js";
import { formatAmount, formatTable } from "../lib/table.js";
import { getAuthContext } from "./auth.js";

type Commission = {
  id: string;
  program_id: string;
  affiliate_id: string;
  kind: string;
  status: string;
  amount: { amount: number; currency: string };
};

export function registerCommissionsCommands(program: Command) {
  const commissions = program
    .command("commissions")
    .description("Commission entries");

  commissions
    .command("list")
    .description("List commission entries")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--limit <n>", "Page size", "25")
    .option("--program-id <id>", "Filter by program ID")
    .option("--app-id <id>", "Filter by app ID")
    .option("--environment <environment>", "Filter by test or live environment")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      limit?: string;
      programId?: string;
      appId?: string;
      environment?: "test" | "live";
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        const result = await apiRequest<ListResponse<Commission>>(
          "/v1/commissions",
          {
            apiUrl,
            token,
            query: {
              limit: options.limit,
              program_id: options.programId,
              app_id: options.appId,
              environment: options.environment,
            },
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.data.length === 0) {
          console.log("No commissions found.");
          return;
        }

        console.log(
          formatTable(
            ["ID", "PROGRAM", "AFFILIATE", "KIND", "STATUS", "AMOUNT"],
            result.data.map((entry) => [
              entry.id,
              entry.program_id,
              entry.affiliate_id,
              entry.kind,
              entry.status,
              formatAmount(entry.amount),
            ])
          )
        );

        if (result.has_more) {
          console.log("\nMore results available. Use --limit or pagination cursors via --json.");
        }
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
