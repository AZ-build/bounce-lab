# CHANGELOG

## [Summit v9 "The Summits"] - 2026-11-23
- One boulder, like the myth. Lose it and it rolls all the way back down while your height counts back to zero, then your score is posted
- Your score is now your height (total metres climbed), shown big at the top. Points are still counted and shown at the end
- Real summits: a chain of mountains, each with a top you can reach. Acrocorinth (6 stages), Mount Parnassus (7), Mount Olympus (8), then the endless hills of Tartarus. Each is steeper and busier than the last
- The summit: get the boulder onto the flat top and it settles on the altar of a round marble temple just as the sun comes up. Sisyphus throws his fists up, gold laurel leaves burst out, and the gods offer you a gift (pick an advantage). Then the boulder tips off the far side and rolls down to the foot of the next mountain
- Each mountain is visible from the start as a snowy peak with a fire burning on top, and sunrise is timed so you reach the top at dawn
- Charon's fare: coins are now obols (bronze 1, silver 3, gold 10). Lose the boulder with enough obols (30, more on later mountains) and Charon offers to row it back from the underworld. Once per mountain
- New stage: The Wrath of Zeus. A pale glow marks where lightning will strike a second later; it stuns Sisyphus or knocks the boulder back down at you. Zeus joins other stages on Olympus and beyond
- New advantage Chain Death replaces Spare Boulder: once per mountain, a lost boulder comes back
- Fix: Sisyphus's body could sometimes load stretched and broken (it was attached to his skeleton mid-stride); it is now always attached in his rest pose
- v8 kept at versions/v8.html

## [Summit v8 "The Path"] - 2026-11-23
- Each crevasse now has ONE helper, never both: either a marble bridge along one edge (now a bit wider) or a wide rock launch ramp. Sisyphus walks up the ramp and leaps from its top
- An old stone path now switchbacks up the ridge to the summit, so you can see the climb still ahead
- The power meter moved: it now floats just above Sisyphus's head while you wind up (orange, turning gold when full, glowing when the boulder is in reach) instead of under your thumb. The finger marker is now just a faint ring
- v7 kept at versions/v7.html

## [Summit v7 "The Old Road"] - 2026-11-23
- Everything on the mountain now belongs to ancient Greece instead of a lab:
  - Camps are marble gateways: two fluted Doric columns, a lintel carved with the camp number in Roman numerals, a pediment on top, a bronze fire-bowl burning beside each one, and a worn marble threshold across the road
  - The sliding blast doors are now great blocks of grey stone bound in bronze that grind across the road (stage renamed "The Clashing Rocks")
  - Glowing energy cells are now spinning coins with an owl stamped on them: bronze, silver and gold, with a small glint
  - Crevasse bridges are a single slab of old marble with a fallen column along the edge; the launch ramps are tilted shelves of bedrock with scree at the foot. The hazard stripes, steel, neon tubes and blinking lamps are gone; stone cairns mark the edge
  - The boulder lost its steel bands: plain rock whose cracks glow with fire for a moment when you punch it
  - Camp celebration sparks are gold, the valley lights are a few warm village fires
  - Perks renamed to fit: Heavy Fist, Bronze Armour, Sure Footing
- The summit is now clearly the top of YOUR mountain: a long ridge starts just ahead of the road and climbs to a great snowy peak straight ahead, its lower slopes sinking into mist and cloud. It no longer looks like a separate island across a sea of cloud. The sunrise now comes up over the cloud sea on the right
- v6 kept at versions/v6.html

## [Smashball v4 "Goal"] - 2026-11-23
- **Rebound is now Smashball**, with a new link: `games/smashball/` (game id `smashball`). The old `games/rebound/` link redirects there. Scores, best score and sound setting start fresh under the new name (nobody had played it yet)
- Rebuilt from scratch as real source (`games/rebound/src/`, same toolkit as Summit) instead of the old sealed bundle
- 1v1 against a bot in a concrete-and-glass lab arena: you defend the cyan goal, the bot defends the magenta one. 2-minute match; tied at full time = golden goal
- The rings are gone. The point is the goal
- You play a tall polished-steel striker (3.5 m, about 1.75x the ball) with one neon band and a visor that shows which way it faces
- Camera sits close behind your striker, just over its shoulder, and swings round to always keep the ball in front (ball cam). Wide angle sized for a phone. Your striker fades see-through if it would hide the ball
- Controls: drag anywhere for a floating joystick. Up is always toward the ball, sideways circles it. Tap (or a second finger) = jump + smash: you lunge at the ball if it's close, jump higher for a high ball, and your next touch within half a second is a hard, slightly aim-assisted shot at the goal. The ring under your feet shows when smash is ready
- Fast strikers: top speed 15 m/s; bot 11 m/s
- Heavier ball: more gravity, low bounce, rolls to a stop. A ring on the floor shows where it is and how high
- Bot: gets behind the ball and drives it at your goal, loops round when it's on the wrong side, rushes back when you shoot, smashes when lined up. Speeds up a little when you're winning and late in the match
- Goal celebration when you score: slow-mo, your striker turns gold and does three hops with two full spins, a gold shockwave rings across the floor, seven fireworks launch off the goal posts, confetti pops over your head, the camera swings round to watch, your score number bumps on the scoreboard, a cheer line ("Top corner!", "Unstoppable!"…) and a bigger fanfare
- Look matches the lobby: little bloom or haze, formwork-concrete hall with thin neon tubes and recessed ceiling lights, brushed-steel goal frames with a thin neon line. Screens use Tilt Neon sign lettering, Chakra Petch, a steel-bezel scoreboard, a steel round mute button and the neon-rimmed pill button
- Scoring: goal 100 (smash goal 150), save 30 (touching the ball away when it was heading into your net), win +250. Best saved as `smashball-best-v4`
- v3 kept at versions/v3.html
- Lab: the hidden toast no longer peeks out as a dark pill at the top centre of every game (lab.css). Game pages now load lab.js?v=1.8.2

## [Summit v6 "The Statue"] - 2026-11-23
- Sisyphus is now one smooth sculpted marble body instead of joined cylinders: muscles, shoulders, neck, knees and elbows flow into each other like a carved statue, and the skin bends with his joints as he moves
- How it works: the body is sculpted from blended rounded shapes, turned into a single mesh when the game is built, packed small (about 325 KB), and attached to a skeleton so it bends naturally. The cloak is gone so his back muscles show
- New animation:
  - Walk: a real stride with knee bend, heel-to-toe, hip sway and counter-swinging arms, leaning into the slope
  - Wind-up: he coils, turning hips and shoulders away and cocking the fist back
  - Punch: hips fire first, then shoulders, then the arm, with a lunge step and follow-through. The guard hand pulls to the chin
  - Block brace, a stumble when bonked, a fist raise on a PERFECT, and a tucked leap over gaps
- New ground: a natural gravel texture with pebbles, hairline cracks and real bumps under the light (replaces the flat noisy pattern)
- Crevasses are easier: each one now has a steel plank bridge on one side (Sisyphus walks over it and the boulder rolls across) and a launch ramp on the other side that kicks a rolling boulder over the gap
- v5 kept at versions/v5.html

## [Summit v5 "The God"] - 2026-11-23
- Sisyphus re-sculpted as a Greek statue come to life (same rig and moves as v4):
  - Shaped anatomy instead of tubes: V-tapered torso with pecs, abs, lats, shoulder blades, spine groove and traps; capped deltoids; biceps/triceps, forearms, quads, kneecaps and calves
  - Polished veined marble with a soft blue rim light so he reads against the dark mountain
  - Head with a Greek profile, carved curls and a full beard, and a gold laurel wreath
  - Crimson drapery: a folded hip wrap, a sash over the left shoulder pinned with a gold brooch, and a cloak down his back that ripples as he walks and punches
  - Gold belt, gold arm ring, gold-wrapped punching fist (cestus) with charge rings, leather bracer on the blocking arm, laced sandals
- The key light now comes from behind the camera so his back and the road get real shading
- Camera a little closer; he only turns see-through when he really hides the boulder
- v4 kept at versions/v4.html

## [Summit v4 "Sisyphus"] - 2026-11-23
- No more STRIKE button. One finger does it all: press anywhere to wind up, slide side to side to steer while holding, let go to punch. A quick tap is a quick jab. A ring under your finger fills as you wind up and turns gold when the boulder is in reach
- The crawler is gone: you play Sisyphus himself, a 3.6 m marble figure in a dark wrap, leather straps, sandals and a laurel wreath, trudging uphill with a walk cycle and footsteps. His right fist wears a steel gauntlet with charge rings
- Winding up crouches him, twists his torso and cocks his right arm back with the elbow up; letting go throws a lunging punch. His left forearm (leather bracer) comes up as a guard while winding up or when the boulder is close
- While your guard is up, a boulder that rolls into him is blocked: shoved back uphill, no combo lost, wind-up kept. If you're not holding, it's a bonk (stagger, combo reset)
- He raises a fist after a PERFECT; he turns slightly as you steer
- Camera now sits over his right (punching) shoulder, a little closer
- v3 kept at versions/v3.html

## [Summit v3 "The Climb"] - 2026-11-22
- New player piece: a tracked lab crawler (brushed steel, concrete counterweight, neon trim, scrolling treads, exhaust puffs) with a sledgehammer arm. Winding up swings the hammer back over the cab and leans the crawler back; letting go slams it through. A small marble Sisyphus in a laurel wreath rides on the back with his chin on his fist, and throws a fist up on a PERFECT
- Bigger, heavier boulder (radius 2.0, more mass, less bounce, heavier gravity) and stronger hits (up to about 27 m/s forward). Heavy hits freeze for a split second (hit-stop) and kick the camera
- Throws aim down the winding road toward where it will be when the boulder lands
- The world is now a mountain road: a stepped cliff with ledges and pines on the left, a rocky berm and a long drop on the right, the road banked gently toward the cliff. Colour follows real altitude: grass and pines low, bare rock, then snow on the ledges and falling snow
- A sense of climbing: night at the bottom turns into sunrise as you gain height; you climb through a cloud layer (thick fog) and then the cloud sea stays below you; lab lights far down in the valley; two rings of distant ranges anchored in height so you rise past them; a ridged summit massif with a beacon that never gets any closer
- Freeze fixes: no lights are added or removed mid-game (v2's camp lamps forced every shader to rebuild = the freezes); terrain and course pieces are built a little per frame from a queue; shared geometry for rocks, pines, cells and doors; everything is compiled once behind the title screen; resolution (then bloom) steps down automatically if frames stay slow
- Energy cells hide when they'd pass through the camera
- Best score key is now `summit-best-v3`

## [Lab 1.8.1] - 2026-11-22
- Gravity control is now a wall-mounted dial up beside the header (mirrors the Energy readout) instead of a tall slider over the track. Turn it like a knob, drag up/right or down/left, or scroll over it. A neon arc and needle show the setting; double-tap resets to 1g
- Balls spread across the full width of the track again

## [Summit v2 "The Valley"] - 2026-11-22
- Sisyphus is bored: the Titan now walks uphill on its own at a steady pace (5.2 m/s, a little faster every stage, up to 10.5). You only steer left and right
- Hold STRIKE (or a second finger, or Space) to wind up: the Titan leans back, the ram draws in on its pistons, amber charge lights fill and the camera eases back. Let go to hurl. More wind-up = longer throw. Let go just as the boulder reaches you for a PERFECT (multiplier up to x6)
- If the boulder reaches you while you're winding up it still gets hit (weaker, no perfect). If you're not winding up it's a "bonk": a weak shove that costs your combo
- New look: a natural rocky valley (gravel floor, rock walls, moss low, snow and falling snow higher up) under moonlight with real shadows. The lab shows up in the man-made parts: brushed-steel Titan with a concrete base and a neon tube, steel blast doors with hazard stripes, concrete camp outposts with neon signs, lobby-style energy cells as pickups, warning bollards at crevasses
- Titan is taller (3.9 m) and turns see-through when the boulder is behind it
- Rocks and blast doors knock the Titan sideways and stun it; rockfall comes off the valley walls
- Camps: bonus, +1 boulder, and a choice of 3 advantages: Heavy Hands, Long Arms, Quick Wind-up, Foresight (landing arc), Focus (slow-mo while winding up), Stone Skin, Backstop, Spare Boulder, Lodestone, Sure Footing
- Throw distance scores points; game over shows the longest throw. Best score key is now `summit-best-v2`
- v1 kept at games/summit/versions/v1.html

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
