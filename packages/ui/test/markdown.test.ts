import { describe, expect, it } from "vitest";
import { parseBlocks, pickRules, sections, splitFrontmatter } from "../src";

const note = `---
type: rules
lang: zh
title: 规则
---

前言

## 移动
<!-- topic: move -->

一段 **粗体** 文字

### 掉队
<!-- topic: behind -->

- 一
- 二

| 列 | 值 |
|---|---|
| a \\| b | 2 |

![[fig.jpg]]
![[裁定]]
`;

describe("markdown for rules notes", () => {
  it("reads frontmatter", () => {
    expect(splitFrontmatter(note).meta).toEqual({ type: "rules", lang: "zh", title: "规则" });
  });
  it("parses blocks, topic markers, tables with escaped pipes, and embeds", () => {
    const kinds = parseBlocks(splitFrontmatter(note).body).map((b) => b.k);
    expect(kinds).toEqual(["p", "h", "topic", "p", "h", "topic", "list", "table", "embed", "embed"]);
    const table = parseBlocks("| a | b |\n|---|---|\n| x \\| y | 2 |").find((b) => b.k === "table");
    expect(table).toEqual({ k: "table", head: ["a", "b"], rows: [["x | y", "2"]] });
  });
  it("splits chapters at ## and records which topics each holds", () => {
    const s = sections(splitFrontmatter(note).body);
    expect(s.map((x) => [x.title, x.topics])).toEqual([
      ["", []],
      ["移动", ["move", "behind"]],
    ]);
  });
  it("picks the note in the current language, else any rules note", () => {
    const en = { path: "规则/Rules.md", text: "---\ntype: rules\nlang: en\n---\nEN" };
    const zh = { path: "规则/规则.md", text: "---\ntype: rules\nlang: zh\n---\nZH" };
    const other = { path: "规则/裁定.md", text: "---\ntype: rulings\n---\nx" };
    expect(pickRules([other, en, zh], "zh")?.body.trim()).toBe("ZH");
    expect(pickRules([other, en], "zh")?.body.trim()).toBe("EN");
    expect(pickRules([other], "zh")).toBeNull();
  });
});
