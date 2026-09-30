import { expect, test } from "@playwright/test";
import { appointmentRow, signIn } from "./helpers";

// One appointment travels through the whole flow and is cancelled at the end,
// so the live clinic data is left as it was.
test.describe.serial("booking flow", () => {
  const reason = `E2E check ${Date.now()}`;

  test("patient requests an appointment", async ({ page }) => {
    await signIn(page, "patient");
    await page.goto("/book");
    await page.getByRole("button", { name: /Marcus Vance/ }).click();

    const slot = page
      .getByRole("button", { name: /^\d{2}:\d{2} (AM|PM)$/ })
      .and(page.locator(":not(.line-through)"));
    let booked = false;
    for (let offset = 1; offset <= 21 && !booked; offset++) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      await page.locator("#date").fill(iso);
      if ((await slot.count()) === 0) continue;
      await slot.first().click();
      booked = true;
    }
    expect(booked, "Dr. Marcus Vance has no free slot in the next 3 weeks").toBe(true);

    await page.locator("#reason").fill(reason);
    await page.getByRole("button", { name: "Request appointment" }).click();

    await expect(page).toHaveURL(/\/appointments/);
    const row = await appointmentRow(page, reason);
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Requested", { exact: true })).toBeVisible();
  });

  test("receptionist confirms it", async ({ page }) => {
    await signIn(page, "receptionist");
    const row = await appointmentRow(page, reason);
    await row.getByRole("button", { name: "Confirm", exact: true }).click();

    await expect(page.getByText("Appointment confirmed")).toBeVisible();
    await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("patient sees it confirmed", async ({ page }) => {
    await signIn(page, "patient");
    const row = await appointmentRow(page, reason);
    await expect(row.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("receptionist cancels it", async ({ page }) => {
    await signIn(page, "receptionist");
    const row = await appointmentRow(page, reason);
    await row.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Cancel appointment" }).click();

    await expect(page.getByText("Appointment cancelled")).toBeVisible();
    await expect(row.getByText("Cancelled", { exact: true })).toBeVisible();
  });
});
