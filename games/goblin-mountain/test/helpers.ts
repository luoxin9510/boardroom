import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseContent, setup, makeEngine, type Action, type ContentPack, type LocationDef, type State, parseRequirement, parseEffects } from "../src";
import type { Color } from "../src/types";

export const FIXTURES = join(__dirname, "../../../fixtures/goblin-mountain");

export function fixtureNotes(): { path: string; text: string }[] {
  const dir = join(FIXTURES, "卡牌");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ path: `卡牌/${f}`, text: readFileSync(join(dir, f), "utf8") }));
}

export const pack: ContentPack = parseContent(fixtureNotes());

/** A location from a one-line spec: "en | req | reward | flags", e.g. "Pool | 蓝≤3 | 名望+2 | ✓". */
export function loc(spec: string, i = 0): LocationDef {
  const [en = "L", req = "", reward = "", flags = ""] = spec.split(/(?<!\\)\|/).map((x) => x.replace(/\\\|/g, "|").trim());
  const r = parseEffects("t", 1, reward);
  return {
    id: `T${i}`, side: "T", index: i, en, zh: en,
    req: parseRequirement("t", 1, req),
    slots: r.effects.length ? [{ cost: r.cost, effects: r.effects }] : [],
    repeatable: flags.includes("✓"),
    passive: r.passive,
  };
}

/** A fresh game whose track is exactly `specs` (special card starting at `specialStart`). */
export function game(specs: string[], specialStart = 1000, seed = 1): State {
  const s = setup(pack, seed, { difficulty: "normal" });
  s.track = specs.map((x, i) => loc(x, i));
  s.specialStart = specialStart;
  return s;
}

const engine = makeEngine(pack);

/** Applies actions in order, returning the final state and every event. */
export function play(state: State, ...actions: Action[]) {
  let s = state;
  const events = [];
  for (const a of actions) {
    const r = engine.apply(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

export const str = (s: State, c: Color) => s.dice[c].strength;
