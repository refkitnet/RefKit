# Asset and notice review

This inventory covers only assets included in the public core repository defined by [public-repository-boundary.md](./public-repository-boundary.md). Private marketing, demo, canary, product-source, and operated-service assets are outside this publication gate.

| Asset group | Disposition | Evidence or remaining action |
|-------------|-------------|------------------------------|
| RefKit logo and favicon copies under `apps/app/public/**` | Retain as RefKit brand assets outside the software-license grants | On 2026-08-05, the asset creator and owner confirmed ownership of the RefKit fox assets. The identity is retained in the private legal record. Reviewed private source-of-record evidence and cleaned public hashes are recorded below. Historical resize and conversion settings are unknown. |
| `packages/mcp/assets/**` | Retain under the reviewed RefKit brand policy | The MIT package includes `BRAND_NOTICE.md`, which excludes the packaged icon from the MIT grant. The packaged icon is byte-identical to the reviewed 32 pixel favicon, as recorded below. |
| Third-party coding-agent and payment-provider logos formerly under `apps/app/public/**` | Removed | Active public application UI uses text or neutral icons. No third-party product logo is required by the public application. |
| Next.js and Vercel starter SVGs formerly under `apps/app/public/**` | Removed | Unused framework starter assets are not part of the public export. |
| shadcn/ui-derived component source | Retain under MIT | Preserve the shadcn notice in `THIRD_PARTY_NOTICES.md` and the generated runtime notice file. |
| Installed application and package dependencies | Retain under their upstream terms | Generate the dependency inventory and license texts from the exact public lockfile for each distributed build. |
| Local screenshots, uploads, environment files, and test output | Excluded from publication and container contexts | The exporter and build context must reject these inputs. Release builds use a clean public checkout. |

## Retained RefKit asset provenance

On 2026-08-05, the asset creator and owner confirmed ownership of these RefKit
fox assets and that they were created from owned inputs. The identity is
retained in the private legal record. Private brand-source files remain outside
the public repository boundary. Their paths and hashes are recorded here as
provenance evidence, not as public checkout dependencies.

The historical transformation chain for the smaller derivatives was not
preserved. The resize algorithm, software and version, export settings, and
creation dates are unknown. The record below therefore claims byte identity
only where hashes match, pixel identity only where image signatures match, and
does not infer an undocumented transformation.

The private 2000 by 2000 source-of-record file is
`product/logos/RefKit Logo NO BG.png`, with SHA-256
`b3ac03711bd86cf9e2a331f4e6eca8c669e3e8bd6d498532c1c01751d5eb5970`.
The private repository currently contains generation instructions in
`apps/website/scripts/optimize-assets.mjs` that name this file as their input.
Those instructions are not a retained historical run record. There is no
evidence tying the reviewed derivatives to an exact past Sharp or ImageMagick
version or invocation, so the current script must not be cited as proof of
their historical generation settings.

Before publication, private author and editor-account metadata was removed from
the five PNG release copies identified below. Their ImageMagick pixel signatures
matched before and after cleanup and match the reviewed private source copies.
The public SHA-256 values below are hashes of the cleaned release files and
intentionally differ from the private source files where metadata was removed.

| Public path | SHA-256 | Private source-of-record evidence | Verified relationship |
|-------------|---------|-----------------------------------|-----------------------|
| `apps/app/public/favicon-16x16.png` | `3925ebccc0cf358c4a7e49f36fc5b0edb8ca5a20f403d439455b63c8ae223297` | `product/favicons/favicon-16x16.png` | Pixel-identical after public metadata removal; earlier derivation settings unknown |
| `apps/app/public/favicon-32x32.png` | `03502cd3874b402d23355550b3275ab45c57afdeeeaa397767d3de1c1ca58a5d` | `product/favicons/favicon-32x32.png` | Pixel-identical after public metadata removal; earlier derivation settings unknown |
| `apps/app/public/logo-128.png` | `b57389ad07f5d0acec9ab536900ca3506c4c9878eb515b65b1be3741439ae277` | `apps/website/public/logo-128.png`, same SHA-256 | Byte-identical private marketing-site copy; earlier derivation settings unknown |
| `apps/app/public/refkit-logo.png` | `899b13a8d394325c3e30febad378095d96e407ec086991c73421c4ec2bad1718` | `product/logos/RefKit Logo NO BG.png` | Pixel-identical after public metadata removal to the private 2000 by 2000 source-of-record file |
| `apps/app/src/app/apple-icon.png` | `458c7d766a77c32977a2227042d3b9037c53e6279cfd7b52627218d99658c8e7` | `product/favicons/apple-touch-icon.png` | Pixel-identical after public metadata removal; earlier derivation settings unknown |
| `apps/app/src/app/favicon.ico` | `c9b114dc304c72ca59e29ca004769423a0a6ec7c94186e88c68a4004b27007c8` | `product/favicons/favicon.ico`, same SHA-256 | Byte-identical copy; earlier conversion settings unknown |
| `packages/mcp/assets/icon-32.png` | `5106e038fce397712965433eb4c4b61c290620a33cbf801157aca3e2e8125b19` | `product/favicons/favicon-32x32.png` and `apps/app/public/favicon-32x32.png` | Pixel-identical after public metadata removal; cleaned public encodings differ |

The owner declaration is the current creator and ownership evidence. No
contractor or third-party contribution to these files is known. The files are
retained under the brand treatment in `LICENSES.md`, `TRADEMARKS.md`, and the
MCP package's `BRAND_NOTICE.md`, not under the AGPL or MIT software grants. No
external attribution is currently known. On 2026-08-05, the asset owner and
legal reviewer approved the documented copyright, trademark, redistribution,
and modification treatment. The reviewer's identity is retained in the private
legal record.

The SHA-256 and pixel-signature comparisons above were repeated during the
internal publication review on 2026-08-05. They establish file or pixel identity
only as stated. They do not recover the unknown historical creation process.
The legal reviewer used this factual record when approving the treatment on the
same date. The reviewer's identity is retained in the private legal record.

## Final artifact dependency evidence

The final gate report must record a filesystem catalog or equivalent SBOM
inspection for each exact amd64 and arm64 OCI digest. For `sharp` and libvips,
record the inspection tool and version, the image digest, the searched package
and binary name patterns, the result, and the hash or location of the retained
evidence. A lockfile entry or build-stage dependency notice does not prove that
a dependency is present in the final runtime image. If `sharp`,
`@img/sharp-*`, `@img/sharp-libvips-*`, or a libvips binary is present, the
license and corresponding-source review remains open until its distribution
obligations are approved. Do not report absence until the exact final
multi-architecture artifacts have been inspected.

## Review record

On 2026-08-05, the copyright holder confirmed ownership of the RefKit source
selected for publication and no known contractor or other third-party source
contributions. A private-history author audit found no additional human author
identity. The copyright and asset owner, acting as legal reviewer, approved the
public license, contributor, trademark, asset, and notice treatment recorded by
this publication package. The identity is retained in the private legal record.

For every retained asset, record:

- exact path and content hash;
- creator or upstream source;
- copyright and trademark owner where known;
- license or written permission;
- attribution and notice requirements;
- whether modification and redistribution are allowed;
- reviewer and review date; and
- disposition: retain, replace, regenerate, or remove.

Copies of the same asset may share evidence only after their hashes or documented transformations are reconciled. A visual similarity assumption is not evidence.

The final clean export and every release build context must be rescanned after asset disposition.

Assets that remain only in the private repository are reviewed under their own deployment and vendor obligations, not as OSS publication inputs.

Future material changes to the public license, contributor, trademark, asset, or notice treatment require renewed legal review.
