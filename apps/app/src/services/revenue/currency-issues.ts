import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { apps } from "@/db/schema";

const CROSS_CURRENCY_ISSUE_PREFIX = "cross_currency_unsupported:";

export function buildCrossCurrencyIssueNote(input: {
  basisCurrency: string;
  programCurrency: string;
  programId: string;
}) {
  return (
    `${CROSS_CURRENCY_ISSUE_PREFIX}` +
    `Revenue currency ${input.basisCurrency.toUpperCase()} does not match ` +
    `program currency ${input.programCurrency.toUpperCase()} ` +
    `(program ${input.programId}). Revenue event was rejected.`
  );
}

export function isCrossCurrencyIssue(note: string | null | undefined) {
  return Boolean(note?.startsWith(CROSS_CURRENCY_ISSUE_PREFIX));
}

export async function flagCrossCurrencyCommissionIssue(input: {
  appId: string;
  basisCurrency: string;
  programCurrency: string;
  programId: string;
}) {
  const db = getDb();
  const note = buildCrossCurrencyIssueNote(input);

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, input.appId))
    .limit(1);

  if (!app) {
    return;
  }

  const alreadyFlagged = app.integrationIssue === note;

  if (!alreadyFlagged) {
    await db
      .update(apps)
      .set({
        integrationIssue: note,
        integrationIssueAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, input.appId));
  }

  if (alreadyFlagged) {
    return;
  }

}
