import { expect, test } from "@playwright/test";
import { credentials, signIn, type Role } from "./helpers";

for (const role of ["patient", "doctor", "receptionist"] as Role[]) {
  test(`${role} can sign in`, async ({ page }) => {
    await signIn(page, role);
    await expect(page.getByText("Successfully logged in!")).toBeVisible();
  });
}

test("wrong password shows an error and stays on login", async ({ page }) => {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(credentials("patient").email);
  await page.locator("#password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByText("Invalid login credentials")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/appointments");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fappointments/);
});

test("patient sees the AI assistant greeting", async ({ page }) => {
  await signIn(page, "patient");
  await page.goto("/ai");
  await expect(page.getByText("Patient Assistant")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message CareBridge AI" })).toBeVisible();
});
