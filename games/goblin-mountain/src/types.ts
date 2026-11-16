export type Color = "yellow" | "orange" | "blue" | "black";
export const COLORS: readonly Color[] = ["yellow", "orange", "blue", "black"];

/** What a die must be to be placed on a location. Empty = anything. */
export interface Requirement {
  color?: Color;
  op?: ">=" | "<=" | "=";
  value?: number;
}

/** A number, or the placed die's strength ("X"), or half of it rounded up ("X/2"). */
export type Amount = number | "X" | "X/2";

export type Effect =
  | { k: "fame" | "treasure" | "villagers" | "fate"; n: Amount }
  | { k: "set"; n: number }
  | { k: "add"; n: number }
  | { k: "invert" }
  | { k: "choice"; options: Effect[][] };

/** Ongoing location effects: −1 to dice moved past it (unless a die sits here), +1 per turn to a die that stays. */
export type Passive = "passMinus1" | "stayPlus1";

/** One action box on a location: pay `cost` Treasure, get `effects`. */
export interface Slot {
  cost: number;
  effects: Effect[];
}

export interface LocationDef {
  /** Stable id: side + position, e.g. "A1". */
  id: string;
  side: string;
  index: number;
  en: string;
  zh: string;
  req: Requirement;
  /** First arrival, then second arrival (two-player); solo uses slots[0]. Empty = nothing to do here. */
  slots: Slot[];
  repeatable: boolean;
  passive?: Passive;
}

export interface CardSide {
  side: string;
  card: number;
  back?: string;
  type: "tunnel" | "special";
  en?: string;
  zh?: string;
  image?: string;
  /** Where the four location strips start and end, as fractions of the image width (5 numbers). */
  strips?: number[];
  locations: LocationDef[];
  /** Special cards only: how many normal cards go before and after it. */
  insert?: [number, number];
  difficulty?: "normal" | "hard";
}

export interface VillageDef {
  image?: string;
  /** Bonus Fame for the 1st, 2nd, … die to arrive, if it meets the requirement. */
  bonuses: { req: Requirement; fame: number }[];
}

export interface WarrensDef {
  image?: string;
  fields: number;
}

export interface ContentPack {
  /** Hash of all content notes; saves record it. */
  hash: string;
  /** Normal tunnel cards, each with its two sides. */
  cards: { card: number; sides: CardSide[] }[];
  specials: CardSide[];
  village: VillageDef;
  warrens: WarrensDef;
}
