import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import {
  organizationMembers,
  organizations,
  users,
} from "@/db/schema";
import { resetServerEnvCache } from "@/lib/env";
import {
  bootstrapSelfHostedAdministrator,
  getSelfHostedBootstrapStatus,
} from "@/services/self-hosted/bootstrap";
import { createOrganization } from "@/services/organizations";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { createTestSuffix } from "../helpers/context";

describe("Self-Hosted first-administrator bootstrap", () => {
  const suffix = createTestSuffix();
  const email = `self-hosted-${suffix}@example.com`;
  const setupToken = `self-hosted-${suffix}`.padEnd(32, "x");
  let userId: string | null = null;
  let affiliateUserId: string | null = null;
  let organizationId: string | null = null;

  beforeAll(() => {
    vi.stubEnv("REFKIT_EDITION", "self-hosted");
    vi.stubEnv("SELF_HOSTED_SETUP_TOKEN", setupToken);
    vi.stubEnv("UPLOADS_DIR", ".local/self-hosted-bootstrap-test");
    resetServerEnvCache();
  });

  afterAll(async () => {
    const db = getDb();

    if (userId) {
      await db
        .delete(organizationMembers)
        .where(eq(organizationMembers.userId, userId));
    }

    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }

    if (userId) {
      await db.delete(users).where(eq(users.id, userId));
    }

    if (affiliateUserId) {
      await db.delete(users).where(eq(users.id, affiliateUserId));
    }

    vi.unstubAllEnvs();
    resetServerEnvCache();
  });

  it("creates one administrator and refuses setup-token reuse", async () => {
    await expect(getSelfHostedBootstrapStatus()).resolves.toEqual({
      setupRequired: true,
    });

    const result = await bootstrapSelfHostedAdministrator({
      setupToken,
      name: "Instance Administrator",
      email,
      organizationName: "Example Organization",
    });
    userId = result.administrator.id;
    organizationId = result.organizationId;

    expect(result.administrator).toMatchObject({
      email,
      isAdmin: true,
      primaryMode: "owner",
    });
    await expect(getSelfHostedBootstrapStatus()).resolves.toEqual({
      setupRequired: false,
    });
    await expect(
      bootstrapSelfHostedAdministrator({
        setupToken,
        name: "Second Administrator",
        email: `second-${email}`,
        organizationName: "Second Organization",
      })
    ).rejects.toMatchObject({
      code: "setup_already_complete",
      status: 409,
    });
  });

  it("denies organization creation to Affiliate-only accounts", async () => {
    const db = getDb();
    affiliateUserId = generateId(ID_PREFIXES.user);

    await db.insert(users).values({
      id: affiliateUserId,
      email: `affiliate-${email}`,
      name: "Affiliate",
      primaryMode: "affiliate",
    });

    await expect(
      createOrganization(affiliateUserId, "Unauthorized Organization")
    ).rejects.toMatchObject({
      code: "developer_access_required",
      status: 403,
    });
  });
});
