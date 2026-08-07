# Self-Hosted operator responsibilities

RefKit Self-Hosted is software an operator runs for a private affiliate program. It is not a RefKit-operated service.

## Edition boundary

| Area | Self-Hosted | RefKit Cloud |
|------|-------------|--------------|
| Core affiliate workflows, REST API, SDK, CLI, and MCP | Included | Included |
| Revenue reporting | Operator application reports normalized events through REST or the server SDK | Direct API reporting plus RefKit-operated connectors when offered |
| Official RefKit Network | Not included | RefKit-operated service |
| Email and file storage | Operator credentials and infrastructure | RefKit-operated infrastructure |
| RefKit billing, paywalls, and upgrade prompts | Not included | May apply to Cloud plans |
| Operational support | Community, best effort | Separate Cloud support scope |

A fork may build its own local market or connector. It is not connected to the official RefKit Network and must not imply that RefKit operates it.

## Operator security and operations

The operator is responsible for:

- host, container runtime, network, firewall, DNS, reverse proxy, and TLS security;
- database and upload durability, capacity, monitoring, backup, restore, and disaster recovery;
- generating, storing, rotating, and separately protecting secrets and encryption keys;
- email-provider configuration, sender authorization, deliverability, and abuse handling;
- access control for administrators and additional Developers;
- timely upgrades and review of release notes and security advisories;
- legal and privacy obligations for Affiliate, customer, payout, and event data; and
- monitoring configured outgoing webhooks and other intended egress.

Loss of a recovery-critical encryption secret can make encrypted data unrecoverable. Ordinary data backups must not be assumed to contain or safely protect deployment secrets.

## Privacy and no-call-home release contract

A supported Self-Hosted release must not send runtime telemetry, analytics, error reports, license checks, update pings, hosted configuration requests, support messages, remote fonts, or other traffic to RefKit infrastructure. RefKit support UI and official Network access are absent.

Expected egress is limited to destinations the operator explicitly configures, such as email delivery and outgoing webhooks. The SDK, CLI, and MCP must stay on the explicit Self-Hosted origin and must not fall back to RefKit Cloud.

This is a release contract, not a claim about an unverified development build. Egress inspection against the exact candidate is required before release. Operators should independently monitor egress when their risk model requires it.

## License and support

Modified network deployments may have AGPL Corresponding Source obligations. See [agpl-compliance.md](./agpl-compliance.md). RefKit trademarks are governed separately by [TRADEMARKS.md](../../TRADEMARKS.md).

Community support has no service-level guarantee. See [SUPPORT.md](../../SUPPORT.md) and [SECURITY.md](../../SECURITY.md).
