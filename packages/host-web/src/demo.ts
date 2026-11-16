import { typeOf, type Pack, type PackFile } from "./pack";

/**
 * The original test cards (fixtures/), built into the app so anyone can try it without a content pack,
 * and so the e2e tests have content. They are invented and safe to publish.
 */
const ROOT = "../../../fixtures/goblin-mountain/";
const notes = import.meta.glob("../../../fixtures/goblin-mountain/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const images = import.meta.glob("../../../fixtures/goblin-mountain/**/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export async function demoPack(): Promise<Pack> {
  const files = new Map<string, PackFile>();
  const enc = new TextEncoder();
  for (const [p, text] of Object.entries(notes)) files.set(p.slice(ROOT.length), { type: "text/markdown", data: enc.encode(text) });
  for (const [p, url] of Object.entries(images)) {
    const path = p.slice(ROOT.length);
    files.set(path, { type: typeOf(path), data: new Uint8Array(await (await fetch(url)).arrayBuffer()) });
  }
  return { game: "goblin-mountain", files };
}
