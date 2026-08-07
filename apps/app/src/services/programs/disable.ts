import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { programAffiliates, apps, programs, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAuditLog } from "@/services/audit";
import { sendProgramClosingEmailDirect } from "@/services/emails/send-dashboard-emails";
import { computePayableBalance } from "@/services/payouts/balance";
import { requireProgramAccess } from "@/services/scoping";

export async function disableProgram(
  userId: string,
  programId: string,
  options?: {
    skipAccessCheck?: boolean;
    skipAcknowledgmentCheck?: boolean;
    auditAction?: string;
  }
) {
  const db = getDb();
  let program;

  if (options?.skipAccessCheck) {
    const [row] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);

    if (!row) {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    program = row;
  }
  else {
    program = await requireProgramAccess(userId, programId);
  }

  if (program.status === "disabled") {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Program is already disabled.",
      400
    );
  }

  if (!program.disabledAcknowledgedAt && !options?.skipAcknowledgmentCheck) {
    throw new AppError(
      "invalid_request",
      "acknowledgment_required",
      "You must acknowledge responsibility for paying approved commissions before disabling.",
      400
    );
  }

  if (program.isDefault) {
    const [replacement] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(
        and(
          eq(programs.appId, program.appId),
          ne(programs.id, program.id),
          ne(programs.status, "disabled")
        )
      )
      .limit(1);

    if (replacement) {
      throw new AppError(
        "conflict",
        "default_program_replacement_required",
        "Choose another default program before disabling this one.",
        409
      );
    }
  }

  const updated = await db.transaction(async (tx) => {
    const [transitioned] = await tx
      .update(programs)
      .set({
        status: "disabled",
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(programs.id, programId),
          eq(programs.status, program.status)
        )
      )
      .returning();

    if (!transitioned) {
      throw new AppError(
        "invalid_request",
        "invalid_program_transition",
        "Program status changed before it could be disabled.",
        400
      );
    }

    if (program.isDefault) {
      await tx
        .update(apps)
        .set({ networkVisible: false, updatedAt: new Date() })
        .where(eq(apps.id, program.appId));
    }

    return transitioned;
  });

  await writeAuditLog({
    actorUserId: userId,
    action: options?.auditAction ?? "program.disabled",
    resourceType: "program",
    resourceId: programId,
    metadata: { from_status: program.status, to_status: "disabled" },
  });

  const affiliateRows = await db
    .select({
      programAffiliateId: programAffiliates.id,
      userId: programAffiliates.userId,
      email: users.email,
    })
    .from(programAffiliates)
    .innerJoin(users, eq(users.id, programAffiliates.userId))
    .where(eq(programAffiliates.programId, programId));

  for (const row of affiliateRows) {
    const balance = await computePayableBalance(row.programAffiliateId, programId);

    if (balance.amount > 0 && row.email) {
      await sendProgramClosingEmailDirect({
        to: row.email,
        programName: program.name,
        amount: balance.amount,
        currency: balance.currency,
      });
    }
  }

  return updated;
}

export async function acknowledgeProgramDisable(
  userId: string,
  programId: string
) {
  const program = await requireProgramAccess(userId, programId);

  if (program.status === "disabled") {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Program is already disabled.",
      400
    );
  }

  const db = getDb();

  await db
    .update(programs)
    .set({ disabledAcknowledgedAt: new Date() })
    .where(eq(programs.id, programId));

  await writeAuditLog({
    actorUserId: userId,
    action: "program.disable_acknowledged",
    resourceType: "program",
    resourceId: programId,
  });

  const [updated] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  return updated;
}
