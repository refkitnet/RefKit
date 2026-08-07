import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAffiliateTools } from "./affiliate.js";
import { registerIntegrationTools } from "./integration.js";
import { registerOwnerTools } from "./owner.js";
import { registerAutomationTools } from "./automation.js";
import { registerRevenueTools } from "./revenue.js";

export function registerTools(server: McpServer) {
  registerIntegrationTools(server);
  registerOwnerTools(server);
  registerAffiliateTools(server);
  registerAutomationTools(server);
  registerRevenueTools(server);
}
