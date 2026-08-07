import { describe, expect, it } from "vitest";
import { inferAppNameFromWebsite } from "@/lib/onboarding";

describe("onboarding", () => {
  it("infers a readable app name from a website", () => {
    expect(inferAppNameFromWebsite("https://www.acme-tools.com/pricing")).toBe(
      "Acme Tools",
    );
    expect(inferAppNameFromWebsite("lumina.tools")).toBe("Lumina");
  });

  it("does not infer names from localhost or IP literals", () => {
    expect(inferAppNameFromWebsite("localhost:3000")).toBe("");
    expect(inferAppNameFromWebsite("http://127.0.0.1:5180")).toBe("");
    expect(inferAppNameFromWebsite(".")).toBe("");
    expect(inferAppNameFromWebsite("")).toBe("");
  });
});
