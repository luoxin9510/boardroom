import { useEffect, useMemo, useRef, useState } from "react";
import { Blocks, parseBlocks, splitFrontmatter, type Block, type MdContext } from "./markdown";
import type { Lang } from "@boardroom/core";

export interface RulesLabels {
  title: string;
  empty: string;
  close: string;
}

interface Section {
  title: string;
  blocks: Block[];
  topics: string[];
}

/** Picks the rules note for a language (frontmatter `type: rules`, `lang: zh|en`), falling back to the other language. */
export function pickRules(notes: { path: string; text: string }[], lang: Lang): { title: string; body: string } | null {
  const rules = notes.map((n) => ({ n, ...splitFrontmatter(n.text) })).filter((x) => x.meta.type === "rules");
  const hit = rules.find((x) => x.meta.lang === lang) ?? rules[0];
  return hit ? { title: hit.meta.title ?? "", body: hit.body } : null;
}

/** Splits a note into chapters at its `##` headings; text before the first one is the introduction. */
export function sections(body: string): Section[] {
  const out: Section[] = [];
  let cur: Section = { title: "", blocks: [], topics: [] };
  for (const b of parseBlocks(body)) {
    if (b.k === "h" && b.level === 1) continue;
    if (b.k === "h" && b.level === 2) {
      if (cur.title || cur.blocks.length) out.push(cur);
      cur = { title: b.text, blocks: [], topics: [] };
      continue;
    }
    if (b.k === "topic") cur.topics.push(b.id);
    cur.blocks.push(b);
  }
  if (cur.title || cur.blocks.length) out.push(cur);
  return out;
}

/**
 * Full-screen rules: chapters fold open and shut; `topic` opens the chapter that holds that topic marker
 * and scrolls to it. Links inside the text ([x](rule:id)) jump the same way.
 */
export function RulesView(props: {
  notes: { path: string; text: string }[];
  lang: Lang;
  /** Image URL for a file name used in an embed, or null. */
  image: (name: string) => string | null;
  topic?: string | null;
  labels: RulesLabels;
  onClose: () => void;
}) {
  const rules = useMemo(() => pickRules(props.notes, props.lang), [props.notes, props.lang]);
  const secs = useMemo(() => (rules ? sections(rules.body) : []), [rules]);
  const [topic, setTopic] = useState(props.topic ?? null);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const scroller = useRef<HTMLDivElement>(null);

  // Open the chapter holding the topic, then scroll to its marker once it is rendered.
  useEffect(() => {
    if (!topic) return;
    const i = secs.findIndex((s) => s.topics.includes(topic));
    if (i < 0) return;
    setOpen((o) => new Set(o).add(i));
    const t = setTimeout(() => {
      const el = scroller.current?.querySelector(`#topic-${CSS.escape(topic)}`);
      el?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [topic, secs]);

  const ctx: MdContext = {
    image: props.image,
    note: (name) => {
      const n = props.notes.find((x) => x.path.split("/").pop()?.replace(/\.md$/, "") === name);
      return n ? n.text : null;
    },
    onTopic: (t) => setTopic(t),
  };

  return (
    <div className="br-rules" role="dialog" data-testid="rules">
      <header className="br-rules-head">
        <div className="br-rules-title">{rules?.title || props.labels.title}</div>
        <button className="br-btn is-quiet" onClick={props.onClose} aria-label={props.labels.close} data-testid="rules-close">
          ✕
        </button>
      </header>
      <div className="br-rules-body" ref={scroller}>
        {!rules && <p className="br-rules-empty">{props.labels.empty}</p>}
        {secs.map((s, i) =>
          s.title ? (
            <section key={i} className={`br-rules-sec${open.has(i) ? " is-open" : ""}`} data-testid={`rules-sec-${i}`}>
              <button
                className="br-rules-sec-head"
                onClick={() =>
                  setOpen((o) => {
                    const n = new Set(o);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
              >
                <span>{s.title}</span>
                <span className="br-rules-chev">{open.has(i) ? "−" : "+"}</span>
              </button>
              {open.has(i) && (
                <div className="br-md">
                  <Blocks blocks={s.blocks} ctx={ctx} />
                </div>
              )}
            </section>
          ) : (
            <div key={i} className="br-md br-rules-intro">
              <Blocks blocks={s.blocks} ctx={ctx} />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
