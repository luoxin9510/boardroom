import { useMemo, useState } from "react";
import { Stepper, useLang } from "@boardroom/ui";
import { atomsOf, parseEffect, resolveChoice, type Atom, type Effect } from "../effects";
import type { State } from "../engine";
import type { ContentPack, TrackKind } from "../types";
import { atomText, pick } from "./text";

const needsTrackAtom = (a: Atom) => a.k === "progress" || a.k === "boxes" || (a.k === "xp" && typeof a.delta === "string");

/**
 * Turns a consequence expression into buttons: choices become chips (pick N), "?" amounts get a stepper, progress
 * atoms show which track they mark (and a picker when there's a choice), move:/oracle: pointers become links.
 * "Apply" sends the chosen atoms to the engine.
 */
export function Consequence(props: {
  src: string;
  state: State;
  pack: ContentPack;
  apply: (atoms: Atom[], amounts: number[], track?: string) => boolean;
  openMove: (id: string) => void;
  rollOracle: (id: string) => void;
  /** The track kind this move's progress belongs to (combat moves mark combat tracks). */
  kind?: TrackKind;
  /** Already taken (the roll is settled): show it as applied. */
  done?: boolean;
  testid?: string;
}) {
  const { t, lang } = useLang();
  const effect = useMemo(() => parseEffect(props.src), [props.src]);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [track, setTrack] = useState<string | undefined>(undefined);
  const [appliedHere, setApplied] = useState(false);
  const applied = appliedHere || !!props.done;
  if (!effect) return null;
  const id = props.testid ?? "eff";

  const all = atomsOf(effect);
  const pointers = all.filter((a) => a.k === "move" || a.k === "oracle");
  const chosen = resolveChoice(effect, picks);
  const actionable = chosen?.filter((a) => a.k !== "move" && a.k !== "oracle") ?? null;
  const askAtoms = (actionable ?? []).filter((a) => a.k === "meter" && typeof a.delta === "string");
  const usesTrack = (actionable ?? []).some(needsTrackAtom);
  const candidates = props.state.tracks.filter((x) => x.status === "active" && (!props.kind || x.kind === props.kind));
  const fixed = props.state.pending?.track;
  const chosenTrack = fixed ?? track ?? (candidates.length === 1 ? candidates[0]?.id : undefined);
  const trackName = props.state.tracks.find((x) => x.id === chosenTrack)?.name;
  const ready = actionable !== null && actionable.length > 0 && (!usesTrack || chosenTrack);

  const render = (e: Effect, path: string): JSX.Element => {
    if (e.k === "all") return <>{e.items.map((x, i) => <span key={i}>{i > 0 && " + "}{render(x, `${path}.${i}`)}</span>)}</>;
    if (e.k === "choose") {
      const sel = picks[path] ?? [];
      const toggle = (i: number) =>
        setPicks((p) => {
          const cur = p[path] ?? [];
          let next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
          if (e.n === 1) next = cur.includes(i) ? [] : [i];
          else if (e.n !== "any" && next.length > e.n) next = next.slice(1);
          return { ...p, [path]: next };
        });
      return (
        <div className="iw-choice" onClick={(ev) => ev.stopPropagation()}>
          <div className="iw-muted iw-small">{e.n === "any" ? t("eff.chooseAny") : t("eff.chooseN", { n: e.n })}</div>
          <div className="iw-chips">
            {e.options.map((o, i) => (
              // A div, not a button: an option may itself hold a choice (no buttons inside buttons).
              <div
                key={i}
                role="button"
                tabIndex={0}
                aria-pressed={sel.includes(i)}
                className={`iw-chip${sel.includes(i) ? " is-on" : ""}${applied ? " is-disabled" : ""}`}
                onClick={() => !applied && toggle(i)}
                data-testid={`${id}-opt-${i}`}
              >
                {render(o, `${path}.${i}`)}
              </div>
            ))}
          </div>
        </div>
      );
    }
    return <span>{atomText(e, t, props.pack, lang)}</span>;
  };

  return (
    <div className="iw-eff" data-testid={id}>
      {!all.every((a) => a.k === "move" || a.k === "oracle") && <div className="iw-eff-body">{render(effect, "r")}</div>}
      {/* Steppers follow the chosen atoms; keyed by atom so a value stays with its atom when the choice changes. */}
      {askAtoms.map((a) => {
        const k = atomText(a, t, props.pack, lang);
        return <Stepper key={k} label={k} value={amounts[k] ?? 1} min={0} max={10} onChange={(v) => setAmounts((m) => ({ ...m, [k]: v }))} />;
      })}
      {usesTrack && !applied && (
        <div className="iw-small" data-testid={`${id}-track`}>
          {fixed || candidates.length <= 1 ? (
            <span className={trackName ? "iw-muted" : "iw-bad"}>{trackName ? t("eff.willMark", { name: trackName }) : t("move.noTrack", { kind: t(`kind.${props.kind ?? "vow"}`) })}</span>
          ) : (
            <select className="iw-select" value={chosenTrack ?? ""} onChange={(e) => setTrack(e.target.value)} data-testid={`${id}-track-select`}>
              <option value="">{t("move.track")}</option>
              {candidates.map((x) => (
                <option key={x.id} value={x.id}>
                  {t(`kind.${x.kind}`)} · {x.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {(actionable?.length ?? 0) > 0 || !chosen ? (
        <button
          className={`br-btn ${applied ? "" : "is-primary"} is-block`}
          disabled={!ready || applied}
          onClick={() => {
            if (!actionable) return;
            const amts = askAtoms.map((a) => amounts[atomText(a, t, props.pack, lang)] ?? 1);
            if (props.apply(actionable, amts, chosenTrack)) setApplied(true);
          }}
          data-testid={`${id}-apply`}
        >
          {applied ? `✓ ${t("eff.applied")}` : t("eff.apply")}
        </button>
      ) : null}
      {pointers.map((a, i) =>
        a.k === "move" ? (
          <button key={i} className="br-btn is-quiet iw-left" onClick={() => props.openMove(a.id)} data-testid={`${id}-move-${a.id}`}>
            {t("eff.next", { name: pick(props.pack.moves.find((m) => m.id === a.id)?.name, lang) || a.id })}
          </button>
        ) : a.k === "oracle" ? (
          <button key={i} className="br-btn iw-left" onClick={() => props.rollOracle(a.id)} data-testid={`eff-oracle-${a.id}`}>
            🎲 {t("eff.rollTable", { name: pick(props.pack.oracles.find((o) => o.id === a.id)?.name, lang) || a.id })}
          </button>
        ) : null,
      )}
    </div>
  );
}
