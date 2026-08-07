export type RewardType = "percent" | "fixed";

export function parsePercentValue(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const percent = Number(value);

  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new Error("percent-value must be a number between 1 and 100.");
  }

  return percent;
}

export function parseFixedAmount(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("fixed-amount must be a positive whole number of cents.");
  }

  return amount;
}

export function parseRewardType(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "percent" && value !== "fixed") {
    throw new Error("reward-type must be percent or fixed.");
  }

  return value;
}

export function parseRecurringDurationMonths(
  value: string | undefined
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();

  if (trimmed === "" || trimmed === "lifetime" || trimmed === "null") {
    return null;
  }

  const months = Number(trimmed);

  if (!Number.isInteger(months) || months <= 0) {
    throw new Error(
      "recurring-duration-months must be a positive integer or lifetime."
    );
  }

  return months;
}

export function assertCommissionRule(input: {
  rewardType: RewardType;
  percentValue?: number;
  fixedAmount?: number;
  recurringDurationMonths?: number | null;
}) {
  if (input.rewardType === "percent") {
    if (
      input.percentValue === undefined ||
      !Number.isFinite(input.percentValue) ||
      input.percentValue <= 0 ||
      input.percentValue > 100
    ) {
      throw new Error("percent-value must be a number between 1 and 100.");
    }
  }
  else if (
    input.fixedAmount === undefined ||
    !Number.isInteger(input.fixedAmount) ||
    input.fixedAmount <= 0
  ) {
    throw new Error("fixed-amount must be a positive whole number of cents.");
  }

  if (
    input.recurringDurationMonths !== undefined &&
    input.recurringDurationMonths !== null &&
    (!Number.isInteger(input.recurringDurationMonths) ||
      input.recurringDurationMonths <= 0)
  ) {
    throw new Error(
      "recurring-duration-months must be a positive integer or lifetime."
    );
  }
}
