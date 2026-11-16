import { useMemo, useState } from "react";
import { Stepper, useLang } from "@boardroom/ui";
import { atomsOf, parseEffect, type Atom, type Effect } from "../effects";
import type { State } from "../engine";
import type { ContentPack } from "../types";
import { atomText, pick } from "./text";

/**
 * Turns a consequence expression into buttons: choices become chips (pick N), "?" amounts get a stepper, progress
 * atoms get a track picker, move:/oracle: pointers become links. "Apply" sends the chosen atoms to the engine.
 */
export function Consequence(props: {
  src: string;
  state: State;
  pack: ContentPack;
  apply: (atoms: Atom[], amounts: number[], track?: string) => boolean;
  openMove: (id: string) => void;
  rollOracle: (id: string) => void;
  testid?: string;
}) {
  const { t, lang } = useLang();
  const effect = useMemo(() => parseEffect(props.src), [props.src]);
  const [picks, setPicks] = useState<Record<string, number[]>>({});
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [track, setTrack] = useState<string | undefined>(undefined);
  const [applied, setApplied] = useState(false);
  if (!effect) return null;

  const all = atomsOf(effect);
  const pointers = all.filter((a) => a.k === "move" || a.k === "oracle");
  const needsTrack = all.some((a) => a.k === "progress" || a.k === "boxes" || (a.k === "xp" && typeof a.delta === "string"));
  const active = props.state.tracks.filter((x) => x.status === "active");
  const chosenTrack = track ?? props.state.pending?.track ?? (active.length === 1 ? active[0]?.id : undefined);

  /** The atoms the current picks select, or null while a choice is incomplete. Paths key the choice nodes. */
  const resolve = (e: Effect, path: string): Atom[] | null => {
    if (e.k === "all") {
      const parts = e.items.map((x, i) => resolve(x, `${path}.${i}`));
      return parts.some((p) => p === null) ? null : (parts.flat() as Atom[]);
    }
    if (e.k === "choose") {
      const sel = picks[path] ?? [];
      if (e.n !== "any" && sel.length !== e.n) return null;
      const parts = sel.map((i) => resolve(e.options[i] as Effect, `${path}.${i}`));
      return parts.some((p) => p === null) ? null : (parts.flat() as Atom[]);
    }
    return [e];
  };
  const chosen = resolve(effect, "r");
  const actionable = chosen?.filter((a) => a.k !== "move" && a.k !== "oracle") ?? null;
  const askAtoms = (actionable ?? []).filter((a) => a.k === "meter" && typeof a.delta === "string");
  const ready = actionable !== null && actionable.length > 0 && (!actionable.some((a) => a.k === "progress" || a.k === "boxes" || (a.k === "xp" && typeof a.delta === "string")) || chosenTrack);

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
        <div className="iw-choice">
          <div className="iw-muted iw-small">{e.n === "any" ? t("eff.chooseAny") : t("eff.chooseN", { n: e.n })}</div>
          <div className="iw-chips">
            {e.options.map((o, i) => (
              <button key={i} className={`iw-chip${sel.includes(i) ? " is-on" : ""}`} onClick={() => toggle(i)} disabled={applied} data-testid={`${props.testid ?? "eff"}-opt-${i}`}>
                {render(o, `${path}.${i}`)}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return <span>{atomText(e, t, props.pack, lang)}</span>;
  };

  return (
    <div className="iw-eff" data-testid={props.testid ?? "eff"}>
      {!all.every((a) => a.k === "move" || a.k === "oracle") && <div className="iw-eff-body">{render(effect, "r")}</div>}
      {askAtoms.map((a, i) => (
        <Stepper key={i} label={atomText(a, t, props.pack, lang)} value={amounts[i] ?? 1} min={0} max={10} onChange={(v) => setAmounts((m) => ({ ...m, [i]: v }))} />
      ))}
      {needsTrack && !props.state.pending?.track && active.length > 1 && (
        <select className="iw-select" value={chosenTrack ?? ""} onChange={(e) => setTrack(e.target.value)} data-testid="eff-track">
          <option value="">{t("move.track")}</option>
          {active.map((x) => (
            <option key={x.id} value={x.id}>
              {t(`kind.${x.kind}`)} · {x.name}
            </option>
          ))}
        </select>
      )}
      {(actionable?.length ?? 0) > 0 || !chosen ? (
        <button
          className={`br-btn ${applied ? "" : "is-primary"} is-block`}
          disabled={!ready || applied}
          onClick={() => {
            if (!actionable) return;
            if (props.apply(actionable, askAtoms.map((_, i) => amounts[i] ?? 1), chosenTrack)) setApplied(true);
          }}
          data-testid={`${props.testid ?? "eff"}-apply`}
        >
          {applied ? `✓ ${t("eff.applied")}` : t("eff.apply")}
        </button>
      ) : null}
      {pointers.map((a, i) =>
        a.k === "move" ? (
          <button key={i} className="br-btn is-quiet iw-left" onClick={() => props.openMove(a.id)}>
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
