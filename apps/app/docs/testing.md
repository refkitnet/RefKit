# Testing

This document covers the tests distributed with the public RefKit core. All
public checks are secretless. RefKit-operated connector and hosted monitoring
checks run separately against an immutable public candidate and are not part of
this repository.

## Suite overview

| Suite | Location | Command | Database |
| --- | --- | --- | --- |
| App unit and integration | `apps/app/tests/` | `npm test` | PostgreSQL for integration tests |
| App browser e2e | `apps/app/e2e/` | `npm run test:e2e` | Disposable PostgreSQL database |
| Validation package | `packages/validation/tests/` | `npm run test -w @refkitnet/validation` | None |
| CLI | `packages/cli/tests/` | `npm run test -w refkitnet` | None |
| MCP | `packages/mcp/tests/` | `npm run test -w @refkitnet/mcp` | None |
| Publication policy | `scripts/check-publication.mjs` | `npm run check:publication` | None |

Run the standard public checks from the repository root:

```bash
npm run check:app
npm run check:packages
npm run check:publication
```

`check:app` builds shared validation, lints and typechecks the application, and
runs Vitest. Browser e2e is separate because it starts the application and
resets public seed fixtures in a disposable database.

## Test database

Vitest reads `apps/app/.env.local`. It uses `TEST_DATABASE_URL` when set and
otherwise uses `DATABASE_URL`. Never point either variable at production or at
a database whose contents must be preserved.

The checked-in Windows helper creates a throwaway PostgreSQL 17 cluster on
`127.0.0.1:54329`:

```powershell
npm run test:db
npm run test:db:stop
```

On any platform, contributors may supply their own disposable PostgreSQL 17
database through `DATABASE_URL`. Apply the exact migration set with:

```bash
node apps/app/scripts/self-hosted/migrate.mjs
```

Application tests never require a RefKit Cloud database, Stripe credential,
email credential, or hosted service.

## App unit and integration tests

Run all application tests:

```bash
npm test
```

Run one file while iterating:

```bash
npx vitest run apps/app/tests/integration/capture.test.ts
```

The global Vitest setup:

- loads `apps/app/.env.local` without overriding explicit process variables;
- selects `TEST_DATABASE_URL` before `DATABASE_URL`;
- forces Stripe fixture mode;
- forces email log mode; and
- supplies non-secret test defaults for required application configuration.

Integration tests create unique records with helpers in
`tests/helpers/context.ts` and clean up what they create. Tests that exercise
database constraints, idempotency, money state, or access boundaries belong in
`tests/integration/`. Pure formatting, validation, and state derivation belong
in `tests/unit/`.

Stripe coverage in the public suite uses deterministic fixture objects and the
normal event processor. It covers signature-independent processing, retries,
idempotency, attribution, payments, refunds, disputes, commissions, and
connection state without contacting Stripe.

## Browser e2e

The Playwright suite covers the public application journeys that need a real
browser. List the current cases with:

```bash
cd apps/app
npx playwright test --list
```

Run from the repository root:

```bash
npm run test:e2e
```

The e2e global setup requires `DATABASE_URL`, applies the checked-in migration
plan with the Node migration runner, and resets the public seed fixtures. The
configured web server starts Next.js directly, so the suite does not depend on
the Windows local-database helper. `PLAYWRIGHT_BASE_URL` defaults to
`http://localhost:3000`.

The target database must be disposable. A database containing a different
migration history is rejected before tests run. This is intentional: the
public migration baseline is not compatible with the private pre-publication
chain.

Useful variants:

```bash
npm run test:e2e:headed
cd apps/app && npx playwright test --ui
```

Playwright output, traces, and screenshots are written to ignored test-output
directories. Do not commit them.

## Local email behavior

Tests do not send email. Vitest sets `EMAIL_DELIVERY=log`, and localhost also
selects log delivery. Browser helpers read the last logged magic-link data from
the local application state instead of depending on an inbox.

When adding an email template or trigger, update [emails.md](./emails.md) and
cover both delivery selection and the calling service.

## Upload storage

With a localhost `APP_URL`, application uploads use the ignored
`apps/app/.local/` directory. Self-Hosted tests use a temporary filesystem
directory and verify traversal protection and cleanup. Cloud object-storage
credentials are not needed for public checks.

## CI expectations

Public pull requests receive no RefKit-operated credentials. A public
application job should use a disposable PostgreSQL 17 service and run:

1. `npm ci`
2. `npm run build:validation`
3. `npm run lint -w @refkitnet/app`
4. `npm run typecheck -w @refkitnet/app`
5. `node apps/app/scripts/self-hosted/migrate.mjs`
6. `npm test`

The browser suite may run in a separate secretless job with the same database
contract. Package and publication checks remain separate so failures identify
the affected surface clearly.

## Change coverage

At minimum:

- API behavior changes need service or route integration coverage and an API
  index assertion;
- money, attribution, payout, and status changes need idempotency and illegal
  transition cases;
- edition capability changes need both Cloud and Self-Hosted rejection tests;
- dashboard behavior changes need focused unit coverage and browser coverage
  when the behavior depends on navigation or browser state;
- package changes need their package tests; and
- schema changes need a forward-only migration plus clean-database migration
  verification.

Never weaken a test to accept behavior that contradicts [PRODUCT.md](../PRODUCT.md)
or the public API contract in [api.md](./api.md).

## Related docs

- [architecture.md](./architecture.md)
- [api.md](./api.md)
- [editions.md](./editions.md)
- [stripe.md](./stripe.md)
- [Self-Hosted operations](../../../docs/self-hosting/operations.md)
