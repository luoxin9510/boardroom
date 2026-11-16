import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";

const IMAGE_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

/**
 * Dev only: BOARDROOM_VAULT=<path> npm run dev serves that vault's card notes and images,
 * so the browser shows the real cards. Reads only; files the game writes still go to localStorage.
 * Only markdown under a named folder and image files are served, never dot-folders such as .obsidian;
 * `npm run dev` listens on the LAN, so anything served here is readable from your network.
 */
function vault(root: string | undefined): Plugin {
  return {
    name: "boardroom-vault",
    apply: "serve",
    configureServer(server) {
      if (!root) return;
      const base = resolve(root);
      const inside = (p: string) => {
        if (p.split(/[\\/]/).some((seg) => seg.startsWith("."))) return null;
        const full = resolve(base, p);
        return full === base || full.startsWith(base + sep) ? full : null;
      };
      server.middlewares.use("/vault-notes", (req, res) => {
        const folder = new URL(req.url ?? "", "http://x").searchParams.get("folder") ?? "";
        const dir = folder ? inside(folder) : null;
        const notes: { path: string; text: string }[] = [];
        const walk = (d: string, rel: string) => {
          for (const f of readdirSync(d)) {
            const full = join(d, f);
            if (f.startsWith(".")) continue;
            if (statSync(full).isDirectory()) walk(full, `${rel}/${f}`);
            else if (f.endsWith(".md")) notes.push({ path: `${rel}/${f}`, text: readFileSync(full, "utf8") });
          }
        };
        try {
          if (dir && existsSync(dir) && statSync(dir).isDirectory()) walk(dir, folder);
        } catch {
          /* unreadable entry: return what we have */
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(notes));
      });
      server.middlewares.use("/vault-files", (req, res, next) => {
        let file: string | null = null;
        try {
          file = inside(decodeURIComponent((req.url ?? "").replace(/^\//, "").split("?")[0] ?? ""));
        } catch {
          return next();
        }
        const type = file ? IMAGE_TYPES[extname(file).toLowerCase()] : undefined;
        if (!file || !type || !existsSync(file) || statSync(file).isDirectory()) return next();
        res.setHeader("content-type", type);
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
