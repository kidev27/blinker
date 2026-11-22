# Blinker

A daily browser game. The first mode, **Backroads**, is a naming game against a fuel tank: you
get a category and a 30-second tank, and name things in it one at a time. Answers that clear the
road sign score miles and refuel the tank, and rarer answers earn more of both. The sign gets
stricter as you go; answers below it are accepted but score nothing. The round ends when the tank
runs dry, or when you pull over and turn the fuel left into bonus miles. You never lose miles.
Three rounds a day, same for everyone, with a spoiler-free share card and a streak.

Works in mobile browsers (primary) and desktop browsers.

## Run it

Needs Node.js 22.18 or newer, Node 26 included. The server runs TypeScript directly with no build
step, and SQLite is built into Node (`node:sqlite`), so `npm install` compiles nothing.

```bash
npm install
npm run dev      # API on :8787 with auto-restart, app on http://localhost:5173
npm test         # Vitest
npm run check    # type-check everything
```

Production:

```bash
npm ci
npm run build    # client -> dist/
npm start        # one process serves the app and the API on :8787
```

Environment variables: `PORT` (default 8787), `HOST` (default 127.0.0.1), `DB_PATH` (default
`data/blinker.db`). In production the guest cookie is `Secure`, so serve it over HTTPS.

### Deploying to a VM

SQLite lives in one file on disk, so use a VM with a persistent disk (not an ephemeral-disk PaaS).
Run `npm start` under systemd and put [Caddy](https://caddyserver.com) in front for automatic
HTTPS. A two-line `Caddyfile` is enough:

```
blinker.example.com
reverse_proxy 127.0.0.1:8787
```

Back up `data/blinker.db` (with its `-wal` file) or use `sqlite3 data/blinker.db .backup`.

## How it fits together

- `src/shared/` – types and rules shared by client and server (day keys, mode contract, Backroads config).
- `server/` – Fastify app. It owns every round: answer lists never reach the browser, and the
  deadline is enforced server-side.
- `src/client/` – Preact app. `core/` is mode-agnostic (API, streaks, share); each mode has its own folder.
- `content/<mode>/YYYY-MM-DD.json` – daily puzzles. Validated at server start and by `npm test`.
- `migrations/NNNN_*.sql` – applied in order on start, tracked with `PRAGMA user_version`.

### Adding a game mode

1. Shared config and types: `src/shared/modes/<id>.ts`
2. Server: implement `ServerMode` (`server/mode.ts`) in `server/modes/<id>.ts` and list it in
   `server/modes/registry.ts`. `apply()` is a pure reducer, so the same mode can later be driven
   by WebSocket events for live play.
3. Client: implement `ClientMode` (`src/client/mode.ts`) in `src/client/modes/<id>/` and list it
   in `src/client/modes/registry.ts`.
4. Content: `content/<id>/YYYY-MM-DD.json` with `{ "rounds": [...] }`.

No core files or database migrations change. `test/layering.test.ts` fails if core code imports a mode.

### Players

Guests only for now: the server creates a player and stores its id in an HttpOnly cookie. Every
route gets the player through `server/player.ts`, which is where accounts will plug in (look up a
session first, then link the account to the guest's existing player id so history carries over).
Clearing cookies currently loses a guest's progress.

### Writing Backroads content

Each round is `{ "prompt": "Name a …", "answers": { "Name|alias|alias": obscurity } }`, with
obscurity 0–100 (how few people would think of it). Tiers: Highway 0–24, Main Road 25–49,
Side Street 50–74, Backroad 75–89, Dirt Track 90–100. A round needs at least 40 answers across at
least 4 tiers, including one Dirt Track answer. Typos are forgiven on canonical names only
(never aliases), and ambiguous typos are rejected.

#### Big answer lists from Wikidata

Open-ended prompts accept far more than a hand list can hold. Add `"catalog": "<id>"` to a round
and every name in `content/catalogs/<id>.json` is an answer too: dog breeds (~700), fruits,
Greek gods (~530), instruments (~1,000), sports, cheeses, birds (~5,200 species), gemstones,
languages (~1,300), dinosaurs (~1,600 genera, birds left out), vegetables and board games.

- Hand-written answers win: a catalog name sharing a name or alias with one is skipped.
- Obscurity comes from fame, the number of Wikipedias with an article:
  `100 - 33 × log10(fame)`, never below 30. A name the hand list missed is at least Main Road.
- Typos only match catalog names with 20 or more Wikipedias.

Rebuild the lists (a few minutes; the script retries when Wikidata is slow):

```bash
NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts             # all
NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts birds       # one
```

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTP proxy. Small closed sets (countries,
elements, capitals, constellations) are already complete by hand.

Names Wikidata misses go in `content/sources/<catalog>.txt`, one `Name|alias|alias` per line
(e.g. ice apple in `fruits.txt`); their fame is looked up on Wikidata by name.
