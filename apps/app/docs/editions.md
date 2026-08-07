# Deployment editions and hosted-assumption inventory

`REFKIT_EDITION=cloud|self-hosted` selects an operating boundary. It does not
select a Cloud subscription plan. The default is `cloud` so existing RefKit
Cloud deployments keep their current behavior.

The executable capability contract is
[`src/lib/deployment.ts`](../src/lib/deployment.ts). `GET /v1/me` exposes the
edition, configured instance URL, and capabilities to the dashboard.

## Capability inventory

| Capability | Cloud | Self-Hosted | Enforcement |
| --- | --- | --- | --- |
| Apps, Programs, Affiliates, links, attribution, commissions, payouts, dashboard, and REST API | Included | Included | Shared services and routes |
| SDK, CLI, and MCP | Included | Included | Self-Hosted clients must set the instance origin |
| API payments, refunds, and disputes | Included | Included | Shared provider-neutral revenue services |
| Managed Stripe | Included | Unavailable | `managed_stripe`; routes return `404 capability_unavailable`, controls are hidden |
| Official RefKit Network | Included when the Cloud release enables it | Unavailable | `official_network`; services reject access and navigation is hidden |
| RefKit support workflow | Included | Unavailable | `refkit_support`; route rejects access and navigation is hidden |
| Cloud billing and plan entitlements | Cloud responsibility | Unavailable | `cloud_billing`; separate from deployment capabilities |
| Email delivery | RefKit-operated Resend | Operator SMTP or Resend | Edition-aware environment validation and delivery provider |
| Uploaded App logos and user photos | Vercel Blob | Persistent filesystem | `filesystem_uploads`; Self-Hosted writes only under `UPLOADS_DIR` |
| Additional Developer access | Cloud invitation policy | Administrator invitation only | Admin Accounts invitation flow; public Developer registration stays closed |

Every unavailable server action must be rejected even when a caller bypasses
the dashboard. Hiding navigation is a second, user-facing layer, not the
authorization boundary.

## Hosted-assumption inventory

| Dependency or assumption | Cloud ownership | Self-Hosted behavior |
| --- | --- | --- |
| Vercel hosting and build output | Cloud deploy target | Standalone Next.js image built from the repository |
| Neon PostgreSQL | Cloud database | Bundled private PostgreSQL 17, or an operator-supplied compatible `DATABASE_URL` outside the supported first topology |
| Vercel Blob | Cloud uploads | Not called; files use the durable uploads mount |
| Resend | RefKit credentials | Optional operator credentials; SMTP is also supported and there is no RefKit fallback |
| Stripe platform keys, App install, and webhooks | Managed Cloud connector | Not configured or called; the operator's application reports normalized revenue |
| `app.refkit.net` | Cloud `APP_URL` and wrapper default | Replaced by the operator's HTTPS `APP_URL`; CLI, MCP, browser SDK, and server SDK require an explicit custom origin |
| RefKit Help Center and support email | Cloud navigation and workflow | Hidden from the application; operator documentation is supplied with the deployment |
| Proxy headers | Vercel supplies trusted forwarding headers | The supported reverse proxy replaces client-supplied forwarding headers before loopback delivery |
| Ephemeral application filesystem | Acceptable for replaceable Cloud runtime files | Only `/var/lib/refkit/uploads` is persistent; logs go to standard output |
| Hosted build metadata | Platform deployment record | Image embeds version, source revision, source URL, and expected migration metadata |
| Next.js telemetry and remote fonts | Disabled or absent | Disabled or absent |

The first Self-Hosted topology is one application instance. Shared uploads and
multi-instance behavior are not supported.

## Outbound requests and generated URLs

The Self-Hosted server can make outbound requests only to destinations selected
by the operator:

- the configured SMTP or Resend provider;
- an App's configured outgoing webhook endpoint; and
- PostgreSQL on the deployment network.

Managed Stripe, RefKit support, RefKit Network synchronization, telemetry,
license checks, update checks, hosted configuration, and remote fonts are not
called. User browsers load application assets and APIs from `APP_URL`. Cloud
documentation links and Cloud-only controls are not rendered in Self-Hosted.

Magic links, stored upload URLs, dashboard integration commands, and device
authorization URLs derive from `APP_URL`. Affiliate destinations and outgoing
webhook URLs are application data supplied by an operator or Developer.

CLI and MCP retain `https://app.refkit.net` as the Cloud default. A Self-Hosted
operator must configure `REFKIT_API_URL` or `--api-url`; the selected value is
stored and reused. SDK calls must pass `baseUrl` for the Self-Hosted instance.

## Durable and recovery-critical state

A recoverable Self-Hosted installation consists of:

- a consistent logical PostgreSQL dump;
- the persistent uploads volume;
- the exact RefKit image version and digest;
- deployment configuration; and
- a separately protected secret set.

The secret set includes `BETTER_AUTH_SECRET`,
`PAYOUT_DETAILS_ENCRYPTION_KEY`, `IP_HASH_SALT`, database credentials, email
credentials, and the setup token. Loss of `PAYOUT_DETAILS_ENCRYPTION_KEY` makes
encrypted payout and webhook instruction data unrecoverable. Ordinary backup
bundles intentionally exclude secrets.

See [Self-Hosted configuration](../../../docs/self-hosting/configuration.md),
[operations](../../../docs/self-hosting/operations.md), and the
[publication security review](../../../docs/publication/security-review.md).

## Future feature rule

Every new feature must state whether it is shared product behavior, a
RefKit-operated Cloud service, an operator responsibility, or a Cloud plan
entitlement. Its proposal must define API rejection, dashboard visibility,
background behavior, cross-edition tests, wrapper behavior, and documentation.
