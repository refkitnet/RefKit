# Outbound emails

Living catalog of every email RefKit sends. Update this file in the same change when you add, remove, or change a template or trigger.

Delivery rules and local log mode: [architecture.md](./architecture.md#email-delivery). Implementation: `src/emails/**` (react-email) + `src/services/emails/**` (send helpers) + `deliverEmail()`.

Do not add newsletters, digests, or marketing automation here.

## Delivery mode

All current email is sent synchronously from the request or Stripe event being processed. There is no scheduled email worker in phases 0–1.

Localhost (or `EMAIL_DELIVERY=log`) logs without calling a provider. Cloud
production uses RefKit-operated Resend. Self-Hosted production requires
operator SMTP or Resend credentials and never falls back to RefKit delivery.
`EMAIL_FROM_ADDRESS` controls the sender, and email footers use the configured
`APP_URL` host. Templates do not load remote RefKit images or fonts.

## Catalog

| Template | Trigger | Recipient | Mode | Template file | Send from |
|----------|---------|-----------|------|---------------|-----------|
| `signup-magic-link` | Account signup | New user | Sync | `src/emails/signup-magic-link.tsx` | `/api/auth/register` via Better Auth (`src/lib/auth.ts`) |
| `magic-link` | Existing-account sign-in / magic link request | User | Sync | `src/emails/magic-link.tsx` | `send-magic-link.ts` via Better Auth (`src/lib/auth.ts`) |
| `affiliate-invited` | Developer invites affiliate | Invitee | Sync | `src/emails/affiliate-invited.tsx` | `send-affiliate-invite.ts` via Better Auth metadata |
| `join-confirm` | Public join-page signup (step 1) | Prospective affiliate | Sync | `src/emails/join-confirm.tsx` | `send-join-confirm.ts` via Better Auth metadata (`src/lib/auth.ts`) |
| `join-signup-received` | Public join-page signup confirmed (step 2) | Developers | Sync | `src/emails/join-signup-received.tsx` | `affiliates/join.ts` |
| `payout-request-received` | Affiliate creates payout request | Developers | Sync | `src/emails/payout-request-received.tsx` | `payouts/payout-requests.ts` |
| `payout-request-declined` | Developer declines payout request | Affiliate | Sync | `src/emails/payout-request-declined.tsx` | `payouts/payout-requests.ts` |
| `payout-report-ready` | First CSV export of a draft payout batch | Developers | Sync | `src/emails/payout-report-ready.tsx` | `payouts/payout-batches.ts` |
| `payout-paid` | Developer marks an affiliate payout paid (or completes a legacy batch) | Paid affiliate | Sync | `src/emails/payout-paid.tsx` | `payouts/payout-batches.ts` |
| `program-closing` | Program disabled; affiliate has payable balance | Affiliate | Sync | `src/emails/program-closing.tsx` | `programs/disable.ts` |
| `admin-alert` (Stripe disconnect) | `account.application.deauthorized` processed | Developers + `ADMIN_ALERT_EMAILS` | Sync | `src/emails/admin-alert.tsx` | `stripe/event-processor.ts` |
| `support-request` | Developer submits dashboard support form (Cloud only) | `support@refkit.net` | Sync | `src/emails/support-request.tsx` | `support/submit.ts` |
| `email-diagnostic` | Administrator selects Send test email | Current administrator | Sync | Inline diagnostic HTML in `send-diagnostic.ts` | `POST /v1/admin/email-diagnostic` |

## Out of scope

- In-app notification center
- Per-user email preferences
- Marketing / newsletter sends
