export const DEFAULT_APP_AGREEMENT_TEMPLATE = `By joining {{app_name}}, you agree to:

- Clearly disclose that you may earn a commission.
- Not bid on our brand name or trademarks without permission.
- Not promote unauthorized coupons, discounts, or cashback offers.
- Not use spam, misleading claims, fake traffic, or incentivized clicks.
- Not refer yourself or manipulate referral tracking.

Commissions may be rejected for refunds, chargebacks, fraud, tracking abuse, or violations of these terms.

{{app_name}} may update these terms or end your participation at any time.`;

export function defaultAppAgreement(appName: string) {
  return DEFAULT_APP_AGREEMENT_TEMPLATE.replaceAll("{{app_name}}", appName);
}

/** RefKit-owned rules shown below the developer agreement on affiliate surfaces. */
export const REFKIT_PLATFORM_RULES = [
  "RefKit provides referral tracking and commission records. The developer decides whether commissions are approved, rejected, or paid.",
  "Developers and affiliates are responsible for their own payments, taxes, invoices, and legal obligations.",
] as const;

export const PROGRAM_AGREEMENT_EDITOR_PLACEHOLDER =
  "Add the rules affiliates must follow when promoting your program. You can edit the default agreement or replace it with your own terms.";
