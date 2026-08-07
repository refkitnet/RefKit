import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";

export type AccountMode = "owner" | "affiliate";

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    name: text("name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    isAdmin: boolean("is_admin").notNull().default(false),
    primaryMode: text("primary_mode")
      .$type<AccountMode>()
      .notNull()
      .default("owner"),
    ...timestamps,
  },
  (table) => [
    check(
      "users_primary_mode_check",
      sql`${table.primaryMode} in ('owner', 'affiliate')`
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
