import {
  boolean,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { timestamps } from "./helpers";

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    url: text("url").notNull(),
    secretEncrypted: text("secret_encrypted").notNull(),
    enabledEvents: jsonb("enabled_events").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("webhook_endpoints_app_unique").on(table.appId),
  ]
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookEndpointId: text("webhook_endpoint_id").references(
      () => webhookEndpoints.id,
      { onDelete: "set null" }
    ),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    success: boolean("success").notNull(),
    httpStatus: integer("http_status"),
    response: text("response"),
    error: text("error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("webhook_deliveries_event_unique").on(table.eventId),
    index("webhook_deliveries_app_created_idx").on(
      table.appId,
      table.createdAt
    ),
  ]
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
