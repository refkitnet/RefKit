export type CaptureClickInput = {
  apiKey: string;
  baseUrl?: string;
  via: string;
  page?: string;
  referrer?: string;
  visitorIp?: string;
  visitorUserAgent?: string;
};

export type CaptureClickResult = {
  click_id: string | null;
};

type IdentifyCustomerBaseInput = {
  apiKey: string;
  baseUrl?: string;
  externalCustomerId: string;
  email?: string;
};

export type PromotionCodeAttributionEvidence = {
  type: "promotion_code";
  value: string;
  programId: string;
  programAffiliateId: string;
};

export type IdentifyCustomerInput = IdentifyCustomerBaseInput & (
  | {
      clickId: string;
      attributionEvidence?: PromotionCodeAttributionEvidence;
    }
  | {
      clickId?: never;
      attributionEvidence: PromotionCodeAttributionEvidence;
    }
);

export type IdentifyCustomerResult = {
  customer_id: string;
  external_customer_id: string;
  referral_id: string;
  program_id: string;
  program_affiliate_id: string;
  click_id: string | null;
  attribution_source: "click" | "promotion_code";
  attributed: boolean;
  stripe_metadata: {
    refkit_click_id: string | null;
    refkit_customer_id: string;
    refkit_program_id: string;
  };
};

export type ReportPaymentInput = {
  apiKey: string;
  baseUrl?: string;
  paymentId: string;
  customerId: string;
  programId: string;
  amount: number;
  currency: string;
  paidAt?: string;
};

export type ReportPaymentResult = {
  transaction_id: string;
  commission_entry_id: string | null;
  attributed: boolean;
  livemode: boolean;
  created: boolean;
};

export type ReportRefundInput = {
  apiKey: string;
  baseUrl?: string;
  refundId: string;
  paymentId: string;
  amount: number;
  refundedAt?: string;
};

export type ReportRefundResult = {
  transaction_id: string;
  commission_entry_id: string | null;
  livemode: boolean;
  created: boolean;
};

export type ReportDisputeStatus =
  | "opened"
  | "won"
  | "withdrawn"
  | "lost"
  | "funds_reinstated";

export type ReportDisputeInput = {
  apiKey: string;
  baseUrl?: string;
  disputeId: string;
  paymentId: string;
  status: ReportDisputeStatus;
  amount: number;
  occurredAt?: string;
};

export type ReportDisputeResult = {
  dispute_id: string;
  payment_transaction_id: string;
  status: ReportDisputeStatus;
  commission_entry_id: string | null;
  livemode: boolean;
  created: boolean;
  updated: boolean;
};

export type PayoutExecution = {
  id: string;
  app_id: string;
  payout_batch_id: string;
  program_affiliate_id: string;
  amount: { amount: number; currency: string };
  method: string;
  status: "ready" | "failed" | "succeeded";
  external_reference: string | null;
  failure_reason: string | null;
  completion_source: "external" | "manual" | null;
  instructions?: Record<string, unknown>;
};

export type GetPayoutExecutionInput = {
  apiKey: string;
  baseUrl?: string;
  executionId: string;
};

export type ReportPayoutSucceededInput = GetPayoutExecutionInput & {
  idempotencyKey: string;
  externalReference?: string;
};

export type ReportPayoutFailedInput = GetPayoutExecutionInput & {
  idempotencyKey: string;
  failureReason: string;
  externalReference?: string;
};

type ApiErrorBody = {
  error?: {
    message?: string;
  };
};

async function postJson<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const responseBody = (await response.json()) as T | ApiErrorBody;

  if (!response.ok) {
    const errorBody = responseBody as ApiErrorBody;
    const message = errorBody.error?.message
      ? errorBody.error.message
      : "RefKit API request failed.";

    throw new Error(message);
  }

  return responseBody as T;
}

async function getJson<T>(
  baseUrl: string,
  apiKey: string,
  path: string
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const responseBody = (await response.json()) as T | ApiErrorBody;

  if (!response.ok) {
    const errorBody = responseBody as ApiErrorBody;
    throw new Error(errorBody.error?.message ?? "RefKit API request failed.");
  }

  return responseBody as T;
}

export async function captureClick(
  input: CaptureClickInput
): Promise<CaptureClickResult> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<CaptureClickResult>(baseUrl, input.apiKey, "/v1/capture", {
    via: input.via,
    page: input.page,
    referrer: input.referrer,
    visitor_ip: input.visitorIp,
    visitor_user_agent: input.visitorUserAgent,
  });
}

export async function identifyCustomer(
  input: IdentifyCustomerInput
): Promise<IdentifyCustomerResult> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<IdentifyCustomerResult>(baseUrl, input.apiKey, "/v1/identify", {
    click_id: input.clickId,
    attribution_evidence: input.attributionEvidence
      ? {
          type: input.attributionEvidence.type,
          value: input.attributionEvidence.value,
          program_id: input.attributionEvidence.programId,
          program_affiliate_id:
            input.attributionEvidence.programAffiliateId,
        }
      : undefined,
    external_customer_id: input.externalCustomerId,
    email: input.email,
  });
}

export async function reportPayment(
  input: ReportPaymentInput
): Promise<ReportPaymentResult> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<ReportPaymentResult>(
    baseUrl,
    input.apiKey,
    "/v1/transactions",
    {
      payment_id: input.paymentId,
      customer_id: input.customerId,
      program_id: input.programId,
      amount: input.amount,
      currency: input.currency,
      paid_at: input.paidAt,
    }
  );
}

export async function reportRefund(
  input: ReportRefundInput
): Promise<ReportRefundResult> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<ReportRefundResult>(
    baseUrl,
    input.apiKey,
    "/v1/transactions/refunds",
    {
      refund_id: input.refundId,
      payment_id: input.paymentId,
      amount: input.amount,
      refunded_at: input.refundedAt,
    }
  );
}

export async function getPayoutExecution(
  input: GetPayoutExecutionInput
): Promise<PayoutExecution> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return getJson<PayoutExecution>(
    baseUrl,
    input.apiKey,
    `/v1/payout-executions/${input.executionId}`
  );
}

export async function reportDispute(
  input: ReportDisputeInput
): Promise<ReportDisputeResult> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<ReportDisputeResult>(
    baseUrl,
    input.apiKey,
    "/v1/transactions/disputes",
    {
      dispute_id: input.disputeId,
      payment_id: input.paymentId,
      status: input.status,
      amount: input.amount,
      occurred_at: input.occurredAt,
    }
  );
}

export async function reportPayoutSucceeded(
  input: ReportPayoutSucceededInput
): Promise<PayoutExecution> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<PayoutExecution>(
    baseUrl,
    input.apiKey,
    `/v1/payout-executions/${input.executionId}/succeeded`,
    {
      external_reference: input.externalReference,
    },
    { "Idempotency-Key": input.idempotencyKey }
  );
}

export async function reportPayoutFailed(
  input: ReportPayoutFailedInput
): Promise<PayoutExecution> {
  const baseUrl = input.baseUrl ?? "https://app.refkit.net";

  return postJson<PayoutExecution>(
    baseUrl,
    input.apiKey,
    `/v1/payout-executions/${input.executionId}/failed`,
    {
      failure_reason: input.failureReason,
      external_reference: input.externalReference,
    },
    { "Idempotency-Key": input.idempotencyKey }
  );
}

export const refkit = {
  captureClick,
  identifyCustomer,
  reportPayment,
  reportRefund,
  reportDispute,
  getPayoutExecution,
  reportPayoutSucceeded,
  reportPayoutFailed,
};

export default refkit;
