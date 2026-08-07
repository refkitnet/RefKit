import * as p from "@clack/prompts";
import type { Command } from "commander";
import { ApiRequestError, apiRequest, handleCommandError, type ListResponse } from "../api.js";
import { resolveProgramWebsiteUrl } from "../lib/landing-page.js";
import { required } from "../lib/prompts.js";
import {
  assertCommissionRule,
  parseFixedAmount,
  parsePercentValue,
  parseRecurringDurationMonths,
  parseRewardType,
} from "@refkitnet/validation";
import { getAuthContext } from "./auth.js";

export { parseRecurringDurationMonths };

export type Program = {
  id: string;
  app_id: string;
  name: string;
  slug: string;
  currency: string;
  destination_url: string;
};

function buildCommissionRule(input: {
  rewardType: string;
  percentValue?: number;
  fixedAmount?: number;
  recurringDurationMonths: number | null;
}) {
  const commissionRule: Record<string, unknown> = {
    reward_type: input.rewardType,
    recurring_duration_months: input.recurringDurationMonths,
  };

  if (input.rewardType === "percent") {
    commissionRule.percent_value = input.percentValue;
  }
  else {
    commissionRule.fixed_amount = input.fixedAmount;
  }

  return commissionRule;
}

async function promptRecurringDurationMonths() {
  const mode = await p.select({
    message: "Recurring commission duration",
    options: [
      { value: "lifetime", label: "Lifetime" },
      { value: "months", label: "Fixed number of months" },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (mode === "lifetime") {
    return null;
  }

  const enteredMonths = await p.text({
    message: "Recurring duration (months)",
    initialValue: "12",
    validate: (value) => {
      const months = Number(value);

      if (!Number.isInteger(months) || months <= 0) {
        return "Enter a positive whole number of months.";
      }

      return undefined;
    },
  });

  if (p.isCancel(enteredMonths)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  return Number(enteredMonths);
}

async function promptPercentValue() {
  const enteredPercent = await p.text({
    message: "Commission percent",
    initialValue: "20",
    validate: (value) => {
      const percent = Number(value);

      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        return "Enter a percent between 1 and 100.";
      }

      return undefined;
    },
  });

  if (p.isCancel(enteredPercent)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  return Number(enteredPercent);
}

function isNonInteractiveCreate(options: {
  appId?: string;
  name?: string;
  slug?: string;
  rewardType?: string;
}) {
  return Boolean(options.appId && options.name && options.slug && options.rewardType);
}

async function createProgram(
  apiUrl: string,
  token: string,
  input: {
    appId: string;
    name: string;
    slug: string;
    currency: string;
    destinationUrl: string;
    rewardType: string;
    percentValue?: number;
    fixedAmount?: number;
    recurringDurationMonths: number | null;
  }
) {
  return apiRequest<Program>("/v1/programs", {
    apiUrl,
    token,
    method: "POST",
    body: {
      app_id: input.appId,
      name: input.name,
      slug: input.slug,
      currency: input.currency,
      destination_url: input.destinationUrl,
      commission_rule: buildCommissionRule({
        rewardType: input.rewardType,
        percentValue: input.percentValue,
        fixedAmount: input.fixedAmount,
        recurringDurationMonths: input.recurringDurationMonths,
      }),
    },
  });
}

async function createProgramInteractively(
  apiUrl: string,
  token: string,
  appId: string,
  initial?: {
    name?: string;
    slug?: string;
  }
) {
  let name = initial?.name;
  let slug = initial?.slug;

  if (!name) {
    const enteredName = await p.text({
      message: "Program name",
      placeholder: "Affiliate Program",
      validate: required,
    });

    if (p.isCancel(enteredName)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    name = enteredName;
  }

  while (true) {
    if (!slug) {
      const enteredSlug = await p.text({
        message: "Program slug",
        placeholder: "my-program",
        validate: required,
      });

      if (p.isCancel(enteredSlug)) {
        p.cancel("Cancelled");
        process.exit(0);
      }

      slug = enteredSlug;
    }

    const destinationUrl = await resolveProgramWebsiteUrl(
      apiUrl,
      token,
      appId
    );

    const rewardType = await p.select({
      message: "Commission reward type",
      options: [
        { value: "percent", label: "Percent" },
        { value: "fixed", label: "Fixed amount" },
      ],
    });

    if (p.isCancel(rewardType)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    let percentValue: number | undefined;
    let fixedAmount: number | undefined;

    if (rewardType === "percent") {
      percentValue = await promptPercentValue();
    }
    else {
      const enteredFixed = await p.text({
        message: "Fixed amount (cents)",
        initialValue: "1000",
        validate: (value) => {
          try {
            parseFixedAmount(value);
            return undefined;
          }
          catch (error) {
            return error instanceof Error ? error.message : "Invalid amount.";
          }
        },
      });

      if (p.isCancel(enteredFixed)) {
        p.cancel("Cancelled");
        process.exit(0);
      }

      fixedAmount = parseFixedAmount(enteredFixed);
    }

    const recurringDurationMonths = await promptRecurringDurationMonths();

    try {
      return await createProgram(apiUrl, token, {
        appId,
        name,
        slug,
        currency: "usd",
        destinationUrl,
        rewardType,
        percentValue,
        fixedAmount,
        recurringDurationMonths,
      });
    }
    catch (error) {
      if (error instanceof ApiRequestError) {
        p.log.error(error.message);
        slug = undefined;
        continue;
      }

      throw error;
    }
  }
}

export function registerProgramsCommands(program: Command) {
  const programs = program.command("programs").description("Manage programs");

  programs
    .command("create")
    .description("Create a program")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .option("--app-id <id>", "App ID")
    .option("--name <name>", "Program name")
    .option("--slug <slug>", "Program slug")
    .option("--currency <code>", "Currency code")
    .option("--destination-url <url>", "Website URL (must match the app website URL)")
    .option("--reward-type <type>", "Commission reward type: percent or fixed")
    .option("--percent-value <n>", "Percent value for percent rewards")
    .option("--fixed-amount <n>", "Fixed amount in cents for fixed rewards")
    .option(
      "--recurring-duration-months <n>",
      "Recurring commission window in months (omit or use lifetime for lifetime)"
    )
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      appId?: string;
      name?: string;
      slug?: string;
      currency?: string;
      destinationUrl?: string;
      rewardType?: string;
      percentValue?: string;
      fixedAmount?: string;
      recurringDurationMonths?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);

        let appId = options.appId;
        let name = options.name;
        let slug = options.slug;
        let currency = options.currency;
        let destinationUrl = options.destinationUrl;
        let rewardType = parseRewardType(options.rewardType);
        let percentValue = parsePercentValue(options.percentValue);
        let fixedAmount = parseFixedAmount(options.fixedAmount);
        let recurringDurationMonths = parseRecurringDurationMonths(
          options.recurringDurationMonths
        );

        if (isNonInteractiveCreate(options)) {
          currency = currency ?? "usd";

          if (rewardType === "percent" && percentValue === undefined) {
            throw new Error("percent-value is required when reward-type is percent.");
          }

          if (rewardType === "fixed" && fixedAmount === undefined) {
            throw new Error("fixed-amount is required when reward-type is fixed.");
          }
        }

        if (!appId) {
          const enteredAppId = await p.text({
            message: "App ID",
            validate: required,
          });

          if (p.isCancel(enteredAppId)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          appId = enteredAppId;
        }

        if (!name) {
          const enteredName = await p.text({
            message: "Program name",
            placeholder: "Affiliate Program",
            validate: required,
          });

          if (p.isCancel(enteredName)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          name = enteredName;
        }

        if (!slug) {
          const enteredSlug = await p.text({
            message: "Program slug",
            placeholder: "my-program",
            validate: required,
          });

          if (p.isCancel(enteredSlug)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          slug = enteredSlug;
        }

        if (!currency) {
          const enteredCurrency = await p.text({
            message: "Currency",
            initialValue: "usd",
            validate: required,
          });

          if (p.isCancel(enteredCurrency)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          currency = enteredCurrency;
        }

        if (!destinationUrl) {
          destinationUrl = await resolveProgramWebsiteUrl(
            apiUrl,
            token,
            appId
          );
        }
        else {
          destinationUrl = await resolveProgramWebsiteUrl(
            apiUrl,
            token,
            appId,
            destinationUrl
          );
        }

        if (!rewardType) {
          const selectedRewardType = await p.select({
            message: "Commission reward type",
            options: [
              { value: "percent", label: "Percent" },
              { value: "fixed", label: "Fixed amount" },
            ],
          });

          if (p.isCancel(selectedRewardType)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          rewardType = selectedRewardType;
        }

        if (rewardType === "percent" && percentValue === undefined) {
          percentValue = await promptPercentValue();
        }

        if (rewardType === "fixed" && fixedAmount === undefined) {
          const enteredFixed = await p.text({
            message: "Fixed amount (cents)",
            initialValue: "1000",
            validate: (value) => {
              try {
                parseFixedAmount(value);
                return undefined;
              }
              catch (error) {
                return error instanceof Error ? error.message : "Invalid amount.";
              }
            },
          });

          if (p.isCancel(enteredFixed)) {
            p.cancel("Cancelled");
            process.exit(0);
          }

          fixedAmount = parseFixedAmount(enteredFixed);
        }

        if (options.recurringDurationMonths === undefined) {
          recurringDurationMonths = await promptRecurringDurationMonths();
        }

        const created = await createProgram(apiUrl, token, {
          appId,
          name,
          slug,
          currency,
          destinationUrl,
          rewardType,
          percentValue,
          fixedAmount,
          recurringDurationMonths: recurringDurationMonths ?? null,
        });

        if (options.json) {
          console.log(JSON.stringify(created, null, 2));
          return;
        }

        console.log(`Created program ${created.name} (${created.id})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  programs
    .command("update")
    .description("Update program settings")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--program-id <id>", "Program ID")
    .option("--name <name>", "Program name")
    .option("--join-page-enabled", "Enable hosted join page")
    .option("--no-join-page-enabled", "Disable hosted join page")
    .option(
      "--join-page-approval <mode>",
      "Join approval mode: active or pending"
    )
    .option(
      "--minimum-payout-amount <cents>",
      "Minimum payout amount in cents"
    )
    .option(
      "--supported-payout-methods <methods>",
      "Comma-separated payout methods: paypal,bank_transfer"
    )
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId: string;
      name?: string;
      joinPageEnabled?: boolean;
      joinPageApproval?: string;
      minimumPayoutAmount?: string;
      supportedPayoutMethods?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const body: Record<string, unknown> = {};

        if (options.name) {
          body.name = options.name;
        }

        if (options.joinPageEnabled !== undefined) {
          body.join_page_enabled = options.joinPageEnabled;
        }

        if (options.joinPageApproval) {
          if (
            options.joinPageApproval !== "active" &&
            options.joinPageApproval !== "pending"
          ) {
            throw new Error("join-page-approval must be active or pending.");
          }

          body.join_page_approval = options.joinPageApproval;
        }

        if (options.minimumPayoutAmount) {
          body.minimum_payout_amount = Number(options.minimumPayoutAmount);

          if (!Number.isInteger(body.minimum_payout_amount)) {
            throw new Error("minimum-payout-amount must be an integer.");
          }
        }

        if (options.supportedPayoutMethods) {
          body.supported_payout_methods = options.supportedPayoutMethods
            .split(",")
            .map((method) => method.trim())
            .filter(Boolean);
        }

        const updated = await apiRequest<Program>(
          `/v1/programs/${options.programId}`,
          {
            apiUrl,
            token,
            method: "PATCH",
            body,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(updated, null, 2));
          return;
        }

        console.log(`Updated program ${updated.name} (${updated.id})`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  const terms = programs.command("terms").description("Program terms versions");

  terms
    .command("publish")
    .description("Publish a new program terms version")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--json", "Print raw API response")
    .requiredOption("--program-id <id>", "Program ID")
    .requiredOption("--reward-type <type>", "Commission reward type: percent or fixed")
    .option("--percent-value <n>", "Percent value for percent rewards")
    .option("--fixed-amount <n>", "Fixed amount in cents for fixed rewards")
    .option(
      "--recurring-duration-months <n>",
      "Recurring commission window in months (omit for lifetime)"
    )
    .action(async (options: {
      apiUrl?: string;
      json?: boolean;
      programId: string;
      rewardType: string;
      percentValue?: string;
      fixedAmount?: string;
      recurringDurationMonths?: string;
    }) => {
      try {
        const { apiUrl, token } = getAuthContext(options);
        const rewardType = options.rewardType as "percent" | "fixed";
        const recurringDurationMonths =
          options.recurringDurationMonths === undefined
            ? null
            : Number(options.recurringDurationMonths);

        assertCommissionRule({
          rewardType,
          percentValue:
            options.percentValue === undefined
              ? undefined
              : Number(options.percentValue),
          fixedAmount:
            options.fixedAmount === undefined
              ? undefined
              : Number(options.fixedAmount),
          recurringDurationMonths,
        });

        const commissionRule: Record<string, unknown> = {
          reward_type: rewardType,
          recurring_duration_months: recurringDurationMonths,
        };

        if (rewardType === "percent") {
          commissionRule.percent_value = Number(options.percentValue);
        }
        else {
          commissionRule.fixed_amount = Number(options.fixedAmount);
        }

        const body: Record<string, unknown> = {
          commission_rule: commissionRule,
        };

        const result = await apiRequest<unknown>(
          `/v1/programs/${options.programId}/terms`,
          {
            apiUrl,
            token,
            method: "POST",
            body,
          }
        );

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`Published new terms for program ${options.programId}`);
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}

export async function selectProgram(
  apiUrl: string,
  token: string,
  appId: string,
  defaultProgramId?: string | null
) {
  const programs = await apiRequest<ListResponse<Program>>("/v1/programs", {
    apiUrl,
    token,
    query: {
      app_id: appId,
      limit: 100,
    },
  });

  const defaultProgram = defaultProgramId
    ? programs.data.find((program) => program.id === defaultProgramId)
    : null;

  if (defaultProgram) {
    return defaultProgram;
  }

  const createNew = await p.select({
    message: "Program",
    options: [
      ...programs.data.map((program) => ({
        value: program.id,
        label: `${program.name} (${program.slug})`,
      })),
      { value: "__create__", label: "Create a new program" },
    ],
  });

  if (p.isCancel(createNew)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  if (createNew === "__create__") {
    return createProgramInteractively(apiUrl, token, appId);
  }

  const program = programs.data.find((row) => row.id === createNew);

  if (!program) {
    throw new Error("Selected program not found.");
  }

  return program;
}
