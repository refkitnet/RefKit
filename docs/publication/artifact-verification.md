# Verify release artifacts

Only use a release after its notes identify the source tag, commit, image digest, compatible package versions, and known limitations.

## Verify the image digest

Replace the example digest with the digest printed in the release notes:

```bash
docker pull ghcr.io/refkitnet/refkit@sha256:RELEASE_DIGEST
docker buildx imagetools inspect ghcr.io/refkitnet/refkit@sha256:RELEASE_DIGEST
```

The inspected digest must match the release notes and the manifest must include `linux/amd64` and `linux/arm64`. Keep the digest in deployment configuration. A semantic-version tag is a discovery aid, not a substitute for recording the digest.

## Verify the keyless signature

Install Cosign from its official release instructions, then verify the protected workflow identity:

```bash
cosign verify \
  --certificate-identity-regexp '^https://github.com/refkitnet/RefKit/.github/workflows/container.yml@refs/tags/v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  ghcr.io/refkitnet/refkit@sha256:RELEASE_DIGEST
```

Reject a signature from a different repository, workflow, ref type, or issuer. Inspect attached SBOM and provenance entries with `cosign tree` and the verification commands stated in that release's notes. The exact attestation predicate format is part of the release contract and must be tested before publication.

Verify the GitHub build-provenance attestation against the public source repository:

```bash
gh attestation verify \
  oci://ghcr.io/refkitnet/refkit@sha256:RELEASE_DIGEST \
  --repo refkitnet/RefKit
```

## Match source and image

The image revision label, provenance source revision, release tag commit, and release-note commit must all match. The SBOM and vulnerability report must refer to the same digest. Independently versioned npm packages must match the compatibility table, not the application version by assumption.

## Publisher or signing compromise

If a publishing credential, workflow identity, tag, package, or signing path may be compromised:

1. Stop releases and Cloud promotion.
2. Revoke affected credentials and publishing access.
3. Mark affected releases and digests as untrusted without deleting the historical evidence.
4. Publish a security advisory with affected versions, digests, and immediate mitigations.
5. Audit the protected source, workflow history, registry, package registry, attestations, and access logs.
6. Build a fixed release from a reviewed source revision under a restored trusted identity.
7. Publish a new version and digest. Never replace content behind an existing release version.

Operators should pin digests so a mutable reference cannot silently replace the artifact they reviewed.
