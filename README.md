# Bounce Lab

An experimental arcade of physics ball games. Play them, rate them, leave feedback, and see what people think on the admin page.

**Start here:** [docs/SETUP.md](docs/SETUP.md) to put it online · [docs/ADDING-A-GAME.md](docs/ADDING-A-GAME.md) to add a game

## What's inside
```
Bounce Lab/
├── index.html            Lobby: interactive bouncing-ball playground. Each ball is a game.
├── games.js              The list of games in the lobby (edit this to add one)
├── games/
│   ├── bouncer/          Side-scroller between two platforms
│   │   ├── index.html    Current version (v6), connected to the lab
│   │   └── versions/     v1–v6, every version kept and playable
│   ├── smashball/        Smashball (was Rebound): 1v1 arena striker (v1–v4, source in src/)
│   ├── ascent/           Vertical neon climber (v1–v5)
│   └── _template/        Starter for new games (a tiny keepy-uppy game)
├── lab/
│   ├── config.js         ← Your Firebase + GoatCounter settings (the only file to edit)
│   ├── lab.js            In-game kit: LAB button, leaderboard, stars, feedback, analytics
│   ├── lab.css
│   └── store.js          Saves data to Firebase, or to this device in demo mode
├── admin/index.html      Analytics + feedback dashboard (Google sign-in)
├── firebase/firestore.rules   Database security rules
├── tools/make_share_images.py Builds the link-preview images
└── docs/
```

## The lobby
- A side-scrolling parade: each game is a glowing ball hopping along on its own. The balls jump over blocks, launch off springs, and leapfrog each other now and then
- **Tap a ball** to open its card (rating, plays, top score, leaderboard, every version, feedback, share), then **Play**
- **Tap anywhere else** (or press Space) to make the whole parade jump. Use it to grab the gold stars and build combos
- **Fling** a ball to throw it around. It finds its way back into line
- Dock: **Games** (list view), **Share** (link to the lab), sound
- `index.html#ascent` opens straight to that game's card

## Sharing
- Every game has its own link (`/games/ascent/`) with a preview image for chat apps
- In-game share button (top left, next to LAB) shares the game
- After a run, the share button in the bottom bar sends a **challenge link** (`?vs=1234&by=Name`). Whoever opens it is told the score to beat
- On phones it opens the native share sheet; on computers it copies the link
- Preview images: `python3 tools/make_share_images.py` regenerates `share.jpg` for the lobby and each game (Claude runs this when a game is added or changes a lot)

## In every game
- A **LAB** button and a **share** button (top left) on title and game-over screens. They hide during play
- After a run, a bar slides up: back, **leaderboard** (post your score, see the top 10), **share your score**, and **one-tap star rating**
- Tap the stars or the bar to open the full sheet: rating, quick tags ("Too hard", "Love the feel"...) and a comment box
- Once a player has entered a name, new personal bests post automatically

## Demo mode vs. live
Live at **https://az-build.github.io/bounce-lab/**. Until `lab/config.js` has Firebase settings, everything is saved only on the device you're using. Good for testing. Follow docs/SETUP.md to go live.
