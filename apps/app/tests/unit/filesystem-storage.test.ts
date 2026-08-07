import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let temporaryDirectory: string | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();

  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = null;
  }
});

describe("Self-Hosted filesystem storage", () => {
  it("writes an uploaded image only under the configured persistent directory", async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "refkit-uploads-"));
    vi.stubEnv("REFKIT_EDITION", "self-hosted");
    vi.stubEnv("UPLOADS_DIR", temporaryDirectory);
    vi.stubEnv("APP_URL", "https://refkit.example.com");
    vi.resetModules();

    const storage = await import("@/lib/logo-storage");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const url = await storage.putLocalLogo("app_test", "png", bytes);
    const filename = new URL(url).pathname.split("/").at(-1)!;
    const filePath = storage.resolveLocalLogoFilePath("app_test", filename);

    expect(storage.usesLocalLogoStorage()).toBe(true);
    expect(url).toMatch(
      /^https:\/\/refkit\.example\.com\/api\/dev\/app-logos\/app_test\//
    );
    expect(filePath).not.toBeNull();
    expect(filePath!.startsWith(temporaryDirectory)).toBe(true);
    await expect(readFile(filePath!)).resolves.toEqual(Buffer.from(bytes));
  });
});
