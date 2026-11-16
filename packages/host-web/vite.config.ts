import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Emits sw.js: caches every built file and everything in public/ on install, then serves from the cache
 * first, so the installed app runs with no network. A new build gets a new cache name; old ones are dropped.
 */
function serviceWorker(): Plugin {
  const publicDir = resolve(__dirname, "public");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [relative(publicDir, join(dir, f))]));
  return {
    name: "boardroom-sw",
    apply: "build",
    // "post", so Vite's own HTML step has already added index.html to the bundle and it counts towards the version.
    generateBundle: { order: "post", handler(_options, bundle) {
      const published = walk(publicDir);
      const files = ["./", ...Object.keys(bundle), ...published].filter((f) => !f.endsWith(".map")).map((f) => (f === "./" ? f : `./${f}`));
      // The version covers file contents, not just names: a change to index.html, the manifest or an icon is a new version too.
      const hash = createHash("sha256");
      for (const [name, out] of Object.entries(bundle)) hash.update(name).update(out.type === "chunk" ? out.code : out.source);
      for (const f of published) hash.update(f).update(readFileSync(join(publicDir, f)));
      const version = hash.digest("hex").slice(0, 12);
      const source = `// Generated at build time (vite.config.ts). Cache-first, offline after the first visit.
const CACHE = "boardroom-${version}";
const FILES = ${JSON.stringify(files)};
self.addEventListener("install", (e) => {
  // cache: "reload" skips the HTTP cache, so a new version never stores a stale index.html (GitHub Pages caches it for 10 minutes).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("boardroom-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === "navigate" }).then(
      (hit) => hit || fetch(req).catch(() => (req.mode === "navigate" ? caches.match("./") : Response.error())),
    ),
  );
});
`;
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    } },
  };
}

export default defineConfig({
  // Relative, so the same build works at a GitHub Pages sub-path (/boardroom/) and at the root.
  base: "./",
  plugins: [react(), serviceWorker()],
  server: { fs: { allow: [resolve(__dirname, "../..")] } },
});
