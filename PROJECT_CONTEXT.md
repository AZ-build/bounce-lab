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
| smashball | Smashball (was Rebound) | v4 Goal | v1–v4 | Session 2: 3D striker. v4 (Session 5) rebuilt from source: 1v1 vs a bot, ball cam, tap = jump + smash, goal celebration |
| ascent | Ascent | v6 Earned Clutch | v1–v6 | Session 3: vertical scroller, curved pad. v6: clutch slow-mo is a banked power-up (C) |
| summit | Summit | v9 The Summits | v1–v9 | Session 4: evolution of Rebound. Sisyphus figure punches the boulder; one-finger hold/slide/release; mountain road; camp perks |

## How a game plugs in
- One script tag: `<script src="../../lab/lab.js" data-game="<id>" data-version="vN">`
- Hooks: `BounceLab.start()`, `BounceLab.gameOver(score, stats)`, optional `BounceLab.menu()`
- Hook locations:
  - Bouncer: `startGame()` and `die()`
  - Ascent: `start()`, `gameOver()` and `toMenu()`
  - Smashball: `start()` and `endMatch()` in `games/smashball/src/main.js` (edit the source, then `npm run build` in that folder)
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

## Lobby obstacles (Lab 1.10)
- Drawn in two passes in `render()`: `obsFloor()` (track reflection via `reflectImg()`, soft footprint shadows via `footShadow()` / `blotShadow()`, coloured floor spill) for all, then `obsBody()`, farthest from the middle first
- Kinds: block → `drawBlock()` (front face cached by `blockFace()`), pillar → `drawPylon()` (body cached by `pylonBody()`), spring → `drawLiftPad()` (uses `o.k` compression and `o.fireT` launch flash, set in `step()`)
- `RIM` is the cyan wall-light rim colour. `?debug` exposes `window.__lobby` (obs, pace(), holdCourse()) for screenshots

## Lobby mini-game (Lab 1.7)
- Gravity: `G = G0 × gMul`, set by `setGravity()` from the wall dial (`#grav`: SVG gauge, knob turned by drag/scroll via `nudgeT()`). `hop()` keeps launch speed fixed, so gravity changes hop height
- Surge: `surge()`, recharge time `SURGE_TIME`, lightning in `zaps`
- Rewards: `CELL` tiers (colour, value, height range), `collectCell()`, power thresholds `POWER_AT`, `powerUp()`. Each wall tube has a power level it needs (`fixtures()`); unlit tubes use `offSprite()`
- Best energy saved in localStorage as `bouncelab-lobby-energy`

## Installable app
`manifest.webmanifest` + `icons/` + `sw.js` at the site root. The service worker is network-first, so online visitors always get fresh files. Bump `CACHE` in sw.js only if you need to wipe everyone's offline copy. The icon is drawn by a small script (see icons/icon.svg, exported with rsvg-convert).
Each game also has its own icon and manifest (`games/<id>/icons/`, `games/<id>/manifest.webmanifest`) from `tools/make_game_icons.py`: scenes per `icon` kind (side, goal, up, peak), the game's `color` as the neon. Manifest `start_url` is the game, `scope` is the whole site (so Back to the lab stays in the app window), `id` is unique per game so a game can be installed next to the lab. Rerun the script after replacing a game's index.html; bump `ICON_V` in it when the art changes

## Sharing
`S.share()` / `S.siteUrl()` are in store.js. Challenge links use `?vs=<score>&by=<name>`, handled in lab.js. Preview images come from `tools/make_share_images.py`; rerun it after adding a game.

## Releasing
Bump the `?v=` number on script tags in index.html, admin/index.html and games/*/index.html (GitHub Pages lets browsers cache files for 10 minutes). The test game id `zz-test` exists in Firestore from the live connection check; it's ignored by the lobby and admin.

## Conventions
- Lobby registry is `games.js` (not JSON) so the site also works when opened from disk
- Every new version: keep the old file in `versions/`, update `games.js`
- Phone-first; lab UI stops touches from reaching the game

## Ascent notes (v6)
- Clutch: `updateClutch()`. Setting `S.clutch2`: 0 off, 1 power-up (default), 2 always. Power-up `POW.clutch` adds to `clutchCharges` (max `TUNE.clutchMax`); clutch only fires when the last free orb is below `zoneTop` (`TUNE.clutchZone`) and predicted to miss the pad, and uses a charge
- Settings saved as `bouncer-ascent-settings-v4`. Menus: overlays `.ov` (titleOv, pauseOv, overOv, setOv, howOv, lbOv), `openSub()` remembers `setReturn`
- Holding the orb: once the climb has started a held orb launches itself after `TUNE.holdFuse` s (ring around it). Held orbs collect nothing; the pad only catches power-ups, never coins

## Summit notes (v9)
- Menus (lab 1.11): `#layer` holds the pause menu and sub-screens (`.sec`, card class `.mcard` because `.card` is taken by the perk cards). `pauseGame()` / `resumeGame()` / `toMenu()` / `openSub()` near the input code. Settings `summit-settings` (vibe, steer, glow)
- Source: `games/summit/src/` (main.js, template.html, build.mjs). `npm install && npm run build` there writes ../index.html and ../versions/v9.html (change the version file name in package.json for each new version). Older versions in versions/ are frozen archives
- Tuning: `CFG` (gravity, boulder size/mass, crawler size, drive speed per stage, charge time, throw power range, reach, cloud height) and `STAGES` at the top of main.js. Advantages are in `PERKS`
- The road: `H(d)` road height at distance d (d = -z), `xc(d)` winding centre line, `G(d, x)` ground anywhere (banked road, `cliffY` on the left, `dropY` berm + drop on the right, ridge drop-off in Ridge stages). Crevasses from `gapsFor(stage)` (seeded; a landing ledge follows each gap)
- Sisyphus body (v6): sculpted in `sdfbody.mjs` from blended ellipsoids/round cones (a "signed distance field"), turned into a mesh with surface nets, skin-weighted to bones `BONES` (hips, spine, head, sh±1, el±1, hip±1, knee±1, ankle±1). `pack.mjs` compresses it; `build.mjs` injects it as `BODY_DATA`, and main.js decodes it into a `THREE.SkinnedMesh`. Editing sdfbody.mjs means rebuilding with build.mjs (the body is NOT computed in the browser). Hair, beard, laurel, drapery, belt, cestus, bracer and sandals are separate pieces attached to bones. Marble uses a fresnel rim via `onBeforeCompile`
- Animation: `poseFigure()` blends walk gait / coil (`P.coil` follows `P.charge`) / timed punch (`P.punchT` 0→.55 s, hips → shoulders → arm, lunge) / guard / block / bonk (`P.bonk`) / cheer / leap tuck (`P.air`). Collision is an upright capsule (`CFG.bodyR`, `CFG.bodyH`)
- Gaps (v6): each gap from `gapsFor()` has a bridge (`b0..b1`, offsets from the road centre) and a launch ramp (`r0..r1`, `RAMP_L`, `RAMP_H`). Since v8 a gap has a bridge OR a ramp (the unused one is 0..0). Use `openGap(d, x)` (not `inGap`) to ask "would you fall here?"
- Theme (v7): everything is ancient Greek, no lab props. Shared pieces: `COL_SHAFT` (fluted column), `COL_CAP`, `BLOCK_GEO` (rough stone block), `brazier()` (fire sprites animated via `flames`), `cairn()`; materials `marbleStoneMat`, `oldStoneMat`, `bronzeMat`, `rampRockMat`. Camps = `buildCamp()` gateway with `friezeTex(k)`; moving blocks = `buildGate()`; coins = `makeCell()` (still called cells in code, `CELL` tiers). Fire is sprites only (never add lights)
- Summit (v7): `summit` is one ridge heightfield in `far` (moves with the camera). `shape(x,z)` returns height plus a weight `aw`; the shader adds `uAlt * aw` so the ridge's foot stays level with the player and the peak stays put. Lower slopes are hazed toward the fog colour (`hazeCol`, `hazeMin` = in-cloud)
- Power meter (v8): `#power` DOM bar positioned each frame over his head (projected `P.p + 4.3`); `#touch` is only a faint finger ring. The summit path is a ribbon in the `summit` IIFE using the same ridge shader (`ridgeMat`)
- Structure (v9): `MOUNTAINS` + `MT` (current mountain). `stageSeq(m)` lists the stages for a mountain; `stageDef(k)` returns `SUMMIT_STAGE` past the last one. `summitD()` is where the road tops out (flat top, then `slopeDeg` drops the far side). Moving to the next mountain: `nextMountain()` → `resetHeights()` (clears the height and gap caches) → `resetWorld()` (also rebuilds `massif`)
- The mountain you see (v9): `buildMassif()` makes a world mesh shaped from the road's own height profile; its shader carves a trench near the player (`uPd`) so the detailed road shows, and exaggerates far heights (×1.5 above the camera, fading out within ~220 m). The fire `beacon` on the summit follows the same exaggeration
- Run flow (v9): one boulder. Lost → `ball.lost` countdown → Chain Death → `offerCharon()` (mode 'charon') → `beginFall()` (mode 'fall', camera follows the boulder down, `#fallCount` drains) → `gameOver()`. Score posted to the lab = `total()` metres. Best saved as `summit-best-h1`
- Summit (v9): `beginSummit()` (mode 'summit') → `stepSummit()` phase 0 (altar, cheer, laurel bursts) → gift via `offerPerks('GIFT OF THE GODS')` → phase 2 (boulder rolls off) → `nextMountain()`. Temple = `buildTemple()` built as stage `nStages()`
- Zeus (v9): `stepZeus()` uses `stageDef().zeus`; `bolts` list (warning glow 1.15 s, then bolt). Flash is the `#zap` DOM overlay, not a light
- Body binding: the skinned body is bound with bones reset to rest pose (it loads async; binding mid-pose broke the mesh)
- Ground texture: `groundTextures()` makes a tiling gravel colour map plus normal map at startup
- Controls: one pointer; `pointerdown` → `beginCharge()`, move → steer `P.toff`, `pointerup` → `endCharge()` → `strike()`. Holding when the boulder arrives = block
- Performance rules: never add/remove lights at runtime; reuse shared geometries (`SHARED_GEOS` are never disposed); new world pieces go through `queue()` / `doWork()`; new object types should be added to the warm-up block so their shaders compile behind the title screen
- Test hook: `window.__summit` (state, `update()`, `strike()`, `offerPerks()`, `takePerk()`, `doWork()`, `buildStage()`, `buildChunk()`)
- Best score saved as `summit-best-v3`; mute as `summit-muted`

## Smashball notes (v4)
- Menus (lab 1.11): `#layer` holds the pause menu and sub-screens; `pauseGame()` / `toMenu()` / `openSub()` above the game loop. Settings `smashball-settings` (vibe, cam, bot, glow) applied to `CFG` by `applySettings()`. Rebuild with `node build.mjs lab ../index.html` only (the npm script also rewrites the frozen versions/v4.html)
- Renamed from Rebound in Nov 2026 before it was shared: id, folder, URL (`games/smashball/`) and localStorage keys (`smashball-*`) all moved. `games/rebound/index.html` is just a redirect to the new link
- Source: `games/smashball/src/` (main.js, template.html, build.mjs). `npm install && npm run build` there writes ../index.html and ../versions/v4.html. v1–v3 in versions/ are frozen minified archives
- Tuning: `CFG` at the top of main.js (arena size, goal size, ball gravity/bounce/roll, striker size/speed/jump, smash window/cooldown/speed/aim assist, bot speed/smash chance, camera distance/height/side offset/field of view, match length)
- Coordinates: x across, z along the pitch. You defend +z (cyan goal), the bot defends -z (magenta). Walls are planes in `PLANES` (two sides + four chamfered corners) plus the end walls with the goal mouth cut out
- Ball cam: `cameraUpdate()` swings `camYaw` toward the ball (slower when the ball is right on top of you), sits behind and over the right shoulder, and stays inside the arena (`keepInside()`)
- Input: floating joystick read in the camera's frame (`playerInput()`); a quick tap or a second finger calls `tap(P)` (jump + dash at the ball + arms `smash`). `hitBall()` handles touches; `smash()` sets the shot
- Goal celebration: `celebrate()` / `stepCelebration()` / `endCelebration()` with state in `CEL` (hops, spin, fireworks timings `ROCKET_AT`), the floor `shock` ring, and the celebration camera inside `cameraUpdate()`
- Bot brain: `think(o, s)` (also drives your striker when `S.autoplay` is on, for testing)
- Test hook: `window.__smashball` (S, P, B, ball, CEL, start, tap, update, think, stick, cameraUpdate, scored)

## Lab rules for every game (since lab 1.11)
- Every game has its OWN menus, styled its own way (the game stands on its own): main menu (Play, How to play, Leaderboard, Settings, Back to the lab), its own pause button + pause menu (Resume, Restart, How to play, Leaderboard, Settings, Main menu, Back to the lab, Suggest an improvement), game over (Again, Leaderboard, Main menu). Sub-screens return to whichever menu opened them. Auto-pause on `visibilitychange`, Esc/P toggles pause
- Lab helpers for those menus: `BounceLab.leaderboard(el, { n, unit })` (top scores into the game's own screen, class `.bl-glb`), `BounceLab.exit()`, `BounceLab.openFeedback()`, `BounceLab.menu()` when back on the main menu. Script tag gets `data-menus="own"` (lab hides its Lab/share chips)
- `BounceLab.pausable()` (the lab's generic pause menu) still works but no game uses it any more
- Sound (lab 1.13): the sound kit at the top of lab.js and store.js (same code, guarded) wraps `AudioContext` as `LabAudioContext`, sets `navigator.audioSession.type` ('playback' when sound is on, 'ambient' when off), and resumes stuck contexts on touchend/pointerup/click/keydown unless the game called `suspend()` itself. One preference: `BounceLabSound.muted` / `BounceLabSound.setMuted()` (localStorage `bouncelab-muted`). Every game must offer Sound in its Settings and read/write it through BounceLabSound
- Names (lab 1.12): one name for the whole site in localStorage `bouncelab-name`. First game over with a score and no name opens the lab's name prompt (`openName()`), once (`bouncelab-name-asked` after Save or Not now). With a name, `autoPost()` posts when the run beats the device best (`key('pb')`) or makes the top 50 (`BOARD_N`). In-game boards show "Playing as X · change"
- Rating lives only on the game-over bar and the lab card (since lab 1.10). Back-to-lab: the Lab chip on title screens, the pause menu, the game-over bar. Never during play
- Hidden overlays must never catch taps: `.bl-links` inherits pointer-events from its menu (a hidden Ascent pause screen once swallowed the PLAY tap)
- Leaderboard = top 50 scores (`topScores`, `BOARD_N`), not best per player
- Menus must fit short phones: scrollable overlays with `margin-top: auto` on the first child (not `justify-content: center/flex-end` with overflow), padding for safe areas, the Lab chips (~52px) and the game-over bar (~96px)
- Bump the `lab.js?v=` cache-buster in every game when lab.js/lab.css change (currently 1.13; also in games/summit/src/build.mjs and games/smashball/src/build.mjs)
- Heavy games show a loading screen first (Summit: `#boot` + `bootStep()`; the game script is a module so the page paints before it runs)
