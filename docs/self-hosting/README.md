# RefKit Self-Hosted

RefKit Self-Hosted runs the shared RefKit application without a RefKit account,
RefKit credentials, or RefKit-operated infrastructure. The supported first
topology is one RefKit application container, PostgreSQL 17, a persistent
uploads volume, scheduled logical backups, and a host-managed HTTPS reverse
proxy.

Self-Hosted does not include the official RefKit Network, managed Stripe,
RefKit billing, or RefKit support workflows. Report normalized revenue events
from your application through the REST API or server SDK.

## Supported host

- Linux with Docker Engine 24 or newer and Docker Compose v2.24 or newer
- amd64 or arm64
- 2 CPU cores, 2 GB RAM, and 10 GB free disk before database, upload, and backup growth
- A DNS name whose HTTPS traffic can reach the host
- An operator-managed Caddy, Nginx, or equivalent TLS reverse proxy
- An SMTP account or Resend account
- Outbound access only to destinations the operator configures, such as email and App webhooks

The first release supports one application instance and the bundled PostgreSQL
17 topology. Multi-instance application serving, shared object storage,
Kubernetes, and automatic database downgrade are not supported.

## Build a fork from source

Official releases use the published image digest from the release notes. A
fork must build an image whose labels point to the exact public source it
serves. From the repository root, replace the example source URL with the
browsable source root for your revision:

```bash
refkit_revision="$(git rev-parse HEAD)"
refkit_version="0.1.0-fork.1"
refkit_source_url="https://github.com/OWNER/REPOSITORY/tree/$refkit_revision"
docker build \
  --build-arg "REFKIT_VERSION=$refkit_version" \
  --build-arg "VCS_REF=$refkit_revision" \
  --build-arg "SOURCE_URL=$refkit_source_url" \
  --tag "ghcr.io/OWNER/refkit:$refkit_version" \
  .
```

The build refuses missing or placeholder identity arguments. The source URL
must include the fork's modifications and the Corresponding Source materials
for the running image. `GET /api/health/live` reports the identity. The
in-product `/legal` page and `GET /api/legal` endpoint link the exact
Corresponding Source and legal notices for the running build.

## Install

1. Copy `deploy/self-hosted` from the exact RefKit release tag to the server.
2. Copy `.env.example` to `.env`, then restrict it:

   ```bash
   cd deploy/self-hosted
   cp .env.example .env
   chmod 600 .env
   ```

3. Set `REFKIT_IMAGE` and `REFKIT_VERSION` to the exact values in that release's
   notes. Prefer the published digest, for example
   `ghcr.io/refkitnet/refkit@sha256:...`. Never use `latest`.
4. Generate independent secrets. Put the values into `.env` without committing
   the file:

   ```bash
   openssl rand -hex 32       # POSTGRES_PASSWORD
   openssl rand -hex 32       # BETTER_AUTH_SECRET
   openssl rand -base64 32    # PAYOUT_DETAILS_ENCRYPTION_KEY
   openssl rand -hex 32       # IP_HASH_SALT
   openssl rand -hex 32       # SELF_HOSTED_SETUP_TOKEN
   ```

5. Set `APP_URL` to the final public HTTPS origin and configure either SMTP or
   Resend. See [Configuration](./configuration.md).
6. Pull the pinned artifacts, start PostgreSQL, run the one-shot migration, and
   then start the application and scheduled backup service:

   ```bash
   docker compose pull
   docker compose up -d postgres
   docker compose --profile tools run --rm migrate
   docker compose up -d
   docker compose ps
   ```

   Application startup never runs migrations. A failed migration leaves the
   application unavailable until the operator fixes the error or restores the
   pre-upgrade backup.

7. Configure TLS using [the maintained Caddy example](./reverse-proxy.md). Keep
   port 3000 bound to loopback. Never publish the PostgreSQL container port.
8. Open `https://your-refkit-host.example/setup`, enter the one-time setup token,
   and create the first administrator. The token cannot create another first
   administrator after bootstrap is complete.

## Verify

```bash
curl --fail https://your-refkit-host.example/api/health/live
curl --fail https://your-refkit-host.example/api/health/ready
docker compose logs --tail=100 app
docker compose logs --tail=100 backup-scheduler
```

Liveness proves that the process responds. Readiness additionally proves that
the database is reachable and has the exact migration expected by the image.
An optional email or webhook destination does not affect readiness.

Read [Operations](./operations.md) before admitting production traffic. A
recoverable deployment needs an off-server backup plus a separately protected
copy of the recovery secrets.

Use [Self-Hosted revenue integration](./revenue-integration.md) to configure
the SDK, CLI, MCP, and billing-provider webhook adapter for this instance.

## Privacy and egress

The Self-Hosted runtime disables Next.js telemetry and does not perform RefKit
license checks, update checks, support requests, or telemetry. Runtime egress is
limited to operator-configured email and outgoing App webhook destinations.
The operator's application and wrappers must use this instance's explicit
origin. Do not leave an SDK, CLI, or MCP client pointed at RefKit Cloud.

## License, security, and support

The server is licensed `AGPL-3.0-only`; modified network deployments may have
Corresponding Source obligations. Read [the practical AGPL guidance](../publication/agpl-compliance.md),
[license map](../../LICENSES.md), and [trademark policy](../../TRADEMARKS.md).
Self-Hosted is operator-supported, not a RefKit-operated service. The project
support boundary is in [SUPPORT.md](../../SUPPORT.md), and suspected
vulnerabilities must follow [SECURITY.md](../../SECURITY.md). Production
security ownership is summarized in
[operator responsibilities](../publication/operator-responsibilities.md).
