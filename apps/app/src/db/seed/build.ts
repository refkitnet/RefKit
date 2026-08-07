import { getDb } from "@/db/client";
import {
  commissionEntries,
  payoutItems,
  payoutBatches,
  stripeConnections,
  transactions,
} from "@/db/schema";
import type { AppKeyAuthContext } from "@/lib/auth-context";
import {
  SEED_AFFILIATES,
  SEED_API_KEYS,
  SEED_APPS,
  SEED_LEDGERKIT,
  SEED_ORGS,
  SEED_PAYOUT,
  SEED_PROGRAMS,
  SEED_STRIPE,
  SEED_USERS,
} from "@/db/seed/ids";
import {
  upsertSeedAffiliate,
  upsertSeedApiKey,
  upsertSeedApp,
  upsertSeedClick,
  upsertSeedCustomer,
  upsertSeedPreparedPayoutBatch,
  upsertSeedOpenPayoutRequest,
  upsertSeedOrganization,
  upsertSeedPayoutDetails,
  upsertSeedProgram,
  upsertSeedReferral,
  upsertSeedUser,
} from "@/db/seed/upsert";
import { listPayoutableCommissionEntries } from "@/services/payouts/balance";
import {
  reportPayment,
  reportRefund,
} from "@/services/revenue/report-payment";
import { processStoredStripeEvent } from "@/services/stripe/event-processor";
import {
  injectChargeRefundedEvent,
  injectCheckoutCompletedEvent,
} from "@/services/stripe/test-inject";

type SeedApp = (typeof SEED_APPS)[keyof typeof SEED_APPS];
type SeedApiKey = (typeof SEED_API_KEYS)[keyof typeof SEED_API_KEYS];

function installSeedApp(app: SeedApp) {
  return upsertSeedApp({
    id: app.id,
    organizationId: app.orgId,
    name: app.name,
    revenueSource: app.revenueSource,
    destinationUrl: app.destinationUrl,
  });
}

function installSeedApiKey(key: SeedApiKey) {
  return upsertSeedApiKey({
    id: key.id,
    userId: key.ownerId,
    organizationId: key.orgId,
    appId: key.appId,
    name: key.name,
    rawKey: key.rawKey,
  });
}

function ledgerkitAuth(): AppKeyAuthContext {
  const apiKey = SEED_API_KEYS.ledgerkitLive;

  return {
    type: "app_key",
    userId: apiKey.ownerId,
    keyId: apiKey.id,
    organizationId: apiKey.orgId,
    appId: apiKey.appId,
    testMode: false,
  };
}

async function processSeedStripeEvent(
  storedEvent: { id: string } | null | undefined
) {
  if (!storedEvent) {
    throw new Error("Seed Stripe event was not stored.");
  }

  await processStoredStripeEvent(storedEvent.id);
}

async function seedJordanPayoutDetails() {
  await upsertSeedPayoutDetails({
    id: "pdt_seed_jordan_paypal",
    programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
    method: "paypal",
    details: {
      email: SEED_USERS.jordan.email,
    },
  });
}

async function seedUsersAndOrgs() {
  for (const user of Object.values(SEED_USERS)) {
    await upsertSeedUser(user);
  }

  for (const org of Object.values(SEED_ORGS)) {
    await upsertSeedOrganization(org);
  }

}

async function seedMarcusFresh() {
  // Org only - no app.
}

async function seedPriyaEarlySetup() {
  const app = SEED_APPS.lumina;
  const program = SEED_PROGRAMS.lumina;

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
  });
  await installSeedApiKey(SEED_API_KEYS.lumina);
}

async function seedDiegoStripeRevenue() {
  const db = getDb();
  const app = SEED_APPS.shipfast;
  const program = SEED_PROGRAMS.shipfast;
  const affiliate = SEED_AFFILIATES.jordanShipfast;
  const connection = SEED_STRIPE.shipfastConnection;
  const checkout = SEED_STRIPE.shipfastCheckout;

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
    options: {
      minimumPayoutAmount: 5000,
      supportedPayoutMethods: ["paypal"],
    },
  });
  await installSeedApiKey(SEED_API_KEYS.shipfast);

  await upsertSeedAffiliate({
    ...affiliate,
    status: "active",
    isTest: true,
  });

  await upsertSeedClick({
    id: "clk_seed_shipfast_1",
    affiliateLinkId: affiliate.linkId,
    programId: program.id,
    programAffiliateId: affiliate.id,
    suffix: "shipfast-1",
  });

  await upsertSeedClick({
    id: "clk_seed_shipfast_2",
    affiliateLinkId: affiliate.linkId,
    programId: program.id,
    programAffiliateId: affiliate.id,
    suffix: "shipfast-2",
  });

  await upsertSeedCustomer({
    id: "rcus_seed_shipfast_1",
    appId: app.id,
    externalCustomerId: "shipfast-user-1",
    email: "customer1@shipfast.demo",
  });

  await upsertSeedCustomer({
    id: "rcus_seed_shipfast_2",
    appId: app.id,
    externalCustomerId: "shipfast-user-2",
    email: "customer2@shipfast.demo",
  });

  await upsertSeedReferral({
    id: "ref_seed_shipfast_1",
    customerId: "rcus_seed_shipfast_1",
    programId: program.id,
    programAffiliateId: affiliate.id,
    clickId: "clk_seed_shipfast_1",
  });

  await upsertSeedReferral({
    id: "ref_seed_shipfast_2",
    customerId: "rcus_seed_shipfast_2",
    programId: program.id,
    programAffiliateId: affiliate.id,
    clickId: "clk_seed_shipfast_2",
  });

  await db
    .insert(stripeConnections)
    .values({
      id: connection.id,
      appId: connection.appId,
      stripeAccountId: connection.stripeAccountId,
      livemode: false,
      status: "connected",
    })
    .onConflictDoNothing();

  const metadata = {
    refkit_click_id: "clk_seed_shipfast_1",
    refkit_customer_id: "rcus_seed_shipfast_1",
    refkit_program_id: program.id,
  };
  const payment = await injectCheckoutCompletedEvent({
    appId: app.id,
    sessionId: checkout.sessionId,
    amount: checkout.paymentAmount,
    currency: "usd",
    metadata,
  });

  await processSeedStripeEvent(payment.storedEvent);

  const refund = await injectChargeRefundedEvent({
    appId: app.id,
    chargeId: payment.chargeId,
    refundId: checkout.refundId,
    amount: checkout.refundAmount,
    currency: "usd",
    metadata,
  });

  await processSeedStripeEvent(refund);
}

async function seedAlexDualRole() {
  const app = SEED_APPS.pixelforge;
  const program = SEED_PROGRAMS.pixelforge;
  const affiliate = SEED_AFFILIATES.alexLumina;

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
  });

  await upsertSeedAffiliate({
    ...affiliate,
    status: "active",
  });
}

async function seedMeiJoinPage() {
  const app = SEED_APPS.zenforms;
  const program = SEED_PROGRAMS.zenforms;

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
    options: {
      joinPageEnabled: true,
      joinPageApproval: "pending",
      minimumPayoutAmount: 5000,
      supportedPayoutMethods: ["paypal"],
    },
  });

  await upsertSeedAffiliate({
    ...SEED_AFFILIATES.meiZenformsActive,
    status: "active",
  });

  await upsertSeedAffiliate({
    ...SEED_AFFILIATES.samZenforms,
    status: "pending",
  });

  await upsertSeedAffiliate({
    id: "aff_seed_pending_zenforms_2",
    userId: SEED_USERS.riley.id,
    programId: program.id,
    linkCode: "riley-zen-pending",
    linkId: "lnk_seed_pending_zenforms_2",
    status: "pending",
  });

  await upsertSeedAffiliate({
    id: "aff_seed_nina_zenforms",
    userId: SEED_USERS.nina.id,
    programId: program.id,
    linkCode: "nina-zen",
    linkId: "lnk_seed_nina_zenforms",
    status: "disabled",
  });
}

async function seedTomasApiRevenue() {
  const app = SEED_APPS.ledgerkit;
  const program = SEED_PROGRAMS.ledgerkit;
  const affiliate = SEED_AFFILIATES.ledgerkitPartner;
  const apiKey = SEED_API_KEYS.ledgerkit;
  const ledgerkit = SEED_LEDGERKIT;
  const auth = ledgerkitAuth();

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
    options: {
      minimumPayoutAmount: 5000,
      supportedPayoutMethods: ["paypal"],
    },
  });
  await installSeedApiKey(apiKey);
  await installSeedApiKey(SEED_API_KEYS.ledgerkitLive);

  await upsertSeedAffiliate({
    ...affiliate,
    status: "active",
  });

  await upsertSeedClick({
    id: "clk_seed_ledgerkit_1",
    affiliateLinkId: affiliate.linkId,
    programId: program.id,
    programAffiliateId: affiliate.id,
    suffix: "ledgerkit-1",
  });

  await upsertSeedClick({
    id: "clk_seed_ledgerkit_2",
    affiliateLinkId: affiliate.linkId,
    programId: program.id,
    programAffiliateId: affiliate.id,
    suffix: "ledgerkit-2",
  });

  await upsertSeedCustomer({
    id: ledgerkit.customerReferred1,
    appId: app.id,
    externalCustomerId: "ledgerkit-acme-corp",
    email: "billing@acme-corp.demo",
  });

  await upsertSeedCustomer({
    id: ledgerkit.customerReferred2,
    appId: app.id,
    externalCustomerId: "ledgerkit-northwind",
    email: "finance@northwind.demo",
  });

  await upsertSeedCustomer({
    id: ledgerkit.customerOrganic,
    appId: app.id,
    externalCustomerId: "ledgerkit-direct-signup",
    email: "owner@direct-signup.demo",
  });

  await upsertSeedReferral({
    id: "ref_seed_ledgerkit_1",
    customerId: ledgerkit.customerReferred1,
    programId: program.id,
    programAffiliateId: affiliate.id,
    clickId: "clk_seed_ledgerkit_1",
  });

  await upsertSeedReferral({
    id: "ref_seed_ledgerkit_2",
    customerId: ledgerkit.customerReferred2,
    programId: program.id,
    programAffiliateId: affiliate.id,
    clickId: "clk_seed_ledgerkit_2",
  });

  await reportPayment(auth, {
    paymentId: ledgerkit.paymentAnnual,
    customerId: ledgerkit.customerReferred1,
    programId: program.id,
    amount: 9900,
    currency: "usd",
    paidAt: new Date("2026-03-15T10:00:00.000Z"),
  });

  await reportRefund(auth, {
    refundId: ledgerkit.refundPartial,
    paymentId: ledgerkit.paymentAnnual,
    amount: 2000,
    refundedAt: new Date("2026-03-20T10:00:00.000Z"),
  });

  await reportPayment(auth, {
    paymentId: ledgerkit.paymentMonthly,
    customerId: ledgerkit.customerReferred1,
    programId: program.id,
    amount: 4900,
    currency: "usd",
    paidAt: new Date("2026-04-01T10:00:00.000Z"),
  });

  await reportPayment(auth, {
    paymentId: ledgerkit.paymentTeam,
    customerId: ledgerkit.customerReferred2,
    programId: program.id,
    amount: 14900,
    currency: "usd",
    paidAt: new Date("2026-04-10T10:00:00.000Z"),
  });

  await reportPayment(auth, {
    paymentId: ledgerkit.paymentOrganic,
    customerId: ledgerkit.customerOrganic,
    programId: program.id,
    amount: 7900,
    currency: "usd",
    paidAt: new Date("2026-04-12T10:00:00.000Z"),
  });

  const ledgerkitPayable = (
    await listPayoutableCommissionEntries(program.id, {
      affiliateId: affiliate.id,
    })
  ).filter((row) => row.payoutAmount !== 0);
  const ledgerkitPayoutAmount = ledgerkitPayable.reduce(
    (sum, row) => sum + row.payoutAmount,
    0
  );

  if (
    ledgerkitPayable.length > 0 &&
    ledgerkitPayoutAmount >= 5000
  ) {
    await upsertSeedOpenPayoutRequest({
      id: SEED_PAYOUT.ledgerkitRequestId,
      programId: program.id,
      programAffiliateId: affiliate.id,
      amount: ledgerkitPayoutAmount,
      currency: "usd",
      commissionEntryIds: ledgerkitPayable.map((row) => row.entry.id),
    });
  }
}

async function seedElenaChartgrid() {
  const db = getDb();
  const app = SEED_APPS.chartgrid;
  const program = SEED_PROGRAMS.chartgrid;
  const connection = SEED_STRIPE.chartgridConnection;
  const payout = SEED_PAYOUT.chartgridRun;

  await installSeedApp(app);
  await upsertSeedProgram({
    ...program,
    currency: "usd",
    destinationUrl: app.destinationUrl,
    options: {
      minimumPayoutAmount: 5000,
      supportedPayoutMethods: ["paypal"],
    },
  });
  await installSeedApiKey(SEED_API_KEYS.chartgrid);

  await db
    .insert(stripeConnections)
    .values({
      id: connection.id,
      appId: connection.appId,
      stripeAccountId: connection.stripeAccountId,
      livemode: true,
      status: "connected",
    })
    .onConflictDoUpdate({
      target: stripeConnections.id,
      set: { livemode: true, status: "connected" },
    });

  const affiliateRows = [
    { ...SEED_AFFILIATES.jordanChartgrid, status: "active" as const },
    { ...SEED_AFFILIATES.rileyChartgrid, status: "active" as const },
    { ...SEED_AFFILIATES.ninaChartgrid, status: "disabled" as const },
  ];

  for (const affiliate of affiliateRows) {
    await upsertSeedAffiliate(affiliate);
  }

  await seedJordanPayoutDetails();

  const clickReferralSets = [
    {
      affiliate: SEED_AFFILIATES.jordanChartgrid,
      clicks: 6,
      referrals: 4,
    },
    {
      affiliate: SEED_AFFILIATES.rileyChartgrid,
      clicks: 4,
      referrals: 2,
    },
    {
      affiliate: SEED_AFFILIATES.ninaChartgrid,
      clicks: 2,
      referrals: 1,
    },
  ];

  for (const set of clickReferralSets) {
    for (let i = 0; i < set.clicks; i++) {
      await upsertSeedClick({
        id: `clk_seed_chartgrid_${set.affiliate.linkCode}_${i + 1}`,
        affiliateLinkId: set.affiliate.linkId,
        programId: program.id,
        programAffiliateId: set.affiliate.id,
        suffix: `${set.affiliate.linkCode}-${i + 1}`,
      });
    }

    for (let i = 0; i < set.referrals; i++) {
      const customerId = `rcus_seed_chartgrid_${set.affiliate.linkCode}_${i + 1}`;

      await upsertSeedCustomer({
        id: customerId,
        appId: app.id,
        externalCustomerId: `${set.affiliate.linkCode}-user-${i + 1}`,
        email: `${set.affiliate.linkCode}-customer${i + 1}@chartgrid.demo`,
      });

      await upsertSeedReferral({
        id: `ref_seed_chartgrid_${set.affiliate.linkCode}_${i + 1}`,
        customerId,
        programId: program.id,
        programAffiliateId: set.affiliate.id,
        clickId: `clk_seed_chartgrid_${set.affiliate.linkCode}_${i + 1}`,
      });
    }
  }

  const commissionRows = [
    {
      id: "cme_seed_jordan_approved_1",
      transactionId: "rtxn_seed_jordan_approved_1",
      externalId: "cs_seed_jordan_approved_1",
      programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
      customerId: "rcus_seed_chartgrid_jordan-grid_1",
      paymentAmount: 120000,
      commissionAmount: 24000,
      status: "approved",
    },
    {
      id: "cme_seed_jordan_approved_2",
      transactionId: "rtxn_seed_jordan_approved_2",
      externalId: "cs_seed_jordan_approved_2",
      programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
      customerId: "rcus_seed_chartgrid_jordan-grid_2",
      paymentAmount: 64000,
      commissionAmount: 12800,
      status: "approved",
    },
    {
      id: "cme_seed_jordan_approved_3",
      transactionId: "rtxn_seed_jordan_approved_3",
      externalId: "cs_seed_jordan_approved_3",
      programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
      customerId: "rcus_seed_chartgrid_jordan-grid_3",
      paymentAmount: 46000,
      commissionAmount: 9200,
      status: "approved",
    },
    {
      id: payout.rileyCommissionId,
      transactionId: "rtxn_seed_riley_paid_1",
      externalId: "cs_seed_riley_paid_1",
      programAffiliateId: SEED_AFFILIATES.rileyChartgrid.id,
      customerId: "rcus_seed_chartgrid_riley-grid_1",
      paymentAmount: 98000,
      commissionAmount: 19600,
      status: "paid",
    },
    {
      id: "cme_seed_nina_earned_1",
      transactionId: "rtxn_seed_nina_earned_1",
      externalId: "cs_seed_nina_earned_1",
      programAffiliateId: SEED_AFFILIATES.ninaChartgrid.id,
      customerId: "rcus_seed_chartgrid_nina-grid_1",
      paymentAmount: 12000,
      commissionAmount: 2400,
      status: "approved",
    },
  ];

  for (const row of commissionRows) {
    await db
      .insert(transactions)
      .values({
        id: row.transactionId,
        appId: app.id,
        source: "stripe",
        externalId: row.externalId,
        stripeConnectionId: connection.id,
        programId: program.id,
        customerId: row.customerId,
        programAffiliateId: row.programAffiliateId,
        stripeObjectId: row.externalId,
        stripeChargeId: row.externalId.replace("cs_", "ch_"),
        action: "payment",
        amount: row.paymentAmount,
        currency: "usd",
        livemode: true,
        transactionDate: new Date("2026-05-01T12:00:00.000Z"),
      })
      .onConflictDoUpdate({
        target: transactions.id,
        set: { livemode: true },
      });

    await db
      .insert(commissionEntries)
      .values({
        id: row.id,
        transactionId: row.transactionId,
        programId: program.id,
        programAffiliateId: row.programAffiliateId,
        customerId: row.customerId,
        ruleId: program.ruleId,
        kind: "earned",
        amount: row.commissionAmount,
        currency: "usd",
        exchangeRate: "1",
        originalAmount: row.paymentAmount,
        originalCurrency: "usd",
        status: row.status,
        livemode: true,
        approvedAt:
          row.status === "approved" || row.status === "paid"
            ? new Date("2026-05-02T12:00:00.000Z")
            : null,
      })
      .onConflictDoUpdate({
        target: commissionEntries.id,
        set: { livemode: true },
      });
  }

  await db
    .insert(transactions)
    .values({
      id: "rtxn_seed_chartgrid_organic_1",
      appId: app.id,
      source: "stripe",
      externalId: "cs_seed_chartgrid_organic_1",
      stripeConnectionId: connection.id,
      programId: program.id,
      customerId: null,
      programAffiliateId: null,
      stripeObjectId: "cs_seed_chartgrid_organic_1",
      stripeChargeId: "ch_seed_chartgrid_organic_1",
      action: "payment",
      amount: 45000,
      currency: "usd",
      livemode: true,
      transactionDate: new Date("2026-05-03T12:00:00.000Z"),
    })
    .onConflictDoUpdate({
      target: transactions.id,
      set: { livemode: true },
    });

  await db
    .insert(payoutBatches)
    .values({
      id: payout.id,
      programId: program.id,
      status: "paid",
    })
    .onConflictDoNothing();

  await db
    .insert(payoutItems)
    .values({
      id: payout.itemId,
      payoutBatchId: payout.id,
      commissionEntryId: payout.rileyCommissionId,
      programAffiliateId: SEED_AFFILIATES.rileyChartgrid.id,
      amount: 19600,
      currency: "usd",
      status: "paid",
      batchStatus: "paid",
      externalReference: "PAYPAL-SEED-001",
    })
    .onConflictDoNothing();

  const jordanRequestCommissionIds = [
    "cme_seed_jordan_approved_1",
    "cme_seed_jordan_approved_2",
  ] as const;

  await upsertSeedOpenPayoutRequest({
    id: payout.jordanRequestId,
    programId: program.id,
    programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
    amount: 36800,
    currency: "usd",
    commissionEntryIds: [...jordanRequestCommissionIds],
  });

  await upsertSeedPreparedPayoutBatch({
    batchId: payout.jordanPendingBatchId,
    programId: program.id,
    requestId: payout.jordanRequestId,
    items: [
      {
        id: payout.jordanPendingItemIds[0],
        commissionEntryId: jordanRequestCommissionIds[0],
        programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
        amount: 24000,
        currency: "usd",
        payoutMethod: "paypal",
        payoutDetails: {
          email: SEED_USERS.jordan.email,
        },
      },
      {
        id: payout.jordanPendingItemIds[1],
        commissionEntryId: jordanRequestCommissionIds[1],
        programAffiliateId: SEED_AFFILIATES.jordanChartgrid.id,
        amount: 12800,
        currency: "usd",
        payoutMethod: "paypal",
        payoutDetails: {
          email: SEED_USERS.jordan.email,
        },
      },
    ],
  });
}

export async function buildSeedData() {
  await seedUsersAndOrgs();
  await seedMarcusFresh();
  await seedPriyaEarlySetup();
  await seedDiegoStripeRevenue();
  await seedAlexDualRole();
  await seedMeiJoinPage();
  await seedTomasApiRevenue();
  await seedElenaChartgrid();
}

export function getSeedApiKeyLines() {
  return [
    `  Lumina Analytics (Stripe):  ${SEED_API_KEYS.lumina.rawKey}`,
    `  ShipFast Pro (Stripe):      ${SEED_API_KEYS.shipfast.rawKey}`,
    `  ChartGrid (Stripe):         ${SEED_API_KEYS.chartgrid.rawKey}`,
    `  LedgerKit (API reporting):  ${SEED_API_KEYS.ledgerkit.rawKey}`,
  ];
}

export function getSeedScenarioLines() {
  return [
    "  Marcus Chen - new developer, org only",
    "  Priya Sharma - early setup (Stripe app, no activity)",
    "  Diego Morales - PRIMARY Stripe story: SDK attribution, webhook payment + refund",
    "  Tomás Rivera - PRIMARY API story: SDK payments + refund + commissions + open payout request",
    "  Elena Vogt - ChartGrid live (Stripe): full funnel + payouts awaiting mark paid",
    "  Mei Lin - ZenForms join page with pending affiliates",
    "  Alex Turner - developer + affiliate on Lumina",
  ];
}

export function getSeedSignInLines() {
  return [
    `  Admin:      ${SEED_USERS.admin.email}`,
    `  Developers: ${SEED_USERS.marcus.email}, ${SEED_USERS.priya.email}, ${SEED_USERS.diego.email},`,
    `              ${SEED_USERS.elena.email}, ${SEED_USERS.tomas.email}, ${SEED_USERS.mei.email},`,
    `              ${SEED_USERS.alex.email}`,
    `  Affiliates: ${SEED_USERS.jordan.email}, ${SEED_USERS.sam.email}, ${SEED_USERS.riley.email},`,
    `              ${SEED_USERS.nina.email}`,
  ];
}
