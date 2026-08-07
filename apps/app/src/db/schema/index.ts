export * from "./users";
export * from "./auth";
export * from "./organizations";
export * from "./apps";
export * from "./managed-connections";
export * from "./app-agreements";
export * from "./programs";
export * from "./commission-rules";
export * from "./program-terms";
export * from "./program-affiliates";
export * from "./clicks";
export * from "./customers";
export * from "./stripe";
export * from "./transactions";
export * from "./revenue-disputes";
export * from "./commission-entries";
export * from "./payout-requests";
export * from "./payout-items";
export * from "./payout-request-items";
export * from "./affiliate-payout-details";
export * from "./affiliate-promotion-codes";
export * from "./api-keys";
export * from "./admin-audit-logs";
export * from "./rate-limits";
export * from "./webhooks";
export * from "./payout-executions";

import { accounts, deviceCodes, sessions, verifications } from "./auth";
import { adminAuditLogs } from "./admin-audit-logs";
import { affiliateLinks, programAffiliates } from "./program-affiliates";
import { affiliatePayoutDetails } from "./affiliate-payout-details";
import { affiliatePromotionCodes } from "./affiliate-promotion-codes";
import { apiKeys } from "./api-keys";
import { apps } from "./apps";
import {
  managedAccounts,
  managedConnections,
  managedDataSubjectRedactions,
} from "./managed-connections";
import {
  appAgreementVersions,
  affiliateAgreementAcceptances,
} from "./app-agreements";
import { clicks } from "./clicks";
import { commissionEntries } from "./commission-entries";
import { commissionRules } from "./commission-rules";
import { programTermsVersions } from "./program-terms";
import { customers, referrals } from "./customers";
import { organizationMembers, organizations } from "./organizations";
import { payoutItems } from "./payout-items";
import { payoutRequestItems } from "./payout-request-items";
import { payoutRequests, payoutBatches } from "./payout-requests";
import { programs } from "./programs";
import { rateLimits } from "./rate-limits";
import { webhookDeliveries, webhookEndpoints } from "./webhooks";
import { payoutExecutions } from "./payout-executions";
import {
  pendingStripeInstalls,
  stripeAppAuthorizations,
  stripeConnections,
  stripeEvents,
} from "./stripe";
import { transactions } from "./transactions";
import { revenueDisputes } from "./revenue-disputes";
import { users } from "./users";

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  deviceCode: deviceCodes,
  organizations,
  organizationMembers,
  apps,
  managedAccounts,
  managedConnections,
  managedDataSubjectRedactions,
  appAgreementVersions,
  affiliateAgreementAcceptances,
  programs,
  commissionRules,
  programTermsVersions,
  programAffiliates,
  affiliateLinks,
  clicks,
  customers,
  referrals,
  stripeConnections,
  pendingStripeInstalls,
  stripeAppAuthorizations,
  stripeEvents,
  transactions,
  revenueDisputes,
  commissionEntries,
  payoutRequests,
  payoutBatches,
  payoutItems,
  payoutRequestItems,
  affiliatePayoutDetails,
  affiliatePromotionCodes,
  apiKeys,
  adminAuditLogs,
  rateLimits,
  webhookEndpoints,
  webhookDeliveries,
  payoutExecutions,
};
