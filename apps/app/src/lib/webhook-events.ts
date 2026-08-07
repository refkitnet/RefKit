export const WEBHOOK_EVENT_TYPES = [
  "affiliate.created",
  "affiliate.approved",
  "affiliate.disabled",
  "referral.created",
  "transaction.created",
  "transaction.refunded",
  "commission.created",
  "commission.reversed",
  "commission.paid",
  "payout.ready",
  "payout.succeeded",
  "payout.failed",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
