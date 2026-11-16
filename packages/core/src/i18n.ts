export type Lang = "zh" | "en";
export const LANGS: readonly Lang[] = ["zh", "en"];

/** A message: plain text with {name} placeholders, or a function for plurals and the like. */
export type Message = string | ((p: Record<string, string | number>) => string);
export type Messages = Record<string, Message>;

/** A translator for one language. Unknown keys come back as the key itself, so gaps are visible. */
export type T = (key: string, params?: Record<string, string | number>) => string;

export function translator(tables: Record<Lang, Messages>, lang: Lang): T {
  const table = tables[lang];
  return (key, params = {}) => {
    const m = table[key] ?? tables.en[key];
    if (m === undefined) return key;
    if (typeof m === "function") return m(params);
    return m.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
  };
}

/** Keys present in one table and missing from the other; tests require both lists to be empty. */
export function missingKeys(tables: Record<Lang, Messages>): Record<Lang, string[]> {
  const zh = Object.keys(tables.zh);
  const en = Object.keys(tables.en);
  return { zh: en.filter((k) => !(k in tables.zh)), en: zh.filter((k) => !(k in tables.en)) };
}

/** Picks the language from a locale string such as "zh-CN" or "en-US". */
export function langFromLocale(locale: string | undefined | null): Lang {
  return locale && locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}
