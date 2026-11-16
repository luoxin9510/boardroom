import { useState } from "react";
import { Sheet, Stepper, useLang } from "@boardroom/ui";
import { canBurn, judge, type Action, type State } from "../engine";
import { atomsOf, parseEffect, type Atom } from "../effects";
import type { ContentPack, Move, Outcome, RollStat } from "../types";
import { Consequence } from "./Consequence";
import { pick, statName } from "./text";

/** One move: its trigger, the roll (or progress roll), then the outcome with its consequence buttons. */
export function MoveSheet(props: {
  move: Move;
  state: State;
  pack: ContentPack;
  act: (a: Action) => boolean;
  onClose: () => void;
  openMove: (id: string) => void;
  rollOracle: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const { move, state } = props;
  const c = state.character;
  const [stat, setStat] = useState(move.stats[0]);
  const [adds, setAdds] = useState(0);
  const [manual, setManual] = useState(false);
  const [dice, setDice] = useState({ d6: 1, c1: 1, c2: 1 });
  const [track, setTrack] = useState<string | undefined>();
  const pending = state.pending && state.pending.move === move.id ? state.pending : null;

  const apply = (atoms: Atom[], amounts: number[], tr?: string, asset?: string) => props.act({ t: "effect", atoms, amounts, track: tr, asset });
  const applyFrom = (source: string) => (atoms: Atom[], amounts: number[], tr?: string, asset?: string) => props.act({ t: "effect", atoms, amounts, track: tr, asset, source });
  // Combat moves mark the foe's (combat) track; progress moves their own kind.
  const kind = move.track && move.track !== "bonds" ? move.track : move.category === "combat" ? "combat" : undefined;
  const consequence = (src: string, testid: string, done?: boolean, source?: string) => (
    <Consequence key={`${move.id}:${testid}:${src}`} src={src} state={state} pack={props.pack} apply={source ? applyFrom(source) : apply} openMove={props.openMove} rollOracle={props.rollOracle} kind={kind} done={done} testid={testid} />
  );

  const statValue = (s: string) => (["health", "spirit", "supply"].includes(s) ? c[s as "health"] : c.stats[s as "edge"]);
  const auto = move.pick && move.stats.length > 1;
  const autoStat = auto
    ? move.stats.reduce((best, s) => ((move.pick === "max" ? statValue(s) > statValue(best) : statValue(s) < statValue(best)) ? s : best), move.stats[0] as string)
    : undefined;
  const tracks = state.tracks.filter((x) => x.status === "active" && x.kind === move.track);
  const chosenTrack = track ?? (tracks.length === 1 ? tracks[0]?.id : undefined);
  const nameLower = [move.name.zh, move.name.en].filter(Boolean);
  const related = c.assets.flatMap((a) =>
    a.marked.flatMap((on, i) => {
      if (!on) return [];
      const ab = props.pack.assets.find((x) => x.id === a.id)?.abilities[i];
      const text = pick(ab?.text, lang);
      return nameLower.some((n) => text.includes(n)) ? [{ asset: pick(a.name, lang), text, effect: ab?.effect ?? "", source: `asset:${a.id}:${i}` }] : [];
    }),
  );

  const roll = () => {
    const d = manual ? dice : undefined;
    if (move.roll === "action") props.act({ t: "roll", move: move.id, stat: (autoStat ?? stat) as RollStat | undefined, adds, dice: d });
    else props.act({ t: "progressRoll", move: move.id, track: move.track === "bonds" ? undefined : chosenTrack, dice: d && { c1: d.c1, c2: d.c2 } });
  };

  const outcome = pending?.outcome as Outcome | undefined;
  const usesHarm = !!outcome && atomsOf(parseEffect(move.results[outcome]?.effect ?? "")).some((a) => a.k === "progress" && a.times === "harm");
  const burnTo = pending && canBurn(state) ? judge(pending.score, pending.c1, pending.c2, c.momentum) : null;

  return (
    <Sheet title={pick(move.name, lang)} onClose={props.onClose} tall>
      <div className="iw-move" data-testid="move-sheet">
        <p className="iw-trigger">{pick(move.trigger, lang)}</p>

        {!pending && move.results.before && (
          <div className="iw-block">
            <div className="iw-label">{t("move.before")}</div>
            <p>{pick(move.results.before.text, lang)}</p>
            {consequence(move.results.before.effect, "before")}
          </div>
        )}

        {!pending && move.roll === "none" && move.results.any && (
          <div className="iw-block">
            <p>{pick(move.results.any.text, lang)}</p>
            {consequence(move.results.any.effect, "any")}
          </div>
        )}

        {!pending && move.roll === "action" && (
          <div className="iw-block">
            <div className="iw-label">{t("move.stat")}</div>
            {auto ? (
              <div className="iw-muted">{t("move.picked", { which: t(move.pick === "max" ? "move.higher" : "move.lower"), stat: `${statName(autoStat, t)} ${statValue(autoStat as string)}` })}</div>
            ) : (
              <div className="iw-chips">
                {move.stats.map((s) => (
                  <button key={s} className={`iw-chip${s === stat ? " is-on" : ""}`} onClick={() => setStat(s)} data-testid={`stat-${s}`}>
                    {statName(s, t)} {statValue(s)}
                  </button>
                ))}
              </div>
            )}
            <Stepper label={t("move.adds")} value={adds} min={0} max={5} onChange={setAdds} />
            {(state.bonus ?? 0) > 0 && (
              <div className="iw-good iw-small" data-testid="bonus">
                {t("move.bonus", { n: state.bonus ?? 0 })}
              </div>
            )}
            {related.length > 0 && (
              <div className="iw-related">
                <div className="iw-muted iw-small">{t("move.related")}</div>
                {related.map((r, i) => (
                  <div key={i} className="iw-small">
                    <b>{r.asset}</b>：{r.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!pending && move.roll === "progress" && move.track !== "bonds" && (
          <div className="iw-block">
            {tracks.length === 0 ? (
              <div className="iw-muted">{t("move.noTrack", { kind: t(`kind.${move.track}`) })}</div>
            ) : (
              <>
                <div className="iw-label">{t("move.track")}</div>
                <div className="iw-chips">
                  {tracks.map((x) => (
                    <button key={x.id} className={`iw-chip${x.id === chosenTrack ? " is-on" : ""}`} onClick={() => setTrack(x.id)}>
                      {x.name} · {Math.floor(x.ticks / 4)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!pending && move.roll !== "none" && (
          <div className="iw-block">
            <label className="iw-check">
              <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} data-testid="manual-dice" /> {t("move.manual")}
            </label>
            {manual && (
              <div className="iw-dice-in">
                {(move.roll === "action" ? (["d6", "c1", "c2"] as const) : (["c1", "c2"] as const)).map((k) => (
                  <label key={k}>
                    <span className="iw-small iw-muted">{t(`move.${k}`)}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={k === "d6" ? 6 : 10}
                      value={dice[k]}
                      onChange={(e) => setDice((d) => ({ ...d, [k]: Number(e.target.value) }))}
                      data-testid={`dice-${k}`}
                    />
                  </label>
                ))}
              </div>
            )}
            <button
              className="br-btn is-primary is-block"
              onClick={roll}
              disabled={move.roll === "progress" && move.track !== "bonds" && !chosenTrack}
              data-testid="roll"
            >
              🎲 {move.roll === "action" ? t("move.roll") : t("move.progressRoll")}
            </button>
          </div>
        )}

        {pending && outcome && (
          <div className="iw-block" data-testid="result">
            <div className="iw-dice">
              {pending.kind === "action" && (
                <span className="iw-die is-action">
                  {pending.cancelled ? "0" : pending.actionDie}
                  <small>d6</small>
                </span>
              )}
              <span className="iw-score">
                {pending.kind === "action" ? `${pending.cancelled ? 0 : pending.actionDie}+${pending.statValue}+${pending.adds} = ` : `${t("move.progressScore")} `}
                <b>{pending.score}</b>
              </span>
              <span className="iw-vs">vs</span>
              <span className="iw-die">{pending.c1}</span>
              <span className="iw-die">{pending.c2}</span>
            </div>
            <div className={`iw-outcome is-${outcome}`} data-testid="outcome">
              {t(`outcome.${outcome}`)}
              {pending.match && <span className="iw-match"> · {t("outcome.match")}</span>}
            </div>
            {burnTo && (
              <button className="br-btn is-block" onClick={() => props.act({ t: "burn" })} data-testid="burn">
                🔥 {t("move.burn", { m: c.momentum, outcome: t(`outcome.${burnTo}`) })}
              </button>
            )}
            <p>{pick(move.results[outcome]?.text, lang)}</p>
            {usesHarm && (
              <div className="iw-row" data-testid="harm">
                <span className="iw-label">{t("eff.harm", { n: pending.harm })}</span>
                <button className="br-btn" disabled={pending.resolved} onClick={() => props.act({ t: "effect", atoms: [{ k: "harm", n: 1 }] })} data-testid="harm-up">
                  {t("eff.harmUp")}
                </button>
              </div>
            )}
            {move.results[outcome]?.effect ? <div key={`${outcome}-${pending.burned}`}>{consequence(move.results[outcome]?.effect ?? "", `res-${outcome}`, pending.resolved)}</div> : null}
            {related.length > 0 && (
              <div className="iw-related">
                <div className="iw-muted iw-small">{t("move.related")}</div>
                {related.map((r, i) => (
                  <div key={i} className="iw-small">
                    <b>{r.asset}</b>：{r.text}
                    {r.effect && consequence(r.effect, `asset-${i}`, pending.used?.includes(r.source), r.source)}
                  </div>
                ))}
              </div>
            )}
            <button
              className="br-btn is-block"
              onClick={() => {
                props.act({ t: "endRoll" });
                props.onClose();
              }}
              data-testid="done"
            >
              {t("move.done")}
            </button>
          </div>
        )}

        <details className="iw-results">
          <summary>{t("move.results")}</summary>
          {(["strong", "weak", "miss"] as const).map((o) =>
            move.results[o] ? (
              <p key={o}>
                <b>{t(`outcome.${o}`)}</b>：{pick(move.results[o]?.text, lang)}
              </p>
            ) : null,
          )}
        </details>
      </div>
    </Sheet>
  );
}
