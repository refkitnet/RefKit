import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../src/db/seed/ids";
import { signInAsSeedUser, signOutFromShell } from "./helpers/auth";
import { closeE2eDb } from "./helpers/magic-link";

test.afterAll(async () => {
  await closeE2eDb();
});

test("US-06 join page and developer approval workflow", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/join/zenforms");
  await expect(page.getByText(/Join ZenForms Partners/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();

  await signInAsSeedUser(page, SEED_USERS.mei.id, "/dashboard/affiliates");
  await expect(page.locator('[data-slot="sidebar-inset"]')).toBeVisible({
    timeout: 30_000,
  });

  const samRow = page.getByRole("row").filter({
    hasText: SEED_USERS.sam.email,
  });
  await expect(samRow.getByText("Pending approval")).toBeVisible({
    timeout: 15_000,
  });
  await samRow.getByRole("button", { name: "Open actions" }).click();
  await page.getByRole("menuitem", { name: "Approve" }).click();
  await expect(page.getByText("Affiliate approved.", { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await signOutFromShell(page);

  await signInAsSeedUser(page, SEED_USERS.sam.id, "/affiliate");
  const zenformsRow = page.getByRole("row").filter({
    hasText: "ZenForms Partners",
  });
  await expect(zenformsRow).toBeVisible({ timeout: 15_000 });
  await expect(zenformsRow.getByText("Active", { exact: true })).toBeVisible();
});
