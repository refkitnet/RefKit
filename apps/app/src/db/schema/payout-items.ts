import { sql } from "drizzle-orm";
import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { commissionEntries } from "./commission-entries";
import { payoutRequests, payoutBatches } from "./payout-requests";

export const payoutItems = pgTable(
  "payout_items",
  {
    id: text("id").primaryKey(),
    payoutBatchId: text("payout_batch_id")
      .notNull()
      .references(() => payoutBatches.id),
    payoutRequestId: text("payout_request_id").references(
      () => payoutRequests.id
    ),
    commissionEntryId: text("commission_entry_id")
      .notNull()
      .references(() => commissionEntries.id),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    externalReference: text("external_reference"),
    batchStatus: text("batch_status").notNull().default("draft"),
    payoutMethod: text("payout_method"),
    payoutDetailsSnapshotEncrypted: text("payout_details_snapshot_encrypted"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payout_items_batch_entry_unique").on(
      table.payoutBatchId,
      table.commissionEntryId
    ),
    uniqueIndex("payout_items_active_entry_unique")
      .on(table.commissionEntryId)
      .where(
        sql`${table.batchStatus} != 'cancelled' AND ${table.status} IN ('pending', 'paid')`
      ),
  ]
);

export type PayoutItem = typeof payoutItems.$inferSelect;
export type NewPayoutItem = typeof payoutItems.$inferInsert;
