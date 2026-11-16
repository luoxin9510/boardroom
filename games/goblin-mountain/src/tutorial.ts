import { parseContent } from "./content";
import { setup, targets, type State } from "./engine";
import { TUTORIAL_NOTES } from "./tutorial-cards";
import type { Color, ContentPack } from "./types";

/** The tutorial game: built-in original cards and a fixed seed, so every player sees the same opening. */
export const TUTORIAL_SEED = 1;
export const tutorialPack = (): ContentPack => parseContent(TUTORIAL_NOTES);

/**
 * The game the tutorial plays: the player's own cards (with their art) when a pack is loaded, else the built-in ones.
 * The seed is the first one where yellow can go to the very first location, so step "pick yellow, place it" always works
 * and the same pack always gives the same opening.
 */
export function tutorialGame(pack: ContentPack | null): { pack: ContentPack; seed: number } {
  if (pack) {
    try {
      for (let seed = 1; seed <= 500; seed++) {
        const t = targets(setup(pack, seed, { difficulty: "normal" }), "yellow");
        if (t[0] === 0) return { pack, seed };
      }
    } catch {
      // A pack that can't set up a normal game (say, only hard special cards): the built-in cards still teach.
    }
  }
  return { pack: tutorialPack(), seed: TUTORIAL_SEED };
}

export interface CoachView {
  state: State;
  selected: Color | null;
}

/**
 * One step of the guided first game. Its text is the message `tut.<id>` (rules links allowed).
 * `target` is a CSS selector to highlight. Without `until` the step waits for "Next";
 * with it, the step moves on by itself once the player has done what it asks.
 */
export interface TutorialStep {
  id: string;
  target?: string;
  until?: (now: CoachView, atStart: CoachView) => boolean;
}

const moved = (now: CoachView, atStart: CoachView) => now.state.turn > atStart.state.turn;

export const TUTORIAL: TutorialStep[] = [
  { id: "intro" },
  { id: "dice", target: ".gm-tray" },
  { id: "track", target: '[data-testid="track"]' },
  { id: "king", target: ".gm-top" },
  { id: "pick", target: '[data-testid="die-yellow"]', until: (n, a) => n.selected !== null || n.state.phase !== "move" || moved(n, a) },
  { id: "place", target: ".gm-slot.is-glow", until: (n, a) => n.state.phase !== "move" || moved(n, a) },
  { id: "act", target: ".br-sheet", until: (n) => n.state.phase === "move" },
  { id: "after", target: ".gm-top" },
  { id: "behind", target: ".gm-tray", until: (n, a) => moved(n, a) && n.state.phase === "move" },
  { id: "fate", target: '[data-testid="fate"]' },
  { id: "village", target: '[data-testid="slot-village"]' },
  { id: "done" },
];
