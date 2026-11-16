# boardroom

Play the board games you own on your phone, offline. An installable web app (PWA): <https://luoxin9510.github.io/boardroom/>

Each game is a TypeScript rules engine plus a mobile-first React UI. A game's content (card images, card data, rules) is never in this repo or on the website: you keep it in your own Obsidian vault, pack it into a zip and import it on your phone, where it stays. The repo only ships code and original test cards, which you can play in the app right away.

- First game: **Goblin Mountain** (solo), a 9-card print-and-play game by Roman Flückiger. You need your own copy of the cards; the built-in test cards are invented.
- Design docs (Chinese): [platform PRD](docs/prd.md), [Goblin Mountain (wrapped up)](docs/games/goblin-mountain.md), [Zombicide: Black Plague (paused)](docs/games/zombicide-black-plague.md).

## On the phone

1. Open the link above in Safari → Share → **Add to Home Screen**. From then on it opens offline. New versions download in the background; a banner ("A new version is ready") appears when one has, tap it to reload.
2. On the Mac, make a content pack from a game vault and AirDrop it to the phone:
   ```sh
   npm run pack -- "<path to vault>"      # writes ~/Downloads/<game>-pack-<date>.zip
   ```
3. In the app, **Import content pack** and pick the zip. Re-import after editing the vault; saves are kept.

The vault needs a `boardroom.json` (`{ "game": "goblin-mountain" }`) and the card notes in `卡牌/` (format: [docs/games/goblin-mountain.md](docs/games/goblin-mountain.md) §3).

## Layout

| Path | What |
|---|---|
| `packages/core` | Seeded RNG, game session (log, undo, saves), note parser, i18n, the `Host` interface |
| `packages/ui` | React shell: bottom sheets, toasts, steppers, language context, wake lock, theme |
| `packages/host-web` | The PWA: library screen, content pack import, IndexedDB storage, service worker, manifest |
| `games/goblin-mountain` | Rules engine, content parser, screen, zh/en messages |
| `fixtures/goblin-mountain` | Original test cards in the same format as a real vault (also the app's "try with test cards") |
| `scripts/pack.mjs` | Vault → content pack zip |

## Develop

```sh
npm install
npm run check        # typecheck + unit tests + build
npm run dev          # dev server on http://localhost:5173 (also on your LAN); no service worker in dev
npx playwright install webkit && npm run e2e   # builds, serves the production build, plays at phone size, tests import and offline
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

License: MIT (code only).
