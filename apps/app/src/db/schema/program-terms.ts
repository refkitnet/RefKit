import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programs } from "./programs";

export const programTermsVersions = pgTable(
  "program_terms_versions",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    versionNumber: integer("version_number").notNull(),
    rewardType: text("reward_type").notNull(),
    percentValue: text("percent_value"),
    fixedAmount: integer("fixed_amount"),
    fixedCurrency: text("fixed_currency"),
    recurringDurationMonths: integer("recurring_duration_months"),
    publishedByUserId: text("published_by_user_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("program_terms_versions_program_version_unique").on(
      table.programId,
      table.versionNumber
    ),
  ]
);

export type ProgramTermsVersion = typeof programTermsVersions.$inferSelect;
