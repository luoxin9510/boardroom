import { describe, expect, it } from "vitest";
import { Campaign, ContentError, RuleError } from "@boardroom/core";
import { fingerprint, makeEngine, parseContent, type State } from "../src";
import { campaign, fixtureNotes, pack } from "./helpers";

const errKey = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof RuleError) return e.key;
    throw e;
  }
  return null;
};
const lines = (s: State) => (s.story?.page ?? []).map((l) => (l.k === "oracle" ? `[${l.table}]` : l.text));
const STRONG = { d6: 6, c1: 1, c2: 1 };
const WEAK = { d6: 6, c1: 1, c2: 10 };
const MISS = { d6: 1, c1: 10, c2: 10 };

/** A campaign at the lighthouse: past the village, in front of the tower's choices. */
function atTower(seed = 7) {
  const c = campaign((s) => (s.rng = seed));
  c.act({ t: "storyStart", story: "fog-lighthouse" });
  c.act({ t: "storyChoose", index: 1 });
  return c;
}

describe("scenarios", () => {
  it("reads the scenario note and compiles its ink", () => {
    const st = pack().stories[0];
    expect(st).toMatchObject({ id: "fog-lighthouse", name: { zh: "雾灯塔" }, warning: "有轻微的暴力描写。", takesRolls: true });
    expect(st?.description).toContain("灯塔已经三夜没有亮了");
  });

  it("starts: the page, the vow, the roster and the choices", () => {
    const c = campaign();
    c.act({ t: "storyStart", story: "fog-lighthouse" });
    const s = c.state;
    expect(s.story?.page[0]).toEqual({ k: "scene", text: "渔村码头" });
    expect(lines(s)).toContain("渔妇莉娜拦住你。");
    expect(s.roster).toEqual([{ k: "npc", name: "莉娜", note: "渔妇，丈夫的船还没回来" }]);
    const vow = s.tracks.find((t) => t.id === s.story?.vow);
    expect(vow).toMatchObject({ kind: "vow", name: "让灯塔重新亮起来", rank: "troublesome" });
    expect(s.story?.choices).toEqual([
      { text: "安慰她，问守塔人的事", move: "befriend", stat: "heart" },
      { text: "出发去灯塔" },
    ]);
    expect(c.journal.some((e) => e.k === "story" && e.scene && e.text === "渔村码头")).toBe(true);
    expect(errKey(() => c.act({ t: "storyStart", story: "fog-lighthouse" }))).toBe("err.storyRunning");
  });

  it("a choice with a move needs that move rolled, and the roll's result picks the branch", () => {
    for (const [dice, check] of [
      [STRONG, (s: State, before: State) => expect(s.character.momentum).toBe(before.character.momentum + 2)],
      [WEAK, (s: State) => expect(s.roster?.some((r) => r.k === "clue" && r.name === "守塔人半夜出海")).toBe(true)],
      [MISS, (s: State, before: State) => expect(s.character.spirit).toBe(before.character.spirit - 1)],
    ] as const) {
      const c = campaign();
      c.act({ t: "storyStart", story: "fog-lighthouse" });
      expect(errKey(() => c.act({ t: "storyChoose", index: 0 }))).toBe("err.storyRoll");
      c.act({ t: "roll", move: "befriend", stat: "heart", dice });
      const before = c.state;
      c.act({ t: "storyChoose", index: 0 });
      check(c.state, before);
      // The roll went to the story and is over; the once-only choice is gone.
      expect(c.state.pending).toBeNull();
      expect(c.state.story?.choices.map((x) => x.text)).toEqual(["出发去灯塔"]);
    }
  });

  it("a roll of a different move doesn't count", () => {
    const c = campaign();
    c.act({ t: "storyStart", story: "fog-lighthouse" });
    c.act({ t: "roll", move: "probe", stat: "wits", dice: STRONG });
    expect(errKey(() => c.act({ t: "storyChoose", index: 0 }))).toBe("err.storyRoll");
  });

  it("an #fx that needs a choice waits for the player before the story goes on", () => {
    const c = atTower();
    c.act({ t: "roll", move: "probe", stat: "wits", dice: WEAK });
    c.act({ t: "storyChoose", index: 0 });
    expect(c.state.story?.fx).toEqual(["二选一(health-1 | supply-1)"]);
    expect(errKey(() => c.act({ t: "storyChoose", index: 0 }))).toBe("err.storyFx");
    const supply = c.state.character.supply;
    c.act({ t: "storyFx", index: 0, atoms: [{ k: "meter", meter: "supply", delta: -1 }] });
    expect(c.state.character.supply).toBe(supply - 1);
    expect(c.state.story?.fx).toEqual([]);
  });

  it("an #fx with a ? asks for the amount; dismissing applies nothing", () => {
    const c = atTower();
    c.act({ t: "roll", move: "probe", stat: "wits", dice: MISS });
    c.act({ t: "storyChoose", index: 0 });
    expect(c.state.story?.fx).toEqual(["health-?"]);
    const health = c.state.character.health;
    c.act({ t: "storyFx", index: 0, atoms: [] });
    expect(c.state.character.health).toBe(health);
  });

  it("plays to the end: milestones mark the story's vow, #oracle rolls on the page", () => {
    const c = atTower();
    c.act({ t: "roll", move: "probe", stat: "wits", dice: STRONG });
    c.act({ t: "storyChoose", index: 0 });
    const vow = () => c.state.tracks.find((t) => t.id === c.state.story?.vow);
    expect(vow()?.ticks).toBe(12);
    expect(c.state.roster?.map((r) => r.name)).toContain("灯室里的痕迹");
    expect(c.state.story?.page.some((l) => l.k === "oracle" && l.table === "spark")).toBe(true);
    c.act({ t: "storyChoose", index: 0 });
    expect(vow()?.ticks).toBe(24);
    expect(c.state.story?.over).toBe(true);
    expect(errKey(() => c.act({ t: "storyChoose", index: 0 }))).toBe("err.noStory");
    c.act({ t: "storyEnd" });
    expect(c.state.story).toBeUndefined();
    // The vow and the roster outlive the scenario.
    expect(c.state.tracks.length).toBeGreaterThan(0);
    expect(c.state.roster?.length).toBeGreaterThan(0);
  });

  it("the campaign seed decides the hidden truth; the same seed always tells the same story", () => {
    const told = (seed: number) => {
      const c = atTower(seed);
      c.act({ t: "roll", move: "probe", stat: "wits", dice: STRONG });
      c.act({ t: "storyChoose", index: 0 });
      return lines(c.state)[0];
    };
    const tales = new Set(Array.from({ length: 30 }, (_, i) => told(i + 1)));
    expect(tales.size).toBe(3);
    expect(told(5)).toBe(told(5));
  });

  it("undo and loading a save give back the same story", () => {
    const c = atTower(11);
    const at = fingerprint(c.state);
    c.act({ t: "roll", move: "probe", stat: "wits", dice: WEAK });
    c.act({ t: "storyChoose", index: 0 });
    const save = JSON.parse(JSON.stringify(c.toSave()));
    const { campaign: loaded, fellBack } = Campaign.fromSave(makeEngine(pack()), save);
    expect(fellBack).toBeNull();
    expect(fingerprint(loaded.state)).toBe(fingerprint(c.state));
    c.undo();
    c.undo();
    expect(fingerprint(c.state)).toBe(at);
  });

  it("the journal reads as the story", () => {
    const c = atTower();
    const texts = c.journal.filter((e) => e.k === "story" || e.k === "storyChoice").map((e) => ("text" in e ? e.text : ""));
    expect(texts.slice(0, 2)).toEqual(["渔村码头", texts[1]]);
    expect(texts).toContain("出发去灯塔");
    expect(texts).toContain("雾灯塔");
  });
});

describe("scenario content errors", () => {
  const folder = "剧本/雾灯塔";
  const withFile = (path: string, text: string) => [...fixtureNotes().filter((n) => n.path !== path), { path, text }];
  const contentErr = (notes: { path: string; text: string }[]) => {
    try {
      parseContent(notes);
    } catch (e) {
      if (e instanceof ContentError) return e.message;
      throw e;
    }
    return null;
  };
  const main = fixtureNotes().find((n) => n.path === `${folder}/main.ink`)?.text ?? "";

  it("names the file and line of an ink error", () => {
    expect(contentErr(withFile(`${folder}/tower.ink`, "=== tower ===\n文字\nbroken ->\n"))).toMatch(/tower\.ink:3.*ink:/);
  });
  it("needs VAR outcome when choices roll", () => {
    const notes = withFile(`${folder}/main.ink`, "文字\n* [试 #move:probe] 好\n-> END\n").filter((n) => n.path !== `${folder}/tower.ink`);
    expect(contentErr(notes)).toMatch(/main\.ink:1 .*VAR outcome/);
  });
  it("checks the moves, oracles, consequences and ranks that tags name", () => {
    expect(contentErr(withFile(`${folder}/main.ink`, main.replace("#move:befriend", "#move:nope")))).toMatch(/main\.ink:\d+ #move:nope/);
    expect(contentErr(withFile(`${folder}/main.ink`, main.replace("fx: momentum+2", "fx: momentum++")))).toMatch(/#fx:/);
    expect(contentErr(withFile(`${folder}/main.ink`, main.replace("/ troublesome", "/ hard")))).toMatch(/rank must be one of/);
    expect(contentErr(withFile(`${folder}/main.ink`, main.replace("#stat:heart", "#stat:luck")))).toMatch(/not a stat/);
  });
  it("a scenario note must sit in its own folder", () => {
    const note = fixtureNotes().find((n) => n.path === `${folder}/剧本.md`)?.text ?? "";
    expect(contentErr([...fixtureNotes(), { path: "剧本/剧本.md", text: note.replace("fog-lighthouse", "x") }])).toMatch(/belongs in 剧本/);
  });
});
