// Throwaway probe for Obsidian mobile: can a plugin view feel like a game screen?
// Tests: hiding Obsidian chrome, horizontal swipe vs. sidebar gestures, screen wake lock,
// vault images and writes. Results are saved to a note so they sync back over iCloud.
const { Plugin, ItemView, Platform, apiVersion, Notice } = require("obsidian");

const VIEW = "boardroom-spike";
const IMMERSIVE = "boardroom-immersive";
const RESULT_NOTE = "boardroom-spike-结果.md";
const TEST_IMAGE = "卡牌/图/隧道卡1-A.jpg";

class SpikeView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.log = [];
    this.wake = null;
    this.blockGestures = false;
    this.answers = {};
  }
  getViewType() { return VIEW; }
  getDisplayText() { return "Boardroom 手机测试"; }
  getIcon() { return "dice"; }

  note(line) {
    const t = new Date().toLocaleTimeString();
    this.log.push(`${t} ${line}`);
    if (this.logEl) this.logEl.setText(this.log.slice(-12).join("\n"));
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("bs-root");

    root.createEl("h3", { text: "Boardroom 手机测试" });
    root.createEl("p", { cls: "bs-hint", text: "按顺序点下面的按钮试一遍，最后点「保存结果」。" });

    // 1. immersive toggle
    const row1 = root.createDiv({ cls: "bs-row" });
    const imm = row1.createEl("button", { text: "1. 沉浸模式：关" });
    imm.onclick = () => {
      const on = !document.body.hasClass(IMMERSIVE);
      document.body.toggleClass(IMMERSIVE, on);
      imm.setText(`1. 沉浸模式：${on ? "开" : "关"}`);
      this.note(`沉浸模式 ${on ? "开" : "关"}`);
    };

    // 2. gesture blocking toggle
    const gest = row1.createEl("button", { text: "2. 拦截手势：关" });
    gest.onclick = () => {
      this.blockGestures = !this.blockGestures;
      gest.setText(`2. 拦截手势：${this.blockGestures ? "开" : "关"}`);
      this.note(`拦截手势 ${this.blockGestures ? "开" : "关"}`);
    };
    const stop = (e) => { if (this.blockGestures) e.stopPropagation(); };
    for (const ev of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove"]) {
      root.addEventListener(ev, stop, { passive: true });
    }

    // horizontal track
    root.createEl("p", { cls: "bs-hint", text: "左右滑动下面这条隧道：有没有误拉出侧栏？分别在拦截手势开和关时各试一次。点一个格子会高亮。" });
    const track = root.createDiv({ cls: "bs-track" });
    const img = this.imageUrl();
    for (let i = 1; i <= 24; i++) {
      const cell = track.createDiv({ cls: "bs-cell" });
      if (img && i % 4 === 1) cell.style.backgroundImage = `url("${img}")`;
      cell.createSpan({ text: String(i) });
      cell.onclick = () => {
        track.querySelectorAll(".bs-cell.is-on").forEach((c) => c.removeClass("is-on"));
        cell.addClass("is-on");
        this.note(`点了第 ${i} 格`);
      };
    }
    this.note(img ? "卡图读取成功" : `没找到卡图 ${TEST_IMAGE}`);

    // 3. wake lock
    const row3 = root.createDiv({ cls: "bs-row" });
    const wake = row3.createEl("button", { text: "3. 屏幕常亮" });
    wake.onclick = async () => {
      if (!("wakeLock" in navigator)) { this.note("屏幕常亮：不支持（没有 navigator.wakeLock）"); return; }
      try {
        this.wake = await navigator.wakeLock.request("screen");
        this.note("屏幕常亮：已开启。放着别动，看 1–2 分钟后会不会自动锁屏");
      } catch (e) { this.note(`屏幕常亮：失败 ${e && e.name}`); }
    };

    // 4. questions for the human
    root.createEl("p", { cls: "bs-hint", text: "4. 看完后回答（点选）：" });
    this.ask(root, "chrome", "沉浸模式开时，顶栏和底部导航栏消失了吗？", ["都消失了", "只消失一个", "都没消失"]);
    this.ask(root, "swipeOff", "拦截手势关时，横滑隧道会拉出侧栏吗？", ["不会", "偶尔会", "经常会"]);
    this.ask(root, "swipeOn", "拦截手势开时，横滑隧道会拉出侧栏吗？", ["不会", "偶尔会", "经常会"]);
    this.ask(root, "pull", "在页面顶部往下拉，会弹出命令面板吗？", ["不会", "会"]);
    this.ask(root, "wake", "开了屏幕常亮后，屏幕自动锁了吗？", ["没锁", "锁了", "没测"]);
    this.ask(root, "feel", "整体手感？", ["顺滑", "还行", "卡顿"]);

    // 5. save
    const row5 = root.createDiv({ cls: "bs-row" });
    const save = row5.createEl("button", { cls: "mod-cta", text: "5. 保存结果" });
    save.onclick = () => this.save();

    this.logEl = root.createEl("pre", { cls: "bs-log" });
    this.note("视图已打开");
  }

  ask(root, key, q, options) {
    const box = root.createDiv({ cls: "bs-q" });
    box.createDiv({ text: q });
    const row = box.createDiv({ cls: "bs-row" });
    for (const o of options) {
      const b = row.createEl("button", { text: o });
      b.onclick = () => {
        this.answers[key] = o;
        row.querySelectorAll("button").forEach((x) => x.removeClass("is-on"));
        b.addClass("is-on");
      };
    }
  }

  imageUrl() {
    const f = this.app.vault.getAbstractFileByPath(TEST_IMAGE);
    return f ? this.app.vault.getResourcePath(f) : null;
  }

  probe() {
    const css = getComputedStyle(document.documentElement);
    const probeEl = document.body.createDiv({ cls: "bs-safe" });
    const s = getComputedStyle(probeEl);
    const safe = `top ${s.paddingTop} / right ${s.paddingRight} / bottom ${s.paddingBottom} / left ${s.paddingLeft}`;
    probeEl.remove();
    let webgl = false;
    try { webgl = !!document.createElement("canvas").getContext("webgl2"); } catch (e) { /* none */ }
    return {
      "Obsidian API": apiVersion,
      "平台": [Platform.isIosApp && "iOS", Platform.isAndroidApp && "Android", Platform.isPhone && "phone",
        Platform.isTablet && "tablet", Platform.isDesktopApp && "desktop"].filter(Boolean).join(", "),
      "UA": navigator.userAgent,
      "视口": `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
      "视图区": `${this.contentEl.clientWidth}×${this.contentEl.clientHeight}`,
      "安全区": safe,
      "wakeLock": "wakeLock" in navigator,
      "vibrate": "vibrate" in navigator,
      "WebGL2": webgl,
      "语言": navigator.language,
      "字体缩放": css.getPropertyValue("--font-text-size") || "-",
    };
  }

  async save() {
    const p = this.probe();
    const lines = ["# Boardroom 手机测试结果", "", `时间：${new Date().toISOString()}`, "", "## 设备", ""];
    for (const [k, v] of Object.entries(p)) lines.push(`- ${k}：${v}`);
    lines.push("", "## 回答", "");
    for (const [k, v] of Object.entries(this.answers)) lines.push(`- ${k}：${v}`);
    lines.push("", "## 日志", "", "```", ...this.log, "```", "");
    const text = lines.join("\n");
    const name = Platform.isMobile ? RESULT_NOTE : RESULT_NOTE.replace(".md", "（电脑）.md");
    const existing = this.app.vault.getAbstractFileByPath(name);
    if (existing) await this.app.vault.modify(existing, text);
    else await this.app.vault.create(name, text);
    new Notice(`已保存到 ${name}`);
    this.note(`已保存到 ${name}`);
  }

  async onClose() {
    document.body.removeClass(IMMERSIVE);
    if (this.wake) { try { await this.wake.release(); } catch (e) { /* ignore */ } }
  }
}

module.exports = class BoardroomSpike extends Plugin {
  async onload() {
    this.registerView(VIEW, (leaf) => new SpikeView(leaf, this));
    this.addCommand({ id: "open", name: "打开手机测试", callback: () => this.open() });
    this.addRibbonIcon("dice", "Boardroom 手机测试", () => this.open());
  }
  async open() {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  onunload() { document.body.removeClass(IMMERSIVE); }
};
