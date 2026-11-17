import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Campaign } from "@boardroom/core";
import { makeEngine, newCampaign, parseContent, type Action, type Event, type State } from "../src";

export const FIXTURES = join(__dirname, "../../../fixtures/ironsworn");

export function fixtureNotes(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (statSync(full).isDirectory()) walk(full);
      else if (f.endsWith(".md") || f.endsWith(".ink")) out.push({ path: relative(FIXTURES, full), text: readFileSync(full, "utf8") });
    }
  };
  walk(FIXTURES);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export const pack = () => parseContent(fixtureNotes());

/** A campaign on the fixture content; `set` tweaks the starting character. */
export function campaign(set: (s: State) => void = () => {}): Campaign<State, Action, Event> {
  const start = newCampaign(7, "Test");
  start.character.stats = { edge: 3, heart: 2, iron: 2, shadow: 1, wits: 1 };
  set(start);
  return new Campaign(makeEngine(pack()), "ironsworn", "c1", "Test", start);
}
