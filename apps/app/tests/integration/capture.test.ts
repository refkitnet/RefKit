import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { POST as captureRoute } from "@/app/api/v1/capture/route";
import { getDb } from "@/db/client";
import { affiliateLinks, apiKeys, clicks } from "@/db/schema";
import { hashIp } from "@/lib/ip-hash";
import { createApiKey } from "@/services/api-keys";
import { captureAffiliateClick } from "@/services/clicks";
import { captureClick as sdkCaptureClick } from "../../../../packages/sdk/src/server";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

type CaptureBody = {
  via: string;
  page?: string;
  referrer?: string;
  refkit_app?: string;
  visitor_ip?: unknown;
  visitor_user_agent?: unknown;
};

async function postCapture(
  body: CaptureBody,
  headers: Record<string, string> = {}
) {
  return captureRoute(
    new Request("http://refkit.test/v1/capture", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    })
  );
}

async function getClick(clickId: string) {
  const db = getDb();
  const [click] = await db
    .select()
    .from(clicks)
    .where(eq(clicks.id, clickId))
    .limit(1);

  return click;
}

function trackRateLimit(ctx: TestContext, ip: string) {
  ctx.rateLimitScopes.push(
    `click_capture:${hashIp(ip)}:${ctx.appId}`
  );
}

describe("affiliate click capture", () => {
  let ctx: TestContext;
  let otherCtx: TestContext;
  let linkCode: string;
  let orgWideKeyId: string | null = null;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    otherCtx = await seedAttributionGraph({ includeAttribution: false });
    const db = getDb();
    const [link] = await db
      .select({ linkCode: affiliateLinks.linkCode })
      .from(affiliateLinks)
      .where(eq(affiliateLinks.id, ctx.linkId))
      .limit(1);

    linkCode = link?.linkCode ?? ctx.linkCode;
  });

  afterAll(async () => {
    if (orgWideKeyId) {
      await getDb().delete(apiKeys).where(eq(apiKeys.id, orgWideKeyId));
    }

    await cleanupTestContext(otherCtx);
    await cleanupTestContext(ctx);
  });

  it("records a click from a first-party via slug", async () => {
    trackRateLimit(ctx, "203.0.113.10");
    const result = await captureAffiliateClick({
      via: linkCode,
      page: `${ctx.destinationUrl}?via=${linkCode}`,
      referrer: "https://newsletter.example",
      ip: "203.0.113.10",
      userAgent: "vitest-capture",
    });

    expect(result.clickId).toMatch(/^clk_/);

    const db = getDb();
    const [click] = await db
      .select()
      .from(clicks)
      .where(eq(clicks.id, result.clickId!))
      .limit(1);

    expect(click?.programAffiliateId).toBe(ctx.programAffiliateId);
    expect(click?.programId).toBe(ctx.programId);
    expect(click?.pageUrl).toContain(`via=${linkCode}`);
    expect(click?.referrer).toBe("https://newsletter.example");
  });

  it("keeps public browser capture working and ignores body visitor metadata", async () => {
    const requestIp = "198.51.100.10";
    const bodyIp = "203.0.113.11";
    const requestUserAgent = "Public browser";
    trackRateLimit(ctx, requestIp);

    const response = await postCapture(
      {
        via: linkCode,
        page: `${ctx.destinationUrl}`,
        visitor_ip: bodyIp,
        visitor_user_agent: "Spoofed browser",
      },
      {
        "user-agent": requestUserAgent,
        "x-forwarded-for": requestIp,
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);

    expect(click?.ipHash).toBe(hashIp(requestIp));
    expect(click?.ipHash).not.toBe(hashIp(bodyIp));
    expect(click?.userAgent).toBe(requestUserAgent);
  });

  it("stores authenticated forwarded metadata through the server SDK", async () => {
    const visitorIp = "203.0.113.20";
    const visitorUserAgent = "Visitor browser through merchant backend";
    const originalFetch = globalThis.fetch;
    trackRateLimit(ctx, visitorIp);

    globalThis.fetch = (async (input, init) => {
      const request =
        input instanceof Request && !init
          ? input
          : new Request(input, init);

      return captureRoute(request);
    }) as typeof fetch;

    try {
      const result = await sdkCaptureClick({
        apiKey: ctx.apiKey,
        baseUrl: "http://refkit.test",
        via: linkCode,
        page: `${ctx.destinationUrl}/pricing`,
        referrer: "https://search.example",
        visitorIp,
        visitorUserAgent,
      });
      const click = await getClick(result.click_id!);

      expect(click?.ipHash).toBe(hashIp(visitorIp));
      expect(click?.userAgent).toBe(visitorUserAgent);
      expect(click?.pageUrl).toBe(
        `${ctx.destinationUrl}/pricing`
      );
      expect(click?.referrer).toBe("https://search.example");
    }
    finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to request metadata for authenticated capture", async () => {
    const requestIp = "198.51.100.30";
    const requestUserAgent = "Merchant capture client";
    trackRateLimit(ctx, requestIp);

    const response = await postCapture(
      {
        via: linkCode,
      },
      {
        authorization: `Bearer ${ctx.apiKey}`,
        "user-agent": requestUserAgent,
        "x-forwarded-for": requestIp,
      }
    );

    expect(response.status).toBe(200);

    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);

    expect(click?.ipHash).toBe(hashIp(requestIp));
    expect(click?.userAgent).toBe(requestUserAgent);
  });

  it("validates forwarded visitor metadata", async () => {
    const response = await postCapture(
      {
        via: linkCode,
        visitor_ip: "not-an-ip",
      },
      {
        authorization: `Bearer ${ctx.apiKey}`,
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "invalid_request_body",
      },
    });
  });

  it("blocks an app key from capturing for another app", async () => {
    const visitorIp = "203.0.113.40";
    const db = getDb();
    const before = await db
      .select({ id: clicks.id })
      .from(clicks)
      .where(eq(clicks.programId, otherCtx.programId));
    trackRateLimit(otherCtx, visitorIp);

    const response = await postCapture(
      {
        via: otherCtx.linkCode,
        visitor_ip: visitorIp,
      },
      {
        authorization: `Bearer ${ctx.apiKey}`,
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "affiliate_link_not_found",
      },
    });

    const after = await db
      .select({ id: clicks.id })
      .from(clicks)
      .where(eq(clicks.programId, otherCtx.programId));

    expect(after).toHaveLength(before.length);
  });

  it("rejects organization-wide keys for server capture", async () => {
    const key = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      name: "Organization-wide capture key",
    });
    orgWideKeyId = key.id;

    const response = await postCapture(
      {
        via: linkCode,
      },
      {
        authorization: `Bearer ${key.key}`,
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "app_scope_required",
      },
    });
  });

  it("resolves public browser capture from the landing-page origin", async () => {
    const requestIp = "198.51.100.40";
    trackRateLimit(ctx, requestIp);

    const response = await postCapture(
      {
        via: linkCode,
        page: `${ctx.destinationUrl}/pricing?via=${linkCode}`,
      },
      {
        "x-forwarded-for": requestIp,
      }
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);
    expect(click?.programId).toBe(ctx.programId);
  });

  it("resolves Test browser links with the refkit_app hint", async () => {
    const requestIp = "198.51.100.50";
    trackRateLimit(ctx, requestIp);

    const response = await postCapture(
      {
        via: linkCode,
        page: `http://localhost:5173/?via=${linkCode}&refkit_app=${ctx.appId}`,
        refkit_app: ctx.appId,
      },
      {
        "x-forwarded-for": requestIp,
      }
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);
    expect(click?.programId).toBe(ctx.programId);
  });

  it("resolves authenticated capture with the API key app even when page origin differs", async () => {
    const visitorIp = "203.0.113.60";
    trackRateLimit(ctx, visitorIp);

    const response = await postCapture(
      {
        via: linkCode,
        page: "http://localhost:5173/test",
        visitor_ip: visitorIp,
      },
      {
        authorization: `Bearer ${ctx.apiKey}`,
      }
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);
    expect(click?.programId).toBe(ctx.programId);
  });

  it("shares one capture quota across changing invalid via values", async () => {
    const visitorIp = "192.0.2.250";
    trackRateLimit(ctx, visitorIp);

    for (let attempt = 0; attempt < 60; attempt++) {
      await expect(
        captureAffiliateClick({
          appId: ctx.appId,
          via: `missing-${attempt}`,
          ip: visitorIp,
          userAgent: "vitest-rate-limit",
        })
      ).rejects.toMatchObject({ code: "affiliate_link_not_found" });
    }

    await expect(
      captureAffiliateClick({
        appId: ctx.appId,
        via: "missing-over-limit",
        ip: visitorIp,
        userAgent: "vitest-rate-limit",
      })
    ).rejects.toMatchObject({ code: "rate_limit_exceeded" });
  });

  it("does not resolve a shared via code for another app origin", async () => {
    const db = getDb();
    await db
      .update(affiliateLinks)
      .set({ linkCode: "sharedvia" })
      .where(eq(affiliateLinks.id, ctx.linkId));
    await db
      .update(affiliateLinks)
      .set({ linkCode: "sharedvia" })
      .where(eq(affiliateLinks.id, otherCtx.linkId));
    linkCode = "sharedvia";
    otherCtx.linkCode = "sharedvia";

    const requestIp = "198.51.100.70";
    trackRateLimit(otherCtx, requestIp);

    const response = await postCapture(
      {
        via: "sharedvia",
        page: `${otherCtx.destinationUrl}?via=sharedvia`,
      },
      {
        "x-forwarded-for": requestIp,
      }
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as { click_id: string };
    const click = await getClick(result.click_id);
    expect(click?.programId).toBe(otherCtx.programId);
    expect(click?.programId).not.toBe(ctx.programId);
  });
});
