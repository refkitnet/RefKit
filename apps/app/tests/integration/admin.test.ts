import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  adminAuditLogs,
  commissionEntries,
  programAffiliates,
  stripeEvents,
  transactions,
  users,
} from "@/db/schema";
import { validateAdminAccess } from "@/services/admin/gate";
import {
  createCommissionAdjustment,
  reprocessStripeEvent,
} from "@/services/admin/operations";
import { computePayableBalance } from "@/services/payouts/balance";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";
import {
  ingestStripeEvent,
  processStoredStripeEvent,
} from "@/services/stripe/event-processor";
import {
  buildStripeEvent,
  registerCheckoutPaymentFixture,
} from "@/services/stripe/fixtures";
import {
  clearFixtureObjects,
  createFixtureFetcher,
  setStripeFetcherForTests,
} from "@/services/stripe/fetcher";
import {
  cleanupTestContext,
  createOwnerUser,
  createTestSuffix,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("admin", () => {
  describe("gate", () => {
    const previousAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;

    afterAll(() => {
      process.env.ADMIN_EMAIL_ALLOWLIST = previousAllowlist;
    });

    it("fails closed when allowlist is unset", () => {
      delete process.env.ADMIN_EMAIL_ALLOWLIST;
      expect(validateAdminAccess("ops@refkit.net", true)).toBe(false);
    });

    it("requires both allowlist email and is_admin flag", () => {
      process.env.ADMIN_EMAIL_ALLOWLIST = "ops@refkit.net,admin@refkit.net";
      expect(validateAdminAccess("ops@refkit.net", true)).toBe(true);
      expect(validateAdminAccess("ops@refkit.net", false)).toBe(false);
      expect(validateAdminAccess("other@refkit.net", true)).toBe(false);
    });
  });

  describe("operations", () => {
    const suffix = createTestSuffix();
    let ctx: TestContext;
    let adminUserId: string;
    const adminEmail = `admin-${suffix}@refkit-vitest.test`;

    beforeAll(async () => {
      process.env.ADMIN_EMAIL_ALLOWLIST = adminEmail;
      ctx = await seedAttributionGraph({ suffix });
      adminUserId = await createOwnerUser(`${suffix}-admin`);
      const db = getDb();

      await db
        .update(users)
        .set({ email: adminEmail, isAdmin: true })
        .where(eq(users.id, adminUserId));
    });

    afterAll(async () => {
      const db = getDb();

      await db
        .delete(adminAuditLogs)
        .where(eq(adminAuditLogs.adminUserId, adminUserId));

      await db.delete(users).where(eq(users.id, adminUserId));
      await cleanupTestContext(ctx);
    });

    it("createCommissionAdjustment affects payable balance without editing originals", async () => {
      const db = getDb();
      const beforeBalance = await computePayableBalance(
        ctx.programAffiliateId,
        ctx.programId
      );
      const beforeRows = await db
        .select()
        .from(commissionEntries)
        .where(
          eq(commissionEntries.programAffiliateId, ctx.programAffiliateId)
        );

      const entry = await createCommissionAdjustment(adminUserId, {
        programAffiliateId: ctx.programAffiliateId,
        amount: 500,
        currency: "usd",
        reason: "Manual correction",
      });

      expect(entry.kind).toBe("admin_adjustment");
      expect(entry.status).toBe("approved");
      expect(entry.amount).toBe(500);

      const afterBalance = await computePayableBalance(
        ctx.programAffiliateId,
        ctx.programId
      );
      expect(afterBalance.amount).toBe(beforeBalance.amount + 500);

      await expect(
        createCommissionAdjustment(adminUserId, {
          programAffiliateId: ctx.programAffiliateId,
          amount: 0,
          currency: "usd",
          reason: "Zero should fail",
        })
      ).rejects.toMatchObject({ code: "invalid_adjustment_amount" });

      const negativeEntry = await createCommissionAdjustment(adminUserId, {
        programAffiliateId: ctx.programAffiliateId,
        amount: -200,
        currency: "usd",
        reason: "Negative adjustment",
      });
      expect(negativeEntry.amount).toBe(-200);

      const afterRows = await db
        .select()
        .from(commissionEntries)
        .where(
          eq(commissionEntries.programAffiliateId, ctx.programAffiliateId)
        );

      expect(afterRows).toHaveLength(beforeRows.length + 2);

      const byId = (a: { id: string }, b: { id: string }) =>
        a.id.localeCompare(b.id);
      const untouchedRows = afterRows.filter(
        (row) => row.id !== entry.id && row.id !== negativeEntry.id
      );
      expect([...untouchedRows].sort(byId)).toEqual([...beforeRows].sort(byId));
    });

    it("reprocessStripeEvent does not duplicate money records", async () => {
      setStripeFetcherForTests(createFixtureFetcher());
      clearFixtureObjects();

      await getDb()
        .update(programAffiliates)
        .set({ isTest: true })
        .where(eq(programAffiliates.id, ctx.programAffiliateId));

      const connection = await createSandboxStripeConnection(ctx.appId);
      ctx.stripeConnectionId = connection.id;

      const sessionId = `cs_admin_reprocess_${suffix}`;
      const chargeId = `ch_admin_reprocess_${suffix}`;
      const stripeEventId = `evt_admin_reprocess_${suffix}`;

      const { session } = registerCheckoutPaymentFixture({
        stripeAccountId: connection.stripeAccountId,
        sessionId,
        chargeId,
        amount: 4200,
        currency: "usd",
        metadata: {
          refkit_click_id: ctx.clickId,
          refkit_customer_id: ctx.customerId,
          refkit_program_id: ctx.programId,
        },
        paymentStatus: "paid",
        mode: "payment",
      });

      const event = buildStripeEvent({
        id: stripeEventId,
        type: "checkout.session.completed",
        account: connection.stripeAccountId,
        livemode: false,
        object: session,
      });

      const storedEvent = await ingestStripeEvent({
        stripeAccountId: connection.stripeAccountId,
        event,
      });

      expect(storedEvent).not.toBeNull();
      const storedEventId = storedEvent!.id;

      await processStoredStripeEvent(storedEventId);
      const reprocessed = await reprocessStripeEvent(adminUserId, storedEventId);
      await processStoredStripeEvent(storedEventId);

      expect(reprocessed.processingStatus).toBe("processed");
      expect(reprocessed.processingAttempts).toBe(2);

      const db = getDb();

      const txnRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.stripeConnectionId, connection.id));

      const commissionRows = await db
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.programId, ctx.programId));

      expect(txnRows).toHaveLength(1);
      expect(commissionRows.filter((row) => row.kind === "earned")).toHaveLength(1);

      const [eventRow] = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, storedEventId));
      expect(eventRow.processingStatus).toBe("processed");
      expect(eventRow.lastProcessingError).toBeNull();
      const [auditRow] = await db
        .select()
        .from(adminAuditLogs)
        .where(eq(adminAuditLogs.resourceId, storedEventId));
      expect(auditRow?.action).toBe("stripe_event.reprocessed");
      expect(auditRow?.metadata).toMatchObject({ outcome: "processed" });

      clearFixtureObjects();
      setStripeFetcherForTests(null);
    });
  });
});
