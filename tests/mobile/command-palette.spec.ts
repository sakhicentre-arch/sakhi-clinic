import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, navigateTo } from "../testUtils";

test.describe("Command palette (mobile)", () => {
  test.setTimeout(90000);

  test("opens from bottom nav and finds patients", async ({ page }) => {
    await page.goto("/");
    await assertNoHorizontalOverflow(page);

    await navigateTo(page, "Patients");

    await page.fill('[data-testid="patient-name-input"]', "Palette Test Patient");
    await page.fill('[data-testid="patient-age-input"]', "34");
    await page.selectOption('[data-testid="patient-gender-select"]', { label: "Male" });
    await page.fill('[data-testid="patient-phone-input"]', "9999912345");
    await page.click('[data-testid="save-patient-btn"]');

    await page.waitForTimeout(300);

    await page.click('[data-testid="bottom-nav-more-button"]');
    const palette = page.locator('[data-testid="command-palette"]');
    await expect(palette).toBeVisible({ timeout: 10000 });

    const input = palette.locator('input[placeholder^="Search patients"]');
    await input.fill("Palette Test");

    await expect(palette.getByText("Palette Test Patient")).toBeVisible({ timeout: 10000 });
    await palette.getByText("Palette Test Patient").first().click();

    await expect(palette).toBeHidden({ timeout: 10000 });
    await assertNoHorizontalOverflow(page);
  });
});

