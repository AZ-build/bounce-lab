# CHANGELOG

## [Lab 1.8] - 2026-11-22
- New game: **Summit v1 "Sisyphus"** (`games/summit/`), an evolution of Rebound:
  - You drive a tall glass-and-steel Titan (3 m tall vs Rebound's low puck) up an endless neon mountain path
  - The ball is a heavy magma-cracked boulder: bigger, more gravity, low bounce, thuddy sound and camera shake
  - Camera is locked low and close behind the Titan with a wide lens; the boulder shows through the Titan's glass body
  - Tap (or the SMACK button, or a second finger) to smack the boulder up and ahead when it's inside the gold reach ring. Smack it as it rolls back into you for a PERFECT (more power, multiplier up to x5)
  - Let it get past you, drop it in a crevasse or off the ridge and you lose a boulder (3 per run, +1 at each camp)
  - Stages every 180 m of path, each steeper: Foothills, The Scree (falling rocks that stun you), Crevasses (flat landing ledges past each gap), The Gates (sliding slabs), The Ridge (no walls). After that they loop, steeper and mixed
  - Shards to knock the boulder through (amber low, cyan high), camp gates with a bonus and the lab colour changes per stage
  - The summit beacon on the horizon never gets any closer
- Readable source lives in `games/summit/src/` (unlike Rebound's minified bundle); `npm run build` there regenerates the game
- Lobby: Summit's ball hops low and heavy; share images regenerated

## [Lab 1.7] - 2026-11-22
- The lobby is now a little game:
  - Gravity fader (right edge): slide from 0.3g to 2.5g. Balls launch at the same speed, so low gravity sends them higher and floatier, heavy gravity keeps them low and quick. Dust on the wall drifts up or sinks to show it. Double-tap resets to 1g; arrow keys work too
  - Surge button (bottom left): lightning from the track kicks every ball upward. Recharges in about 3 seconds (collecting cells speeds it up). Space bar also surges
  - Energy cells replace stars: glass capsules with steel caps and glowing cores. Amber (low, 1), cyan (higher, 3), magenta (near the ceiling, rare, 8). Chains within about 2 seconds multiply
  - Lab power: energy raises the power level (15 / 45 / 100 / 180 / 300). Dark tubes on the wall flicker on as power rises, until the whole lab is lit
  - Wall-mounted Energy readout with power pips and best score (saved on the device)
- Share moved up next to sound; tapping empty space no longer makes balls jump (Surge does that now)
- Messages now pop up above the bottom buttons instead of over the sign

## [Lab 1.6.1] - 2026-11-22
- New app icon in the lab style: a steel ball with magenta neon seams hovering over the brushed-steel track, concrete wall panels with tie holes, cyan floor strip. Icon links carry `?v=3` so phones pick up the new one

## [Lab 1.6] - 2026-11-22
- Everything on the floor now matches the concrete-and-neon wall:
  - Balls are gunmetal steel spheres with glowing neon seams (tennis-ball curve) that really roll. Layers: steel body + energy halo, rotating seams, fixed reflections (highlight + the cyan floor strip mirrored in the ball)
  - "Soon" is a flickering hologram wireframe sphere
  - Floor is polished concrete drawn in true perspective (sawcut joints running back into the room), reflecting the wall neon
  - Track is brushed-steel plates with bolts, set into the floor, with a steel front lip and a neon channel
  - Blocks are concrete with steel caps and a neon channel; pillars are steel posts with a vertical neon tube; trampolines are steel launch pads with a chrome coil spring and energy glow
- Cards, list and in-game sheet: concrete panels (assets/concrete.png), brushed-steel round buttons, neon buttons set in steel bezels, and the real 3D ball as each game's icon

## [Lab 1.5] - 2026-11-22
- New look: a dark test lab. Near-black poured-concrete wall (panel seams, form-tie holes) that scrolls slower than the floor for depth, realistic neon tubes bolted to it (white-hot core, coloured glow, light on the wall, the occasional flicker), a cyan strip where the wall meets the floor, and a glossy floor in perspective that reflects the neon and the balls
- Obstacles are metal test crates seen slightly from above, with neon edge strips; springs are glowing launch pads; stars are little neon signs
- Header is a neon sign (Tilt Neon font) that flickers on when the page loads; UI font is Chakra Petch
- Cards and lists: dark glass panels with a neon tube along the top in the game's colour, neon title, lit "Play" button
- In-game overlay and app icon switched to the same dark neon style
- Keeps 1.4's calmer bounces, simpler cards and latest-version-first

## [Lab 1.4] - 2026-11-22
- Lobby redesign: calm dusk scene (soft hills, no neon grid or city), Bricolage Grotesque type, sentence case everywhere. The balls are the only bright colours on screen
- Happier bounces: balls are 75% of their old size, gravity is about 40% lighter, hops are higher and steadier, the wobble on landing is softer, collisions are gentler, leapfrogs happen about half as often, and the parade moves a bit slower
- Game card trimmed down: name, one-line description, how to play, a big Play button. Rating and plays on one quiet line, top 3 scores, one-tap rating with an optional note. Version chips, the stats grid and the version picker are gone
- Earlier versions are tucked into a collapsed "Earlier versions" link at the bottom of each card. Play and every shared link always open the latest version
- "New" tag shows only on the most recently added game, for its first week
- Installable app (PWA): app icon (icons/), manifest.webmanifest, offline helper (sw.js, always fetches the newest files when online). Install button appears in the lobby on Android/desktop Chrome; on iPhone use Share, then Add to Home Screen
- In-game overlay restyled to match (font, colours, sentence-case buttons)

## [Lab 1.3] - 2026-11-22
- GoatCounter connected: https://bounce-lab.goatcounter.com (page views + events)

## [Lab 1.2] - 2026-11-22
- Firebase connected (bounce-lab-ebfbd). Tested live: post score, rank, plays counter, rating + rating change, feedback all save; visitors can't read feedback; faked counters, oversized scores, extra fields and deletes are refused
- Admin access is now decided only by the Firestore rules (no email in config)
- Script links carry `?v=1.2` so updates show up immediately. Bump it on each release

## [Lab 1.1] - 2026-11-22
- Lobby reworked into a side-scrolling parade: balls hop along on their own with per-game personalities, clear blocks and pillars, launch off springs, leapfrog each other and bounce off each other's heads. Tap empty space (or Space) makes them all jump to grab stars; flinging still works
- Sharing: lobby Share button, Share on each game card, share button in every game (top left), score-challenge links (`?vs=&by=`) with "beat it" and "you beat it" messages
- Link previews: Open Graph tags + 1200x630 preview images for the lobby and each game (`tools/make_share_images.py`)
- Firebase config prefilled for project `bounce-lab-ebfbd`; SETUP.md rewritten for it; `siteUrl` setting so share links always point at the live site
- Published to GitHub: AZ-build/bounce-lab

## [Lab 1.0] - 2026-11-21
- Created Bounce Lab: interactive physics lobby, shared in-game lab kit, admin dashboard, Firestore rules, setup docs
- Imported Bouncer v1–v6, Rebound v1–v3 and Ascent v1–v5; latest of each connected to the lab (LAB button, leaderboard, stars, feedback, analytics)
- Lobby: flingable game balls, shockwave tap, drawable trampolines, gold-star mini-game with combos, tilt and zero-g, list view, game cards with every version
- Demo mode (localStorage) until Firebase is configured
