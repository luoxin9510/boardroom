import { ContentError, hashText, parseNote, type Note } from "@boardroom/core";
import type { Amount, CardSide, Color, ContentPack, Effect, LocationDef, Passive, Requirement, Slot, VillageDef } from "./types";

/** Folder (relative to the vault root) that holds the card notes. */
export const CARD_FOLDER = "卡牌";

/** Table headers, Chinese or English, mapped to field names. */
const HEADERS: Record<string, string> = {
  位置: "pos", pos: "pos", "#": "pos",
  english: "en", 英文: "en",
  中文: "zh", chinese: "zh",
  条件: "req", requirement: "req",
  费用: "cost", cost: "cost",
  奖励: "reward", reward: "reward", "奖励①": "reward",
  "奖励②": "reward2", "reward 2": "reward2", reward2: "reward2",
  可重复: "repeat", repeat: "repeat", repeatable: "repeat",
  顺序: "order", order: "order",
  名望: "fame", fame: "fame",
};

const COLOR_WORDS: Record<string, Color> = {
  黄: "yellow", yellow: "yellow", 橙: "orange", orange: "orange",
  蓝: "blue", blue: "blue", 黑: "black", black: "black",
};

const RESOURCE_WORDS: Record<string, "fame" | "treasure" | "villagers" | "fate"> = {
  名望: "fame", fame: "fame", 宝藏: "treasure", treasure: "treasure",
  村民: "villagers", villagers: "villagers", 命运: "fate", fate: "fate",
};

const EFFECT_HELP =
  "效果写法 / effect syntax: 名望+2 宝藏+X 宝藏+X/2 村民+1 命运+1 设为5 骰子+3 翻面 经过-1 不动+1 付宝藏3 二选一(命运+1 | 骰子+3)";

/** Builds the content pack from the card notes. Throws ContentError pointing at the bad line. */
export function parseContent(notes: { path: string; text: string }[]): ContentPack {
  const sorted = notes.slice().sort((a, b) => a.path.localeCompare(b.path));
  const hash = hashText(sorted.map((n) => `${n.path}\n${n.text}`).join("\n\u0000"));
  const sides: CardSide[] = [];
  let village: VillageDef | null = null;
  let warrens: ContentPack["warrens"] | null = null;
  let villageFile = "";

  for (const { path, text } of sorted) {
    const note = parseNote(path, text);
    const type = note.meta.type;
    if (type === undefined) continue; // notes without a type are ordinary notes, not cards
    if (type === "tunnel" || type === "special") sides.push(parseSide(note, type));
    else if (type === "village") {
      village = parseVillage(note);
      villageFile = path;
    } else if (type === "warrens") {
      warrens = { image: str(note.meta.image), fields: num(note.meta.fields) ?? 6 };
      if (warrens.fields !== 6) throw new ContentError(path, 1, `fields: ${warrens.fields}; the Goblin Warrens has 6 fields`);
    } else throw new ContentError(path, 2, `unknown type "${String(type)}" (tunnel | special | village | warrens)`);
  }

  if (!village) throw new ContentError(CARD_FOLDER, 1, "no village note (type: village)");
  if (!warrens) throw new ContentError(CARD_FOLDER, 1, "no warrens note (type: warrens)");
  if (village.bonuses.length === 0) throw new ContentError(villageFile, 1, "village has no bonus rows");

  const byCard = new Map<number, CardSide[]>();
  for (const s of sides.filter((s) => s.type === "tunnel")) {
    const list = byCard.get(s.card) ?? [];
    list.push(s);
    byCard.set(s.card, list);
  }
  const cards = [...byCard.entries()].sort((a, b) => a[0] - b[0]).map(([card, s]) => ({ card, sides: s }));
  if (cards.length === 0) throw new ContentError(CARD_FOLDER, 1, "no tunnel cards (type: tunnel)");
  const specials = sides.filter((s) => s.type === "special");
  for (const sp of specials) {
    const [a, b] = sp.insert ?? [0, 0];
    if (a + b !== cards.length)
      throw new ContentError(`${CARD_FOLDER}/${sp.side}`, 1, `insert ${a}/${b} must add up to the ${cards.length} tunnel cards`);
  }
  return { hash, cards, specials, village, warrens };
}

function parseSide(note: Note, type: "tunnel" | "special"): CardSide {
  const side = str(note.meta.side);
  const card = num(note.meta.card);
  if (!side) throw new ContentError(note.file, 2, "missing side: (e.g. side: A)");
  if (type === "tunnel" && card === undefined) throw new ContentError(note.file, 2, "missing card: (e.g. card: 1)");
  const cols = columns(note, ["pos", "en", "zh"]);
  const locations: LocationDef[] = note.rows.map((row, i) => parseLocation(note.file, row.line, side, i, cols, row.cells));
  if (locations.length !== 4) throw new ContentError(note.file, note.rows[0]?.line ?? 1, `a card side has 4 locations, found ${locations.length}`);
  const strips = note.meta.strips;
  let insert: [number, number] | undefined;
  if (type === "special") {
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(note.meta.insert ?? ""));
    if (!m) throw new ContentError(note.file, 2, "special card needs insert: a/b (normal cards before/after), e.g. insert: 3/3");
    insert = [Number(m[1]), Number(m[2])];
  }
  const difficulty = note.meta.difficulty === "hard" ? "hard" : "normal";
  return {
    side,
    card: card ?? 0,
    back: str(note.meta.back),
    type,
    en: str(note.meta.en),
    zh: str(note.meta.zh),
    image: str(note.meta.image),
    strips: Array.isArray(strips) ? strips.map(Number) : undefined,
    locations,
    insert,
    difficulty: type === "special" ? difficulty : undefined,
  };
}

function parseLocation(
  file: string,
  line: number,
  side: string,
  index: number,
  cols: Record<string, string>,
  cells: Record<string, string>,
): LocationDef {
  const get = (f: string) => (cols[f] ? (cells[cols[f] as string] ?? "") : "");
  const en = get("en");
  const zh = get("zh") || en;
  if (!en) throw new ContentError(file, line, "location needs an English name");
  const req = parseRequirement(file, line, get("req"));
  const cost = parseCost(file, line, get("cost"));
  const first = parseEffects(file, line, get("reward"));
  const second = parseEffects(file, line, get("reward2"));
  const passive = first.passive ?? second.passive;
  const slots: Slot[] = [];
  if (!first.effects.length && (second.effects.length || cost)) throw new ContentError(file, line, "fill in 奖励 (reward) first; 奖励② and 费用 only add to it");
  if (first.effects.length) slots.push({ cost: cost + first.cost, effects: first.effects });
  if (second.effects.length) slots.push({ cost: second.cost, effects: second.effects });
  const repeatRaw = get("repeat");
  return {
    id: `${side}${index + 1}`,
    side,
    index,
    en,
    zh,
    req,
    slots,
    repeatable: /^(✓|✔|y|yes|是|true|1)$/i.test(repeatRaw),
    passive,
  };
}

export function parseRequirement(file: string, line: number, text: string): Requirement {
  const s = text.replace(/\s+/g, "").replace("≥", ">=").replace("≤", "<=");
  if (!s || s === "任意" || s.toLowerCase() === "any") return {};
  const m = /^([^\d<>=]*)(?:(>=|<=|=)(\d))?$/.exec(s);
  const word = m?.[1] ?? "";
  const color = word ? (COLOR_WORDS[word] ?? COLOR_WORDS[word.toLowerCase()]) : undefined;
  if (!m || (word && !color)) throw new ContentError(file, line, `requirement "${text}" not understood; write e.g. 黄≥4, 蓝≤3, 黑=2, 黄, or leave empty`);
  const req: Requirement = {};
  if (color) req.color = color;
  if (m[2]) {
    req.op = m[2] as Requirement["op"];
    req.value = Number(m[3]);
  }
  return req;
}

function parseCost(file: string, line: number, text: string): number {
  const s = text.trim();
  if (!s) return 0;
  const m = /^(?:付宝藏|宝藏|pay|treasure)\s*-?(\d+)$/i.exec(s);
  if (!m) throw new ContentError(file, line, `cost "${text}" not understood; write e.g. 付宝藏3`);
  return Number(m[1]);
}

/** Parses an effects cell into effects, a Treasure cost and an ongoing effect. */
export function parseEffects(file: string, line: number, text: string): { effects: Effect[]; cost: number; passive?: Passive } {
  const out: Effect[] = [];
  let cost = 0;
  let passive: Passive | undefined;
  let rest = text.trim();
  const choice = /(?:二选一|choice)\s*[(（]([^)）]*)[)）]/i.exec(rest);
  if (choice) {
    const options = (choice[1] ?? "").split("|").map((part) => {
      const r = parseEffects(file, line, part);
      if (r.cost || r.passive) throw new ContentError(file, line, "a choice option can only hold effects");
      return r.effects;
    });
    if (options.length < 2) throw new ContentError(file, line, "a choice needs at least two options separated by |");
    out.push({ k: "choice", options });
    rest = rest.replace(choice[0], " ");
  }
  for (const tok of rest.split(/\s+/).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^(?:付宝藏|pay)(\d+)$/i.exec(tok))) cost += Number(m[1]);
    else if ((m = /^(名望|宝藏|村民|命运|fame|treasure|villagers|fate)\+(\d+|X\/2|X)$/i.exec(tok))) {
      const word = m[1] as string;
      const k = (RESOURCE_WORDS[word] ?? RESOURCE_WORDS[word.toLowerCase()]) as "fame" | "treasure" | "villagers" | "fate";
      const raw = (m[2] as string).toUpperCase();
      const n: Amount = raw === "X" ? "X" : raw === "X/2" ? "X/2" : Number(raw);
      out.push({ k, n });
    } else if ((m = /^(?:设为|set)(\d)$/i.exec(tok))) out.push({ k: "set", n: Number(m[1]) });
    else if ((m = /^(?:骰子|die)\+(\d)$/i.exec(tok))) out.push({ k: "add", n: Number(m[1]) });
    else if (/^(翻面|invert)$/i.test(tok)) out.push({ k: "invert" });
    else if (/^(经过-1|pass-1)$/i.test(tok)) passive = "passMinus1";
    else if (/^(不动\+1|stay\+1)$/i.test(tok)) passive = "stayPlus1";
    else throw new ContentError(file, line, `effect "${tok}" not understood. ${EFFECT_HELP}`);
  }
  return { effects: out, cost, passive };
}

function parseVillage(note: Note): VillageDef {
  const cols = columns(note, ["order", "fame"]);
  const bonuses = note.rows.map((row) => {
    const fame = Number(row.cells[cols.fame as string]);
    if (!Number.isFinite(fame)) throw new ContentError(note.file, row.line, "fame must be a number");
    return { req: parseRequirement(note.file, row.line, row.cells[cols.req as string] ?? ""), fame };
  });
  return { image: str(note.meta.image), bonuses };
}

/** Maps field names to the note's actual header text; throws if a required column is missing. */
function columns(note: Note, required: string[]): Record<string, string> {
  const cols: Record<string, string> = {};
  for (const h of note.headers) {
    const f = HEADERS[h] ?? HEADERS[h.toLowerCase()];
    if (f) cols[f] = h;
  }
  for (const r of required) {
    if (!cols[r]) {
      const names = Object.entries(HEADERS).filter(([, v]) => v === r).map(([k]) => k);
      throw new ContentError(note.file, 1, `table is missing a column: ${names.join(" / ")}`);
    }
  }
  return cols;
}

const str = (v: unknown): string | undefined => (v === undefined || v === "" ? undefined : String(v));
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
