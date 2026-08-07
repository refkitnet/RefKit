import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers/auth";
import { fillField } from "./helpers/forms";
import { closeE2eDb } from "./helpers/magic-link";

test.afterAll(async () => {
  await closeE2eDb();
});

test("US-00a owner onboarding chooses Test and lands on setup journey", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now();
  const email = `e2e-onboarding-${suffix}@refkit.local`;
  const appName = `Onboarding App ${suffix}`;
  const websiteUrl = `https://e2e-example-${suffix}.com`;

  await signUpOwner(page, email, "E2E Onboarding Owner");

  await expect(page.getByText("Add your app and offer")).toBeVisible({
    timeout: 15_000,
  });

  await fillField(page.locator("#onboarding-app-url"), websiteUrl);
  await fillField(page.locator("#onboarding-app-name"), appName);

  const appResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/apps")
      && response.request().method() === "POST",
    { timeout: 30_000 },
  );

  await page.getByRole("button", { name: "Create and continue" }).click();
  const appResponse = await appResponsePromise;
  expect(appResponse.ok(), await appResponse.text()).toBeTruthy();

  await expect(page.getByText("Choose how to connect RefKit")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Test first" }).click();

  await expect(page.getByText("Add your Test website")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByLabel("Local or staging website URL")
    .fill("http://localhost:5173");

  await expect(page.getByText("Track payments")).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("radio", { name: /Stripe/i }).click();
  await expect(
    page.getByRole("button", { name: "Connect test" }),
  ).toBeVisible({ timeout: 15_000 });
});
