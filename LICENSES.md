# Repository license map

The RefKit public core distribution uses multiple licenses. The license nearest to an included file takes precedence. If an included file or directory has no more specific notice, the default license below applies.

This file does not grant a license to marketing, demos, hosted canaries, operated-service packaging, product source, private operations, or any other material excluded by [the public repository boundary](./docs/publication/public-repository-boundary.md). Those paths are not part of the public distribution.

Legal review completed on 2026-08-05. The copyright holder and legal reviewer, whose identity is retained in the private legal record, reviewed and approved this license map, the public boundary, contributor terms, trademark treatment, and redistribution-rights treatment.

## Default license

Unless an exception below applies, source code, scripts, configuration, tests, and documentation included in the public core repository are licensed under the GNU Affero General Public License, version 3 only (`AGPL-3.0-only`). The complete text is in [LICENSE](./LICENSE).

## Directory map

| Material | License or status | Notice |
|----------|-------------------|--------|
| `apps/app/**` | `AGPL-3.0-only`, except third-party code and assets identified below | Root [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) |
| `apps/app/src/components/ui/**` portions generated from or adapted from shadcn/ui | MIT | shadcn notice in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) |
| `packages/sdk/**` | MIT | `packages/sdk/LICENSE` |
| `packages/cli/**` | MIT | `packages/cli/LICENSE` |
| `packages/mcp/**` | MIT | `packages/mcp/LICENSE` |
| `packages/validation/**` | MIT | `packages/validation/LICENSE` |
| `deploy/self-hosted/**` | `AGPL-3.0-only` | Root [LICENSE](./LICENSE) |
| `docs/self-hosting/**` and `docs/publication/**` | `AGPL-3.0-only` | Root [LICENSE](./LICENSE) |
| RefKit logo and favicon copies under `apps/app/public/**` and `packages/mcp/assets/**` | RefKit brand assets, outside the AGPL and MIT grants | [TRADEMARKS.md](./TRADEMARKS.md) |
| `third-party/**` and `THIRD_PARTY_NOTICES.md` | Upstream terms stated in each notice | Preserve verbatim notices |
| Included root tooling, public workflows, and `scripts/**` | `AGPL-3.0-only` | Root [LICENSE](./LICENSE) |

## Brand and asset exceptions

The RefKit name, logos, wordmarks, favicons, and other source-identifying brand assets are not licensed under the AGPL or MIT merely because approved copies are included beside licensed software. Use is governed by [TRADEMARKS.md](./TRADEMARKS.md).

Third-party names, logos, fonts, icons, screenshots, and other assets remain the property of their respective owners and are subject to their own terms. Dependency license notices distributed with dependencies are not replaced by this map. The publication review must verify redistribution rights and required attribution for every bundled asset.

The [DCO](./DCO) is distributed under the verbatim-copy permission stated in that file. The AGPL license text in [LICENSE](./LICENSE) is distributed under the verbatim-copy permission stated in that file.

## Contributions

Contributions are accepted under the license that applies to the contributed path. The project uses the Developer Certificate of Origin 1.1, as described in [CONTRIBUTING.md](./CONTRIBUTING.md). No contributor license agreement is required by the current policy.

This map is a project licensing notice, not legal advice. If a specific file has unclear or conflicting terms, do not redistribute it until the maintainers resolve the conflict.
