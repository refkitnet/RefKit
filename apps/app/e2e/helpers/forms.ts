import { expect, type Locator } from "@playwright/test";

/** Fill a text input in a way React controlled fields reliably see. */
export async function fillField(locator: Locator, value: string) {
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 5 });
  await expect(locator).toHaveValue(value);
}
