import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { apps } from "./apps";
import { users } from "./users";

export const stripeConnections = pgTable(
  "stripe_connections",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    stripeAccountId: text("stripe_account_id").notNull(),
    livemode: boolean("livemode").notNull(),
    status: text("status").notNull().default("connected"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stripe_connections_app_livemode_unique").on(
      table.appId,
      table.livemode
    ),
    uniqueIndex("stripe_connections_stripe_account_unique").on(
      table.stripeAccountId
    ),
  ]
);

export const pendingStripeInstalls = pgTable(
  "pending_stripe_installs",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    state: text("state").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("pending_stripe_installs_app_user_unique").on(
      table.appId,
      table.userId
    ),
    uniqueIndex("pending_stripe_installs_state_unique").on(table.state),
  ]
);

export const stripeAppAuthorizations = pgTable(
  "stripe_app_authorizations",
  {
    id: text("id").primaryKey(),
    stripeAccountId: text("stripe_account_id").notNull(),
    livemode: boolean("livemode").notNull(),
    claimedAppId: text("claimed_app_id").references(() => apps.id),
    claimedAt: timestamp("claimed_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stripe_app_authorizations_account_unique").on(
      table.stripeAccountId
    ),
  ]
);

export const stripeEvents = pgTable(
  "stripe_events",
  {
    id: text("id").primaryKey(),
    stripeConnectionId: text("stripe_connection_id")
      .notNull()
      .references(() => stripeConnections.id),
    stripeEventId: text("stripe_event_id").notNull(),
    eventType: text("event_type").notNull(),
    livemode: boolean("livemode").notNull(),
    payload: jsonb("payload").notNull(),
    processingStatus: text("processing_status").notNull().default("pending"),
    processingAttempts: integer("processing_attempts").notNull().default(0),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastProcessingError: text("last_processing_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stripe_events_connection_event_unique").on(
      table.stripeConnectionId,
      table.stripeEventId
    ),
  ]
);

export type StripeConnection = typeof stripeConnections.$inferSelect;
export type PendingStripeInstall = typeof pendingStripeInstalls.$inferSelect;
export type StripeAppAuthorization = typeof stripeAppAuthorizations.$inferSelect;
export type StripeEvent = typeof stripeEvents.$inferSelect;
