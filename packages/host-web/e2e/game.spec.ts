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
  // A location with an action opens a sheet; undo works from inside it too.
  await expect(page.getByTestId("undo")).toBeEnabled(); // the move went through (the sheet, if any, renders with it)
  if (await page.getByTestId("done").isVisible()) {
    await page.getByTestId("sheet-undo").tap();
    await expect(page.getByTestId("done")).toBeHidden();
    await page.locator(".gm-tray .gm-die:not(.is-dim)").first().tap();
    await page.locator(".gm-slot.is-glow").first().tap();
    await page.getByTestId("done").tap();
  }
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("menu").tap();
  await page.getByTestId("lang").tap();
  await expect(page.getByTestId("hint")).toContainText(/die|Goblin|move/i);
  await page.getByTestId("sheet").tap({ position: { x: 20, y: 20 } }); // tap the backdrop to close the menu
  await expect(page.getByTestId("sheet")).toBeHidden();
  await page.reload();
  await page.getByTestId("continue").tap();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("undo").tap();
  // Undo goes one step at a time: undoing "skip" reopens the action sheet, which has its own undo for the move.
  if (await page.getByTestId("sheet-undo").isVisible()) await page.getByTestId("sheet-undo").tap();
  // Back to the very start: every die at the entrance again.
  await expect(page.locator(".gm-entrance .gm-chip")).toHaveCount(4);
  await expect(page.getByTestId("undo")).toBeDisabled();
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
