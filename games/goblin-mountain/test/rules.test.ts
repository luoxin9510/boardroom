import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ContentError, missingKeys, RuleError } from "@boardroom/core";
import { COLORS, canAct, kingSteps, KING_START, KING_TRACK, makeEngine, messages, parseContent, score, setup, targets, type Action, type State } from "../src";
import { fixtureNotes, game, pack, play, str } from "./helpers";

describe("content", () => {
  it("parses the fixture pack", () => {
    expect(pack.cards).toHaveLength(4);
    expect(pack.cards.every((c) => c.sides.length === 2)).toBe(true);
    expect(pack.specials.map((s) => s.difficulty).sort()).toEqual(["hard", "normal"]);
    expect(pack.village.bonuses).toHaveLength(4);
    const e2 = pack.cards[0]?.sides.find((s) => s.side === "E")?.locations[1];
    expect(e2?.repeatable).toBe(true);
    expect(e2?.slots[0]?.effects[0]).toEqual({ k: "choice", options: [[{ k: "fate", n: 1 }], [{ k: "add", n: 3 }]] });
    const b2 = pack.cards[1]?.sides.find((s) => s.side === "B")?.locations[1];
    expect(b2?.slots[0]).toEqual({ cost: 3, effects: [{ k: "fame", n: 2 }] });
    const a2 = pack.cards[0]?.sides.find((s) => s.side === "A")?.locations[1];
    expect(a2?.slots).toEqual([{ cost: 0, effects: [{ k: "set", n: 5 }] }, { cost: 1, effects: [{ k: "set", n: 4 }] }]);
    expect(a2?.req).toEqual({});
    expect(pack.specials.find((s) => s.side === "S1")?.locations[2]?.passive).toBe("passMinus1");
  });

  it("points at the line of a bad effect", () => {
    const notes = fixtureNotes().map((n) => (n.path.endsWith("/A.md") ? { ...n, text: n.text.replace("宝藏+2", "宝藏加2") } : n));
    try {
      parseContent(notes);
      throw new Error("no error");
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).file).toBe("卡牌/A.md");
      expect((e as ContentError).line).toBe(11);
      expect((e as ContentError).detail).toContain("宝藏加2");
    }
  });

  it("rejects a special card whose insert does not match the card count", () => {
    const notes = fixtureNotes().map((n) => (n.path.endsWith("绳桥.md") ? { ...n, text: n.text.replace("insert: 2/2", "insert: 3/3") } : n));
    expect(() => parseContent(notes)).toThrow(/insert 3\/3/);
  });

  it("changes the hash when content changes", () => {
    const notes = fixtureNotes();
    const changed = notes.map((n) => (n.path.endsWith("/A.md") ? { ...n, text: n.text + "\n" } : n));
    expect(parseContent(changed).hash).not.toBe(pack.hash);
  });
});

describe("setup", () => {
  it("lays out the tunnel with the special card in place", () => {
    const n = setup(pack, 3, { difficulty: "normal" });
    expect(n.track).toHaveLength(20);
    expect(n.specialStart).toBe(8);
    expect(n.layout[2]?.special).toBe(true);
    const h = setup(pack, 3, { difficulty: "hard" });
    expect(h.specialStart).toBe(4);
    expect(h.layout[1]?.side).toBe("S2");
    for (const c of COLORS) {
      expect(n.dice[c]).toEqual({ color: c, strength: 3, pos: { at: "start" } });
      expect(n.stealth[c]).toBe(1);
    }
    expect([n.treasure, n.fame, n.villagers, n.fate, n.supply, n.king]).toEqual([5, 0, 0, 1, 2, 0]);
  });
  it("is the same for the same seed", () => {
    expect(setup(pack, 9, { difficulty: "normal" })).toEqual(setup(pack, 9, { difficulty: "normal" }));
  });
});

describe("moving", () => {
  const track = ["Any", "Blue≤3 | 蓝≤3", "Any2", "Orange≥4 | 橙≥4", "Any3"];
  it("only offers locations ahead of the leading die that the die can use", () => {
    const s = game(track);
    expect(targets(s, "blue")).toEqual([0, 1, 2, 4]);
    expect(targets(s, "orange")).toEqual([0, 2, 4]);
    const { state } = play(s, { t: "move", color: "yellow", to: 2 });
    expect(targets(state, "blue")).toEqual([4]);
    expect(targets(state, "yellow")).toEqual([4]);
  });
  it("rejects an illegal target with a message key", () => {
    expect(() => play(game(track), { t: "move", color: "orange", to: 1 })).toThrow(RuleError);
  });
  it("costs 1 to every die left behind, including dice still at the entrance (Ruling 1)", () => {
    const s = game(["a", "b", "c", "d", "e", "f"]);
    const { state } = play(s, { t: "move", color: "yellow", to: 0 }, { t: "move", color: "orange", to: 2 }, { t: "move", color: "yellow", to: 3 });
    // yellow came from 0: blue and black (entrance) are behind; orange (2) is ahead of 0.
    expect([str(state, "blue"), str(state, "black"), str(state, "orange")]).toEqual([2, 2, 3]);
  });
  it("moving a die from the entrance costs the others nothing", () => {
    const { state } = play(game(["a", "b"]), { t: "move", color: "yellow", to: 1 });
    expect(COLORS.map((c) => str(state, c))).toEqual([3, 3, 3, 3]);
  });
  it("loses 1 passing a −1 location unless a die stands on it", () => {
    const t = ["a", "Leap | | 经过-1", "c", "d"];
    expect(str(play(game(t), { t: "move", color: "yellow", to: 2 }).state, "yellow")).toBe(2);
    const s = game(t);
    s.dice.blue.pos = { at: "track", i: 1 };
    s.dice.blue.strength = 3;
    s.dice.yellow.pos = { at: "track", i: 0 };
    expect(str(play(s, { t: "move", color: "yellow", to: 3 }).state, "yellow")).toBe(3);
  });
  it("captures a die that drops to 0 and removes its stealth die", () => {
    const s = game(["a", "b", "c"]);
    s.dice.yellow.pos = { at: "track", i: 0 };
    s.dice.blue.strength = 1;
    const { state, events } = play(s, { t: "move", color: "yellow", to: 2 });
    expect(state.dice.blue.pos).toEqual({ at: "captured" });
    expect(state.stealth.blue).toBeNull();
    expect(events).toContainEqual({ t: "captured", color: "blue" });
  });
});

describe("location actions", () => {
  it("sets the die, then ends the turn", () => {
    const { state } = play(game(["Camp | | 设为5"]), { t: "move", color: "black", to: 0 }, { t: "act" });
    expect(str(state, "black")).toBe(5);
    expect(state.phase).toBe("move");
    expect(state.turn).toBe(2);
  });
  it("can skip an action", () => {
    const { state } = play(game(["Camp | | 设为5"]), { t: "move", color: "black", to: 0 }, { t: "done" });
    expect(str(state, "black")).toBe(3);
  });
  it("repeats a paid action while Treasure lasts", () => {
    const s = game(["Crate | | 付宝藏2 名望+2 | ✓"]);
    const r = play(s, { t: "move", color: "black", to: 0 }, { t: "act" }, { t: "act" });
    expect([r.state.treasure, r.state.fame, r.state.phase]).toEqual([1, 4, "action"]);
    expect(canAct(r.state)).toBe(false);
    expect(() => play(r.state, { t: "act" })).toThrow(RuleError);
    expect(play(r.state, { t: "done" }).state.phase).toBe("move");
  });
  it("applies the chosen option and takes Fate only from the supply", () => {
    const s = game(["Pool | | 二选一(命运+1 \\| 骰子+3) | ✓"]);
    s.treasure = 8;
    const r = play(s, { t: "move", color: "black", to: 0 }, { t: "act", option: 0 }, { t: "act", option: 0 }, { t: "act", option: 0 }, { t: "act", option: 1 });
    expect([r.state.fate, r.state.supply]).toEqual([3, 0]);
    expect(str(r.state, "black")).toBe(6);
  });
  it("caps Treasure at 8 and pays out X = strength", () => {
    const s = game(["Hoard | | 宝藏+X"]);
    s.dice.yellow.strength = 6;
    const { state } = play(s, { t: "move", color: "yellow", to: 0 }, { t: "act" });
    expect(state.treasure).toBe(8);
  });
  it("flips a die", () => {
    const s = game(["Whirl | | 翻面"]);
    s.dice.blue.strength = 2;
    expect(str(play(s, { t: "move", color: "blue", to: 0 }, { t: "act" }).state, "blue")).toBe(5);
  });
  it("gives +1 to a die that stays on a stay-put location", () => {
    const s = game(["Spring | | 不动+1", "b", "c"]);
    s.dice.blue.pos = { at: "track", i: 0 };
    const { state } = play(s, { t: "move", color: "yellow", to: 2 });
    expect(str(state, "blue")).toBe(4);
  });
});

describe("opening adjustment and Fate", () => {
  it("allows one −1/+1 before the first move only", () => {
    const r = play(game(["a", "b"]), { t: "adjust", minus: "blue", plus: "orange" });
    expect([str(r.state, "blue"), str(r.state, "orange")]).toEqual([2, 4]);
    expect(() => play(r.state, { t: "adjust", minus: "yellow", plus: "black" })).toThrow(RuleError);
    const moved = play(game(["a", "b"]), { t: "move", color: "yellow", to: 0 }).state;
    expect(() => play(moved, { t: "adjust", minus: "blue", plus: "orange" })).toThrow(RuleError);
  });
  it("spends Fate back to the supply", () => {
    const s = game(["a", "b"]);
    s.dice.yellow.pos = { at: "track", i: 1 };
    const r = play(s, { t: "fate", kind: "swap", a: "yellow", b: "blue" });
    expect(r.state.dice.blue.pos).toEqual({ at: "track", i: 1 });
    expect(r.state.dice.yellow.pos).toEqual({ at: "start" });
    expect([r.state.fate, r.state.supply]).toEqual([0, 3]);
    expect(() => play(r.state, { t: "fate", kind: "set4", a: "blue" })).toThrow(RuleError);
  });
  it("set4, ±1 and stealth reset", () => {
    const s = game(["a"]);
    s.fate = 4;
    s.stealth.yellow = 6;
    const r = play(s, { t: "fate", kind: "set4", a: "blue" }, { t: "fate", kind: "plus", a: "blue" }, { t: "fate", kind: "minus", a: "black" }, { t: "fate", kind: "stealth1" });
    expect([str(r.state, "blue"), str(r.state, "black"), r.state.stealth.yellow]).toEqual([5, 2, 1]);
  });
});

describe("the Goblin King", () => {
  it("moves 1 + stealth dice at 5–6, or 4–6 once past the special card's start", () => {
    const s = game(["a", "b", "c"], 2);
    s.stealth = { yellow: 4, orange: 5, blue: 6, black: 1 };
    expect(kingSteps(s)).toBe(3);
    s.dice.yellow.pos = { at: "track", i: 2 };
    expect(kingSteps(s)).toBe(4);
  });

  /** Yellow waits at track[2]; black sits ahead at track[10]; orange moves from the entrance without a stealth roll. */
  function hunt(yellowStrength: number): State {
    const s = game(Array.from({ length: 14 }, (_, i) => `L${i}`));
    s.king = KING_TRACK;
    s.villageOpen = true;
    s.dice.yellow = { color: "yellow", strength: yellowStrength, pos: { at: "track", i: 2 } };
    s.dice.black = { color: "black", strength: 3, pos: { at: "track", i: 10 } };
    s.dice.blue = { color: "blue", strength: 0, pos: { at: "captured" } };
    s.stealth = { yellow: 6, orange: null, blue: null, black: 6 };
    return s;
  }

  it("stops at the first die and turns the remaining steps into damage (Ruling 3)", () => {
    const { state } = play(hunt(3), { t: "move", color: "orange", to: 12 });
    // 3 steps: 7→8→9 (yellow): free hit, then 1 more step = another hit; the King stays.
    expect(str(state, "yellow")).toBe(1);
    expect(state.king).toBe(KING_TRACK + 2);
  });
  it("continues after capturing, hitting the next die", () => {
    const { state } = play(hunt(1), { t: "move", color: "orange", to: 12 });
    expect(state.dice.yellow.pos).toEqual({ at: "captured" });
    expect(state.king).toBe(KING_TRACK + 3);
    expect(str(state, "black")).toBe(3);
  });
  it("asks which die takes the hit when several share the entrance", () => {
    const s = game(["a", "b", "c"]);
    s.king = KING_START - 1;
    s.stealth.orange = null;
    const r1 = play(s, { t: "move", color: "orange", to: 0 });
    expect(r1.state.phase).toBe("kingHit");
    expect(r1.state.king).toBe(KING_START);
    const r2 = play(r1.state, { t: "hit", color: "blue" });
    expect(str(r2.state, "blue")).toBe(2);
    expect(r2.state.phase).toBe("move");
    expect(r2.state.villageOpen).toBe(false);
  });
});

describe("village and the end", () => {
  it("opens the village once the King leaves the Warrens, then everyone must follow", () => {
    const s = game(["a", "b"]);
    expect(targets(s, "yellow")).not.toContain("village");
    s.king = KING_TRACK;
    s.villageOpen = true;
    s.dice.yellow.strength = 5;
    const r = play(s, { t: "move", color: "yellow", to: "village" });
    expect(r.state.fame).toBe(2);
    expect(r.state.stealth.yellow).toBeNull();
    expect(targets(r.state, "blue")).toEqual(["village"]);
  });
  it("lets you skip when no move is legal, and the King steps once", () => {
    const s = game(["a", "b"]);
    for (const c of COLORS) s.dice[c] = { color: c, strength: 0, pos: { at: "captured" } };
    s.dice.yellow = { color: "yellow", strength: 3, pos: { at: "track", i: 1 } };
    expect(() => play(s, { t: "move", color: "yellow", to: "village" })).toThrow(RuleError);
    const r = play(s, { t: "pass" });
    expect(r.state.king).toBe(1);
  });
  it("scores Fame, Treasure, villagers and captures", () => {
    const s = game(["a"]);
    s.fame = 15;
    s.treasure = 7;
    s.villagers = 5;
    s.dice.yellow.pos = { at: "village", order: 1 };
    s.dice.blue.pos = { at: "captured" };
    expect(score(s)).toMatchObject({ won: true, fromTreasure: 3, fromVillagers: 3, fromCaptured: -2, total: 19, rating: 1 });
  });
});

describe("random games", () => {
  it("1000 games end without errors and keep the invariants", () => {
    const engine = makeEngine(pack);
    const pick = { rng: 12345 };
    const rnd = (n: number) => {
      pick.rng = (Math.imul(pick.rng, 1103515245) + 12345) >>> 0;
      return pick.rng % n;
    };
    let won = 0;
    for (let g = 0; g < 1000; g++) {
      let s = engine.setup(g + 1, { difficulty: g % 2 ? "hard" : "normal" });
      let steps = 0;
      while (s.phase !== "over") {
        expect(steps++).toBeLessThan(400);
        const options: Action[] = [];
        if (s.phase === "move") {
          for (const c of COLORS) for (const to of targets(s, c)) options.push({ t: "move", color: c, to });
          if (!options.length) options.push({ t: "pass" });
          if (s.fate > 0 && rnd(5) === 0) options.push({ t: "fate", kind: "stealth1" });
        } else if (s.phase === "action") {
          if (canAct(s, 0)) options.push({ t: "act", option: 0 });
          if (canAct(s, 1)) options.push({ t: "act", option: 1 });
          options.push({ t: "done" });
        } else if (s.phase === "kingHit") {
          for (const c of COLORS) {
            const p = s.dice[c].pos;
            const where = s.pending?.where;
            if ((where === -1 && p.at === "start") || (p.at === "track" && p.i === where)) options.push({ t: "hit", color: c });
          }
        }
        const before = s;
        s = engine.apply(s, options[rnd(options.length)] as Action).state;
        expect(s.treasure).toBeGreaterThanOrEqual(0);
        expect(s.treasure).toBeLessThanOrEqual(8);
        expect(s.king).toBeGreaterThanOrEqual(before.king);
        for (const c of COLORS) {
          const d = s.dice[c];
          expect(d.strength).toBeGreaterThanOrEqual(0);
          expect(d.strength).toBeLessThanOrEqual(6);
          expect(d.pos.at === "captured").toBe(d.strength === 0);
        }
      }
      if (score(s).won) won++;
    }
    expect(won).toBeGreaterThan(0);
  });
});

describe("messages", () => {
  it("has the same keys in Chinese and English", () => {
    expect(missingKeys(messages)).toEqual({ zh: [], en: [] });
  });
  it("has a message for every error the engine can raise", () => {
    const src = readFileSync(join(__dirname, "../src/engine.ts"), "utf8");
    const keys = new Set([...src.matchAll(/"(err\.\w+)"/g)].map((m) => m[1] as string));
    for (const k of keys) expect(messages.zh[k], k).toBeDefined();
  });
});

describe("review fixes", () => {
  it("a die that survives under the King takes a hit for every later step", () => {
    const s = game(Array.from({ length: 14 }, (_, i) => `L${i}`));
    s.king = KING_TRACK + 2;
    s.villageOpen = true;
    s.dice.yellow = { color: "yellow", strength: 1, pos: { at: "track", i: 2 } };
    s.dice.black = { color: "black", strength: 3, pos: { at: "track", i: 10 } };
    s.dice.blue = { color: "blue", strength: 0, pos: { at: "captured" } };
    s.stealth = { yellow: 6, orange: null, blue: null, black: 6 };
    // 3 steps: the first catches yellow (no free hit any more), the other 2 move him on.
    const { state } = play(s, { t: "move", color: "orange", to: 12 });
    expect(state.dice.yellow.pos).toEqual({ at: "captured" });
    expect(state.king).toBe(KING_TRACK + 4);
  });
  it("the King reaches the start on Warrens field 1 and enters the tunnel on the next step", () => {
    const s = game(["a", "b", "c"]);
    for (const c of COLORS) s.dice[c].pos = { at: "track", i: 0 };
    s.dice.yellow.pos = { at: "track", i: 1 };
    s.dice.orange.pos = { at: "track", i: 2 };
    s.dice.blue = { color: "blue", strength: 0, pos: { at: "captured" } };
    s.dice.black = { color: "black", strength: 0, pos: { at: "captured" } };
    s.king = 4; // field 2
    const r1 = play(s, { t: "pass" });
    expect(r1.state.king).toBe(KING_START);
    expect(r1.state.villageOpen).toBe(false);
    const r2 = play(r1.state, { t: "pass" });
    expect(r2.state.king).toBe(KING_TRACK);
    expect(r2.state.villageOpen).toBe(true);
  });
  it("rejects reward ② or a cost without a first reward, and a Warrens without 6 fields", () => {
    const edit = (from: string, to: string) => fixtureNotes().map((n) => (n.path.endsWith("/A.md") ? { ...n, text: n.text.replace(from, to) } : n));
    expect(() => parseContent(edit("| 设为5 | 付宝藏1 设为4 |", "|  | 付宝藏1 设为4 |"))).toThrow(/reward/);
    expect(() => parseContent(edit("| | 宝藏+2 | | |", "| 付宝藏2 |  | | |"))).toThrow(/reward/);
    const bad = fixtureNotes().map((n) => (n.path.endsWith("巢穴.md") ? { ...n, text: n.text.replace("fields: 6", "fields: 5") } : n));
    expect(() => parseContent(bad)).toThrow(/6 fields/);
  });
  it("manual King moves are refused while a hit is pending", () => {
    const s = game(["a"]);
    s.phase = "kingHit";
    s.pending = { kind: "kingHit", where: -1, steps: 0, free: true };
    expect(() => play(s, { t: "manual", target: "king", value: 3 })).toThrow(RuleError);
  });
});

describe("tutorial", () => {
  it("plays on its own built-in cards, with yellow able to move first", async () => {
    const { tutorialPack, TUTORIAL_SEED, TUTORIAL } = await import("../src/tutorial");
    const s = setup(tutorialPack(), TUTORIAL_SEED, { difficulty: "normal" });
    expect(targets(s, "yellow").length).toBeGreaterThan(0);
    for (const step of TUTORIAL) expect(messages.zh[`tut.${step.id}`], step.id).toBeDefined();
  });
  it("links in messages only point at topics the rules notes define", () => {
    const fixtures = readFileSync(join(__dirname, "../../../fixtures/goblin-mountain/规则/规则.md"), "utf8");
    const defined = new Set([...fixtures.matchAll(/<!-- topic: ([\w-]+) -->/g)].map((m) => m[1]));
    for (const table of [messages.zh, messages.en])
      for (const text of Object.values(table)) for (const m of String(text).matchAll(/\]\(rule:([\w-]+)\)/g)) expect(defined, m[1]).toContain(m[1]);
  });
});

describe("tutorial cards", () => {
  it("match the test cards they were generated from (minus images)", async () => {
    const { TUTORIAL_NOTES } = await import("../src/tutorial-cards");
    const fresh = fixtureNotes()
      .map((n) => ({ path: n.path, text: n.text.replace(/^image: .*\n/m, "") }))
      .sort((a, b) => a.path.localeCompare(b.path));
    expect([...TUTORIAL_NOTES].sort((a, b) => a.path.localeCompare(b.path))).toEqual(fresh);
  });
});
