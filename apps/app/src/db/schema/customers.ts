import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { apps } from "./apps";
import { clicks } from "./clicks";
import { programAffiliates } from "./program-affiliates";
import { programs } from "./programs";
import { programTermsVersions } from "./program-terms";
import { commissionRules } from "./commission-rules";

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    externalCustomerId: text("external_customer_id").notNull(),
    email: text("email"),
    redactedAt: timestamp("redacted_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_app_external_customer_unique").on(
      table.appId,
      table.externalCustomerId
    ),
  ]
);

export const referrals = pgTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    programAffiliateId: text("program_affiliate_id").notNull(),
    clickId: text("click_id").references(() => clicks.id),
    termsVersionId: text("terms_version_id").references(
      () => programTermsVersions.id
    ),
    pinnedRuleId: text("pinned_rule_id").references(() => commissionRules.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("referrals_customer_program_unique").on(
      table.customerId,
      table.programId
    ),
    foreignKey({
      name: "referrals_program_affiliate_program_fk",
      columns: [table.programAffiliateId, table.programId],
      foreignColumns: [programAffiliates.id, programAffiliates.programId],
    }),
  ]
);

export type Customer = typeof customers.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
