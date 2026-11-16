import { expect, test, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

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

/** Each test gets a fresh browser context, so storage starts empty. Opens the library and starts the test cards. */
async function demo(page: Page) {
  await page.getByTestId("demo").tap();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./?lang=zh-CN");
});

test("plays a whole game in Chinese and exports the record", async ({ page }) => {
  await demo(page);
  await page.getByTestId("new-normal").tap();
  await expect(page.getByTestId("hint")).toContainText("开局前");
  await playToEnd(page);
  await expect(page.getByTestId("over")).toBeVisible();
  const won = await page.getByTestId("total").isVisible();
  if (won) await expect(page.getByTestId("total")).toHaveText(/-?\d+/);
  // On the phone the record goes to the share sheet; here a stand-in share captures the file.
  await page.evaluate(() => {
    const w = window as unknown as { shared?: { name: string; text: string } };
    Object.assign(navigator, {
      canShare: () => true,
      share: async (d: { files: File[] }) => {
        const f = d.files[0] as File;
        w.shared = { name: f.name, text: await f.text() };
      },
    });
  });
  await page.getByTestId("record").tap();
  await expect(page.getByTestId("over")).toContainText("已导出");
  const shared = await page.evaluate(() => (window as unknown as { shared?: { name: string; text: string } }).shared);
  expect(shared?.name).toMatch(/哥布林山脉 .+\.md$/);
  expect(shared?.text).toContain("type: game-record");
});

test("undo, language switch, and continue after reload", async ({ page }) => {
  await demo(page);
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
  await demo(page);
  await page.getByTestId("continue").tap();
  await expect(page.getByTestId("undo")).toBeEnabled();
  await page.getByTestId("undo").tap();
  // Undo goes one step at a time: undoing "skip" reopens the action sheet, which has its own undo for the move.
  if (await page.getByTestId("sheet-undo").isVisible()) await page.getByTestId("sheet-undo").tap();
  // Back to the very start: every die at the entrance again.
  await expect(page.locator(".gm-entrance .gm-chip")).toHaveCount(4);
  await expect(page.getByTestId("undo")).toBeDisabled();
});

test("card art shows for cards that have it, and a broken image falls back to text", async ({ page }) => {
  await demo(page);
  await page.getByTestId("new-normal").tap();
  // Fixture card 1 (sides A/E) has a placeholder image; the other cards have none.
  const art = page.locator(".gm-strip.is-art img");
  await expect(art).toHaveCount(4);
  await expect(page.locator(".gm-strip.is-plain").first()).toBeVisible();
  const height = await art.first().evaluate((img) => (img.parentElement as HTMLElement).getBoundingClientRect().height);
  expect(height).toBeGreaterThan(100);
  await art.first().evaluate((img) => ((img as HTMLImageElement).src = "/missing.png"));
  await expect(art).toHaveCount(0);
});

test("nothing scrolls the page sideways and the tray stays on screen", async ({ page }) => {
  // How far anything sticks out sideways: the page itself, or the scrolling library panel.
  const sideways = () =>
    page.evaluate(() => {
      const over = (el: Element | null) => (el ? el.scrollWidth - el.clientWidth : 0);
      return Math.max(over(document.documentElement), over(document.querySelector(".lib")));
    });
  await expect(page.getByTestId("demo")).toBeVisible();
  expect(await sideways()).toBe(0);
  await page.screenshot({ path: `test-results/library-${page.viewportSize()?.width}.png` });
  await demo(page);
  await page.getByTestId("new-normal").tap();
  const { scrollW, clientW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
  expect(scrollW).toBe(clientW);
  const box = await page.getByTestId("die-black").boundingBox();
  const vh = page.viewportSize()?.height ?? 0;
  expect(box && box.y + box.height).toBeLessThanOrEqual(vh);
  await page.screenshot({ path: `test-results/board-${page.viewportSize()?.width}.png` });
});

/** A content pack zip of the test cards, the way `npm run pack` makes one (optionally inside a top folder, like Finder). */
function fixturePack(top = ""): Buffer {
  const root = fileURLToPath(new URL("../../../fixtures/goblin-mountain", import.meta.url));
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f !== "README.md") files[top + relative(root, full)] = readFileSync(full);
    }
  };
  walk(root);
  if (top) files["__MACOSX/._junk"] = new Uint8Array([0]);
  return Buffer.from(zipSync(files));
}

test("imports a content pack, plays from it, and survives a reload", async ({ page }) => {
  await page.getByTestId("import").setInputFiles({ name: "pack.zip", mimeType: "application/zip", buffer: fixturePack("goblin-mountain/") });
  await expect(page.getByTestId("lib-note")).toContainText("已导入 哥布林山脉");
  await page.reload();
  await page.getByTestId("play-goblin-mountain").tap();
  await page.getByTestId("new-normal").tap();
  await expect(page.locator(".gm-strip.is-art img")).toHaveCount(4);
  // Leave back to the library.
  await page.getByRole("button", { name: "离开" }).first().tap();
  await expect(page.getByTestId("pack-goblin-mountain")).toBeVisible();
});

test("rejects a zip that is not a content pack, with the reason", async ({ page }) => {
  await page.getByTestId("import").setInputFiles({ name: "x.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync({ "a.txt": new Uint8Array([1]) })) });
  await expect(page.getByTestId("lib-note")).toContainText("boardroom.json");
  const bad = zipSync({ "boardroom.json": new TextEncoder().encode('{"game":"goblin-mountain"}'), "卡牌/A.md": new TextEncoder().encode("---\ntype: tunnel\n---\n") });
  await page.getByTestId("import").setInputFiles({ name: "bad.zip", mimeType: "application/zip", buffer: Buffer.from(bad) });
  await expect(page.getByTestId("lib-note")).toContainText("导入失败");
});

test("works offline once loaded", async ({ page, context, browserName }) => {
  await expect(page.getByTestId("offline-ready")).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await demo(page);
  await expect(page.getByTestId("new-normal")).toBeVisible();
  void browserName;
});
