import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { programs } from "./programs";

export const affiliatePromotionCodes = pgTable(
  "affiliate_promotion_codes",
  {
    id: text("id").primaryKey(),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id),
    programId: text("program_id")
      .notNull()
      .references(() => programs.id),
    stripePromotionCodeId: text("stripe_promotion_code_id").notNull(),
    stripeCouponId: text("stripe_coupon_id").notNull(),
    code: text("code").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("affiliate_promotion_codes_program_code_unique").on(
      table.programId,
      table.code
    ),
  ]
);

export type AffiliatePromotionCode = typeof affiliatePromotionCodes.$inferSelect;
