import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { programAffiliates, programs } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAuditLog } from "@/services/audit";
import { requireProgramAccess } from "@/services/scoping";
import { emitWebhookEvent } from "@/services/webhooks";

export async function approvePendingAffiliate(
  userId: string,
  programAffiliateId: string
) {
  const db = getDb();

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (!affiliate) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate not found.",
      404
    );
  }

  await requireProgramAccess(userId, affiliate.programId);

  if (affiliate.status !== "pending") {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only pending programAffiliates can be approved.",
      400
    );
  }

  const [updated] = await db
    .update(programAffiliates)
    .set({ status: "active" })
    .where(
      and(
        eq(programAffiliates.id, programAffiliateId),
        eq(programAffiliates.status, "pending")
      )
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_affiliate_transition",
      "Only pending programAffiliates can be approved.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "affiliate.approved",
    resourceType: "affiliate",
    resourceId: programAffiliateId,
    metadata: { from_status: affiliate.status, to_status: "active" },
  });

  const [program] = await db
    .select({ appId: programs.appId })
    .from(programs)
    .where(eq(programs.id, updated.programId))
    .limit(1);

  if (program) {
    await emitWebhookEvent({
      appId: program.appId,
      eventType: "affiliate.approved",
      livemode: !updated.isTest,
      data: {
        id: updated.id,
        program_id: updated.programId,
        user_id: updated.userId,
        status: updated.status,
        is_test: updated.isTest,
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
      },
    });
  }

  return updated;
}
