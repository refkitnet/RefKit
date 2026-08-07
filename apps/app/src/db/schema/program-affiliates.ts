import { sql } from "drizzle-orm";
import { boolean, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { apps } from "./apps";
import { programs } from "./programs";
import { users } from "./users";

export const programAffiliates = pgTable(
  "program_affiliates",
  {
    id: text("id").primaryKey(),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("pending"),
    isTest: boolean("is_test").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("program_affiliates_id_program_unique").on(
      table.id,
      table.programId
    ),
    uniqueIndex("program_affiliates_program_user_unique").on(
      table.programId,
      table.userId
    ),
    uniqueIndex("program_affiliates_program_test_unique")
      .on(table.programId)
      .where(sql`${table.isTest} = true`),
  ]
);

export const affiliateLinks = pgTable(
  "affiliate_links",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    linkCode: text("link_code").notNull(),
    label: text("label").notNull().default("Default link"),
    destinationUrl: text("destination_url"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("affiliate_links_id_program_affiliate_program_unique").on(
      table.id,
      table.programAffiliateId,
      table.programId
    ),
    uniqueIndex("affiliate_links_app_id_link_code_unique").on(
      table.appId,
      table.linkCode
    ),
  ]
);

export type ProgramAffiliate = typeof programAffiliates.$inferSelect;
export type AffiliateLink = typeof affiliateLinks.$inferSelect;
