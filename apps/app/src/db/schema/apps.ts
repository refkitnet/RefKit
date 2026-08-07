import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { organizations } from "./organizations";

export const apps = pgTable(
  "apps",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    revenueSource: text("revenue_source").notNull().default("stripe"),
    websiteUrl: text("website_url"),
    trackingOrigin: text("tracking_origin"),
    logoUrl: text("logo_url"),
    networkVisible: boolean("network_visible").notNull().default(false),
    status: text("status").notNull().default("active"),
    integrationIssue: text("integration_issue"),
    integrationIssueAt: timestamp("integration_issue_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("apps_tracking_origin_unique")
      .on(table.trackingOrigin)
      .where(sql`${table.trackingOrigin} is not null`),
  ]
);

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;
