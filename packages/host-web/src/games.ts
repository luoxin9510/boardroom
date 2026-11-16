import type { ComponentType } from "react";
import type { Host, Lang } from "@boardroom/core";
import { App as GoblinMountain } from "@boardroom/goblin-mountain/ui";
import { CARD_FOLDER, parseContent } from "@boardroom/goblin-mountain";
import { App as Ironsworn } from "@boardroom/ironsworn/ui";
import { parseContent as parseIronsworn } from "@boardroom/ironsworn";

/** The games this app can run. A content pack's boardroom.json names one of these ids. */
export interface GameDef {
  title: Record<Lang, string>;
  App: ComponentType<{ host: Host }>;
  /** Throws a ContentError if the pack's notes are not usable. */
  check(notes: { path: string; text: string }[]): void;
}

export const GAMES: Record<string, GameDef> = {
  "goblin-mountain": {
    title: { zh: "哥布林山脉", en: "Goblin Mountain" },
    App: GoblinMountain,
    check: (notes) => void parseContent(notes.filter((n) => n.path.startsWith(`${CARD_FOLDER}/`))),
  },
  ironsworn: {
    title: { zh: "铁誓", en: "Ironsworn" },
    App: Ironsworn,
    check: (notes) => void parseIronsworn(notes),
  },
};
