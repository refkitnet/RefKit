import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { apps } from "./apps";
import { managedAccounts, managedConnections } from "./managed-connections";
import { organizations } from "./organizations";
import { users } from "./users";

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id),
    managedAccountId: text("managed_account_id").references(
      () => managedAccounts.id
    ),
    managedConnectionId: text("managed_connection_id").references(
      () => managedConnections.id
    ),
    managedCredentialsVersion: integer("managed_credentials_version"),
    organizationId: text("organization_id").references(() => organizations.id),
    appId: text("app_id").references(() => apps.id),
    kind: text("kind").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    testKey: text("test_key"),
    testKeyEncrypted: text("test_key_encrypted"),
    name: text("name"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    check(
      "api_keys_principal_check",
      sql`(${table.userId} is not null and ${table.managedAccountId} is null and ${table.managedConnectionId} is null and ${table.managedCredentialsVersion} is null) or (${table.userId} is null and ${table.managedAccountId} is not null and ${table.managedConnectionId} is not null and ${table.managedCredentialsVersion} is not null)`
    ),
  ]
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
