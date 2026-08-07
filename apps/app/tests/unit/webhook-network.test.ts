import { lookup } from "node:dns/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetServerEnvCache } from "@/lib/env";
import {
  createPinnedLookup,
  isPrivateNetworkAddress,
  resolveWebhookTarget,
} from "@/services/webhooks";

describe("webhook network boundary", () => {
  beforeEach(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS = "false";
    resetServerEnvCache();
  });

  afterEach(() => {
    delete process.env.WEBHOOK_ALLOW_PRIVATE_NETWORKS;
    resetServerEnvCache();
  });

  it("blocks private and reserved IPv4 ranges", () => {
    for (const address of [
      "10.0.0.1",
      "127.0.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
    ]) {
      expect(isPrivateNetworkAddress(address)).toBe(true);
    }

    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);
  });

  it.each([
    "https://[::ffff:127.0.0.1]/refkit",
    "https://[::7f00:1]/refkit",
  ])("blocks canonical IPv6 forms containing private IPv4: %s", async (url) => {
    await expect(resolveWebhookTarget(url)).rejects.toMatchObject({
      code: "private_webhook_url_blocked",
    });
  });

  it("pins the single validated DNS answer used by the connector", async () => {
    const resolver = vi
      .fn()
      .mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const target = await resolveWebhookTarget(
      "https://webhooks.example.com/refkit",
      resolver as unknown as typeof lookup
    );

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(target).toMatchObject({ address: "8.8.8.8", family: 4 });

    const callback = vi.fn();
    createPinnedLookup(target.address!, target.family!)(
      "webhooks.example.com",
      { all: false },
      callback
    );
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("rejects a DNS response containing any private address", async () => {
    const resolver = vi.fn().mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);

    await expect(
      resolveWebhookTarget(
        "https://webhooks.example.com/refkit",
        resolver as unknown as typeof lookup
      )
    ).rejects.toMatchObject({ code: "private_webhook_url_blocked" });
  });
});
