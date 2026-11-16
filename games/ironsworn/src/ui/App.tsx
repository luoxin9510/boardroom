import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Campaign, ContentError, langFromLocale, newSeed, RuleError, type CampaignSave, type Host, type Lang } from "@boardroom/core";
import { LangProvider, RulesView, Sheet, Toasts, useLang, useToasts, useWakeLock } from "@boardroom/ui";
import { FOLDERS, parseContent } from "../content";
import { makeEngine, newCampaign, PORTRAITS, type Action, type Entry, type State } from "../engine";
import { messages } from "../messages";
import type { ContentPack } from "../types";
import { MoveSheet } from "./MoveSheet";
import { CharacterTab, JournalTab, MetersBar, MovesTab, OraclesTab, TracksTab, type Portraits } from "./Tabs";
import { Wizard } from "./Wizard";
import { entryText, journalMarkdown, type Note } from "./text";
import "./iw.css";

type IwCampaign = Campaign<State, Action, Entry>;
/** One file per campaign: the campaign save plus the handwritten journal notes (kept outside undo). */
interface CampaignFile {
  save: CampaignSave<State, Action, Entry>;
  notes: Note[];
}

const GAME = "ironsworn";
const SAVE_DIR = "战役/存档";
const RULES_FOLDER = "规则";
const TABS = ["character", "moves", "tracks", "oracles", "journal"] as const;
type Tab = (typeof TABS)[number];

export function App(props: { host: Host }) {
  const { host } = props;
  const [lang, setLangState] = useState<Lang>(() => host.getSetting<Lang>("lang") ?? langFromLocale(host.locale()));
  const setLang = (l: Lang) => {
    setLangState(l);
    void host.setSetting("lang", l);
  };
  return (
    <LangProvider tables={messages} lang={lang} onChange={setLang}>
      <div className="br-root iw-root">
        <Game host={host} />
      </div>
    </LangProvider>
  );
}

async function loadContent(host: Host): Promise<ContentPack> {
  const notes = (await Promise.all(Object.values(FOLDERS).map((f) => host.readNotes(f)))).flat();
  return parseContent(notes);
}

async function listCampaigns(host: Host): Promise<{ path: string; file: CampaignFile }[]> {
  const out: { path: string; file: CampaignFile }[] = [];
  for (const path of await host.listFiles(SAVE_DIR)) {
    try {
      const text = await host.readFile(path);
      const file = text ? (JSON.parse(text) as CampaignFile) : null;
      if (file?.save?.updatedAt) out.push({ path, file });
    } catch {
      /* a broken file is skipped rather than hiding every campaign */
    }
  }
  return out.sort((a, b) => b.file.save.updatedAt.localeCompare(a.file.save.updatedAt));
}

function Game({ host }: { host: Host }) {
  const { t, lang, setLang } = useLang();
  const { toasts, push } = useToasts();
  const [pack, setPack] = useState<ContentPack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<{ path: string; file: CampaignFile }[]>([]);
  const [rulesNotes, setRulesNotes] = useState<{ path: string; text: string }[]>([]);
  const [rules, setRules] = useState<string | null | undefined>(undefined);
  const campaign = useRef<IwCampaign | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const tRef = useRef(t);
  tRef.current = t;
  useWakeLock(true);
  // A new campaign opens the character wizard; the first visit ever shows a short how-to-play.
  const [fresh, setFresh] = useState(false);
  const [intro, setIntro] = useState(() => !host.getSetting<boolean>("iw.intro"));

  useEffect(() => {
    loadContent(host)
      .then((p) => {
        setPack(p);
        setError(null);
      })
      .catch((e) => setError(e instanceof ContentError ? tRef.current("err.content", { detail: e.message }) : String(e)));
    void listCampaigns(host).then(setList);
    void host.readNotes(RULES_FOLDER).then(setRulesNotes).catch(() => setRulesNotes([]));
  }, [host]);

  const save = useCallback(
    (nextNotes?: Note[]) => {
      const c = campaign.current;
      if (!c) return;
      const file: CampaignFile = { save: c.toSave(), notes: nextNotes ?? notes };
      const text = JSON.stringify(file);
      writes.current = writes.current.then(() => host.writeFile(`${SAVE_DIR}/${c.id}.json`, text)).catch((e: unknown) => push(tRef.current("toast.saveFailed", { detail: String(e) }), "bad"));
    },
    [host, notes, push],
  );

  const create = (name: string) => {
    if (!pack) return;
    const id = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${Math.floor(Math.random() * 1e4)}`;
    campaign.current = new Campaign(makeEngine(pack), GAME, id, name || t("game.title"), newCampaign(newSeed(), name));
    setNotes([]);
    setFresh(true);
    save([]);
    rerender();
  };

  const open = (f: CampaignFile) => {
    if (!pack) return;
    try {
      const { campaign: c, fellBack } = Campaign.fromSave(makeEngine(pack), f.save);
      campaign.current = c;
      setNotes(f.notes ?? []);
      setFresh(false);
      if (fellBack) push(t("toast.fellBack"), "bad");
      rerender();
    } catch (e) {
      push(t("err.load", { detail: String(e) }), "bad");
    }
  };

  const remove = async (path: string) => {
    try {
      await host.removeFile(path);
    } catch (e) {
      push(String(e), "bad");
    }
    setList(await listCampaigns(host));
  };

  const act = (a: Action): boolean => {
    const c = campaign.current;
    if (!c) return false;
    try {
      const events = c.act(a);
      for (const e of events) if (e.k === "prompt") push(entryText(e, t, pack as ContentPack, lang), "bad");
      save();
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
    const c = campaign.current;
    if (!c?.canUndo) return;
    c.undo();
    save();
    push(t("toast.undone"));
    rerender();
  };

  const back = async () => {
    await writes.current;
    campaign.current = null;
    setList(await listCampaigns(host));
    rerender();
  };

  const rulesView =
    rules === undefined ? null : (
      <RulesView
        notes={rulesNotes}
        lang={lang}
        image={(name) => host.imageUrl(`${RULES_FOLDER}/图/${name}`) ?? host.imageUrl(`${RULES_FOLDER}/${name}`)}
        topic={rules}
        labels={{ title: t("rules.title"), empty: t("rules.empty"), close: t("rules.close") }}
        onClose={() => setRules(undefined)}
      />
    );

  if (error)
    return (
      <div className="iw-screen">
        <p className="iw-bad" data-testid="content-error">
          {error}
        </p>
        {host.exit && (
          <button className="br-btn" onClick={host.exit}>
            {t("menu.back")}
          </button>
        )}
      </div>
    );
  if (!pack) return <div className="iw-screen" />;
  const portraits: Portraits = {
    list: host.listImages(PORTRAITS).flatMap((path) => {
      const url = host.imageUrl(path);
      return url ? [{ path, url }] : [];
    }),
    url: (path) => (path ? host.imageUrl(path) : null),
  };

  const c = campaign.current;
  if (!c)
    return (
      <>
        <CampaignList list={list} create={create} open={open} remove={(p) => void remove(p)} exit={host.exit} openRules={() => setRules(null)} />
        <Toasts toasts={toasts} />
        {intro && (
          <Sheet
            title={t("intro.title")}
            onClose={() => {
              setIntro(false);
              void host.setSetting("iw.intro", true);
            }}
          >
            <div className="iw-intro" data-testid="intro">
              <p>{t("intro.1")}</p>
              <p>{t("intro.2")}</p>
              <p>{t("intro.3")}</p>
              <button
                className="br-btn is-primary is-block"
                onClick={() => {
                  setIntro(false);
                  void host.setSetting("iw.intro", true);
                }}
                data-testid="intro-ok"
              >
                {t("intro.ok")}
              </button>
            </div>
          </Sheet>
        )}
        {rulesView}
      </>
    );

  return (
    <>
      <CampaignView
        campaign={c}
        portraits={portraits}
        pack={pack}
        notes={notes}
        act={act}
        undo={undo}
        back={() => void back()}
        openRules={(topic) => setRules(topic ?? null)}
        startWizard={fresh}
        addNote={(text) => {
          const next = [...notes, { at: c.journal.length, text, time: new Date().toISOString() }];
          setNotes(next);
          save(next);
        }}
        exportIt={() => {
          const md = journalMarkdown(c.title, c.journal, notes, t, pack, lang);
          const d = new Date();
          const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          void host.share(`${stamp} ${t("game.title")} ${c.title}.md`, md, "text/markdown");
        }}
        toggleLang={() => setLang(lang === "zh" ? "en" : "zh")}
      />
      <Toasts toasts={toasts} />
      {rulesView}
    </>
  );
}

function CampaignList(props: {
  list: { path: string; file: CampaignFile }[];
  create: (name: string) => void;
  open: (f: CampaignFile) => void;
  remove: (path: string) => void;
  exit?: () => void;
  openRules: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="iw-screen iw-start" data-testid="campaigns">
      <h1>{t("game.title")}</h1>
      <div className="iw-muted">{t("game.subtitle")}</div>
      <div className="iw-new">
        <input className="iw-input" placeholder={t("list.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} data-testid="new-name" />
        <button className="br-btn is-primary" onClick={() => props.create(name.trim())} data-testid="new-campaign">
          {t("list.create")}
        </button>
      </div>
      {!props.list.length && <p className="iw-muted">{t("list.empty")}</p>}
      {props.list.map(({ path, file }) => (
        <div key={path} className="iw-campaign" data-testid="campaign">
          <div>
            <b>{file.save.title}</b>
            <div className="iw-muted iw-small">{t("list.updated", { when: file.save.updatedAt.slice(0, 16).replace("T", " ") })}</div>
          </div>
          <div className="iw-row">
            <button className="br-btn is-primary" onClick={() => props.open(file)} data-testid="continue">
              {t("list.continue")}
            </button>
            <button
              className="br-btn is-quiet"
              onClick={() => {
                if (confirm === path) props.remove(path);
                else setConfirm(path);
              }}
              data-testid="delete-campaign"
            >
              {confirm === path ? t("list.deleteConfirm") : t("list.delete")}
            </button>
          </div>
        </div>
      ))}
      <div className="iw-row iw-gap">
        <button className="br-btn" onClick={props.openRules} data-testid="open-rules">
          📖 {t("menu.rules")}
        </button>
        {props.exit && (
          <button className="br-btn is-quiet" onClick={props.exit}>
            {t("menu.back")}
          </button>
        )}
      </div>
    </div>
  );
}

function CampaignView(props: {
  campaign: IwCampaign;
  pack: ContentPack;
  notes: Note[];
  act: (a: Action) => boolean;
  undo: () => void;
  back: () => void;
  openRules: (topic?: string) => void;
  addNote: (text: string) => void;
  exportIt: () => void;
  toggleLang: () => void;
  startWizard?: boolean;
  portraits?: Portraits;
}) {
  const { t } = useLang();
  const [wizard, setWizard] = useState(!!props.startWizard);
  const [tab, setTab] = useState<Tab>("moves");
  const [move, setMove] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const c = props.campaign;
  const state = c.state;
  const openMove = (id: string) => setMove(id);
  const moveDef = move ? props.pack.moves.find((m) => m.id === move) : undefined;
  const rollOracle = (id: string) => {
    props.act({ t: "oracle", table: id });
    setTab("oracles");
    setMove(null);
  };
  return (
    <div className="iw-campaign-view">
      <header className="iw-top">
        <button className="br-btn is-quiet iw-icon" onClick={props.back} aria-label={t("menu.back")} data-testid="back">
          ✕
        </button>
        {props.portraits?.url(state.character.portrait) && <img className="iw-portrait is-small" src={props.portraits.url(state.character.portrait) as string} alt="" data-testid="top-portrait" />}
        <div className="iw-title">{state.character.name || c.title}</div>
        <button className="br-btn is-quiet iw-icon" onClick={props.undo} disabled={!c.canUndo} aria-label={t("menu.undo")} data-testid="undo">
          ↶
        </button>
        <button className="br-btn is-quiet iw-icon" onClick={() => setMenu(true)} aria-label={t("menu.title")} data-testid="menu">
          ⋯
        </button>
      </header>
      <MetersBar state={state} act={props.act} openRules={props.openRules} />
      <main className={`iw-main${state.pending && !moveDef ? " has-pending" : ""}`}>
        {tab === "character" && <CharacterTab state={state} pack={props.pack} act={props.act} openRules={props.openRules} portraits={props.portraits} />}
        {tab === "moves" && <MovesTab pack={props.pack} open={openMove} />}
        {tab === "tracks" && <TracksTab state={state} pack={props.pack} act={props.act} openMove={openMove} />}
        {tab === "oracles" && <OraclesTab pack={props.pack} act={props.act} last={c.journal.at(-1)} />}
        {tab === "journal" && <JournalTab journal={c.journal} notes={props.notes} pack={props.pack} addNote={props.addNote} exportIt={props.exportIt} />}
      </main>
      <nav className="iw-nav">
        {TABS.map((k) => (
          <button key={k} className={`iw-navbtn${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)} data-testid={`nav-${k}`}>
            {t(`nav.${k}`)}
          </button>
        ))}
      </nav>
      {moveDef && <MoveSheet key={moveDef.id} move={moveDef} state={state} pack={props.pack} act={props.act} onClose={() => setMove(null)} openMove={openMove} rollOracle={rollOracle} openRules={props.openRules} />}
      {wizard && <Wizard state={state} pack={props.pack} act={props.act} onClose={() => setWizard(false)} openMove={openMove} openRules={props.openRules} />}
      {!moveDef && state.pending && (
        <button
          className="iw-pending"
          onClick={() => {
            const id = state.pending?.move ?? null;
            // A roll whose move the content pack no longer has can only be ended.
            if (id && !props.pack.moves.some((m) => m.id === id)) props.act({ t: "endRoll" });
            else setMove(id);
          }}
          data-testid="pending"
        >
          {props.pack.moves.some((m) => m.id === state.pending?.move) ? `${t(`outcome.${state.pending.outcome}`)} · ${t("move.done")}?` : t("move.endStale")}
        </button>
      )}
      {menu && (
        <Sheet title={t("menu.title")} onClose={() => setMenu(false)}>
          <button className="br-btn is-block" disabled={!c.canUndo} onClick={props.undo} data-testid="menu-undo">
            ↶ {t("menu.undo")}
          </button>
          <button
            className="br-btn is-block"
            onClick={() => {
              setMenu(false);
              props.openRules();
            }}
            data-testid="menu-rules"
          >
            📖 {t("menu.rules")}
          </button>
          <button
            className="br-btn is-block"
            onClick={() => {
              setMenu(false);
              setWizard(true);
            }}
            data-testid="menu-wizard"
          >
            🧭 {t("wiz.reopen")}
          </button>
          <button className="br-btn is-block" onClick={props.exportIt} data-testid="menu-export">
            ⬆︎ {t("menu.export")}
          </button>
          <button className="br-btn is-block" onClick={props.toggleLang} data-testid="lang">
            {t("menu.lang")}
          </button>
          <button className="br-btn is-block is-quiet" onClick={props.back}>
            {t("menu.back")}
          </button>
        </Sheet>
      )}
    </div>
  );
}
