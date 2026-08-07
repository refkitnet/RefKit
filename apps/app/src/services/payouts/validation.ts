import { z } from "zod";
import type {
  PayoutDetailsValidationWarning,
  PayoutMethod,
} from "@/services/payouts/types";

const paypalSchema = z.object({
  email: z.string().trim().email(),
});

const bankTransferSchema = z.object({
  country: z.string().trim().min(2).max(2),
  currency: z.string().trim().min(3).max(3),
  accountHolderName: z.string().trim().min(1).max(200),
  iban: z.string().trim().min(1).optional(),
  bic: z.string().trim().min(1).optional(),
  accountNumber: z.string().trim().min(1).optional(),
  routingNumber: z.string().trim().min(1).optional(),
  sortCode: z.string().trim().min(1).optional(),
});

export function parsePayoutDetails(
  method: PayoutMethod,
  details: Record<string, unknown>
) {
  if (method === "paypal") {
    return paypalSchema.parse(details);
  }

  return bankTransferSchema.parse(details);
}

export function validatePayoutDetailsSoft(
  method: PayoutMethod,
  details: Record<string, unknown>
): PayoutDetailsValidationWarning[] {
  const warnings: PayoutDetailsValidationWarning[] = [];

  if (method === "paypal") {
    const result = paypalSchema.safeParse(details);

    if (!result.success) {
      for (const issue of result.error.issues) {
        warnings.push({
          field: issue.path.join(".") || "details",
          message: issue.message,
        });
      }
    }

    return warnings;
  }

  const result = bankTransferSchema.safeParse(details);

  if (!result.success) {
    for (const issue of result.error.issues) {
      warnings.push({
        field: issue.path.join(".") || "details",
        message: issue.message,
      });
    }

    return warnings;
  }

  const bank = result.data;
  const hasIban = Boolean(bank.iban);
  const hasAccountRouting = Boolean(bank.accountNumber && bank.routingNumber);
  const hasSortAccount = Boolean(bank.sortCode && bank.accountNumber);

  if (!hasIban && !hasAccountRouting && !hasSortAccount) {
    warnings.push({
      field: "details",
      message:
        "Provide IBAN and BIC, account and routing number, or sort code and account number.",
    });
  }

  if (bank.iban && !/^[A-Z0-9]{15,34}$/i.test(bank.iban.replace(/\s/g, ""))) {
    warnings.push({
      field: "iban",
      message: "IBAN format looks invalid.",
    });
  }

  return warnings;
}
