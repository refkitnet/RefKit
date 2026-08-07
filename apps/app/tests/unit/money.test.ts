import { describe, expect, it } from "vitest";
import {
  calculatePercentCommission,
  convertAmount,
  currencyCodeSchema,
  minorUnitAmountSchema,
  nonNegativeMinorUnitAmountSchema,
  positiveMinorUnitAmountSchema,
  POSTGRES_INTEGER_MAX,
  POSTGRES_INTEGER_MIN,
  roundHalfUp,
} from "@/lib/money";

describe("money", () => {
  describe("roundHalfUp", () => {
    it("rounds .5 up for positive values", () => {
      expect(roundHalfUp(2.5)).toBe(3);
      expect(roundHalfUp(3.5)).toBe(4);
      expect(roundHalfUp(0.5)).toBe(1);
    });

    it("rounds non-.5 values to nearest integer", () => {
      expect(roundHalfUp(2.4)).toBe(2);
      expect(roundHalfUp(2.6)).toBe(3);
      expect(roundHalfUp(124.875)).toBe(125);
    });
  });

  describe("calculatePercentCommission", () => {
    it("computes 20% of 5000 as 1000", () => {
      expect(calculatePercentCommission(5000, 20)).toBe(1000);
    });

    it("rounds percent commission half up", () => {
      expect(calculatePercentCommission(999, 12.5)).toBe(125);
    });
  });

  describe("convertAmount", () => {
    it("applies exchange rate with half-up rounding", () => {
      expect(convertAmount(1000, 0.92)).toBe(920);
      expect(convertAmount(999, 1.087)).toBe(1086);
    });
  });

  describe("minor-unit validation", () => {
    it("accepts PostgreSQL integer boundaries", () => {
      expect(minorUnitAmountSchema.parse(POSTGRES_INTEGER_MIN)).toBe(
        POSTGRES_INTEGER_MIN
      );
      expect(minorUnitAmountSchema.parse(POSTGRES_INTEGER_MAX)).toBe(
        POSTGRES_INTEGER_MAX
      );
    });

    it("rejects overflow and non-integer values", () => {
      expect(() => minorUnitAmountSchema.parse(POSTGRES_INTEGER_MIN - 1)).toThrow();
      expect(() => minorUnitAmountSchema.parse(POSTGRES_INTEGER_MAX + 1)).toThrow();
      expect(() => minorUnitAmountSchema.parse(1.5)).toThrow();
    });

    it("enforces positive and non-negative variants", () => {
      expect(positiveMinorUnitAmountSchema.parse(1)).toBe(1);
      expect(() => positiveMinorUnitAmountSchema.parse(0)).toThrow();
      expect(nonNegativeMinorUnitAmountSchema.parse(0)).toBe(0);
      expect(() => nonNegativeMinorUnitAmountSchema.parse(-1)).toThrow();
    });
  });

  describe("currency validation", () => {
    it("normalizes alphabetic three-letter codes", () => {
      expect(currencyCodeSchema.parse(" USD ")).toBe("usd");
      expect(currencyCodeSchema.parse("eur")).toBe("eur");
    });

    it("rejects malformed codes", () => {
      for (const value of ["US", "USDD", "12!", "u$d"]) {
        expect(() => currencyCodeSchema.parse(value)).toThrow();
      }
    });
  });
});
