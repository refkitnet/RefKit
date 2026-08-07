export const SEED_MARKER_USER_ID = "usr_seed_admin";

export const SEED_USERS = {
  admin: {
    id: SEED_MARKER_USER_ID,
    email: "admin@refkit.net",
    name: "RefKit Admin",
    isAdmin: true,
  },
  marcus: {
    id: "usr_seed_marcus",
    email: "marcus.chen@refkit.local",
    name: "Marcus Chen",
    isAdmin: false,
  },
  priya: {
    id: "usr_seed_priya",
    email: "priya@refkit.local",
    name: "Priya Sharma",
    isAdmin: false,
  },
  diego: {
    id: "usr_seed_diego",
    email: "diego@refkit.local",
    name: "Diego Morales",
    isAdmin: false,
  },
  elena: {
    id: "usr_seed_elena",
    email: "elena@refkit.local",
    name: "Elena Vogt",
    isAdmin: false,
  },
  tomas: {
    id: "usr_seed_tomas",
    email: "tomas@refkit.local",
    name: "Tomás Rivera",
    isAdmin: false,
  },
  mei: {
    id: "usr_seed_mei",
    email: "mei@refkit.local",
    name: "Mei Lin",
    isAdmin: false,
  },
  alex: {
    id: "usr_seed_alex",
    email: "alex.turner@refkit.local",
    name: "Alex Turner",
    isAdmin: false,
  },
  jordan: {
    id: "usr_seed_jordan",
    email: "jordan.blake@refkit.local",
    name: "Jordan Blake",
    isAdmin: false,
  },
  sam: {
    id: "usr_seed_sam",
    email: "sam.okonkwo@refkit.local",
    name: "Sam Okonkwo",
    isAdmin: false,
  },
  riley: {
    id: "usr_seed_riley",
    email: "riley.park@refkit.local",
    name: "Riley Park",
    isAdmin: false,
  },
  nina: {
    id: "usr_seed_nina",
    email: "nina.kowalski@refkit.local",
    name: "Nina Kowalski",
    isAdmin: false,
  },
} as const;

export const SEED_ORGS = {
  flowstack: { id: "org_seed_flowstack", name: "Flowstack", ownerId: SEED_USERS.marcus.id },
  lumina: { id: "org_seed_lumina", name: "Lumina Tools", ownerId: SEED_USERS.priya.id },
  shipfast: { id: "org_seed_shipfast", name: "ShipFast", ownerId: SEED_USERS.diego.id },
  chartgrid: { id: "org_seed_chartgrid", name: "ChartGrid", ownerId: SEED_USERS.elena.id },
  ledgerkit: { id: "org_seed_ledgerkit", name: "LedgerKit", ownerId: SEED_USERS.tomas.id },
  zenforms: { id: "org_seed_zenforms", name: "ZenForms", ownerId: SEED_USERS.mei.id },
  pixelforge: { id: "org_seed_pixelforge", name: "PixelForge", ownerId: SEED_USERS.alex.id },
} as const;

export const SEED_APPS = {
  lumina: {
    id: "app_seed_lumina",
    orgId: SEED_ORGS.lumina.id,
    name: "Lumina Analytics",
    revenueSource: "stripe" as const,
    destinationUrl: "https://lumina.tools",
  },
  shipfast: {
    id: "app_seed_shipfast",
    orgId: SEED_ORGS.shipfast.id,
    name: "ShipFast Pro",
    revenueSource: "stripe" as const,
    destinationUrl: "http://localhost:5173/",
  },
  chartgrid: {
    id: "app_seed_chartgrid",
    orgId: SEED_ORGS.chartgrid.id,
    name: "ChartGrid",
    revenueSource: "stripe" as const,
    destinationUrl: "https://chartgrid.app",
  },
  ledgerkit: {
    id: "app_seed_ledgerkit",
    orgId: SEED_ORGS.ledgerkit.id,
    name: "LedgerKit",
    revenueSource: "api" as const,
    destinationUrl: "https://ledgerkit.dev",
  },
  zenforms: {
    id: "app_seed_zenforms",
    orgId: SEED_ORGS.zenforms.id,
    name: "ZenForms",
    revenueSource: "stripe" as const,
    destinationUrl: "https://zenforms.co",
  },
  pixelforge: {
    id: "app_seed_pixelforge",
    orgId: SEED_ORGS.pixelforge.id,
    name: "PixelForge",
    revenueSource: "stripe" as const,
    destinationUrl: "https://pixelforge.studio",
  },
} as const;

export const SEED_PROGRAMS = {
  lumina: {
    id: "prg_seed_lumina",
    appId: SEED_APPS.lumina.id,
    name: "Lumina Partners",
    slug: "lumina",
    ruleId: "rule_seed_lumina",
  },
  shipfast: {
    id: "prg_seed_shipfast",
    appId: SEED_APPS.shipfast.id,
    name: "ShipFast Partners",
    slug: "shipfast-pro",
    ruleId: "rule_seed_shipfast",
  },
  chartgrid: {
    id: "prg_seed_chartgrid",
    appId: SEED_APPS.chartgrid.id,
    name: "ChartGrid Partners",
    slug: "chartgrid",
    ruleId: "rule_seed_chartgrid",
  },
  ledgerkit: {
    id: "prg_seed_ledgerkit",
    appId: SEED_APPS.ledgerkit.id,
    name: "LedgerKit Partners",
    slug: "ledgerkit",
    ruleId: "rule_seed_ledgerkit",
  },
  zenforms: {
    id: "prg_seed_zenforms",
    appId: SEED_APPS.zenforms.id,
    name: "ZenForms Partners",
    slug: "zenforms",
    ruleId: "rule_seed_zenforms",
  },
  pixelforge: {
    id: "prg_seed_pixelforge",
    appId: SEED_APPS.pixelforge.id,
    name: "PixelForge Partners",
    slug: "pixelforge",
    ruleId: "rule_seed_pixelforge",
  },
} as const;

export const SEED_API_KEYS = {
  lumina: {
    id: "key_seed_lumina",
    rawKey: "rk_test_app_seedlumina00000000000000000000001",
    appId: SEED_APPS.lumina.id,
    orgId: SEED_ORGS.lumina.id,
    ownerId: SEED_USERS.priya.id,
    name: "Lumina dev key",
  },
  shipfast: {
    id: "key_seed_shipfast",
    rawKey: "rk_test_app_seedshipfast0000000000000000000001",
    appId: SEED_APPS.shipfast.id,
    orgId: SEED_ORGS.shipfast.id,
    ownerId: SEED_USERS.diego.id,
    name: "ShipFast dev key",
  },
  chartgrid: {
    id: "key_seed_chartgrid",
    rawKey: "rk_test_app_seedchartgr00000000000000000000001",
    appId: SEED_APPS.chartgrid.id,
    orgId: SEED_ORGS.chartgrid.id,
    ownerId: SEED_USERS.elena.id,
    name: "ChartGrid dev key",
  },
  ledgerkit: {
    id: "key_seed_ledgerkit",
    rawKey: "rk_test_app_seedledgerk00000000000000000000001",
    appId: SEED_APPS.ledgerkit.id,
    orgId: SEED_ORGS.ledgerkit.id,
    ownerId: SEED_USERS.tomas.id,
    name: "LedgerKit dev key",
  },
  ledgerkitLive: {
    id: "key_seed_ledgerkit_live",
    rawKey: "rk_app_seedledgerklive000000000000000000001",
    appId: SEED_APPS.ledgerkit.id,
    orgId: SEED_ORGS.ledgerkit.id,
    ownerId: SEED_USERS.tomas.id,
    name: "LedgerKit live seed key",
  },
} as const;

export const SEED_AFFILIATES = {
  jordanShipfast: {
    id: "aff_seed_jordan_shipfast",
    userId: SEED_USERS.jordan.id,
    programId: SEED_PROGRAMS.shipfast.id,
    linkCode: "jordan-ship",
    linkId: "lnk_seed_jordan_shipfast",
  },
  jordanChartgrid: {
    id: "aff_seed_jordan_chartgrid",
    userId: SEED_USERS.jordan.id,
    programId: SEED_PROGRAMS.chartgrid.id,
    linkCode: "jordan-grid",
    linkId: "lnk_seed_jordan_chartgrid",
  },
  rileyChartgrid: {
    id: "aff_seed_riley_chartgrid",
    userId: SEED_USERS.riley.id,
    programId: SEED_PROGRAMS.chartgrid.id,
    linkCode: "riley-grid",
    linkId: "lnk_seed_riley_chartgrid",
  },
  ninaChartgrid: {
    id: "aff_seed_nina_chartgrid",
    userId: SEED_USERS.nina.id,
    programId: SEED_PROGRAMS.chartgrid.id,
    linkCode: "nina-grid",
    linkId: "lnk_seed_nina_chartgrid",
  },
  alexLumina: {
    id: "aff_seed_alex_lumina",
    userId: SEED_USERS.alex.id,
    programId: SEED_PROGRAMS.lumina.id,
    linkCode: "alex-lumina",
    linkId: "lnk_seed_alex_lumina",
  },
  samZenforms: {
    id: "aff_seed_sam_zenforms",
    userId: SEED_USERS.sam.id,
    programId: SEED_PROGRAMS.zenforms.id,
    linkCode: "sam-zen",
    linkId: "lnk_seed_sam_zenforms",
  },
  meiZenformsActive: {
    id: "aff_seed_mei_zenforms",
    userId: SEED_USERS.mei.id,
    programId: SEED_PROGRAMS.zenforms.id,
    linkCode: "mei-zen",
    linkId: "lnk_seed_mei_zenforms",
  },
  ledgerkitPartner: {
    id: "aff_seed_jordan_ledgerkit",
    userId: SEED_USERS.jordan.id,
    programId: SEED_PROGRAMS.ledgerkit.id,
    linkCode: "jordan-ledger",
    linkId: "lnk_seed_jordan_ledgerkit",
  },
} as const;

export const SEED_LEDGERKIT = {
  customerReferred1: "rcus_seed_ledgerkit_referred_1",
  customerReferred2: "rcus_seed_ledgerkit_referred_2",
  customerOrganic: "rcus_seed_ledgerkit_organic_1",
  paymentAnnual: "pay_seed_ledgerkit_sub_annual",
  paymentMonthly: "pay_seed_ledgerkit_sub_monthly",
  paymentTeam: "pay_seed_ledgerkit_team_plan",
  paymentOrganic: "pay_seed_ledgerkit_organic_checkout",
  refundPartial: "refund_seed_ledgerkit_partial_annual",
} as const;

export const SEED_STRIPE = {
  shipfastConnection: {
    id: "scon_seed_shipfast",
    appId: SEED_APPS.shipfast.id,
    stripeAccountId: "acct_seed_shipfast_sandbox",
  },
  shipfastCheckout: {
    sessionId: "cs_seed_shipfast_checkout_1",
    refundId: "re_seed_shipfast_partial_refund_1",
    paymentAmount: 10000,
    refundAmount: 2500,
  },
  chartgridConnection: {
    id: "scon_seed_chartgrid",
    appId: SEED_APPS.chartgrid.id,
    stripeAccountId: "acct_seed_chartgrid_sandbox",
  },
} as const;

export const SEED_PAYOUT = {
  chartgridRun: {
    id: "prun_seed_chartgrid_q1",
    programId: SEED_PROGRAMS.chartgrid.id,
    requestId: "preq_seed_riley_open",
    itemId: "pitm_seed_riley_paid",
    rileyCommissionId: "cme_seed_riley_paid",
    jordanRequestId: "preq_seed_jordan_open",
    jordanPendingBatchId: "prun_seed_chartgrid_jordan_pending",
    jordanPendingItemIds: [
      "pitm_seed_jordan_pending_1",
      "pitm_seed_jordan_pending_2",
    ],
  },
  ledgerkitRequestId: "preq_seed_jordan_ledgerkit_open",
} as const;

export function allSeedUserIds() {
  return Object.values(SEED_USERS).map((user) => user.id);
}

export function allSeedOrgIds() {
  return Object.values(SEED_ORGS).map((org) => org.id);
}

export function allSeedAppIds() {
  return Object.values(SEED_APPS).map((app) => app.id);
}

export function allSeedProgramIds() {
  return Object.values(SEED_PROGRAMS).map((program) => program.id);
}
