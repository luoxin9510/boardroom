// Makes a content pack from a game vault, for importing into the app on a phone.
//   npm run pack -- <vault path> [output.zip]
// Takes boardroom.json and the notes and images under 卡牌/ and 规则/ (no PDFs, nothing hidden,
// not 对局/). The zip goes to ~/Downloads unless you name one; AirDrop it to the phone and import it.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { zipSync } from "fflate";

const [vaultArg, outArg] = process.argv.slice(2);
if (!vaultArg) {
  console.error("usage: npm run pack -- <vault path> [output.zip]");
  process.exit(1);
}
const vault = resolve(vaultArg);
const configPath = join(vault, "boardroom.json");
if (!existsSync(configPath)) {
  console.error(`no boardroom.json in ${vault}; add one like {"game": "goblin-mountain"}`);
  process.exit(1);
}
const { game } = JSON.parse(readFileSync(configPath, "utf8"));
const FOLDERS = ["卡牌", "规则"];
const KEEP = /\.(md|jpe?g|png|webp|gif|svg)$/i;
const IMAGE = /\.(jpe?g|png|webp|gif)$/i;

const files = { "boardroom.json": [readFileSync(configPath), { level: 6 }] };
let bytes = 0;
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    if (f.startsWith(".")) continue;
    const full = join(dir, f);
    if (statSync(full).isDirectory()) walk(full);
    else if (KEEP.test(f)) {
      const data = readFileSync(full);
      bytes += data.length;
      // Images are already compressed: storing them is faster and no bigger.
      files[relative(vault, full).split("\\").join("/")] = [data, { level: IMAGE.test(f) ? 0 : 6 }];
    }
  }
};
for (const folder of FOLDERS) if (existsSync(join(vault, folder))) walk(join(vault, folder));

const date = new Date();
const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
const out = resolve(outArg ?? join(homedir(), "Downloads", `${game}-pack-${stamp}.zip`));
const zip = zipSync(files);
writeFileSync(out, zip);
console.log(`${Object.keys(files).length} files (${(bytes / 1048576).toFixed(1)} MB) → ${out} (${(zip.length / 1048576).toFixed(1)} MB)`);
