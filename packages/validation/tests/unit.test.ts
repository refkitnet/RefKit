import { describe, expect, it } from "vitest";
import {
  assertCommissionRule,
  normalizeLandingPageUrl,
  normalizeWebsiteUrl,
  parseFixedAmount,
  parsePercentValue,
  parseRecurringDurationMonths,
  parseRewardType,
  validateLandingPageUrl,
  validateWebsiteUrl,
} from "../src/index.js";

describe("normalizeWebsiteUrl", () => {
  it("adds https when missing", () => {
    expect(normalizeWebsiteUrl("yourapp.com/signup")).toBe(
      "https://yourapp.com/signup"
    );
  });

  it("keeps an existing protocol", () => {
    expect(normalizeWebsiteUrl("https://yourapp.com/signup")).toBe(
      "https://yourapp.com/signup"
    );
  });

  it("accepts localhost and defaults it to http", () => {
    expect(normalizeWebsiteUrl("localhost:3000")).toBe(
      "http://localhost:3000/"
    );
    expect(normalizeWebsiteUrl("shop.localhost:5173/signup")).toBe(
      "http://shop.localhost:5173/signup"
    );
    expect(normalizeWebsiteUrl("127.0.0.1:4173")).toBe(
      "http://127.0.0.1:4173/"
    );
  });

  it("rejects invalid values", () => {
    expect(() => normalizeWebsiteUrl("")).toThrow(/website URL/);
    expect(() => normalizeWebsiteUrl("not a url")).toThrow(
      /valid website URL/
    );
  });

  it("keeps the landing page alias", () => {
    expect(normalizeLandingPageUrl("yourapp.com")).toBe("https://yourapp.com/");
  });
});

describe("validateWebsiteUrl", () => {
  it("returns undefined for valid input", () => {
    expect(validateWebsiteUrl("https://yourapp.com/signup")).toBeUndefined();
    expect(validateLandingPageUrl("https://yourapp.com/signup")).toBeUndefined();
  });

  it("returns an error for invalid input", () => {
    expect(validateWebsiteUrl("")).toBe("Required.");
    expect(validateWebsiteUrl("bad")).toMatch(/valid website URL/);
  });
});

describe("commission parsers", () => {
  it("parses percent values", () => {
    expect(parsePercentValue("20")).toBe(20);
    expect(() => parsePercentValue("abc")).toThrow(/between 1 and 100/);
    expect(() => parsePercentValue("150")).toThrow(/between 1 and 100/);
  });

  it("parses fixed amounts", () => {
    expect(parseFixedAmount("1000")).toBe(1000);
    expect(() => parseFixedAmount("0")).toThrow(/positive whole number/);
  });

  it("parses reward types", () => {
    expect(parseRewardType("percent")).toBe("percent");
    expect(() => parseRewardType("crypto")).toThrow(/percent or fixed/);
  });

  it("parses recurring duration months", () => {
    expect(parseRecurringDurationMonths("lifetime")).toBeNull();
    expect(parseRecurringDurationMonths("null")).toBeNull();
    expect(parseRecurringDurationMonths("")).toBeNull();
    expect(parseRecurringDurationMonths(undefined)).toBeUndefined();
    expect(parseRecurringDurationMonths("12")).toBe(12);
    expect(() => parseRecurringDurationMonths("0")).toThrow(
      /positive integer or lifetime/
    );
    expect(() => parseRecurringDurationMonths("abc")).toThrow(
      /positive integer or lifetime/
    );
  });

  it("asserts commission rules", () => {
    expect(() =>
      assertCommissionRule({
        rewardType: "percent",
        percentValue: 20,
        recurringDurationMonths: null,
      })
    ).not.toThrow();

    expect(() =>
      assertCommissionRule({
        rewardType: "percent",
        recurringDurationMonths: null,
      })
    ).toThrow(/percent-value/);
  });
});
