import { describe, expect, it } from "vitest";
import { generateId, ID_PREFIXES } from "@/lib/ids";

describe("ids", () => {
  it("generates ids with the correct prefix", () => {
    const id = generateId(ID_PREFIXES.program);
    expect(id.startsWith(`${ID_PREFIXES.program}_`)).toBe(true);
    expect(id.length).toBeGreaterThan(ID_PREFIXES.program.length + 1);
  });

  it("generates unique ids", () => {
    const ids = new Set<string>();

    for (let i = 0; i < 100; i++) {
      ids.add(generateId(ID_PREFIXES.click));
    }

    expect(ids.size).toBe(100);
  });
});
