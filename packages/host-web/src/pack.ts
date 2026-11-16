import { strFromU8, unzipSync } from "fflate";
import { ContentError } from "@boardroom/core";
import { GAMES } from "./games";
import * as store from "./store";

/** One file of a pack. Kept as bytes (not Blobs) so importing makes few copies and WebKit can store it. */
export interface PackFile {
  type: string;
  data: Uint8Array;
}

/** A content pack in memory: the game it is for and its files by path (卡牌/A.md, 卡牌/图/x.jpg, 规则/…). */
export interface Pack {
  game: string;
  files: Map<string, PackFile>;
}

export interface PackInfo {
  game: string;
  importedAt: string;
  files: number;
  bytes: number;
}

const TYPES: Record<string, string> = { md: "text/markdown", json: "application/json", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
export const typeOf = (path: string) => TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export class PackError extends Error {}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Zip tools that don't mark names as UTF-8 (Finder's "Compress" among them) make fflate read them as
 * Latin-1, so 卡牌 comes out garbled. If a name's Latin-1 bytes are valid UTF-8, use that reading.
 */
export function fixName(name: string): string {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  try {
    return utf8.decode(Uint8Array.from(name, (c) => c.charCodeAt(0)));
  } catch {
    return name;
  }
}

/**
 * Reads a content pack zip: made by `npm run pack`, or a vault folder zipped in Finder (which adds a top
 * folder and __MACOSX). The folder holding boardroom.json becomes the root.
 */
export function readZip(data: Uint8Array): Pack {
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(data, { filter: (f) => !f.name.endsWith("/") && !f.name.split("/").some((seg) => seg.startsWith(".") || seg === "__MACOSX") });
  } catch {
    throw new PackError("not a zip file");
  }
  const named = new Map(Object.entries(raw).map(([name, bytes]) => [fixName(name), bytes]));
  const config = [...named.keys()].filter((p) => p.split("/").pop() === "boardroom.json").sort((a, b) => a.length - b.length)[0];
  if (!config) throw new PackError("no boardroom.json in the zip");
  const root = config.slice(0, -"boardroom.json".length);
  let game: unknown;
  try {
    game = (JSON.parse(strFromU8(named.get(config) as Uint8Array)) as { game?: unknown }).game;
  } catch {
    throw new PackError("boardroom.json is not valid JSON");
  }
  if (typeof game !== "string" || !GAMES[game]) throw new PackError(`unknown game "${String(game)}" in boardroom.json`);
  const files = new Map<string, PackFile>();
  for (const [p, bytes] of named) {
    if (!p.startsWith(root) || p === config) continue;
    const path = p.slice(root.length);
    files.set(path, { type: typeOf(path), data: bytes });
  }
  return { game, files };
}

/** The markdown notes of a pack, for the game's parser. */
export function notesOf(pack: Pack): { path: string; text: string }[] {
  const dec = new TextDecoder();
  return [...pack.files].filter(([path]) => path.endsWith(".md")).map(([path, f]) => ({ path, text: dec.decode(f.data) }));
}

/** Checks the pack with the game's own parser, then replaces any earlier pack for that game, all or nothing. */
export async function importPack(pack: Pack): Promise<PackInfo> {
  const def = GAMES[pack.game];
  if (!def) throw new PackError(`unknown game "${pack.game}"`);
  try {
    def.check(notesOf(pack));
  } catch (e) {
    if (e instanceof ContentError) throw new PackError(e.message);
    throw e;
  }
  let bytes = 0;
  const items: [string, PackFile][] = [];
  for (const [path, f] of pack.files) {
    bytes += f.data.byteLength;
    items.push([`${pack.game}/${path}`, f]);
  }
  const info: PackInfo = { game: pack.game, importedAt: new Date().toISOString(), files: pack.files.size, bytes };
  await store.replacePack(pack.game, items, info);
  return info;
}

export async function loadPack(game: string): Promise<Pack> {
  const files = new Map<string, PackFile>();
  for (const [key, f] of await store.entries<PackFile>("content", `${game}/`)) files.set(key.slice(game.length + 1), f);
  return { game, files };
}

export async function listPacks(): Promise<PackInfo[]> {
  return (await store.entries<PackInfo>("packs", "")).map(([, v]) => v);
}

/** Removes a game's content and its record together. Saves are kept. */
export function deletePack(game: string): Promise<void> {
  return store.replacePack(game, [], null);
}
