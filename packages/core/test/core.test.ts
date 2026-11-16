import { describe, expect, it } from "vitest";
import { ContentError, langFromLocale, missingKeys, need, parseNote, RuleError, rollDie, rngNext, Session, shuffle, translator, hashText, type Engine } from "../src";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = { rng: 42 };
    const b = { rng: 42 };
    expect([rngNext(a), rngNext(a), rngNext(a)]).toEqual([rngNext(b), rngNext(b), rngNext(b)]);
  });
  it("rolls within range and shuffles without losing items", () => {
    const r = { rng: 7 };
    for (let i = 0; i < 500; i++) {
      const v = rollDie(r);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
    expect(shuffle(r, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

// A counter game: add n, with a random bonus roll, to check replay and undo.
type S = { rng: number; total: number; rolls: number[] };
type A = { add: number };
const counter: Engine<S, A, string, { start: number }> = {
  setup: (seed, o) => ({ rng: seed, total: o.start, rolls: [] }),
  apply: (s, a) => {
    need(a.add > 0, "err.positive");
    const n = structuredClone(s);
    const roll = rollDie(n);
    n.rolls.push(roll);
    n.total += a.add + roll;
    return { state: n, events: [`+${a.add}`] };
  },
};

describe("Session", () => {
  it("undo keeps the random results when the same action is redone", () => {
    const s = new Session(counter, "counter", "h", 99, { start: 0 });
    s.act({ add: 1 });
    const first = s.state.rolls[0];
    s.undo();
    expect(s.state.total).toBe(0);
    s.act({ add: 1 });
    expect(s.state.rolls[0]).toBe(first);
  });
  it("leaves state untouched when an action is illegal", () => {
    const s = new Session(counter, "counter", "h", 1, { start: 3 });
    expect(() => s.act({ add: 0 })).toThrow(RuleError);
    expect(s.state.total).toBe(3);
    expect(s.actions).toHaveLength(0);
  });
  it("rebuilds the same state from a save", () => {
    const s = new Session(counter, "counter", "h", 5, { start: 0 });
    s.act({ add: 2 });
    s.act({ add: 3 });
    const { session, stoppedAt } = Session.fromSave(counter, JSON.parse(JSON.stringify(s.toSave())));
    expect(stoppedAt).toBeNull();
    expect(session.state).toEqual(s.state);
  });
  it("stops replay where an action no longer applies", () => {
    const s = new Session(counter, "counter", "h", 5, { start: 0 });
    s.act({ add: 2 });
    const save = s.toSave();
    save.actions.push({ add: -1 });
    expect(Session.fromSave(counter, save).stoppedAt).toBe(1);
  });
});

describe("parseNote", () => {
  it("reads frontmatter and the first table, with escaped pipes", () => {
    const n = parseNote("x.md", "---\ntype: tunnel\ncard: 1\nstrips: [0, 0.25, 1]\nname: \"A b\"\n---\n\n| a | b |\n|---|---|\n| 1 | x \\| y |\n| 2 | z |\n\ntext after");
    expect(n.meta).toEqual({ type: "tunnel", card: 1, strips: [0, 0.25, 1], name: "A b" });
    expect(n.rows.map((r) => r.cells)).toEqual([{ a: "1", b: "x | y" }, { a: "2", b: "z" }]);
    expect(n.rows[0]?.line).toBe(10);
  });
  it("points at the bad frontmatter line", () => {
    try {
      parseNote("y.md", "---\ngood: 1\nnot yaml\n---\n");
      throw new Error("no error");
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      expect((e as ContentError).line).toBe(3);
    }
  });
});

describe("i18n", () => {
  const tables = { zh: { hi: "你好 {name}", only: "x" }, en: { hi: "Hi {name}" } };
  it("fills placeholders and falls back to English, then the key", () => {
    expect(translator(tables, "zh")("hi", { name: "A" })).toBe("你好 A");
    expect(translator(tables, "en")("only")).toBe("only");
    expect(missingKeys(tables)).toEqual({ zh: [], en: ["only"] });
  });
  it("picks the language from a locale", () => {
    expect(langFromLocale("zh-CN")).toBe("zh");
    expect(langFromLocale("en-US")).toBe("en");
    expect(langFromLocale(undefined)).toBe("en");
  });
  it("hashes text stably", () => {
    expect(hashText("abc")).toBe(hashText("abc"));
    expect(hashText("abc")).not.toBe(hashText("abd"));
  });
});
