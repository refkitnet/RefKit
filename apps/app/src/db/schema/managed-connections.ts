import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { timestamps } from "./helpers";
import { organizations } from "./organizations";

export type ManagedAccountStatus = "active" | "redacted";
export type ManagedConnectionStatus =
  | "active"
  | "suspended"
  | "uninstalled"
  | "redacted";

export const managedAccounts = pgTable(
  "managed_accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    displayName: text("display_name").notNull(),
    status: text("status")
      .$type<ManagedAccountStatus>()
      .notNull()
      .default("active"),
    redactedAt: timestamp("redacted_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("managed_accounts_app_unique").on(table.appId),
    check(
      "managed_accounts_status_check",
      sql`${table.status} in ('active', 'redacted')`
    ),
  ]
);

export const managedConnections = pgTable(
  "managed_connections",
  {
    id: text("id").primaryKey(),
    managedAccountId: text("managed_account_id")
      .notNull()
      .references(() => managedAccounts.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    provider: text("provider").notNull(),
    provisioningIdempotencyKey: text("provisioning_idempotency_key").notNull(),
    externalAccountId: text("external_account_id"),
    status: text("status")
      .$type<ManagedConnectionStatus>()
      .notNull()
      .default("active"),
    credentialsVersion: integer("credentials_version").notNull().default(1),
    credentialsAcknowledgementId: text(
      "credentials_acknowledgement_id"
    ),
    pendingCredentialBundleEncrypted: text(
      "pending_credential_bundle_encrypted"
    ),
    credentialsAcknowledgedAt: timestamp("credentials_acknowledged_at", {
      withTimezone: true,
      mode: "date",
    }),
    suspendedAt: timestamp("suspended_at", {
      withTimezone: true,
      mode: "date",
    }),
    uninstalledAt: timestamp("uninstalled_at", {
      withTimezone: true,
      mode: "date",
    }),
    redactedAt: timestamp("redacted_at", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("managed_connections_account_unique").on(
      table.managedAccountId
    ),
    uniqueIndex("managed_connections_app_unique").on(table.appId),
    uniqueIndex("managed_connections_provider_provisioning_idempotency_unique").on(
      table.provider,
      table.provisioningIdempotencyKey
    ),
    index("managed_connections_provider_external_idx").on(
      table.provider,
      table.externalAccountId
    ),
    check(
      "managed_connections_status_check",
      sql`${table.status} in ('active', 'suspended', 'uninstalled', 'redacted')`
    ),
  ]
);

export const managedDataSubjectRedactions = pgTable(
  "managed_data_subject_redactions",
  {
    customerId: text("customer_id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    subjectFingerprint: text("subject_fingerprint").notNull(),
    redactedAt: timestamp("redacted_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("managed_data_subject_redactions_subject_unique").on(
      table.appId,
      table.subjectFingerprint
    ),
  ]
);

export type ManagedAccount = typeof managedAccounts.$inferSelect;
export type ManagedConnection = typeof managedConnections.$inferSelect;
export type ManagedDataSubjectRedaction =
  typeof managedDataSubjectRedactions.$inferSelect;
