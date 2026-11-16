// Copies the built plugin into a vault and enables it.
//   npm run install:vault -- <vault path> [--fixtures]
// --fixtures also copies the original test cards (for a test vault; never into a real game's vault).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const vault = args.find((a) => !a.startsWith("--"));
if (!vault) {
  console.error("usage: npm run install:vault -- <vault path> [--fixtures]");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const build = join(root, "packages/host-obsidian/build");
if (!existsSync(join(build, "main.js"))) {
  console.error("build first: npm run build");
  process.exit(1);
}
const dest = join(vault, ".obsidian/plugins/boardroom");
mkdirSync(dest, { recursive: true });
for (const f of ["main.js", "styles.css", "manifest.json"]) cpSync(join(build, f), join(dest, f));

const list = join(vault, ".obsidian/community-plugins.json");
const enabled = existsSync(list) ? JSON.parse(readFileSync(list, "utf8")) : [];
if (!enabled.includes("boardroom")) writeFileSync(list, JSON.stringify([...enabled, "boardroom"], null, 2));

if (args.includes("--fixtures")) {
  const fx = join(root, "fixtures/goblin-mountain");
  if (existsSync(join(vault, "卡牌")) && !args.includes("--force")) {
    console.error("vault already has 卡牌/; refusing to overwrite (use --force on a test vault)");
    process.exit(1);
  }
  cpSync(join(fx, "卡牌"), join(vault, "卡牌"), { recursive: true, force: true });
  const cfg = join(vault, "boardroom.json");
  if (!existsSync(cfg)) cpSync(join(fx, "boardroom.json"), cfg);
}
console.log(`installed boardroom into ${dest}`);
