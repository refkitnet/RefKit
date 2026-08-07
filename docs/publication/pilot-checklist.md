# Independent operator pilot

The first public release requires a clean-room pilot by someone who does not have maintainer credentials, private package access, unpublished instructions, or access to RefKit infrastructure.

## Pilot record

Record:

- operator and observer;
- date and clean host details;
- source tag, commit, image tag, and image digest;
- CPU architecture and container-runtime versions;
- exact public documentation revision used;
- start and finish time; and
- every point where the operator needed unstated knowledge or maintainer intervention.

## Required journey

- [ ] Install on a clean server using only public instructions.
- [ ] Configure the public URL, proxy, TLS, persistent storage, email, database, and secrets.
- [ ] Bootstrap the first administrator once and sign in by magic link.
- [ ] Confirm an arbitrary visitor cannot create a Developer workspace.
- [ ] Create an App and Program, invite an Affiliate, and complete the private join flow.
- [ ] Capture a click, identify a customer, and exercise initial payment, renewal, partial refund, full refund, and complete dispute outcomes.
- [ ] Verify commissions, recovery behavior, and the manual payout workflow.
- [ ] Upload an asset, restart the deployment and host, and verify persistence.
- [ ] Use the SDK, CLI, and MCP against the explicit custom origin.
- [ ] Create a database and uploads backup, simulate loss, and restore onto a clean host with separately protected secrets.
- [ ] Rehearse the applicable upgrade origin and rollback-by-restore procedure.
- [ ] Inspect egress and confirm no request targets RefKit infrastructure.
- [ ] Confirm Cloud-only controls, managed connectors, official Network data, RefKit billing, and RefKit support UI are absent.

Repeat architecture-specific image checks on both amd64 and arm64. The full human journey may be split across hosts only if the same image digest and documentation revision are used.

## Acceptance

Maintainer intervention, private credentials, hidden instructions, data loss, a failed supported upgrade, or unexplained RefKit egress fails the pilot. Fix the product or public documentation, build a new candidate when source changed, and repeat affected steps.

The final record must link each issue found to its resolution and identify the candidate that passed. Do not publish a release based on an earlier candidate's result.
