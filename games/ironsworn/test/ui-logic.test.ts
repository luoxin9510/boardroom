import { describe, expect, it } from "vitest";
import { parseEffect, resolveChoice, type Effect, type Entry } from "../src";
import { journalMarkdown } from "../src/ui/text";
import { messages } from "../src";
import { pack } from "./helpers";

const fx = (s: string) => parseEffect(s) as Effect;
const t = (key: string, params: Record<string, string | number> = {}) =>
  String(messages.zh[key]).replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));

describe("choosing consequences", () => {
  it("is incomplete until every choice has the right number of picks", () => {
    const e = fx("momentum+1 & 选2(health+1 | spirit+1 | supply+1)");
    expect(resolveChoice(e, {})).toBeNull();
    expect(resolveChoice(e, { "r.1": [0] })).toBeNull();
    expect(resolveChoice(e, { "r.1": [0, 2] })).toEqual([
      { k: "meter", meter: "momentum", delta: 1 },
      { k: "meter", meter: "health", delta: 1 },
      { k: "meter", meter: "supply", delta: 1 },
    ]);
  });
  it("handles choices inside choices and 'any'", () => {
    const e = fx("二选一(momentum+1 | 选2(health+1 | spirit+1 | supply+1))");
    expect(resolveChoice(e, { r: [1] })).toBeNull();
    expect(resolveChoice(e, { r: [1], "r.1": [1, 2] })?.map((a) => a.k === "meter" && a.meter)).toEqual(["spirit", "supply"]);
    expect(resolveChoice(fx("可多选(health-1 | supply-1)"), {})).toEqual([]);
  });
});

describe("journal export", () => {
  it("puts handwritten notes after the entry they were written after, in order", () => {
    const entries: Entry[] = [
      { k: "ask", odds: "likely", roll: 40, yes: true, match: false },
      { k: "xp", delta: 2 },
    ];
    const md = journalMarkdown("艾拉", entries, [{ at: 1, text: "第二段", time: "" }, { at: 0, text: "开头", time: "" }, { at: 2, text: "结尾", time: "" }], t, pack(), "zh");
    expect(md).toBe("# 艾拉\n\n开头\n\n- 问先知（很可能）40：是\n\n第二段\n\n- 经验 +2\n\n结尾\n");
  });
});
