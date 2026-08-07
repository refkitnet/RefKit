import { AppError } from "@/lib/errors";

export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  _rateDate: Date
) {
  void _rateDate;

  const from = fromCurrency.toLowerCase();
  const to = toCurrency.toLowerCase();

  if (from === to) {
    return "1";
  }

  throw new AppError(
    "invalid_request",
    "cross_currency_unsupported",
    "Cross-currency commission conversion is not supported yet. Program currency must match revenue currency.",
    400
  );
}
