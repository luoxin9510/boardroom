import { useState } from "react";
import { Sheet, Stepper, useLang } from "@boardroom/ui";
import type { Action, State } from "../engine";
import { RANKS, STATS, type ContentPack, type Rank, type Stat } from "../types";
import { AssetPicker } from "./Tabs";
import { pick } from "./text";

type Step = "truths" | "stats" | "assets" | "bonds" | "background" | "inciting";
const POOL = [3, 2, 2, 1, 1];

/**
 * Character creation (spec §5): world truths → stats → 3 assets → bonds → background vow → inciting incident.
 * Every step can be skipped and done later on the character and vow tabs; reopen it from the menu.
 */
export function Wizard(props: {
  state: State;
  pack: ContentPack;
  act: (a: Action) => boolean;
  onClose: () => void;
  openMove: (id: string) => void;
  openRules: (topic: string) => void;
}) {
  const { t, lang } = useLang();
  const steps: Step[] = [...(props.pack.truths.length ? (["truths"] as const) : []), "stats", "assets", "bonds", "background", "inciting"];
  const [i, setI] = useState(0);
  // Vows made in this run of the wizard, kept here so stepping back and forth doesn't offer to make them again.
  const [made, setMade] = useState<Record<string, string>>({});
  const vowProps = (k: string) => ({ made: made[k] ?? null, onMade: (name: string) => setMade((m) => ({ ...m, [k]: name })) });
  const step = steps[i] as Step;
  const last = i === steps.length - 1;
  const topic: Record<Step, string> = { truths: "truths", stats: "action-roll", assets: "assets", bonds: "bonds", background: "vows", inciting: "vows" };
  const swear =
    props.pack.moves.find((m) => m.id === "swear-an-iron-vow") ?? props.pack.moves.find((m) => m.category === "quest" && m.roll === "action");

  return (
    <Sheet title={`${t("wiz.title")} · ${t(`wiz.${step}`)}`} tall>
      <div className="iw-wiz" data-testid={`wiz-${step}`}>
        <div className="iw-row">
          <span className="iw-muted iw-small iw-grow">{t("wiz.step", { n: i + 1, total: steps.length })}</span>
          <button className="br-btn is-quiet" onClick={() => props.openRules(topic[step])} data-testid="wiz-rules">
            {t("rules.link")}
          </button>
        </div>
        {step === "truths" && <Truths {...props} />}
        {step === "stats" && <Stats {...props} />}
        {step === "assets" && <Assets {...props} />}
        {step === "bonds" && <Bonds {...props} />}
        {step === "background" && <Vow key="bg" {...props} {...vowProps("bg")} hint="wiz.backgroundHint" rank="epic" />}
        {step === "inciting" && (
          <>
            <Vow key="inc" {...props} {...vowProps("inc")} hint="wiz.incitingHint" rank="dangerous" />
            {swear && (
              <button
                className="br-btn is-block"
                onClick={() => {
                  props.onClose();
                  props.openMove(swear.id);
                }}
                data-testid="wiz-swear"
              >
                {t("wiz.swear")}（{pick(swear.name, lang)}）
              </button>
            )}
          </>
        )}
        <div className="iw-wiz-nav">
          <button className="br-btn is-quiet" disabled={i === 0} onClick={() => setI(i - 1)} data-testid="wiz-back">
            {t("wiz.back")}
          </button>
          <button className="br-btn is-quiet" onClick={props.onClose} data-testid="wiz-skip">
            {t("wiz.skip")}
          </button>
          <button className="br-btn is-primary" onClick={() => (last ? props.onClose() : setI(i + 1))} data-testid="wiz-next">
            {last ? t("wiz.finish") : t("wiz.next")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

type P = { state: State; pack: ContentPack; act: (a: Action) => boolean };

function Truths(props: P) {
  const { t, lang } = useLang();
  return (
    <>
      <p className="iw-muted iw-small">{t("wiz.truthsHint")}</p>
      {props.pack.truths.map((tr) => {
        const sel = props.state.truths?.[tr.id];
        return (
          <section key={tr.id} className="iw-truth" data-testid={`truth-${tr.id}`}>
            <div className="iw-row">
              <b className="iw-grow">{pick(tr.name, lang)}</b>
              <button className="br-btn is-quiet" onClick={() => props.act({ t: "truth", truth: tr.id })} data-testid={`truth-roll-${tr.id}`}>
                {t("wiz.roll")}
              </button>
            </div>
            {tr.rows.map((r, k) => (
              <button key={k} className={`iw-pick${sel === k ? " is-on" : ""}`} onClick={() => props.act({ t: "truth", truth: tr.id, row: k })} data-testid={`truth-${tr.id}-${k}`}>
                <span>{pick(r.text, lang)}</span>
                {sel === k && pick(r.seed, lang) && <span className="iw-small iw-muted">{t("wiz.seed", { seed: pick(r.seed, lang) })}</span>}
              </button>
            ))}
          </section>
        );
      })}
    </>
  );
}

function Stats(props: P) {
  const { t } = useLang();
  const c = props.state.character;
  // Values already handed out, read from the sheet so the step resumes where it was left. If they aren't a part of
  // 3/2/2/1/1 (set by hand on the character tab), only "start over" is offered.
  const given = STATS.map((s) => c.stats[s]).filter((v) => v > 0);
  const left = [...POOL];
  let fits = true;
  for (const v of given) {
    const k = left.indexOf(v);
    if (k >= 0) left.splice(k, 1);
    else fits = false;
  }
  if (!fits) left.length = 0;
  const [sel, setSel] = useState<Stat | null>(null);
  return (
    <>
      <p className="iw-muted iw-small">{t("wiz.statsHint")}</p>
      {!fits && <p className="iw-bad iw-small">{t("wiz.statsOff")}</p>}
      <div className="iw-stats">
        {STATS.map((s) => (
          <button key={s} className={`iw-stat${sel === s ? " is-on" : ""}`} onClick={() => setSel(s)} data-testid={`wiz-stat-${s}`}>
            <b>{c.stats[s]}</b>
            <span>{t(`stat.${s}`)}</span>
          </button>
        ))}
      </div>
      <div className="iw-chips">
        {[...new Set(left)].map((v) => (
          <button
            key={v}
            className="iw-chip"
            disabled={!sel || c.stats[sel] > 0}
            onClick={() => {
              if (sel && props.act({ t: "stat", stat: sel, value: v })) setSel(null);
            }}
            data-testid={`wiz-value-${v}`}
          >
            {v} × {left.filter((x) => x === v).length}
          </button>
        ))}
        {given.length > 0 && (
          <button className="iw-chip" onClick={() => STATS.forEach((s) => c.stats[s] > 0 && props.act({ t: "stat", stat: s, value: 0 }))} data-testid="wiz-stats-reset">
            {t("wiz.statsReset")}
          </button>
        )}
      </div>
    </>
  );
}

function Assets(props: P) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const owned = props.state.character.assets;
  return (
    <>
      <p className="iw-muted iw-small">{t("wiz.assetsHint", { n: owned.length })}</p>
      {owned.map((a) => (
        <div key={a.id} className="iw-row">
          <b className="iw-grow">{pick(a.name, lang)}</b>
          <button className="br-btn is-quiet" onClick={() => props.act({ t: "removeAsset", asset: a.id })}>
            ✕
          </button>
        </div>
      ))}
      {owned.length < 3 && (
        <button className="br-btn is-block" onClick={() => setOpen(true)} data-testid="wiz-add-asset">
          ＋ {t("char.addAsset")}
        </button>
      )}
      {open && <AssetPicker pack={props.pack} state={props.state} act={props.act} onClose={() => setOpen(false)} />}
    </>
  );
}

function Bonds(props: P) {
  const { t } = useLang();
  const b = props.state.character.bonds;
  return (
    <>
      <p className="iw-muted iw-small">{t("wiz.bondsHint")}</p>
      <Stepper label={t("char.bonds")} value={b} min={0} max={Math.max(3, b)} onChange={(v) => props.act({ t: "bonds", ticks: v - b })} />
    </>
  );
}

function Vow(props: P & { hint: string; rank: Rank; made: string | null; onMade: (name: string) => void }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [rank, setRank] = useState<Rank>(props.rank);
  const made = props.made;
  return (
    <>
      <p className="iw-muted iw-small">{t(props.hint)}</p>
      {made ? (
        <div className="iw-good" data-testid="wiz-vow-made">
          ✓ {t("wiz.vowCreated", { name: made })}
        </div>
      ) : (
        <>
          <input className="iw-input" placeholder={t("track.name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="wiz-vow-name" />
          <div className="iw-chips">
            {RANKS.map((r) => (
              <button key={r} className={`iw-chip${rank === r ? " is-on" : ""}`} onClick={() => setRank(r)}>
                {t(`rank.${r}`)}
              </button>
            ))}
          </div>
          <button
            className="br-btn is-primary is-block"
            disabled={!name.trim()}
            onClick={() => {
              if (props.act({ t: "newTrack", kind: "vow", name: name.trim(), rank })) props.onMade(name.trim());
            }}
            data-testid="wiz-vow-create"
          >
            {t("track.create")}
          </button>
        </>
      )}
    </>
  );
}
