import { RuleError } from "./errors";

/** What every game engine provides to the session. */
export interface Engine<S, A, E, O> {
  /** Builds the starting state from the content, a seed and the player's options. */
  setup(seed: number, options: O): S;
  /** Applies one action: validates it, returns the new state and what happened. Throws RuleError. */
  apply(state: S, action: A): { state: S; events: E[] };
}

/** Everything needed to rebuild a game: replaying `actions` from `seed` gives the same state. */
export interface SaveData<A, O> {
  version: 1;
  game: string;
  /** Changes when the content pack changes, so a save knows which content it was played with. */
  contentHash: string;
  seed: number;
  options: O;
  actions: A[];
  startedAt: string;
  updatedAt: string;
}

/**
 * A game in progress: the action log plus the current state.
 * Undo drops the last action and replays from the seed, so randomness does not change on undo.
 */
export class Session<S, A, E, O> {
  private states: S[];
  private log: A[] = [];
  private lastEvents: E[] = [];
  readonly startedAt: string;

  constructor(
    private readonly engine: Engine<S, A, E, O>,
    readonly game: string,
    readonly contentHash: string,
    readonly seed: number,
    readonly options: O,
    startedAt?: string,
  ) {
    this.states = [engine.setup(seed, options)];
    this.startedAt = startedAt ?? new Date().toISOString();
  }

  get state(): S {
    return this.states[this.states.length - 1] as S;
  }
  get events(): readonly E[] {
    return this.lastEvents;
  }
  get actions(): readonly A[] {
    return this.log;
  }
  get canUndo(): boolean {
    return this.log.length > 0;
  }

  /** Applies an action; on a RuleError nothing changes and the error is rethrown. */
  act(action: A): E[] {
    const { state, events } = this.engine.apply(this.state, action);
    this.states.push(state);
    this.log.push(action);
    this.lastEvents = events;
    return events;
  }

  /** Steps back one action. Cheap: earlier states are kept. */
  undo(): void {
    if (!this.canUndo) return;
    this.log.pop();
    this.states.pop();
    this.lastEvents = [];
  }

  toSave(): SaveData<A, O> {
    return {
      version: 1,
      game: this.game,
      contentHash: this.contentHash,
      seed: this.seed,
      options: this.options,
      actions: this.log.slice(),
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Rebuilds a session from a save. If an action no longer applies (the content changed under it),
   * replay stops there and `stoppedAt` says how many actions were kept.
   */
  static fromSave<S, A, E, O>(
    engine: Engine<S, A, E, O>,
    save: SaveData<A, O>,
  ): { session: Session<S, A, E, O>; stoppedAt: number | null } {
    const session = new Session(engine, save.game, save.contentHash, save.seed, save.options, save.startedAt);
    for (let i = 0; i < save.actions.length; i++) {
      try {
        session.act(save.actions[i] as A);
      } catch (e) {
        if (e instanceof RuleError) return { session, stoppedAt: i };
        throw e;
      }
    }
    session.lastEvents = [];
    return { session, stoppedAt: null };
  }
}

/** A short stable hash of some text (FNV-1a, hex), used to tag saves with their content. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
