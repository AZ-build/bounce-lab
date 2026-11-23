# PROJECT_CONTEXT: Bounce Lab

**What it is:** A web "game lab": an interactive lobby plus a collection of physics ball games that people can play, score, rate and give feedback on. Adrian keeps evolving each game and adding new ones.

**Hosting:** GitHub Pages from `AZ-build/bounce-lab` (main branch, root) at https://az-build.github.io/bounce-lab/. No build step, plain HTML/JS.
**Firebase project:** `bounce-lab-ebfbd` (dedicated to Bounce Lab).
**Data:** Firebase Firestore, collection `bouncelab_games/{gameId}` with `scores`, `feedback` and `sessions` subcollections plus summary counters. Demo mode falls back to localStorage.
**Analytics:** GoatCounter (page views + events like `ascent/gameover`).
**Admin:** `/admin/`, gated by Firebase Google sign-in plus `isAdmin()` in the Firestore rules (the email lives only in the rules).

## Games (Nov 2026)
| id | Title | Current | Versions kept | Origin |
|---|---|---|---|---|
| bouncer | Bouncer | v6 Evolving | v1–v6 | Session 1: side-scroller, two thumb-locked platforms |
| rebound | Rebound | v3 Striker | v1–v3 | Session 2: 3D Rocket-League-style striker (three.js bundled inline) |
| ascent | Ascent | v5 Clutch slow-mo | v1–v5 | Session 3: vertical scroller, curved pad, clutch slow-mo |

## How a game plugs in
- One script tag: `<script src="../../lab/lab.js" data-game="<id>" data-version="vN">`
- Hooks: `BounceLab.start()`, `BounceLab.gameOver(score, stats)`, optional `BounceLab.menu()`
- Hook locations:
  - Bouncer: `startGame()` and `die()`
  - Ascent: `start()`, `gameOver()` and `toMenu()`
  - Rebound (minified bundle): `Jt="play"` and after `#oRally` is set in the game-over function
- `versions/*.html` are untouched archives with no lab hooks

## Lobby
A side-scrolling parade (`index.html`). The hop logic is in `hop()`; per-game feel is in `PERSONALITY`; leapfrogs are in `maybeLeapfrog()`. The course (blocks, pillars, springs, stars) is generated in `spawnCourse()`.

## Look and feel (Lab 1.4)
- Palette: night #0e1230, dusk #2b2660, sheet #151937, raised #1d2246, text #eef0ff, soft #b7bbe0, muted #7f84b0, sun #ffc94d. Game ball colours are the only saturated colours
- Type: Bricolage Grotesque (Google Fonts), sentence case, no all-caps labels
- Lobby physics knobs: `BR` (ball size, 0.75 × R), `G` (gravity, H × 1.6), `V` (parade speed) in `layout()`; per-game hop feel in `PERSONALITY`
- Cards show the current version only; older ones live under "Earlier versions"

## Installable app
`manifest.webmanifest` + `icons/` + `sw.js` at the site root. The service worker is network-first, so online visitors always get fresh files. Bump `CACHE` in sw.js only if you need to wipe everyone's offline copy. The icon is drawn by a small script (see icons/icon.svg, exported with rsvg-convert)

## Sharing
`S.share()` / `S.siteUrl()` are in store.js. Challenge links use `?vs=<score>&by=<name>`, handled in lab.js. Preview images come from `tools/make_share_images.py`; rerun it after adding a game.

## Releasing
Bump the `?v=` number on script tags in index.html, admin/index.html and games/*/index.html (GitHub Pages lets browsers cache files for 10 minutes). The test game id `zz-test` exists in Firestore from the live connection check; it's ignored by the lobby and admin.

## Conventions
- Lobby registry is `games.js` (not JSON) so the site also works when opened from disk
- Every new version: keep the old file in `versions/`, update `games.js`
- Phone-first; lab UI stops touches from reaching the game
