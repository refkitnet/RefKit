import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = join(__dirname, "..", "dist", "index.js");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [entry],
});

const client = new Client({
  name: "refkit-mcp-smoke-test",
  version: "0.0.1",
});

await client.connect(transport);

const tools = await client.listTools();
const toolNames = new Set(tools.tools.map((tool) => tool.name));

for (const name of ["get_auth_status", "get_help", "get_setup_status"]) {
  if (!toolNames.has(name)) {
    throw new Error(`Tool list is missing ${name} (${tools.tools.length} tools returned).`);
  }
}

console.log(`tools: ${tools.tools.length}`);

const auth = await client.callTool({
  name: "get_auth_status",
  arguments: {},
});

if (!auth.content.some((item) => item.type === "text" && item.text.length > 0)) {
  throw new Error("get_auth_status did not return text content");
}

console.log("get_auth_status: ok");

const help = await client.callTool({
  name: "get_help",
  arguments: {
    topic: "coding_agent_setup",
  },
});

if (!help.content.some((item) => item.type === "text" && item.text.includes("ai-coding-agent"))) {
  throw new Error("get_help did not return the coding-agent guide");
}

console.log("get_help: ok");

await client.close();
console.log("smoke test passed");
