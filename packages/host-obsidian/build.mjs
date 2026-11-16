// Bundles the plugin: build/main.js (CommonJS, obsidian external), build/styles.css, build/manifest.json.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from "node:fs";

mkdirSync("build", { recursive: true });
await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron"],
  outfile: "build/main.js",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  jsx: "automatic",
  logLevel: "info",
});
// esbuild puts imported CSS next to the bundle as main.css; Obsidian loads styles.css.
const css = existsSync("build/main.css") ? readFileSync("build/main.css", "utf8") : "";
writeFileSync("build/styles.css", readFileSync("src/host.css", "utf8") + "\n" + css);
if (existsSync("build/main.css")) unlinkSync("build/main.css");
copyFileSync("manifest.json", "build/manifest.json");
