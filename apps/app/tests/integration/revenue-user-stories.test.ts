import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { commissionEntries, stripeEvents, transactions } from "@/db/schema";
import { POST as identifyRoute } from "@/app/api/v1/identify/route";
import { POST as captureRoute } from "@/app/api/v1/capture/route";
import { POST as paymentRoute } from "@/app/api/v1/transactions/route";
import { POST as disputeRoute } from "@/app/api/v1/transactions/disputes/route";
import { POST as refundRoute } from "@/app/api/v1/transactions/refunds/route";
import { updateAppRevenueSource } from "@/services/apps";
import { hashIp } from "@/lib/ip-hash";
import {
  clearFixtureObjects,
  createFixtureFetcher,
  setStripeFetcherForTests,
} from "@/services/stripe/fetcher";
import { processStoredStripeEvent } from "@/services/stripe/event-processor";
import {
  injectChargeRefundedEvent,
  injectCheckoutCompletedEvent,
} from "@/services/stripe/test-inject";
import {
  identifyCustomer as sdkIdentifyCustomer,
  reportDispute as sdkReportDispute,
  reportPayment as sdkReportPayment,
  reportRefund as sdkReportRefund,
} from "../../../../packages/sdk/src/server";
import {
  capture as sdkCapture,
  init as sdkBrowserInit,
} from "../../../../packages/sdk/src/browser";
import {
  cleanupTestContext,
  createTestSuffix,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

type RouteHandler = (request: Request) => Promise<Response>;

function installSdkRouteAdapter() {
  const originalFetch = globalThis.fetch;
  const routes = new Map<string, RouteHandler>([
    ["/v1/capture", captureRoute],
    ["/v1/identify", identifyRoute],
    ["/v1/transactions", paymentRoute],
    ["/v1/transactions/disputes", disputeRoute],
    ["/v1/transactions/refunds", refundRoute],
  ]);

  globalThis.fetch = (async (input, init) => {
    const request =
      input instanceof Request && !init
        ? input
        : new Request(input, init);
    const route = routes.get(new URL(request.url).pathname);

    if (!route) {
      throw new Error(`Unexpected SDK route: ${request.url}`);
    }

    return route(request);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function captureClickThroughBrowserSdk(ctx: TestContext) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const values = new Map<string, string>();
  let cookie = "";
  let currentUrl = `${ctx.destinationUrl}?via=${ctx.linkCode}`;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: currentUrl },
      history: {
        replaceState: (_state: unknown, _title: string, nextUrl: string) => {
          currentUrl = String(nextUrl);
        },
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        cookie = value;
      },
      referrer: "https://newsletter.example",
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  ctx.rateLimitScopes.push(
    `click_capture:${hashIp("0.0.0.0")}:${ctx.appId}`
  );

  try {
    sdkBrowserInit({
      baseUrl: "http://refkit.test",
    });

    return await sdkCapture();
  }
  finally {
    for (const [name, descriptor] of [
      ["window", originalWindow],
      ["document", originalDocument],
      ["localStorage", originalLocalStorage],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      }
      else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  }
}

async function identifySeededCustomerThroughSdk(
  ctx: TestContext,
  clickId: string
) {
  ctx.rateLimitScopes.push(`identify:${ctx.apiKeyId}`);

  return sdkIdentifyCustomer({
    apiKey: ctx.apiKey,
    baseUrl: "http://refkit.test",
    clickId,
    externalCustomerId: `ext-${ctx.suffix}`,
    email: `customer-${ctx.suffix}@refkit-vitest.test`,
  });
}

describe("primary revenue user stories", () => {
  let restoreFetch: () => void;

  beforeAll(() => {
    restoreFetch = installSdkRouteAdapter();
    setStripeFetcherForTests(createFixtureFetcher());
    clearFixtureObjects();
  });

  afterAll(() => {
    restoreFetch();
    clearFixtureObjects();
    setStripeFetcherForTests(null);
  });

  it("US-03: SDK attribution + Stripe payment webhook + partial refund webhook", async () => {
    const ctx = await seedAttributionGraph({
      suffix: `us-03-${createTestSuffix()}`,
      includeAttribution: false,
      affiliateTestMode: true,
    });

    try {
      const clickId = await captureClickThroughBrowserSdk(ctx);

      expect(clickId).toMatch(/^clk_/);
      const identified = await identifySeededCustomerThroughSdk(ctx, clickId!);

      expect(identified.attributed).toBe(true);
      expect(identified.stripe_metadata).toEqual({
        refkit_click_id: clickId,
        refkit_customer_id: identified.customer_id,
        refkit_program_id: ctx.programId,
      });

      const payment = await injectCheckoutCompletedEvent({
        appId: ctx.appId,
        sessionId: `cs_test_us03_${ctx.suffix}`,
        amount: 10000,
        currency: "usd",
        metadata: {
          refkit_click_id: clickId!,
          refkit_customer_id: identified.customer_id,
          refkit_program_id: ctx.programId,
        },
      });

      expect(payment.storedEvent).not.toBeNull();
      ctx.stripeConnectionId = payment.storedEvent!.stripeConnectionId;
      await processStoredStripeEvent(payment.storedEvent!.id);

      const refundEvent = await injectChargeRefundedEvent({
        appId: ctx.appId,
        chargeId: payment.chargeId,
        refundId: `re_refund_us03_${ctx.suffix}`,
        amount: 2500,
        currency: "usd",
        metadata: {
          refkit_click_id: clickId!,
          refkit_customer_id: identified.customer_id,
          refkit_program_id: ctx.programId,
        },
      });

      expect(refundEvent).not.toBeNull();
      await processStoredStripeEvent(refundEvent!.id);

      const db = getDb();
      const moneyRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.programId, ctx.programId));
      const ledgerRows = await db
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.programId, ctx.programId));
      const eventRows = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.stripeConnectionId, ctx.stripeConnectionId));

      expect(moneyRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "stripe",
            action: "payment",
            amount: 10000,
            livemode: false,
          }),
          expect.objectContaining({
            source: "stripe",
            action: "refund",
            amount: -2500,
            livemode: false,
          }),
        ])
      );
      expect(ledgerRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "earned", amount: 2000 }),
          expect.objectContaining({ kind: "refund_reversal", amount: -500 }),
        ])
      );
      expect(eventRows).toHaveLength(2);
      expect(eventRows.every((event) => event.processingStatus === "processed")).toBe(true);
    }
    finally {
      await cleanupTestContext(ctx);
    }
  });

  it("US-04: SDK identify + API payment, refund, and dispute lifecycle", async () => {
    const ctx = await seedAttributionGraph({
      suffix: `us-04-${createTestSuffix()}`,
      includeAttribution: false,
      affiliateTestMode: true,
    });

    try {
      await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api");
      ctx.rateLimitScopes.push(`report-payment:${ctx.apiKeyId}`);
      ctx.rateLimitScopes.push(`report-refund:${ctx.apiKeyId}`);
      ctx.rateLimitScopes.push(`report-dispute:${ctx.apiKeyId}`);

      const clickId = await captureClickThroughBrowserSdk(ctx);

      expect(clickId).toMatch(/^clk_/);
      const identified = await identifySeededCustomerThroughSdk(ctx, clickId!);
      const paymentId = `pay_us04_${ctx.suffix}`;
      const payment = await sdkReportPayment({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        paymentId,
        customerId: identified.customer_id,
        programId: identified.program_id,
        amount: 10000,
        currency: "usd",
      });
      const refund = await sdkReportRefund({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        refundId: `refund_us04_${ctx.suffix}`,
        paymentId,
        amount: 2500,
      });
      const disputeId = `dispute_us04_${ctx.suffix}`;
      const opened = await sdkReportDispute({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        disputeId,
        paymentId,
        status: "opened",
        amount: 7500,
      });
      const lost = await sdkReportDispute({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        disputeId,
        paymentId,
        status: "lost",
        amount: 7500,
      });
      const reinstated = await sdkReportDispute({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        disputeId,
        paymentId,
        status: "funds_reinstated",
        amount: 7500,
      });

      expect(payment).toMatchObject({
        attributed: true,
        livemode: false,
        created: true,
      });
      expect(refund).toMatchObject({ livemode: false, created: true });
      expect(opened).toMatchObject({ status: "opened", created: true });
      expect(lost).toMatchObject({ status: "lost", updated: true });
      expect(reinstated).toMatchObject({
        status: "funds_reinstated",
        updated: true,
      });

      const db = getDb();
      const moneyRows = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.programId, ctx.programId),
            eq(transactions.source, "api")
          )
        );
      const ledgerRows = await db
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.programId, ctx.programId));

      expect(moneyRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: "payment", amount: 10000 }),
          expect.objectContaining({ action: "refund", amount: -2500 }),
        ])
      );
      expect(ledgerRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "earned", amount: 2000 }),
          expect.objectContaining({ kind: "refund_reversal", amount: -500 }),
          expect.objectContaining({ kind: "dispute_reversal", amount: -1500 }),
          expect.objectContaining({ kind: "dispute_reinstatement", amount: 1500 }),
        ])
      );
    }
    finally {
      await cleanupTestContext(ctx);
    }
  });
});
