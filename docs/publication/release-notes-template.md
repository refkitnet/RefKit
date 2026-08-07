# RefKit vMAJOR.MINOR.PATCH

Release status: draft until every field below is complete and the publication checklist passes.

## Release identity

- Source tag: `vMAJOR.MINOR.PATCH`
- Source commit: `FULL_COMMIT_SHA`
- Application image tag: `ghcr.io/refkitnet/refkit:MAJOR.MINOR.PATCH`
- Multi-architecture digest: `ghcr.io/refkitnet/refkit@sha256:RELEASE_DIGEST`
- amd64 digest: `ghcr.io/refkitnet/refkit@sha256:AMD64_DIGEST`
- arm64 digest: `ghcr.io/refkitnet/refkit@sha256:ARM64_DIGEST`
- Schema or migration state: `IDENTIFIER`

## Compatible packages

| Package | Tested compatible version or range |
|---------|------------------------------------|
| `@refkitnet/sdk` | Replace before publication |
| `refkitnet` CLI | Replace before publication |
| `@refkitnet/mcp` | Replace before publication |
| `@refkitnet/validation` | Replace before publication |

## Install and upgrade

- Fresh installation documentation: add the versioned link
- Directly supported upgrade origins: list every origin
- Required intermediate versions: none, or list them
- Backup and rollback notes: add version-specific details
- Breaking configuration, API, schema, or storage changes: none, or list them

## Verification

- Artifact verification result: add evidence tied to the release digest
- Vulnerability result: add evidence for both architecture digests
- SBOM and provenance: add registry or attestation references
- Clean-room pilot: add the passing record
- Security review: add the non-sensitive completion record

## Changes

Replace with generated and curated release notes.

## Known limitations

List all known product, topology, upgrade, and support limitations. Do not publish with placeholder text.

## Security

List security fixes and operator actions. Direct vulnerability reports to [SECURITY.md](../../SECURITY.md).
