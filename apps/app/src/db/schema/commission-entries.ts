import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { commissionRules } from "./commission-rules";
import { customers } from "./customers";
import { programs } from "./programs";
import { transactions } from "./transactions";

export const commissionEntries = pgTable(
  "commission_entries",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").references(() => transactions.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    programAffiliateId: text("program_affiliate_id").notNull(),
    customerId: text("customer_id").references(() => customers.id),
    ruleId: text("rule_id").references(() => commissionRules.id),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 }),
    originalAmount: integer("original_amount"),
    originalCurrency: text("original_currency"),
    status: text("status").notNull().default("approved"),
    statusBeforeDispute: text("status_before_dispute"),
    stripeRefundId: text("stripe_refund_id"),
    sourceEventId: text("source_event_id"),
    disputeId: text("dispute_id"),
    stripeDisputeId: text("stripe_dispute_id"),
    livemode: boolean("livemode").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "date" }),
    approvedByUserId: text("approved_by_user_id"),
    approvalReason: text("approval_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_entries_earned_unique")
      .on(table.transactionId, table.programAffiliateId, table.ruleId)
      .where(sql`${table.kind} = 'earned'`),
    uniqueIndex("commission_entries_refund_unique")
      .on(table.stripeRefundId)
      .where(sql`${table.stripeRefundId} is not null`),
    uniqueIndex("commission_entries_source_event_unique")
      .on(table.sourceEventId)
      .where(sql`${table.sourceEventId} is not null`),
    index("commission_entries_stripe_dispute_idx")
      .on(table.stripeDisputeId, table.kind)
      .where(sql`${table.stripeDisputeId} is not null`),
    index("commission_entries_dispute_idx")
      .on(table.disputeId, table.kind)
      .where(sql`${table.disputeId} is not null`),
    index("commission_entries_program_affiliate_program_status_idx").on(
      table.programAffiliateId,
      table.programId,
      table.status
    ),
    foreignKey({
      name: "commission_entries_program_affiliate_program_fk",
      columns: [table.programAffiliateId, table.programId],
      foreignColumns: [programAffiliates.id, programAffiliates.programId],
    }),
  ]
);

export type CommissionEntry = typeof commissionEntries.$inferSelect;
export type NewCommissionEntry = typeof commissionEntries.$inferInsert;
