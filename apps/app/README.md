# RefKit App

Next.js product app shared by RefKit Cloud and RefKit Self-Hosted: dashboard, REST API, synchronous webhooks, and click redirect.

Self-Hosted operators should start with [the deployment guide](../../docs/self-hosting/README.md).

## Docs

| File | Read when |
|------|-----------|
| [AGENTS.md](./AGENTS.md) | Before any change under `apps/app/` |
| [PRODUCT.md](./PRODUCT.md) | Product rules still in force |
| [TECH.md](./TECH.md) | Pinned engineering conventions |
| [docs/architecture.md](./docs/architecture.md) | How the system works today |
| [docs/api.md](./docs/api.md) | REST endpoint map |
| [docs/emails.md](./docs/emails.md) | Outbound email catalog |
| [docs/stripe.md](./docs/stripe.md) | Stripe channel + local fixtures |
| [docs/testing.md](./docs/testing.md) | Test suites and CI |

## Local development

From the repo root. Requires PostgreSQL 17 at `C:\Program Files\PostgreSQL\17\bin` (Windows).

```bash
npm install
cp apps/app/.env.example apps/app/.env.local
# fill in secrets in .env.local (DATABASE_URL defaults to local Postgres)
npm run test:db
npm run db:migrate
npm run dev:app
```

| Command | Database |
|---------|----------|
| `npm run dev:app` | Database configured by `DATABASE_URL` |
| `npm run db:migrate` / `db:studio` | Local (auto-starts cluster) |
| `npm run db:seed` | Local |
| `npm test` / `npm run test:e2e` | Local |

```bash
npm run db:generate   # after schema changes
npm run db:migrate
```

## Project layout

```text
src/app/           Next.js routes (thin handlers only)
src/app/api/v1/    public REST API
src/services/      business logic (one module per domain)
src/db/            Drizzle schema, migrations, client
src/lib/           shared utilities
src/emails/        react-email templates
src/components/    dashboard and affiliate portal UI
```
