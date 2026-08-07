import { registerFixtureObject } from "@/services/stripe/fetcher";

type CheckoutFixtureInput = {
  stripeAccountId: string;
  sessionId: string;
  paymentIntentId?: string;
  chargeId?: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  paymentStatus?: "paid" | "unpaid";
  mode?: "payment" | "subscription";
  created?: number;
};

export function registerCheckoutPaymentFixture(input: CheckoutFixtureInput) {
  const paymentIntentId =
    input.paymentIntentId ?? `pi_fixture_${input.sessionId.replace("cs_", "")}`;
  const chargeId =
    input.chargeId ?? `ch_fixture_${input.sessionId.replace("cs_", "")}`;

  const session = {
    id: input.sessionId,
    object: "checkout.session",
    mode: input.mode ?? "payment",
    payment_status: input.paymentStatus ?? "paid",
    amount_total: input.amount,
    currency: input.currency,
    metadata: input.metadata,
    payment_intent: paymentIntentId,
    created: input.created ?? Math.floor(Date.now() / 1000),
  };

  const paymentIntent = {
    id: paymentIntentId,
    object: "payment_intent",
    amount: input.amount,
    amount_received: input.paymentStatus === "paid" ? input.amount : 0,
    currency: input.currency,
    metadata: input.metadata,
    latest_charge: chargeId,
  };

  const charge = {
    id: chargeId,
    object: "charge",
    amount: input.amount,
    amount_refunded: 0,
    currency: input.currency,
    metadata: input.metadata,
    refunds: {
      data: [],
    },
  };

  registerFixtureObject(input.stripeAccountId, "checkout.session", session);
  registerFixtureObject(input.stripeAccountId, "payment_intent", paymentIntent);
  registerFixtureObject(input.stripeAccountId, "charge", charge);

  return {
    session,
    paymentIntent,
    charge,
  };
}

type RefundFixtureInput = {
  stripeAccountId: string;
  chargeId: string;
  refundId: string;
  amount: number;
  currency: string;
  created?: number;
};

export function registerRefundFixture(input: RefundFixtureInput) {
  const refund = {
    id: input.refundId,
    object: "refund",
    amount: input.amount,
    currency: input.currency,
    charge: input.chargeId,
    created: input.created ?? Math.floor(Date.now() / 1000),
  };

  registerFixtureObject(input.stripeAccountId, "refund", refund);
  return refund;
}

export function buildStripeEvent(input: {
  id: string;
  type: string;
  account: string;
  livemode?: boolean;
  created?: number;
  object: Record<string, unknown>;
}) {
  return {
    id: input.id,
    object: "event",
    type: input.type,
    account: input.account,
    livemode: input.livemode ?? false,
    created: input.created ?? Math.floor(Date.now() / 1000),
    data: {
      object: input.object,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function hydrateFixturesFromStoredEvent(
  stripeAccountId: string,
  event: Record<string, unknown>
) {
  const eventType = readString(event.type);
  const object = asRecord(asRecord(event.data).object);

  if (!eventType || !readString(object.id)) {
    return;
  }

  if (
    eventType === "checkout.session.completed" ||
    eventType === "checkout.session.async_payment_succeeded"
  ) {
    registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId: readString(object.id)!,
      amount: Number(object.amount_total ?? 0),
      currency: readString(object.currency) ?? "usd",
      metadata: asRecord(object.metadata) as Record<string, string>,
      paymentStatus:
        readString(object.payment_status) === "paid" ? "paid" : "unpaid",
      mode: readString(object.mode) === "subscription" ? "subscription" : "payment",
      created: Number(object.created ?? Math.floor(Date.now() / 1000)),
    });
    return;
  }

  if (eventType === "charge.refunded") {
    registerFixtureObject(stripeAccountId, "charge", object);

    const refunds = asRecord(object.refunds);
    const rows = Array.isArray(refunds.data) ? refunds.data : [];
    const chargeId = readString(object.id);

    for (const row of rows) {
      const refund = asRecord(row);
      registerFixtureObject(stripeAccountId, "refund", {
        ...refund,
        charge: readString(refund.charge) ?? chargeId,
      });
    }

    return;
  }

  if (eventType === "invoice.paid") {
    registerFixtureObject(stripeAccountId, "invoice", object);

    const payments = asRecord(object.payments);
    const rows = Array.isArray(payments.data) ? payments.data : [];

    for (const row of rows) {
      const invoicePayment = asRecord(row);
      registerFixtureObject(stripeAccountId, "invoice_payment", invoicePayment);

      const payment = asRecord(invoicePayment.payment);
      const paymentIntent = asRecord(payment.payment_intent);
      const charge = asRecord(payment.charge);

      if (readString(paymentIntent.id)) {
        registerFixtureObject(
          stripeAccountId,
          "payment_intent",
          paymentIntent
        );
      }

      if (readString(charge.id)) {
        registerFixtureObject(stripeAccountId, "charge", charge);
      }
    }

    return;
  }

  if (eventType.startsWith("charge.dispute.")) {
    registerFixtureObject(stripeAccountId, "dispute", object);
  }
}
