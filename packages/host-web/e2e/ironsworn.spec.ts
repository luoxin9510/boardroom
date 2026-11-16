import { expect, test, type Page } from "@playwright/test";

/** Opens the Ironsworn test content and starts a campaign. Each test has fresh storage. */
async function start(page: Page, name = "艾拉") {
  await page.getByTestId("demo-ironsworn").tap();
  await page.getByTestId("intro-ok").tap();
  await page.getByTestId("new-name").fill(name);
  await page.getByTestId("new-campaign").tap();
  // A new campaign opens the character wizard; these tests set up what they need themselves.
  await page.getByTestId("wiz-skip").tap();
  await expect(page.getByTestId("meters")).toBeVisible();
}

/** Rolls a move with physical dice typed in. */
async function rollWith(page: Page, move: string, dice: Partial<Record<"d6" | "c1" | "c2", number>>) {
  await page.getByTestId("nav-moves").tap();
  await page.getByTestId(`move-${move}`).tap();
  await page.getByTestId("manual-dice").check();
  for (const [k, v] of Object.entries(dice)) await page.getByTestId(`dice-${k}`).fill(String(v));
  await page.getByTestId("roll").tap();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./?lang=zh-CN");
});

test("roll a move, take the consequence, undo, and continue after reload", async ({ page }) => {
  await start(page);
  await rollWith(page, "probe", { d6: 6, c1: 1, c2: 2 });
  await expect(page.getByTestId("outcome")).toHaveText("强成功");
  await page.getByTestId("res-strong-apply").tap();
  await expect(page.getByTestId("meter-momentum")).toContainText("+4");
  await page.getByTestId("done").tap();
  await page.getByTestId("undo").tap();
  await page.getByTestId("undo").tap();
  await expect(page.getByTestId("meter-momentum")).toContainText("+2");
  // Undo stepped back past "done" and the consequence: the roll is waiting for a choice again.
  await page.getByTestId("pending").tap();
  await expect(page.getByTestId("res-strong-apply")).toBeEnabled();
  await page.getByTestId("done").tap();
  await page.reload();
  await page.getByTestId("demo-ironsworn").tap();
  await expect(page.getByTestId("campaign")).toHaveCount(1);
  await page.getByTestId("continue").tap();
  await page.getByTestId("nav-journal").tap();
  await expect(page.getByTestId("tab-journal")).toContainText("试探 +锋锐");
});

test("swear a vow, mark progress, roll it and earn experience", async ({ page }) => {
  await start(page);
  await page.getByTestId("nav-tracks").tap();
  await page.getByTestId("new-track").tap();
  await page.getByTestId("track-name").fill("找回钥匙");
  await page.getByTestId("rank-dangerous").tap();
  await page.getByTestId("create-track").tap();
  for (let i = 0; i < 4; i++) await page.getByTestId("mark-t1").tap();
  await expect(page.getByTestId("track-t1")).toContainText("8/10");
  await page.getByTestId("roll-t1").tap();
  await page.getByTestId("manual-dice").check();
  await page.getByTestId("dice-c1").fill("3");
  await page.getByTestId("dice-c2").fill("3");
  await page.getByTestId("roll").tap();
  await expect(page.getByTestId("outcome")).toContainText("强成功 · 转折");
  await page.getByTestId("res-strong-apply").tap();
  await page.getByTestId("done").tap();
  await page.getByTestId("fulfill-t1").tap();
  await expect(page.getByTestId("track-t1")).toContainText("已完成");
  await page.getByTestId("nav-character").tap();
  await expect(page.getByTestId("tab-character")).toContainText("共 2");
});

test("harm before the roll, a choice on a miss, and the debility it marks", async ({ page }) => {
  await start(page);
  await page.getByTestId("nav-moves").tap();
  await page.getByTestId("move-hold-fast").tap();
  await page.getByTestId("before-apply").tap();
  await expect(page.getByTestId("meter-health")).toContainText("4");
  await page.getByTestId("manual-dice").check();
  await page.getByTestId("dice-d6").fill("1");
  await page.getByTestId("dice-c1").fill("9");
  await page.getByTestId("dice-c2").fill("10");
  await page.getByTestId("roll").tap();
  await expect(page.getByTestId("outcome")).toHaveText("失败");
  await expect(page.getByTestId("res-miss-apply")).toBeDisabled();
  await page.getByTestId("res-miss-opt-0").tap();
  await page.getByTestId("res-miss-apply").tap();
  await expect(page.getByTestId("meter-momentum")).toContainText("1");
  await page.getByTestId("done").tap();
  await page.getByTestId("nav-character").tap();
  await expect(page.getByTestId("deb-wounded")).toHaveClass(/is-on/);
});

test("ask the oracle, roll a table, write in the journal and export it", async ({ page }) => {
  await start(page);
  await page.getByTestId("nav-oracles").tap();
  await page.getByTestId("ask-fiftyFifty").tap();
  await expect(page.getByTestId("oracle-result")).toContainText(/是|否/);
  await page.getByTestId("oracle-spark").tap();
  await expect(page.getByTestId("oracle-result")).toContainText("灵感");
  await page.getByTestId("nav-journal").tap();
  await page.getByTestId("note-text").fill("雨夜，艾拉在沼泽边立下誓言。");
  await page.getByTestId("note-add").tap();
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
  await page.getByTestId("export").tap();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: { name: string } }).shared?.name)).toMatch(/铁誓 艾拉\.md$/);
  const text = await page.evaluate(() => (window as unknown as { shared: { text: string } }).shared.text);
  expect(text).toContain("# 艾拉");
  expect(text).toContain("雨夜，艾拉在沼泽边立下誓言。");
  expect(text).toMatch(/- 问先知（五五开）\d+：/);
  expect(text).toMatch(/- 灵感（\d）：/);
});

test("rules page, assets, no sideways scroll, and deleting a campaign", async ({ page }) => {
  await start(page);
  await page.getByTestId("nav-character").tap();
  await page.getByTestId("add-asset").tap();
  await page.getByTestId("pick-lantern-moth").tap();
  await expect(page.getByTestId("asset-lantern-moth")).toBeVisible();
  for (const tab of ["character", "moves", "tracks", "oracles", "journal"]) {
    await page.getByTestId(`nav-${tab}`).tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  }
  await page.getByTestId("menu").tap();
  await page.getByTestId("menu-rules").tap();
  await expect(page.getByTestId("rules")).toContainText("测试内容 · 规则简介");
  await page.getByTestId("rules-close").tap();
  await page.getByTestId("back").tap();
  await page.getByTestId("delete-campaign").tap();
  await page.getByTestId("delete-campaign").tap();
  await expect(page.getByTestId("campaign")).toHaveCount(0);
});

test("raise harm and use an asset ability after the roll, marking the combat track", async ({ page }) => {
  await start(page);
  await page.getByTestId("nav-character").tap();
  await page.getByTestId("add-asset").tap();
  await page.getByTestId("pick-lantern-moth").tap();
  await page.getByTestId("nav-tracks").tap();
  await page.getByTestId("new-track").tap();
  await page.getByTestId("kind-vow").tap();
  await page.getByTestId("track-name").fill("誓言");
  await page.getByTestId("create-track").tap();
  await page.getByTestId("new-track").tap();
  await page.getByTestId("kind-combat").tap();
  await page.getByTestId("track-name").fill("野狼");
  await page.getByTestId("rank-formidable").tap();
  await page.getByTestId("create-track").tap();
  await rollWith(page, "hit", { d6: 6, c1: 1, c2: 1 });
  await page.getByTestId("harm-up").tap();
  await expect(page.getByTestId("harm")).toContainText("伤害 2");
  // Only the combat track is offered, though a vow is open too.
  await expect(page.getByTestId("res-strong-track")).toContainText("野狼");
  await page.getByTestId("res-strong-apply").tap();
  await expect(page.getByTestId("harm-up")).toBeDisabled();
  await page.getByTestId("done").tap();
  await page.getByTestId("nav-tracks").tap();
  await expect(page.getByTestId("track-t2")).toContainText("2/10");
  await expect(page.getByTestId("track-t1")).toContainText("0/10");
});

test("a consequence can't be taken twice by closing and reopening the roll", async ({ page }) => {
  await start(page);
  await rollWith(page, "probe", { d6: 6, c1: 1, c2: 2 });
  await page.getByTestId("res-strong-apply").tap();
  await page.locator(".br-sheet-backdrop").click({ position: { x: 10, y: 10 } });
  await page.getByTestId("pending").tap();
  await expect(page.getByTestId("res-strong-apply")).toBeDisabled();
  await expect(page.getByTestId("meter-momentum")).toContainText("+4");
});

test("Ironsworn works offline once loaded", async ({ page, context }) => {
  await expect(page.getByTestId("offline-ready")).toBeVisible({ timeout: 15_000 });
  await context.setOffline(true);
  await page.reload();
  await start(page);
  await page.getByTestId("nav-oracles").tap();
  await page.getByTestId("ask-likely").tap();
  await expect(page.getByTestId("oracle-result")).toBeVisible();
});

test("story options, a bonus on the next roll, and recommitting to a vow", async ({ page }) => {
  await start(page);
  await rollWith(page, "befriend", { d6: 6, c1: 1, c2: 10 });
  await expect(page.getByTestId("outcome")).toHaveText("弱成功");
  await page.getByTestId("res-weak-opt-0").tap();
  await page.getByTestId("res-weak-apply").tap();
  await page.getByTestId("done").tap();
  await page.getByTestId("move-probe").tap();
  await expect(page.getByTestId("bonus")).toContainText("+1");
  await page.locator(".br-sheet-backdrop").click({ position: { x: 10, y: 10 } });
  await page.getByTestId("nav-tracks").tap();
  await page.getByTestId("new-track").tap();
  await page.getByTestId("track-name").fill("护送");
  await page.getByTestId("rank-extreme").tap();
  await page.getByTestId("create-track").tap();
  for (let i = 0; i < 5; i++) await page.getByTestId("mark-t1").tap();
  await page.getByTestId("roll-t1").tap();
  await page.getByTestId("manual-dice").check();
  await page.getByTestId("dice-c1").fill("9");
  await page.getByTestId("dice-c2").fill("10");
  await page.getByTestId("roll").tap();
  await expect(page.getByTestId("outcome")).toHaveText("失败");
  await page.getByTestId("res-miss-opt-0").tap();
  await page.getByTestId("res-miss-apply").tap();
  await page.getByTestId("done").tap();
  await expect(page.getByTestId("track-t1")).toContainText("史诗");
  await expect(page.getByTestId("track-t1")).toContainText("1/10");
});

test("first visit: how to play, then create a character with the wizard", async ({ page }) => {
  await page.getByTestId("demo-ironsworn").tap();
  await expect(page.getByTestId("intro")).toBeVisible();
  await page.getByTestId("intro-ok").tap();
  await page.getByTestId("new-name").fill("卡拉");
  await page.getByTestId("new-campaign").tap();
  // 1 world truths: pick one, roll another
  await expect(page.getByTestId("wiz-truths")).toBeVisible();
  await page.getByTestId("truth-old-age-1").tap();
  await expect(page.getByTestId("truth-old-age")).toContainText("找到解药的配方");
  await page.getByTestId("wiz-next").tap();
  // 2 stats 3/2/2/1/1
  for (const [s, v] of [["iron", 3], ["edge", 2], ["heart", 2], ["wits", 1], ["shadow", 1]] as const) {
    await page.getByTestId(`wiz-stat-${s}`).tap();
    await page.getByTestId(`wiz-value-${v}`).tap();
  }
  await expect(page.getByTestId("wiz-stat-iron")).toContainText("3");
  await expect(page.locator('[data-testid^="wiz-value-"]')).toHaveCount(0);
  await page.getByTestId("wiz-next").tap();
  // 3 assets: free
  await page.getByTestId("wiz-add-asset").tap();
  await page.getByTestId("pick-lantern-moth").tap();
  await expect(page.getByTestId("wiz-assets")).toContainText("1/3");
  // the rules link from a step opens the right section, and closing it comes back to the wizard
  await page.getByTestId("wiz-rules").tap();
  await expect(page.getByTestId("rules")).toContainText("建角时免费选三张资源");
  await page.getByTestId("rules-close").tap();
  await page.getByTestId("wiz-next").tap();
  // 4 bonds
  await page.getByTestId("wiz-bonds").locator("button").filter({ hasText: "+" }).first().tap();
  await page.getByTestId("wiz-next").tap();
  // 5 background vow
  await page.getByTestId("wiz-vow-name").fill("为故乡复仇");
  await page.getByTestId("wiz-vow-create").tap();
  await expect(page.getByTestId("wiz-vow-made")).toBeVisible();
  await page.getByTestId("wiz-next").tap();
  // 6 inciting incident, then go swear it
  await page.getByTestId("wiz-vow-name").fill("护送信使过沼泽");
  await page.getByTestId("wiz-vow-create").tap();
  await page.getByTestId("wiz-swear").tap();
  await expect(page.getByTestId("move-sheet")).toBeVisible();
  await page.locator(".br-sheet-backdrop").click({ position: { x: 10, y: 10 } });
  await page.getByTestId("nav-character").tap();
  await expect(page.getByTestId("stat-iron")).toContainText("3");
  await expect(page.getByTestId("asset-lantern-moth")).toBeVisible();
  await page.getByTestId("char-truths").locator("summary").tap();
  await expect(page.getByTestId("char-truths")).toContainText("疫病");
  await page.getByTestId("nav-tracks").tap();
  await expect(page.getByTestId("tab-tracks")).toContainText("为故乡复仇");
  await expect(page.getByTestId("tab-tracks")).toContainText("史诗");
  await page.getByTestId("nav-journal").tap();
  await expect(page.getByTestId("tab-journal")).toContainText("世界真相「旧时代」");
  // reopening the app doesn't show the how-to-play again
  await page.reload();
  await page.getByTestId("demo-ironsworn").tap();
  await expect(page.getByTestId("campaigns")).toBeVisible();
  await expect(page.getByTestId("intro")).toHaveCount(0);
});

test("a move links to its rules section", async ({ page }) => {
  await start(page);
  await page.getByTestId("move-hit").tap();
  await page.getByTestId("move-rules").tap();
  await expect(page.getByTestId("rules")).toBeVisible();
});
