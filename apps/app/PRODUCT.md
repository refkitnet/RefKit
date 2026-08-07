# RefKit Product Contract

Living product rules for the current release. Change these only with an explicit product decision.

Public release policy: [../../docs/publication/release-policy.md](../../docs/publication/release-policy.md).

## What RefKit is today

Affiliate infrastructure for modern SaaS, currently in closed beta.

1. Developer creates an app and affiliate program.
2. Affiliate gets a first-party affiliate link (`?via=link_code` on the app website); the link code is unique within an App and resolves its Program without exposing Program information in the URL.
3. App backend records the click through authenticated `POST /v1/capture` and stores the returned `click_id`; the browser SDK remains a fallback for sites without practical server middleware.
4. App backend identifies the customer and passes attribution into Stripe or reports payments via the API.
5. Revenue events (Stripe webhooks or API-reported payments) create transactions and append-only commission entries.
6. Developer sees affiliates who are ready to pay, optionally downloads a CSV, then either pays manually or dispatches prepared payouts to an external finance system. RefKit records the result but never moves money.

Surfaces: dashboard, REST API (`/v1/*`), CLI (`refkitnet`), SDK (`@refkitnet/sdk`), MCP (`@refkitnet/mcp`).

## Deployment editions

RefKit Cloud and RefKit Self-Hosted run the same application code. Edition
capabilities describe who operates a service and remain separate from Cloud
plan entitlements.

| Capability | RefKit Cloud | Self-Hosted |
| --- | --- | --- |
| Core affiliate workflow, REST API, SDK, CLI, and MCP | Included | Included |
| Provider-neutral API revenue | Included | Required revenue path |
| Managed Stripe and future managed providers | RefKit-operated | Unavailable |
| Official RefKit Network | RefKit-operated | Unavailable |
| RefKit billing, upgrade prompts, and support | Cloud responsibility | Absent |
| Email and uploads | RefKit-operated providers | Operator SMTP or Resend and persistent filesystem |
| Developer access | Cloud release policy | First administrator setup, then administrator invitation only |

Self-Hosted is a private instance. It has no RefKit account requirement,
telemetry, license check, update ping, support fallback, or other call-home
behavior. Managed connectors and official Network data return an unavailable
capability response even when a caller bypasses the UI.

## In scope

- Edition-appropriate Developer access, private Affiliate join, magic-link verification and sign-in, orgs, apps, programs, and affiliates
- Click tracking and identify; RefKit Cloud also operates a backend-only Stripe App with granular read permissions
- API-reported payments, refunds, and disputes for provider-neutral billing (`POST /v1/transactions` and lifecycle endpoints)
- Cloud-only managed provider connections with non-login Developer accounts, restricted administration credentials, and separate Test and Live revenue credentials
- Commissions (ordinary earned entries are approved immediately; paid, reversal, dispute, and self-referral safeguards remain)
- Manual payouts (PayPal / bank details, CSV, mark paid) and external payout execution through a best-effort App webhook
- One best-effort outgoing webhook per App for affiliate, referral, transaction, commission, and payout events
- Hosted join page; admin inspect/retry/adjust
- Public app logos (used when Network opens)
- SDK, CLI, stdio MCP (`@refkitnet/mcp`), shared `@refkitnet/validation`

## Out of scope for closed beta

- RefKit-managed automatic payouts / Stripe Connect payouts to affiliates
- Mixed revenue sources on one app (Stripe + API reporting together)
- Hosted remote MCP service
- RefKit Network browse, join, and owner listing visibility (UI shows a Beta tag; opens in v1.0). Private hosted join links remain available.
- Advanced network discovery (search, categories, ranking, recommendations, favorites)
- Affiliate-account / payee entity split (agencies, shared payees) - deferred until marketplace
- Live FX conversion for cross-currency commissions
- Redis, Inngest, R2, separate workers
- Advanced fraud, tax forms, admin impersonation

## Hard rules

| Area | Rule |
|------|------|
| Attribution | Last click wins; 30-day window; no reattribution; per-program (one affiliate per customer per program). Trusted provider integrations may supply direct promotion-code evidence only when no click is available. A valid click wins, and code attribution never creates a synthetic click. |
| Terms | Versioned program commission terms; referrals pin terms/rule at identify / first paid event. App affiliate agreement is versioned per app and accepted on join. |
| Money | Append-only commission entries; never edit amount/currency/source |
| Currency | Program currency must match revenue currency for the current product; cross-currency conversion is rejected and surfaces as an developer alarm |
| Payouts | RefKit does not move money. Developers may pay manually and mark each Affiliate paid, or send a prepared batch to an external payout system through `payout.ready`. External systems fetch encrypted instruction snapshots with an exact App-scoped live key and report success or failure. CSV and manual Mark paid remain available. Payout requests allocate commission entries and fulfill only when allocated items are paid and amounts match. Post-payout refunds create recovery debt that is offset against later payouts. |
| Outgoing webhooks | An App has at most one HTTPS endpoint and selected event types. Delivery is synchronous, best-effort, single-attempt, and never rolls back the business operation. There are no retries, queues, workers, or generic automation rules. Private network targets require an explicit self-hosting environment opt-in. |
| Stripe | Listen-only Stripe App; verified webhooks process synchronously with `stripe_events` as the error/recovery ledger; test-mode is never payable or co-mingled with live money |
| API revenue | One authoritative source per app (`stripe` or `api`); developer backend reports normalized payments, refunds, and disputes with an app API key; test keys create non-payable records and cannot access live records; test activity and zero-value live payments do not lock the revenue source, but the first positive live payment does |
| Managed providers | Cloud-only provider services provision explicit non-login managed accounts. `rk_managed_*` credentials are restricted to selected Developer operations and lifecycle/privacy calls, and are never accepted for capture, identify, revenue writes, or Affiliate self-service. Each connection receives separate `rk_app_*` and `rk_test_app_*` revenue credentials. Provider identifiers entering RefKit are opaque HMACed values; provider tokens, payloads, and provider-specific types stay outside this repository. |
| Test integration | One shared App, production website, and Program are created before the developer chooses Test or Live setup. Live is the default. Choosing Test asks for a separate browser-local or staging URL that does not overwrite the shared Program destination. Test / Live controls appear only on environment-specific setup and activity surfaces. Test credentials, Stripe actions, the internal Test affiliate, and activity stay isolated from live data and payouts. |
| Links | First-party `?via=` affiliate links; each link code is unique within an App and resolves its Program; one production tracking origin per App so browser capture can resolve App from the landing origin; dashboard Test links may add `refkit_app=` when the Test URL differs from production; server-side capture is preferred and the browser SDK is the fallback; multiple affiliate links per program affiliate are supported; click snapshots campaign context |
| Programs | The first usable program becomes the app default. An app with usable programs has one default; changing it never moves historical attribution or money records. |
| Network | The official RefKit Network is Cloud-only. On Cloud, visibility belongs to the app. A visible app appears once with its active default program, app logo, and current offer. Affiliates join from the Network UI. The private hosted join page (`/join/:slug`) is a separate developer-controlled signup link and works in both editions. |
| API | `/v1/*` is the product contract; wrappers (SDK/CLI/MCP/UI) follow it |

### Provider-neutral revenue contract

- Every successful initial payment or renewal is reported as a payment. A zero-value payment creates transaction history and no commission.
- Completed refunds may be partial and cumulative. Refunds plus active dispute exposure cannot exceed the parent payment.
- Dispute states are `opened`, `won`, `withdrawn`, `lost`, and `funds_reinstated`. Open disputes hold approved commission. Won or withdrawn disputes release the hold, lost disputes append a proportional reversal, and reinstated funds append the matching reinstatement. Opened and lost disputes count as active exposure until they are resolved or reinstated.
- Payment, refund, and dispute identities are scoped to the App and Test or Live mode. Exact replay is harmless. Reusing an identity with different immutable payment or amount details is rejected.
- The parent payment must be accepted before a refund or dispute. A terminal dispute may arrive before `opened`; a later `opened` event is ignored. Conflicting terminal outcomes are rejected.
- Accepted events are immutable. Corrections use new payment or refund identities and compensating events, never an in-place edit. Subscription cancellation and failed payment attempts are not revenue events.

## Accounts and access modes

- A platform user is one shared identity. Developer and affiliate access are contexts, not separate authentication systems.
- Signup records a primary mode (`owner` or `affiliate`) that controls first-run onboarding and the default home page.
- Organization membership grants developer access. Program affiliate records grant affiliate access. A verified user may have both.
- Managed provider accounts are explicit non-login principals scoped to one Organization and App. They do not create placeholder users, emails, or Better Auth sessions.
- On Cloud, general Affiliate signup may start with an empty Affiliate portal and later use the official Network. Private hosted join links work in both editions.
- Self-Hosted public Developer registration is always closed. A one-time setup token creates the first administrator, and administrators invite additional Developers. Affiliates enter through invitations or private join pages.

## Setup checklist (machine)

`GET /v1/apps/:id/setup-status` and `refkitnet status` expose two stages:

1. **Test integration:** program launched → test API key created and used → Test affiliate link → test click → test identify → test payment → test commission.
2. **Production setup:** production website URL → live API key → live Stripe connection when Stripe is the revenue source.

For `revenue_source=stripe`, the test payment comes from Stripe test mode. For `revenue_source=api`, the developer reports it through `POST /v1/transactions` with an `rk_test_app_*` key. **Test payment received** counts any test-mode payment transaction, including $0 trial invoices and unattributed payments. **Test commission created** still requires an attributed test-affiliate commission (and therefore a positive commissionable amount). Test integration is complete only after a non-payable test commission exists, or after a real affiliate has already earned a commission. Testing is recommended but optional. Production readiness depends only on the production website URL, live API key, and live Stripe connection when Stripe is the revenue source. It does not require test completion or the first real affiliate payment.

The dashboard asks for a browser-local **Test website URL** when the developer chooses Test. That URL is UI-only, app-scoped in local storage, and does not change the shared App or Program destination.

Developer onboarding completes **Basics** first by creating the App, production website, and default Program together. RefKit then offers **Set up Live** (the default) or **Test first**. The selected environment is stored per App and can be changed from setup, Overview, Affiliates, Referrals, and the environment-specific section of App settings. Programs, payouts, and shared App settings do not inherit a hidden environment state. Test setup shows only test credentials, Stripe status, the internal Test affiliate, and isolated activity. Live setup shows production credentials, ordinary affiliates, and real activity. Payouts are always live-only. App identity, production website, Programs, commission rules, affiliate agreement, Network visibility, and revenue source remain shared. The CLI and JavaScript SDK remain optional helpers.
