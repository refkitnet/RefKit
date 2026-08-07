#!/usr/bin/env node

import {
  identifyCustomer,
  reportPayment,
  reportRefund,
} from "@refkitnet/sdk";

const baseUrl = process.env.REFKIT_API_URL ?? "http://localhost:3000";
const apiKey =
  process.env.REFKIT_API_KEY ??
  "rk_test_app_seedledgerk00000000000000000000001";
const runId =
  process.env.REFKIT_QA_RUN_ID ??
  new Date().toISOString().replace(/[^0-9]/g, "");
const paymentId = `pay_qa_ledgerkit_${runId}`;
const refundId = `refund_qa_ledgerkit_${runId}`;

const identified = await identifyCustomer({
  apiKey,
  baseUrl,
  clickId: "clk_seed_ledgerkit_1",
  userId: `ledgerkit-qa-${runId}`,
  email: `qa-${runId}@ledgerkit.demo`,
});

const payment = await reportPayment({
  apiKey,
  baseUrl,
  paymentId,
  customerId: identified.customer_id,
  programId: identified.program_id,
  amount: 10000,
  currency: "usd",
});

const refund = await reportRefund({
  apiKey,
  baseUrl,
  refundId,
  paymentId,
  amount: 2500,
});

console.log(JSON.stringify({
  story: "US-04",
  identified: {
    customer_id: identified.customer_id,
    referral_id: identified.referral_id,
    attributed: identified.attributed,
  },
  payment,
  refund,
  expected: {
    payment_amount: 10000,
    refund_amount: -2500,
    earned_commission: 2000,
    refund_reversal: -500,
  },
}, null, 2));
