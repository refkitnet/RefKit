import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { apps } from "./apps";
import { timestamps } from "./helpers";
import { programAffiliates } from "./program-affiliates";
import { payoutBatches } from "./payout-requests";

export const payoutExecutions = pgTable(
  "payout_executions",
  {
    id: text("id").primaryKey(),
    appId: text("app_id")
      .notNull()
      .references(() => apps.id),
    payoutBatchId: text("payout_batch_id")
      .notNull()
      .references(() => payoutBatches.id),
    programAffiliateId: text("program_affiliate_id")
      .notNull()
      .references(() => programAffiliates.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    method: text("method").notNull(),
    instructionSnapshotEncrypted: text("instruction_snapshot_encrypted").notNull(),
    status: text("status").notNull().default("ready"),
    externalReference: text("external_reference"),
    failureReason: text("failure_reason"),
    completionSource: text("completion_source"),
    lastIdempotencyKey: text("last_idempotency_key"),
    lastCallbackPayloadHash: text("last_callback_payload_hash"),
    dispatchedAt: timestamp("dispatched_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "date" }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payout_executions_batch_affiliate_unique").on(
      table.payoutBatchId,
      table.programAffiliateId
    ),
  ]
);

export type PayoutExecution = typeof payoutExecutions.$inferSelect;
