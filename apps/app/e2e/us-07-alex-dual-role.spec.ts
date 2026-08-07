import { expect, test } from "@playwright/test";
import { SEED_USERS } from "../src/db/seed/ids";
import { signInAsSeedUser } from "./helpers/auth";
import { closeE2eDb } from "./helpers/magic-link";

test.afterAll(async () => {
  await closeE2eDb();
});

test("US-07 Alex switches between developer dashboard and affiliate portal", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await signInAsSeedUser(page, SEED_USERS.alex.id, "/dashboard");
  await expect(page.locator('[data-slot="sidebar-inset"]')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { name: "PixelForge" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("link", { name: "Affiliate portal" }).click();
  await expect(page).toHaveURL(/\/affiliate\/?$/, { timeout: 15_000 });

  const luminaRow = page.getByRole("row", { name: /Lumina Partners/ });
  await expect(luminaRow).toBeVisible({ timeout: 15_000 });
  await expect(luminaRow.getByText("Active", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Developer dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "PixelForge" })).toBeVisible({
    timeout: 30_000,
  });
});
