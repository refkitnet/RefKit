import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { commissionEntries } from "./commission-entries";
import { payoutRequests } from "./payout-requests";

export const payoutRequestItems = pgTable(
  "payout_request_items",
  {
    id: text("id").primaryKey(),
    payoutRequestId: text("payout_request_id")
      .notNull()
      .references(() => payoutRequests.id),
    commissionEntryId: text("commission_entry_id")
      .notNull()
      .references(() => commissionEntries.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payout_request_items_request_entry_unique").on(
      table.payoutRequestId,
      table.commissionEntryId
    ),
    uniqueIndex("payout_request_items_entry_unique").on(
      table.commissionEntryId
    ),
  ]
);

export type PayoutRequestItem = typeof payoutRequestItems.$inferSelect;
