import { expect, type Page } from "@playwright/test";

export type Role = "patient" | "doctor" | "receptionist";

export function credentials(role: Role) {
  const prefix = `E2E_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) {
    throw new Error(`Set ${prefix}_EMAIL and ${prefix}_PASSWORD in .env.test`);
  }
  return { email, password };
}

export async function signIn(page: Page, role: Role) {
  const { email, password } = credentials(role);
  await page.goto("/login");
  // Wait for hydration so typed values are not lost.
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Row on /appointments whose text contains `text`, after searching for it. */
export async function appointmentRow(page: Page, text: string) {
  await page.goto("/appointments");
  await page.getByPlaceholder(/^Search /).fill(text);
  return page.locator("li").filter({ hasText: text });
}
