import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Framework = "next" | "react" | "express" | "node" | "unknown";

export function detectFramework(cwd = process.cwd()): Framework {
  const packageJsonPath = join(cwd, "package.json");

  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    if (deps.next) {
      return "next";
    }

    if (deps.react) {
      return "react";
    }

    if (deps.express) {
      return "express";
    }

    if (deps["@refkitnet/sdk"]) {
      return "node";
    }

    return "unknown";
  }
  catch {
    return "unknown";
  }
}

export function getFrameworkInstructions(framework: Framework) {
  const captureSnippet = `import { captureClick } from "@refkitnet/sdk";

const landingUrl = new URL(request.url);
const click = await captureClick({
  apiKey: process.env.REFKIT_API_KEY!,
  via: landingUrl.searchParams.get("via")!,
  page: landingUrl.toString(),
  visitorIp: trustedClientIp(request),
  visitorUserAgent: request.headers.get("user-agent") ?? undefined,
});

secureSession.refkitClickId = click.click_id;`;

  const browserSnippet = `import { RefKit } from "@refkitnet/sdk/browser";

RefKit.init();
await RefKit.capture();

const clickId = RefKit.getClickId();
const metadata = RefKit.getStripeMetadata();`;

  const backendSnippet = `import { identifyCustomer } from "@refkitnet/sdk";

const result = await identifyCustomer({
  apiKey: process.env.REFKIT_API_KEY!,
  clickId: secureSession.refkitClickId,
  externalCustomerId: customer.id,
  email: customer.email,
});

// Stripe apps: use result.stripe_metadata when creating Stripe objects.
// API apps: call reportPayment() after each successful charge or renewal.`;

  const paymentSnippet = `import { reportDispute, reportPayment, reportRefund } from "@refkitnet/sdk";

await reportPayment({
  apiKey: process.env.REFKIT_API_KEY!,
  paymentId: invoice.id,
  customerId: result.customer_id,
  programId: result.program_id,
  amount: invoice.amount_paid,
  currency: invoice.currency,
});

await reportRefund({
  apiKey: process.env.REFKIT_API_KEY!,
  refundId: refund.id,
  paymentId: invoice.id,
  amount: refund.amount,
});

await reportDispute({
  apiKey: process.env.REFKIT_API_KEY!,
  disputeId: dispute.id,
  paymentId: invoice.id,
  status: "opened",
  amount: dispute.amount,
});`;

  const lines = [
    "Server capture (recommended):",
    captureSnippet,
    "",
    "Browser fallback:",
    browserSnippet,
    "",
    "Customer identify:",
    backendSnippet,
    "",
    "API-reported revenue:",
    paymentSnippet,
  ];

  if (framework === "next") {
    lines.unshift(
      "Next.js:",
      "- Capture affiliate traffic in server middleware or a Route Handler and store click_id in a secure first-party session.",
      "- Call identifyCustomer() from a Route Handler or Server Action before creating Stripe Checkout.",
      "- Use the browser SDK only when server capture is not practical."
    );
    lines.push("");
  }
  else if (framework === "react") {
    lines.unshift(
      "React:",
      "- Prefer captureClick() in the backend serving the React app.",
      "- If the app is fully static, mount RefKit.capture() after consent as the fallback.",
      "- Call identifyCustomer() from your backend API before Stripe checkout."
    );
    lines.push("");
  }
  else if (framework === "express") {
    lines.unshift(
      "Express:",
      "- Capture affiliate traffic in Express middleware and store click_id in the server session.",
      "- Call identifyCustomer() in your checkout route before creating Stripe sessions."
    );
    lines.push("");
  }
  else {
    lines.unshift(
      "Integration:",
      "- Capture affiliate traffic on the server and keep click_id in secure first-party storage.",
      "- Use the browser SDK only as a fallback for sites without practical server middleware.",
      "- Call identifyCustomer() on your server before any Stripe object is created."
    );
    lines.push("");
  }

  return lines.join("\n");
}

export function getStripeMetadataExamples() {
  return [
    "Stripe metadata examples:",
    "",
    "Checkout Session (payment mode):",
    '  metadata: { refkit_click_id: "clk_...", refkit_customer_id: "rcus_...", refkit_program_id: "prg_..." }',
    "",
    "PaymentIntent:",
    '  metadata: { refkit_click_id: "clk_...", refkit_customer_id: "rcus_...", refkit_program_id: "prg_..." }',
    "",
    "Subscription:",
    '  metadata: { refkit_click_id: "clk_...", refkit_customer_id: "rcus_...", refkit_program_id: "prg_..." }',
    "",
    "Stripe Customer (stamp on first checkout):",
    '  metadata: { refkit_customer_id: "rcus_..." }',
    "",
    "Call identifyCustomer() before creating any Stripe Checkout Session, PaymentIntent, or Subscription.",
  ].join("\n");
}
