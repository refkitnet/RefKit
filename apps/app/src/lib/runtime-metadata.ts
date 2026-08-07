import { readFile } from "node:fs/promises";
import { z } from "zod";

const runtimeMetadataSchema = z.object({
  version: z.string().min(1),
  revision: z.string().min(1),
  source_url: z.string().url(),
  schema_migration: z.object({
    tag: z.string().min(1),
    when: z.union([z.string().min(1), z.number().int().nonnegative()]),
    hash: z.string().min(1),
  }),
});

export type RuntimeMetadata = z.infer<typeof runtimeMetadataSchema>;

function getVercelSourceUrl(
  environment: NodeJS.ProcessEnv,
  revision: string | undefined
) {
  const owner = environment.VERCEL_GIT_REPO_OWNER?.trim();
  const repository = environment.VERCEL_GIT_REPO_SLUG?.trim();

  if (!owner || !repository || !revision) {
    return undefined;
  }

  return `https://github.com/${owner}/${repository}/tree/${revision}`;
}

export function getBuildIdentity(
  environment: NodeJS.ProcessEnv = process.env
) {
  const hostedRevision = environment.VERCEL_GIT_COMMIT_SHA?.trim()
    || environment.GITHUB_SHA?.trim();
  const revision = environment.REFKIT_SOURCE_REVISION?.trim()
    || hostedRevision;
  const sourceUrl = environment.REFKIT_SOURCE_URL?.trim()
    || getVercelSourceUrl(environment, revision);

  if (environment.NODE_ENV === "production" && (!revision || !sourceUrl)) {
    throw new Error(
      "Production builds require an exact source revision and browsable source URL."
    );
  }

  return {
    version: environment.REFKIT_BUILD_VERSION?.trim()
      || (hostedRevision ? `git-${hostedRevision.slice(0, 12)}` : "development"),
    revision: revision || "unknown",
    source_url: sourceUrl || "https://github.com/refkitnet/RefKit",
    license: "AGPL-3.0-only",
    legal_url: "/legal",
  };
}

export async function readRuntimeMetadata(path: string) {
  const content = await readFile(path, "utf8");
  return runtimeMetadataSchema.parse(JSON.parse(content));
}
