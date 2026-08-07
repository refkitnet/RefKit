# Security review contract

RefKit requires a targeted threat model plus manual or independent review before the first public Self-Hosted release. Automated scans support this review but do not replace it.

## Required review areas

| Area | Minimum questions and evidence |
|------|--------------------------------|
| First-administrator bootstrap | Is the setup token generated securely, compared safely, stored safely, invalidated after first use, and impossible to reuse once an administrator exists? Is recovery local and closed to arbitrary visitors? |
| Magic links and sessions | Are tokens single-use, short-lived, origin-bound where appropriate, and absent from logs? Are cookies secure behind the supported proxy, sessions revocable, and redirects constrained? |
| Proxy and client identity | Are forwarded headers trusted only under the documented topology? Can an attacker spoof scheme, host, or client IP to affect URLs, cookies, rate limits, or audit records? |
| Invitations and private joins | Are tokens unguessable, scoped, expiring, and harmless on replay? Can a join path cross App, Program, or environment boundaries? |
| Tenant isolation | Do service and database queries enforce organization, App, Program, Affiliate, and test/live scope on every read and write? Include negative cross-tenant tests. |
| API credentials | Are keys generated with sufficient entropy, stored hashed where possible, scoped, redacted, revocable, and isolated between test and live? |
| Incoming webhooks | Are signatures checked over the raw body, replay harmless, event identities stable, body sizes bounded, and errors free of secrets? |
| Outgoing requests | Are webhook and other operator-controlled destinations protected from SSRF, DNS rebinding, private-network access, redirect abuse, excessive response size, and long timeouts? |
| Uploads | Are type, size, name, path, and authorization enforced? Can uploaded content escape persistent storage, overwrite files, execute, or become cross-tenant readable? |
| Rate limits | Do sensitive endpoints fail safely under concurrency and proxy deployment? Can key, IP, or account boundaries be bypassed or used for denial of service? |
| Payout-data encryption | Is key generation documented, ciphertext authenticated, plaintext excluded from logs, key loss treated as unrecoverable, and backup handling explicit? |
| Logs and errors | Are secrets, tokens, cookies, authorization headers, magic links, payout data, customer data, environment values, and connection strings redacted from logs and artifacts? |
| Dependencies and build | Are dependency, license, secret, CodeQL, container, SBOM, provenance, and signature controls active on the exact release source? Can a fork execute with privileged credentials? |
| No-call-home behavior | Does egress observation show that Self-Hosted runtime traffic reaches only operator-configured destinations? Do wrappers remain on their explicit custom origin without Cloud fallback? |

## Review method

For each area, record the source revision, reviewer, date, attack assumptions, test or code-review evidence, finding severity, owner, and disposition. Review both the supported production-proxy path and direct service behavior where relevant.

At least one reviewer must not be the primary author of the reviewed control. A qualified independent review is required for the first public release. Later releases repeat affected areas and the full review on material authentication, isolation, cryptography, upload, proxy, or outbound-request changes.

## Severity and release gate

Use a documented severity method and consider exploitability in the supported topology. Unresolved high or critical findings block publication. A lower-severity finding may be deferred only with a named owner, public or private rationale as appropriate, mitigation, and target release.

Sensitive findings and proof-of-concept material stay in the private security process. The public release record states that the review gate passed without exposing exploit details.
