import type { Lang, T } from "@boardroom/core";
import type { Event } from "../engine";
import type { Effect, LocationDef, Requirement } from "../types";

export const locName = (loc: LocationDef, lang: Lang) => (lang === "zh" ? loc.zh : loc.en);

/** "Blue ≤3", "黄 ≥4", "Any die". */
export function reqText(req: Requirement, t: T): string {
  const parts: string[] = [];
  if (req.color) parts.push(t(`color.${req.color}`));
  if (req.op) parts.push(`${req.op === ">=" ? "≥" : req.op === "<=" ? "≤" : "="}${req.value}`);
  return parts.length ? parts.join(" ") : t("loc.any");
}

function amount(n: number | "X" | "X/2", t: T): string {
  return n === "X" ? t("effect.X") : n === "X/2" ? t("effect.X/2") : String(n);
}

export function effectText(e: Effect, t: T): string {
  switch (e.k) {
    case "fame":
    case "treasure":
    case "villagers":
    case "fate":
      return t(`effect.${e.k}`, { n: amount(e.n, t) });
    case "set":
      return t("effect.set", { n: e.n });
    case "add":
      return t("effect.add", { n: e.n });
    case "invert":
      return t("effect.invert");
    case "choice":
      return e.options.map((o) => o.map((x) => effectText(x, t)).join(", ")).join(` ${t("effect.or")} `);
  }
}

/** One line describing what the location does (first-arrival slot), including any cost. */
export function locationSummary(loc: LocationDef, t: T): string {
  const slot = loc.slots[0];
  const parts: string[] = [];
  if (slot) {
    if (slot.cost) parts.push(t("effect.pay", { n: slot.cost }) + " →");
    parts.push(slot.effects.map((e) => effectText(e, t)).join(", "));
    if (loc.repeatable) parts.push(`(${t("loc.repeatable")})`);
  }
  if (loc.passive) parts.push(t(`loc.passive.${loc.passive}`));
  return parts.join(" ") || t("loc.nothing");
}

/** Turns engine events into short feed lines for toasts. Moves and gains are visible on the board, so they're skipped. */
export function feed(events: readonly Event[], t: T): { text: string; tone: "info" | "bad" | "good" }[] {
  const out: { text: string; tone: "info" | "bad" | "good" }[] = [];
  let kingSteps = 0;
  for (const e of events) {
    if (e.t === "king") kingSteps++;
  }
  for (const e of events) {
    switch (e.t) {
      case "strength":
        if (e.why === "manual" || e.why === "fate" || e.why === "adjust" || e.why === "effect") break;
        out.push({
          text: t("feed.strength", { die: t(`color.${e.color}`), delta: `${e.to > e.from ? "+" : "−"}${Math.abs(e.to - e.from)}`, why: t(`why.${e.why}`) }),
          tone: e.to < e.from ? "bad" : "good",
        });
        break;
      case "captured":
        out.push({ text: t("feed.captured", { die: t(`color.${e.color}`) }), tone: "bad" });
        break;
      case "stealth":
        out.push({ text: t("feed.stealth", { die: t(`color.${e.color}`), n: e.value }), tone: e.value >= 5 ? "bad" : "info" });
        break;
      case "flip":
        out.push({ text: t("feed.flip"), tone: "good" });
        break;
      case "village":
        out.push({ text: t(e.fame ? "feed.villageFame" : "feed.village", { die: t(`color.${e.color}`), order: e.order, fame: e.fame }), tone: "good" });
        break;
    }
  }
  if (kingSteps) out.splice(Math.min(1, out.length), 0, { text: t("feed.king", { n: kingSteps }), tone: "info" });
  return out;
}
