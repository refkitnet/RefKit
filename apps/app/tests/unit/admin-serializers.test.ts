import { describe, expect, it } from "vitest";
import { serializeAuditLog } from "@/services/admin/serializers";

const timestamp = new Date("2026-08-04T12:00:00.000Z");
const baseAuditLog = {
  id: "alog_test",
  action: "program.paused",
  resourceType: "program",
  resourceId: "prog_test",
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("serializeAuditLog", () => {
  it("preserves the user or managed account actor", () => {
    expect(
      serializeAuditLog({
        ...baseAuditLog,
        adminUserId: "usr_test",
        managedAccountId: null,
      })
    ).toMatchObject({
      admin_user_id: "usr_test",
      managed_account_id: null,
    });

    expect(
      serializeAuditLog({
        ...baseAuditLog,
        adminUserId: null,
        managedAccountId: "macc_test",
      })
    ).toMatchObject({
      admin_user_id: null,
      managed_account_id: "macc_test",
    });
  });
});
