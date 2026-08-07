import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listPrograms } from "@/services/programs";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("scoped cursor pagination", () => {
  let ctx: TestContext;
  let otherCtx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    otherCtx = await seedAttributionGraph();
  });

  afterAll(async () => {
    await cleanupTestContext(otherCtx);
    await cleanupTestContext(ctx);
  });

  it("rejects a cursor outside the requested App", async () => {
    await expect(
      listPrograms(ctx.ownerUserId, ctx.appId, {
        limit: 25,
        startingAfter: otherCtx.programId,
      })
    ).rejects.toMatchObject({ code: "invalid_starting_after" });
  });
});
