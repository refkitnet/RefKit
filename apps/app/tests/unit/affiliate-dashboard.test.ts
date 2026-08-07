import { describe, expect, it } from "vitest";
import { formatMoneyTotals } from "@/lib/affiliate-dashboard";

describe("formatMoneyTotals", () => {
  it.each([
    ["usd", "$0.00"],
    ["eur", "€0.00"],
    ["gbp", "£0.00"],
  ])("formats an empty %s total in the Program currency", (currency, label) => {
    expect(formatMoneyTotals(new Map(), currency)).toBe(label);
  });

  it("keeps a global empty multi-currency total neutral", () => {
    expect(formatMoneyTotals(new Map())).toBe("0");
  });

  it("formats populated multi-currency totals without a fallback", () => {
    expect(formatMoneyTotals(new Map([
      ["usd", 1250],
      ["eur", 500],
    ]))).toContain("$12.50");
    expect(formatMoneyTotals(new Map([
      ["usd", 1250],
      ["eur", 500],
    ]))).toContain("€5.00");
  });
});
