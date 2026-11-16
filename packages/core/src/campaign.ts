import { RuleError } from "./errors";

/** A game engine for long campaigns: no seed-based setup; the starting state is built by the game and saved. */
export interface CampaignEngine<S, A, E> {
  apply(state: S, action: A): { state: S; events: E[] };
}

/**
 * A campaign save: a state snapshot plus the actions after it. Unlike `SaveData` it is not tied to a content
 * hash (a campaign outlives many content-pack updates): content is referenced by id inside the state and actions.
 * The state holds its own random-number state, so replaying the actions gives the same results.
 */
export interface CampaignSave<S, A> {
  version: 2;
  game: string;
  id: string;
  title: string;
  base: S;
  actions: A[];
  /** The state after all actions: used as-is when the actions no longer replay (content removed an id they use). */
  state: S;
  startedAt: string;
  updatedAt: string;
}

/**
 * A campaign in progress. Every `window` actions the oldest `window` are folded into the base snapshot, so a save
 * stays small and loading replays at most 2 × window actions, while undo can always step back at least `window`.
 */
export class Campaign<S, A, E> {
  private base: S;
  private log: A[] = [];
  private states: S[];
  private lastEvents: E[] = [];
  readonly startedAt: string;

  constructor(
    private readonly engine: CampaignEngine<S, A, E>,
    readonly game: string,
    readonly id: string,
    public title: string,
    start: S,
    startedAt?: string,
    private readonly window = 50,
  ) {
    this.base = start;
    this.states = [start];
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
    if (this.log.length >= 2 * this.window) {
      this.base = this.states[this.window] as S;
      this.states = this.states.slice(this.window);
      this.log = this.log.slice(this.window);
    }
    return events;
  }

  undo(): void {
    if (!this.canUndo) return;
    this.log.pop();
    this.states.pop();
    this.lastEvents = [];
  }

  toSave(): CampaignSave<S, A> {
    return {
      version: 2,
      game: this.game,
      id: this.id,
      title: this.title,
      base: this.base,
      actions: this.log.slice(),
      state: this.state,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Rebuilds a campaign. If an action no longer applies (the content pack dropped something it uses), the saved
   * current state is taken as the new starting point: nothing played is lost, only the undo history.
   * `stoppedAt` then says at which action replay failed.
   */
  static fromSave<S, A, E>(engine: CampaignEngine<S, A, E>, save: CampaignSave<S, A>, window = 50): { campaign: Campaign<S, A, E>; stoppedAt: number | null } {
    const c = new Campaign(engine, save.game, save.id, save.title, save.base, save.startedAt, window);
    for (let i = 0; i < save.actions.length; i++) {
      try {
        c.act(save.actions[i] as A);
      } catch (e) {
        if (e instanceof RuleError) return { campaign: new Campaign(engine, save.game, save.id, save.title, save.state, save.startedAt, window), stoppedAt: i };
        throw e;
      }
    }
    c.lastEvents = [];
    return { campaign: c, stoppedAt: null };
  }
}
