export const REFKIT_DOCS_URL = "https://refkit.gitbook.io/docs";

export const MANUAL_INTEGRATION_GUIDE_URL =
  "https://refkit.gitbook.io/docs/integrate-refkit/manual-setup";

export const AGENT_INTEGRATION_GUIDE_URL =
  "https://refkit.gitbook.io/docs/integrate-refkit/ai-coding-agent";

export const OUTGOING_WEBHOOKS_GUIDE_URL =
  "https://refkit.gitbook.io/docs/integrate-refkit/outgoing-webhooks";

type AgentIntegrationPromptInput = {
  apiUrl: string;
  appId: string;
  programId: string;
  revenueSource: "stripe" | "api";
  setupMode: "test" | "production";
  environmentVariables?: string | null;
  includeExternalGuide?: boolean;
};

export function buildAgentIntegrationPrompt(
  input: AgentIntegrationPromptInput,
) {
  const apiUrl = input.apiUrl.replace(/\/$/, "");
  const apiUrlOption =
    apiUrl === "https://app.refkit.net" ? "" : ` --api-url ${apiUrl}`;
  const billing =
    input.revenueSource === "stripe" ? "Stripe" : "RefKit API reporting";
  const billingInstructions =
    input.revenueSource === "stripe"
      ? [
          "This App uses Stripe as its revenue source.",
          "Implement authenticated /v1/capture and /v1/identify, then attach the exact stripe_metadata returned by /v1/identify to the relevant Stripe Customer, Checkout Session, PaymentIntent, or Subscription.",
          "Do not implement /v1/transactions or /v1/transactions/refunds. RefKit receives payment and refund events through the connected Stripe App.",
        ]
      : [
          "This App uses RefKit API reporting as its revenue source.",
          "Implement authenticated /v1/capture and /v1/identify, persist the returned customer_id and program_id, then report successful payments to /v1/transactions and refunds to /v1/transactions/refunds.",
          "Do not add RefKit metadata to Stripe objects or rely on the RefKit Stripe App for payment events.",
        ];
  const environmentVariables = input.environmentVariables?.trim() || null;
  const guideSection = input.includeExternalGuide === false
    ? [
        "Before changing code, follow the integration documentation supplied by this RefKit instance operator.",
      ]
    : [
        "Before changing code, read and follow the current RefKit coding-agent guide:",
        AGENT_INTEGRATION_GUIDE_URL,
      ];
  const environmentSection = environmentVariables
    ? [
        "Add these values to the server environment (test key):",
        "```env",
        environmentVariables,
        "```",
        "",
        "Keep REFKIT_API_KEY server-side. Do not expose it to browser code or commit it.",
      ]
    : [
        "Read REFKIT_API_KEY from the server environment. Keep it server-side. Do not paste live keys into chat, expose them to browser code, or commit them.",
      ];

  return [
    "Integrate RefKit into this repository.",
    "",
    ...guideSection,
    "",
    "App-specific context:",
    `- API URL: ${apiUrl}`,
    `- App ID: ${input.appId}`,
    `- Program ID: ${input.programId}`,
    `- Setup mode: ${input.setupMode}`,
    `- Billing: ${billing}`,
    "- API key environment variable: REFKIT_API_KEY",
    "",
    "Billing requirements:",
    ...billingInstructions.map((instruction) => `- ${instruction}`),
    "",
    ...environmentSection,
    "",
    "After implementation, verify the setup checklist in RefKit. You can also run:",
    `npx refkitnet status --app-id ${input.appId}${apiUrlOption}`,
  ].join("\n");
}
