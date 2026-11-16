import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { fixName, readZip } from "../src/pack";
import { stripUtf8Flag } from "./zip-names";

const pack = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

describe("reading a content pack zip", () => {
  it("reads Chinese names from zips that don't mark them as UTF-8 (Finder)", () => {
    const zip = stripUtf8Flag(pack({ "vault/boardroom.json": '{"game":"goblin-mountain"}', "vault/卡牌/A.md": "x", "__MACOSX/vault/._A.md": "junk", "vault/.obsidian/app.json": "{}" }));
    const p = readZip(zip);
    expect(p.game).toBe("goblin-mountain");
    expect([...p.files.keys()]).toEqual(["卡牌/A.md"]);
  });
  it("leaves real Latin-1 names alone", () => {
    expect(fixName("café.md")).toBe("café.md");
    expect(fixName("卡牌/A.md")).toBe("卡牌/A.md");
  });
  it("says what is wrong with a zip that isn't a pack", () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow("not a zip file");
    expect(() => readZip(pack({ "a.txt": "x" }))).toThrow("no boardroom.json");
    expect(() => readZip(pack({ "boardroom.json": '{"game":"chess"}' }))).toThrow('unknown game "chess"');
  });
});
