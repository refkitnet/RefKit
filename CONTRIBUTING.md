# Contributing to RefKit

Thank you for considering a contribution. RefKit stays lean and direct, so contributions should solve one clear problem without unrelated features or refactors.

## Before you start

- Search existing issues and pull requests.
- For a substantial product change, open an issue before implementation so maintainers can confirm scope and edition behavior.
- Read the root `AGENTS.md`. Read a surface-specific `AGENTS.md` before changing that surface.
- Never include credentials, customer data, private URLs, production identifiers, or proprietary Shopify application material in a public issue or pull request.
- Report suspected vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

## License and DCO

The path license map is in [LICENSES.md](./LICENSES.md). Contributions are licensed under the license that applies to the contributed path.

RefKit uses the [Developer Certificate of Origin 1.1](./DCO), not a contributor license agreement. Every commit must include a sign-off made by the contributor:

```text
Signed-off-by: Your Name <you@example.com>
```

Create it with:

```bash
git commit -s
```

The sign-off certifies the DCO. It is not merely a formatting requirement. If a commit is missing it, amend the commit yourself. Another person must not add your sign-off for you.

By contributing assets, copied text, generated output, or AI-assisted work, you remain responsible for confirming that you have the right to submit it and that required notices are included.

## Make the change

- Do only what the issue or pull request requires.
- Do not add a dependency unless the change explains why it is needed.
- Keep public API changes aligned across the app, SDK, CLI, MCP, tests, and documentation as required by the repository instructions.
- Do not use the Unicode em dash character in repository text.
- Add or update tests in proportion to the behavior changed.
- Preserve third-party license and attribution notices.

Run the checks documented in `AGENTS.md` for the affected surfaces. A public pull request must pass secretless required checks. Maintainer credentials are never made available to pull requests from forks.

## Pull request review

Describe the problem, the smallest chosen solution, tests run, and any operational or documentation effect. Maintainers may ask for a smaller change or decline work that does not fit the current product direction.

Acceptance does not create a promise of employment, compensation, support, or future maintenance. See [GOVERNANCE.md](./GOVERNANCE.md) for project decision-making.
