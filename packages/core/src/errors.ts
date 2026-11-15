/**
 * A move the rules do not allow. `key` names a message in the game's zh/en tables;
 * `params` fill its placeholders, so the UI can show it in either language.
 */
export class RuleError extends Error {
  constructor(
    readonly key: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
    this.name = "RuleError";
  }
}

/** Throws a RuleError when `cond` is false. */
export function need(cond: unknown, key: string, params?: Record<string, string | number>): asserts cond {
  if (!cond) throw new RuleError(key, params);
}

/** A problem in a content note, pointing at the file, line and column so the author can fix it. */
export class ContentError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    readonly detail: string,
  ) {
    super(`${file}:${line} ${detail}`);
    this.name = "ContentError";
  }
}
