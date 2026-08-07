import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../src/db/seed/ids";
import {
  provisionBetaUser,
  signInAsSeedUser,
  verifyMagicLink,
} from "./helpers/auth";
import { fillField } from "./helpers/forms";
import { closeE2eDb, waitForMagicLink } from "./helpers/magic-link";

test.afterAll(async () => {
  await closeE2eDb();
});

test("sign up with magic link as developer", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-owner-${Date.now()}@refkit.local`;

  await page.goto("/sign-up");
  await expect(page.getByText("Create your RefKit account")).toBeVisible();

  await page.getByLabel("Name").fill("E2E Owner");
  await page.getByPlaceholder("you@company.com").fill(email);

  const [registerResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/register")
        && response.request().method() === "POST",
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);

  expect(registerResponse.ok()).toBeTruthy();

  const magicLinkUrl = await waitForMagicLink(email, { timeoutMs: 30_000 });
  const verifyResponse = await page.request.get(magicLinkUrl, {
    maxRedirects: 0,
  });
  expect([302, 303, 307]).toContain(verifyResponse.status());
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/dashboard\/?$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByText("Add your app and offer"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "RefKit creates the default Program at the same time.",
    )
  ).toBeVisible();
});

test("sign up with magic link as an affiliate", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-affiliate-${Date.now()}@refkit.local`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Affiliate");
  await page.getByPlaceholder("you@company.com").fill(email);
  await page.getByRole("radio", { name: "Affiliate" }).check();

  const [registerResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/register")
        && response.request().method() === "POST",
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Create account" }).click(),
  ]);

  expect(registerResponse.status()).toBe(202);

  const magicLinkUrl = await waitForMagicLink(email, { timeoutMs: 30_000 });
  const verifyResponse = await page.request.get(magicLinkUrl, {
    maxRedirects: 0,
  });
  expect([302, 303, 307]).toContain(verifyResponse.status());

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/affiliate\/?$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("No programs yet", { exact: true })).toBeVisible();
});

test("dev quick sign-in works for seed users", async ({ page }) => {
  test.setTimeout(30_000);

  await page.goto("/sign-in");
  await expect(page.getByText("Dev quick sign-in")).toBeVisible();
  await page.getByRole("link", { name: /Marcus Chen/i }).click();

  await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 15_000 });
});

test("admin can invite beta users from accounts page", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-admin-invite-${Date.now()}@refkit.local`;

  await signInAsSeedUser(page, SEED_USERS.admin.id, "/dashboard/admin/accounts");
  await expect(page.getByText("Add beta user")).toBeVisible();
  await fillField(page.locator("#beta-user-name"), "E2E Admin Invite");
  await fillField(page.locator("#beta-user-email"), email);

  const [inviteResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST"
        && response.url().includes("/api/v1/admin/users"),
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Send invite" }).click(),
  ]);

  expect(inviteResponse.status(), await inviteResponse.text()).toBe(201);
  await expect(page.getByText("Invite email sent.")).toBeVisible();
});

test("admin invite flow completes signup", async ({ page }) => {
  test.setTimeout(60_000);
  const email = `e2e-admin-flow-${Date.now()}@refkit.local`;

  await provisionBetaUser(page, email, "E2E Admin Flow", "owner");
  await verifyMagicLink(page, email, "/");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(/\/dashboard\/?$/, { timeout: 15_000 });
  await expect(page.getByText("Add your app and offer")).toBeVisible();
});
