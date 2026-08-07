#!/usr/bin/env node

import { Command } from "commander";
import { registerAffiliatesCommands } from "./commands/affiliates.js";
import { registerAppsCommands } from "./commands/apps.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerCommissionsCommands } from "./commands/commissions.js";
import { registerInitCommand } from "./commands/init.js";
import { registerLinksCommands } from "./commands/links.js";
import { registerNetworkCommands } from "./commands/network.js";
import { registerPayoutsCommands } from "./commands/payouts.js";
import { registerProgramsCommands } from "./commands/programs.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerWebhookCommands } from "./commands/webhooks.js";
import { DEFAULT_API_URL, getApiUrl, loadConfig } from "./config.js";

const program = new Command();
const DOCS_URL = "https://refkit.gitbook.io/docs";
const INTEGRATION_DOCS_URL = `${DOCS_URL}/integrate-refkit`;
const CLI_MCP_DOCS_URL = `${DOCS_URL}/reference/sdk-cli-mcp`;
const apiUrl = getApiUrl(loadConfig());
const docsHelp = apiUrl === DEFAULT_API_URL
  ? `\nDocs:\n  Help center: ${DOCS_URL}\n  Integration: ${INTEGRATION_DOCS_URL}\n  CLI and MCP: ${CLI_MCP_DOCS_URL}`
  : "\nDocs:\n  Use the documentation provided by your Self-Hosted instance operator.";

program
  .name("refkitnet")
  .description("RefKit CLI")
  .version("0.1.0")
  .addHelpText(
    "afterAll",
    docsHelp
  );

registerAuthCommands(program);
registerInitCommand(program);
registerAppsCommands(program);
registerProgramsCommands(program);
registerAffiliatesCommands(program);
registerLinksCommands(program);
registerNetworkCommands(program);
registerCommissionsCommands(program);
registerPayoutsCommands(program);
registerWebhookCommands(program);
registerStatusCommand(program);

program.parseAsync(process.argv);
