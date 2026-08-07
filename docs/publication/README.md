# Public release documentation

These documents define repository publication, security review, artifact, support, and operator-policy gates for RefKit. They are release controls, not evidence that Self-Hosted is ready today.

| Document | Purpose |
|----------|---------|
| [release-policy.md](./release-policy.md) | Versioning, support window, GHCR artifacts, compatibility, and source traceability |
| [release-notes-template.md](./release-notes-template.md) | Required source, image, package, upgrade, verification, and limitation fields |
| [publication-checklist.md](./publication-checklist.md) | Fresh-baseline sanitation, GitHub settings, rehearsal, and final publication gates |
| [public-repository-boundary.md](./public-repository-boundary.md) | Exact public core scope, private exclusions, canonical-source cutover, and boundary acceptance tests |
| [security-review.md](./security-review.md) | Required threat model and independent review evidence |
| [asset-rights-review.md](./asset-rights-review.md) | Bundled asset provenance, trademark, redistribution, and notice gate |
| [operator-responsibilities.md](./operator-responsibilities.md) | Self-Hosted responsibility, privacy, support, and Cloud boundary |
| [agpl-compliance.md](./agpl-compliance.md) | Practical Corresponding Source checklist for operators and RefKit Cloud |
| [artifact-verification.md](./artifact-verification.md) | Digest and keyless-signature verification plus compromise response |
| [pilot-checklist.md](./pilot-checklist.md) | Independent clean-room operator pilot record |

Runtime installation, configuration, proxy, backup, restore, and upgrade procedures live with the Self-Hosted deployment materials. The documents here do not replace those procedures.

## Completed one-time review

The copyright holder and legal reviewer completed the legal, trademark,
contributor, asset, and redistribution-rights review on 2026-08-05. The
reviewer's identity is retained in the private legal record.

## External gates

The following cannot be completed by committing files alone:

- an allowlisted export into the new public core repository and a final scan of the exact first public commit;
- credential rotation or revocation after the selected publication-surface audit;
- GitHub branch, tag, environment, Actions, security, package, and vulnerability-reporting settings;
- GHCR package visibility and protected publishing identity;
- independent security review and closure of high or critical findings;
- a clean-room pilot by a person without maintainer credentials; and
- final amd64, arm64, restore, upgrade, proxy, and no-egress rehearsals.

A checked-in policy is not proof that any external gate passed. Evidence must identify the tested source revision and artifact digest.
