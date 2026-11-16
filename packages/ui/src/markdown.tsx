import { Fragment, type ReactNode } from "react";

/**
 * A small, safe Markdown renderer for rules notes written in Obsidian: it builds React elements (never
 * innerHTML). Supports headings, paragraphs, lists, tables, quotes, rules, code, **bold**, *italic*, `code`,
 * [[links]], [text](url) (shown as text), image embeds ![[x.jpg]] / ![](x.jpg), note embeds ![[Note]], and
 * `<!-- topic: id -->` markers, which become jump targets.
 */

export interface MdContext {
  /** URL for an embedded image file name, or null if the pack doesn't have it. */
  image(name: string): string | null;
  /** The body of an embedded note (by name, without .md), or null. */
  note(name: string): string | null;
  /** Called when the text links to a rules topic: [掉队](rule:behind). */
  onTopic?(topic: string): void;
}

export type Block =
  | { k: "h"; level: number; text: string }
  | { k: "p"; text: string }
  | { k: "list"; ordered: boolean; items: string[] }
  | { k: "table"; head: string[]; rows: string[][] }
  | { k: "quote"; text: string }
  | { k: "hr" }
  | { k: "code"; text: string }
  | { k: "topic"; id: string }
  | { k: "embed"; name: string };

/** Drops YAML frontmatter and returns its simple `key: value` pairs. */
export function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1] as string] = (kv[2] as string).replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|"));

export function parseBlocks(body: string): Block[] {
  const lines = body.split(/\r?\n/);
  const out: Block[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ k: "p", text: para.join("\n") });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i] as string;
    const t = line.trim();
    let m: RegExpExecArray | null;
    if (!t) {
      flush();
      i++;
    } else if ((m = /^<!--\s*topic:\s*([\w-]+)\s*-->$/.exec(t))) {
      flush();
      out.push({ k: "topic", id: m[1] as string });
      i++;
    } else if (t.startsWith("<!--")) {
      flush();
      while (i < lines.length && !(lines[i] as string).includes("-->")) i++;
      i++;
    } else if ((m = /^(#{1,6})\s+(.*)$/.exec(t))) {
      flush();
      out.push({ k: "h", level: (m[1] as string).length, text: (m[2] as string).replace(/\s+#+$/, "") });
      i++;
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      out.push({ k: "hr" });
      i++;
    } else if (t.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] as string).trim().startsWith("```")) code.push(lines[i++] as string);
      i++;
      out.push({ k: "code", text: code.join("\n") });
    } else if ((m = /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(t))) {
      flush();
      out.push({ k: "embed", name: (m[1] as string).trim() });
      i++;
    } else if (t.startsWith("|") && /^\|?\s*:?-{2,}/.test((lines[i + 1] ?? "").trim())) {
      flush();
      const head = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] as string).trim().startsWith("|")) rows.push(cells(lines[i++] as string));
      out.push({ k: "table", head, rows });
    } else if (t.startsWith(">")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && (lines[i] as string).trim().startsWith(">")) q.push((lines[i++] as string).trim().replace(/^>\s?/, ""));
      out.push({ k: "quote", text: q.join("\n") });
    } else if (/^([-*+]|\d+[.)])\s+/.test(t)) {
      flush();
      const ordered = /^\d/.test(t);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i] as string;
        const lt = l.trim();
        if (/^([-*+]|\d+[.)])\s+/.test(lt)) items.push(lt.replace(/^([-*+]|\d+[.)])\s+/, ""));
        else if (lt && /^\s+/.test(l) && items.length) items[items.length - 1] += `\n${lt}`;
        else break;
        i++;
      }
      out.push({ k: "list", ordered, items });
    } else {
      para.push(t);
      i++;
    }
  }
  flush();
  return out;
}

/** Inline markup to React nodes. */
export function inline(text: string, ctx: MdContext, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|`[^`]+`|\n)/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    const tok = m[0];
    if ((m.index ?? 0) > last) out.push(text.slice(last, m.index));
    last = (m.index ?? 0) + tok.length;
    const k = `${key}-${n++}`;
    let x: RegExpExecArray | null;
    if (tok === "\n") out.push(<br key={k} />);
    else if ((x = /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(tok)) || (x = /^!\[[^\]]*\]\(([^)]+)\)$/.exec(tok))) {
      const src = ctx.image(decodeURIComponent((x[1] as string).trim()).split("/").pop() as string);
      if (src) out.push(<img key={k} className="br-md-img is-inline" src={src} alt="" />);
    } else if ((x = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(tok))) out.push((x[2] ?? x[1] ?? "").trim());
    else if ((x = /^\[([^\]]+)\]\(rule:([\w-]+)\)$/.exec(tok))) {
      const topic = x[2] as string;
      out.push(
        <button key={k} className="br-md-link" onClick={(e) => (e.stopPropagation(), ctx.onTopic?.(topic))}>
          {x[1]}
        </button>,
      );
    } else if ((x = /^\[([^\]]+)\]\([^)]+\)$/.exec(tok))) out.push(x[1]);
    else if ((x = /^(\*\*|__)(.+)\1$/.exec(tok))) out.push(<strong key={k}>{inline(x[2] as string, ctx, k)}</strong>);
    else if ((x = /^\*(.+)\*$/.exec(tok))) out.push(<em key={k}>{inline(x[1] as string, ctx, k)}</em>);
    else if ((x = /^`(.+)`$/.exec(tok))) out.push(<code key={k}>{x[1]}</code>);
    else out.push(tok);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;

/** Renders blocks; `depth` stops runaway note embeds. Topic markers become elements with id `topic-<id>`. */
export function Blocks(props: { blocks: Block[]; ctx: MdContext; depth?: number }) {
  const depth = props.depth ?? 0;
  return (
    <>
      {props.blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.k) {
          case "h": {
            const H = `h${Math.min(6, b.level + 1)}` as "h2";
            return <H key={k}>{inline(b.text, props.ctx, k)}</H>;
          }
          case "p":
            return <p key={k}>{inline(b.text, props.ctx, k)}</p>;
          case "list": {
            const L = b.ordered ? "ol" : "ul";
            return (
              <L key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, props.ctx, `${k}-${j}`)}</li>
                ))}
              </L>
            );
          }
          case "table":
            return (
              <div key={k} className="br-md-table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>{inline(c, props.ctx, `${k}h${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, l) => (
                          <td key={l}>{inline(c, props.ctx, `${k}r${j}c${l}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "quote":
            return <blockquote key={k}>{inline(b.text, props.ctx, k)}</blockquote>;
          case "hr":
            return <hr key={k} />;
          case "code":
            return (
              <pre key={k}>
                <code>{b.text}</code>
              </pre>
            );
          case "topic":
            return <span key={k} id={`topic-${b.id}`} className="br-md-anchor" />;
          case "embed": {
            if (IMAGE.test(b.name)) {
              const src = props.ctx.image(b.name.split("/").pop() as string);
              return src ? <img key={k} className="br-md-img" src={src} alt="" /> : null;
            }
            const text = depth < 2 ? props.ctx.note(b.name.replace(/\.md$/, "")) : null;
            return text === null ? null : (
              <div key={k} className="br-md-embed">
                <Blocks blocks={parseBlocks(splitFrontmatter(text).body)} ctx={props.ctx} depth={depth + 1} />
              </div>
            );
          }
        }
      })}
    </>
  );
}

/** One line of UI text that may contain [words](rule:topic) links. */
export function RichText(props: { text: string; onTopic?: (topic: string) => void }) {
  return <Fragment>{inline(props.text, { image: () => null, note: () => null, onTopic: props.onTopic })}</Fragment>;
}
