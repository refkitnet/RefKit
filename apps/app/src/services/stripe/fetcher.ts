import { getStripeClient } from "@/services/stripe/client";
import { getStripeRuntimeMode } from "@/services/stripe/config";

export type StripeObjectKind =
  | "checkout.session"
  | "invoice"
  | "invoice_payment"
  | "charge"
  | "refund"
  | "dispute"
  | "payment_intent"
  | "subscription"
  | "customer";

export type StripeFetcher = {
  retrieveCheckoutSession: (
    sessionId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  retrieveInvoice: (
    invoiceId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  listInvoicePayments: (
    invoiceId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>[]>;
  retrieveCharge: (
    chargeId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  retrieveRefund: (
    refundId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  listRefundsForCharge: (
    chargeId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>[]>;
  retrieveDispute: (
    disputeId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  retrievePaymentIntent: (
    paymentIntentId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  retrieveSubscription: (
    subscriptionId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
  retrieveCustomer: (
    customerId: string,
    stripeAccountId: string
  ) => Promise<Record<string, unknown>>;
};

const fixtureObjects = new Map<string, Record<string, unknown>>();

function objectKey(stripeAccountId: string, kind: string, id: string) {
  return `${stripeAccountId}:${kind}:${id}`;
}

export function registerFixtureObject(
  stripeAccountId: string,
  kind: StripeObjectKind,
  object: Record<string, unknown>
) {
  const id = String(object.id ?? "");

  if (!id) {
    throw new Error(`Fixture ${kind} object requires an id.`);
  }

  fixtureObjects.set(objectKey(stripeAccountId, kind, id), object);
  return id;
}

export function clearFixtureObjects() {
  fixtureObjects.clear();
}

export function createFixtureFetcher(): StripeFetcher {
  function getObject(
    stripeAccountId: string,
    kind: StripeObjectKind,
    id: string
  ) {
    const object = fixtureObjects.get(objectKey(stripeAccountId, kind, id));

    if (!object) {
      throw new Error(
        `Fixture object not found: ${kind} ${id} for account ${stripeAccountId}`
      );
    }

    return object;
  }

  return {
    retrieveCheckoutSession: async (sessionId, stripeAccountId) =>
      getObject(stripeAccountId, "checkout.session", sessionId),
    retrieveInvoice: async (invoiceId, stripeAccountId) =>
      getObject(stripeAccountId, "invoice", invoiceId),
    listInvoicePayments: async (invoiceId, stripeAccountId) => {
      const prefix = `${stripeAccountId}:invoice_payment:`;

      return [...fixtureObjects.entries()]
        .filter(
          ([key, object]) =>
            key.startsWith(prefix)
            && String(object.invoice ?? "") === invoiceId
            && String(object.status ?? "") === "paid"
        )
        .map(([, object]) => object);
    },
    retrieveCharge: async (chargeId, stripeAccountId) =>
      getObject(stripeAccountId, "charge", chargeId),
    retrieveRefund: async (refundId, stripeAccountId) =>
      getObject(stripeAccountId, "refund", refundId),
    listRefundsForCharge: async (chargeId, stripeAccountId) => {
      const prefix = `${stripeAccountId}:refund:`;

      return [...fixtureObjects.entries()]
        .filter(
          ([key, object]) =>
            key.startsWith(prefix) && String(object.charge ?? "") === chargeId
        )
        .map(([, object]) => object);
    },
    retrieveDispute: async (disputeId, stripeAccountId) =>
      getObject(stripeAccountId, "dispute", disputeId),
    retrievePaymentIntent: async (paymentIntentId, stripeAccountId) =>
      getObject(stripeAccountId, "payment_intent", paymentIntentId),
    retrieveSubscription: async (subscriptionId, stripeAccountId) =>
      getObject(stripeAccountId, "subscription", subscriptionId),
    retrieveCustomer: async (customerId, stripeAccountId) =>
      getObject(stripeAccountId, "customer", customerId),
  };
}

export function createLiveStripeFetcher(livemode = true): StripeFetcher {
  function connectOptions(stripeAccountId: string) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.STRIPE_DIRECT_ACCOUNT_ID &&
      process.env.STRIPE_DIRECT_ACCOUNT_ID === stripeAccountId
    ) {
      return {};
    }

    return { stripeAccount: stripeAccountId };
  }

  return {
    retrieveCheckoutSession: async (sessionId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.checkout.sessions.retrieve(
        sessionId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    retrieveInvoice: async (invoiceId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.invoices.retrieve(
        invoiceId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    listInvoicePayments: async (invoiceId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      const payments = await stripe.invoicePayments
        .list(
          { invoice: invoiceId, status: "paid", limit: 100 },
          connectOptions(stripeAccountId)
        )
        .autoPagingToArray({ limit: 1000 });

      return payments as unknown as Record<string, unknown>[];
    },
    retrieveCharge: async (chargeId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.charges.retrieve(
        chargeId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    retrieveRefund: async (refundId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.refunds.retrieve(
        refundId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    listRefundsForCharge: async (chargeId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      const refunds = await stripe.refunds
        .list(
          { charge: chargeId, limit: 100 },
          connectOptions(stripeAccountId)
        )
        .autoPagingToArray({ limit: 1000 });

      return refunds as unknown as Record<string, unknown>[];
    },
    retrieveDispute: async (disputeId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.disputes.retrieve(
        disputeId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    retrievePaymentIntent: async (paymentIntentId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    retrieveSubscription: async (subscriptionId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.subscriptions.retrieve(
        subscriptionId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
    retrieveCustomer: async (customerId, stripeAccountId) => {
      const stripe = getStripeClient({ livemode });
      return (await stripe.customers.retrieve(
        customerId,
        {},
        connectOptions(stripeAccountId)
      )) as unknown as Record<string, unknown>;
    },
  };
}

let fetcher: StripeFetcher | null = null;
const liveFetchers = new Map<boolean, StripeFetcher>();

export function getStripeFetcher(livemode = true): StripeFetcher {
  if (getStripeRuntimeMode() === "fixture") {
    if (!fetcher) {
      fetcher = createFixtureFetcher();
    }

    return fetcher;
  }

  if (!liveFetchers.has(livemode)) {
    liveFetchers.set(livemode, createLiveStripeFetcher(livemode));
  }

  return liveFetchers.get(livemode)!;
}

export function setStripeFetcherForTests(nextFetcher: StripeFetcher | null) {
  fetcher = nextFetcher;
  liveFetchers.clear();
}
