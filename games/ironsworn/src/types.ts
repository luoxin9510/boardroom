/** The five stats, then the meters a move may roll instead (Endure Harm: +health or +iron). */
export const STATS = ["edge", "heart", "iron", "shadow", "wits"] as const;
export type Stat = (typeof STATS)[number];
export const METERS = ["health", "spirit", "supply"] as const;
export type Meter = (typeof METERS)[number];
export type RollStat = Stat | Meter;

export const RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"] as const;
export type Rank = (typeof RANKS)[number];
/** Ticks marked per "mark progress": a box is 4 ticks, a track is 10 boxes. */
export const RANK_TICKS: Record<Rank, number> = { troublesome: 12, dangerous: 8, formidable: 4, extreme: 2, epic: 1 };
export const TRACK_TICKS = 40;

export const DEBILITIES = ["wounded", "shaken", "unprepared", "encumbered", "maimed", "corrupted", "cursed", "tormented"] as const;
export type Debility = (typeof DEBILITIES)[number];

export const MOVE_CATEGORIES = ["adventure", "relationship", "combat", "suffer", "quest", "fate"] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];
export const TRACK_KINDS = ["vow", "journey", "combat"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];
export type Outcome = "strong" | "weak" | "miss";
/** Result rows of a move: the three outcomes, plus "before" (applied before rolling, e.g. Endure Harm's -health) and "any" (moves that don't roll). */
export type ResultKey = Outcome | "before" | "any";

export interface Text {
  zh: string;
  en: string;
}

export interface MoveResult {
  text: Text;
  /** The consequence expression, as written in the note (see effects.ts). Empty: text only. */
  effect: string;
}

export interface Move {
  id: string;
  category: MoveCategory;
  name: Text;
  roll: "action" | "progress" | "none";
  /** What an action roll may use; empty for progress and no-roll moves. */
  stats: RollStat[];
  /** For moves that say "whichever is higher/lower". Undefined: the player picks. */
  pick?: "max" | "min";
  /** Progress moves: which kind of track they roll (bonds: the single bonds track). */
  track?: TrackKind | "bonds";
  trigger: Text;
  results: Partial<Record<ResultKey, MoveResult>>;
  file: string;
}

export interface AssetAbility {
  text: Text;
  /** Marked from the start when the asset is taken. */
  start: boolean;
  /** Optional shortcut consequence offered next to related moves (e.g. harm+1). */
  effect: string;
}

export interface Asset {
  id: string;
  category: "companion" | "path" | "combat" | "ritual";
  name: Text;
  health?: number;
  field?: string;
  abilities: AssetAbility[];
  file: string;
}

export interface OracleRow {
  from: number;
  to: number;
  text: Text;
}

export interface Oracle {
  id: string;
  group: string;
  name: Text;
  sides: number;
  source: string;
  rows: OracleRow[];
  file: string;
}

export interface Truth {
  id: string;
  name: Text;
  rows: (OracleRow & { seed: Text })[];
  file: string;
}

export interface ContentPack {
  moves: Move[];
  assets: Asset[];
  oracles: Oracle[];
  truths: Truth[];
}
