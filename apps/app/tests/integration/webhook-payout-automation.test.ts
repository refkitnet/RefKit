import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  payoutExecutions,
  payoutItems,
  programs,
  transactions,
  webhookDeliveries,
} from "@/db/schema";
import { resetServerEnvCache } from "@/lib/env";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { requireLiveAppScopedKey } from "@/lib/auth-context";
import { createApiKey } from "@/services/api-keys";
import {
  dispatchPayoutBatch,
  getPayoutExecutionForApp,
  markPayoutExecutionFailed,
  markPayoutExecutionSucceeded,
  readPayoutExecutionInstructions,
} from "@/services/payouts/payout-executions";
import {
  createPayoutRun,
  generatePayoutRunCsv,
} from "@/services/payouts/payout-batches";
import { saveAffiliatePayoutDetails } from "@/services/payouts/payout-details";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";
import {
  configureWebhookEndpoint,
  assertWebhookUrlAllowed,
  emitWebhookEvent,
  isPrivateNetworkAddress,
  rotateWebhookSecret,
} from "@/services/webhooks";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

async function seedCommission(ctx: TestContext) {
  const db = getDb();
  const connection = await createSandboxStripeConnection(ctx.appId);
  const transactionId = generateId(ID_PREFIXES.transaction);
  const entryId = generateId(ID_PREFIXES.commissionEntry);

  await db.insert(transactions).values({
    id: transactionId,
    appId: ctx.appId,
    source: "stripe",
    externalId: `pay-${ctx.suffix}`,
    stripeConnectionId: connection.id,
    programId: ctx.programId,
    customerId: ctx.customerId,
    programAffiliateId: ctx.programAffiliateId,
    stripeObjectId: `pay-${ctx.suffix}`,
    action: "payment",
    amount: 50_000,
    currency: "usd",
    livemode: true,
    transactionDate: new Date(),
  });
  await db.insert(commissionEntries).values({
    id: entryId,
    transactionId,
    programId: ctx.programId,
    programAffiliateId: ctx.programAffiliateId,
    customerId: ctx.customerId,
    ruleId: ctx.ruleId,
    kind: "earned",
    amount: 10_000,
    currency: "usd",
    exchangeRate: "1",
    originalAmount: 50_000,
    originalCurrency: "usd",
    status: "approved",
    livemode: true,
  });

  return entryId;
}

describe("lean webhook and external payout automation", () => {
  let ctx: TestContext;
  let commissionEntryId: string;

  beforeAll(async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    resetServerEnvCache();
    ctx = await seedAttributionGraph();
    await getDb()
      .update(programs)
      .set({
        minimumPayoutAmount: 5_000,
        supportedPayoutMethods: ["paypal"],
      })
      .where(eq(programs.id, ctx.programId));
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `pay-${ctx.suffix}@example.com`,
    });
    commissionEntryId = await seedCommission(ctx);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    resetServerEnvCache();
    await cleanupTestContext(ctx);
  });

  it("blocks private addresses by default", async () => {
    expect(isPrivateNetworkAddress("127.0.0.1")).toBe(true);
    expect(isPrivateNetworkAddress("10.2.3.4")).toBe(true);
    expect(isPrivateNetworkAddress("::1")).toBe(true);
    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);

    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "false";
    resetServerEnvCache();
    await expect(assertWebhookUrlAllowed("https://127.0.0.1/hook"))
      .rejects.toMatchObject({ code: "private_webhook_url_blocked" });
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "true";
    resetServerEnvCache();
  });

  it("requires a live key scoped to the exact App", async () => {
    const organizationKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      name: `Organization key ${ctx.suffix}`,
    });
    const liveAppKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Live App key ${ctx.suffix}`,
    });
    ctx.affiliateApiKeyIds = [organizationKey.id, liveAppKey.id];

    const requestFor = (key: string) =>
      new Request("https://app.refkit.test/v1/payout-executions/example", {
        headers: { Authorization: `Bearer ${key}` },
      });

    await expect(requireLiveAppScopedKey(requestFor(ctx.apiKey))).rejects
      .toMatchObject({ code: "live_app_scoped_key_required" });
    await expect(requireLiveAppScopedKey(requestFor(organizationKey.key)))
      .rejects.toMatchObject({ code: "live_app_scoped_key_required" });
    await expect(requireLiveAppScopedKey(requestFor(liveAppKey.key))).resolves
      .toMatchObject({ appId: ctx.appId, testMode: false });
  });

  it("signs, filters, records, and rotates a webhook secret", async () => {
    const requests: Array<{ body: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        requests.push({
          body: String(init?.body ?? ""),
          headers: init?.headers as Record<string, string>,
        });
        return new Response("x".repeat(3_000), { status: 202 });
      })
    );

    const configured = await configureWebhookEndpoint(
      ctx.ownerUserId,
      ctx.appId,
      {
        url: "https://127.0.0.1/webhooks/refkit",
        enabledEvents: ["payout.ready"],
        enabled: true,
      }
    );
    expect(configured.secret).toMatch(/^whsec_/);

    await emitWebhookEvent({
      appId: ctx.appId,
      eventType: "affiliate.created",
      livemode: true,
      data: { id: "ignored" },
    });
    expect(requests).toHaveLength(0);

    const delivery = await emitWebhookEvent({
      appId: ctx.appId,
      eventType: "payout.ready",
      livemode: true,
      data: { id: "payout-example" },
    });
    expect(delivery?.success).toBe(true);
    expect(requests).toHaveLength(1);

    const timestamp = requests[0]!.headers["X-RefKit-Webhook-Timestamp"];
    const expected = createHmac("sha256", configured.secret!)
      .update(`${timestamp}.${requests[0]!.body}`)
      .digest("hex");
    expect(requests[0]!.headers["X-RefKit-Webhook-Signature"]).toBe(
      `v1=${expected}`
    );

    const rows = await getDb()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.appId, ctx.appId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ success: true, httpStatus: 202 });
    expect(rows[0]!.response).toHaveLength(2_000);

    const rotated = await rotateWebhookSecret(ctx.ownerUserId, ctx.appId);
    expect(rotated.secret).not.toBe(configured.secret);
  });

  it("dispatches encrypted instructions and supports failed to succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Payout system unavailable");
      })
    );
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    await generatePayoutRunCsv(ctx.ownerUserId, run.id);

    const executions = await dispatchPayoutBatch(ctx.ownerUserId, run.id);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      status: "ready",
      amount: 10_000,
      currency: "usd",
      method: "paypal",
    });
    const failedReadyDelivery = await getDb()
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.eventType, "payout.ready"));
    expect(failedReadyDelivery.some((delivery) => !delivery.success)).toBe(true);
    expect(executions[0]!.instructionSnapshotEncrypted).not.toContain(
      `pay-${ctx.suffix}@example.com`
    );
    expect(readPayoutExecutionInstructions(executions[0]!)).toEqual({
      email: `pay-${ctx.suffix}@example.com`,
    });

    await expect(
      dispatchPayoutBatch(ctx.ownerUserId, run.id)
    ).rejects.toMatchObject({ code: "payout_batch_already_dispatched" });

    const executionId = executions[0]!.id;
    const failed = await markPayoutExecutionFailed(ctx.appId, executionId, {
      failureReason: "Bank rejected the transfer",
      idempotencyKey: "failure-1",
    });
    expect(failed.status).toBe("failed");

    const itemsAfterFailure = await getDb()
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.payoutBatchId, run.id));
    expect(itemsAfterFailure.every((item) => item.status === "pending")).toBe(true);

    await expect(
      markPayoutExecutionFailed(ctx.appId, executionId, {
        failureReason: "Bank rejected the transfer",
        idempotencyKey: "failure-1",
      })
    ).resolves.toMatchObject({ status: "failed" });
    await expect(
      markPayoutExecutionFailed(ctx.appId, executionId, {
        failureReason: "Different result",
        idempotencyKey: "failure-1",
      })
    ).rejects.toMatchObject({ code: "idempotency_key_conflict" });

    const succeeded = await markPayoutExecutionSucceeded(
      ctx.ownerUserId,
      ctx.appId,
      executionId,
      {
        externalReference: "transfer-123",
        idempotencyKey: "success-1",
      }
    );
    expect(succeeded).toMatchObject({
      status: "succeeded",
      externalReference: "transfer-123",
      completionSource: "external",
    });

    const [entry] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, commissionEntryId));
    expect(entry?.status).toBe("paid");
    await expect(
      getPayoutExecutionForApp("app_wrong", executionId)
    ).rejects.toMatchObject({ code: "payout_execution_not_found" });

    const [stored] = await getDb()
      .select()
      .from(payoutExecutions)
      .where(eq(payoutExecutions.id, executionId));
    expect(stored?.succeededAt).toBeInstanceOf(Date);
  });
});
