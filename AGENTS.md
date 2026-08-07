# AGENTS.md - RefKit public core

This repository is the canonical source for the RefKit application, public
packages, Self-Hosted distribution, public tests, and public technical
documentation.

## Working principles

- Do only what the issue or request requires. Keep changes small and direct.
- Do not add features, copy, abstractions, dependencies, pages, flows, or
  assets that were not requested.
- Do not use the Unicode em dash character in repository text. Use commas,
  colons, parentheses, or separate sentences.
- Never commit credentials, customer data, private URLs, production
  identifiers, database dumps, logs, environment files, or proprietary
  integration material.
- Do not make a public contributor checkout depend on private repositories,
  RefKit credentials, hosted canaries, or RefKit-operated infrastructure.
- Do not add a workspace wildcard. The root manifest must name every public
  workspace explicitly.

## Public surfaces

- `apps/app/`: shared Next.js application, REST API, dashboard, database,
  migrations, and tests. Read `apps/app/AGENTS.md` before changing it.
- `packages/validation/`: shared input validation.
- `packages/sdk/`: browser and server SDK.
- `packages/cli/`: command-line REST API client.
- `packages/mcp/`: stdio MCP server.
- `deploy/self-hosted/`: supported Docker Compose deployment.
- `docs/self-hosting/`: operator documentation.
- `docs/publication/`: public release, security, and compliance controls.

Each public package publishes independently. Do not couple one package to an
unrelated build or release.

## Change propagation

The REST API under `apps/app/src/app/api/v1` is the product contract. When API
behavior changes, update every affected service, API index, SDK, CLI, MCP tool,
dashboard consumer, test, and public technical document in the same change.
Keep route handlers thin and business logic in `apps/app/src/services`.

When public integration behavior changes, update the relevant API or package
README and Self-Hosted guidance in this repository. Do not refer contributors
to a private documentation source.

## Checks

Run the smallest relevant checks first, then the complete affected surface
before handing off:

| Change | Command |
| --- | --- |
| Application | `npm run check:app` |
| Public packages | `npm run check:packages` |
| Repository policy or legal files | `npm run check:publication` |
| Secretless application browser journey | `npm run test:e2e` |
| Application container | Build from this public repository root using the documented build arguments |

`npm run check` combines the application, package, and publication checks. The
current local database helper scripts require Windows PowerShell and
PostgreSQL 17. CI checks and the Self-Hosted container target Linux.

Never add a public workflow that exposes secrets to fork code, uses
`pull_request_target` to execute untrusted changes, or deploys an unreviewed
pull request. Keep workflow permissions minimal and pin third-party actions.

## Licensing and contributions

The repository default and application license are `AGPL-3.0-only`. The SDK,
CLI, MCP, and validation packages are MIT under their local license files.
Preserve copyright, dependency notices, the path-level map in `LICENSES.md`,
and the trademark boundary in `TRADEMARKS.md`.

All contributed commits require the DCO sign-off documented in
`CONTRIBUTING.md`. Report suspected vulnerabilities through `SECURITY.md`, not
a public issue.
