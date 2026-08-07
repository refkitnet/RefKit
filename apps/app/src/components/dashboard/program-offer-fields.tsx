"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { assertCommissionRule } from "@refkitnet/validation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/dashboard-types";

export const DEFAULT_COMMISSION_PERCENT = "20";
export const DEFAULT_FIXED_AMOUNT = "10";
export const DEFAULT_MINIMUM_PAYOUT = "50";

export type PayoutMethods = {
  paypal: boolean;
  bank_transfer: boolean;
};

export type ProgramOfferValues = {
  rewardType: "percent" | "fixed";
  commissionPercent: string;
  fixedAmount: string;
  recurringMode: "lifetime" | "months";
  recurringMonths: string;
  joinApproval: "pending" | "active";
  minimumPayout: string;
  payoutMethods: PayoutMethods;
};

const PAYOUT_METHOD_LABELS: Record<keyof PayoutMethods, string> = {
  paypal: "PayPal",
  bank_transfer: "Bank transfer",
};

export function defaultProgramOfferValues(): ProgramOfferValues {
  return {
    rewardType: "percent",
    commissionPercent: DEFAULT_COMMISSION_PERCENT,
    fixedAmount: DEFAULT_FIXED_AMOUNT,
    recurringMode: "lifetime",
    recurringMonths: "12",
    joinApproval: "pending",
    minimumPayout: DEFAULT_MINIMUM_PAYOUT,
    payoutMethods: { paypal: true, bank_transfer: false },
  };
}

function enabledPayoutMethods(values: ProgramOfferValues) {
  return (
    Object.entries(values.payoutMethods) as Array<[keyof PayoutMethods, boolean]>
  )
    .filter(([, enabled]) => enabled)
    .map(([method]) => method);
}

function durationPhrase(values: ProgramOfferValues) {
  if (values.recurringMode === "lifetime") {
    return "for the customer's lifetime";
  }

  return `for ${values.recurringMonths} months`;
}

export function offerSummary(values: ProgramOfferValues, currency = "usd") {
  const duration = durationPhrase(values);

  if (values.rewardType === "percent") {
    return `${values.commissionPercent}% on every referred payment, ${duration}.`;
  }

  return `${formatMoney(
    Math.round(Number(values.fixedAmount) * 100),
    currency,
  )} per referred payment, ${duration}.`;
}

export function settingsSummary(values: ProgramOfferValues, currency = "usd") {
  const approval =
    values.joinApproval === "pending" ? "Manual approval" : "Auto-approve";
  const minimum = formatMoney(
    Math.round(Number(values.minimumPayout) * 100),
    currency,
  );
  const methods = enabledPayoutMethods(values)
    .map((method) => PAYOUT_METHOD_LABELS[method])
    .join(", ");

  return `${approval} · ${minimum} minimum payout · ${methods || "No payout method"}`;
}

export function buildCommissionRulePayload(values: ProgramOfferValues) {
  const percent =
    values.rewardType === "percent"
      ? Number(values.commissionPercent)
      : undefined;
  const fixedDollars =
    values.rewardType === "fixed" ? Number(values.fixedAmount) : undefined;
  const fixed =
    fixedDollars === undefined
      ? undefined
      : Math.round(fixedDollars * 100);
  const recurringDurationMonths =
    values.recurringMode === "lifetime" ? null : Number(values.recurringMonths);

  if (
    values.rewardType === "fixed" &&
    (fixedDollars === undefined ||
      !Number.isFinite(fixedDollars) ||
      fixedDollars <= 0)
  ) {
    throw new Error("Fixed amount must be a positive USD amount.");
  }

  assertCommissionRule({
    rewardType: values.rewardType,
    percentValue: percent,
    fixedAmount: fixed,
    recurringDurationMonths,
  });

  return {
    reward_type: values.rewardType,
    percent_value: percent,
    fixed_amount: fixed,
    recurring_duration_months: recurringDurationMonths,
  };
}

export function buildProgramSettingsPayload(values: ProgramOfferValues) {
  const methods = enabledPayoutMethods(values);

  if (methods.length === 0) {
    throw new Error("Select at least one payout method.");
  }

  const minimum = Math.round(Number(values.minimumPayout) * 100);

  if (!Number.isFinite(minimum) || minimum < 0) {
    throw new Error("Minimum payout must be zero or greater.");
  }

  return {
    join_page_approval: values.joinApproval,
    minimum_payout_amount: minimum,
    supported_payout_methods: methods,
  };
}

type ProgramOfferFieldsProps = {
  values: ProgramOfferValues;
  onChange: (values: ProgramOfferValues) => void;
  programName: string;
  currency?: string;
  commissionInputId?: string;
  showSettings?: boolean;
  title?: string;
  description?: string;
  fieldsDefaultOpen?: boolean;
};

export function ProgramOfferFields({
  values,
  onChange,
  programName,
  currency = "usd",
  commissionInputId = "program-offer-commission",
  showSettings = true,
  title = "Program details",
  description,
  fieldsDefaultOpen = false,
}: ProgramOfferFieldsProps) {
  const [fieldsOpen, setFieldsOpen] = useState(fieldsDefaultOpen);
  const showFields = fieldsDefaultOpen || fieldsOpen;

  function patch(partial: Partial<ProgramOfferValues>) {
    onChange({ ...values, ...partial });
  }

  function patchMethod(method: keyof PayoutMethods, enabled: boolean) {
    patch({ payoutMethods: { ...values.payoutMethods, [method]: enabled } });
  }

  return (
    <div className="flex flex-col gap-4 sm:col-span-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="rounded-md bg-muted/35 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium">{programName}</p>
          {!fieldsDefaultOpen && !fieldsOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setFieldsOpen(true)}
            >
              <Pencil />
              Edit
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm">{offerSummary(values, currency)}</p>
        {showSettings ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {settingsSummary(values, currency)}
          </p>
        ) : null}
      </div>

      {showFields ? (
        <FieldGroup className="gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Commission type</FieldLabel>
              <Select
                value={values.rewardType}
                onValueChange={(value) =>
                  patch({ rewardType: value as "percent" | "fixed" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={commissionInputId}>
                {values.rewardType === "percent"
                  ? "Rate"
                  : `Amount (${currency.toUpperCase()})`}
              </FieldLabel>
              <div className="relative">
                <Input
                  id={commissionInputId}
                  type="number"
                  min="0.01"
                  max={values.rewardType === "percent" ? "100" : undefined}
                  step="0.01"
                  value={
                    values.rewardType === "percent"
                      ? values.commissionPercent
                      : values.fixedAmount
                  }
                  onChange={(event) =>
                    values.rewardType === "percent"
                      ? patch({ commissionPercent: event.target.value })
                      : patch({ fixedAmount: event.target.value })
                  }
                  className="pr-10"
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  {values.rewardType === "percent" ? "%" : currency.toUpperCase()}
                </span>
              </div>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Duration</FieldLabel>
              <Select
                value={values.recurringMode}
                onValueChange={(value) =>
                  patch({ recurringMode: value as "lifetime" | "months" })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                  <SelectItem value="months">Fixed months</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {values.recurringMode === "months" ? (
              <Field>
                <FieldLabel htmlFor={`${commissionInputId}-months`}>Months</FieldLabel>
                <Input
                  id={`${commissionInputId}-months`}
                  type="number"
                  min="1"
                  step="1"
                  value={values.recurringMonths}
                  onChange={(event) =>
                    patch({ recurringMonths: event.target.value })
                  }
                  required
                />
              </Field>
            ) : null}
          </div>

          {showSettings ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor={`${commissionInputId}-approval`}>
                    Join approval
                  </FieldLabel>
                  <Select
                    value={values.joinApproval}
                    onValueChange={(value) =>
                      patch({ joinApproval: value as "pending" | "active" })
                    }
                  >
                    <SelectTrigger
                      id={`${commissionInputId}-approval`}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Require approval</SelectItem>
                      <SelectItem value="active">Auto-approve</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor={`${commissionInputId}-min-payout`}>
                    Minimum payout ({currency.toUpperCase()})
                  </FieldLabel>
                  <Input
                    id={`${commissionInputId}-min-payout`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.minimumPayout}
                    onChange={(event) =>
                      patch({ minimumPayout: event.target.value })
                    }
                    required
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Payout methods</FieldLabel>
                <FieldDescription>
                  Affiliates can request payout with at least one of these.
                </FieldDescription>
                <div className="flex flex-col gap-3">
                  {(
                    Object.keys(PAYOUT_METHOD_LABELS) as Array<keyof PayoutMethods>
                  ).map((method) => (
                    <Field
                      key={method}
                      orientation="horizontal"
                      className="items-center"
                    >
                      <Checkbox
                        id={`${commissionInputId}-${method}`}
                        checked={values.payoutMethods[method]}
                        onCheckedChange={(checked) =>
                          patchMethod(method, checked === true)
                        }
                      />
                      <FieldLabel
                        htmlFor={`${commissionInputId}-${method}`}
                        className="font-normal"
                      >
                        {PAYOUT_METHOD_LABELS[method]}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </Field>
            </>
          ) : null}
        </FieldGroup>
      ) : null}
    </div>
  );
}
