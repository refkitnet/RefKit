import type { ProgramOption } from "@/components/dashboard/program-filter";
import { formatMoney, type MeProfile } from "@/lib/dashboard-types";

export type AffiliateCommission = {
  id: string;
  program_id: string;
  status: string;
  kind: string;
  amount: { amount: number; currency: string };
  created_at: string;
};

export type MoneyByCurrency = Map<string, number>;

export function affiliateProgramOptions(me: MeProfile): ProgramOption[] {
  return me.program_affiliates.map((entry) => ({
    id: entry.program.id,
    name: entry.program.name,
    slug: entry.program.slug,
  }));
}

export function filterByProgram<T extends { program_id: string }>(
  entries: T[],
  programId: string
) {
  if (!programId) {
    return entries;
  }

  return entries.filter((entry) => entry.program_id === programId);
}

export function sumMoneyAmounts(rows: Array<{ amount: number; currency: string }>) {
  const totals = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.amount);
  }

  return totals;
}

export function formatMoneyTotals(
  totals: MoneyByCurrency,
  fallbackCurrency?: string
) {
  if (totals.size === 0) {
    return fallbackCurrency ? formatMoney(0, fallbackCurrency) : "0";
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");
}

export function sumCommissionsByStatus(
  commissions: AffiliateCommission[],
  statuses: string[]
) {
  return sumMoneyAmounts(
    commissions
      .filter((entry) => statuses.includes(entry.status))
      .map((entry) => entry.amount)
  );
}

export function countActivePrograms(me: MeProfile) {
  let count = 0;

  for (let i = 0; i < me.program_affiliates.length; i++) {
    if (me.program_affiliates[i].program_affiliate.status === "active") {
      count += 1;
    }
  }

  return count;
}

export function formatCommissionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
