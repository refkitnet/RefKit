# AGENTS.md - RefKit application

Read this file before changing `apps/app/**`. The REST API under `/v1/*` is
the core product contract. The SDK, CLI, MCP server, and dashboard are clients
of that contract.

## Architecture

```text
src/app/api/**/route.ts     thin HTTP handlers
src/services/**             business logic
src/db/schema/**            Drizzle schema
src/db/migrations/**        immutable public migrations
src/lib/**                  shared infrastructure and domain utilities
src/components/**           dashboard and Affiliate portal UI
```

Keep business logic in services. Route handlers parse input, authenticate,
call services, and return typed responses. React components do not implement
money, attribution, payout, or authorization rules.

## Product and edition rules

Read `PRODUCT.md` before changing attribution, money, commission, payout, or
edition behavior. RefKit Cloud and Self-Hosted use this same public source.
Cloud-operated services may be unavailable in Self-Hosted, but shared core
behavior must remain equivalent. Self-Hosted must not call RefKit
infrastructure or fall back to RefKit credentials.

## API propagation

For a public API behavior change, update all affected surfaces in the same
change:

1. service and route;
2. machine-readable API index and `docs/api.md`;
3. SDK, CLI, and MCP clients;
4. dashboard consumers;
5. unit, integration, and applicable browser tests; and
6. public package or Self-Hosted documentation.

Do not require a private documentation, monitoring, integration, or deployment
repository to understand or verify a public change.

## Database and migrations

Edit schema declarations, generate a migration, and review the SQL. Public
migrations are immutable after release and forward-only. Application startup
never migrates production silently. The explicit migration operation uses the
same version as the target application image.

## Checks

From the repository root, run `npm run check:app`. Run `npm run test:e2e` for
affected user journeys. Public CI uses PostgreSQL and fixture-mode Stripe; it
never receives RefKit Cloud credentials. Credentialed Cloud checks run
privately against an immutable public candidate.

## Repository text

Use the primary product nouns App, Program, Affiliate, and Developer. Do not
use the Unicode em dash character in repository text. Keep changes narrow and
do not add dependencies without explaining why.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev`. Verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
