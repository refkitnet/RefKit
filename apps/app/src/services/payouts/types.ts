export type PayoutMethod = "paypal" | "bank_transfer";

export type PayPalPayoutDetails = {
  email: string;
};

export type BankTransferPayoutDetails = {
  country: string;
  currency: string;
  accountHolderName: string;
  iban?: string;
  bic?: string;
  accountNumber?: string;
  routingNumber?: string;
  sortCode?: string;
};

export type PayoutDetailsPayload =
  | PayPalPayoutDetails
  | BankTransferPayoutDetails;

export type PayoutDetailsValidationWarning = {
  field: string;
  message: string;
};
