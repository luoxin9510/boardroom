import { typeOf, type Pack, type PackFile } from "./pack";

/**
 * The original test cards (fixtures/), built into the app so anyone can try it without a content pack,
 * and so the e2e tests have content. They are invented and safe to publish.
 */
const ROOT = "../../../fixtures/";
const notes = import.meta.glob("../../../fixtures/*/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const images = import.meta.glob("../../../fixtures/*/**/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** The test content of one game (fixtures/<game>/). */
export async function demoPack(game: string): Promise<Pack> {
  const files = new Map<string, PackFile>();
  const enc = new TextEncoder();
  const prefix = `${ROOT}${game}/`;
  for (const [p, text] of Object.entries(notes)) if (p.startsWith(prefix)) files.set(p.slice(prefix.length), { type: "text/markdown", data: enc.encode(text) });
  for (const [p, url] of Object.entries(images)) {
    if (!p.startsWith(prefix)) continue;
    const path = p.slice(prefix.length);
    files.set(path, { type: typeOf(path), data: new Uint8Array(await (await fetch(url)).arrayBuffer()) });
  }
  return { game, files };
}
