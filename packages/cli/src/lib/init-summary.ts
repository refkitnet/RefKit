import * as p from "@clack/prompts";
import { DEFAULT_API_URL } from "../config.js";
import type { Framework } from "./framework.js";

const MANUAL_INTEGRATION_GUIDE_URL =
  "https://refkit.gitbook.io/docs/integrate-refkit/manual-setup";

type InitSummaryInput = {
  app: {
    id: string;
    name: string;
  };
  program: {
    id: string;
    name: string;
    slug: string;
  };
  apiKey: string;
  envExamplePath: string;
  framework: Framework;
  stripeReady: boolean;
  stripePending: boolean;
  revenueSource: "stripe" | "api";
  apiUrl: string;
  mode?: "test" | "production";
};

function getFrameworkNextSteps(framework: Framework) {
  if (framework === "next") {
    return {
      capture:
        "Capture affiliate landing requests on the server and keep click_id in a secure first-party session.",
      identify:
        "Call identifyCustomer() in a Route Handler or Server Action before Stripe Checkout.",
    };
  }

  if (framework === "react") {
    return {
      capture:
        "Prefer captureClick() in your backend; use browser capture after consent only for a fully static app.",
      identify:
        "Call identifyCustomer() from your backend API before Stripe checkout.",
    };
  }

  if (framework === "express") {
    return {
      capture:
        "Call captureClick() in landing-page middleware and keep click_id in the server session.",
      identify:
        "Call identifyCustomer() in your checkout route before creating Stripe sessions.",
    };
  }

  return {
    capture:
      "Capture affiliate landing requests on the server; use the browser SDK only as a fallback.",
    identify:
      "Call identifyCustomer() on your server before creating Stripe objects.",
  };
}

export function formatStripeInitMessage(message?: string) {
  if (!message) {
    return "You can connect Stripe later from the dashboard.";
  }

  if (message.toLowerCase().includes("sandbox")) {
    return "Stripe is not connected yet. You can keep setting up and connect it when you are ready for live payments.";
  }

  return message;
}

export function buildInitSummary(input: InitSummaryInput) {
  const mode = input.mode ?? "test";
  const dashboardUrl = `${input.apiUrl.replace(/\/$/, "")}/dashboard/apps/${input.app.id}`;
  const guideLine = input.apiUrl.replace(/\/$/, "") === DEFAULT_API_URL
    ? `Guide: ${MANUAL_INTEGRATION_GUIDE_URL}`
    : "Guide: use the documentation provided by your Self-Hosted instance operator.";
  const frameworkSteps = getFrameworkNextSteps(input.framework);
  const revenueStatus =
    input.revenueSource === "api"
      ? "Revenue: report payments with the REST API or server SDK"
      : input.stripePending
        ? "Stripe: finish setup in your browser"
        : input.stripeReady
          ? "Stripe: connect link ready"
          : "Stripe: not connected yet";

  const summary = [
    `App: ${input.app.name} (${input.app.id})`,
    `Program: ${input.program.name} / ${input.program.slug}`,
    `${mode === "production" ? "Live" : "Test"} API key: ${input.apiKey}`,
    `Saved placeholder: ${input.envExamplePath}`,
    revenueStatus,
    `Store the ${mode === "production" ? "live" : "test"} API key securely. It will not be shown again.`,
  ].join("\n");

  const nextSteps = mode === "production"
    ? [
        "1. Copy the live API key into your production environment as REFKIT_API_KEY",
        `2. ${frameworkSteps.capture}`,
        `3. ${frameworkSteps.identify}`,
        input.revenueSource === "stripe"
          ? "4. Confirm live Stripe is connected in the dashboard"
          : "4. Report production payments from your backend with the REST API or server SDK",
        `5. Check progress: refkitnet status --app-id ${input.app.id}`,
        `6. Open dashboard: ${dashboardUrl}`,
        guideLine,
      ].join("\n")
    : [
        "1. Copy the API key into .env.local as REFKIT_API_KEY",
        `2. ${frameworkSteps.capture}`,
        `3. ${frameworkSteps.identify}`,
        input.revenueSource === "stripe"
          ? "4. Complete a Stripe test-mode payment through the test affiliate link"
          : "4. Report a test payment from your backend with the REST API or server SDK",
        `5. Check progress: refkitnet status --app-id ${input.app.id}`,
        "6. When testing passes, open Production setup in the dashboard",
        `7. Open dashboard: ${dashboardUrl}`,
        guideLine,
      ].join("\n");

  return {
    summary,
    nextSteps,
    outro: `${input.app.name} is ready to wire up`,
  };
}

export function printInitSummary(input: InitSummaryInput) {
  const content = buildInitSummary(input);

  p.note(content.summary, "Setup summary");
  p.note(content.nextSteps, "Next steps");

  return content.outro;
}
