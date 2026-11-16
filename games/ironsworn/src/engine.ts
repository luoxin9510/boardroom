import { need, RuleError, rollDie, type CampaignEngine } from "@boardroom/core";
import type { Atom } from "./effects";
import {
  DEBILITIES,
  METERS,
  RANK_TICKS,
  RANKS,
  STATS,
  TRACK_TICKS,
  type ContentPack,
  type Debility,
  type Meter,
  type Move,
  type Outcome,
  type Rank,
  type RollStat,
  type Stat,
  type Text,
  type TrackKind,
} from "./types";

// ---------- state ----------

export interface OwnedAsset {
  id: string;
  /** Kept in the save so the sheet still reads well if the content pack drops this asset. */
  name: Text;
  marked: boolean[];
  health?: number;
  field?: string;
}

export interface Character {
  name: string;
  stats: Record<Stat, number>;
  health: number;
  spirit: number;
  supply: number;
  momentum: number;
  debilities: Debility[];
  xpEarned: number;
  xpSpent: number;
  /** Ticks on the single bonds track (0–40). */
  bonds: number;
  initiative: boolean;
  assets: OwnedAsset[];
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  rank: Rank;
  ticks: number;
  status: "active" | "fulfilled" | "forsaken";
}

export interface Roll {
  kind: "action" | "progress";
  move: string;
  moveName: Text;
  stat?: RollStat;
  statValue: number;
  adds: number;
  actionDie: number;
  /** The action die counted as 0 because it matched negative momentum. */
  cancelled: boolean;
  score: number;
  c1: number;
  c2: number;
  outcome: Outcome;
  match: boolean;
  burned: boolean;
  track?: string;
  /** Harm for this roll's "progress×harm" (1 unless a harm+N consequence raised it). */
  harm: number;
  /** A consequence has been taken: no burning momentum after that (you can't take both results). */
  resolved: boolean;
}

export type Odds = "almostCertain" | "likely" | "fiftyFifty" | "unlikely" | "smallChance";
/** The lowest d100 roll that answers yes. */
export const ODDS: Record<Odds, number> = { almostCertain: 11, likely: 26, fiftyFifty: 51, unlikely: 76, smallChance: 91 };

/** What the journal records automatically. The journal is kept by the Campaign, outside the state (spec §2). */
export type Entry =
  | { k: "roll"; roll: Roll }
  | { k: "burn"; roll: Roll; momentum: number }
  | { k: "effect"; atoms: Atom[]; amounts: number[]; track?: string }
  | { k: "meter"; meter: Meter | "momentum"; from: number; to: number }
  | { k: "debility"; id: Debility; on: boolean }
  | { k: "track"; track: Track; change: "new" | "mark" | "close"; from?: number }
  | { k: "asset"; id: string; name: Text; change: "add" | "upgrade" | "remove"; ability?: number }
  | { k: "xp"; delta: number }
  | { k: "oracle"; table: string; name: Text; roll: number; text: Text }
  | { k: "ask"; odds: Odds; roll: number; yes: boolean; match: boolean }
  /** Rules prompts the player should act on: make Face a Setback, trade supply, Face Death… */
  | { k: "prompt"; key: "setback" | "outOfSupply" | "zeroHealth" | "zeroSpirit" | "zeroSupply"; amount?: number };

export interface State {
  rng: number;
  character: Character;
  tracks: Track[];
  nextTrack: number;
  pending: Roll | null;
}

export type Dice = { d6?: number; c1?: number; c2?: number };

export type Action =
  | { t: "name"; name: string }
  | { t: "stat"; stat: Stat; value: number }
  | { t: "roll"; move: string; stat?: RollStat; adds?: number; dice?: Dice }
  | { t: "progressRoll"; move: string; track?: string; dice?: Dice }
  | { t: "burn" }
  /** Applies chosen consequences; `amounts` answers the "?" atoms in order; `track` is the progress track they mark. */
  | { t: "effect"; atoms: Atom[]; amounts?: number[]; track?: string }
  | { t: "endRoll" }
  /** Manual adjustment: always allowed, no rules applied (PRD decision 1). */
  | { t: "meter"; meter: Meter | "momentum"; delta: number }
  | { t: "debility"; id: Debility; on: boolean }
  | { t: "newTrack"; kind: TrackKind; name: string; rank: Rank }
  | { t: "mark"; track: string; times?: number; ticks?: number }
  | { t: "close"; track: string; status: "fulfilled" | "forsaken" }
  | { t: "bonds"; ticks: number }
  | { t: "addAsset"; asset: string; free?: boolean }
  | { t: "upgrade"; asset: string; ability: number; free?: boolean }
  | { t: "removeAsset"; asset: string }
  | { t: "assetHealth"; asset: string; delta: number }
  | { t: "assetField"; asset: string; value: string }
  | { t: "xp"; delta: number }
  | { t: "initiative"; on: boolean }
  | { t: "oracle"; table: string; dice?: number }
  | { t: "ask"; odds: Odds; dice?: number };

export type Event = Entry;

// ---------- rules helpers ----------

export const momentumMax = (c: Character) => 10 - c.debilities.length;
export const momentumReset = (c: Character) => Math.max(0, 2 - c.debilities.length);
export const boxes = (ticks: number) => Math.floor(ticks / 4);
export const xpAvailable = (c: Character) => c.xpEarned - c.xpSpent;
export const XP_FOR_RANK: Record<Rank, number> = { troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5 };
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function outcomeOf(beats: number): Outcome {
  return beats === 2 ? "strong" : beats === 1 ? "weak" : "miss";
}

/** Beats count, with burned momentum cancelling every challenge die below it. */
export function judge(score: number, c1: number, c2: number, burnWith?: number): Outcome {
  const beat = (c: number) => score > c || (burnWith !== undefined && burnWith > c);
  return outcomeOf((beat(c1) ? 1 : 0) + (beat(c2) ? 1 : 0));
}

/** True when burning momentum now would improve the pending roll. */
export function canBurn(s: State): boolean {
  const r = s.pending;
  const m = s.character.momentum;
  if (!r || r.kind !== "action" || r.burned || r.resolved || m <= 0) return false;
  const rank = { miss: 0, weak: 1, strong: 2 };
  return rank[judge(r.score, r.c1, r.c2, m)] > rank[r.outcome];
}

export function newCharacter(name = ""): Character {
  return {
    name,
    stats: { edge: 0, heart: 0, iron: 0, shadow: 0, wits: 0 },
    health: 5,
    spirit: 5,
    supply: 5,
    momentum: 2,
    debilities: [],
    xpEarned: 0,
    xpSpent: 0,
    bonds: 0,
    initiative: false,
    assets: [],
  };
}

/** A fresh campaign state. */
export function newCampaign(seed: number, name = ""): State {
  return { rng: seed >>> 0 || 1, character: newCharacter(name), tracks: [], nextTrack: 1, pending: null };
}

/** What must replay identically on newer content: everything except names, which may be retranslated. */
export function fingerprint(s: State): string {
  return JSON.stringify(s, (key, value) => (key === "name" && typeof value === "object" ? undefined : key === "moveName" ? undefined : value));
}

function statValue(c: Character, stat: RollStat): number {
  return (METERS as readonly string[]).includes(stat) ? c[stat as Meter] : c.stats[stat as Stat];
}

function die(s: State, sides: number, given: number | undefined): number {
  if (given === undefined) return rollDie(s, sides);
  need(Number.isInteger(given) && given >= 1 && given <= sides, "err.dieRange", { sides });
  return given;
}

// ---------- engine ----------

export function makeEngine(pack: ContentPack): CampaignEngine<State, Action, Event> {
  const moves = new Map(pack.moves.map((m) => [m.id, m]));
  const assets = new Map(pack.assets.map((a) => [a.id, a]));
  const oracles = new Map(pack.oracles.map((o) => [o.id, o]));

  return {
    fingerprint,
    apply(prev, action) {
      const s: State = structuredClone(prev);
      const events: Event[] = [];
      const c = s.character;
      // Entries are copies: nothing in the journal shares objects with the state, the action or the content.
      const log = (e: Entry) => events.push(structuredClone(e));
      const int = (n: unknown, lo: number, hi: number) => need(Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi, "err.amount");
      const findTrack = (id: string | undefined) => {
        const t = s.tracks.find((x) => x.id === id);
        need(t, "err.noTrack");
        return t;
      };
      const getMove = (id: string): Move => {
        const m = moves.get(id);
        need(m, "err.unknownMove", { id });
        return m;
      };

      /** Changes momentum; going below −6 asks for Face a Setback with the leftover. */
      const momentum = (d: number) => {
        const from = c.momentum;
        let to = from + d;
        if (to < -6) {
          log({ k: "prompt", key: "setback", amount: -6 - to });
          to = -6;
        }
        c.momentum = clamp(to, -6, momentumMax(c));
        if (c.momentum !== from) log({ k: "meter", meter: "momentum", from, to: c.momentum });
      };
      /** Changes a meter by the rules: no healing while wounded/shaken; loss at 0 spills into momentum (or supply trade). */
      const meter = (m: Meter, d: number) => {
        const from = c[m];
        if (d > 0 && m === "health") need(!c.debilities.includes("wounded"), "err.wounded");
        if (d > 0 && m === "spirit") need(!c.debilities.includes("shaken"), "err.shaken");
        if (d > 0 && m === "supply") need(!c.debilities.includes("unprepared"), "err.unprepared");
        const raw = from + d;
        c[m] = clamp(raw, 0, 5);
        if (c[m] !== from) log({ k: "meter", meter: m, from, to: c[m] });
        if (raw < 0) {
          if (m === "supply") log({ k: "prompt", key: "outOfSupply", amount: -raw });
          else momentum(raw);
        }
        if (c[m] === 0 && from > 0) log({ k: "prompt", key: m === "health" ? "zeroHealth" : m === "spirit" ? "zeroSpirit" : "zeroSupply" });
      };
      const markTrack = (t: Track, ticks: number) => {
        need(t.status === "active", "err.trackClosed");
        const from = t.ticks;
        t.ticks = clamp(t.ticks + ticks, 0, TRACK_TICKS);
        log({ k: "track", track: { ...t }, change: "mark", from });
      };
      const debility = (id: Debility, on: boolean) => {
        const has = c.debilities.includes(id);
        if (has === on) return;
        c.debilities = on ? [...c.debilities, id] : c.debilities.filter((x) => x !== id);
        log({ k: "debility", id, on });
        if (c.momentum > momentumMax(c)) {
          log({ k: "meter", meter: "momentum", from: c.momentum, to: momentumMax(c) });
          c.momentum = momentumMax(c);
        }
      };

      switch (action.t) {
        case "name":
          c.name = action.name.trim();
          break;
        case "stat":
          need(STATS.includes(action.stat) && Number.isInteger(action.value) && action.value >= 0 && action.value <= 4, "err.statRange");
          c.stats[action.stat] = action.value;
          break;

        case "roll": {
          const m = getMove(action.move);
          need(m.roll === "action", "err.notActionRoll");
          let stat = action.stat;
          if (m.pick && m.stats.length > 1) {
            const vals = m.stats.map((x) => statValue(c, x));
            const v = m.pick === "max" ? Math.max(...vals) : Math.min(...vals);
            stat = m.stats[vals.indexOf(v)];
          }
          need(stat && m.stats.includes(stat), "err.statNotAllowed");
          const adds = action.adds ?? 0;
          need(Number.isInteger(adds) && adds >= 0 && adds <= 10, "err.adds");
          const d6 = die(s, 6, action.dice?.d6);
          const c1 = die(s, 10, action.dice?.c1);
          const c2 = die(s, 10, action.dice?.c2);
          const cancelled = c.momentum < 0 && d6 === -c.momentum;
          const sv = statValue(c, stat);
          const score = Math.min(10, (cancelled ? 0 : d6) + sv + adds);
          s.pending = { kind: "action", move: m.id, moveName: m.name, stat, statValue: sv, adds, actionDie: d6, cancelled, score, c1, c2, outcome: judge(score, c1, c2), match: c1 === c2, burned: false, harm: 1, resolved: false };
          log({ k: "roll", roll: { ...s.pending } });
          break;
        }

        case "progressRoll": {
          const m = getMove(action.move);
          need(m.roll === "progress", "err.notProgressRoll");
          let score: number;
          let trackId: string | undefined;
          if (m.track === "bonds") score = boxes(c.bonds);
          else {
            const t = findTrack(action.track);
            need(t.kind === m.track && t.status === "active", "err.wrongTrack");
            score = boxes(t.ticks);
            trackId = t.id;
          }
          const c1 = die(s, 10, action.dice?.c1);
          const c2 = die(s, 10, action.dice?.c2);
          s.pending = { kind: "progress", move: m.id, moveName: m.name, statValue: 0, adds: 0, actionDie: 0, cancelled: false, score, c1, c2, outcome: judge(score, c1, c2), match: c1 === c2, burned: false, track: trackId, harm: 1, resolved: false };
          log({ k: "roll", roll: { ...s.pending } });
          break;
        }

        case "burn": {
          need(canBurn(s), "err.cantBurn");
          const r = s.pending as Roll;
          const m = c.momentum;
          r.outcome = judge(r.score, r.c1, r.c2, m);
          r.burned = true;
          c.momentum = momentumReset(c);
          log({ k: "burn", roll: { ...r }, momentum: m });
          break;
        }

        case "effect": {
          const amounts = action.amounts ?? [];
          let ask = 0;
          const nextAmount = () => {
            const v = amounts[ask++];
            need(v !== undefined && Number.isInteger(v) && v >= 0 && v <= 10, "err.amount");
            return v;
          };
          let usedTrack: string | undefined;
          const progressTrack = () => {
            const t = findTrack(action.track ?? s.pending?.track);
            usedTrack = t.id;
            return t;
          };
          const resolved: number[] = [];
          const harmOnly = action.atoms.every((a) => a.k === "harm");
          for (const a of action.atoms) {
            switch (a.k) {
              case "meter": {
                const n = a.delta === "ask" ? nextAmount() : a.delta === "-ask" ? -nextAmount() : a.delta;
                if (typeof a.delta === "string") resolved.push(Math.abs(n));
                if (a.meter === "momentum") momentum(n);
                else meter(a.meter, n);
                break;
              }
              case "xp": {
                let n: number;
                if (typeof a.delta === "number") n = a.delta;
                else {
                  const t = progressTrack();
                  n = XP_FOR_RANK[t.rank] - (a.delta === "rank-1" ? 1 : 0);
                }
                c.xpEarned = clamp(c.xpEarned + n, 0, 30);
                break;
              }
              case "initiative":
                c.initiative = a.on;
                break;
              case "debility":
                debility(a.id, a.on);
                break;
              case "progress": {
                const t = progressTrack();
                const times = a.times === "harm" ? (s.pending?.harm ?? 1) : a.times;
                markTrack(t, RANK_TICKS[t.rank] * times);
                break;
              }
              case "boxes":
                markTrack(progressTrack(), a.n * 4);
                break;
              case "bond":
                c.bonds = clamp(c.bonds + a.n, 0, TRACK_TICKS);
                break;
              case "harm":
                need(s.pending, "err.noRoll");
                s.pending.harm += a.n;
                break;
              case "move":
              case "oracle":
                // Pointers for the UI ("next: Pay the Price"); nothing changes in the state.
                break;
            }
          }
          // Taking a consequence settles the roll (raising harm first doesn't).
          if (s.pending && !harmOnly) s.pending.resolved = true;
          log({ k: "effect", atoms: action.atoms, amounts: resolved, track: usedTrack });
          break;
        }

        case "endRoll":
          s.pending = null;
          break;

        case "meter": {
          need(Number.isInteger(action.delta), "err.amount");
          if (action.meter === "momentum") {
            const from = c.momentum;
            c.momentum = clamp(from + action.delta, -6, momentumMax(c));
            if (c.momentum !== from) log({ k: "meter", meter: "momentum", from, to: c.momentum });
          } else {
            need((METERS as readonly string[]).includes(action.meter), "err.amount");
            const from = c[action.meter];
            c[action.meter] = clamp(from + action.delta, 0, 5);
            if (c[action.meter] !== from) log({ k: "meter", meter: action.meter, from, to: c[action.meter] });
          }
          break;
        }

        case "debility":
          need(DEBILITIES.includes(action.id), "err.debility");
          debility(action.id, action.on);
          break;

        case "newTrack": {
          need(RANKS.includes(action.rank), "err.rank");
          need(action.name.trim(), "err.trackName");
          const t: Track = { id: `t${s.nextTrack++}`, kind: action.kind, name: action.name.trim(), rank: action.rank, ticks: 0, status: "active" };
          s.tracks.push(t);
          log({ k: "track", track: { ...t }, change: "new" });
          break;
        }

        case "mark": {
          const t = findTrack(action.track);
          if (action.ticks !== undefined) int(action.ticks, -40, 40);
          if (action.times !== undefined) int(action.times, -10, 10);
          markTrack(t, action.ticks ?? RANK_TICKS[t.rank] * (action.times ?? 1));
          break;
        }

        case "close": {
          const t = findTrack(action.track);
          need(t.status === "active", "err.trackClosed");
          t.status = action.status;
          log({ k: "track", track: { ...t }, change: "close" });
          if (t.kind === "combat") c.initiative = false;
          break;
        }

        case "bonds":
          int(action.ticks, -40, 40);
          c.bonds = clamp(c.bonds + action.ticks, 0, TRACK_TICKS);
          break;

        case "addAsset": {
          const a = assets.get(action.asset);
          need(a, "err.unknownAsset", { id: action.asset });
          need(!c.assets.some((x) => x.id === a.id), "err.hasAsset");
          if (!action.free) {
            need(xpAvailable(c) >= 3, "err.xp", { need: 3 });
            c.xpSpent += 3;
          }
          c.assets.push({ id: a.id, name: a.name, marked: a.abilities.map((x) => x.start), health: a.health, field: a.field ? "" : undefined });
          log({ k: "asset", id: a.id, name: a.name, change: "add" });
          break;
        }

        case "upgrade": {
          const owned = c.assets.find((x) => x.id === action.asset);
          need(owned, "err.noAsset");
          need(action.ability >= 0 && action.ability < owned.marked.length && !owned.marked[action.ability], "err.ability");
          if (!action.free) {
            need(xpAvailable(c) >= 2, "err.xp", { need: 2 });
            c.xpSpent += 2;
          }
          owned.marked[action.ability] = true;
          log({ k: "asset", id: owned.id, name: owned.name, change: "upgrade", ability: action.ability });
          break;
        }

        case "removeAsset": {
          const owned = c.assets.find((x) => x.id === action.asset);
          need(owned, "err.noAsset");
          c.assets = c.assets.filter((x) => x !== owned);
          log({ k: "asset", id: owned.id, name: owned.name, change: "remove" });
          break;
        }

        case "assetHealth": {
          const owned = c.assets.find((x) => x.id === action.asset);
          need(owned && owned.health !== undefined, "err.noAsset");
          int(action.delta, -10, 10);
          const max = assets.get(owned.id)?.health ?? 5;
          owned.health = clamp((owned.health as number) + action.delta, 0, max);
          break;
        }

        case "assetField": {
          const owned = c.assets.find((x) => x.id === action.asset);
          need(owned, "err.noAsset");
          owned.field = action.value;
          break;
        }

        case "xp": {
          int(action.delta, -30, 30);
          const from = c.xpEarned;
          c.xpEarned = clamp(c.xpEarned + action.delta, c.xpSpent, 30);
          if (c.xpEarned !== from) log({ k: "xp", delta: c.xpEarned - from });
          break;
        }

        case "initiative":
          c.initiative = action.on;
          break;

        case "oracle": {
          const o = oracles.get(action.table);
          need(o, "err.unknownOracle", { id: action.table });
          const n = die(s, o.sides, action.dice);
          const row = o.rows.find((r) => n >= r.from && n <= r.to);
          need(row, "err.unknownOracle", { id: action.table });
          log({ k: "oracle", table: o.id, name: o.name, roll: n, text: row.text });
          break;
        }

        case "ask": {
          need(action.odds in ODDS, "err.odds");
          const n = die(s, 100, action.dice);
          log({ k: "ask", odds: action.odds, roll: n, yes: n >= ODDS[action.odds], match: n === 100 || n % 11 === 0 });
          break;
        }

        default:
          throw new RuleError("err.unknownAction");
      }
      return { state: s, events };
    },
  };
}
