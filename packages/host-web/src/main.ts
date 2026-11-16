import type { Host } from "@boardroom/core";
import { mount } from "@boardroom/goblin-mountain/ui";

/**
 * Browser host for development and e2e tests. Content comes from the original fixtures;
 * files the game writes (saves, records) go to localStorage under a "vault:" prefix.
 */
const notes = import.meta.glob("../../../fixtures/goblin-mountain/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const ROOT = "../../../fixtures/goblin-mountain/";
/** Fixture images (original placeholders), so the card-art path is exercised without a vault. */
const images = import.meta.glob("../../../fixtures/goblin-mountain/**/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;
/** Set when the dev server was started with BOARDROOM_VAULT (see vite.config.ts). */
const FROM_VAULT = Boolean(import.meta.env.VITE_VAULT);

const store = {
  get(path: string): string | null {
    try {
      return localStorage.getItem(`vault:${path}`);
    } catch {
      return null;
    }
  },
  set(path: string, text: string) {
    try {
      localStorage.setItem(`vault:${path}`, text);
    } catch {
      /* storage blocked: the game still runs, it just won't remember */
    }
  },
  keys(): string[] {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith("vault:")).map((k) => k.slice(6));
    } catch {
      return [];
    }
  },
};

const host: Host = {
  async readNotes(folder) {
    if (FROM_VAULT) return (await fetch(`/vault-notes?folder=${encodeURIComponent(folder)}`)).json();
    return Object.entries(notes)
      .map(([p, text]) => ({ path: p.slice(ROOT.length), text }))
      .filter((n) => n.path.startsWith(`${folder}/`));
  },
  imageUrl: (path) => (FROM_VAULT ? `/vault-files/${path.split("/").map(encodeURIComponent).join("/")}` : images[ROOT + path] ?? null),
  async readFile(path) {
    return store.get(path);
  },
  async writeFile(path, text) {
    store.set(path, text);
  },
  async listFiles(folder) {
    return store.keys().filter((k) => k.startsWith(`${folder}/`) && !k.slice(folder.length + 1).includes("/"));
  },
  getSetting<V>(key: string) {
    const v = store.get(`.settings/${key}`);
    return v === null ? undefined : (JSON.parse(v) as V);
  },
  async setSetting(key, value) {
    store.set(`.settings/${key}`, JSON.stringify(value));
  },
  locale: () => new URLSearchParams(location.search).get("lang") ?? navigator.language,
  onContentChange: () => () => {},
};

mount(document.getElementById("app") as HTMLElement, host);
