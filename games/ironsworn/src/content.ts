import { ContentError, parseNote, type Note } from "@boardroom/core";
import { atomsOf, EffectError, parseEffect } from "./effects";
import { compileStory, parseTag, stripComments, type StoryDef } from "./story";
import {
  METERS,
  MOVE_CATEGORIES,
  RANKS,
  STATS,
  TRACK_KINDS,
  type Rank,
  type Asset,
  type ContentPack,
  type Move,
  type MoveCategory,
  type Oracle,
  type OracleRow,
  type ResultKey,
  type RollStat,
  type Text,
  type Truth,
} from "./types";

/** The vault folders a content pack is read from (spec §3). */
export const FOLDERS = { moves: "动作", assets: "资产", oracles: "先知", truths: "真相", stories: "剧本" } as const;

type Raw = { path: string; text: string };

const str = (n: Note, key: string): string => {
  const v = n.meta[key];
  return v === undefined ? "" : String(v);
};
const need = (n: Note, key: string): string => {
  const v = str(n, key);
  if (!v) throw new ContentError(n.file, 1, `frontmatter needs "${key}:"`);
  return v;
};
const lineOf = (text: string, needle: string) => Math.max(1, text.split("\n").findIndex((l) => l.includes(needle)) + 1);

/** The text under a `## heading` up to the next heading or table. */
function section(text: string, ...names: string[]): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => names.some((n) => new RegExp(`^##\\s+${n}\\s*$`, "i").test(l.trim())));
  if (start < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l.trim()) || l.trim().startsWith("|")) break;
    out.push(l);
  }
  return out.join("\n").trim();
}

function cell(n: Note, row: Note["rows"][number], ...names: string[]): string {
  for (const name of names) if (name in row.cells) return row.cells[name] ?? "";
  return "";
}

function checkEffect(file: string, line: number, src: string): string {
  try {
    parseEffect(src);
  } catch (e) {
    if (e instanceof EffectError) {
      // An unescaped | inside a table cell splits the cell, which shows up as an unclosed bracket.
      const hint = /unclosed/.test(e.message) ? ' (inside a table, write the | between choices as \\|)' : "";
      throw new ContentError(file, line, `consequence: ${e.message}${hint}`);
    }
    throw e;
  }
  return src.trim();
}

function parseMove(raw: Raw, n: Note): Move {
  const category = need(n, "category") as MoveCategory;
  if (!MOVE_CATEGORIES.includes(category)) throw new ContentError(n.file, lineOf(raw.text, "category"), `category must be one of ${MOVE_CATEGORIES.join(", ")}`);
  const roll = (str(n, "roll") || "action") as Move["roll"];
  if (!["action", "progress", "none"].includes(roll)) throw new ContentError(n.file, lineOf(raw.text, "roll"), "roll must be action, progress or none");
  const statsRaw = n.meta.stats;
  const stats = (Array.isArray(statsRaw) ? statsRaw : statsRaw ? [statsRaw] : []).map(String) as RollStat[];
  for (const s of stats)
    if (![...STATS, ...METERS].includes(s as never)) throw new ContentError(n.file, lineOf(raw.text, "stats"), `"${s}" is not a stat or meter (${[...STATS, ...METERS].join(", ")})`);
  if (roll === "action" && !stats.length) throw new ContentError(n.file, 1, 'an action-roll move needs "stats: [...]"');
  const pick = str(n, "pick") || undefined;
  if (pick && pick !== "max" && pick !== "min") throw new ContentError(n.file, lineOf(raw.text, "pick"), "pick must be max or min");
  const track = str(n, "track") || undefined;
  if (roll === "progress" && !track) throw new ContentError(n.file, 1, `a progress move needs "track:" (${[...TRACK_KINDS, "bonds"].join(", ")})`);
  if (track && ![...TRACK_KINDS, "bonds"].includes(track)) throw new ContentError(n.file, lineOf(raw.text, "track"), `track must be one of ${[...TRACK_KINDS, "bonds"].join(", ")}`);
  const results: Move["results"] = {};
  for (const row of n.rows) {
    const key = cell(n, row, "结果", "Result").toLowerCase() as ResultKey;
    if (!["strong", "weak", "miss", "before", "any"].includes(key)) throw new ContentError(n.file, row.line, `结果 must be strong, weak, miss, before or any, not "${key}"`);
    if (results[key]) throw new ContentError(n.file, row.line, `there are two "${key}" rows`);
    results[key] = {
      text: { zh: cell(n, row, "中文"), en: cell(n, row, "English") },
      effect: checkEffect(n.file, row.line, cell(n, row, "后果", "Effect")),
    };
  }
  return {
    id: need(n, "id"),
    category,
    name: { zh: str(n, "zh"), en: str(n, "en") },
    roll,
    stats,
    pick: pick as Move["pick"],
    track: track as Move["track"],
    trigger: { zh: section(raw.text, "触发"), en: section(raw.text, "Trigger") },
    results,
    file: n.file,
  };
}

function parseAsset(n: Note): Asset {
  const category = need(n, "category") as Asset["category"];
  if (!["companion", "path", "combat", "ritual"].includes(category)) throw new ContentError(n.file, 1, "category must be companion, path, combat or ritual");
  const abilities = n.rows.map((row) => ({
    text: { zh: cell(n, row, "中文"), en: cell(n, row, "English") },
    start: /^(✓|✔|x|yes|y|是)$/i.test(cell(n, row, "默认", "Start").trim()),
    effect: checkEffect(n.file, row.line, cell(n, row, "后果", "Effect")),
  }));
  if (!abilities.length) throw new ContentError(n.file, 1, "an asset needs a table of abilities (| 序号 | 中文 | English | 默认 | 后果 |)");
  const health = n.meta.health === undefined ? undefined : Number(n.meta.health);
  if (health !== undefined && !(Number.isInteger(health) && health >= 1 && health <= 10)) throw new ContentError(n.file, 1, `health must be a whole number from 1 to 10, not "${n.meta.health}"`);
  return { id: need(n, "id"), category, name: { zh: str(n, "zh"), en: str(n, "en") }, health, field: str(n, "field") || undefined, abilities, file: n.file };
}

function parseRange(file: string, line: number, s: string): [number, number] {
  const m = /^(\d+)\s*(?:[-–~]\s*(\d+))?$/.exec(s.trim());
  if (!m) throw new ContentError(file, line, `范围 must look like 1-2 or 7, not "${s}"`);
  const from = Number(m[1]);
  const to = Number(m[2] ?? m[1]);
  if (to < from) throw new ContentError(file, line, `范围 ${s} goes backwards`);
  return [from, to];
}

/** Rows must cover 1..sides once each, in order. */
function checkCoverage(file: string, rows: (OracleRow & { line: number })[], sides: number) {
  let next = 1;
  for (const r of rows) {
    if (r.from !== next) throw new ContentError(file, r.line, r.from < next ? `范围 ${r.from}-${r.to} overlaps the row above` : `范围 skips ${next}-${r.from - 1}`);
    next = r.to + 1;
  }
  if (next !== sides + 1) throw new ContentError(file, rows.at(-1)?.line ?? 1, `the table stops at ${next - 1} but the dice go to ${sides}`);
}

function parseOracle(n: Note): Oracle {
  const dice = str(n, "dice") || "d100";
  const m = /^d(\d+)$/.exec(dice);
  if (!m) throw new ContentError(n.file, 1, `dice must look like d100 or d6, not "${dice}"`);
  const sides = Number(m[1]);
  if (sides < 2) throw new ContentError(n.file, 1, `dice must have at least 2 sides, not "${dice}"`);
  const rows = n.rows.map((row) => {
    const [from, to] = parseRange(n.file, row.line, cell(n, row, "范围", "Range"));
    return { from, to, text: { zh: cell(n, row, "中文"), en: cell(n, row, "English") }, line: row.line };
  });
  checkCoverage(n.file, rows, sides);
  return {
    id: need(n, "id"),
    group: str(n, "group") || "核心",
    name: { zh: str(n, "zh"), en: str(n, "en") },
    sides,
    source: str(n, "source"),
    rows: rows.map(({ line: _l, ...r }) => r),
    file: n.file,
  };
}

function parseTruth(n: Note): Truth {
  const rows = n.rows.map((row) => {
    const [from, to] = parseRange(n.file, row.line, cell(n, row, "范围", "Range"));
    return { from, to, text: { zh: cell(n, row, "中文"), en: cell(n, row, "English") }, seed: { zh: cell(n, row, "任务种子"), en: cell(n, row, "Quest starter") }, line: row.line };
  });
  checkCoverage(n.file, rows, 100);
  return { id: need(n, "id"), name: { zh: str(n, "zh"), en: str(n, "en") }, rows: rows.map(({ line: _l, ...r }) => r), file: n.file };
}

const TYPE_OF_FOLDER: Record<string, string> = { [FOLDERS.moves]: "move", [FOLDERS.assets]: "asset", [FOLDERS.oracles]: "oracle", [FOLDERS.truths]: "truth" };

/** 剧本/<name>/剧本.md plus the .ink files beside it. */
function parseStory(raw: Raw, n: Note, notes: Raw[]): StoryDef {
  const folder = n.file.split("/").slice(0, -1).join("/");
  if (folder.split("/")[0] !== FOLDERS.stories || folder.split("/").length !== 2) throw new ContentError(n.file, 1, `a scenario note belongs in ${FOLDERS.stories}/<name>/`);
  const files = new Map(notes.filter((r) => r.path.endsWith(".ink") && r.path.startsWith(`${folder}/`) && !r.path.slice(folder.length + 1).includes("/")).map((r) => [r.path.slice(folder.length + 1), r.text]));
  const { json, takesRolls } = compileStory(folder, str(n, "main") || "main.ink", files);
  return {
    id: need(n, "id"),
    name: { zh: need(n, "zh"), en: str(n, "en") },
    author: str(n, "author"),
    license: str(n, "license"),
    source: str(n, "source"),
    warning: str(n, "warning"),
    description: raw.text.replace(/\r\n?/g, "\n").replace(/^---\n[\s\S]*?\n---\n?/, "").trim(),
    json,
    takesRolls,
    file: n.file,
  };
}

/**
 * Reads every note of a pack and checks cross-references. The frontmatter `type` decides what a note is; inside the
 * 动作/资产/先知/真相 folders a missing or misspelt type is an error rather than a silently dropped note.
 */
export function parseContent(notes: Raw[]): ContentPack {
  const pack: ContentPack = { moves: [], assets: [], oracles: [], truths: [], stories: [] };
  for (const raw of notes) {
    if (!raw.path.endsWith(".md")) continue;
    const n = parseNote(raw.path, raw.text);
    const type = str(n, "type");
    const expected = raw.path.split("/").slice(0, -1).map((f) => TYPE_OF_FOLDER[f]).find(Boolean);
    if (expected && type !== expected) throw new ContentError(n.file, 1, `notes in this folder need "type: ${expected}" in the frontmatter${type ? `, not "${type}"` : ""}`);
    if (type === "move") pack.moves.push(parseMove(raw, n));
    else if (type === "asset") pack.assets.push(parseAsset(n));
    else if (type === "oracle") pack.oracles.push(parseOracle(n));
    else if (type === "truth") pack.truths.push(parseTruth(n));
    else if (type === "story") pack.stories.push(parseStory(raw, n, notes));
  }
  const seen = new Map<string, string>();
  for (const x of [...pack.moves, ...pack.assets, ...pack.oracles, ...pack.truths, ...pack.stories]) {
    const prev = seen.get(x.id);
    if (prev) throw new ContentError(x.file, 1, `id "${x.id}" is also used in ${prev}`);
    seen.set(x.id, x.file);
  }
  const moveIds = new Set(pack.moves.map((m) => m.id));
  const oracleIds = new Set(pack.oracles.map((o) => o.id));
  const texts = new Map(notes.map((n) => [n.path, n.text]));
  const check = (file: string, src: string) => {
    for (const a of atomsOf(parseEffect(src))) {
      const line = lineOf(texts.get(file) ?? "", `${a.k}:${"id" in a ? a.id : ""}`);
      if (a.k === "move" && !moveIds.has(a.id)) throw new ContentError(file, line, `move:${a.id} — there is no move with that id`);
      if (a.k === "oracle" && !oracleIds.has(a.id)) throw new ContentError(file, line, `oracle:${a.id} — there is no oracle table with that id`);
    }
  };
  for (const m of pack.moves) for (const r of Object.values(m.results)) if (r) check(m.file, r.effect);
  for (const a of pack.assets) for (const ab of a.abilities) check(a.file, ab.effect);
  // Tags in scenarios name moves, oracles and consequences: check them like the notes' (line numbers are the ink file's).
  for (const st of pack.stories) {
    const folder = st.file.split("/").slice(0, -1).join("/");
    for (const r of notes.filter((x) => x.path.startsWith(`${folder}/`) && x.path.endsWith(".ink") && !x.path.slice(folder.length + 1).includes("/"))) {
      stripComments(r.text).split("\n").forEach((l, i) => {
        for (const m of l.matchAll(/(?<!\\)#\s*([a-z]+)\s*:([^#\n\]}]*)/gi)) {
          const tag = parseTag(`${m[1]}:${(m[2] ?? "").replace(/\\(.)/g, "$1")}`);
          const at = (msg: string) => new ContentError(r.path, i + 1, msg);
          if (tag.k === "move" && !moveIds.has(tag.v)) throw at(`#move:${tag.v} — there is no move with that id`);
          if (tag.k === "oracle" && !oracleIds.has(tag.v)) throw at(`#oracle:${tag.v} — there is no oracle table with that id`);
          if (tag.k === "fx") {
            try {
              for (const a of atomsOf(parseEffect(tag.v))) {
                if (a.k === "move" && !moveIds.has(a.id)) throw at(`move:${a.id} — there is no move with that id`);
                if (a.k === "oracle" && !oracleIds.has(a.id)) throw at(`oracle:${a.id} — there is no oracle table with that id`);
              }
            } catch (e) {
              if (e instanceof ContentError) throw e;
              throw at(`#fx: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          if ((tag.k === "vow" || tag.k === "foe") && !RANKS.includes(tag.v.split("/")[1]?.trim() as Rank)) throw at(`#${tag.k}: name / rank — the rank must be one of ${RANKS.join(", ")}`);
          if (tag.k === "stat" && ![...STATS, ...METERS].includes(tag.v as never)) throw at(`#stat:${tag.v} is not a stat`);
        }
      });
    }
  }
  return pack;
}
