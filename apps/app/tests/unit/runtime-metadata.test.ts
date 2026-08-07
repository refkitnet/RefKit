import { describe, expect, it } from "vitest";
import { getBuildIdentity } from "@/lib/runtime-metadata";

describe("runtime source identity", () => {
  it("derives an exact source link from trusted Vercel Git metadata", () => {
    const revision = "a".repeat(40);

    expect(getBuildIdentity({
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: revision,
      VERCEL_GIT_REPO_OWNER: "example",
      VERCEL_GIT_REPO_SLUG: "refkit-fork",
    })).toMatchObject({
      revision,
      source_url: `https://github.com/example/refkit-fork/tree/${revision}`,
      license: "AGPL-3.0-only",
      legal_url: "/legal",
    });
  });

  it("rejects an untraceable production build", () => {
    expect(() => getBuildIdentity({ NODE_ENV: "production" })).toThrow(
      "Production builds require an exact source revision"
    );
  });
});
