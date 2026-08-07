# Publication and release checklist

This checklist records required evidence. Do not mark an item complete only because supporting files or workflows exist.

## One-time legal and project gates

- [x] Confirm the legal copyright holder and the authority to license all submitted work. On 2026-08-05, the copyright holder confirmed ownership of the selected RefKit source and authority to license it. The holder's identity is retained in the private legal record.
- [x] Obtain appropriate review of [LICENSES.md](../../LICENSES.md), [CONTRIBUTING.md](../../CONTRIBUTING.md), [DCO](../../DCO), [TRADEMARKS.md](../../TRADEMARKS.md), and third-party notice handling. On 2026-08-05, the copyright holder and legal reviewer approved the documented treatment. The reviewer's identity is retained in the private legal record.
- [x] Complete [asset-rights-review.md](./asset-rights-review.md) and verify rights and required attribution for source, generated work, contractor work, copied text, fonts, images, icons, fixtures, templates, screenshots, and sample data. The copyright holder and legal reviewer approved the retained-asset treatment on 2026-08-05; final image dependency inspection remains a release-candidate artifact gate. The reviewer's identity is retained in the private legal record.
- [x] Approve and freeze [public-repository-boundary.md](./public-repository-boundary.md). The copyright holder and legal reviewer approved the public-core and private-internal repository model on 2026-08-05. The reviewer's identity is retained in the private legal record. Any boundary change requires a new review.
- [ ] Confirm that marketing, demos, hosted canaries, operated-service packaging, product source, private deployment material, and external Shopify application material are absent from the public export.
- [x] Confirm that the selected public support and security contacts work. On 2026-08-05, the maintainer confirmed that `support@refkit.net` received the test message and could send a reply. Support, security fallback, and conduct reports use this mailbox.
- [ ] Replace the pre-release status in `SECURITY.md` with the first supported application version before publishing the first stable release.

## Fresh public baseline

- [ ] Create a new public-repository target without copying private Git history or hosting metadata.
- [ ] Run the deterministic allowlist export from the frozen release-candidate revision.
- [ ] Verify that public-specific manifests, lockfile, README, ignore files, and workflows name only included workspaces and public operations.
- [ ] Fail the export on unapproved paths, symlinks, untracked inputs, missing local dependencies, or required references to excluded paths.
- [ ] Audit the exported tree, build context, generated source, release artifacts, package archives, and registry content.
- [ ] Scan for credentials, personal data, customer data, private URLs, production identifiers, database dumps, logs, screenshots, environment files, and internal operational material.
- [ ] Confirm that no exported source, documentation, manifest, test, script, or workflow requires `apps/website`, either demo application, `apps/mcp`, `apps/stripe-app`, `product`, `help-center`, `DEPLOYMENTS.md`, or another private repository.
- [ ] Rotate or revoke every credential found in the selected publication surface, including expired-looking or deleted credentials whose validity was not independently disproved.
- [ ] Run secret, dependency, license, and static-analysis scans against the final export.
- [ ] Resolve every high or critical security finding or document an approved release-blocking exception. No high or critical finding may be silently accepted.
- [ ] After the existing high-severity dependency baseline is clear, raise the automated `npm audit` threshold from `critical` to `high` before making the repository public.
- [ ] Rehearse through a clean clone or private mirror with no maintainer-only cache, package, registry, credential, or build service.
- [ ] Repeat the complete scan against the exact final public baseline immediately before changing visibility.
- [ ] Keep the original private repository and its metadata private.
- [ ] After the first public commit, rebuild from a clean public clone and compare the application inputs with the approved export.

## GitHub settings after public repository creation

- [ ] Restrict default workflow token permissions to read-only and require explicit workflow permissions.
- [ ] Disable Actions from untrusted sources or allow only explicitly approved, commit-pinned Actions.
- [ ] Protect `main`, require pull-request review and secretless checks, include administrators, and block force pushes and deletion.
- [ ] Protect release tags and restrict who can create or update them.
- [ ] Enable dependency graph, Dependabot alerts, security updates, and the checked-in update configuration.
- [ ] Enable code scanning, secret scanning, push protection, security advisories, and private vulnerability reporting where the GitHub plan supports them.
- [ ] Verify that a fork pull request receives no repository, environment, deployment, package-publish, or cloud credential.
- [ ] Configure application hosting so fork code cannot receive production variables, privileged preview credentials, or automatic production deployment.
- [ ] Make the GHCR application package public and restrict publishing to the protected workflow identity.
- [ ] Configure npm trusted publishing, required two-factor authentication, provenance, and restricted maintainers for every public package.
- [ ] Enable issue moderation and confirm the security contact links.

## Private promotion checks

- [ ] Run hosted canary and managed-connector checks in private automation against the immutable public candidate.
- [ ] Verify that private checks do not modify the candidate source or produce a different application tree.
- [ ] Use dedicated disposable test credentials, never maintainer or production credentials.
- [ ] Confirm that public pull requests cannot trigger private checks, receive private results containing secrets, or reach a deployment environment.

## Release-candidate evidence

- [ ] Freeze one protected source revision and record its commit.
- [ ] Confirm the candidate was built from the protected public commit and not from the private source directory.
- [ ] Re-run the structural catalog comparison for `0000_public_baseline`, then verify its hash against the frozen source revision.
- [ ] Build amd64 and arm64 images from that revision.
- [ ] Record the multi-architecture digest, SBOM, provenance, keyless signature, and vulnerability result.
- [ ] Verify no image layer, source archive, npm package, log, or workflow artifact contains a secret or unintended file.
- [ ] Complete the targeted threat model and independent security review in [security-review.md](./security-review.md).
- [ ] Complete the clean-room pilot in [pilot-checklist.md](./pilot-checklist.md).
- [ ] Rehearse install, production TLS proxy behavior, persistence, backup, restore to a clean host, supported upgrade origins, and no-egress behavior.
- [ ] Verify the golden Self-Hosted journey and the Cloud regression journey against the same shared source revision.
- [ ] Confirm known limitations and support boundaries are public.

## Publication order

1. Finalize and verify the public migration baseline.
2. Freeze and scan the intended source revision.
3. Build the release candidate from the protected revision.
4. Complete clean-room, restore, upgrade, proxy, multi-architecture, security, and no-egress rehearsals.
5. Promote the tested source and artifact digest. Publish matching source, image, package compatibility, release notes, and documentation.
6. Deploy the exact compatible public revision to RefKit Cloud after any separately approved private-era data reset.
7. Complete the canonical-source cutover, then run Self-Hosted, Cloud, and private canary smoke journeys and record the results.

## Final authorization

- [ ] Release notes identify the source tag, commit, image digest, schema state, compatible package versions, upgrade origins, and known limitations.
- [ ] Artifact verification passes using [artifact-verification.md](./artifact-verification.md).
- [ ] The release administrator confirms that every required gate has evidence tied to the release candidate.
