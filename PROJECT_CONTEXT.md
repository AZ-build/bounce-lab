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
| summit | Summit | v5 The God | v1–v5 | Session 4: evolution of Rebound. Sisyphus figure punches the boulder; one-finger hold/slide/release; mountain road; camp perks |

## How a game plugs in
- One script tag: `<script src="../../lab/lab.js" data-game="<id>" data-version="vN">`
- Hooks: `BounceLab.start()`, `BounceLab.gameOver(score, stats)`, optional `BounceLab.menu()`
- Hook locations:
  - Bouncer: `startGame()` and `die()`
  - Ascent: `start()`, `gameOver()` and `toMenu()`
  - Rebound (minified bundle): `Jt="play"` and after `#oRally` is set in the game-over function
  - Summit: `start()` and `gameOver()` in `games/summit/src/main.js` (edit the source, then `npm run build` in that folder)
- `versions/*.html` are untouched archives with no lab hooks

## Lobby
A side-scrolling parade (`index.html`). The hop logic is in `hop()`; per-game feel is in `PERSONALITY`; leapfrogs are in `maybeLeapfrog()`. The course (blocks, pillars, springs, stars) is generated in `spawnCourse()`.

## Look and feel (Lab 1.5: dark neon test lab)
- Palette: void #050507, panel #0b0c10, raised #15171d, text #e8f1ff, soft #a9b4c6, muted #677285, neon cyan #3ef6ff, magenta #ff3fb4, amber #ffc23a
- Type: Tilt Neon for signs and titles (looks like real neon tubes), Chakra Petch for everything else
- `.neon` CSS class = realistic neon text (set `--n` to the colour)
- Materials: `buildMaterials()` makes the concrete floor, brushed steel and block textures; `perspFill()` lays a texture flat in perspective; `seams()` draws joints; `box3d()` draws concrete/steel boxes; `makeSprite()` builds the steel balls (base/detail/gloss layers, `drawBall()` draws them, `b.ang` is the roll); `paintOrb()` puts a ball in a card
- Lobby scene in `render()`: `buildWall()` pre-renders the concrete wall once per screen size; `fixtures()` places the neon tubes; floor reflections, crates and labels follow
- Lobby physics knobs: `BR` (ball size, 0.75 × R), `G` (gravity, H × 1.6), `V` (parade speed) in `layout()`; per-game hop feel in `PERSONALITY`
- Cards show the current version only; older ones live under "Earlier versions"

## Lobby mini-game (Lab 1.7)
- Gravity: `G = G0 × gMul`, set by `setGravity()` from the wall dial (`#grav`: SVG gauge, knob turned by drag/scroll via `nudgeT()`). `hop()` keeps launch speed fixed, so gravity changes hop height
- Surge: `surge()`, recharge time `SURGE_TIME`, lightning in `zaps`
- Rewards: `CELL` tiers (colour, value, height range), `collectCell()`, power thresholds `POWER_AT`, `powerUp()`. Each wall tube has a power level it needs (`fixtures()`); unlit tubes use `offSprite()`
- Best energy saved in localStorage as `bouncelab-lobby-energy`

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

## Summit notes (v5)
- Source: `games/summit/src/` (main.js, template.html, build.mjs). `npm install && npm run build` there writes ../index.html and ../versions/v5.html. Older versions in versions/ are frozen archives
- Tuning: `CFG` (gravity, boulder size/mass, crawler size, drive speed per stage, charge time, throw power range, reach, cloud height) and `STAGES` at the top of main.js. Advantages are in `PERKS`
- The road: `H(d)` road height at distance d (d = -z), `xc(d)` winding centre line, `G(d, x)` ground anywhere (banked road, `cliffY` on the left, `dropY` berm + drop on the right, ridge drop-off in Ridge stages). Crevasses from `gapsFor(stage)` (seeded; a landing ledge follows each gap)
- Sisyphus: sculpted with `lathe(profile, segs, bump)` (turned shapes with muscle bumps) in the IIFE after the boulder; marble uses a fresnel rim added via `onBeforeCompile`; cloak vertices animated in `poseFigure()`; joints in `J` (hips, spine, head, sh±1, el±1, hip±1, knee±1), root scaled ×2. `poseFigure()` blends walk / wind-up (`P.charge`) / punch (`P.release`) / guard (`P.guard`) / block (`P.block`) / cheer. Collision is an upright capsule (`CFG.bodyR`, `CFG.bodyH`)
- Controls: one pointer; `pointerdown` → `beginCharge()`, move → steer `P.toff`, `pointerup` → `endCharge()` → `strike()`. Holding when the boulder arrives = block
- Performance rules: never add/remove lights at runtime; reuse shared geometries (`SHARED_GEOS` are never disposed); new world pieces go through `queue()` / `doWork()`; new object types should be added to the warm-up block so their shaders compile behind the title screen
- Test hook: `window.__summit` (state, `update()`, `strike()`, `offerPerks()`, `takePerk()`, `doWork()`, `buildStage()`, `buildChunk()`)
- Best score saved as `summit-best-v3`; mute as `summit-muted`
