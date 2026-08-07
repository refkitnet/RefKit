import {
  buildStripeEvent,
  registerCheckoutPaymentFixture,
  registerRefundFixture,
} from "@/services/stripe/fixtures";
import {
  ingestStripeEvent,
  processStoredStripeEvent,
} from "@/services/stripe/event-processor";
import {
  createSandboxStripeConnection,
  getStripeConnectionForApp,
} from "@/services/stripe/connected-accounts";
import { registerFixtureObject } from "@/services/stripe/fetcher";

type InjectCheckoutInput = {
  appId: string;
  sessionId?: string;
  amount?: number;
  currency?: string;
  metadata: Record<string, string>;
};

export async function injectCheckoutCompletedEvent(input: InjectCheckoutInput) {
  const connection =
    (await getStripeConnectionForApp(input.appId)) ??
    (await createSandboxStripeConnection(input.appId));

  const sessionId = input.sessionId ?? `cs_test_${Date.now().toString(36)}`;
  const amount = input.amount ?? 5000;
  const currency = input.currency ?? "usd";

  const { session, charge } = registerCheckoutPaymentFixture({
    stripeAccountId: connection.stripeAccountId,
    sessionId,
    amount,
    currency,
    metadata: input.metadata,
    paymentStatus: "paid",
    mode: "payment",
  });

  const event = buildStripeEvent({
    id: `evt_${sessionId.replace("cs_", "")}`,
    type: "checkout.session.completed",
    account: connection.stripeAccountId,
    livemode: false,
    object: session,
  });

  const storedEvent = await ingestStripeEvent({
    stripeAccountId: connection.stripeAccountId,
    event,
  });

  if (storedEvent) {
    await processStoredStripeEvent(storedEvent.id);
  }

  return {
    storedEvent,
    sessionId,
    chargeId: String(charge.id),
  };
}

type InjectRefundInput = {
  appId: string;
  chargeId: string;
  refundId?: string;
  amount: number;
  currency?: string;
  metadata: Record<string, string>;
};

export async function injectChargeRefundedEvent(input: InjectRefundInput) {
  const connection =
    (await getStripeConnectionForApp(input.appId)) ??
    (await createSandboxStripeConnection(input.appId));

  const refundId = input.refundId ?? `re_test_${Date.now().toString(36)}`;
  const currency = input.currency ?? "usd";
  const refund = registerRefundFixture({
    stripeAccountId: connection.stripeAccountId,
    chargeId: input.chargeId,
    refundId,
    amount: input.amount,
    currency,
  });

  registerFixtureObject(connection.stripeAccountId, "charge", {
    id: input.chargeId,
    object: "charge",
    amount: input.amount,
    amount_refunded: input.amount,
    currency,
    metadata: input.metadata,
    refunds: {
      data: [refund],
    },
  });

  const event = buildStripeEvent({
    id: `evt_${refundId.replace("re_", "")}`,
    type: "charge.refunded",
    account: connection.stripeAccountId,
    livemode: false,
    object: {
      id: input.chargeId,
      object: "charge",
      amount: input.amount,
      amount_refunded: input.amount,
      currency,
      metadata: input.metadata,
    },
  });

  const storedEvent = await ingestStripeEvent({
    stripeAccountId: connection.stripeAccountId,
    event,
  });

  if (storedEvent) {
    await processStoredStripeEvent(storedEvent.id);
  }

  return storedEvent;
}

export async function ensureSandboxStripeConnection(appId: string) {
  return (
    (await getStripeConnectionForApp(appId)) ??
    (await createSandboxStripeConnection(appId))
  );
}
