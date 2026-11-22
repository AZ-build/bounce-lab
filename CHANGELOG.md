# CHANGELOG

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
