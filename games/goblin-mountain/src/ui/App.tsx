import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ContentError, langFromLocale, newSeed, RuleError, Session, type Host, type Lang, type SaveData } from "@boardroom/core";
import { LangProvider, RulesView, Sheet, Toasts, useLang, useToasts, useWakeLock } from "@boardroom/ui";
import { CARD_FOLDER, parseContent } from "../content";
import { makeEngine, score, type Action, type Event, type Options, type State } from "../engine";
import { messages } from "../messages";
import { recordName, recordNote } from "../record";
import type { ContentPack } from "../types";
import { Board, ManualSheet } from "./Board";
import { feed } from "./text";
import { Coach } from "./Coach";
import { tutorialGame } from "../tutorial";
import "./gm.css";

type GmSession = Session<State, Action, Event, Options>;
type GmSave = SaveData<Action, Options> & { finished?: boolean };

const GAME = "goblin-mountain";
const SAVE_DIR = "对局/存档";
const RULES_FOLDER = "规则";

export function App(props: { host: Host }) {
  const { host } = props;
  const [lang, setLangState] = useState<Lang>(() => host.getSetting<Lang>("lang") ?? langFromLocale(host.locale()));
  const setLang = (l: Lang) => {
    setLangState(l);
    void host.setSetting("lang", l);
  };
  return (
    <LangProvider tables={messages} lang={lang} onChange={setLang}>
      <div className="br-root gm-root">
        <Game host={host} />
      </div>
    </LangProvider>
  );
}

function Game({ host }: { host: Host }) {
  const { t, lang } = useLang();
  const { toasts, push } = useToasts();
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latest, setLatest] = useState<GmSave | null>(null);
  const [menu, setMenu] = useState<"none" | "menu" | "manual">("none");
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [rulesNotes, setRulesNotes] = useState<{ path: string; text: string }[]>([]);
  /** undefined: rules closed; null: open at the top; a string: open at that topic. */
  const [rules, setRules] = useState<string | null | undefined>(undefined);
  /** The tutorial's current step, or null when no tutorial is running. */
  const [tutStep, setTutStep] = useState<number | null>(null);
  /** The tutorial game is never saved, so it can't replace the player's real "continue". */
  const tutorial = useRef(false);
  const [seenTutorial, setSeenTutorial] = useState(() => host.getSetting<boolean>("tutorialSeen") === true);
  const session = useRef<GmSession | null>(null);
  /** Saves are written one after another, so an older save can never land after a newer one. */
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const tRef = useRef(t);
  tRef.current = t;

  useWakeLock(true);

  const load = useCallback(async () => {
    try {
      const notes = await host.readNotes(CARD_FOLDER);
      setPack(parseContent(notes));
      setError(null);
    } catch (e) {
      if (e instanceof ContentError) setError(tRef.current("err.content", { detail: e.message }));
      else setError(String(e));
    }
  }, [host]);

  // Load content and find the last unfinished game.
  useEffect(() => {
    void load();
    void findLatest(host).then(setLatest);
    void host.readNotes(RULES_FOLDER).then(setRulesNotes).catch(() => setRulesNotes([]));
    return host.onContentChange(() => {
      void load();
      if (session.current) push(tRef.current("toast.contentChanged"));
    });
  }, [host, load, push]);

  const save = useCallback(
    (finished = false) => {
      const s = session.current;
      if (!s || tutorial.current) return;
      const data: GmSave = { ...s.toSave(), finished };
      const text = JSON.stringify(data);
      writes.current = writes.current.then(() => host.writeFile(savePath(data), text)).catch((e: unknown) => push(tRef.current("toast.saveFailed", { detail: String(e) }), "bad"));
    },
    [host, push],
  );

  const start = (options: Options) => {
    if (!pack) return;
    session.current = new Session(makeEngine(pack), GAME, pack.hash, newSeed(), options);
    tutorial.current = false;
    setTutStep(null);
    setSavedPath(null);
    save();
    rerender();
  };

  const resume = (data: GmSave) => {
    if (!pack) return;
    const { session: s, stoppedAt } = Session.fromSave(makeEngine(pack), data);
    session.current = s;
    tutorial.current = false;
    setTutStep(null);
    if (stoppedAt !== null) push(t("toast.replayStopped", { n: stoppedAt }), "bad");
    setSavedPath(null);
    rerender();
  };

  const act = (a: Action): boolean => {
    const s = session.current;
    if (!s) return false;
    try {
      const events = s.act(a);
      for (const f of feed(events, t)) push(f.text, f.tone);
      save(s.state.phase === "over");
      rerender();
      return true;
    } catch (e) {
      if (e instanceof RuleError) {
        push(t(e.key, e.params), "bad");
        return false;
      }
      throw e;
    }
  };

  const undo = () => {
    const s = session.current;
    if (!s?.canUndo) return;
    s.undo();
    save();
    setSavedPath(null);
    push(t("toast.undone"));
    rerender();
  };

  /** A guided game on the player's own cards (built-in ones if those can't be used). Never saved; leaves any saved game alone. */
  const startTutorial = () => {
    const tg = tutorialGame(pack);
    session.current = new Session(makeEngine(tg.pack), GAME, tg.pack.hash, tg.seed, { difficulty: "normal" });
    tutorial.current = true;
    setTutStep(0);
    setMenu("none");
    setSavedPath(null);
    markSeen();
    rerender();
  };

  const markSeen = () => {
    setSeenTutorial(true);
    void host.setSetting("tutorialSeen", true);
  };

  /** Leaves the current game for the start screen. A real game is marked finished; a tutorial game never touched the saves. */
  const abandon = () => {
    const wasTutorial = tutorial.current;
    save(true);
    tutorial.current = false;
    setTutStep(null);
    session.current = null;
    if (!wasTutorial) setLatest(null);
    setMenu("none");
    rerender();
    // Once the save queue is written, look again: "continue" must reflect what is really stored.
    void writes.current.then(() => findLatest(host)).then(setLatest);
  };

  /** Exports the game as a markdown note (share sheet or download), ready to drop into a vault. */
  const shareRecord = async () => {
    const s = session.current;
    if (!s) return;
    const name = recordName(s.state, t);
    try {
      await host.share(name, recordNote(s.state, s.toSave(), t), "text/markdown");
      setSavedPath(name);
    } catch (e) {
      // Closing the share sheet is not an error worth showing.
      if ((e as Error)?.name !== "AbortError") push(t("toast.saveFailed", { detail: String(e) }), "bad");
    }
  };

  const rulesImage = (name: string) => host.imageUrl(`${RULES_FOLDER}/图/${name}`) ?? host.imageUrl(`${RULES_FOLDER}/${name}`) ?? host.imageUrl(`${CARD_FOLDER}/图/${name}`);
  const rulesView =
    rules === undefined ? null : (
      <RulesView
        notes={rulesNotes}
        lang={lang}
        image={rulesImage}
        topic={rules}
        labels={{ title: t("rules.title"), empty: t("rules.empty"), close: t("rules.close") }}
        onClose={() => setRules(undefined)}
      />
    );

  if (error) {
    return (
      <div className="gm-screen">
        <h2>{t("game.title")}</h2>
        <pre className="gm-error">{error}</pre>
        {host.exit && <button className="br-btn" onClick={host.exit}>{t("menu.exit")}</button>}
      </div>
    );
  }
  if (!pack) return <div className="gm-screen">…</div>;

  const s = session.current;
  if (!s) {
    return (
      <div className="gm-screen gm-start">
        <h1>{t("game.title")}</h1>
        <div className="gm-muted">{t("game.subtitle")}</div>
        {!seenTutorial && (
          <div className="gm-firstrun" data-testid="first-run">
            <div>{t("start.firstRun")}</div>
            <div className="gm-row">
              <button className="br-btn is-primary" onClick={startTutorial} data-testid="first-run-yes">
                {t("start.tutorialYes")}
              </button>
              <button className="br-btn is-quiet" onClick={markSeen} data-testid="first-run-no">
                {t("start.tutorialNo")}
              </button>
            </div>
          </div>
        )}
        {latest && !latest.finished && latest.contentHash === pack.hash && (
          <button className="br-btn is-primary is-block" onClick={() => resume(latest)} data-testid="continue">
            {t("start.continue")}
          </button>
        )}
        {latest && !latest.finished && latest.contentHash !== pack.hash && <div className="gm-muted" data-testid="changed">{t("start.changed")}</div>}
        <div className="gm-muted gm-gap">{t("start.pick")}</div>
        {(["normal", "hard"] as const).map((d) => (
          <button key={d} className="br-btn is-block" onClick={() => start({ difficulty: d })} data-testid={`new-${d}`}>
            {t("start.new")} · {t(`difficulty.${d}`)}
          </button>
        ))}
        <div className="gm-row gm-gap">
          <button className="br-btn gm-grow" onClick={startTutorial} data-testid="tutorial">
            🎓 {t("menu.tutorial")}
          </button>
          <button className="br-btn gm-grow" onClick={() => setRules(null)} data-testid="open-rules">
            📖 {t("menu.rules")}
          </button>
        </div>
        {host.exit && <button className="br-btn is-quiet" onClick={host.exit}>{t("menu.exit")}</button>}
        <Toasts toasts={toasts} />
        {rulesView}
      </div>
    );
  }

  const state = s.state;
  const sc = state.phase === "over" ? score(state) : null;
  return (
    <>
      <Board
        state={state}
        imageUrl={(p) => host.imageUrl(p)}
        act={act}
        canUndo={s.canUndo}
        undo={undo}
        openMenu={() => setMenu("menu")}
        exit={host.exit}
        openRules={(topic) => setRules(topic ?? null)}
        coach={
          tutStep === null
            ? undefined
            : (view) => <Coach view={view} step={tutStep} onStep={setTutStep} onEnd={() => setTutStep(null)} onTopic={(topic) => setRules(topic)} />
        }
      />
      {menu === "menu" && (
        <MenuSheet
          onClose={() => setMenu("none")}
          canUndo={s.canUndo}
          undo={undo}
          manual={() => setMenu("manual")}
          rules={() => {
            setMenu("none");
            setRules(null);
          }}
          tutorial={startTutorial}
          restart={abandon}
          exit={host.exit}
        />
      )}
      {menu === "manual" && <ManualSheet s={state} act={act} onClose={() => setMenu("none")} />}
      {sc && (
        <div className="gm-over" data-testid="over">
          <h1>{sc.won ? t("over.won") : t("over.lost")}</h1>
          {sc.won ? (
            <>
              <div className="gm-rating">{t(`rating.${sc.rating}`)}</div>
              <table className="gm-score">
                <tbody>
                  <tr><td>{t("over.fame")}</td><td>{sc.fame}</td></tr>
                  <tr><td>{t("over.treasure")}</td><td>{sc.fromTreasure}</td></tr>
                  <tr><td>{t("over.villagers")}</td><td>{sc.fromVillagers}</td></tr>
                  <tr><td>{t("over.captured")}</td><td>{sc.fromCaptured}</td></tr>
                  <tr className="gm-total"><td>{t("over.total")}</td><td data-testid="total">{sc.total}</td></tr>
                </tbody>
              </table>
            </>
          ) : (
            <p>{t("over.notCounted")}</p>
          )}
          {savedPath ? (
            <div className="gm-muted">{t("over.saved", { path: savedPath })}</div>
          ) : (
            <button className="br-btn is-block" onClick={() => void shareRecord()} data-testid="record">
              {t("over.save")}
            </button>
          )}
          <button className="br-btn is-primary is-block" onClick={abandon} data-testid="again">
            {t("over.again")}
          </button>
          <button className="br-btn is-quiet" disabled={!s.canUndo} onClick={undo}>
            ↶ {t("menu.undo")}
          </button>
        </div>
      )}
      <Toasts toasts={toasts} />
      {rulesView}
    </>
  );
}

function MenuSheet(props: { onClose: () => void; canUndo: boolean; undo: () => void; manual: () => void; rules: () => void; tutorial: () => void; restart: () => void; exit?: () => void }) {
  const { t, lang, setLang } = useLang();
  return (
    <Sheet title={t("menu.title")} onClose={props.onClose}>
      <button className="br-btn is-block" disabled={!props.canUndo} onClick={props.undo}>
        ↶ {t("menu.undo")}
      </button>
      <button className="br-btn is-block" onClick={props.rules} data-testid="menu-rules">
        📖 {t("menu.rules")}
      </button>
      <button className="br-btn is-block" onClick={props.tutorial} data-testid="menu-tutorial">
        🎓 {t("menu.tutorial")}
      </button>
      <button className="br-btn is-block" onClick={props.manual} data-testid="manual">
        {t("menu.manual")}
      </button>
      <button className="br-btn is-block" onClick={() => setLang(lang === "zh" ? "en" : "zh")} data-testid="lang">
        {t("menu.lang")}
      </button>
      <button className="br-btn is-block" onClick={props.restart}>
        {t("menu.restart")}
      </button>
      {props.exit && (
        <button className="br-btn is-block" onClick={props.exit}>
          {t("menu.exit")}
        </button>
      )}
      <button className="br-btn is-quiet is-block" onClick={props.onClose}>
        {t("menu.close")}
      </button>
    </Sheet>
  );
}

function savePath(data: GmSave): string {
  return `${SAVE_DIR}/${data.startedAt.replace(/[:.]/g, "-")}.json`;
}

/** The most recently updated save of this game, if any. */
async function findLatest(host: Host): Promise<GmSave | null> {
  let best: GmSave | null = null;
  for (const path of await host.listFiles(SAVE_DIR)) {
    if (!path.endsWith(".json")) continue;
    try {
      const data = JSON.parse((await host.readFile(path)) ?? "") as GmSave;
      if (data.game !== GAME) continue;
      if (!best || data.updatedAt > best.updatedAt) best = data;
    } catch {
      /* not a save */
    }
  }
  return best;
}
