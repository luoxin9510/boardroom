import { useState } from "react";
import { Sheet, Stepper, useLang } from "@boardroom/ui";
import { boxes, momentumMax, momentumReset, ODDS, xpAvailable, type Action, type Entry, type Odds, type State } from "../engine";
import { DEBILITIES, MOVE_CATEGORIES, RANKS, STATS, TRACK_KINDS, type Asset, type ContentPack, type Rank, type TrackKind } from "../types";
import { entryText, pick, type Note } from "./text";

type Act = (a: Action) => boolean;

/** Ten boxes, each showing 0–4 ticks. */
export function Boxes(props: { ticks: number }) {
  return (
    <div className="iw-boxes" aria-label={`${boxes(props.ticks)}/10`}>
      {Array.from({ length: 10 }, (_, i) => {
        const n = Math.max(0, Math.min(4, props.ticks - i * 4));
        return <span key={i} className={`iw-box is-${n}`} />;
      })}
    </div>
  );
}

// ---------- 角色 ----------

export function CharacterTab(props: { state: State; pack: ContentPack; act: Act }) {
  const { t, lang } = useLang();
  const c = props.state.character;
  const [statEdit, setStatEdit] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(c.name);
  const groups = [
    ["conditions", ["wounded", "shaken", "unprepared", "encumbered"]],
    ["banes", ["maimed", "corrupted"]],
    ["burdens", ["cursed", "tormented"]],
  ] as const;
  return (
    <div className="iw-tab" data-testid="tab-character">
      <label className="iw-row iw-namerow">
        <span className="iw-label">{t("char.name")}</span>
        <input className="iw-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== c.name && props.act({ t: "name", name })} data-testid="char-name" />
      </label>

      <div className="iw-label">{t("char.stats")}</div>
      <div className="iw-stats">
        {STATS.map((s) => (
          <button key={s} className="iw-stat" onClick={() => setStatEdit(s)} data-testid={`stat-${s}`}>
            <b>{c.stats[s]}</b>
            <span>{t(`stat.${s}`)}</span>
          </button>
        ))}
      </div>

      <div className="iw-label">{t("char.debilities")}</div>
      {groups.map(([g, ids]) => (
        <div key={g} className="iw-debs">
          <span className="iw-muted iw-small">{t(`deb.${g}`)}</span>
          {ids.map((id) => {
            const on = c.debilities.includes(id);
            return (
              <button key={id} className={`iw-chip${on ? " is-on is-bad" : ""}`} onClick={() => props.act({ t: "debility", id, on: !on })} data-testid={`deb-${id}`}>
                {t(`deb.${id}`)}
              </button>
            );
          })}
        </div>
      ))}

      <div className="iw-row">
        <span className="iw-label">{t("char.bonds")}</span>
        <button className="br-btn" onClick={() => props.act({ t: "bonds", ticks: 1 })} data-testid="bond-tick">
          {t("track.bondsMark")}
        </button>
      </div>
      <Boxes ticks={c.bonds} />

      <div className="iw-row">
        <span className="iw-label">{t("char.xp")}</span>
        <span className="iw-muted iw-small">{t("char.xpLine", { earned: c.xpEarned, spent: c.xpSpent, free: xpAvailable(c) })}</span>
        <button className="br-btn" onClick={() => props.act({ t: "xp", delta: 1 })} data-testid="xp-plus">
          +1
        </button>
      </div>

      {props.state.tracks.some((x) => x.kind === "combat" && x.status === "active") && (
        <label className="iw-check">
          <input type="checkbox" checked={c.initiative} onChange={(e) => props.act({ t: "initiative", on: e.target.checked })} /> {t("char.initiative")}
        </label>
      )}

      <div className="iw-row">
        <span className="iw-label">{t("char.assets")}</span>
        <button className="br-btn" onClick={() => setAdding(true)} data-testid="add-asset">
          ＋ {t("char.addAsset")}
        </button>
      </div>
      {c.assets.map((a) => {
        const def = props.pack.assets.find((x) => x.id === a.id);
        return (
          <div key={a.id} className="iw-asset" data-testid={`asset-${a.id}`}>
            <div className="iw-asset-head">
              <b>{pick(a.name, lang)}</b>
              {def && <span className="iw-muted iw-small">{t(`assetcat.${def.category}`)}</span>}
            </div>
            {a.field !== undefined && (
              <input className="iw-input" placeholder={def?.field ?? t("asset.field")} defaultValue={a.field} onBlur={(e) => e.target.value !== a.field && props.act({ t: "assetField", asset: a.id, value: e.target.value })} />
            )}
            {a.health !== undefined && <Stepper label={t("asset.health")} value={a.health} min={0} max={def?.health ?? 5} onChange={(v) => props.act({ t: "assetHealth", asset: a.id, delta: v - (a.health as number) })} />}
            {(def?.abilities ?? []).map((ab, i) => (
              <label key={i} className="iw-ability">
                <input
                  type="checkbox"
                  checked={a.marked[i] ?? false}
                  disabled={a.marked[i]}
                  onChange={() => props.act({ t: "upgrade", asset: a.id, ability: i })}
                  data-testid={`ability-${a.id}-${i}`}
                />
                <span>{pick(ab.text, lang)}</span>
              </label>
            ))}
            <button className="br-btn is-quiet iw-left" onClick={() => props.act({ t: "removeAsset", asset: a.id })}>
              {t("asset.remove")}
            </button>
          </div>
        );
      })}

      {statEdit && (
        <Sheet title={t(`stat.${statEdit}`)} onClose={() => setStatEdit(null)}>
          <Stepper label={t(`stat.${statEdit}`)} value={c.stats[statEdit as "edge"]} min={0} max={4} onChange={(v) => props.act({ t: "stat", stat: statEdit as "edge", value: v })} />
        </Sheet>
      )}
      {adding && <AssetPicker pack={props.pack} state={props.state} act={props.act} onClose={() => setAdding(false)} />}
    </div>
  );
}

function AssetPicker(props: { pack: ContentPack; state: State; act: Act; onClose: () => void }) {
  const { t, lang } = useLang();
  const [cat, setCat] = useState<Asset["category"] | "all">("all");
  const [free, setFree] = useState(props.state.character.assets.length < 3);
  const owned = new Set(props.state.character.assets.map((a) => a.id));
  const list = props.pack.assets.filter((a) => (cat === "all" || a.category === cat) && !owned.has(a.id));
  return (
    <Sheet title={t("char.addAsset")} onClose={props.onClose} tall>
      <div className="iw-chips">
        {(["all", "companion", "path", "combat", "ritual"] as const).map((k) => (
          <button key={k} className={`iw-chip${cat === k ? " is-on" : ""}`} onClick={() => setCat(k)}>
            {k === "all" ? t("asset.all") : t(`assetcat.${k}`)}
          </button>
        ))}
      </div>
      <label className="iw-check">
        <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} data-testid="asset-free" /> {t("asset.free")}
      </label>
      {list.map((a) => (
        <button
          key={a.id}
          className="iw-pick"
          onClick={() => {
            if (props.act({ t: "addAsset", asset: a.id, free })) props.onClose();
          }}
          data-testid={`pick-${a.id}`}
        >
          <b>{pick(a.name, lang)}</b>
          <span className="iw-small iw-muted">{pick(a.abilities[0]?.text, lang)}</span>
        </button>
      ))}
    </Sheet>
  );
}

// ---------- 动作 ----------

export function MovesTab(props: { pack: ContentPack; open: (id: string) => void }) {
  const { t, lang } = useLang();
  return (
    <div className="iw-tab" data-testid="tab-moves">
      {MOVE_CATEGORIES.map((cat) => {
        const moves = props.pack.moves.filter((m) => m.category === cat);
        if (!moves.length) return null;
        return (
          <section key={cat}>
            <div className="iw-label">{t(`cat.${cat}`)}</div>
            <div className="iw-movelist">
              {moves.map((m) => (
                <button key={m.id} className="iw-movebtn" onClick={() => props.open(m.id)} data-testid={`move-${m.id}`}>
                  {pick(m.name, lang)}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------- 誓言 ----------

export function TracksTab(props: { state: State; pack: ContentPack; act: Act; openMove: (id: string) => void }) {
  const { t } = useLang();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<TrackKind>("vow");
  const [name, setName] = useState("");
  const [rank, setRank] = useState<Rank>("dangerous");
  const progressMove = (k: string) => props.pack.moves.find((m) => m.roll === "progress" && m.track === k);
  const tracks = [...props.state.tracks].sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active"));
  return (
    <div className="iw-tab" data-testid="tab-tracks">
      <button className="br-btn is-block" onClick={() => setCreating(true)} data-testid="new-track">
        ＋ {t("track.new")}
      </button>
      {!tracks.length && <p className="iw-muted">{t("track.none")}</p>}
      {tracks.map((x) => (
        <div key={x.id} className={`iw-track${x.status !== "active" ? " is-closed" : ""}`} data-testid={`track-${x.id}`}>
          <div className="iw-track-head">
            <b>{x.name}</b>
            <span className="iw-muted iw-small">
              {t(`kind.${x.kind}`)} · {t(`rank.${x.rank}`)} · {t("track.boxes", { n: boxes(x.ticks) })}
            </span>
          </div>
          <Boxes ticks={x.ticks} />
          {x.status === "active" ? (
            <div className="iw-row iw-wrap">
              <button className="br-btn" onClick={() => props.act({ t: "mark", track: x.id })} data-testid={`mark-${x.id}`}>
                {t("track.mark")}
              </button>
              {progressMove(x.kind) && (
                <button className="br-btn" onClick={() => props.openMove(progressMove(x.kind)?.id as string)} data-testid={`roll-${x.id}`}>
                  🎲 {t("track.roll")}
                </button>
              )}
              <button className="br-btn is-quiet" onClick={() => props.act({ t: "close", track: x.id, status: "fulfilled" })} data-testid={`fulfill-${x.id}`}>
                ✓ {t("track.fulfill")}
              </button>
              <button className="br-btn is-quiet" onClick={() => props.act({ t: "close", track: x.id, status: "forsaken" })}>
                {t("track.forsake")}
              </button>
            </div>
          ) : (
            <div className="iw-muted iw-small">{t(x.status === "fulfilled" ? "track.done" : "track.forsaken")}</div>
          )}
        </div>
      ))}
      {creating && (
        <Sheet title={t("track.new")} onClose={() => setCreating(false)}>
          <div className="iw-chips">
            {TRACK_KINDS.map((k) => (
              <button key={k} className={`iw-chip${kind === k ? " is-on" : ""}`} onClick={() => setKind(k)} data-testid={`kind-${k}`}>
                {t(`kind.${k}`)}
              </button>
            ))}
          </div>
          <input className="iw-input" placeholder={t("track.name")} value={name} onChange={(e) => setName(e.target.value)} data-testid="track-name" />
          <div className="iw-chips">
            {RANKS.map((r) => (
              <button key={r} className={`iw-chip${rank === r ? " is-on" : ""}`} onClick={() => setRank(r)} data-testid={`rank-${r}`}>
                {t(`rank.${r}`)}
              </button>
            ))}
          </div>
          <button
            className="br-btn is-primary is-block"
            disabled={!name.trim()}
            onClick={() => {
              if (props.act({ t: "newTrack", kind, name, rank })) {
                setCreating(false);
                setName("");
              }
            }}
            data-testid="create-track"
          >
            {t("track.create")}
          </button>
        </Sheet>
      )}
    </div>
  );
}

// ---------- 先知 ----------

export function OraclesTab(props: { pack: ContentPack; act: Act; last: Entry | undefined }) {
  const { t, lang } = useLang();
  const groups = [...new Set(props.pack.oracles.map((o) => o.group))];
  const last = props.last && (props.last.k === "ask" || props.last.k === "oracle") ? props.last : undefined;
  return (
    <div className="iw-tab" data-testid="tab-oracles">
      <div className="iw-label">{t("oracle.ask")}</div>
      <div className="iw-chips">
        {(Object.keys(ODDS) as Odds[]).map((o) => (
          <button key={o} className="iw-chip" onClick={() => props.act({ t: "ask", odds: o })} data-testid={`ask-${o}`}>
            {t(`odds.${o}`)}
          </button>
        ))}
      </div>
      {last && (
        <div className="iw-oracle-result" data-testid="oracle-result">
          {last.k === "ask" ? (
            <>
              <b className={last.yes ? "iw-good" : "iw-bad"}>{t(last.yes ? "oracle.yes" : "oracle.no")}</b> <span className="iw-muted">({last.roll}){last.match ? ` · ${t("outcome.match")}` : ""}</span>
            </>
          ) : (
            <>
              <span className="iw-muted iw-small">
                {pick(last.name, lang)} ({last.roll})
              </span>
              <div>{pick(last.text, lang)}</div>
            </>
          )}
        </div>
      )}
      {!props.pack.oracles.length && <p className="iw-muted">{t("oracle.none")}</p>}
      {groups.map((g) => (
        <section key={g}>
          <div className="iw-label">{g}</div>
          <div className="iw-movelist">
            {props.pack.oracles
              .filter((o) => o.group === g)
              .map((o) => (
                <button key={o.id} className="iw-movebtn" onClick={() => props.act({ t: "oracle", table: o.id })} data-testid={`oracle-${o.id}`}>
                  🎲 {pick(o.name, lang)}
                </button>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- 日志 ----------

export function JournalTab(props: { journal: readonly Entry[]; notes: Note[]; pack: ContentPack; addNote: (text: string) => void; exportIt: () => void }) {
  const { t, lang } = useLang();
  const [text, setText] = useState("");
  const items: ({ k: "entry"; e: Entry; i: number } | { k: "note"; n: Note })[] = [];
  const sorted = [...props.notes].sort((a, b) => a.at - b.at);
  let n = 0;
  props.journal.forEach((e, i) => {
    while (n < sorted.length && (sorted[n] as Note).at <= i) items.push({ k: "note", n: sorted[n++] as Note });
    items.push({ k: "entry", e, i });
  });
  while (n < sorted.length) items.push({ k: "note", n: sorted[n++] as Note });
  return (
    <div className="iw-tab" data-testid="tab-journal">
      <div className="iw-note-input">
        <textarea className="iw-input" rows={3} placeholder={t("journal.placeholder")} value={text} onChange={(e) => setText(e.target.value)} data-testid="note-text" />
        <div className="iw-row">
          <button
            className="br-btn is-primary"
            disabled={!text.trim()}
            onClick={() => {
              props.addNote(text.trim());
              setText("");
            }}
            data-testid="note-add"
          >
            {t("journal.add")}
          </button>
          <button className="br-btn" onClick={props.exportIt} data-testid="export">
            ⬆︎ {t("journal.export")}
          </button>
        </div>
      </div>
      {!items.length && <p className="iw-muted">{t("journal.empty")}</p>}
      <div className="iw-journal">
        {[...items].reverse().map((it, k) =>
          it.k === "note" ? (
            <p key={`n${k}`} className="iw-jnote">
              {it.n.text}
            </p>
          ) : (
            <div key={`e${it.i}`} className={`iw-jentry is-${it.e.k}`}>
              {entryText(it.e, t, props.pack, lang)}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

// ---------- 顶部资源条 ----------

export function MetersBar(props: { state: State; act: Act }) {
  const { t } = useLang();
  const c = props.state.character;
  const [edit, setEdit] = useState<"health" | "spirit" | "supply" | "momentum" | null>(null);
  const value = (m: string) => (m === "momentum" ? c.momentum : c[m as "health"]);
  return (
    <div className="iw-meters" data-testid="meters">
      {(["momentum", "health", "spirit", "supply"] as const).map((m) => (
        <button key={m} className={`iw-meter is-${m}`} onClick={() => setEdit(m)} data-testid={`meter-${m}`}>
          <b>{m === "momentum" && c.momentum > 0 ? `+${c.momentum}` : value(m)}</b>
          <span>{t(`meter.${m}`)}</span>
        </button>
      ))}
      {edit && (
        <Sheet title={t(`meter.${edit}`)} onClose={() => setEdit(null)}>
          <Stepper label={t(`meter.${edit}`)} value={value(edit)} min={edit === "momentum" ? -6 : 0} max={edit === "momentum" ? momentumMax(c) : 5} onChange={(v) => props.act({ t: "meter", meter: edit, delta: v - value(edit) })} />
          {edit === "momentum" && <div className="iw-muted iw-small">{t("momentum.detail", { max: momentumMax(c), reset: momentumReset(c) })}</div>}
          {edit !== "momentum" && <div className="iw-muted iw-small">{DEBILITIES.filter((d) => c.debilities.includes(d)).map((d) => t(`deb.${d}`)).join(" · ")}</div>}
        </Sheet>
      )}
    </div>
  );
}
