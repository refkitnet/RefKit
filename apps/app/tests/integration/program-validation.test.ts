import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { createProgram, updateProgram } from "@/services/programs";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("program create validation", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("rejects a destination URL that does not match the app website URL", async () => {
    await expect(
      createProgram(ctx.ownerUserId, {
        appId: ctx.appId,
        name: `Mismatch ${ctx.suffix}`,
        slug: `off-${ctx.suffix}`,
        currency: "usd",
        destinationUrl: "https://not-allowed.example.com",
        commissionRule: {
          rewardType: "percent",
          percentValue: 20,
          recurringDurationMonths: null,
        },
      })
    ).rejects.toMatchObject({
      code: "destination_url_mismatch",
    } satisfies Partial<AppError>);
  });

  it("rejects percent commission rules without percent_value", async () => {
    await expect(
      createProgram(ctx.ownerUserId, {
        appId: ctx.appId,
        name: `Missing percent ${ctx.suffix}`,
        slug: `missing-percent-${ctx.suffix}`,
        currency: "usd",
        destinationUrl: `${ctx.destinationUrl}`,
        commissionRule: {
          rewardType: "percent",
          recurringDurationMonths: null,
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_commission_rule",
    } satisfies Partial<AppError>);
  });

  it("rejects duplicate program slugs", async () => {
    await expect(
      createProgram(ctx.ownerUserId, {
        appId: ctx.appId,
        name: `Duplicate slug ${ctx.suffix}`,
        slug: `prg-${ctx.suffix}`,
        currency: "usd",
        destinationUrl: `${ctx.destinationUrl}`,
        commissionRule: {
          rewardType: "percent",
          percentValue: 20,
          recurringDurationMonths: null,
        },
      })
    ).rejects.toMatchObject({
      code: "program_slug_taken",
      message: "Program slug is already in use.",
    } satisfies Partial<AppError>);
  });

  it("rejects percent values above 100", async () => {
    await expect(
      createProgram(ctx.ownerUserId, {
        appId: ctx.appId,
        name: `High percent ${ctx.suffix}`,
        slug: `high-percent-${ctx.suffix}`,
        currency: "usd",
        destinationUrl: `${ctx.destinationUrl}`,
        commissionRule: {
          rewardType: "percent",
          percentValue: 150,
          recurringDurationMonths: null,
        },
      })
    ).rejects.toMatchObject({
      code: "invalid_commission_rule",
    } satisfies Partial<AppError>);
  });

  it("updates program settings fields", async () => {
    const updated = await updateProgram(ctx.ownerUserId, ctx.programId, {
      name: `Updated ${ctx.suffix}`,
      joinPageEnabled: false,
      joinPageApproval: "active",
      minimumPayoutAmount: 7500,
      supportedPayoutMethods: ["bank_transfer"],
    });

    expect(updated.name).toBe(`Updated ${ctx.suffix}`);
    expect(updated.joinPageEnabled).toBe(false);
    expect(updated.joinPageApproval).toBe("active");
    expect(updated.minimumPayoutAmount).toBe(7500);
    expect(updated.supportedPayoutMethods).toEqual(["bank_transfer"]);
  });
});
