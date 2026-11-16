# boardroom

Play the board games you own on your phone, offline, inside Obsidian.

Each game is a TypeScript rules engine plus a mobile-first React UI, hosted by an Obsidian plugin. The game's content (card images, card data, rules notes) lives in your own vault and is never committed here; the repo only ships code and original test content.

- First game: **Goblin Mountain** (solo), a 9-card print-and-play game by Roman Flückiger. You need your own copy of the cards; this repo only has invented test cards in `fixtures/`.
- Design docs (Chinese): [platform PRD](docs/prd.md), [Goblin Mountain](docs/games/goblin-mountain.md), [Zombicide: Black Plague (paused)](docs/games/zombicide-black-plague.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | Seeded RNG, game session (log, undo, saves), note parser, i18n, the `Host` interface |
| `packages/ui` | React shell: bottom sheets, toasts, steppers, language context, wake lock, theme |
| `packages/host-obsidian` | The Obsidian plugin (desktop and mobile) |
| `packages/host-web` | Browser host for development and e2e tests (uses the fixtures) |
| `games/goblin-mountain` | Rules engine, content parser, screen, zh/en messages |
| `fixtures/goblin-mountain` | Original test cards in the same format as a real vault |
| `spikes/obsidian-mobile` | The throwaway probe that checked Obsidian on iPhone |

## Develop

```sh
npm install
npm run check        # typecheck + unit tests + plugin build
npm run dev          # browser host on http://localhost:5173 (also on your LAN), with the test cards
BOARDROOM_VAULT="<path to vault>" npm run dev   # same, but reading a real vault's card notes and images (read-only; readable from your LAN while it runs)
npx playwright install webkit && npm run e2e   # plays whole games at phone size
```

## Install into a vault

```sh
npm run build
npm run install:vault -- "<path to vault>"               # a game vault with your own card notes
npm run install:vault -- "<path to test vault>" --fixtures  # an empty vault: also copies the test cards
```

The vault needs a `boardroom.json` (`{ "game": "goblin-mountain" }`) and the card notes in `卡牌/` (format: [docs/games/goblin-mountain.md](docs/games/goblin-mountain.md) §3). If the vault is in iCloud's Obsidian folder, the plugin syncs to your phone with it. In Obsidian, enable the plugin and run **Play / 开始游戏**.

License: MIT (code only).
