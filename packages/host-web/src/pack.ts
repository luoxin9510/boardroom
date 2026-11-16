import { strFromU8, unzipSync } from "fflate";
import { ContentError } from "@boardroom/core";
import { GAMES } from "./games";
import * as store from "./store";

/** A content pack in memory: the game it is for and its files by path (卡牌/A.md, 卡牌/图/x.jpg, 规则/…). */
export interface Pack {
  game: string;
  files: Map<string, Blob>;
}

export interface PackInfo {
  game: string;
  importedAt: string;
  files: number;
  bytes: number;
}

const TYPES: Record<string, string> = { md: "text/markdown", json: "application/json", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };
const typeOf = (path: string) => TYPES[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export class PackError extends Error {}

interface StoredFile {
  type: string;
  data: ArrayBuffer;
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
  const config = Object.keys(raw)
    .filter((p) => p.split("/").pop() === "boardroom.json")
    .sort((a, b) => a.length - b.length)[0];
  if (!config) throw new PackError("no boardroom.json in the zip");
  const root = config.slice(0, -"boardroom.json".length);
  let game: unknown;
  try {
    game = (JSON.parse(strFromU8(raw[config] as Uint8Array)) as { game?: unknown }).game;
  } catch {
    throw new PackError("boardroom.json is not valid JSON");
  }
  if (typeof game !== "string" || !GAMES[game]) throw new PackError(`unknown game "${String(game)}" in boardroom.json`);
  const files = new Map<string, Blob>();
  for (const [p, bytes] of Object.entries(raw)) {
    if (!p.startsWith(root) || p === config) continue;
    const path = p.slice(root.length);
    files.set(path, new Blob([bytes as BlobPart], { type: typeOf(path) }));
  }
  return { game, files };
}

/** The markdown notes of a pack, for the game's parser. */
export async function notesOf(pack: Pack): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const [path, blob] of pack.files) if (path.endsWith(".md")) out.push({ path, text: await blob.text() });
  return out;
}

/** Checks the pack with the game's own parser, then replaces any earlier pack for that game. */
export async function importPack(pack: Pack): Promise<PackInfo> {
  const def = GAMES[pack.game];
  if (!def) throw new PackError(`unknown game "${pack.game}"`);
  try {
    def.check(await notesOf(pack));
  } catch (e) {
    if (e instanceof ContentError) throw new PackError(e.message);
    throw e;
  }
  let bytes = 0;
  const items: [string, unknown][] = [];
  for (const [path, blob] of pack.files) {
    bytes += blob.size;
    // Stored as bytes, not Blobs: WebKit can't keep Blobs in IndexedDB in private browsing.
    const stored: StoredFile = { type: blob.type, data: await blob.arrayBuffer() };
    items.push([`${pack.game}/${path}`, stored]);
  }
  await store.clear("content", `${pack.game}/`);
  await store.putAll("content", items);
  const info: PackInfo = { game: pack.game, importedAt: new Date().toISOString(), files: pack.files.size, bytes };
  await store.put("packs", pack.game, info);
  return info;
}

export async function loadPack(game: string): Promise<Pack> {
  const files = new Map<string, Blob>();
  for (const [key, f] of await store.entries<StoredFile>("content", `${game}/`)) files.set(key.slice(game.length + 1), new Blob([f.data], { type: f.type }));
  return { game, files };
}

export async function listPacks(): Promise<PackInfo[]> {
  return (await store.entries<PackInfo>("packs", "")).map(([, v]) => v);
}

export async function deletePack(game: string): Promise<void> {
  await store.clear("content", `${game}/`);
  await store.del("packs", game);
}
