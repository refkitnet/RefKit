import { foreignKey, index, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { affiliateLinks, programAffiliates } from "./program-affiliates";
import { programs } from "./programs";

export const clicks = pgTable(
  "clicks",
  {
    id: text("id").primaryKey(),
    affiliateLinkId: text("affiliate_link_id")
      .notNull()
      .references(() => affiliateLinks.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    programAffiliateId: text("program_affiliate_id").notNull(),
    linkLabel: text("link_label"),
    linkCode: text("link_code"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [
    index("clicks_program_created_idx").on(table.programId, table.createdAt),
    index("clicks_program_affiliate_created_idx").on(
      table.programAffiliateId,
      table.createdAt
    ),
    foreignKey({
      name: "clicks_affiliate_program_fk",
      columns: [table.programAffiliateId, table.programId],
      foreignColumns: [programAffiliates.id, programAffiliates.programId],
    }),
    foreignKey({
      name: "clicks_link_program_affiliate_program_fk",
      columns: [
        table.affiliateLinkId,
        table.programAffiliateId,
        table.programId,
      ],
      foreignColumns: [
        affiliateLinks.id,
        affiliateLinks.programAffiliateId,
        affiliateLinks.programId,
      ],
    }),
  ]
);

export type Click = typeof clicks.$inferSelect;
export type NewClick = typeof clicks.$inferInsert;
