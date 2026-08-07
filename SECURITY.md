# Security policy

## Supported versions

RefKit has not yet published a supported Self-Hosted release. Pre-release source and images receive no security-support guarantee.

After the first public stable release, the support policy is:

| Release line | Security fixes |
|--------------|----------------|
| Latest patch of the latest stable application major | Supported |
| Older application majors and older patches | Not supported unless release notes explicitly say otherwise |
| Latest published SDK, CLI, MCP, and validation package versions | Supported |
| Older package versions | Not supported unless a security advisory says otherwise |

Release notes identify any temporary exception. Operators should subscribe to repository security advisories and upgrade to a supported version.

## Report a vulnerability

Use GitHub private vulnerability reporting from the repository Security tab. If that option is unavailable, email `support@refkit.net` with the subject `Security report`. Do not open a public issue or include live credentials, customer data, or exploit details in a public channel.

Include, when possible:

- the affected version, source revision, package, or image digest;
- the affected deployment mode;
- reproduction steps or a minimal proof of concept;
- impact and required attacker access; and
- any suggested mitigation.

Maintainers will assess the report, coordinate a fix and advisory when warranted, and credit reporters who want attribution. Response or remediation times cannot be guaranteed.

Wait for coordinated disclosure before publishing exploit details. If coordination breaks down, communicate privately before disclosure so operators have a reasonable opportunity to update.

## Scope

Reports about authentication, authorization, tenant isolation, API credentials, webhooks, uploads, outbound request abuse, payout-data encryption, or secret exposure are in scope. Self-Hosted configuration mistakes and vulnerabilities in unsupported versions may still be useful reports, but operators remain responsible for their own host, proxy, TLS, database, email, storage, backups, and secret management.

## Publication settings gate

Before the new public core repository becomes public, maintainers must enable and test private vulnerability reporting, security advisories, secret scanning with push protection where available, dependency alerts, and code scanning. The fallback mailbox must also be verified. This file does not claim those external settings are already active.
