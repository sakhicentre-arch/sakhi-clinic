import { test, expect } from "@playwright/test";
import { assertNoHorizontalOverflow, assertAboveBottomNav, assertMinTapTarget, assertNoOverflowContainers } from "../testUtils";

test.describe("Dashboard operational surface (mobile)", () => {
  test.setTimeout(60000);

  test("primary actions are reachable in first viewport", async ({ page }) => {
    await page.goto("/");
    await assertNoHorizontalOverflow(page);

    // Open mobile drawer nav (TopBar menu) and go to Dashboard
    const openNav = page.getByRole("button", { name: /open navigation/i });
    await openNav.click();
    await page.getByRole("button", { name: "Dashboard" }).click();

    const root = page.locator('[data-testid="dashboard-root"]').first();
    await expect(root).toBeVisible({ timeout: 10000 });

    const actions = page.locator('[data-testid="dashboard-primary-actions"]').first();
    await expect(actions).toBeVisible({ timeout: 10000 });

    const primary = page.locator('[data-testid="dashboard-primary-continue"]').first();
    await expect(primary).toBeVisible({ timeout: 10000 });
    await assertMinTapTarget(primary, 48);
    await assertNoOverflowContainers(page);

    // Ensure the primary action is not clipped under BottomNav.
    await assertAboveBottomNav(page, '[data-testid="dashboard-primary-continue"]');
  });
});
