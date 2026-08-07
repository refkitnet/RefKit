# RefKit

RefKit is open-source affiliate infrastructure. It provides Apps, Programs,
Affiliates, links, attribution, commissions, manual payouts, a REST API, and
the dashboard used by both RefKit Cloud and RefKit Self-Hosted.

RefKit Self-Hosted runs without a RefKit account, RefKit credentials, or
RefKit-operated infrastructure. Operators supply PostgreSQL, persistent
storage, email delivery, DNS, and TLS. The official RefKit Network, managed
payment-provider connections, Cloud billing, and RefKit support are operated
Cloud services and are not part of the supported Self-Hosted topology.

RefKit Self-Hosted is pre-release software. Use an exact version and image
digest from the matching release notes when releases become available. Do not
use an untagged development build as a production release.

## Start here

- [Self-Hosted installation and operations](docs/self-hosting/README.md)
- [REST API reference](apps/app/docs/api.md)
- [Application architecture](apps/app/docs/architecture.md)
- [SDK](packages/sdk/README.md)
- [CLI](packages/cli/README.md)
- [MCP server](packages/mcp/README.md)
- [Contributing](CONTRIBUTING.md)

The supported first Self-Hosted topology is Docker Compose with the RefKit
application, PostgreSQL 17, persistent uploads, scheduled logical backups, and
an operator-managed HTTPS reverse proxy. The deployment guide covers required
secrets, first-administrator bootstrap, upgrades, backup, restore, health
checks, and custom SDK, CLI, and MCP origins.

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
packaging, and private product operations are separate from this repository.
They are not required to build, modify, or operate RefKit Self-Hosted.

## Development

Install Node.js 22.13 or newer (before Node.js 23) and npm 10.9.8, then install the locked dependencies:

```bash
npm ci
```

The application README documents its environment and local database setup:
[apps/app/README.md](apps/app/README.md). The current local database helper
scripts require Windows PowerShell and PostgreSQL 17. The supported
Self-Hosted runtime and container build target Linux on amd64 and arm64.

Common checks from the repository root:

```bash
npm run check:app
npm run check:packages
npm run check:publication
npm run test:e2e
```

The end-to-end suite is secretless but requires the documented local database
and application environment. Public pull requests never receive RefKit Cloud
credentials.

## License and project policies

The application and repository default are licensed under
`AGPL-3.0-only`. The SDK, CLI, MCP, and validation packages are licensed under
MIT. RefKit names and brand assets are not granted under either software
license. Read [LICENSES.md](LICENSES.md) for the path-level license map and
[TRADEMARKS.md](TRADEMARKS.md) for brand rules.

Contributions require a Developer Certificate of Origin sign-off. See
[CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[SUPPORT.md](SUPPORT.md) before opening a contribution or reporting a problem.
