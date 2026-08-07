import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getConfigPath } from "../src/config.js";
import { mergeEnvExample } from "../src/lib/env-example.js";
import { detectFramework } from "../src/lib/framework.js";
import { detectPackageManager } from "../src/lib/package-manager.js";
import { formatTable } from "../src/lib/table.js";
import {
  buildInitSummary,
  formatStripeInitMessage,
} from "../src/lib/init-summary.js";

describe("detectPackageManager", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("detects npm from package-lock.json", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    writeFileSync(join(tempDir, "package-lock.json"), "{}");
    expect(detectPackageManager(tempDir)).toBe("npm");
  });

  it("detects pnpm from pnpm-lock.yaml", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    writeFileSync(join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    expect(detectPackageManager(tempDir)).toBe("pnpm");
  });

  it("defaults to npm", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    expect(detectPackageManager(tempDir)).toBe("npm");
  });
});

describe("detectFramework", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("detects next.js", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    writeFileSync(
      join(tempDir, "package.json"),
      JSON.stringify({ dependencies: { next: "16.0.0" } })
    );
    expect(detectFramework(tempDir)).toBe("next");
  });
});

describe("mergeEnvExample", () => {
  let tempDir = "";

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("appends REFKIT_API_KEY placeholder", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    const path = mergeEnvExample(tempDir);
    const content = readFileSync(path, "utf8");
    expect(content).toContain("REFKIT_API_KEY=");
    expect(content).not.toContain("rk_app_");
  });

  it("does not duplicate REFKIT_API_KEY", () => {
    tempDir = mkdtempSync(join(tmpdir(), "refkit-cli-"));
    writeFileSync(join(tempDir, ".env.example"), "REFKIT_API_KEY=\n");
    mergeEnvExample(tempDir);
    const content = readFileSync(join(tempDir, ".env.example"), "utf8");
    expect(content.match(/REFKIT_API_KEY/g)?.length).toBe(1);
  });
});

describe("formatTable", () => {
  it("pads every column to the widest cell", () => {
    const table = formatTable(
      ["ID", "NAME"],
      [
        ["app_1", "A"],
        ["app_very_long", "Beta"],
      ]
    );

    expect(table.split("\n")).toEqual([
      "ID             NAME",
      "-------------  ----",
      "app_1          A   ",
      "app_very_long  Beta",
    ]);
  });
});

describe("getConfigPath", () => {
  it("resolves under the home directory", () => {
    const path = getConfigPath();
    expect(path.endsWith(".refkitnet\\config.json") || path.endsWith(".refkitnet/config.json")).toBe(true);
  });
});

describe("formatStripeInitMessage", () => {
  it("simplifies sandbox messaging", () => {
    expect(
      formatStripeInitMessage(
        "Platform Stripe is not configured. A local sandbox connection was created for fixture testing."
      )
    ).toMatch(/not connected yet/i);
  });
});

describe("buildInitSummary", () => {
  it("includes summary and next steps", () => {
    const content = buildInitSummary({
      app: { id: "app_1", name: "Coco Loco" },
      program: { id: "prg_1", name: "VIP", slug: "vip" },
      apiKey: "rk_app_test",
      envExamplePath: ".env.example",
      framework: "next",
      stripeReady: false,
      stripePending: false,
      revenueSource: "stripe",
      apiUrl: "http://localhost:3000",
    });

    expect(content.summary).toContain("Coco Loco");
    expect(content.summary).toContain("rk_app_test");
    expect(content.nextSteps).toContain("REFKIT_API_KEY");
    expect(content.nextSteps).toContain("refkitnet status --app-id app_1");
    expect(content.nextSteps).toContain("Capture affiliate landing requests on the server");
    expect(content.nextSteps).toContain("Self-Hosted instance operator");
    expect(content.nextSteps).not.toContain("refkit.gitbook.io");
    expect(content.nextSteps).not.toContain("RefKit.capture()");
  });

  it("uses API revenue instructions for API apps", () => {
    const content = buildInitSummary({
      app: { id: "app_1", name: "Coco Loco" },
      program: { id: "prg_1", name: "VIP", slug: "vip" },
      apiKey: "rk_app_test",
      envExamplePath: ".env.example",
      framework: "next",
      stripeReady: false,
      stripePending: false,
      revenueSource: "api",
      apiUrl: "http://localhost:3000",
    });

    expect(content.summary).toContain("report payments with the REST API or server SDK");
    expect(content.nextSteps).toContain("Report a test payment");
    expect(content.nextSteps).not.toContain("Connect Stripe");
  });

  it("uses live credentials and production steps in live mode", () => {
    const content = buildInitSummary({
      app: { id: "app_1", name: "Coco Loco" },
      program: { id: "prg_1", name: "VIP", slug: "vip" },
      apiKey: "rk_app_live",
      envExamplePath: ".env.example",
      framework: "next",
      stripeReady: true,
      stripePending: false,
      revenueSource: "stripe",
      apiUrl: "https://app.refkit.net",
      mode: "production",
    });

    expect(content.summary).toContain("Live API key: rk_app_live");
    expect(content.nextSteps).toContain("production environment");
    expect(content.nextSteps).toContain("Confirm live Stripe");
    expect(content.nextSteps).not.toContain("test-mode payment");
    expect(content.nextSteps).toContain("/integrate-refkit/manual-setup");
  });
});

