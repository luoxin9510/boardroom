import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Campaign, ContentError, missingKeys, RuleError } from "@boardroom/core";
import { atomsOf, canBurn, judge, makeEngine, messages, momentumMax, newCampaign, parseContent, parseEffect, RANKS, type Action, type Atom, type State } from "../src";
import { campaign, fixtureNotes, pack } from "./helpers";

const atoms = (src: string): Atom[] => atomsOf(parseEffect(src));
const errKey = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof RuleError) return e.key;
    throw e;
  }
  return null;
};

describe("content", () => {
  it("reads the test content", () => {
    const p = pack();
    expect([p.moves.length, p.assets.length, p.oracles.length, p.truths.length]).toEqual([11, 2, 3, 1]);
    const hold = p.moves.find((m) => m.id === "hold-fast");
    expect(hold?.pick).toBe("max");
    expect(hold?.stats).toEqual(["health", "iron"]);
    expect(hold?.results.before?.effect).toBe("health-?");
    expect(hold?.trigger.zh).toContain("先扣生命");
    expect(p.assets.find((a) => a.id === "lantern-moth")?.abilities.map((a) => a.start)).toEqual([true, false, false]);
  });

  const withNote = (path: string, text: string) => [...fixtureNotes().filter((n) => n.path !== path), { path, text }];
  const contentErr = (notes: { path: string; text: string }[]) => {
    try {
      parseContent(notes);
    } catch (e) {
      if (e instanceof ContentError) return e;
      throw e;
    }
    return null;
  };
  it("points at the file and line of a bad consequence", () => {
    const e = contentErr(withNote("动作/坏.md", "---\ntype: move\nid: bad\ncategory: adventure\nroll: action\nstats: [edge]\n---\n| 结果 | 中文 | English | 后果 |\n|---|---|---|---|\n| strong | a | b | momentum+one |\n"));
    expect(e?.file).toBe("动作/坏.md");
    expect(e?.line).toBe(10);
    expect(e?.detail).toMatch(/not a known consequence/);
  });
  it("rejects tables with gaps or overlaps, duplicate ids, and links to missing moves or tables", () => {
    expect(contentErr(withNote("先知/x.md", "---\ntype: oracle\nid: x\ndice: d6\n---\n| 范围 | 中文 | English |\n|---|---|---|\n| 1-2 | a | a |\n| 4-6 | b | b |\n"))?.detail).toMatch(/skips 3-3/);
    expect(contentErr(withNote("先知/x.md", "---\ntype: oracle\nid: x\ndice: d6\n---\n| 范围 | 中文 | English |\n|---|---|---|\n| 1-3 | a | a |\n| 3-6 | b | b |\n"))?.detail).toMatch(/overlaps/);
    expect(contentErr(withNote("先知/x.md", "---\ntype: oracle\nid: probe\ndice: d6\n---\n| 范围 | 中文 | English |\n|---|---|---|\n| 1-6 | a | a |\n"))?.detail).toMatch(/also used/);
    expect(contentErr(withNote("动作/x.md", "---\ntype: move\nid: x\ncategory: fate\nroll: none\n---\n| 结果 | 中文 | English | 后果 |\n|---|---|---|---|\n| any | a | b | oracle:nope |\n"))?.detail).toMatch(/no oracle table/);
    expect(contentErr(withNote("动作/x.md", "---\ntype: move\nid: x\ncategory: fate\nroll: action\nstats: [luck]\n---\n"))?.detail).toMatch(/not a stat/);
  });
});

describe("consequence vocabulary", () => {
  it("parses atoms, combinations and choices", () => {
    expect(parseEffect("")).toBeNull();
    expect(parseEffect("momentum+1 & supply-1")).toEqual({ k: "all", items: [{ k: "meter", meter: "momentum", delta: 1 }, { k: "meter", meter: "supply", delta: -1 }] });
    expect(parseEffect("选2(health+1 | spirit+1 | supply+1)")).toMatchObject({ k: "choose", n: 2 });
    expect(parseEffect("二选一(progress+1 & supply-1 | momentum+1)")).toMatchObject({ k: "choose", n: 1, options: [{ k: "all" }, { k: "meter" }] });
    expect(atoms("health-? & progress×harm & progress*harm & progress+2格 & bond+1 & harm+1 & initiative- & mark:wounded & experience+rank-1 & move:toll & oracle:x")).toEqual([
      { k: "meter", meter: "health", delta: "-ask" },
      { k: "progress", times: "harm" },
      { k: "progress", times: "harm" },
      { k: "boxes", n: 2 },
      { k: "bond", n: 1 },
      { k: "harm", n: 1 },
      { k: "initiative", on: false },
      { k: "debility", id: "wounded", on: true },
      { k: "xp", delta: "rank-1" },
      { k: "move", id: "toll" },
      { k: "oracle", id: "x" },
    ]);
  });
  it("explains what is wrong", () => {
    expect(() => parseEffect("二选一(momentum+1)")).toThrow(/at least two/);
    expect(() => parseEffect("选3(a+1 | b+1)")).toThrow();
    expect(() => parseEffect("mark:sad")).toThrow(/unknown debility/);
    expect(() => parseEffect("二选一(momentum+1 | health+1")).toThrow(/unclosed/);
    expect(() => parseEffect("momentum+1 &")).toThrow(/empty/);
  });
});

describe("action rolls", () => {
  it("caps the score at 10; ties don't beat; matches are flagged", () => {
    const c = campaign();
    c.act({ t: "roll", move: "probe", stat: "edge", adds: 4, dice: { d6: 6, c1: 10, c2: 10 } });
    expect(c.state.pending).toMatchObject({ score: 10, outcome: "miss", match: true });
    c.act({ t: "roll", move: "probe", stat: "edge", dice: { d6: 2, c1: 5, c2: 4 } });
    expect(c.state.pending).toMatchObject({ score: 5, outcome: "weak", match: false });
  });
  it("burning momentum cancels every die below it, then resets momentum", () => {
    const c = campaign((s) => (s.character.momentum = 9));
    c.act({ t: "roll", move: "probe", stat: "wits", dice: { d6: 2, c1: 3, c2: 8 } });
    expect(c.state.pending?.outcome).toBe("miss");
    expect(canBurn(c.state)).toBe(true);
    c.act({ t: "burn" });
    expect(c.state.pending).toMatchObject({ outcome: "strong", burned: true });
    expect(c.state.character.momentum).toBe(2);
    expect(errKey(() => c.act({ t: "burn" }))).toBe("err.cantBurn");
  });
  it("won't offer a burn that changes nothing, and resets lower with debilities", () => {
    const c = campaign((s) => {
      s.character.momentum = 5;
      s.character.debilities = ["shaken"];
    });
    c.act({ t: "roll", move: "probe", stat: "edge", dice: { d6: 4, c1: 6, c2: 9 } });
    expect(c.state.pending?.outcome).toBe("weak");
    expect(canBurn(c.state)).toBe(false);
    c.act({ t: "roll", move: "probe", stat: "edge", dice: { d6: 1, c1: 2, c2: 4 } });
    expect(canBurn(c.state)).toBe(true);
    c.act({ t: "burn" });
    expect(c.state.character.momentum).toBe(1);
  });
  it("negative momentum cancels a matching action die", () => {
    const c = campaign((s) => (s.character.momentum = -3));
    c.act({ t: "roll", move: "probe", stat: "edge", dice: { d6: 3, c1: 2, c2: 2 } });
    expect(c.state.pending).toMatchObject({ cancelled: true, score: 3, outcome: "strong" });
    expect(canBurn(c.state)).toBe(false);
  });
  it("rolls the higher meter or stat when the move says so", () => {
    const c = campaign((s) => (s.character.health = 4));
    c.act({ t: "roll", move: "hold-fast", dice: { d6: 1, c1: 9, c2: 9 } });
    expect(c.state.pending).toMatchObject({ stat: "health", statValue: 4 });
    expect(errKey(() => c.act({ t: "roll", move: "probe", stat: "heart" }))).toBe("err.statNotAllowed");
  });
});

describe("meters, momentum and debilities", () => {
  const effect = (c: ReturnType<typeof campaign>, src: string, amounts?: number[], track?: string) => c.act({ t: "effect", atoms: atoms(src), amounts, track });

  it("harm at 0 health spills into momentum; momentum at -6 asks for Face a Setback", () => {
    const c = campaign((s) => {
      s.character.health = 1;
      s.character.momentum = -5;
    });
    const ev = effect(c, "health-?", [3]);
    expect(c.state.character.health).toBe(0);
    expect(c.state.character.momentum).toBe(-6);
    expect(ev).toContainEqual({ k: "prompt", key: "zeroHealth" });
    expect(ev).toContainEqual({ k: "prompt", key: "setback", amount: 1 });
  });
  it("supply below 0 asks for a trade; no healing while wounded", () => {
    const c = campaign((s) => {
      s.character.supply = 0;
      s.character.debilities = ["wounded"];
    });
    expect(effect(c, "supply-2")).toContainEqual({ k: "prompt", key: "outOfSupply", amount: 2 });
    expect(errKey(() => effect(c, "health+1"))).toBe("err.wounded");
    c.act({ t: "meter", meter: "health", delta: 1 });
    expect(c.state.character.health).toBe(5);
  });
  it("debilities lower max momentum and pull momentum down", () => {
    const c = campaign((s) => (s.character.momentum = 10));
    effect(c, "mark:wounded & mark:cursed");
    expect(momentumMax(c.state.character)).toBe(8);
    expect(c.state.character.momentum).toBe(8);
  });
});

describe("progress", () => {
  it("marks by rank and rolls on full boxes", () => {
    const ticks = RANKS.map((rank) => {
      const c = campaign();
      c.act({ t: "newTrack", kind: "vow", name: "v", rank });
      c.act({ t: "mark", track: "t1" });
      return c.state.tracks[0]?.ticks;
    });
    expect(ticks).toEqual([12, 8, 4, 2, 1]);
    const c = campaign();
    c.act({ t: "newTrack", kind: "vow", name: "v", rank: "troublesome" });
    for (let i = 0; i < 5; i++) c.act({ t: "mark", track: "t1" });
    expect(c.state.tracks[0]?.ticks).toBe(40);
    c.act({ t: "progressRoll", move: "keep-promise", track: "t1", dice: { c1: 10, c2: 9 } });
    expect(c.state.pending).toMatchObject({ score: 10, outcome: "weak" });
    expect(errKey(() => c.act({ t: "progressRoll", move: "finish", track: "t1" }))).toBe("err.wrongTrack");
  });
});

describe("walkthroughs on the test content (M0 acceptance)", () => {
  it("swear a vow, make progress, keep it and earn experience", () => {
    const c = campaign();
    c.act({ t: "roll", move: "promise", stat: "heart", dice: { d6: 5, c1: 1, c2: 2 } });
    c.act({ t: "effect", atoms: atoms("momentum+2") });
    c.act({ t: "newTrack", kind: "vow", name: "找回钥匙", rank: "dangerous" });
    c.act({ t: "endRoll" });
    for (let i = 0; i < 4; i++) c.act({ t: "effect", atoms: atoms("progress+1"), track: "t1" });
    expect(c.state.tracks[0]?.ticks).toBe(32);
    c.act({ t: "progressRoll", move: "keep-promise", track: "t1", dice: { c1: 3, c2: 7 } });
    expect(c.state.pending?.outcome).toBe("strong");
    c.act({ t: "effect", atoms: atoms("experience+rank") });
    c.act({ t: "close", track: "t1", status: "fulfilled" });
    expect(c.state.character).toMatchObject({ momentum: 4, xpEarned: 2 });
    expect(c.state.tracks[0]?.status).toBe("fulfilled");
  });

  it("a fight: initiative, harm from an asset, finish; then harm at 0 health and the last-stand table", () => {
    const c = campaign((s) => (s.character.xpEarned = 3));
    c.act({ t: "addAsset", asset: "lantern-moth", free: true });
    c.act({ t: "upgrade", asset: "lantern-moth", ability: 1, free: true });
    c.act({ t: "roll", move: "engage", stat: "edge", dice: { d6: 4, c1: 2, c2: 3 } });
    c.act({ t: "effect", atoms: atoms("initiative+ & momentum+2") });
    c.act({ t: "newTrack", kind: "combat", name: "沼泽野狼", rank: "formidable" });
    expect(c.state.character.initiative).toBe(true);
    c.act({ t: "roll", move: "hit", stat: "iron", dice: { d6: 6, c1: 1, c2: 4 } });
    c.act({ t: "effect", atoms: atoms("harm+1") });
    c.act({ t: "effect", atoms: atoms("progress×harm & initiative+"), track: "t1" });
    expect(c.state.tracks[0]?.ticks).toBe(8);
    c.act({ t: "mark", track: "t1", ticks: 16 });
    c.act({ t: "progressRoll", move: "finish", track: "t1", dice: { c1: 5, c2: 6 } });
    expect(c.state.pending?.outcome).toBe("weak");
    c.act({ t: "close", track: "t1", status: "fulfilled" });
    expect(c.state.character.initiative).toBe(false);

    c.act({ t: "meter", meter: "health", delta: -5 });
    c.act({ t: "effect", atoms: atoms("health-?"), amounts: [2] });
    expect(c.state.character.momentum).toBe(2);
    c.act({ t: "roll", move: "hold-fast", dice: { d6: 1, c1: 8, c2: 9 } });
    expect(c.state.pending).toMatchObject({ stat: "iron", outcome: "miss" });
    c.act({ t: "oracle", table: "last-stand", dice: 95 });
    expect(c.state.journal.at(-1)).toMatchObject({ k: "oracle", text: { en: "You rise, against all odds." } });
  });

  it("an old save still loads after the content pack renames things", () => {
    const c = campaign();
    c.act({ t: "addAsset", asset: "wayfinder", free: true });
    c.act({ t: "roll", move: "probe", stat: "edge" });
    c.act({ t: "oracle", table: "spark" });
    const save = JSON.parse(JSON.stringify(c.toSave()));
    const renamed = fixtureNotes().map((n) => ({ ...n, text: n.text.replace("zh: 试探", "zh: 探路").replace("zh: 巡路人", "zh: 寻路者") }));
    const { campaign: loaded, stoppedAt } = Campaign.fromSave(makeEngine(parseContent(renamed)), save);
    expect(stoppedAt).toBeNull();
    expect(loaded.state.journal.length).toBe(c.state.journal.length);
    // Replaying picks up the new wording: renamed terms flow into old campaigns.
    expect(loaded.state.character.assets[0]?.name.zh).toBe("寻路者");
  });
});

describe("oracles", () => {
  it("answers yes from the odds' threshold up, and flags doubles", () => {
    const ask = (odds: "fiftyFifty" | "likely", dice: number) => {
      const c = campaign();
      c.act({ t: "ask", odds, dice });
      return c.state.journal.at(-1);
    };
    expect(ask("fiftyFifty", 50)).toMatchObject({ yes: false, match: false });
    expect(ask("fiftyFifty", 51)).toMatchObject({ yes: true });
    expect(ask("likely", 26)).toMatchObject({ yes: true });
    expect(ask("likely", 11)).toMatchObject({ yes: false, match: true });
    expect(ask("likely", 100)).toMatchObject({ yes: true, match: true });
  });
});

describe("random campaigns keep the invariants", () => {
  it("1000 random sequences", () => {
    const p = pack();
    const engine = makeEngine(p);
    const kinds = ["vow", "combat", "journey"] as const;
    let r = 12345;
    const rnd = (n: number) => ((r = (r * 1103515245 + 12345) >>> 0) % n);
    for (let g = 0; g < 1000; g++) {
      let s: State = newCampaign(g + 1, "x");
      for (let i = 0; i < 40; i++) {
        const m = p.moves[rnd(p.moves.length)]!;
        const options: Action[] = [
          { t: "roll", move: m.id, stat: m.stats[rnd(Math.max(1, m.stats.length))] },
          { t: "burn" },
          { t: "effect", atoms: atomsOf(parseEffect(m.results.strong?.effect ?? "")), amounts: [rnd(4)], track: s.tracks[0]?.id },
          { t: "meter", meter: (["health", "spirit", "supply", "momentum"] as const)[rnd(4)]!, delta: rnd(9) - 4 },
          { t: "debility", id: (["wounded", "shaken", "cursed"] as const)[rnd(3)]!, on: rnd(2) === 0 },
          { t: "newTrack", kind: kinds[rnd(3)]!, name: "t", rank: RANKS[rnd(5)]! },
          { t: "mark", track: s.tracks[rnd(Math.max(1, s.tracks.length))]?.id ?? "t1" },
          { t: "ask", odds: "fiftyFifty" },
        ];
        try {
          s = engine.apply(s, options[rnd(options.length)]!).state;
        } catch (e) {
          if (!(e instanceof RuleError)) throw e;
        }
        const ch = s.character;
        for (const v of [ch.health, ch.spirit, ch.supply]) expect(v >= 0 && v <= 5).toBe(true);
        expect(ch.momentum >= -6 && ch.momentum <= momentumMax(ch)).toBe(true);
        for (const t of s.tracks) expect(t.ticks >= 0 && t.ticks <= 40).toBe(true);
        expect(ch.xpSpent <= ch.xpEarned).toBe(true);
      }
    }
  });
});

describe("messages", () => {
  it("zh and en have the same keys, and every error the engine throws has a text", () => {
    expect(missingKeys(messages)).toEqual({ zh: [], en: [] });
    const src = readFileSync(join(__dirname, "../src/engine.ts"), "utf8");
    for (const m of src.matchAll(/"((?:err|prompt)\.[a-zA-Z]+)"/g)) expect(messages.zh, m[1]).toHaveProperty([m[1] as string]);
  });
});
