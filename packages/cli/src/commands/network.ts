import * as p from "@clack/prompts";
import type { Command } from "commander";
import { apiRequest, handleCommandError, type ListResponse } from "../api.js";
import { getApiUrl, loadConfig } from "../config.js";
import { getAuthContext } from "./auth.js";

type NetworkProgram = {
  app: { id: string; name: string };
  program: {
    id: string;
    name: string;
    join_page_approval: "active" | "pending";
  };
  commission_rule: {
    reward_type: "percent" | "fixed";
    percent_value: number | null;
    fixed_amount: number | null;
    fixed_currency: string | null;
  };
  current_terms_version: {
    id: string;
    version_number: number;
  };
  current_agreement_version: {
    id: string;
    version_number: number;
    terms_text: string;
  } | null;
};

export function registerNetworkCommands(program: Command) {
  const network = program
    .command("network")
    .description("Browse and join the RefKit Network");

  network
    .command("list")
    .description("List listed programs in the RefKit Network")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--limit <number>", "Page size", "25")
    .option("--starting-after <id>", "Pagination cursor")
    .option("--json", "Print raw API response")
    .action(async (options: {
      apiUrl?: string;
      limit: string;
      startingAfter?: string;
      json?: boolean;
    }) => {
      try {
        const result = await apiRequest<ListResponse<NetworkProgram>>(
          "/v1/network/apps",
          {
            apiUrl: getApiUrl(loadConfig(), options.apiUrl),
            query: {
              limit: Number(options.limit),
              starting_after: options.startingAfter,
            },
          },
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        for (const entry of result.data) {
          const rule = entry.commission_rule;
          const commission =
            rule.reward_type === "percent"
              ? `${rule.percent_value ?? 0}%`
              : `${rule.fixed_amount ?? 0} ${rule.fixed_currency ?? ""}`.trim();

          console.log(
            `${entry.app.name} | ${entry.program.name} | ${commission} | app ${entry.app.id} | program ${entry.program.id} | agreement ${entry.current_agreement_version?.id ?? "none"}`,
          );
        }

        if (result.has_more) {
          console.log("More apps are available. Use --starting-after with the last app ID.");
        }
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  network
    .command("join")
    .description("Join or request access to a listed program")
    .requiredOption("--program-id <id>", "Program ID")
    .requiredOption("--app-agreement-version-id <id>", "Current app agreement version ID")
    .option("--accept", "Accept the current app agreement")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .action(async (options: {
      programId: string;
      appAgreementVersionId: string;
      accept?: boolean;
      apiUrl?: string;
      json?: boolean;
    }) => {
      try {
        let accepted = options.accept === true;

        if (!accepted) {
          const confirmed = await p.confirm({
            message: "Accept the current app agreement?",
            initialValue: false,
          });

          if (p.isCancel(confirmed) || !confirmed) {
            p.cancel("App agreement was not accepted.");
            return;
          }

          accepted = true;
        }

        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest<unknown>(
          `/v1/affiliate/programs/${options.programId}/join`,
          {
            apiUrl,
            token,
            method: "POST",
            body: {
              app_agreement_version_id: options.appAgreementVersionId,
              accepted_program_rules: accepted,
            },
          },
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log("Program joined successfully.");
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
