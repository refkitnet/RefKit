export const REVENUE_SOURCES = ["stripe", "api"] as const;

export type RevenueSource = (typeof REVENUE_SOURCES)[number];

export function isRevenueSource(value: string): value is RevenueSource {
  return REVENUE_SOURCES.includes(value as RevenueSource);
}
