/** A game engine for long campaigns: no seed-based setup; the starting state is built by the game and saved. */
export interface CampaignEngine<S, A, E> {
  apply(state: S, action: A): { state: S; events: E[] };
  /**
   * The parts of a state that must come out the same when a save is replayed on newer content (numbers, tracks,
   * the random state), leaving out wording that may legitimately change. Without it the whole state is compared.
   */
  fingerprint?(state: S): string;
}

/**
 * A campaign save: a state snapshot plus the actions after it, the state they lead to, and the journal of events.
 * It is not tied to a content hash (a campaign outlives many content-pack updates); content is referenced by id.
 * The state holds its own random-number state, so replaying the actions gives the same results.
 */
export interface CampaignSave<S, A, E> {
  version: 2;
  game: string;
  id: string;
  title: string;
  base: S;
  actions: A[];
  /** The state after all actions: used as-is when replay fails or comes out different (the content changed). */
  state: S;
  /** Every event so far, oldest first; `marks[i]` is the journal length before `actions[i]`. */
  journal: E[];
  marks: number[];
  startedAt: string;
  updatedAt: string;
}

/**
 * A campaign in progress. Every `window` actions the oldest `window` are folded into the base snapshot, so a save
 * stays small and loading replays at most 2 × window actions, while undo can always step back at least `window`.
 * The journal (every event) lives here, outside the states, so it is never copied per action.
 */
export class Campaign<S, A, E> {
  private base: S;
  private log: A[] = [];
  private states: S[];
  private marks: number[] = [];
  private entries: E[] = [];
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
  get journal(): readonly E[] {
    return this.entries;
  }
  get canUndo(): boolean {
    return this.log.length > 0;
  }

  /** Applies an action; on a RuleError nothing changes and the error is rethrown. */
  act(action: A): E[] {
    const { state, events } = this.engine.apply(this.state, action);
    this.marks.push(this.entries.length);
    this.entries.push(...events);
    this.states.push(state);
    this.log.push(action);
    this.lastEvents = events;
    if (this.log.length >= 2 * this.window) {
      this.base = this.states[this.window] as S;
      this.states = this.states.slice(this.window);
      this.log = this.log.slice(this.window);
      this.marks = this.marks.slice(this.window);
    }
    return events;
  }

  /** Steps back one action, taking its journal entries with it. */
  undo(): void {
    if (!this.canUndo) return;
    this.log.pop();
    this.states.pop();
    this.entries.length = this.marks.pop() as number;
    this.lastEvents = [];
  }

  toSave(): CampaignSave<S, A, E> {
    return {
      version: 2,
      game: this.game,
      id: this.id,
      title: this.title,
      base: this.base,
      actions: this.log.slice(),
      state: this.state,
      journal: this.entries.slice(),
      marks: this.marks.slice(),
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Rebuilds a campaign. The actions are replayed so undo works; if replay fails or ends somewhere other than the
   * saved state (the content pack changed a rule, a table or removed something), the saved state is used as-is:
   * nothing played is lost, only the undo history. `fellBack` then says why.
   */
  static fromSave<S, A, E>(
    engine: CampaignEngine<S, A, E>,
    save: CampaignSave<S, A, E>,
    window = 50,
  ): { campaign: Campaign<S, A, E>; fellBack: null | "failed" | "differs" } {
    const print = (s: S) => (engine.fingerprint ? engine.fingerprint(s) : JSON.stringify(s));
    const fallback = (why: "failed" | "differs") => {
      const c = new Campaign(engine, save.game, save.id, save.title, save.state, save.startedAt, window);
      c.entries = (save.journal ?? []).slice();
      return { campaign: c, fellBack: why };
    };
    const c = new Campaign(engine, save.game, save.id, save.title, save.base, save.startedAt, window);
    try {
      for (const a of save.actions) c.act(a);
    } catch {
      return fallback("failed");
    }
    if (print(c.state) !== print(save.state)) return fallback("differs");
    // The replayed events are the same actions' events; keep the saved journal (it has the older history too).
    c.entries = (save.journal ?? []).slice();
    c.marks = save.marks?.length === save.actions.length ? save.marks.slice() : save.actions.map(() => c.entries.length);
    c.lastEvents = [];
    return { campaign: c, fellBack: null };
  }
}
