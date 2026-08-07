import { getDb } from "@/db/client";
import { adminAuditLogs } from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";

type WriteAuditLogInput = {
  actorUserId?: string;
  actorManagedAccountId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

export async function writeAuditLog(input: WriteAuditLogInput) {
  const db = getDb();
  const managedAccountId = input.actorManagedAccountId
    ?? (input.actorUserId?.startsWith(`${ID_PREFIXES.managedAccount}_`)
      ? input.actorUserId
      : null);
  const userId = managedAccountId ? null : (input.actorUserId ?? null);

  if (!userId && !managedAccountId) {
    throw new Error("Audit log actor is required.");
  }

  await db.insert(adminAuditLogs).values({
    id: generateId(ID_PREFIXES.auditLog),
    adminUserId: userId,
    managedAccountId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? null,
  });
}
