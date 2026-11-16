import { DEBILITIES, type Debility } from "./types";

/**
 * The consequence vocabulary used in move and asset notes (spec §3).
 *
 *   momentum+1  health-1  spirit-?  supply+2        meters; "?" asks the player for the amount
 *   experience+2  experience+rank  experience+rank-1
 *   initiative+  initiative-  mark:wounded  clear:shaken
 *   progress+1  progress×harm  progress+2格  bond+1  harm+1
 *   move:pay-the-price  oracle:face-death
 *   A & B   二选一(A | B)   选2(A | B | C)   可多选(A | B)
 *
 * English spellings work too: one(…), pick2(…), any(…), progress*harm, progress+2box.
 */
export type Atom =
  | { k: "meter"; meter: "momentum" | "health" | "spirit" | "supply"; delta: number | "ask" | "-ask" }
  | { k: "xp"; delta: number | "rank" | "rank-1" }
  | { k: "initiative"; on: boolean }
  | { k: "debility"; id: Debility; on: boolean }
  | { k: "progress"; times: number | "harm" }
  | { k: "boxes"; n: number }
  | { k: "bond"; n: number }
  | { k: "harm"; n: number }
  | { k: "move"; id: string }
  | { k: "oracle"; id: string };

export type Effect = Atom | { k: "all"; items: Effect[] } | { k: "choose"; n: number | "any"; options: Effect[] };

export class EffectError extends Error {}

/** Parses an expression; the empty string means "text only" and gives null. Throws EffectError with a readable reason. */
export function parseEffect(src: string): Effect | null {
  const s = src.trim();
  if (!s) return null;
  return parseSeq(s);
}

const CLOSE: Record<string, string> = { "(": ")", "（": "）" };

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  const open: string[] = [];
  let cur = "";
  for (const ch of s) {
    if (ch in CLOSE) open.push(ch);
    if (ch === ")" || ch === "）") {
      const o = open.pop();
      if (o === undefined) throw new EffectError(`unbalanced "${ch}" in "${s}"`);
      if (CLOSE[o] !== ch) throw new EffectError(`"${o}" is closed with "${ch}" in "${s}"`);
    }
    if (ch === sep && open.length === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (open.length) throw new EffectError(`unclosed "${open.at(-1)}" in "${s}"`);
  out.push(cur);
  return out.map((x) => x.trim());
}

function parseSeq(s: string): Effect {
  const parts = splitTop(s, "&");
  if (parts.some((p) => !p)) throw new EffectError(`empty part around "&" in "${s}"`);
  const items = parts.map(parseItem);
  return items.length === 1 ? (items[0] as Effect) : { k: "all", items };
}

function parseItem(s: string): Effect {
  const m = /^(二选一|选(\d+)|可多选|one|pick(\d+)|any)\s*(?:\(([\s\S]*)\)|（([\s\S]*)）)$/.exec(s);
  if (m) {
    const n = m[1] === "二选一" || m[1] === "one" ? 1 : m[1] === "可多选" || m[1] === "any" ? "any" : Number(m[2] ?? m[3]);
    const options = splitTop((m[4] ?? m[5]) as string, "|").map((o) => {
      if (!o) throw new EffectError(`empty option in "${s}"`);
      return parseSeq(o);
    });
    if (options.length < 2) throw new EffectError(`a choice needs at least two options: "${s}"`);
    if (typeof n === "number" && (n < 1 || n > options.length)) throw new EffectError(`can't choose ${n} of ${options.length}: "${s}"`);
    return { k: "choose", n, options };
  }
  return parseAtom(s);
}

function parseAtom(s: string): Atom {
  let m: RegExpExecArray | null;
  if ((m = /^(momentum|health|spirit|supply)([+-])(\d+|\?)$/.exec(s))) {
    const meter = m[1] as "momentum";
    if (m[3] === "?") return { k: "meter", meter, delta: m[2] === "-" ? "-ask" : "ask" };
    return { k: "meter", meter, delta: (m[2] === "-" ? -1 : 1) * Number(m[3]) };
  }
  if ((m = /^experience\+(\d+|rank|rank-1)$/.exec(s))) return { k: "xp", delta: /^\d+$/.test(m[1] as string) ? Number(m[1]) : (m[1] as "rank") };
  if ((m = /^initiative([+-])$/.exec(s))) return { k: "initiative", on: m[1] === "+" };
  if ((m = /^(mark|clear):([a-z]+)$/.exec(s))) {
    if (!(DEBILITIES as readonly string[]).includes(m[2] as string)) throw new EffectError(`unknown debility "${m[2]}" (use ${DEBILITIES.join(", ")})`);
    return { k: "debility", id: m[2] as Debility, on: m[1] === "mark" };
  }
  if ((m = /^progress\+(\d+)$/.exec(s))) return { k: "progress", times: Number(m[1]) };
  if (/^progress[×x*]harm$/.test(s)) return { k: "progress", times: "harm" };
  if ((m = /^progress\+(\d+)(格|box)$/.exec(s))) return { k: "boxes", n: Number(m[1]) };
  if ((m = /^bond\+(\d+)$/.exec(s))) return { k: "bond", n: Number(m[1]) };
  if ((m = /^harm\+(\d+)$/.exec(s))) return { k: "harm", n: Number(m[1]) };
  if ((m = /^(move|oracle):([a-z0-9-]+)$/.exec(s))) return { k: m[1] as "move", id: m[2] as string };
  throw new EffectError(`"${s}" is not a known consequence (e.g. momentum+1, health-?, progress×harm, move:id, 二选一(A | B))`);
}

/** Every atom in an expression, in order (for checking move/oracle ids and asking for amounts). */
export function atomsOf(e: Effect | null): Atom[] {
  if (!e) return [];
  if (e.k === "all") return e.items.flatMap(atomsOf);
  if (e.k === "choose") return e.options.flatMap(atomsOf);
  return [e];
}

/**
 * The atoms a set of picks selects from an expression, or null while a choice is incomplete. Choice nodes are keyed
 * by their path ("r", "r.0", "r.1.2", …); `picks[path]` lists the chosen option indexes.
 */
export function resolveChoice(e: Effect, picks: Record<string, number[]>, path = "r"): Atom[] | null {
  if (e.k === "all") {
    const parts = e.items.map((x, i) => resolveChoice(x, picks, `${path}.${i}`));
    return parts.some((p) => p === null) ? null : (parts.flat() as Atom[]);
  }
  if (e.k === "choose") {
    const sel = picks[path] ?? [];
    if (e.n !== "any" && sel.length !== e.n) return null;
    const parts = sel.map((i) => resolveChoice(e.options[i] as Effect, picks, `${path}.${i}`));
    return parts.some((p) => p === null) ? null : (parts.flat() as Atom[]);
  }
  return [e];
}
