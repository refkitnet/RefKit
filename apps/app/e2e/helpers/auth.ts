import { expect, type Page } from "@playwright/test";
import { SEED_USERS } from "../../src/db/seed/ids";
import { waitForMagicLink } from "./magic-link";

export async function verifyMagicLink(
  page: Page,
  email: string,
  callbackURL = "/",
) {
  const magicLinkUrl = await waitForMagicLink(email, {
    callbackURL,
    timeoutMs: 30_000,
  });
  const verifyResponse = await page.request.get(magicLinkUrl, {
    maxRedirects: 0,
  });
  expect([302, 303, 307]).toContain(verifyResponse.status());
}

export async function signInAsSeedUser(
  page: Page,
  userId: string,
  redirect?: string,
) {
  const redirectParam = redirect
    ? `&redirect=${encodeURIComponent(redirect)}`
    : "";
  await page.goto(
    `/api/dev/sign-in?userId=${encodeURIComponent(userId)}${redirectParam}`,
    { waitUntil: "domcontentloaded" },
  );
}

export async function signInViaMagicLink(
  page: Page,
  email: string,
  callbackURL = "/",
) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("you@company.com").fill(email);

  const [signInResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST"
        && response.url().includes("/api/auth/sign-in"),
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Send magic link" }).click(),
  ]);

  expect(signInResponse.ok()).toBeTruthy();
  await verifyMagicLink(page, email, callbackURL);
  await page.goto(callbackURL, { waitUntil: "domcontentloaded" });
}

export async function provisionBetaUser(
  page: Page,
  email: string,
  name: string,
  primaryMode: "owner" | "affiliate" = "owner",
) {
  await signInAsSeedUser(page, SEED_USERS.admin.id, "/dashboard/admin/accounts");

  const response = await page.request.post("/api/v1/admin/users", {
    data: {
      email,
      name,
      primary_mode: primaryMode,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
}

export async function signUpOwner(
  page: Page,
  email: string,
  name = "E2E Owner",
) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
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
  await verifyMagicLink(page, email, "/");
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
}

export async function signOutFromShell(page: Page) {
  await page.locator('[data-slot="sidebar-footer"] button').first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 15_000 });
}
