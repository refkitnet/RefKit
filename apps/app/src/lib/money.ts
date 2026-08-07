import { z } from "zod";

export const POSTGRES_INTEGER_MIN = -2_147_483_648;
export const POSTGRES_INTEGER_MAX = 2_147_483_647;

export const minorUnitAmountSchema = z
  .number()
  .int()
  .min(POSTGRES_INTEGER_MIN)
  .max(POSTGRES_INTEGER_MAX);

export const positiveMinorUnitAmountSchema = minorUnitAmountSchema.positive();
export const nonNegativeMinorUnitAmountSchema = minorUnitAmountSchema.min(0);

export const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Currency must be a three-letter code.")
  .transform((value) => value.toLowerCase());

export function roundHalfUp(value: number) {
  return Math.round(value);
}

export function calculatePercentCommission(
  amountMinor: number,
  percentValue: number
) {
  return roundHalfUp((amountMinor * percentValue) / 100);
}

export function calculateFixedCommission(fixedAmountMinor: number) {
  return fixedAmountMinor;
}

export function convertAmount(
  amountMinor: number,
  exchangeRate: number
) {
  return roundHalfUp(amountMinor * exchangeRate);
}
