import { ContentError } from "./errors";

/** A content note split into its frontmatter and its first markdown table. */
export interface Note {
  file: string;
  meta: Record<string, string | number | boolean | (string | number)[]>;
  /** Table rows keyed by header text; `line` is the 1-based line in the file, for error messages. */
  rows: { cells: Record<string, string>; line: number }[];
  headers: string[];
}

/**
 * Parses the small subset of YAML frontmatter our notes use (`key: value`, numbers, booleans,
 * `[a, b]` lists, quoted strings) and the first pipe table in the body.
 */
export function parseNote(file: string, text: string): Note {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const meta: Note["meta"] = {};
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    for (; i < lines.length && lines[i]?.trim() !== "---"; i++) {
      const raw = (lines[i] ?? "").replace(/\s+#.*$/, "");
      if (!raw.trim()) continue;
      const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw);
      if (!m) throw new ContentError(file, i + 1, `frontmatter line is not "key: value": ${raw.trim()}`);
      meta[m[1] as string] = parseScalarOrList(m[2]?.trim() ?? "");
    }
    if (i >= lines.length) throw new ContentError(file, 1, "frontmatter starts with --- but never ends");
    i++;
  }
  const rows: Note["rows"] = [];
  let headers: string[] = [];
  for (; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) {
      if (headers.length && rows.length) break;
      continue;
    }
    const cells = splitRow(line);
    if (!headers.length) {
      headers = cells;
      const sep = lines[i + 1]?.trim() ?? "";
      if (!/^\|?[\s:|-]+\|?$/.test(sep)) throw new ContentError(file, i + 2, "table header must be followed by a |---| line");
      i++;
      continue;
    }
    const rec: Record<string, string> = {};
    headers.forEach((h, k) => (rec[h] = cells[k] ?? ""));
    rows.push({ cells: rec, line: i + 1 });
  }
  return { file, meta, rows, headers };
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  // `\|` is a literal pipe inside a cell (markdown's escape), not a column break.
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

function parseScalarOrList(v: string): string | number | boolean | (string | number)[] {
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => {
      const s = unquote(x.trim());
      return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;
    });
  }
  const s = unquote(v);
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s) && s === v) return Number(s);
  return s;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
