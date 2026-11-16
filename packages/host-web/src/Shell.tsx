import { useEffect, useRef, useState } from "react";
import { langFromLocale, translator, type Host, type Lang } from "@boardroom/core";
import { demoPack } from "./demo";
import { GAMES } from "./games";
import { deviceLocale, makeHost, settings, shareText } from "./host";
import { messages } from "./messages";
import { deletePack, importPack, listPacks, loadPack, PackError, readZip, type PackInfo } from "./pack";
import * as store from "./store";
import "@boardroom/ui";
import "./shell.css";

type Playing = { game: string; host: Host; dispose: () => void };

/** The library: imported packs, import, test cards, backup. Picking a game hands the screen to that game. */
export function Shell(props: { offlineReady: boolean }) {
  const [lang, setLang] = useState<Lang>(() => settings.get<Lang>("lang") ?? langFromLocale(deviceLocale()));
  const t = translator(messages, lang);
  const [packs, setPacks] = useState<PackInfo[] | null>(null);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => void listPacks().then(setPacks).catch((e: unknown) => setNote({ text: String(e), bad: true }));
  useEffect(refresh, []);

  const back = () => {
    setPlaying((p) => {
      p?.dispose();
      return null;
    });
    // The game may have switched the language.
    setLang(settings.get<Lang>("lang") ?? lang);
  };

  const play = async (game: string, demo: boolean) => {
    try {
      const pack = demo ? await demoPack(game) : await loadPack(game);
      const { host, dispose } = makeHost(pack, demo ? `${game}@demo` : game, back);
      setPlaying({ game, host, dispose });
    } catch (e) {
      setNote({ text: String(e), bad: true });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNote({ text: t("lib.importing") });
    try {
      const info = await importPack(readZip(new Uint8Array(await file.arrayBuffer())));
      setNote({ text: t("lib.imported", { game: GAMES[info.game]?.title[lang] ?? info.game, files: info.files }) });
      refresh();
    } catch (e) {
      setNote({ text: t("lib.error", { detail: e instanceof PackError ? e.message : String(e) }), bad: true });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async (game: string) => {
    if (confirm !== game) return setConfirm(game);
    setConfirm(null);
    try {
      await deletePack(game);
    } catch (e) {
      setNote({ text: String(e), bad: true });
    }
    refresh();
  };

  const backup = async () => {
    const all = Object.fromEntries(await store.entries<string>("files", ""));
    const date = new Date().toISOString().slice(0, 10);
    await shareText(`boardroom-saves-${date}.json`, JSON.stringify(all), "application/json").catch((e: unknown) => {
      if ((e as Error)?.name !== "AbortError") setNote({ text: String(e), bad: true });
    });
  };

  if (playing) {
    const Game = GAMES[playing.game]?.App;
    return Game ? <Game host={playing.host} /> : null;
  }

  const standalone = typeof matchMedia === "function" && (matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

  return (
    <div className="br-root lib">
      <header className="lib-head">
        <h1>{t("lib.title")}</h1>
        <button
          className="br-btn is-quiet"
          onClick={() => {
            const l = lang === "zh" ? "en" : "zh";
            setLang(l);
            settings.set("lang", l);
          }}
          data-testid="lib-lang"
        >
          {t("lib.lang")}
        </button>
      </header>
      <p className="lib-muted">{t("lib.subtitle")}</p>

      {packs?.map((p) => (
        <section key={p.game} className="lib-card" data-testid={`pack-${p.game}`}>
          <div className="lib-card-title">{GAMES[p.game]?.title[lang] ?? p.game}</div>
          <div className="lib-muted">{t("lib.packInfo", { files: p.files, size: `${(p.bytes / 1048576).toFixed(1)} MB`, date: p.importedAt.slice(0, 10) })}</div>
          <button className="br-btn is-primary is-block" onClick={() => void play(p.game, false)} data-testid={`play-${p.game}`}>
            {t("lib.play")}
          </button>
          <button className="br-btn is-quiet is-block" onClick={() => void remove(p.game)}>
            {confirm === p.game ? t("lib.deleteConfirm") : t("lib.delete")}
          </button>
        </section>
      ))}
      {packs && packs.length === 0 && <p className="lib-muted">{t("lib.empty")}</p>}

      <label className={`br-btn is-block lib-import${busy ? " is-busy" : ""}`}>
        {t("lib.import")}
        <input ref={fileInput} type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import" />
      </label>
      {!standalone && <p className="lib-warn" data-testid="install-first">{t("lib.installFirst")}</p>}
      {note && <div className={`lib-note${note.bad ? " is-bad" : ""}`} data-testid="lib-note">{note.text}</div>}
      <p className="lib-muted lib-small">{t("lib.howto")}</p>

      <button className="br-btn is-block" onClick={() => void play("goblin-mountain", true)} data-testid="demo">
        {t("lib.demo")} · {GAMES["goblin-mountain"]?.title[lang]}
      </button>
      <button className="br-btn is-block" onClick={() => void play("ironsworn", true)} data-testid="demo-ironsworn">
        {t("lib.demo")} · {GAMES["ironsworn"]?.title[lang]}
      </button>
      <p className="lib-muted lib-small">{t("lib.demoNote")}</p>

      <footer className="lib-foot">
        <button className="br-btn is-quiet" onClick={() => void backup()} data-testid="backup">
          {t("lib.backup")}
        </button>
        {!standalone && <p className="lib-muted lib-small">{t("lib.install")}</p>}
        {props.offlineReady && <p className="lib-muted lib-small" data-testid="offline-ready">✓ {t("lib.offline")}</p>}
      </footer>
    </div>
  );
}
