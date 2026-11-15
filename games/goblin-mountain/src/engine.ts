import { need, RuleError, rollDie, shuffle, type Engine } from "@boardroom/core";
import { COLORS, type CardSide, type Color, type ContentPack, type Effect, type LocationDef, type Requirement } from "./types";

// ───────────── state ─────────────

/** Where a die is. "start" is the last field of the Goblin Warrens, where all dice begin. */
export type Pos = { at: "start" } | { at: "track"; i: number } | { at: "village"; order: number } | { at: "captured" };

export interface DieState {
  color: Color;
  strength: number;
  pos: Pos;
}

export interface Options {
  difficulty: "normal" | "hard";
}

/** The Goblin King's place: 0–5 are Warrens fields 6…1, 6 is the start, 7+i is track[i]. */
export const KING_START = 6;
export const KING_TRACK = 7;

export interface PendingHit {
  kind: "kingHit";
  /** Track index, or -1 for the start. */
  where: number;
  /** Steps the King still has after this location. */
  steps: number;
  /** The first point of damage is free; later points each use a step. */
  free: boolean;
}

export interface State {
  rng: number;
  difficulty: Options["difficulty"];
  /** Tunnel locations in order (village not included). */
  track: LocationDef[];
  /** The card sides laid out, in order, for drawing the track. */
  layout: { side: string; image?: string; strips?: number[]; en?: string; zh?: string; special: boolean }[];
  /** Index in `track` of the special card's first location. */
  specialStart: number;
  dice: Record<Color, DieState>;
  /** Stealth dice; null once its adventurer reached the village or was captured. */
  stealth: Record<Color, number | null>;
  king: number;
  villageOpen: boolean;
  villageCount: number;
  villageBonuses: ContentPack["village"]["bonuses"];
  fame: number;
  treasure: number;
  villagers: number;
  fate: number;
  supply: number;
  phase: "move" | "action" | "kingHit" | "over";
  /** The die placed this turn, while its location's action is open. */
  placed: Color | null;
  /** How many times the placed die's action was used (repeatable actions). */
  acted: number;
  /** Dice moved this turn (for "stays put" effects). */
  movedThisTurn: Color[];
  adjustUsed: boolean;
  started: boolean;
  pending: PendingHit | null;
  turn: number;
}

// ───────────── actions and events ─────────────

export type FateKind = "swap" | "plus" | "minus" | "set4" | "stealth1";

export type Action =
  | { t: "adjust"; minus: Color; plus: Color }
  | { t: "fate"; kind: FateKind; a?: Color; b?: Color }
  | { t: "move"; color: Color; to: number | "village" }
  | { t: "pass" }
  | { t: "act"; option?: number }
  | { t: "done" }
  | { t: "hit"; color: Color }
  | { t: "manual"; target: Color | "fame" | "treasure" | "villagers" | "fate" | "king"; value: number };

export type Event =
  | { t: "move"; color: Color; from: Pos; to: Pos }
  | { t: "strength"; color: Color; from: number; to: number; why: "behind" | "pass" | "king" | "effect" | "stay" | "fate" | "adjust" | "manual" }
  | { t: "captured"; color: Color }
  | { t: "village"; color: Color; order: number; fame: number }
  | { t: "gain"; k: "fame" | "treasure" | "villagers" | "fate"; n: number }
  | { t: "pay"; n: number }
  | { t: "fate"; kind: FateKind }
  | { t: "stealth"; color: Color; value: number }
  | { t: "stealthRemoved"; color: Color }
  | { t: "king"; from: number; to: number }
  | { t: "flip" }
  | { t: "turn"; turn: number }
  | { t: "over"; won: boolean };

// ───────────── setup ─────────────

export function makeEngine(pack: ContentPack): Engine<State, Action, Event, Options> {
  return {
    setup: (seed, options) => setup(pack, seed, options),
    apply: (state, action) => {
      const s = structuredClone(state);
      const ev: Event[] = [];
      applyInPlace(s, action, ev);
      return { state: s, events: ev };
    },
  };
}

export function setup(pack: ContentPack, seed: number, options: Options): State {
  const r = { rng: seed >>> 0 || 1 };
  const special = pack.specials.find((s) => s.difficulty === options.difficulty) ?? pack.specials[0];
  if (!special) throw new RuleError("err.noSpecial");
  const order = shuffle(r, pack.cards).map((c) => {
    const side = c.sides.length > 1 ? c.sides[Math.floor(rollDie(r, c.sides.length) - 1)] : c.sides[0];
    return side as CardSide;
  });
  const [before] = special.insert ?? [order.length, 0];
  const sides = [...order.slice(0, before), special, ...order.slice(before)];
  const track = sides.flatMap((s) => s.locations);
  const dice = {} as Record<Color, DieState>;
  const stealth = {} as Record<Color, number | null>;
  for (const c of COLORS) {
    dice[c] = { color: c, strength: 3, pos: { at: "start" } };
    stealth[c] = 1;
  }
  return {
    rng: r.rng,
    difficulty: options.difficulty,
    track,
    layout: sides.map((s) => ({ side: s.side, image: s.image, strips: s.strips, en: s.en, zh: s.zh, special: s.type === "special" })),
    specialStart: before * 4,
    dice,
    stealth,
    king: 0,
    villageOpen: false,
    villageCount: 0,
    villageBonuses: pack.village.bonuses,
    fame: 0,
    treasure: 5,
    villagers: 0,
    fate: 1,
    supply: 2,
    phase: "move",
    placed: null,
    acted: 0,
    movedThisTurn: [],
    adjustUsed: false,
    started: false,
    pending: null,
    turn: 1,
  };
}

// ───────────── queries (also used by the UI) ─────────────

/** A die's place in the line: start −1, track index, village after the last location. */
export function rank(state: State, pos: Pos): number {
  if (pos.at === "start") return -1;
  if (pos.at === "track") return pos.i;
  if (pos.at === "village") return state.track.length;
  return -2;
}

export function meets(req: Requirement, color: Color, strength: number): boolean {
  if (req.color && req.color !== color) return false;
  if (req.op === ">=") return strength >= (req.value ?? 0);
  if (req.op === "<=") return strength <= (req.value ?? 6);
  if (req.op === "=") return strength === req.value;
  return true;
}

export const active = (d: DieState) => d.pos.at === "start" || d.pos.at === "track";

/** The colour of the die at a track location, if any. */
export function dieAt(state: State, i: number): Color | null {
  for (const c of COLORS) {
    const p = state.dice[c].pos;
    if (p.at === "track" && p.i === i) return c;
  }
  return null;
}

/** Where `color` may move now. Empty when it cannot move. */
export function targets(state: State, color: Color): (number | "village")[] {
  if (state.phase !== "move") return [];
  const die = state.dice[color];
  if (!active(die)) return [];
  const leader = Math.max(...COLORS.map((c) => state.dice[c]).filter((d) => d.pos.at !== "captured").map((d) => rank(state, d.pos)));
  if (leader >= state.track.length) return ["village"];
  const out: (number | "village")[] = [];
  for (let i = leader + 1; i < state.track.length; i++) {
    const loc = state.track[i] as LocationDef;
    if (dieAt(state, i) === null && meets(loc.req, color, die.strength)) out.push(i);
  }
  if (state.villageOpen) out.push("village");
  return out;
}

export function canMoveAny(state: State): boolean {
  return COLORS.some((c) => targets(state, c).length > 0);
}

/** How far the King will move after this turn's stealth roll, given the stealth dice. */
export function kingSteps(state: State): number {
  const furthest = Math.max(...COLORS.map((c) => state.dice[c]).filter((d) => d.pos.at !== "captured").map((d) => rank(state, d.pos)), -1);
  const threshold = furthest >= state.specialStart ? 4 : 5;
  return 1 + COLORS.filter((c) => (state.stealth[c] ?? 0) >= threshold).length;
}

/** The King's location as a track index, -1 for the start, or null while in the Warrens / at the village. */
export function kingWhere(state: State): number | null {
  if (state.king === KING_START) return -1;
  if (state.king >= KING_TRACK && state.king - KING_TRACK < state.track.length) return state.king - KING_TRACK;
  return null;
}

/** Whether the placed die's location action can be used now (and with which option). */
export function canAct(state: State, option = 0): boolean {
  if (state.phase !== "action" || !state.placed) return false;
  const loc = placedLocation(state);
  const slot = loc?.slots[0];
  if (!loc || !slot) return false;
  if (!loc.repeatable && state.acted > 0) return false;
  if (state.treasure < slot.cost) return false;
  const choice = slot.effects.find((e) => e.k === "choice");
  if (choice && choice.k === "choice" && (option < 0 || option >= choice.options.length)) return false;
  return true;
}

export function placedLocation(state: State): LocationDef | null {
  if (!state.placed) return null;
  const p = state.dice[state.placed].pos;
  return p.at === "track" ? (state.track[p.i] ?? null) : null;
}

// ───────────── score ─────────────

export interface Score {
  won: boolean;
  fame: number;
  fromTreasure: number;
  fromVillagers: number;
  captured: number;
  fromCaptured: number;
  total: number;
  rating: 0 | 1 | 2 | 3 | 4;
}

export function score(state: State): Score {
  const captured = COLORS.filter((c) => state.dice[c].pos.at === "captured").length;
  const won = COLORS.some((c) => state.dice[c].pos.at === "village");
  const fromTreasure = Math.floor(state.treasure / 2);
  const fromVillagers = state.villagers - 2;
  const fromCaptured = -2 * captured;
  const total = state.fame + fromTreasure + fromVillagers + fromCaptured;
  const rating = total >= 30 ? 4 : total >= 25 ? 3 : total >= 20 ? 2 : total >= 15 ? 1 : 0;
  return { won, fame: state.fame, fromTreasure, fromVillagers, captured, fromCaptured, total, rating };
}

// ───────────── apply ─────────────

function applyInPlace(s: State, a: Action, ev: Event[]): void {
  need(s.phase !== "over" || a.t === "manual", "err.over");
  switch (a.t) {
    case "adjust": return adjust(s, a.minus, a.plus, ev);
    case "fate": return fate(s, a, ev);
    case "move": return move(s, a.color, a.to, ev);
    case "pass": {
      need(s.phase === "move", "err.phase");
      need(!canMoveAny(s), "err.canMove");
      s.started = true;
      // Ruling 4: no stealth roll; the King still moves one step.
      return endTurn(s, ev, 1);
    }
    case "act": return act(s, a.option ?? 0, ev);
    case "done": {
      need(s.phase === "action", "err.phase");
      return endTurn(s, ev);
    }
    case "hit": return hit(s, a.color, ev);
    case "manual": return manual(s, a, ev);
  }
}

function adjust(s: State, minus: Color, plus: Color, ev: Event[]): void {
  need(s.phase === "move" && !s.started && !s.adjustUsed, "err.adjustUsed");
  need(minus !== plus, "err.sameDie");
  const m = s.dice[minus];
  const p = s.dice[plus];
  need(m.strength > 1 && p.strength < 6, "err.adjustRange");
  setStrength(s, m, m.strength - 1, "adjust", ev);
  setStrength(s, p, p.strength + 1, "adjust", ev);
  s.adjustUsed = true;
}

function fate(s: State, a: Extract<Action, { t: "fate" }>, ev: Event[]): void {
  need(s.phase === "move", "err.phase");
  need(s.fate > 0, "err.noFate");
  const usable = (c: Color | undefined): DieState => {
    need(c, "err.pickDie");
    const d = s.dice[c];
    need(active(d), "err.dieNotActive");
    return d;
  };
  switch (a.kind) {
    case "swap": {
      const x = usable(a.a);
      const y = usable(a.b);
      need(x !== y, "err.sameDie");
      [x.pos, y.pos] = [y.pos, x.pos];
      ev.push({ t: "move", color: x.color, from: y.pos, to: x.pos }, { t: "move", color: y.color, from: x.pos, to: y.pos });
      break;
    }
    case "plus": {
      const d = usable(a.a);
      need(d.strength < 6, "err.max6");
      setStrength(s, d, d.strength + 1, "fate", ev);
      break;
    }
    case "minus": {
      const d = usable(a.a);
      need(d.strength > 1, "err.min1");
      setStrength(s, d, d.strength - 1, "fate", ev);
      break;
    }
    case "set4": {
      const d = usable(a.a);
      setStrength(s, d, 4, "fate", ev);
      break;
    }
    case "stealth1": {
      for (const c of COLORS) if (s.stealth[c] !== null) s.stealth[c] = 1;
      break;
    }
  }
  s.fate--;
  s.supply++;
  ev.push({ t: "fate", kind: a.kind });
}

function move(s: State, color: Color, to: number | "village", ev: Event[]): void {
  need(s.phase === "move", "err.phase");
  const die = s.dice[color];
  need(active(die), "err.dieNotActive");
  need(targets(s, color).some((t) => t === to), "err.illegalTarget");
  s.started = true;
  const from = die.pos;
  const fromRank = rank(s, from);
  const toRank = to === "village" ? s.track.length : to;

  // Dice left behind lose 1 (Ruling 1: dice still at the start count, unless the moved die came from the start).
  if (from.at === "track") {
    for (const c of COLORS) {
      const d = s.dice[c];
      if (c !== color && active(d) && rank(s, d.pos) < fromRank) changeStrength(s, d, -1, "behind", ev);
    }
  }
  // Passing a "−1 when passed" location costs 1, unless a die stands on it.
  for (let i = fromRank + 1; i < toRank; i++) {
    const loc = s.track[i];
    if (loc?.passive === "passMinus1" && dieAt(s, i) === null && active(die)) changeStrength(s, die, -1, "pass", ev);
  }
  s.movedThisTurn.push(color);
  if (!active(die)) return endTurn(s, ev); // captured on the way

  if (to === "village") {
    s.villageCount++;
    const order = s.villageCount;
    const bonus = s.villageBonuses[order - 1];
    const fame = bonus && meets(bonus.req, color, die.strength) ? bonus.fame : 0;
    die.pos = { at: "village", order };
    s.fame += fame;
    ev.push({ t: "move", color, from, to: die.pos }, { t: "village", color, order, fame });
    removeStealth(s, color, ev);
    return endTurn(s, ev);
  }

  die.pos = { at: "track", i: to };
  ev.push({ t: "move", color, from, to: die.pos });
  const loc = s.track[to] as LocationDef;
  if (loc.slots.length > 0) {
    s.phase = "action";
    s.placed = color;
    s.acted = 0;
    return;
  }
  endTurn(s, ev);
}

function act(s: State, option: number, ev: Event[]): void {
  need(s.phase === "action" && s.placed, "err.phase");
  const loc = placedLocation(s) as LocationDef;
  const slot = loc.slots[0];
  need(slot, "err.noAction");
  need(loc.repeatable || s.acted === 0, "err.once");
  need(s.treasure >= slot.cost, "err.noTreasure", { n: slot.cost });
  const die = s.dice[s.placed];
  if (slot.cost) {
    s.treasure -= slot.cost;
    ev.push({ t: "pay", n: slot.cost });
  }
  runEffects(s, die, slot.effects, option, ev);
  s.acted++;
  if (!loc.repeatable) endTurn(s, ev);
}

function runEffects(s: State, die: DieState, effects: Effect[], option: number, ev: Event[]): void {
  for (const e of effects) {
    switch (e.k) {
      case "fame":
      case "treasure":
      case "villagers":
      case "fate": {
        let n = e.n === "X" ? die.strength : e.n === "X/2" ? Math.ceil(die.strength / 2) : e.n;
        if (e.k === "fate") n = Math.min(n, s.supply);
        if (e.k === "treasure") n = Math.min(n, 8 - s.treasure); // can't carry more than 8
        if (n <= 0) break;
        s[e.k] += n;
        if (e.k === "fate") s.supply -= n;
        ev.push({ t: "gain", k: e.k, n });
        break;
      }
      case "set":
        setStrength(s, die, e.n, "effect", ev);
        break;
      case "add":
        setStrength(s, die, Math.min(6, die.strength + e.n), "effect", ev);
        break;
      case "invert":
        setStrength(s, die, 7 - die.strength, "effect", ev);
        break;
      case "choice": {
        const opt = e.options[option];
        need(opt, "err.pickOption");
        runEffects(s, die, opt, 0, ev);
        break;
      }
    }
  }
}

/** Finishes the turn: stays-put bonuses, stealth roll, the King's move, game end. */
function endTurn(s: State, ev: Event[], forcedKingSteps?: number): void {
  s.phase = "move";
  s.placed = null;
  s.acted = 0;

  // "If a die here does not move this turn, it is increased by one."
  for (const c of COLORS) {
    const d = s.dice[c];
    if (d.pos.at === "track" && s.track[d.pos.i]?.passive === "stayPlus1" && !s.movedThisTurn.includes(c) && d.strength < 6) {
      changeStrength(s, d, 1, "stay", ev);
    }
  }
  if (checkOver(s, ev)) return;

  let steps = forcedKingSteps;
  if (steps === undefined) {
    const moved = s.movedThisTurn[s.movedThisTurn.length - 1];
    if (moved && s.stealth[moved] !== null) {
      const r = { rng: s.rng };
      const value = rollDie(r);
      s.rng = r.rng;
      s.stealth[moved] = value;
      ev.push({ t: "stealth", color: moved, value });
    }
    steps = kingSteps(s);
  }
  advanceKing(s, steps, ev);
  if (waitingForHit(s)) return;
  nextTurn(s, ev);
}

function nextTurn(s: State, ev: Event[]): void {
  if (checkOver(s, ev)) return;
  s.phase = "move";
  s.movedThisTurn = [];
  s.turn++;
  ev.push({ t: "turn", turn: s.turn });
}

/** Moves the King step by step; stops at the first location with dice (Ruling 3). */
function advanceKing(s: State, steps: number, ev: Event[]): void {
  const last = KING_TRACK + s.track.length; // the village
  while (steps > 0 && s.king < last) {
    const from = s.king;
    s.king++;
    steps--;
    ev.push({ t: "king", from, to: s.king });
    if (s.king === KING_TRACK && !s.villageOpen) {
      s.villageOpen = true;
      ev.push({ t: "flip" });
    }
    const where = kingWhere(s);
    if (where === null) continue;
    if (diceHere(s, where).length > 0) {
      s.pending = { kind: "kingHit", where, steps, free: true };
      resolveHits(s, ev);
      if (waitingForHit(s)) return;
      steps = s.pending ? s.pending.steps : steps;
      s.pending = null;
    }
  }
}

function diceHere(s: State, where: number): Color[] {
  return COLORS.filter((c) => {
    const p = s.dice[c].pos;
    return where === -1 ? p.at === "start" : p.at === "track" && p.i === where;
  });
}

/** Applies the King's damage at his location; asks the player when several dice stand there. */
function resolveHits(s: State, ev: Event[], chosen?: Color): void {
  const p = s.pending as PendingHit;
  for (;;) {
    const here = diceHere(s, p.where);
    if (here.length === 0 || (!p.free && p.steps === 0)) break;
    let target: Color | undefined = here.length === 1 ? here[0] : chosen;
    if (!target) {
      s.phase = "kingHit";
      return;
    }
    chosen = undefined;
    if (p.free) p.free = false;
    else p.steps--;
    changeStrength(s, s.dice[target], -1, "king", ev);
  }
  // The King leaves only when no dice are left here and he still has steps.
  if (diceHere(s, p.where).length > 0) p.steps = 0;
  s.phase = "move";
}

function hit(s: State, color: Color, ev: Event[]): void {
  need(s.phase === "kingHit" && s.pending, "err.phase");
  need(diceHere(s, s.pending.where).includes(color), "err.notHere");
  resolveHits(s, ev, color);
  if (waitingForHit(s)) return;
  const steps = s.pending?.steps ?? 0;
  s.pending = null;
  advanceKing(s, steps, ev);
  if (waitingForHit(s)) return;
  nextTurn(s, ev);
}

function manual(s: State, a: Extract<Action, { t: "manual" }>, ev: Event[]): void {
  const v = Math.round(a.value);
  if (a.target === "king") {
    s.king = Math.max(0, Math.min(KING_TRACK + s.track.length, v));
    if (s.king >= KING_TRACK) s.villageOpen = true;
    return;
  }
  if (a.target === "fame" || a.target === "treasure" || a.target === "villagers" || a.target === "fate") {
    s[a.target] = Math.max(0, a.target === "treasure" ? Math.min(8, v) : v);
    return;
  }
  const d = s.dice[a.target];
  need(d, "err.pickDie");
  need(active(d), "err.dieNotActive");
  setStrength(s, d, Math.max(1, Math.min(6, v)), "manual", ev);
}

// ───────────── helpers ─────────────

/** True while the player must pick which die takes the King's hit. A function, so TypeScript re-reads the phase. */
function waitingForHit(s: State): boolean {
  return s.phase === "kingHit";
}

function setStrength(s: State, d: DieState, value: number, why: Extract<Event, { t: "strength" }>["why"], ev: Event[]): void {
  const from = d.strength;
  d.strength = value;
  if (from !== value) ev.push({ t: "strength", color: d.color, from, to: value, why });
  if (d.strength <= 0) capture(s, d, ev);
}

function changeStrength(s: State, d: DieState, delta: number, why: Extract<Event, { t: "strength" }>["why"], ev: Event[]): void {
  setStrength(s, d, Math.min(6, d.strength + delta), why, ev);
}

function capture(s: State, d: DieState, ev: Event[]): void {
  d.strength = 0;
  d.pos = { at: "captured" };
  ev.push({ t: "captured", color: d.color });
  removeStealth(s, d.color, ev);
}

function removeStealth(s: State, c: Color, ev: Event[]): void {
  if (s.stealth[c] === null) return;
  s.stealth[c] = null;
  ev.push({ t: "stealthRemoved", color: c });
}

function checkOver(s: State, ev: Event[]): boolean {
  if (COLORS.some((c) => active(s.dice[c]))) return false;
  s.phase = "over";
  ev.push({ t: "over", won: COLORS.some((c) => s.dice[c].pos.at === "village") });
  return true;
}
