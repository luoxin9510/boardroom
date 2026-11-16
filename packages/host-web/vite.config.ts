import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Dev only: BOARDROOM_VAULT=<path> npm run dev serves that vault's card notes and images,
 * so the browser shows the real cards. Reads only; files the game writes still go to localStorage.
 */
function vault(root: string | undefined): Plugin {
  return {
    name: "boardroom-vault",
    configureServer(server) {
      if (!root) return;
      const base = resolve(root);
      const inside = (p: string) => {
        const full = resolve(base, p);
        return full === base || full.startsWith(base + sep) ? full : null;
      };
      server.middlewares.use("/vault-notes", (req, res) => {
        const folder = new URL(req.url ?? "", "http://x").searchParams.get("folder") ?? "";
        const dir = inside(folder);
        const notes: { path: string; text: string }[] = [];
        const walk = (d: string, rel: string) => {
          for (const f of readdirSync(d)) {
            const full = join(d, f);
            if (statSync(full).isDirectory()) walk(full, `${rel}/${f}`);
            else if (f.endsWith(".md")) notes.push({ path: `${rel}/${f}`, text: readFileSync(full, "utf8") });
          }
        };
        if (dir && existsSync(dir)) walk(dir, folder);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(notes));
      });
      server.middlewares.use("/vault-files", (req, res, next) => {
        const file = inside(decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0] ?? ""));
        if (!file || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.end(readFileSync(file));
      });
    },
    config: () => ({ define: { "import.meta.env.VITE_VAULT": JSON.stringify(root ? "1" : "") } }),
  };
}

export default defineConfig({
  plugins: [react(), vault(process.env.BOARDROOM_VAULT)],
  server: { fs: { allow: [resolve(__dirname, "../..")] } },
});
