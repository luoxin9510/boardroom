import { describe, expect, it } from "vitest";
import { Campaign, RuleError, rollDie, type CampaignEngine } from "../src";

type S = { rng: number; total: number; rolls: number[] };
type A = { add: number } | { roll: true };
const engine: CampaignEngine<S, A, string> = {
  apply(s, a) {
    const n = { ...s, rolls: s.rolls.slice() };
    if ("roll" in a) n.rolls.push(rollDie(n, 10));
    else {
      if (a.add < 0) throw new RuleError("err.negative");
      n.total += a.add;
    }
    return { state: n, events: ["ok"] };
  },
};
const start = (): S => ({ rng: 42, total: 0, rolls: [] });

describe("campaign session", () => {
  it("folds old actions into the snapshot but keeps at least `window` undo steps", () => {
    const c = new Campaign(engine, "g", "c1", "t", start(), undefined, 3);
    for (let i = 1; i <= 7; i++) c.act({ add: i });
    expect(c.state.total).toBe(28);
    expect(c.actions.length).toBeGreaterThanOrEqual(3);
    expect(c.actions.length).toBeLessThan(6);
    for (let i = 0; i < 3; i++) c.undo();
    expect(c.state.total).toBe(28 - 7 - 6 - 5);
  });
  it("saves and loads to the same state, random rolls included", () => {
    const c = new Campaign(engine, "g", "c1", "t", start(), undefined, 3);
    for (let i = 0; i < 8; i++) c.act(i % 2 ? { roll: true } : { add: 1 });
    const save = JSON.parse(JSON.stringify(c.toSave()));
    expect(save).not.toHaveProperty("contentHash");
    const { campaign, stoppedAt } = Campaign.fromSave(engine, save, 3);
    expect(stoppedAt).toBeNull();
    expect(campaign.state).toEqual(c.state);
    c.undo();
    c.act({ roll: true });
    expect(c.state.rolls.at(-1)).toBe(campaign.state.rolls.at(-1));
  });
  it("falls back to the saved current state when an action no longer applies", () => {
    const played = new Campaign(engine, "g", "c1", "t", start());
    played.act({ add: 1 });
    played.act({ add: 2 });
    const save = { ...played.toSave(), actions: [{ add: 1 }, { add: -1 }] as A[] };
    const { campaign, stoppedAt } = Campaign.fromSave(engine, save);
    expect(stoppedAt).toBe(1);
    expect(campaign.state.total).toBe(3);
    expect(campaign.canUndo).toBe(false);
  });
});
