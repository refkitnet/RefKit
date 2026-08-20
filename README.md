<div align="center">
  <img src="apps/app/public/logo-128.png" alt="RefKit fox logo" width="104" />
  <h1>RefKit</h1>
  <p><strong>Affiliate infrastructure for modern SaaS.</strong></p>
  <p>
    Launch and manage an affiliate program with first-party links, backend-first
    attribution, recurring commissions, and payout records.
  </p>
  <p>
    <a href="https://refkit.net">Website</a> ·
    <a href="https://refkit.gitbook.io/docs">Documentation</a> ·
    <a href="docs/self-hosting/README.md">Self-Hosted guide</a> ·
    <a href="apps/app/docs/api.md">REST API</a>
  </p>
</div>

> [!IMPORTANT]
> RefKit is pre-release software and RefKit Cloud is in closed beta. Pin
> Self-Hosted deployments to the exact version and image digest documented in
> the matching release notes.

RefKit is the open-source system behind RefKit Cloud and RefKit Self-Hosted. It
fits into an App's existing customer and billing flow instead of replacing it:
your App owns customer identity and revenue, while RefKit owns attribution,
the commission ledger, and payout records.

## Why RefKit

- **First-party referral links.** Keep links on your own domain with a simple
  `?via=link_code` parameter.
- **Backend-first attribution.** Capture referrals and identify customers from
  trusted application code, with a browser SDK fallback where needed.
- **Recurring commission records.** Turn reported revenue, refunds, and
  disputes into an append-only commission ledger.
- **Payout workflows without lock-in.** Download a ready-to-pay CSV, mark
  Affiliates paid, or hand a prepared batch to an external finance system.
  RefKit records payouts but does not move money.
- **One API, several interfaces.** Use the dashboard, REST API, JavaScript SDK,
  CLI, or local MCP server against the same product contract.
- **Cloud or Self-Hosted.** Run the same public core as a managed service or on
  infrastructure you control.

## How it works

1. An Affiliate shares a first-party link to your App.
2. Your backend captures the visit and identifies the resulting customer.
3. Revenue reported through the API, or through a supported managed provider
   on RefKit Cloud, creates transactions and commission entries.
4. Your team reviews who is ready to pay, completes the payout outside RefKit,
   and records the result.

```text
Affiliate link -> Capture -> Customer -> Revenue -> Commission -> Payout record
```

## Choose how to run RefKit

| | RefKit Cloud | RefKit Self-Hosted |
| --- | --- | --- |
| Core affiliate workflow | Included | Included |
| Dashboard, REST API, SDK, CLI, and MCP | Included | Included |
| Provider-neutral revenue API | Included | Included |
| Managed payment-provider connections | RefKit-operated | Not included |
| Official RefKit Network | Planned Cloud service | Not included |
| Infrastructure and support | RefKit-operated | Operator responsibility |
| Current availability | Closed beta | Pre-release |

RefKit Self-Hosted runs without a RefKit account, RefKit credentials,
telemetry, license checks, update pings, or calls to RefKit-operated
infrastructure. Operators provide PostgreSQL, persistent storage, email
delivery, DNS, TLS, backups, and support for their deployment.

## Quick start

### RefKit Cloud

With access to the closed beta, use the CLI to sign in and integrate a
JavaScript App:

```bash
npx refkitnet auth login
npx refkitnet init
npx refkitnet status
```

The setup wizard installs the SDK, creates or reuses an App-scoped test key,
and generates the integration files for supported JavaScript frameworks. Any
backend can use the REST API directly instead.

### RefKit Self-Hosted

Start with the [Self-Hosted installation and operations guide](docs/self-hosting/README.md).
The supported first topology uses Docker Compose, PostgreSQL 17, persistent
uploads, scheduled logical backups, and an operator-managed HTTPS reverse
proxy.

Do not deploy an untagged development build. Build a fork from source only
with the required version, revision, and source URL metadata described in the
Self-Hosted guide.

## Developer interfaces

| Interface | Use it for | Documentation |
| --- | --- | --- |
| REST API | The complete product contract | [API reference](apps/app/docs/api.md) |
| JavaScript SDK | Capture, identify, and server-side integration | [SDK guide](packages/sdk/README.md) |
| CLI | Authentication, setup, operations, and status | [CLI guide](packages/cli/README.md) |
| MCP server | Local coding-agent access to RefKit operations | [MCP guide](packages/mcp/README.md) |
| Dashboard | Developer and Affiliate workflows | [Application guide](apps/app/README.md) |

## Repository layout

```text
apps/app/              Next.js application, REST API, dashboard, and tests
packages/validation/   Shared input validation
packages/sdk/          Browser and server SDK
packages/cli/          RefKit command-line client
packages/mcp/          Stdio MCP server
deploy/self-hosted/    Supported Docker Compose deployment
docs/self-hosting/     Operator documentation
docs/publication/      Release, security, and compliance documentation
```

The marketing website, hosted monitoring canaries, operated integration
packaging, and private product operations are maintained separately. They are
not required to build, modify, or operate RefKit Self-Hosted.

## Development

Install Node.js 22.13 or newer (before Node.js 23) and npm 10.9.8, then install
the locked dependencies:

```bash
npm ci
```

The [application guide](apps/app/README.md) documents environment and local
database setup. Common checks from the repository root are:

```bash
npm run check:app
npm run check:packages
npm run check:publication
npm run test:e2e
```

Public pull requests receive only secretless checks. The current local
database helper scripts require Windows PowerShell and PostgreSQL 17. The
supported Self-Hosted runtime and container target Linux on amd64 and arm64.

## Contributing and project policy

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
before contributing. Every contributed commit requires a Developer Certificate
of Origin sign-off. Report suspected vulnerabilities privately through
[SECURITY.md](SECURITY.md).

The application and repository default are licensed under `AGPL-3.0-only`.
The SDK, CLI, MCP, and validation packages are licensed under MIT. RefKit names
and brand assets are not granted under either software license. See
[LICENSES.md](LICENSES.md), [TRADEMARKS.md](TRADEMARKS.md),
[GOVERNANCE.md](GOVERNANCE.md), and [SUPPORT.md](SUPPORT.md) for the complete
project boundaries.
