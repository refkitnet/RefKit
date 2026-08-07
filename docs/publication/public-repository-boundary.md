# Public repository boundary

This document defines the source boundary for the RefKit open-source application repository. It replaces the earlier assumption that the complete private monorepo would become public.

## Repository model

RefKit will create a new public repository from an allowlisted, audited export. Private Git history and private hosting metadata are not copied.

The current private GitHub repository will be renamed to `RefKit-internal`. The `refkitnet/RefKit` identity is reserved for the new public core repository.

The initial export is a one-time cutover. After cutover, the public repository is the canonical home for the shared application and its public packages. RefKit Cloud builds the application from a public commit. Core changes and community contributions land in the public repository first.

The private repository remains the canonical home for marketing, hosted canaries, internal product material, and private operational integrations. It must not keep a separately editable copy of public core code after cutover. Private tools consume the public API, published packages, images, or an explicit public checkout.

## Included public source

The public repository contains only the material needed to build, test, understand, deploy, operate, and modify the shared RefKit application:

| Group | Included material |
|-------|-------------------|
| Application | The complete tracked `apps/app/**` tree after private-only operations and broken private-path references have been moved or rewritten |
| Shared build dependency | `packages/validation` |
| Public clients | `packages/sdk`, `packages/cli`, and `packages/mcp`, including their tests, package licenses, and user documentation |
| Self-Hosted distribution | Root container build, `deploy/self-hosted`, runtime notice generation, and operator documentation under `docs/self-hosting` |
| Public project policy | AGPL and MIT license notices, trademark policy, contribution terms, DCO, governance, code of conduct, support, security, release policy, and vulnerability reporting |
| Public automation | Secretless application and package checks, dependency and license review, secret scanning, CodeQL, container build and scan, DCO verification, and release workflows |
| Release evidence | Public migration baseline checks, release notes, artifact verification, security review, clean-room pilot, and source-to-image provenance records |

The public root `package.json`, `package-lock.json`, README, ignore files, workflows, and application manifest are public-specific files. They must not be copied blindly from the private monorepo when they reference excluded workspaces or private operations.

## Explicitly excluded private material

The following material is outside the public repository:

| Private group | Current private path or category | Reason |
|---------------|----------------------------------|--------|
| Marketing website | `apps/website` | Not required to build, modify, or operate RefKit Self-Hosted |
| Local and hosted merchant canaries | `apps/demo-app-client`, `apps/demo-app-express` | Internal integration and production monitoring surfaces |
| Hosted remote MCP placeholder | `apps/mcp` | Separate future operated service |
| Payment-platform application manifest | `apps/stripe-app` | RefKit-operated integration packaging, not part of the supported Self-Hosted topology. Its exclusion and corresponding-source treatment were legally reviewed and approved on 2026-08-05. The reviewer's identity is retained in the private legal record. |
| External Shopify application | Any Shopify application repository or material | Separate proprietary product and repository |
| Product and marketing source | `product` | Internal positioning, messaging, design, and source assets |
| Hosted help-center source | `help-center` | Published separately; only Self-Hosted and API documentation selected for the public repository is included |
| Private deployment map | `DEPLOYMENTS.md` and provider-specific private operations | Contains hosted topology and identifiers that are irrelevant to Self-Hosted |
| Private application operations | `internal/apps/app` | Private release records, Vercel environment synchronization, credentialed Stripe checks, hosted demo procedures, and archived application planning |
| Private automation | Website deploys, hosted canary jobs, protected Cloud connector tests, and private environment configuration | Requires RefKit-operated infrastructure or credentials |
| Internal state | Local uploads, screenshots, test output, environment files, logs, caches, database dumps, editor state, and agent state | Not source and may contain sensitive data |
| Private history and metadata | Existing commits, branches, tags, issues, pull requests, discussions, Actions logs, caches, releases, and deployment history | The public repository starts from a fresh reviewed baseline |

Exclusion is path-based, not license-based. A private path is not copied merely because its contents could be licensed. A public path is not omitted if it is required to build or provide the complete corresponding source for the released application.

## Application boundary rules

The complete shared application source used by RefKit Cloud and Self-Hosted is public. Cloud-only runtime branches inside `apps/app` remain public when they are part of the same application build. Credentials, customer data, hosted configuration values, and separate operated-service repositories do not.

Before the initial export, make the tracked `apps/app/**` tree public-safe as a unit. Move private-only canary and deployment automation out of that tree, replace references to excluded paths, and sanitize public examples. Do not maintain a fragile permanent denylist of individual application files.

`apps/app/vercel.json` remains public. It is credential-free shared Cloud runtime configuration for the same application build, not private deployment state. Hosted credentials, linked-project metadata, environment values, and deployment synchronization stay private.

The cutover cleanup classifies current application files as follows:

| Treatment | Current material |
|-----------|------------------|
| Retain and rewrite for public contributors | `AGENTS.md`, `README.md`, `PRODUCT.md`, `TECH.md`, `.env.example`, API and architecture documentation, edition documentation, testing guidance, and Stripe behavior documentation |
| Retain as public application source | `src/**`, database schema, the reviewed public migration baseline, runtime assets, build configuration, unit and integration tests, and secretless application end-to-end tests |
| Store under `internal/apps/app` before export | `BETA_RELEASES.md`, private Vercel setup material, private legal and release records, archived history, hosted canary procedures, private Stripe environment tests, private deployment synchronization, and demo-dependent scripts |
| Replace with public equivalents | Root-referencing documentation, help-center contribution rules, demo instructions, private deployment links, and any example containing a hosted test identifier |

The public documentation set includes application API, architecture, edition, email, Stripe behavior, testing, contributor, and Self-Hosted operator documentation. The separately published help center is not a checkout dependency.

Public tests are normal project source and remain included when they are secretless and exercise the public application. Private merchant demos and hosted monitoring canaries are not public tests and remain excluded.

Every public build must succeed using only the public checkout, public registries, and documented operator configuration. No public script or documentation link may require an excluded path.

## Initial export allowlist

The checked-in machine-readable export manifest must map only these source groups:

- public-specific root README, manifests, lockfile, ignore files, legal and community files, container build, and release tooling;
- the public-safe `apps/app/**` tree;
- `packages/validation/**`, `packages/sdk/**`, `packages/cli/**`, and `packages/mcp/**`;
- `deploy/self-hosted/**`;
- `docs/self-hosting/**` and the approved `docs/publication/**` controls;
- notice-generation and public-boundary checking scripts plus their reviewed notice inputs; and
- public issue templates, dependency configuration, and secretless application, package, security, container, contribution, and release workflows.

Use explicit workspace names in the public root manifest. Wildcards such as `apps/*` are prohibited because a future private workspace could enter the public lockfile or build context silently.

The exporter reads committed Git objects, not the working directory. It rejects symlinks, submodules, path or case collisions, unapproved file types, and unexpected binaries. It emits a sorted file-mode and SHA-256 manifest, runs twice with identical output, and does not publish the private source commit identifier.

## Initial cutover

1. Freeze the approved private source revision.
2. Export only the approved committed public paths into a new temporary directory.
3. Apply reviewed public-specific root files and explicit workspace manifests.
4. Generate the public lockfile from only the included workspaces.
5. Fail if the export contains an unapproved path, symlink, missing local dependency, private path reference, or untracked input.
6. Run secret, personal-data, private-identifier, dependency, license, static-analysis, and asset scans against the export.
7. Build and test the application, packages, container, migration baseline, and Self-Hosted deployment from the clean export. Never run the release container build with the private monorepo as its Docker context.
8. Initialize the new public repository without private history and record the first public commit.
9. Rebuild the release candidate from that public commit and repeat the release scans.
10. Cut RefKit Cloud application deployment over to the verified public commit.
11. Stop editing duplicate core files in the private repository and remove or archive the duplicate at the agreed private migration point.

## Ongoing ownership and release flow

- Shared application and package changes start in the public repository.
- Public pull requests receive only secretless checks.
- RefKit-operated integration and canary checks run from private automation against a public commit or published candidate artifact.
- A private check may block promotion, but it must not produce a different public application source tree.
- A Cloud production revision is not deployable until its public commit and corresponding source are available.
- Runtime version and source links identify the public commit, source tag, and promoted image digest.
- Marketing-site and canary releases remain independent from application releases.

## Boundary acceptance tests

The boundary is accepted only when:

- a clean clone of the public repository installs, builds, tests, and creates the container without access to the private repository;
- the exported tree contains none of the explicitly excluded paths;
- repository-wide searches find no required link, import, workspace, script, or workflow dependency on an excluded path;
- the public lockfile contains only dependencies reachable from public workspaces and tooling;
- RefKit Cloud can identify and deploy the same public application revision; and
- the private website, canaries, and operated integrations continue to work through public APIs, packages, or artifacts.

This boundary is a release-engineering control. The copyright holder and legal reviewer approved its corresponding-source and licensing treatment on 2026-08-05. The reviewer's identity is retained in the private legal record. Future material boundary changes require renewed review.
