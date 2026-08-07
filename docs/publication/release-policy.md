# Public release policy

## Publication baseline

RefKit will use a fresh public core repository baseline. The existing private repository and its metadata remain private. The public repository starts from an audited, allowlisted export of the application, public packages, Self-Hosted distribution, public tests, public documentation, and release materials defined in [public-repository-boundary.md](./public-repository-boundary.md). Marketing, demos, hosted canaries, operated-service packaging, product source, private operations, and private hosting metadata are not copied.

The export is a one-time cutover, not a permanent generated mirror. After cutover, the public repository is canonical for shared application and package source. The private repository must not maintain a separately editable fork of public core.

This strategy reduces the publication surface. It does not remove the need to audit the exported tree, build context, artifacts, first public commit, and new public hosting surfaces.

## Public migration baseline

The first public source release starts with the single reviewed migration
`apps/app/src/db/migrations/0000_public_baseline.sql`. The baseline is generated
from the current schema and includes the payout-item consistency function and
trigger that are not represented by Drizzle schema declarations. Its tables,
columns, indexes, constraints, functions, and triggers must match a database
created by the private-era chain before the first tag is frozen.

The private migration chain is not a supported public upgrade origin. RefKit
Cloud may deploy the baseline only after the separately approved private-era
data reset. After the first public tag, the baseline is immutable and every
schema change uses a new forward-only migration.

## Application versions

The application uses Semantic Versioning. Stable tags use `vMAJOR.MINOR.PATCH`; pre-release tags may append a Semantic Versioning identifier. A release is identified by all of the following:

- one protected source tag and commit;
- one migration state and schema contract from that source;
- one multi-architecture image at `ghcr.io/refkitnet/refkit` with an immutable digest;
- release notes and operator documentation for that version; and
- an explicit compatibility table for the independently versioned SDK, CLI, MCP, and validation packages.

Do not deploy or upgrade using an unqualified mutable image tag. Source tags use the `v` prefix; GHCR image tags omit it. Release instructions identify both and record the resolved image digest. The digest tested during rehearsal is the digest promoted for release.

## Support and upgrade window

Only the latest patch of the latest stable application major receives routine security fixes. Release notes may announce a temporary exception.

Direct application upgrades are supported within one major version unless release notes identify a required intermediate version. A major-version upgrade may require one or more documented intermediate releases. Database downgrade is not supported. Rollback restores the pre-upgrade logical backup and the previous pinned image.

For the first public release, upgrade behavior is rehearsed from a release candidate or synthetic predecessor. From the second public release onward, the release matrix includes every directly supported origin with a distinct public schema. It always exercises the oldest directly supported origin and the immediately previous release.

A release that changes the schema, configuration contract, or persisted files must update and pass the applicable upgrade paths before publication.

## Compatibility and breaking changes

The application and npm packages do not share a version number. Every application release note lists tested compatible package ranges. Package releases state the application API range they support.

Breaking changes to documented APIs, required configuration, persisted data, or supported deployment behavior require a major application release. Deprecations should provide a documented replacement and removal target when practical. Emergency security fixes may shorten a deprecation period, and release notes must explain why.

Public migrations are immutable and forward-only after their first release. A published tag, image digest, package version, SBOM, provenance statement, or signature is never replaced with different content.

## Image and supply-chain contract

Release images are public on GHCR for `linux/amd64` and `linux/arm64`. They carry source and revision labels and publish an SBOM and provenance. The release digest receives a keyless signature from the protected GitHub Actions release identity. Image publication must fail on unresolved high or critical findings in the release image.

Base images and third-party Actions are pinned to immutable digests or commits. Publishing uses GitHub's short-lived token and OIDC identity rather than a long-lived registry password. npm publishing must use protected trusted publishing and provenance where the registry supports it.

Verification instructions are in [artifact-verification.md](./artifact-verification.md). A release is incomplete until those instructions pass against the promoted digest.

## Source availability and RefKit Cloud

Every running build must expose or document its version, public source revision, and applicable source location. RefKit Cloud must make the complete Corresponding Source for its deployed AGPL-covered revision public no later than deployment of that revision. Cloud production builds from a verified public commit. Deployment from a private-only commit or from a privately patched application tree is prohibited by release policy.

This is a release requirement, not a claim that an unverified current deployment satisfies it. See [agpl-compliance.md](./agpl-compliance.md).

## Release authorization

A repository administrator authorizes a release only after the [publication checklist](./publication-checklist.md) or the established recurring subset is complete. Failed or missing evidence blocks release. A near-complete checklist is not an exception.

The tag workflow creates a draft GitHub Release. Before publication, maintainers replace placeholders and complete every applicable field in the [release notes template](./release-notes-template.md), then reconcile the curated notes with generated change notes.
