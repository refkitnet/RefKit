import { formatMoney } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";

export type CommissionTermsData = {
  reward_type: "percent" | "fixed" | string;
  percent_value: number | null;
  fixed_amount: number | null;
  fixed_currency: string | null;
  recurring_duration_months: number | null;
};

export function commissionRewardLabel(
  rule: CommissionTermsData,
  fallbackCurrency = "usd"
) {
  if (rule.reward_type === "percent") {
    return `${rule.percent_value ?? 0}% commission`;
  }

  return `${formatMoney(
    rule.fixed_amount ?? 0,
    rule.fixed_currency ?? fallbackCurrency
  )} per payment`;
}

export function commissionDurationLabel(rule: CommissionTermsData) {
  const months = rule.recurring_duration_months;
  return months ? `For ${months} months` : "Lifetime commission";
}

export function CommissionTermsSummary({
  rule,
  fallbackCurrency,
  className,
}: {
  rule: CommissionTermsData;
  fallbackCurrency?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-muted/30 p-4 text-sm",
        className
      )}
    >
      <p className="font-medium">
        {commissionRewardLabel(rule, fallbackCurrency)}
      </p>
      <p className="text-muted-foreground">{commissionDurationLabel(rule)}</p>
    </div>
  );
}
