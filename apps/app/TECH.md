# RefKit Tech Conventions

Pinned engineering decisions. Prefer these over inventing new patterns. Product rules: [PRODUCT.md](./PRODUCT.md). How the system works: [docs/architecture.md](./docs/architecture.md).

## Stack

| Concern | Decision |
| --- | --- |
| Hosting | RefKit Cloud on Vercel; Self-Hosted as a standalone OCI image with Docker Compose |
| Framework | Next.js App Router, TypeScript strict |
| Database | Standard PostgreSQL through `DATABASE_URL`; Neon for Cloud, PostgreSQL 17 in the supported Self-Hosted topology |
| Object storage | Vercel Blob for Cloud; persistent filesystem under `UPLOADS_DIR` for Self-Hosted |
| ORM | Drizzle + drizzle-kit migrations |
| Auth | Better Auth (explicit registration, magic-link verification/sign-in, bearer) |
| UI | Tailwind + shadcn/ui |
| Validation | Zod at boundaries; shared `@refkitnet/validation` for website URL / commission inputs |
| Email | React Email with RefKit Resend for Cloud and operator SMTP or Resend for Self-Hosted; all current delivery is synchronous |
| Stripe | Official SDK, pinned `apiVersion` in one client module |
| Repository | npm workspaces only |
| Testing | Vitest (unit + integration, CI); Playwright e2e (local only) |

## Repo layout

```text
apps/app/                 Next.js: dashboard, API, webhooks, redirect
packages/sdk/             @refkitnet/sdk
packages/cli/             refkitnet
packages/mcp/             @refkitnet/mcp (stdio; npm)
packages/validation/      @refkitnet/validation
deploy/self-hosted/       supported Compose topology and operator commands
docs/self-hosting/        public operator documentation
```

Inside `apps/app`: thin route handlers → `src/services/**` → Drizzle. No business logic in routes or React components.

## Deployment editions

`REFKIT_EDITION=cloud|self-hosted` defaults to `cloud`. The canonical
capability map is `src/lib/deployment.ts`; the dashboard reads the same map
from `GET /v1/me`. Cloud plan entitlements are not deployment capabilities.
Unavailable managed services are rejected in routes or services and hidden in
the dashboard.

The hosted dependency, outbound-request, persistent-state, and secret
inventory is in [docs/editions.md](./docs/editions.md).

## Domains

One app, host-routed in `middleware.ts`:

- Cloud: `app.refkit.net` for dashboard and API.
- Self-Hosted: the operator's exact HTTPS `APP_URL` for dashboard, API, magic links, device authorization, and upload URLs.

## IDs

Prefix + `_` + 24 chars base58 (CSPRNG). Text PKs.

| Entity | Prefix |
| --- | --- |
| user | `usr` |
| organization | `org` |
| app | `app` |
| managed account | `macc` |
| managed connection | `mcon` |
| program | `prg` |
| affiliate membership | `aff` |
| affiliate link | `lnk` |
| click | `clk` |
| customer | `rcus` |
| referral | `ref` |
| transaction | `rtxn` |
| revenue dispute | `rdsp` |
| commission rule | `rule` |
| commission entry | `cme` |
| payout request | `preq` |
| payout run | `prun` |
| payout item | `pitm` |
| payout execution | `pexe` |
| API key | `key` |
| webhook endpoint | `whep` |
| webhook delivery | `whdl` |
| webhook event | `whev` |
| stripe connection | `scon` |
| stripe event | `sevt` |

`rcus` / `rtxn` avoid colliding with Stripe `cus_` / `txn_`.

## Money

- Integer minor units + lowercase ISO currency. No floats.
- Cross-currency commission conversion is not supported in V1: revenue currency must equal program currency. A mismatch is rejected and raises an developer-facing integration alarm.
- Round half up once at commission calculation.
- Commission entries append-only; only lifecycle fields mutate (with audit).

## Database

- Schema in `src/db/schema/`; migrations committed; never `db push` in prod.
- **Local:** `DATABASE_URL` in `.env.local` points at `postgresql://postgres@127.0.0.1:54329/refkit_test`. Cluster managed by `scripts/test-db.ps1` (Postgres 17). `npm run dev`, `db:migrate`, `db:studio`, and e2e start it automatically.
- **Cloud production:** Neon pooled `DATABASE_URL` on Vercel.
- **Self-Hosted production:** private PostgreSQL 17 in the supported Compose topology. Migrations run as an explicit, locked one-shot operation from the exact target image. Application startup never migrates silently.
- **DB client:** `getDb()` in `src/db/client.ts` is the only Postgres entry point. It caches the `postgres-js` pool on `globalThis` so Next.js dev hot reload does not open a new pool per module reload. Pool size: `max: 5` in dev, `max: 1` in production (Neon pooler handles concurrency). Scripts that exit should call `closeDb()`.
- Idempotency via unique indexes (Stripe event, transaction object/action/livemode, provider-neutral dispute identity, earned commission, refund/dispute source events, payout item uniqueness).
- Accounts: platform-wide `users` have a primary developer/affiliate mode; actual access still comes from organization/program membership. Managed providers use non-login `managed_accounts` scoped to one Organization and App. API keys identify either a user or a managed account, never both.
- IPs: `sha256(ip + IP_HASH_SALT)` only.

## REST API

- `/v1`, JSON, ISO timestamps, amounts `{ amount, currency }`.
- Auth: session bearer, `rk_app_*` / `rk_test_app_*`, `rk_aff_*`, plus restricted Cloud-only `rk_managed_*` administration keys.
- Keys hashed (SHA-256); raw shown once.
- Errors: `{ error: { type, code, message } }`.
- Lists: cursor pagination (`limit`, `starting_after`).
- Cross-org access → `not_found` (not `forbidden`).

## Stripe event processing

Verified webhook events are stored and atomically claimed in `stripe_events`, then processed before the webhook returns success. Failures record attempts and the last error and return 5xx for Stripe redelivery. Admin can directly retry failed events or events stuck in `pending`/`processing` for more than five minutes. Processing and money writes remain idempotent.

## Stripe

Backend-only Stripe App with platform-key authentication and granular read permissions. Install links connect existing Stripe accounts without creating or controlling payment accounts. Store and claim event → re-fetch live object → money records synchronously. Test/`livemode=false` never payable and is isolated from live records.

## Secrets

Payout details and immutable payout-item snapshots: AES-256-GCM (`PAYOUT_DETAILS_ENCRYPTION_KEY`). Webhook secrets use AES-256-GCM with a purpose-derived key from the same root. Env validated in `src/lib/env.ts`. No secrets in client/SDK browser code.

Pending managed credential bundles use the same authenticated encryption helper and are erased after acknowledgement. `MANAGED_CONNECTIONS_PROVISIONING_SECRET` authenticates Cloud-only provisioning and acknowledgement calls. Raw provider identifiers and provider credentials are not stored in RefKit core.

Cloud App-logo and user-photo writes use `BLOB_READ_WRITE_TOKEN`. Self-Hosted
writes to the persistent `UPLOADS_DIR` mount and serves those files through the
configured instance origin. Stored URLs remain in PostgreSQL. Provider
credentials stay server-side.

Production Self-Hosted requires a one-time setup token, an operator email
provider, an HTTPS `APP_URL`, and runtime release metadata. Liveness checks the
process. Readiness validates environment, database access, and the exact latest
migration hash and timestamp embedded in the image.

## Status transitions

Implement as named service functions with audit:

- Commission: ordinary earned entries start `approved`; self-referral flag/release/reject; dispute hold/restore/reversal/reinstatement; `approved → paid` via payout
- Revenue dispute: `opened → won | withdrawn | lost`; `lost → funds_reinstated`. Terminal outcomes may be accepted before a delayed open event.
- Payout request: `open → fulfilled | declined`
- Payout run: `draft → prepared → paid`; cancel releases entries
- Payout item: `pending → paid | failed` (failed releases)
- Payout execution: `ready → failed → succeeded` or `ready → succeeded`; succeeded is terminal
- Program: `active ⇄ paused` → `disabled`
- Affiliate: `pending → active ⇄ disabled`
- Managed connection: `active → suspended → active`, `active | suspended → uninstalled → active`, and final `redacted`

## Testing

Integration tests against local Postgres (`DATABASE_URL` / optional `TEST_DATABASE_URL` in `.env.local`). CI uses a Postgres 16 service container. Cover idempotency, status transitions, payable balance, FX. Stripe via fixtures - never live keys in CI.

Before push, run `npm run check:app` (validation build + lint + typecheck + Vitest). For larger changes, also run the public application end-to-end suite. RefKit runs credentialed Cloud checks separately against an immutable public candidate before promotion. After push, wait for GitHub Actions green before treating the public candidate as good.

## Dashboard UI

- Shared labels, dates, and money copy: `src/lib/dashboard-display.ts` (commission kinds/statuses, customer/affiliate display names, setup helpers).
- Developer environment state is app-scoped and persisted by `owner-context.tsx` through `dashboard-environment.ts`. Test / Live controls appear only on setup, mode-aware activity pages, and the environment-specific App settings section. Programs and shared App configuration ignore it. Environment-specific list reads use server-side `environment=test|live` filters so cursor pagination never mixes modes.
- A browser-local test website URL is stored separately from the shared production website and Program destination. Payouts always read live data, and commission-review actions reject test entries. Live Stripe cannot satisfy test setup, and signed Stripe install state records the expected mode before a connection can be bound.
- Developer activity pages (Affiliates, Referrals, Payouts) unlock when the app has at least one program - not when the first click is recorded.
- Completed integration setup (click + identify) auto-dismisses the setup wizard and lands on Overview metrics.
- Sidebar **App settings** is the app-scoped install/billing hub; affiliate portal footer link is hidden until the user has affiliate programs.
