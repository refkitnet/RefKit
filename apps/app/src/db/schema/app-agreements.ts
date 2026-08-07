import { integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { apps } from "./apps";
import { programAffiliates } from "./program-affiliates";

export const appAgreementVersions = pgTable(
  "app_agreement_versions",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    versionNumber: integer("version_number").notNull(),
    termsText: text("terms_text").notNull(),
    publishedByUserId: text("published_by_user_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("app_agreement_versions_app_version_unique").on(
      table.appId,
      table.versionNumber
    ),
  ]
);

export const affiliateAgreementAcceptances = pgTable(
  "affiliate_agreement_acceptances",
  {
    id: text("id").primaryKey(),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id),
    appAgreementVersionId: text("app_agreement_version_id")
      .notNull()
      .references(() => appAgreementVersions.id),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("affiliate_agreement_acceptances_unique").on(
      table.programAffiliateId,
      table.appAgreementVersionId
    ),
  ]
);

export type AppAgreementVersion = typeof appAgreementVersions.$inferSelect;
export type AffiliateAgreementAcceptance =
  typeof affiliateAgreementAcceptances.$inferSelect;
