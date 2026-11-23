# CHANGELOG

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
