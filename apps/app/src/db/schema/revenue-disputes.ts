import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { timestamps } from "./helpers";
import { transactions } from "./transactions";

export const revenueDisputes = pgTable(
  "revenue_disputes",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    paymentTransactionId: text("payment_transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    status: text("status").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    livemode: boolean("livemode").notNull(),
    eventDate: timestamp("event_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("revenue_disputes_app_external_mode_unique").on(
      table.appId,
      table.externalId,
      table.livemode
    ),
    index("revenue_disputes_payment_idx").on(table.paymentTransactionId),
  ]
);

export type RevenueDispute = typeof revenueDisputes.$inferSelect;
export type NewRevenueDispute = typeof revenueDisputes.$inferInsert;
