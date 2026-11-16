import type { Pack } from "./pack";

/**
 * The original test cards (fixtures/), built into the app so anyone can try it without a content pack,
 * and so the e2e tests have content. They are invented and safe to publish.
 */
const ROOT = "../../../fixtures/goblin-mountain/";
const notes = import.meta.glob("../../../fixtures/goblin-mountain/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const images = import.meta.glob("../../../fixtures/goblin-mountain/**/*.png", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export async function demoPack(): Promise<Pack> {
  const files = new Map<string, Blob>();
  for (const [p, text] of Object.entries(notes)) files.set(p.slice(ROOT.length), new Blob([text], { type: "text/markdown" }));
  for (const [p, url] of Object.entries(images)) files.set(p.slice(ROOT.length), await (await fetch(url)).blob());
  return { game: "goblin-mountain", files };
}
