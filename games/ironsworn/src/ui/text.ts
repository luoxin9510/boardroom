import type { Atom } from "../effects";
import { boxes, type Entry } from "../engine";
import type { Lang } from "@boardroom/core";
import type { ContentPack } from "../types";
import type { Text } from "../types";

export type T = (key: string, params?: Record<string, string | number>) => string;

/** The text in the current language, falling back to the other one. */
export const pick = (x: Text | undefined, lang: Lang) => (x ? (lang === "zh" ? x.zh || x.en : x.en || x.zh) : "");

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function statName(stat: string | undefined, t: T): string {
  if (!stat) return "";
  return ["health", "spirit", "supply"].includes(stat) ? t(`meter.${stat}`) : t(`stat.${stat}`);
}

export function atomText(a: Atom, t: T, pack: ContentPack, lang: Lang): string {
  switch (a.k) {
    case "meter":
      return typeof a.delta === "number" ? t(`atom.${a.meter}`, { d: signed(a.delta) }) : t(`atom.${a.meter}`, { d: a.delta === "-ask" ? "−?" : "+?" });
    case "xp":
      return a.delta === "rank" ? t("atom.xpRank") : a.delta === "rank-1" ? t("atom.xpRank1") : t("atom.xp", { d: a.delta });
    case "initiative":
      return t(a.on ? "atom.initiativeOn" : "atom.initiativeOff");
    case "debility":
      return t(a.on ? "atom.mark" : "atom.clear", { name: t(`deb.${a.id}`) });
    case "progress":
      return a.times === "harm" ? t("atom.progressHarm") : t("atom.progress", { n: a.times });
    case "boxes":
      return t("atom.boxes", { n: a.n });
    case "bond":
      return t("atom.bond", { n: signed(a.n) });
    case "next":
      return t("atom.next", { n: a.n });
    case "recommit":
      return t("atom.recommit");
    case "companion":
      return t("atom.companion", { d: typeof a.delta === "number" ? signed(a.delta) : a.delta === "-ask" ? "−?" : "+?" });
    case "note":
      return a.text;
    case "harm":
      return t("atom.harm", { n: a.n });
    case "move":
      return t("atom.move", { name: pick(pack.moves.find((m) => m.id === a.id)?.name, lang) || a.id });
    case "oracle":
      return t("atom.oracle", { name: pick(pack.oracles.find((o) => o.id === a.id)?.name, lang) || a.id });
  }
}

/** One journal line for an automatic entry. */
export function entryText(e: Entry, t: T, pack: ContentPack, lang: Lang): string {
  switch (e.k) {
    case "roll": {
      const r = e.roll;
      const common = { move: pick(r.moveName, lang), c1: r.c1, c2: r.c2, score: r.score, outcome: t(`outcome.${r.outcome}`), match: r.match ? ` · ${t("outcome.match")}` : "" };
      if (r.kind === "progress") return t("j.progress", common);
      return t("j.roll", { ...common, stat: statName(r.stat, t), die: r.actionDie, cancel: r.cancelled ? "(0)" : "", sv: r.statValue, adds: r.adds });
    }
    case "burn":
      return t("j.burn", { m: e.momentum, outcome: t(`outcome.${e.roll.outcome}`) });
    case "effect":
      return t("j.effect", { list: e.atoms.filter((a) => a.k !== "move" && a.k !== "oracle").map((a) => atomText(a, t, pack, lang)).join("，") });
    case "meter":
      return t("j.meter", { meter: t(`meter.${e.meter}`), from: e.from, to: e.to });
    case "debility":
      return t(e.on ? "j.debOn" : "j.debOff", { name: t(`deb.${e.id}`) });
    case "track":
      if (e.change === "new") return t("j.trackNew", { kind: t(`kind.${e.track.kind}`), name: e.track.name, rank: t(`rank.${e.track.rank}`) });
      if (e.change === "mark") return t("j.trackMark", { name: e.track.name, from: boxes(e.from ?? 0), to: boxes(e.track.ticks) });
      return t(e.track.status === "fulfilled" ? "j.trackDone" : "j.trackForsaken", { name: e.track.name });
    case "asset":
      if (e.change === "add") return t("j.assetAdd", { name: pick(e.name, lang) });
      if (e.change === "remove") return t("j.assetRemove", { name: pick(e.name, lang) });
      return t("j.assetUp", { name: pick(e.name, lang), n: (e.ability ?? 0) + 1 });
    case "xp":
      return t("j.xp", { d: signed(e.delta) });
    case "oracle":
      return t("j.oracle", { name: pick(e.name, lang), roll: e.roll, text: pick(e.text, lang) });
    case "ask":
      return t("j.ask", { odds: t(`odds.${e.odds}`), roll: e.roll, answer: t(e.yes ? "oracle.yes" : "oracle.no"), match: e.match ? ` · ${t("outcome.match")}` : "" });
    case "prompt":
      return t(`prompt.${e.key}`, { amount: e.amount ?? 0 });
  }
}

/** Handwritten journal text, placed after the first `at` automatic entries. */
export interface Note {
  at: number;
  text: string;
  time: string;
}

/** The journal as Obsidian markdown: automatic entries as list items, handwritten notes as paragraphs. */
export function journalMarkdown(title: string, entries: readonly Entry[], notes: Note[], t: T, pack: ContentPack, lang: Lang): string {
  const lines: string[] = [`# ${title}`, ""];
  const sorted = [...notes].sort((a, b) => a.at - b.at);
  let n = 0;
  const flushNotes = (upTo: number) => {
    while (n < sorted.length && (sorted[n] as Note).at <= upTo) {
      lines.push("", (sorted[n] as Note).text, "");
      n++;
    }
  };
  entries.forEach((e, i) => {
    flushNotes(i);
    lines.push(`- ${entryText(e, t, pack, lang)}`);
  });
  flushNotes(Number.MAX_SAFE_INTEGER);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
