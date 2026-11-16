import type { SaveData, T } from "@boardroom/core";
import { score, type Action, type Options, type State } from "./engine";
import { CARD_FOLDER } from "./content";
import { COLORS } from "./types";

/** File name for the record note: local date and time, game, result. Unique per minute; drop it into a vault's 对局/ folder. */
export function recordName(state: State, t: T, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  const sc = score(state);
  const result = sc.won ? `${sc.total} ${t("res.fame")}` : t("over.lost");
  return `${d}-${time} ${t("game.title")} ${result}.md`;
}

/** The game written up as a note: result, score, track, and the save to replay it. */
export function recordNote(state: State, save: SaveData<Action, Options>, t: T): string {
  const sc = score(state);
  const lines: string[] = [];
  lines.push("---", "type: game-record", "game: goblin-mountain", `difficulty: ${state.difficulty}`,
    `result: ${sc.won ? "won" : "lost"}`, `fame: ${sc.won ? sc.total : 0}`, `turns: ${state.turn}`,
    `started: ${save.startedAt}`, `seed: ${save.seed}`, "---", "");
  lines.push(`# ${t("game.title")} · ${t(`difficulty.${state.difficulty}`)}`, "");
  lines.push(`**${sc.won ? t("over.won") : t("over.lost")}**` + (sc.won ? ` · ${t(`rating.${sc.rating}`)}` : ""), "");
  if (sc.won) {
    lines.push(`| | |`, `|---|---|`,
      `| ${t("over.fame")} | ${sc.fame} |`,
      `| ${t("over.treasure")} | ${sc.fromTreasure} |`,
      `| ${t("over.villagers")} | ${sc.fromVillagers} |`,
      `| ${t("over.captured")} | ${sc.fromCaptured} |`,
      `| **${t("over.total")}** | **${sc.total}** |`, "");
  } else lines.push(t("over.notCounted"), "");
  lines.push(`## ${t("log.title")}`, "");
  for (const c of COLORS) {
    const d = state.dice[c];
    const where = d.pos.at === "village" ? `${t("die.village")} #${d.pos.order}` : d.pos.at === "captured" ? t("die.captured") : "";
    lines.push(`- ${t(`color.${c}`)} · ${t(`role.${c}`)}: ${where}`);
  }
  lines.push("", state.layout.map((l) => `[[${CARD_FOLDER}/${l.side}|${l.side}]]`).join(" → "), "");
  lines.push("```json", JSON.stringify(save), "```", "");
  return lines.join("\n");
}
