import { ItemView, Notice, Plugin, TFile, normalizePath, type WorkspaceLeaf } from "obsidian";
import * as obsidian from "obsidian";
import type { Host } from "@boardroom/core";
import { mount } from "@boardroom/goblin-mountain/ui";

const VIEW = "boardroom-game";
const IMMERSIVE = "boardroom-immersive";
const CONFIG = "boardroom.json";
const GAMES: Record<string, (el: HTMLElement, host: Host) => () => void> = { "goblin-mountain": mount };

interface Settings {
  [key: string]: unknown;
}

export default class BoardroomPlugin extends Plugin {
  settings: Settings = {};

  override async onload() {
    this.settings = ((await this.loadData()) as Settings | null) ?? {};
    this.registerView(VIEW, (leaf) => new GameView(leaf, this));
    this.addCommand({ id: "open", name: "Play / 开始游戏", callback: () => void this.open() });
    this.addRibbonIcon("dice", "Boardroom", () => void this.open());
    // Hide Obsidian's chrome only while the game is the active view (tested on iPhone: header, nav bar and toolbar go away).
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => this.setImmersive(leaf?.view.getViewType() === VIEW)));
  }

  override onunload() {
    this.setImmersive(false);
  }

  setImmersive(on: boolean) {
    document.body.toggleClass(IMMERSIVE, on);
  }

  async open() {
    const existing = this.app.workspace.getLeavesOfType(VIEW)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.setImmersive(true);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class GameView extends ItemView {
  private unmount: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: BoardroomPlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return "Boardroom";
  }
  override getIcon() {
    return "dice";
  }

  override async onOpen() {
    const el = this.contentEl;
    el.empty();
    el.addClass("boardroom-view");
    // Swipes inside the game must not open Obsidian's sidebars (they did, often, without this).
    for (const ev of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove"] as const) {
      el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    }
    const game = await this.gameId();
    const mountGame = game ? GAMES[game] : undefined;
    if (!mountGame) {
      el.createEl("p", {
        text: game
          ? `Boardroom: unknown game "${game}" in ${CONFIG}.`
          : `Boardroom: this vault has no ${CONFIG}. Add one with {"game": "goblin-mountain"}.`,
      });
      return;
    }
    const root = el.createDiv({ cls: "boardroom-mount" });
    this.unmount = mountGame(root, this.host());
  }

  override async onClose() {
    this.unmount?.();
    this.unmount = null;
    this.plugin.setImmersive(false);
  }

  private async gameId(): Promise<string | null> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(CONFIG))) return null;
    try {
      return (JSON.parse(await adapter.read(CONFIG)) as { game?: string }).game ?? null;
    } catch {
      new Notice(`Boardroom: ${CONFIG} is not valid JSON`);
      return null;
    }
  }

  private host(): Host {
    const { vault, workspace } = this.app;
    const adapter = vault.adapter;
    const plugin = this.plugin;
    const ensureFolder = async (path: string) => {
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
    };
    return {
      async readNotes(folder) {
        const files = vault.getMarkdownFiles().filter((f) => f.path.startsWith(`${folder}/`));
        return Promise.all(files.map(async (f) => ({ path: f.path, text: await vault.cachedRead(f) })));
      },
      imageUrl(path) {
        const f = vault.getAbstractFileByPath(normalizePath(path));
        return f instanceof TFile ? vault.getResourcePath(f) : null;
      },
      async readFile(path) {
        const p = normalizePath(path);
        return (await adapter.exists(p)) ? adapter.read(p) : null;
      },
      async writeFile(path, text) {
        const p = normalizePath(path);
        await ensureFolder(p);
        const f = vault.getAbstractFileByPath(p);
        if (f instanceof TFile) await vault.modify(f, text);
        else if (p.endsWith(".md")) await vault.create(p, text);
        else await adapter.write(p, text);
      },
      async listFiles(folder) {
        const p = normalizePath(folder);
        if (!(await adapter.exists(p))) return [];
        return (await adapter.list(p)).files;
      },
      getSetting<V>(key: string) {
        return plugin.settings[key] as V | undefined;
      },
      async setSetting(key, value) {
        plugin.settings[key] = value;
        await plugin.saveSettings();
      },
      locale() {
        const get = (obsidian as unknown as { getLanguage?: () => string }).getLanguage;
        return get ? get() : obsidian.moment.locale();
      },
      onContentChange: (cb) => {
        let timer: number | undefined;
        const fire = (file: { path: string }) => {
          if (!file.path.startsWith("卡牌/")) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(cb, 400);
        };
        const refs = [vault.on("modify", fire), vault.on("create", fire), vault.on("delete", fire), vault.on("rename", fire)];
        return () => refs.forEach((r) => vault.offref(r));
      },
      exit: () => {
        this.leaf.detach();
        if (!workspace.getLeavesOfType(VIEW).length) plugin.setImmersive(false);
      },
    };
  }
}
