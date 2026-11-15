import { expect, test, type Page } from "@playwright/test";

/** Plays legal moves until the game ends: always the first usable die and its first target, doing every action. */
async function playToEnd(page: Page) {
  for (let i = 0; i < 300; i++) {
    if (await page.getByTestId("over").isVisible()) return;
    const hit = page.locator('[data-testid^="hit-"]').first();
    if (await hit.isVisible()) { await hit.tap(); continue; }
    const act = page.getByTestId("act");
    if (await act.isVisible()) {
      if (await act.isEnabled()) await act.tap();
      if (await page.getByTestId("done").isVisible()) await page.getByTestId("done").tap();
      continue;
    }
    const option = page.getByTestId("act-1");
    if (await option.isVisible()) {
      if (await option.isEnabled()) await option.tap();
      if (await page.getByTestId("done").isVisible()) await page.getByTestId("done").tap();
      continue;
    }
    if (await page.getByTestId("pass").isVisible()) { await page.getByTestId("pass").tap(); continue; }
    const die = page.locator(".gm-tray .gm-die:not(.is-dim)").first();
    await die.tap();
    await page.locator(".gm-slot.is-glow").first().tap();
  }
  throw new Error("game did not end");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?lang=zh-CN");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("plays a whole game in Chinese and writes the record", async ({ page }) => {
  await page.getByTestId("new-normal").tap();
  await expect(page.getByTestId("hint")).toContainText("开局前");
  await playToEnd(page);
  await expect(page.getByTestId("over")).toBeVisible();
  const won = await page.getByTestId("total").isVisible();
  if (won) await expect(page.getByTestId("total")).toHaveText(/-?\d+/);
  await page.getByTestId("record").tap();
  await expect(page.getByTestId("over")).toContainText("已写入 对局/");
  const files = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("vault:对局/")));
  expect(files.some((f) => f.endsWith(".md"))).toBe(true);
});

test("undo, language switch, and continue after reload", async ({ page }) => {
  await page.getByTestId("new-hard").tap();
  await page.locator(".gm-tray .gm-die:not(.is-dim)").first().tap();
  await page.locator(".gm-slot.is-glow").first().tap();
  if (await page.getByTestId("done").isVisible()) await page.getByTestId("done").tap();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("menu").tap();
  await page.getByTestId("lang").tap();
  await expect(page.getByTestId("hint")).toContainText(/die|Goblin|move/i);
  await page.mouse.click(10, 10); // close the menu sheet
  await page.reload();
  await page.getByTestId("continue").tap();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("undo").tap();
  await page.getByTestId("undo").tap().catch(() => {});
  await expect(page.locator(".gm-tray .gm-die-status").first()).toBeVisible();
});

test("nothing scrolls the page sideways and the tray stays on screen", async ({ page }) => {
  await page.getByTestId("new-normal").tap();
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW).toBe(clientW);
  const box = await page.getByTestId("die-black").boundingBox();
  const vh = page.viewportSize()?.height ?? 0;
  expect(box && box.y + box.height).toBeLessThanOrEqual(vh);
  await page.screenshot({ path: `test-results/board-${page.viewportSize()?.width}.png` });
});
