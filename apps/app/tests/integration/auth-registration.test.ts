import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as signInPost } from "@/app/api/auth/sign-in/route";
import { getDb } from "@/db/client";
import { adminAuditLogs, rateLimits, users, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isClosedBetaBypassEmail } from "@/lib/closed-beta.server";
import { hashRateLimitScope } from "@/lib/rate-limit";
import { createBetaUser } from "@/services/admin/users";
import { registerPendingUser } from "@/services/users/register";

const createdEmails: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  const db = getDb();

  for (const userId of createdUserIds.splice(0)) {
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.adminUserId, userId));
    await db.delete(adminAuditLogs).where(eq(adminAuditLogs.resourceId, userId));
  }

  for (const email of createdEmails.splice(0)) {
    await db.delete(verifications).where(like(verifications.value, `%${email}%`));
    await db.delete(users).where(eq(users.email, email));
    await db
      .delete(rateLimits)
      .where(eq(rateLimits.scope, hashRateLimitScope(`magic_link:${email}`)));
    await db
      .delete(rateLimits)
      .where(eq(rateLimits.scope, hashRateLimitScope(`signin:${email}`)));
    await db
      .delete(rateLimits)
      .where(eq(rateLimits.scope, hashRateLimitScope(`signup:${email}`)));
  }

  vi.restoreAllMocks();
});

describe("account registration", () => {
  it("does not bypass closed beta for test domains in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isClosedBetaBypassEmail("random@refkit.local")).toBe(false);
    expect(isClosedBetaBypassEmail("random@refkit-vitest.test")).toBe(false);

    vi.unstubAllEnvs();
  });

  it("creates and safely updates an unverified registration", async () => {
    const email = `signup-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email);

    const first = await registerPendingUser({
      name: "First Name",
      email,
      primaryMode: "owner",
    });
    expect(first.emailVerified).toBe(false);
    expect(first.primaryMode).toBe("owner");

    const retried = await registerPendingUser({
      name: "Updated Name",
      email: email.toUpperCase(),
      primaryMode: "affiliate",
    });
    expect(retried.name).toBe("Updated Name");
    expect(retried.primaryMode).toBe("affiliate");
  });

  it("rejects signup for a verified account", async () => {
    const email = `verified-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email);

    const user = await registerPendingUser({
      name: "Verified User",
      email,
      primaryMode: "owner",
    });
    await getDb()
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, user.id));

    await expect(
      registerPendingUser({
        name: "Verified User",
        email,
        primaryMode: "affiliate",
      })
    ).rejects.toMatchObject({ code: "account_exists", status: 409 });
  });

  it("rejects public signup during closed beta", async () => {
    const email = `closed-beta-${Date.now()}@example.com`;
    createdEmails.push(email);

    const response = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Closed Beta User",
          email,
          primary_mode: "owner",
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "closed_beta" },
    });
  });

  it("rejects sign-in for unknown emails during closed beta", async () => {
    const email = `unknown-${Date.now()}@example.com`;
    createdEmails.push(email);

    const response = await signInPost(
      new Request("http://localhost/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          callback_url: "/dashboard",
        }),
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "closed_beta" },
    });

    const [user] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(user).toBeUndefined();
  });

  it("allows register for refkit.local emails during closed beta", async () => {
    const email = `e2e-seed-${Date.now()}@refkit.local`;
    createdEmails.push(email);

    const response = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Seed User",
          email,
          primary_mode: "owner",
        }),
      })
    );

    expect(response.status).toBe(202);

    const [verification] = await getDb()
      .select({ id: verifications.id, identifier: verifications.identifier })
      .from(verifications)
      .where(like(verifications.value, `%${email}%`))
      .limit(1);
    expect(verification).toBeDefined();

    const loggedLink = (
      await readFile(join(process.cwd(), ".local", "last-email-links.txt"), "utf8")
    ).trim();
    const rawToken = new URL(loggedLink).searchParams.get("token");

    expect(rawToken).toBeTruthy();
    expect(verification?.identifier).toBe(
      createHash("sha256").update(rawToken!).digest("base64url")
    );
    expect(verification?.identifier).not.toBe(rawToken);
  });

  it("allows sign-in for refkit-vitest.test emails during closed beta", async () => {
    const email = `invited-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email);

    await registerPendingUser({
      name: "Invited User",
      email,
      primaryMode: "owner",
    });

    const response = await signInPost(
      new Request("http://localhost/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          callback_url: "/dashboard",
        }),
      })
    );

    expect(response.status).toBe(202);

    const [verification] = await getDb()
      .select({ id: verifications.id })
      .from(verifications)
      .where(like(verifications.value, `%${email}%`))
      .limit(1);
    expect(verification).toBeDefined();
  });

  it("does not email or create an unknown Better Auth sign-in account", async () => {
    const email = `unknown-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: "/dashboard",
        metadata: { type: "account_signin" },
      },
      headers: new Headers(),
    });

    expect(result.status).toBe(true);
    expect(log).not.toHaveBeenCalled();

    const [user] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    expect(user).toBeUndefined();
  });

  it("creates beta users from admin and sends signup magic links", async () => {
    const previousAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
    const email = `beta-${Date.now()}@refkit-vitest.test`;
    const adminEmail = `admin-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email, adminEmail);
    process.env.ADMIN_EMAIL_ALLOWLIST = adminEmail;

    const adminUser = await registerPendingUser({
      name: "Beta Admin",
      email: adminEmail,
      primaryMode: "owner",
    });
    createdUserIds.push(adminUser.id);
    await getDb()
      .update(users)
      .set({ isAdmin: true, emailVerified: true })
      .where(eq(users.id, adminUser.id));

    const user = await createBetaUser(
      adminUser.id,
      {
        name: "Beta Owner",
        email,
        primaryMode: "owner",
      },
      new Headers()
    );

    expect(user.email).toBe(email);

    const [verification] = await getDb()
      .select({ id: verifications.id })
      .from(verifications)
      .where(like(verifications.value, `%${email}%`))
      .limit(1);
    expect(verification).toBeDefined();

    process.env.ADMIN_EMAIL_ALLOWLIST = previousAllowlist;
  });

  it("lets an administrator grant Developer access to an existing Affiliate", async () => {
    const email = `existing-affiliate-${Date.now()}@refkit-vitest.test`;
    const adminEmail = `grant-admin-${Date.now()}@refkit-vitest.test`;
    createdEmails.push(email, adminEmail);

    const [adminUser, affiliateUser] = await Promise.all([
      registerPendingUser({
        name: "Instance Admin",
        email: adminEmail,
        primaryMode: "owner",
      }),
      registerPendingUser({
        name: "Existing Affiliate",
        email,
        primaryMode: "affiliate",
      }),
    ]);
    createdUserIds.push(adminUser.id);
    await getDb()
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, affiliateUser.id));

    const promoted = await createBetaUser(
      adminUser.id,
      {
        name: "Ignored Replacement Name",
        email,
        primaryMode: "owner",
      },
      new Headers()
    );

    expect(promoted).toMatchObject({
      id: affiliateUser.id,
      name: "Existing Affiliate",
      primaryMode: "owner",
    });
    await expect(
      registerPendingUser({
        name: "Public Signup",
        email,
        primaryMode: "affiliate",
      })
    ).rejects.toMatchObject({ code: "account_exists", status: 409 });

    const [auditLog] = await getDb()
      .select()
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.resourceId, affiliateUser.id))
      .limit(1);
    expect(auditLog).toMatchObject({
      adminUserId: adminUser.id,
      action: "beta_user.invited",
    });
  });
});
