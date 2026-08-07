import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import type { Command } from "commander";
import { apiRequest, handleCommandError } from "../api.js";
import { getApiUrl, loadConfig } from "../config.js";
import { required } from "../lib/prompts.js";
import { getAuthContext } from "./auth.js";

type PayoutBatch = {
  id: string;
  program_id: string;
  status: string;
};

type PayoutItem = {
  id: string;
  status: string;
};

type AffiliatePayout = {
  program_affiliate_id: string;
  amount: { amount: number; currency: string };
  status: string;
};

function getAppKeyContext(options: { apiUrl?: string; apiKey?: string }) {
  const token = options.apiKey ?? process.env.REFKIT_API_KEY;

  if (!token) {
    throw new Error("Provide --api-key or set REFKIT_API_KEY.");
  }

  return { apiUrl: getApiUrl(loadConfig(), options.apiUrl), token };
}

export function registerPayoutsCommands(program: Command) {
  const payouts = program.command("payouts").description("Manual affiliate payouts");

  payouts
    .command("create")
    .description("Create an internal payout batch (advanced)")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--program-id <id>", "Program ID")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let programId = options.programId;

        if (!programId) {
          const enteredProgramId = await p.text({
            message: "Program ID",
            validate: required,
          });

          if (p.isCancel(enteredProgramId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          programId = enteredProgramId;
        }

        const created = await apiRequest<PayoutBatch>("/v1/payout-batches", {
          apiUrl,
          token,
          method: "POST",
          body: {
            program_id: programId,
          },
        });

        if (options.json) {
          console.log(JSON.stringify(created, null, 2));
          return;
        }

        console.log(`Prepared payouts ${created.id} (${created.status})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("ready")
    .description("List affiliate payouts ready to pay")
    .requiredOption("--program-id <id>", "Program ID")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest<{ data: AffiliatePayout[] }>(
          "/v1/ready-payouts",
          {
            apiUrl,
            token,
            query: { program_id: options.programId },
          }
        );

        console.log(JSON.stringify(options.json ? result : result.data, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("pay-affiliate")
    .description("Mark one affiliate payout paid")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--program-id <id>", "Program ID")
    .option("--affiliate-id <id>", "Program affiliate ID")
    .option("--external-reference <ref>", "External payment reference")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId?: string;
      affiliateId?: string;
      externalReference?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        let programId = options.programId;
        let affiliateId = options.affiliateId;

        if (!programId) {
          const enteredId = await p.text({
            message: "Program ID",
            validate: required,
          });

          if (p.isCancel(enteredId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          programId = enteredId;
        }

        if (!affiliateId) {
          const enteredAffiliateId = await p.text({
            message: "Program affiliate ID",
            validate: required,
          });

          if (p.isCancel(enteredAffiliateId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          affiliateId = enteredAffiliateId;
        }

        const payout = await apiRequest<AffiliatePayout>(
          `/v1/ready-payouts/${affiliateId}/mark-paid`,
          {
            apiUrl,
            token,
            method: "POST",
            body: {
              program_id: programId,
              ...(options.externalReference
                ? { external_reference: options.externalReference }
                : {}),
            },
          }
        );

        if (options.json) {
          console.log(JSON.stringify(payout, null, 2));
          return;
        }

        console.log(
          `Marked affiliate payout ${payout.program_affiliate_id} as ${payout.status}`
        );
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("download")
    .description("Download the current ready-to-pay CSV")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--program-id <id>", "Program ID")
    .option("--output <path>", "Output file path")
    .action(async (options: {
      apiUrl?: string;
      programId?: string;
      output?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let programId = options.programId;

        if (!programId) {
          const enteredId = await p.text({
            message: "Program ID",
            validate: required,
          });

          if (p.isCancel(enteredId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          programId = enteredId;
        }

        const csv = await apiRequest<string>("/v1/ready-payouts/csv", {
          apiUrl,
          token,
          method: "POST",
          body: { program_id: programId },
          raw: true,
        });

        const outputPath = resolve(
          options.output ?? `payouts-${programId}.csv`
        );

        writeFileSync(outputPath, csv, "utf8");
        console.log(outputPath);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("resolve-item")
    .description("Resolve a payout batch item")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--run-id <id>", "Payout batch ID")
    .option("--item-id <id>", "Payout item ID")
    .option("--status <status>", "paid, failed, or pending")
    .option("--failure-reason <reason>", "Failure reason when status is failed")
    .option("--external-reference <ref>", "External payment reference")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      runId?: string;
      itemId?: string;
      status?: string;
      failureReason?: string;
      externalReference?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let runId = options.runId;
        let itemId = options.itemId;
        let status = options.status;

        if (!runId) {
          const enteredRunId = await p.text({
            message: "Payout batch ID",
            validate: required,
          });

          if (p.isCancel(enteredRunId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          runId = enteredRunId;
        }

        if (!itemId) {
          const enteredItemId = await p.text({
            message: "Payout item ID",
            validate: required,
          });

          if (p.isCancel(enteredItemId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          itemId = enteredItemId;
        }

        if (!status) {
          const selectedStatus = await p.select({
            message: "Resolution status",
            options: [
              { value: "paid", label: "Paid" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Pending" },
            ],
          });

          if (p.isCancel(selectedStatus)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          status = selectedStatus;
        }

        const body: Record<string, unknown> = {
          status,
        };

        if (options.failureReason) {
          body.failure_reason = options.failureReason;
        }

        if (options.externalReference) {
          body.external_reference = options.externalReference;
        }

        const item = await apiRequest<PayoutItem>(
          `/v1/payout-batches/${runId}/items/${itemId}/resolve`,
          {
            apiUrl,
            token,
            method: "POST",
            body,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(item, null, 2));
          return;
        }

        console.log(`Resolved payout item ${item.id} as ${item.status}`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("mark-paid")
    .description("Mark a payout batch as paid")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--id <id>", "Payout run ID")
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      id?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let runId = options.id;

        if (!runId) {
          const enteredId = await p.text({
            message: "Payout batch ID",
            validate: required,
          });

          if (p.isCancel(enteredId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          runId = enteredId;
        }

        const run = await apiRequest<PayoutBatch>(
          `/v1/payout-batches/${runId}/mark-paid`,
          {
            apiUrl,
            token,
            method: "POST",
          }
        );

        if (options.json) {
          console.log(JSON.stringify(run, null, 2));
          return;
        }

        console.log(`Marked payout batch ${run.id} as ${run.status}`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("dispatch")
    .description("Send a prepared payout batch to the configured payout system")
    .requiredOption("--batch-id <id>", "Payout batch ID")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: { batchId: string; apiUrl?: string }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const result = await apiRequest(
          `/v1/payout-batches/${options.batchId}/dispatch`,
          { apiUrl, token, method: "POST" }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("execution")
    .description("Fetch one payout execution and its instructions")
    .requiredOption("--execution-id <id>", "Payout execution ID")
    .option("--api-key <key>", "Live App-scoped API key")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: {
      executionId: string;
      apiKey?: string;
      apiUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAppKeyContext(options);
        const result = await apiRequest(
          `/v1/payout-executions/${options.executionId}`,
          { apiUrl, token }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("execution-succeeded")
    .description("Report a payout execution as succeeded")
    .requiredOption("--execution-id <id>", "Payout execution ID")
    .requiredOption("--idempotency-key <key>", "Idempotency key")
    .option("--external-reference <ref>", "External payment reference")
    .option("--api-key <key>", "Live App-scoped API key")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: {
      executionId: string;
      idempotencyKey: string;
      externalReference?: string;
      apiKey?: string;
      apiUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAppKeyContext(options);
        const result = await apiRequest(
          `/v1/payout-executions/${options.executionId}/succeeded`,
          {
            apiUrl,
            token,
            method: "POST",
            headers: { "Idempotency-Key": options.idempotencyKey },
            body: options.externalReference
              ? { external_reference: options.externalReference }
              : {},
          }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  payouts
    .command("execution-failed")
    .description("Report a payout execution as failed")
    .requiredOption("--execution-id <id>", "Payout execution ID")
    .requiredOption("--idempotency-key <key>", "Idempotency key")
    .requiredOption("--failure-reason <reason>", "Failure reason")
    .option("--external-reference <ref>", "External payment reference")
    .option("--api-key <key>", "Live App-scoped API key")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: {
      executionId: string;
      idempotencyKey: string;
      failureReason: string;
      externalReference?: string;
      apiKey?: string;
      apiUrl?: string;
    }) => {
      try {
        const { apiUrl, token } = getAppKeyContext(options);
        const result = await apiRequest(
          `/v1/payout-executions/${options.executionId}/failed`,
          {
            apiUrl,
            token,
            method: "POST",
            headers: { "Idempotency-Key": options.idempotencyKey },
            body: {
              failure_reason: options.failureReason,
              ...(options.externalReference
                ? { external_reference: options.externalReference }
                : {}),
            },
          }
        );
        console.log(JSON.stringify(result, null, 2));
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
