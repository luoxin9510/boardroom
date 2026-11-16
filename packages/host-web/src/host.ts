import type { Host } from "@boardroom/core";
import { notesOf, type Pack } from "./pack";
import * as store from "./store";

/** Small per-device settings (language). localStorage is fine here: losing them only resets the language. */
export const settings = {
  get<V>(key: string): V | undefined {
    try {
      const v = localStorage.getItem(`boardroom:${key}`);
      return v === null ? undefined : (JSON.parse(v) as V);
    } catch {
      return undefined;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(`boardroom:${key}`, JSON.stringify(value));
    } catch {
      /* private mode or storage blocked: the setting just isn't remembered */
    }
  },
};

export const deviceLocale = () => new URLSearchParams(location.search).get("lang") ?? navigator.language;

/**
 * A Host over an in-memory pack. Files the game writes (saves) go to IndexedDB under `space`,
 * so the test cards and an imported pack keep separate saves.
 */
export function makeHost(pack: Pack, space: string, exit: () => void): { host: Host; dispose: () => void } {
  const urls = new Map<string, string>();
  for (const [path, f] of pack.files) if (f.type.startsWith("image/")) urls.set(path, URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.type })));
  const notes = notesOf(pack);
  const key = (path: string) => `${space}/${path}`;
  const host: Host = {
    async readNotes(folder) {
      return notes.filter((n) => n.path.startsWith(`${folder}/`));
    },
    imageUrl: (path) => urls.get(path) ?? null,
    async readFile(path) {
      return (await store.get<string>("files", key(path))) ?? null;
    },
    async writeFile(path, text) {
      await store.put("files", key(path), text);
    },
    async removeFile(path) {
      await store.remove("files", key(path));
    },
    async listFiles(folder) {
      const prefix = key(`${folder}/`);
      return (await store.entries<string>("files", prefix)).map(([k]) => k.slice(space.length + 1)).filter((p) => !p.slice(folder.length + 1).includes("/"));
    },
    getSetting: (k) => settings.get(k),
    async setSetting(k, v) {
      settings.set(k, v);
    },
    locale: deviceLocale,
    onContentChange: () => () => {},
    exit,
    share: shareText,
  };
  return { host, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}

/**
 * The share sheet where the browser can share files (iPhone), otherwise a download. If sharing is refused
 * (e.g. the tap is too long ago after reading storage), falls back to the download; closing the sheet is not an error.
 */
export async function shareText(name: string, text: string, type: string): Promise<void> {
  const file = new File([text], name, { type });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
