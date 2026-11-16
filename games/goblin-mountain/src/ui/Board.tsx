import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, Stepper, useLang } from "@boardroom/ui";
import {
  active,
  canAct,
  canMoveAny,
  dieAt,
  kingSteps,
  kingWhere,
  KING_START,
  KING_TRACK,
  placedLocation,
  targets,
  type Action,
  type FateKind,
  type State,
} from "../engine";
import { COLORS, type Color, type LocationDef } from "../types";
import { effectText, locationSummary, locName, reqText } from "./text";
import { CARD_FOLDER } from "../content";

export interface BoardProps {
  state: State;
  imageUrl: (path: string) => string | null;
  act: (a: Action) => boolean;
  canUndo: boolean;
  undo: () => void;
  openMenu: () => void;
  exit?: () => void;
}

type Mode =
  | { k: "idle" }
  | { k: "selected"; color: Color }
  | { k: "fate" }
  | { k: "fatePick"; kind: FateKind; first?: Color }
  | { k: "adjust"; minus?: Color }
  | { k: "info"; loc: LocationDef };

const NEEDS_TWO: FateKind[] = ["swap"];

export function Board(props: BoardProps) {
  const { state: s, act } = props;
  const { t, lang, setLang } = useLang();
  const [mode, setMode] = useState<Mode>({ k: "idle" });
  const slotRefs = useRef(new Map<string, HTMLDivElement>());
  const trackRef = useRef<HTMLDivElement>(null);

  // A new state from the engine resets transient selection.
  useEffect(() => setMode((m) => (m.k === "info" || m.k === "fate" ? m : { k: "idle" })), [s]);

  const artWidth = useArtWidth(s, props.imageUrl, trackRef);

  const selected = mode.k === "selected" ? mode.color : null;
  const legal = useMemo(() => (selected ? targets(s, selected) : []), [s, selected]);
  const king = kingWhere(s);

  // Scroll the first legal target into view when a die is picked.
  useEffect(() => {
    const first = legal[0];
    if (first === undefined) return;
    slotRefs.current.get(String(first))?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [legal]);

  // Keep the King or the leading die in view as the game moves on.
  useEffect(() => {
    if (selected) return;
    const lead = Math.max(-1, ...COLORS.map((c) => s.dice[c].pos).filter((p) => p.at === "track").map((p) => (p as { i: number }).i));
    slotRefs.current.get(lead >= 0 ? String(lead) : "start")?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [s.turn]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDie = (c: Color) => {
    if (mode.k === "fatePick") {
      if (NEEDS_TWO.includes(mode.kind)) {
        if (!mode.first) return setMode({ ...mode, first: c });
        if (act({ t: "fate", kind: mode.kind, a: mode.first, b: c })) setMode({ k: "idle" });
        return;
      }
      if (act({ t: "fate", kind: mode.kind, a: c })) setMode({ k: "idle" });
      return;
    }
    if (mode.k === "adjust") {
      if (!mode.minus) return setMode({ k: "adjust", minus: c });
      if (act({ t: "adjust", minus: mode.minus, plus: c })) setMode({ k: "idle" });
      return;
    }
    if (s.phase !== "move" || !active(s.dice[c])) return;
    setMode(selected === c ? { k: "idle" } : { k: "selected", color: c });
  };

  const tapSlot = (key: number | "village" | "start") => {
    if (selected && key !== "start" && legal.includes(key)) {
      act({ t: "move", color: selected, to: key });
      return;
    }
    if (typeof key === "number") {
      const d = dieAt(s, key);
      if (d && s.phase === "move" && mode.k !== "fatePick" && mode.k !== "adjust") return pickDie(d);
      if (d && (mode.k === "fatePick" || mode.k === "adjust")) return pickDie(d);
      const loc = s.track[key];
      if (loc) setMode({ k: "info", loc });
    }
  };

  const noMove = s.phase === "move" && !canMoveAny(s);
  const hint =
    mode.k === "fatePick"
      ? t(mode.first ? "fate.pickSecond" : "fate.pickDie")
      : mode.k === "adjust"
        ? t(mode.minus ? "adjust.plus" : "adjust.minus")
        : s.phase === "kingHit"
          ? t("hint.kingHit")
          : noMove
            ? t("hint.noMove")
            : selected
              ? t("hint.pickTarget", { die: t(`color.${selected}`) })
              : !s.started && !s.adjustUsed
                ? t("hint.adjust")
                : t("hint.pickDie");

  const kingLabel =
    s.king < KING_START
      ? t("king.inWarrens", { n: 6 - s.king })
      : s.king === KING_START
        ? t("king.atStart")
        : s.king - KING_TRACK >= s.track.length
          ? t("king.atVillage")
          : t("king.atTrack", { n: s.king - KING_TRACK + 1 });

  const pickingDie = mode.k === "fatePick" || mode.k === "adjust";

  return (
    <div className="gm-board">
      <header className="gm-top">
        {props.exit && (
          <button className="br-btn is-quiet gm-icon" onClick={props.exit} aria-label={t("menu.exit")}>
            ✕
          </button>
        )}
        <div className="gm-top-mid">
          <div className="gm-king">
            <span className="gm-crown">♛</span> {kingLabel} · <span className="gm-muted">{t("king.next", { n: kingSteps(s) })}</span>
          </div>
          <div className="gm-stealth" aria-label={t("stealth.label")}>
            <span className="gm-muted">{t("stealth.label")}</span>
            {COLORS.map((c) => (
              <span key={c} className={`gm-mini is-${c}${s.stealth[c] === null ? " is-gone" : ""}`}>
                {s.stealth[c] ?? "·"}
              </span>
            ))}
          </div>
        </div>
        <button className="br-btn is-quiet gm-lang" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
          {lang === "zh" ? "EN" : "中"}
        </button>
        <button className="br-btn is-quiet gm-icon" onClick={props.openMenu} aria-label={t("menu.title")} data-testid="menu">
          ⋯
        </button>
      </header>

      <div className="gm-track" ref={trackRef} data-testid="track">
        <Slot refKey="start" refs={slotRefs} onTap={() => tapSlot("start")} wide>
          <div className="gm-entrance">
            <div className="gm-entrance-title">{t("track.entrance")}</div>
            <div className="gm-warrens">
              {[6, 5, 4, 3, 2, 1].map((f, i) => (
                <span key={f} className={`gm-field${s.king === i ? " is-king" : ""}`}>
                  {s.king === i ? "♛" : f}
                </span>
              ))}
            </div>
            <div className="gm-entrance-dice">
              {COLORS.filter((c) => s.dice[c].pos.at === "start").map((c) => (
                <DieChip key={c} color={c} strength={s.dice[c].strength} selected={selected === c || (mode.k === "fatePick" && mode.first === c) || (mode.k === "adjust" && mode.minus === c)} onTap={() => pickDie(c)} />
              ))}
            </div>
          </div>
        </Slot>
        {s.track.map((loc, i) => {
          const d = dieAt(s, i);
          const layout = s.layout.find((l) => l.side === loc.side);
          const special = layout?.special ?? false;
          const image = layout?.image ? props.imageUrl(`${CARD_FOLDER}/${layout.image}`) : null;
          return (
            <Slot key={i} refKey={String(i)} refs={slotRefs} king={king === i} onTap={() => tapSlot(i)} glow={legal.includes(i)} special={special} cardStart={loc.index === 0} testId={`slot-${i}`} width={image ? artWidth : undefined}>
              <Strip loc={loc} image={image} strips={layout?.strips} />
              {image && <div className="gm-caption">{locName(loc, lang)}</div>}
              <div className="gm-slot-foot">
                {d ? (
                  <DieChip color={d} strength={s.dice[d].strength} selected={selected === d || (mode.k === "fatePick" && mode.first === d) || (mode.k === "adjust" && mode.minus === d)} onTap={() => tapSlot(i)} />
                ) : (
                  <span className="gm-slot-num">{i + 1}</span>
                )}
              </div>
            </Slot>
          );
        })}
        <Slot refKey="village" refs={slotRefs} onTap={() => tapSlot("village")} glow={legal.includes("village")} wide testId="slot-village">
          <div className={`gm-village${s.villageOpen ? "" : " is-closed"}`}>
            <div className="gm-entrance-title">{t(s.villageOpen ? "track.village" : "track.villageClosed")}</div>
            <div className="gm-village-bonus">
              {s.villageBonuses.map((b, i) => (
                <span key={i} className={i < s.villageCount ? "is-used" : ""}>
                  {i + 1}. {reqText(b.req, t)} +{b.fame}
                </span>
              ))}
            </div>
            <div className="gm-entrance-dice">
              {COLORS.filter((c) => s.dice[c].pos.at === "village").map((c) => (
                <DieChip key={c} color={c} strength={s.dice[c].strength} />
              ))}
            </div>
          </div>
        </Slot>
      </div>

      <div className="gm-hint" data-testid="hint">
        {hint}
      </div>

      <footer className="gm-panel">
        <div className="gm-res">
          <Res k="fame" v={s.fame} t={t} />
          <Res k="treasure" v={`${s.treasure}/8`} t={t} />
          <Res k="villagers" v={s.villagers} t={t} />
          <Res k="fate" v={s.fate} t={t} />
        </div>
        <div className="gm-tray">
          {COLORS.map((c) => {
            const d = s.dice[c];
            const status = d.pos.at === "village" ? t("die.village") : d.pos.at === "captured" ? t("die.captured") : d.pos.at === "start" ? t("die.start") : `#${d.pos.i + 1}`;
            const hl = selected === c || (mode.k === "fatePick" && mode.first === c) || (mode.k === "adjust" && mode.minus === c);
            const usable = active(d) && (pickingDie || (s.phase === "move" && targets(s, c).length > 0));
            return (
              <button key={c} className={`gm-die is-${c}${hl ? " is-selected" : ""}${active(d) ? "" : " is-out"}${usable ? "" : " is-dim"}`} onClick={() => pickDie(c)} data-testid={`die-${c}`}>
                <span className="gm-die-face">{d.pos.at === "captured" ? "✕" : d.strength}</span>
                <span className="gm-die-status">{status}</span>
              </button>
            );
          })}
        </div>
        <div className="gm-buttons">
          {noMove ? (
            <button className="br-btn is-primary is-block" onClick={() => act({ t: "pass" })} data-testid="pass">
              {t("hint.noMove")}
            </button>
          ) : pickingDie ? (
            <button className="br-btn is-block" onClick={() => setMode({ k: "idle" })}>
              {t("fate.cancel")}
            </button>
          ) : (
            <>
              <button className="br-btn" disabled={s.phase !== "move" || s.fate === 0} onClick={() => setMode({ k: "fate" })} data-testid="fate">
                {t("res.fate")} {s.fate}
              </button>
              {!s.started && !s.adjustUsed && (
                <button className="br-btn" onClick={() => setMode({ k: "adjust" })}>
                  {t("adjust.title")}
                </button>
              )}
              <button className="br-btn" disabled={!props.canUndo} onClick={props.undo} data-testid="undo">
                ↶ {t("menu.undo")}
              </button>
            </>
          )}
        </div>
      </footer>

      {s.phase === "action" && <ActionSheet s={s} act={act} canUndo={props.canUndo} undo={props.undo} />}
      {s.phase === "kingHit" && (
        <Sheet title={t("hint.kingHit")}>
          <div className="gm-row">
            {COLORS.filter((c) => {
              const p = s.dice[c].pos;
              return s.pending?.where === -1 ? p.at === "start" : p.at === "track" && p.i === s.pending?.where;
            }).map((c) => (
              <button key={c} className={`gm-die is-${c}`} onClick={() => act({ t: "hit", color: c })} data-testid={`hit-${c}`}>
                <span className="gm-die-face">{s.dice[c].strength}</span>
                <span className="gm-die-status">{t(`role.${c}`)}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {mode.k === "fate" && (
        <Sheet title={t("fate.title", { n: s.fate })} onClose={() => setMode({ k: "idle" })}>
          {(["swap", "plus", "minus", "set4", "stealth1"] as FateKind[]).map((kind) => (
            <button
              key={kind}
              className="br-btn is-block gm-left"
              onClick={() => {
                if (kind === "stealth1") {
                  if (act({ t: "fate", kind })) setMode({ k: "idle" });
                } else setMode({ k: "fatePick", kind });
              }}
            >
              {t(`fate.${kind}`)}
            </button>
          ))}
        </Sheet>
      )}
      {mode.k === "info" && (
        <Sheet title={locName(mode.loc, lang)} onClose={() => setMode({ k: "idle" })}>
          <div className="gm-info-req">
            {t("loc.requires")}: {reqText(mode.loc.req, t)}
          </div>
          <div>{locationSummary(mode.loc, t)}</div>
          <div className="gm-muted">{lang === "zh" ? mode.loc.en : mode.loc.zh}</div>
        </Sheet>
      )}
    </div>
  );
}

const STRIP_CHROME = 22 + 4 + 52 + 4 + 20 + 4 + 8 + 16; // king row, foot, caption, gaps, borders, track padding

/** Slot width for card art: the strip's height (what the track leaves) times the card's strip proportions. */
function useArtWidth(s: State, imageUrl: (p: string) => string | null, trackRef: React.RefObject<HTMLDivElement>): { width: number; strip: number } | undefined {
  const [ratio, setRatio] = useState<number | null>(null);
  const [height, setHeight] = useState(0);
  const first = s.layout.find((l) => l.image && !l.special);
  const url = first?.image ? imageUrl(`${CARD_FOLDER}/${first.image}`) : null;
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => img.naturalHeight && setRatio(img.naturalWidth / 4 / img.naturalHeight);
    img.src = url;
  }, [url]);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, [trackRef]);
  if (!ratio || !height) return undefined;
  // About three locations on screen: the width is capped, and the strip's height follows the card's proportions.
  const room = Math.min(height, 560) - STRIP_CHROME;
  const width = Math.round(Math.max(96, Math.min(126, room * ratio + 8)));
  return { width, strip: Math.min(room, Math.round((width - 8) / ratio)) };
}

function Slot(props: {
  refKey: string;
  refs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  children: React.ReactNode;
  onTap: () => void;
  king?: boolean;
  glow?: boolean;
  wide?: boolean;
  special?: boolean;
  cardStart?: boolean;
  testId?: string;
  /** Width for card-art slots, so a location strip keeps the card's proportions. */
  width?: { width: number; strip: number };
}) {
  return (
    <div
      ref={(el) => {
        if (el) props.refs.current.set(props.refKey, el);
        else props.refs.current.delete(props.refKey);
      }}
      className={`gm-slot${props.glow ? " is-glow" : ""}${props.wide ? " is-wide" : ""}${props.special ? " is-special" : ""}${props.cardStart ? " is-card-start" : ""}`}
      onClick={props.onTap}
      data-testid={props.testId}
      style={props.width ? ({ flexBasis: props.width.width, "--gm-strip-h": `${props.width.strip}px` } as React.CSSProperties) : undefined}
    >
      <div className="gm-slot-king">{props.king ? "♛" : ""}</div>
      {props.children}
    </div>
  );
}

/** One location: its slice of the card art (or a plain panel), with name, requirement and effect on top. */
function Strip(props: { loc: LocationDef; image: string | null; strips?: number[] }) {
  const { t, lang } = useLang();
  const { loc } = props;
  const x = props.strips && props.strips.length === 5 ? props.strips : [0, 0.25, 0.5, 0.75, 1];
  const a = x[loc.index] ?? 0;
  const b = x[loc.index + 1] ?? 1;
  const f = b - a;
  if (props.image) {
    // The card art already shows the name, requirement and reward; the caption below gives the name in the chosen language.
    return (
      <div className="gm-strip is-art">
        <img src={props.image} alt={locName(loc, lang)} draggable={false} style={{ transform: `translateX(-${(a + f / 2) * 100}%)` }} />
      </div>
    );
  }
  return (
    <div className="gm-strip is-plain">
      <span className={`gm-req${loc.req.color ? ` is-${loc.req.color}` : ""}`}>{reqText(loc.req, t)}</span>
      <div className="gm-strip-text">
        <div className="gm-strip-name">{locName(loc, lang)}</div>
        <div className="gm-strip-effect">{locationSummary(loc, t)}</div>
      </div>
    </div>
  );
}

function DieChip(props: { color: Color; strength: number; selected?: boolean; onTap?: () => void }) {
  return (
    <span
      className={`gm-chip is-${props.color}${props.selected ? " is-selected" : ""}`}
      onClick={(e) => {
        if (!props.onTap) return;
        e.stopPropagation();
        props.onTap();
      }}
    >
      {props.strength}
    </span>
  );
}

function Res(props: { k: string; v: number | string; t: (k: string) => string }) {
  return (
    <div className={`gm-res-item is-${props.k}`}>
      <span className="gm-res-v">{props.v}</span>
      <span className="gm-res-k">{props.t(`res.${props.k}`)}</span>
    </div>
  );
}

function ActionSheet(props: { s: State; act: (a: Action) => boolean; canUndo: boolean; undo: () => void }) {
  const { s, act } = props;
  const { t, lang } = useLang();
  const loc = placedLocation(s);
  if (!loc) return null;
  const slot = loc.slots[0];
  const choice = slot?.effects.find((e) => e.k === "choice");
  const options = choice && choice.k === "choice" ? choice.options : null;
  return (
    <Sheet title={locName(loc, lang)}>
      <div>{locationSummary(loc, t)}</div>
      {options ? (
        options.map((o, i) => (
          <button key={i} className="br-btn is-primary is-block" disabled={!canAct(s, i)} onClick={() => act({ t: "act", option: i })} data-testid={`act-${i}`}>
            {slot?.cost ? `${t("effect.pay", { n: slot.cost })} → ` : ""}
            {o.map((e) => effectText(e, t)).join(", ")}
          </button>
        ))
      ) : (
        <button className="br-btn is-primary is-block" disabled={!canAct(s)} onClick={() => act({ t: "act" })} data-testid="act">
          {s.acted > 0 ? t("action.again") : t("action.do")}
        </button>
      )}
      <button className="br-btn is-block" onClick={() => act({ t: "done" })} data-testid="done">
        {s.acted > 0 ? t("action.done") : t("action.skip")}
      </button>
      <button className="br-btn is-quiet is-block" disabled={!props.canUndo} onClick={props.undo} data-testid="sheet-undo">
        ↶ {t("menu.undo")}
      </button>
    </Sheet>
  );
}

export function ManualSheet(props: { s: State; act: (a: Action) => boolean; onClose: () => void }) {
  const { s, act } = props;
  const { t } = useLang();
  return (
    <Sheet title={t("manual.title")} onClose={props.onClose} tall>
      <div className="gm-muted">{t("manual.hint")}</div>
      {COLORS.filter((c) => active(s.dice[c])).map((c) => (
        <Stepper key={c} label={`${t(`color.${c}`)} · ${t(`role.${c}`)}`} value={s.dice[c].strength} min={1} max={6} onChange={(v) => act({ t: "manual", target: c, value: v })} />
      ))}
      {(["fame", "treasure", "villagers", "fate"] as const).map((k) => (
        <Stepper key={k} label={t(`res.${k}`)} value={s[k]} min={0} max={k === "treasure" ? 8 : 99} onChange={(v) => act({ t: "manual", target: k, value: v })} />
      ))}
      <Stepper label={t("manual.king")} value={s.king} min={0} max={KING_TRACK + s.track.length} onChange={(v) => act({ t: "manual", target: "king", value: v })} />
    </Sheet>
  );
}
