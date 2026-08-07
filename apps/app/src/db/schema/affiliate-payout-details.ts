import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";

export const affiliatePayoutDetails = pgTable(
  "affiliate_payout_details",
  {
    id: text("id").primaryKey(),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    currency: text("currency").notNull().default("usd"),
    detailsEncrypted: text("details_encrypted").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("affiliate_payout_details_affiliate_method_currency_unique").on(
      table.programAffiliateId,
      table.method,
      table.currency
    ),
  ]
);

export type AffiliatePayoutDetails = typeof affiliatePayoutDetails.$inferSelect;
