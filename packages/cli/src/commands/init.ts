import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import * as p from "@clack/prompts";
import type { Command } from "commander";
import { apiRequest, handleCommandError } from "../api.js";
import { mergeEnvExample } from "../lib/env-example.js";
import { detectFramework } from "../lib/framework.js";
import {
  formatStripeInitMessage,
  printInitSummary,
} from "../lib/init-summary.js";
import {
  detectPackageManager,
  getInstallCommand,
} from "../lib/package-manager.js";
import { openBrowser } from "../lib/process.js";
import { ensureCliSession } from "./auth.js";
import { selectApp, type App } from "./apps.js";
import { selectProgram, type Program } from "./programs.js";

type ApiKey = {
  id: string;
  key: string;
  prefix: string;
};

type SetupStatus = {
  test_api_key: string | null;
};

type ConnectLinkResponse = {
  mode: string;
  url: string | null;
  message?: string;
};

function runInstall(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

type InitOptions = {
  apiUrl?: string;
  appId?: string;
  programId?: string;
  skipSdkInstall?: boolean;
  live?: boolean;
};

export async function runInit(options: InitOptions) {
  const cwd = process.cwd();
  const packageManager = detectPackageManager(cwd);
  const framework = detectFramework(cwd);

  p.intro("RefKit init");

  p.log.info(`Detected package manager: ${packageManager}`);
  p.log.info(`Detected framework: ${framework}`);

  const { apiUrl, token } = await ensureCliSession({ apiUrl: options.apiUrl });

  if (existsSync(join(cwd, "package.json")) && !options.skipSdkInstall) {
    const shouldInstall = await p.confirm({
      message: `Install @refkitnet/sdk with ${packageManager}?`,
      initialValue: true,
    });

    if (p.isCancel(shouldInstall)) {
      p.cancel("Cancelled");
      process.exit(0);
    }

    if (shouldInstall) {
      const [command, ...args] = getInstallCommand(
        packageManager,
        "@refkitnet/sdk"
      );
      const spinner = p.spinner();
      spinner.start(`Installing @refkitnet/sdk`);

      try {
        await runInstall(command, args, cwd);
        spinner.stop("Installed @refkitnet/sdk");
      }
      catch (error) {
        spinner.stop("Install failed");
        throw error;
      }
    }
  }
  else {
    p.log.warn("No package.json found in the current directory. Skipping SDK install.");
  }

  const app = options.appId
    ? await apiRequest<App>(`/v1/apps/${options.appId}`, { apiUrl, token })
    : await selectApp(apiUrl, token);
  const selectedProgram = options.programId
    ? await apiRequest<Program>(`/v1/programs/${options.programId}`, {
        apiUrl,
        token,
      })
    : await selectProgram(apiUrl, token, app.id, app.default_program_id);

  if (selectedProgram.app_id !== app.id) {
    throw new Error("The selected program does not belong to the selected app.");
  }

  let stripeReady = false;
  let stripePending = false;

  if (app.revenue_source === "stripe") {
    const connect = await apiRequest<ConnectLinkResponse>(
      "/v1/stripe/connect-link",
      {
        apiUrl,
        token,
        method: "POST",
        body: {
          app_id: app.id,
        },
      },
    );

    if (connect.url) {
      stripeReady = true;
      p.log.success("Stripe App install link ready");
      p.log.message("Install RefKit to track payments and calculate commissions.");
      console.log(connect.url);

      const shouldOpen = await p.confirm({
        message: "Open the Stripe App install page in your browser?",
        initialValue: true,
      });

      if (!p.isCancel(shouldOpen) && shouldOpen) {
        stripePending = true;

        try {
          openBrowser(connect.url);
        }
        catch {
          p.log.warn("Could not open browser automatically.");
        }
      }
    }
    else {
      p.log.info("Stripe not connected yet");
      p.log.message(formatStripeInitMessage(connect.message));
    }
  }
  else {
    p.log.info("API revenue reporting selected");
    p.log.message(
      "The setup summary will show how to report payments from your backend.",
    );
  }

  let apiKeyValue: string;

  if (options.live) {
    const apiKeySpinner = p.spinner();
    apiKeySpinner.start("Creating live API key");

    const apiKey = await apiRequest<ApiKey>("/v1/api-keys", {
      apiUrl,
      token,
      method: "POST",
      body: {
        kind: "app",
        organization_id: app.organization_id,
        app_id: app.id,
        name: "CLI live key",
        test_mode: false,
      },
    });

    apiKeyValue = apiKey.key;
    apiKeySpinner.stop("Live API key created");
  }
  else {
    const setupStatus = await apiRequest<SetupStatus>(
      `/v1/apps/${app.id}/setup-status`,
      { apiUrl, token },
    );
    const existingTestApiKey = setupStatus.test_api_key;

    if (existingTestApiKey) {
      apiKeyValue = existingTestApiKey;
      p.log.success("Test API key ready");
    }
    else {
      const apiKeySpinner = p.spinner();
      apiKeySpinner.start("Creating test API key");

      const apiKey = await apiRequest<ApiKey>("/v1/api-keys", {
        apiUrl,
        token,
        method: "POST",
        body: {
          kind: "app",
          organization_id: app.organization_id,
          app_id: app.id,
          name: "CLI test key",
          test_mode: true,
        },
      });

      apiKeyValue = apiKey.key;
      apiKeySpinner.stop("Test API key created");
    }
  }

  const envExamplePath = mergeEnvExample(cwd);
  const outro = printInitSummary({
    app,
    program: selectedProgram,
    apiKey: apiKeyValue,
    envExamplePath,
    framework,
    stripeReady,
    stripePending,
    revenueSource: app.revenue_source,
    apiUrl,
    mode: options.live ? "production" : "test",
  });

  p.outro(outro);
}

export function registerInitCommand(program: Command) {
  program
    .command("init")
    .description("Interactive setup wizard")
    .option("--api-url <url>", "RefKit API base URL")
    .option("--app-id <id>", "Use this app without prompting")
    .option("--program-id <id>", "Use this program without prompting")
    .option("--skip-sdk-install", "Skip installing @refkitnet/sdk")
    .option("--live", "Create live credentials for a production setup")
    .action(async (options: InitOptions) => {
      try {
        await runInit(options);
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}
