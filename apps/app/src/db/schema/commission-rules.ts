import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programs } from "./programs";
import { programTermsVersions } from "./program-terms";

export const commissionRules = pgTable(
  "commission_rules",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    termsVersionId: text("terms_version_id").references(
      () => programTermsVersions.id
    ),
    rewardType: text("reward_type").notNull(),
    percentValue: numeric("percent_value", { precision: 8, scale: 4 }),
    fixedAmount: integer("fixed_amount"),
    fixedCurrency: text("fixed_currency"),
    recurringDurationMonths: integer("recurring_duration_months"),
    isDefault: boolean("is_default").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_rules_active_default_unique")
      .on(table.programId)
      .where(sql`${table.isDefault} = true and ${table.isActive} = true`),
  ]
);

export type CommissionRule = typeof commissionRules.$inferSelect;
export type NewCommissionRule = typeof commissionRules.$inferInsert;
