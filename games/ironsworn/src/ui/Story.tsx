import { useLang } from "@boardroom/ui";
import type { Action, RosterItem, State, StoryOption } from "../engine";
import type { ContentPack } from "../types";
import { Banner } from "./art";
import { Consequence } from "./Consequence";
import { pick } from "./text";

type Act = (a: Action) => boolean;

/** The 故事 tab (spec §6 剧本): the scenario list, or the running story's page, waiting consequences and choices. */
export function StoryTab(props: {
  state: State;
  pack: ContentPack;
  act: Act;
  /** A choice with a move: open that move's sheet; the sheet sends the roll back to the story. */
  rollFor: (index: number, choice: StoryOption) => void;
  openMove: (id: string) => void;
  rollOracle: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const run = props.state.story;
  const def = run && props.pack.stories.find((x) => x.id === run.id);
  const moveName = (id: string) => pick(props.pack.moves.find((m) => m.id === id)?.name, lang) || id;
  return (
    <div className="iw-tab" data-testid="tab-story">
      <Banner name="故事" />
      {!run &&
        props.pack.stories.map((st) => (
          <div key={st.id} className="iw-card iw-story-card" data-testid={`story-${st.id}`}>
            <h3>{pick(st.name, lang)}</h3>
            {st.author && <div className="iw-muted iw-small">{[st.author, st.license].filter(Boolean).join(" · ")}</div>}
            {st.source && <div className="iw-muted iw-small">{t("story.source", { source: st.source })}</div>}
            {st.description && <p>{st.description}</p>}
            {st.warning && <p className="iw-story-warning">⚠ {st.warning}</p>}
            <button className="br-btn is-primary is-block" onClick={() => props.act({ t: "storyStart", story: st.id })} data-testid="story-start">
              {t("story.start")}
            </button>
          </div>
        ))}
      {run && (
        <>
          {def && <div className="iw-muted iw-small">{pick(def.name, lang)}</div>}
          {run.chose && <p className="iw-story-chosen">▸ {run.chose}</p>}
          <div className="iw-story-page" data-testid="story-page">
            {run.page.map((l, i) =>
              l.k === "scene" ? (
                <h3 key={i} className="iw-story-scene">
                  {l.text}
                </h3>
              ) : l.k === "oracle" ? (
                <p key={i} className="iw-oracle-result">
                  <span className="iw-muted iw-small">
                    {pick(l.name, lang)} ({l.roll})
                  </span>
                  <br />
                  {pick(l.text, lang)}
                </p>
              ) : (
                <p key={i}>{l.text}</p>
              ),
            )}
          </div>
          {run.fx.map((src, i) => (
            <div key={`${run.ink.length}:${i}:${src}`} className="iw-story-fx" data-testid="story-fx">
              <Consequence
                src={src}
                state={props.state}
                pack={props.pack}
                apply={(atoms, amounts, track, asset) => props.act({ t: "storyFx", index: i, atoms, amounts, track: track ?? run.vow, asset })}
                openMove={props.openMove}
                rollOracle={props.rollOracle}
                kind="vow"
                testid={`story-fx-${i}`}
              />
              <button className="br-btn is-quiet iw-small" onClick={() => props.act({ t: "storyFx", index: i, atoms: [] })} data-testid={`story-fx-skip-${i}`}>
                {t("story.skip")}
              </button>
            </div>
          ))}
          {!run.over && (
            <div className="iw-story-choices">
              {run.choices.map((ch, i) => (
                <button
                  key={`${run.ink.length}:${i}`}
                  className="br-btn is-block iw-story-choice"
                  disabled={run.fx.length > 0}
                  onClick={() => (ch.move ? props.rollFor(i, ch) : props.act({ t: "storyChoose", index: i }))}
                  data-testid={`story-choice-${i}`}
                >
                  <span>{ch.text}</span>
                  {ch.move && <span className="iw-muted iw-small">🎲 {t("story.roll", { move: moveName(ch.move), stat: ch.stat ? t(`stat.${ch.stat}`) : "" })}</span>}
                </button>
              ))}
            </div>
          )}
          {run.over && <p className="iw-story-end">{t("story.over")}</p>}
          <button className={`br-btn ${run.over ? "is-primary" : "is-quiet"} is-block`} disabled={run.fx.length > 0} onClick={() => props.act({ t: "storyEnd" })} data-testid="story-end">
            {t(run.over ? "story.finish" : "story.leave")}
          </button>
        </>
      )}
      <Roster items={props.state.roster ?? []} />
    </div>
  );
}

function Roster(props: { items: RosterItem[] }) {
  const { t } = useLang();
  if (!props.items.length) return null;
  return (
    <details className="iw-roster" data-testid="roster">
      <summary>{t("story.roster", { n: props.items.length })}</summary>
      {(["npc", "place", "clue"] as const).map((k) => {
        const list = props.items.filter((x) => x.k === k);
        return list.length ? (
          <div key={k}>
            <div className="iw-label">{t(`roster.${k}`)}</div>
            {list.map((x) => (
              <p key={x.name} className="iw-small">
                <b>{x.name}</b>
                {x.note ? ` — ${x.note}` : ""}
              </p>
            ))}
          </div>
        ) : null;
      })}
    </details>
  );
}
