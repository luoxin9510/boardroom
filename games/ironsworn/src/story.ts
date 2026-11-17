import { ContentError } from "@boardroom/core";
import { Compiler, CompilerOptions, Story as InkStory } from "inkjs/full";
import type { Text } from "./types";

/** A scenario from 剧本/<name>/ (spec §5 "剧本"): its metadata and the compiled ink JSON. */
export interface StoryDef {
  id: string;
  name: Text;
  author: string;
  license: string;
  source: string;
  warning: string;
  description: string;
  /** Compiled ink (JSON text), what the runtime loads. */
  json: string;
  /** Declares `outcome`: choices may carry #move. */
  takesRolls: boolean;
  file: string;
}

/**
 * Compiles a scenario's ink. `files` maps file names in the scenario's folder to their text. Errors become
 * ContentErrors naming the file and line, like any other content problem.
 */
export function compileStory(folder: string, main: string, files: Map<string, string>): { json: string; takesRolls: boolean } {
  const text = files.get(main);
  if (text === undefined) throw new ContentError(`${folder}/${main}`, 1, "the scenario's main ink file is missing");
  const handler = {
    ResolveInkFilename: (name: string) => name,
    LoadInkFileContents: (name: string) => {
      const t = files.get(name);
      if (t === undefined) throw new Error(`INCLUDE ${name}: no such file in ${folder}`);
      return t;
    },
  };
  const errors: string[] = [];
  const opts = new CompilerOptions(null, [], false, (msg: string, type: number) => {
    // ink also reports TODOs (0) and warnings (1); only errors (2) stop the import.
    if (type === 2) errors.push(msg);
  }, handler as never);
  let story: InkStory | null = null;
  try {
    story = new Compiler(text, opts).Compile();
  } catch (e) {
    if (!errors.length) errors.push(String(e instanceof Error ? e.message : e));
  }
  const first = errors[0];
  if (!story || first) {
    // "ERROR: 'other.ink' line 12: …" or "ERROR: line 12: …"
    const m = /'([^']+)'\s+line\s+(\d+)/i.exec(first ?? "") ?? /line\s+(\d+)/i.exec(first ?? "");
    const file = m && m.length === 3 ? (m[1] as string) : main;
    const line = Number(m ? m[m.length - 1] : 1) || 1;
    throw new ContentError(`${folder}/${file}`, line, `ink: ${(first ?? "does not compile").replace(/^ERROR:\s*/i, "")}`);
  }
  const json = story.ToJson() as string;
  const declares = story.variablesState.$("outcome") != null;
  const usesMoves = /(?<!\\)#\s*move\s*:/.test([...files.values()].map(stripComments).join("\n"));
  if (usesMoves && !declares) throw new ContentError(`${folder}/${main}`, 1, 'choices use #move, so the story must declare VAR outcome = ""');
  return { json, takesRolls: declares };
}

/** ink source without comments, keeping line numbers: line comments and block comments (their newlines kept). */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** One tag split into a name and its value: "#fx: momentum+1" → { k: "fx", v: "momentum+1" }. */
export interface Tag {
  k: string;
  v: string;
}
export const parseTag = (t: string): Tag => {
  const i = t.indexOf(":");
  return i < 0 ? { k: t.trim().toLowerCase(), v: "" } : { k: t.slice(0, i).trim().toLowerCase(), v: t.slice(i + 1).trim() };
};

export interface StoryLine {
  text: string;
  tags: Tag[];
}
export interface StoryChoice {
  text: string;
  tags: Tag[];
}

/** Runs ink one step: from a saved state (or a fresh start with a seed), optionally choosing, then continuing. */
export function stepStory(
  json: string,
  from: { state: string } | { seed: number },
  choose?: { index: number; outcome?: string; match?: boolean },
): { state: string; lines: StoryLine[]; choices: StoryChoice[] } {
  const s = new InkStory(json);
  if ("state" in from) s.state.LoadJson(from.state);
  else s.state.storySeed = from.seed % 1000003;
  if (choose) {
    // Every choice sets them: a choice without a roll leaves outcome "" and match false.
    if (s.variablesState.$("outcome") != null) s.variablesState.$("outcome", choose.outcome ?? "");
    if (s.variablesState.$("match") != null) s.variablesState.$("match", !!choose.match);
    s.ChooseChoiceIndex(choose.index);
  }
  const lines: StoryLine[] = [];
  while (s.canContinue) {
    const text = (s.Continue() ?? "").trim();
    const tags = (s.currentTags ?? []).map(parseTag);
    if (text || tags.length) lines.push({ text, tags });
  }
  return { state: s.state.ToJson() as string, lines, choices: s.currentChoices.map((c) => ({ text: c.text, tags: (c.tags ?? []).map(parseTag) })) };
}
