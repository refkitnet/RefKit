import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limits",
  {
    scope: text("scope").notNull(),
    windowBucket: text("window_bucket").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.windowBucket] }),
    index("rate_limits_updated_at_idx").on(table.updatedAt),
  ]
);

export type RateLimit = typeof rateLimits.$inferSelect;
