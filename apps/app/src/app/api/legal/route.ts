import { getBuildIdentity } from "@/lib/runtime-metadata";

const legalDocuments = [
  "LICENSE",
  "LICENSES.md",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "TRADEMARKS.md",
] as const;

export async function GET() {
  const build = getBuildIdentity();
  const sourceRoot = build.source_url.replace(/\/$/, "");

  return Response.json({
    application: "RefKit",
    license: build.license,
    version: build.version,
    revision: build.revision,
    corresponding_source_url: build.source_url,
    documents: [
      ...legalDocuments.map((name) => ({
        name,
        url: `${sourceRoot}/${name}`,
      })),
      {
        name: "Distributed third-party notices",
        url: "/third-party-notices.txt",
      },
    ],
  });
}
