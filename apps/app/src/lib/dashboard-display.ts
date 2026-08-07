import type { SetupStatus } from "@/lib/dashboard-types";

const COMMISSION_KIND_LABELS: Record<string, string> = {
  earned: "Commission",
  refund_reversal: "Refund adjustment",
  dispute_reversal: "Dispute adjustment",
  recovery_debt: "Recovery debt",
};

const COMMISSION_STATUS_LABELS: Record<string, string> = {
  approved: "Approved",
  paid: "Paid",
  flagged_self_referral: "Needs review",
  rejected: "Rejected",
};

const AFFILIATE_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending: "Pending approval",
  disabled: "Disabled",
};

const PAYOUT_REQUEST_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  declined: "Declined",
  fulfilled: "Fulfilled",
};

const PAYOUT_BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  prepared: "Pending",
  paid: "Paid",
  cancelled: "Cancelled",
};

const TRANSACTION_ACTION_LABELS: Record<string, string> = {
  payment: "Payment",
  refund: "Refund",
};

export function formatDashboardDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function commissionKindLabel(kind: string) {
  return COMMISSION_KIND_LABELS[kind] ?? kind.replaceAll("_", " ");
}

export function commissionStatusLabel(status: string) {
  return COMMISSION_STATUS_LABELS[status] ?? status.replaceAll("_", " ");
}

export function affiliateStatusLabel(status: string) {
  return AFFILIATE_STATUS_LABELS[status] ?? status;
}

export function payoutRequestStatusLabel(status: string) {
  return PAYOUT_REQUEST_STATUS_LABELS[status] ?? status;
}

export function payoutBatchStatusLabel(status: string) {
  return PAYOUT_BATCH_STATUS_LABELS[status] ?? status;
}

export function transactionActionLabel(action: string) {
  return TRANSACTION_ACTION_LABELS[action] ?? action;
}

export function customerDisplayLabel(input: {
  customer_id: string;
  customer_email?: string | null;
  customer_external_customer_id?: string | null;
}) {
  if (input.customer_email) {
    return input.customer_email;
  }

  if (input.customer_external_customer_id) {
    return input.customer_external_customer_id;
  }

  return formatInternalCustomerId(input.customer_id);
}

export function formatInternalCustomerId(customerId: string) {
  const seedMatch = customerId.match(/^rcus_seed_[^_]+_(.+)$/);

  if (seedMatch) {
    const suffix = seedMatch[1];

    if (/^\d+$/.test(suffix)) {
      return `Referred customer ${suffix}`;
    }

    return suffix.replaceAll("-", " ");
  }

  if (customerId.length <= 24) {
    return customerId;
  }

  return `${customerId.slice(0, 8)}…${customerId.slice(-4)}`;
}

export function affiliateDisplayLabel(input: {
  id: string;
  name?: string | null;
  email?: string | null;
  link_code?: string | null;
}) {
  if (input.name) {
    return input.name;
  }

  if (input.email) {
    return input.email;
  }

  if (input.link_code) {
    return input.link_code;
  }

  return formatInternalAffiliateId(input.id);
}

export function userDisplayLabel(input: {
  id?: string;
  name?: string | null;
  email?: string | null;
  link_code?: string | null;
}) {
  if (input.name) {
    return input.name;
  }

  if (input.email) {
    return input.email;
  }

  if (input.link_code) {
    return input.link_code;
  }

  if (input.id) {
    return formatInternalAffiliateId(input.id);
  }

  return "Account";
}

export function getUserInitials(
  email: string | null | undefined,
  name: string | null | undefined
) {
  if (name) {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return "RK";
}

export function formatInternalAffiliateId(affiliateId: string) {
  if (affiliateId.startsWith("aff_seed_")) {
    const slug = affiliateId.replace(/^aff_seed_[^_]+_/, "");
    return slug.replaceAll("-", " ");
  }

  if (affiliateId.length <= 24) {
    return affiliateId;
  }

  return `${affiliateId.slice(0, 8)}…${affiliateId.slice(-4)}`;
}

export function isIntegrationSetupComplete(status: SetupStatus) {
  return status.test_integration_complete;
}

export function canAccessOwnerActivityPages(input: {
  hasApp: boolean;
  programCount: number;
}) {
  return input.hasApp && input.programCount > 0;
}

export function hasLiveDashboardInfo(status: SetupStatus) {
  return status.production_ready
    || status.live_api_key_created
    || status.live_stripe_connected
    || status.live_first_revenue_event
    || status.live_first_commission;
}

export function referralsEmptyStateMessage(setupStatus: SetupStatus | null) {
  if (setupStatus?.test_first_identify) {
    return {
      title: "Test referral received",
      description:
        "Test activity stays out of live referrals. Live referrals appear after go-live.",
    };
  }

  return {
    title: "No referrals yet",
    description: "Referred customers appear after affiliate signups are matched.",
  };
}

export function appStatusSignals(status: SetupStatus) {
  const billingDone =
    status.revenue_source === "api" || status.test_stripe_connected;

  const rows: Array<{ label: string; done: boolean }> = [
    {
      label:
        status.revenue_source === "api"
          ? "Billing via SDK"
          : "Stripe connected",
      done: billingDone,
    },
    {
      label: "API key created",
      done: status.test_api_key_created,
    },
    {
      label: "Affiliate click tracked",
      done: status.test_first_click,
    },
    {
      label: "Referred signup matched",
      done: status.test_first_identify,
    },
    {
      label: "Test payment received",
      done: status.test_first_revenue_event,
    },
    {
      label: "Test commission created",
      done: status.test_first_commission,
    },
  ];

  return rows;
}

export const MONEY_METRICS_HELP = {
  earned:
    "Total approved and paid commissions across your programs (before payout).",
  payable:
    "Amount you can request for payout now.",
  paidOut: "Commissions already included in a completed payout.",
  activePrograms: "Programs where you are approved to promote and earn.",
  grossRevenue:
    "Total referred payment volume before refunds (matches Stripe or API totals).",
  netRevenue:
    "Payment total after refunds for this customer.",
} as const;

export const TEST_MODE_PAYOUT_NOTE =
  "Commissions from test billing (Stripe test mode or test API keys) appear in Earned but are never payable. Connect live billing to unlock payouts.";

export const OPEN_PAYOUT_REQUEST_NOTE =
  "Payable balance is reduced while a payout request is open. Once the developer pays it, the amount moves to Paid out.";
