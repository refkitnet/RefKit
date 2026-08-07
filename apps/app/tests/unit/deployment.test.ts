import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDeploymentCapability,
  getDeploymentCapabilities,
  getDeploymentEdition,
  isSelfHosted,
} from "@/lib/deployment";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("deployment edition", () => {
  it("preserves Cloud as the existing default", () => {
    vi.stubEnv("REFKIT_EDITION", "");

    expect(getDeploymentEdition()).toBe("cloud");
    expect(isSelfHosted()).toBe(false);
    expect(getDeploymentCapabilities()).toMatchObject({
      managed_connections: true,
      managed_stripe: true,
      official_network: true,
      refkit_support: true,
      filesystem_uploads: false,
    });
  });

  it("removes RefKit-operated capabilities from Self-Hosted", () => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");

    expect(isSelfHosted()).toBe(true);
    expect(getDeploymentCapabilities()).toEqual({
      cloud_billing: false,
      filesystem_uploads: true,
      managed_connections: false,
      managed_stripe: false,
      official_network: false,
      refkit_support: false,
    });
    expect(() => assertDeploymentCapability("managed_stripe")).toThrowError(
      expect.objectContaining({ code: "capability_unavailable", status: 404 })
    );
  });

  it("rejects an unknown edition", () => {
    vi.stubEnv("REFKIT_EDITION", "enterprise");
    expect(() => getDeploymentEdition()).toThrow(
      "REFKIT_EDITION must be either cloud or self-hosted."
    );
  });

  it.each(["setup", "sign-in", "sign-up"])(
    "renders the %s page from the runtime edition",
    (route) => {
      const source = readFileSync(
        fileURLToPath(
          new URL(`../../src/app/${route}/page.tsx`, import.meta.url)
        ),
        "utf8"
      );

      expect(source).toContain('export const dynamic = "force-dynamic";');
    }
  );
});
