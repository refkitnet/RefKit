import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("client module boundaries", () => {
  it("keeps closed-beta client constants free of server and seed imports", () => {
    const source = readFileSync(
      path.resolve(process.cwd(), "src/lib/closed-beta.ts"),
      "utf8"
    );

    expect(source).not.toContain("@/db/");
    expect(source).not.toContain("@/services/");
    expect(source).not.toContain("@/lib/errors");
    expect(source).not.toContain("SEED_USERS");
  });
});
