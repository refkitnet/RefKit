#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getServerIcons } from "./server-icon.js";
import { registerTools } from "./tools/register.js";

async function main() {
  const server = new McpServer({
    name: "refkit",
    title: "RefKit",
    version: "0.1.0",
    description:
      "Manage affiliate programs, check integration setup, and wire RefKit into your app.",
    icons: getServerIcons(),
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
