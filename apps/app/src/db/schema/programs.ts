import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "./helpers";
import { apps } from "./apps";

export const programs = pgTable(
  "programs",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    currency: text("currency").notNull(),
    destinationUrl: text("destination_url").notNull(),
    status: text("status").notNull().default("active"),
    accessMode: text("access_mode").notNull().default("private"),
    isDefault: boolean("is_default").notNull().default(false),
    joinPageEnabled: boolean("join_page_enabled").notNull().default(false),
    joinPageApproval: text("join_page_approval").notNull().default("active"),
    allowSelfReferral: boolean("allow_self_referral").notNull().default(false),
    promotionCodeFallback: boolean("promotion_code_fallback")
      .notNull()
      .default(false),
    minimumPayoutAmount: integer("minimum_payout_amount").notNull().default(0),
    supportedPayoutMethods: jsonb("supported_payout_methods")
      .$type<string[]>()
      .notNull()
      .default([]),
    disabledAcknowledgedAt: timestamp("disabled_acknowledged_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("programs_slug_unique").on(table.slug),
    uniqueIndex("programs_default_per_app_unique")
      .on(table.appId)
      .where(sql`${table.isDefault} = true`),
  ]
);

export type Program = typeof programs.$inferSelect;
export type NewProgram = typeof programs.$inferInsert;
