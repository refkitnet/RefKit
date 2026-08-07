import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { apps } from "./apps";
import { customers } from "./customers";
import { programs } from "./programs";
import { stripeConnections } from "./stripe";

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    parentTransactionId: text("parent_transaction_id"),
    stripeConnectionId: text("stripe_connection_id").references(
      () => stripeConnections.id
    ),
    programId: text("program_id").references(() => programs.id),
    customerId: text("customer_id").references(() => customers.id),
    programAffiliateId: text("program_affiliate_id").references(
      () => programAffiliates.id
    ),
    stripeObjectId: text("stripe_object_id"),
    stripeChargeId: text("stripe_charge_id"),
    action: text("action").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    livemode: boolean("livemode").notNull(),
    stripeEventId: text("stripe_event_id"),
    transactionDate: timestamp("transaction_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("transactions_app_external_action_livemode_unique").on(
      table.appId,
      table.externalId,
      table.action,
      table.livemode
    ),
    index("transactions_connection_charge_idx").on(
      table.stripeConnectionId,
      table.stripeChargeId
    ),
    index("transactions_customer_program_idx").on(
      table.customerId,
      table.programId
    ),
    index("transactions_app_idx").on(table.appId),
  ]
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
