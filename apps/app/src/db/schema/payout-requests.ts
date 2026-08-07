import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { programs } from "./programs";

export const payoutBatches = pgTable("payout_batches", {
  id: text("id").primaryKey(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id),
  status: text("status").notNull().default("draft"),
  ...timestamps,
});

export const payoutRequests = pgTable("payout_requests", {
  id: text("id").primaryKey(),
  programId: text("program_id")
    .notNull()
    .references(() => programs.id),
  programAffiliateId: text("program_affiliate_id")
    .notNull()
    .references(() => programAffiliates.id),
  status: text("status").notNull().default("open"),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  declineReason: text("decline_reason"),
  payoutBatchId: text("payout_batch_id").references(() => payoutBatches.id),
  ...timestamps,
});

export type PayoutRequest = typeof payoutRequests.$inferSelect;
export type PayoutBatch = typeof payoutBatches.$inferSelect;
