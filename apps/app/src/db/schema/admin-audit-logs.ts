import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { timestamps } from "./helpers";
import { managedAccounts } from "./managed-connections";
import { users } from "./users";

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id").references(() => users.id),
    managedAccountId: text("managed_account_id").references(
      () => managedAccounts.id
    ),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata"),
    ...timestamps,
  },
  (table) => [
    check(
      "admin_audit_logs_actor_check",
      sql`(${table.adminUserId} is not null) <> (${table.managedAccountId} is not null)`
    ),
  ]
);

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
