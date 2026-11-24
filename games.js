/* =====================================================================
   BOUNCE LAB — GAME LIST
   Every game in the lobby is one entry below. To add a game:
     1. Copy the folder games/_template to games/<your-game-id>
     2. Add an entry here with the same "id"
   Full steps: docs/ADDING-A-GAME.md
   Fields:
     id          folder name under games/ (lowercase, no spaces)
     title       name on the ball
     tagline     one line under the title
     description a sentence or two for the game card
     controls    how to play, in one line
     color       the ball's neon color (hex)
     icon        "side", "goal", "up", or leave "" for the first letter
     version     current version label (games/<id>/index.html)
     versions    older versions kept in games/<id>/versions/
     status      "prototype", "beta" or "live"
   ===================================================================== */
window.BOUNCE_LAB_GAMES = [
  {
    "id": "bouncer",
    "title": "Bouncer",
    "tagline": "Side-scroller between two platforms",
    "description": "Steer two thumb-locked platforms and keep a chrome orb bouncing through blades, gold and gravity flips. Every sector changes the rules.",
    "controls": "Drag up and down to move the platforms",
    "color": "#5ef2ff",
    "icon": "side",
    "version": "v6",
    "versionName": "Evolving",
    "added": "2026-11-18",
    "updated": "2026-11-20",
    "status": "prototype",
    "versions": [
      {
        "v": "v1",
        "name": "Hold to dive",
        "file": "versions/v1.html"
      },
      {
        "v": "v2",
        "name": "The Platform",
        "file": "versions/v2.html"
      },
      {
        "v": "v3",
        "name": "Sectors",
        "file": "versions/v3.html"
      },
      {
        "v": "v4",
        "name": "The Cage",
        "file": "versions/v4.html"
      },
      {
        "v": "v5",
        "name": "Overdrive",
        "file": "versions/v5.html"
      },
      {
        "v": "v6",
        "name": "Evolving",
        "file": "versions/v6.html"
      }
    ]
  },
  {
    "id": "smashball",
    "title": "Smashball",
    "tagline": "1v1 arena striker",
    "description": "Run your striker at a heavy ball, smash it past the bot and guard your own goal. 2-minute matches",
    "controls": "Drag anywhere to run (up = toward the ball), tap to jump + smash",
    "color": "#ff9a3c",
    "icon": "goal",
    "version": "v4",
    "versionName": "Goal",
    "added": "2026-11-19",
    "updated": "2026-11-23",
    "status": "prototype",
    "versions": [
      {
        "v": "v1",
        "name": "Roll",
        "file": "versions/v1.html"
      },
      {
        "v": "v2",
        "name": "Striker",
        "file": "versions/v2.html"
      },
      {
        "v": "v3",
        "name": "Striker+",
        "file": "versions/v3.html"
      },
      {
        "v": "v4",
        "name": "Goal",
        "file": "versions/v4.html"
      }
    ]
  },
  {
    "id": "ascent",
    "title": "Ascent",
    "tagline": "Vertical neon climber",
    "description": "Move a curved pad to bounce orbs up through falling obstacles. Grab power-ups, juggle multi-orb, and survive the slow-mo clutch.",
    "controls": "Drag anywhere to move the pad",
    "color": "#ff4fd8",
    "icon": "up",
    "version": "v5",
    "versionName": "Clutch",
    "added": "2026-11-21",
    "updated": "2026-11-21",
    "status": "prototype",
    "versions": [
      {
        "v": "v1",
        "name": "First climb",
        "file": "versions/v1.html"
      },
      {
        "v": "v2",
        "name": "2D pad + scroll",
        "file": "versions/v2.html"
      },
      {
        "v": "v3",
        "name": "Curved pad + settings",
        "file": "versions/v3.html"
      },
      {
        "v": "v4",
        "name": "Thumb deck",
        "file": "versions/v4.html"
      },
      {
        "v": "v5",
        "name": "Clutch slow-mo",
        "file": "versions/v5.html"
      }
    ]
    },
  {
    "id": "summit",
    "title": "Summit",
    "tagline": "Punch the boulder up an endless mountain",
    "description": "Sisyphus is bored. The marble statue trudges up an endless mountain road punching a giant boulder ahead of him, blocking it when it rolls back, and leaping crevasses. Cross old marble bridges, launch off rock shelves, pass through ancient gateways and climb through the clouds toward the summit.",
    "controls": "Hold anywhere to wind up, slide to steer, let go to punch",
    "color": "#ff5226",
    "icon": "peak",
    "version": "v8",
    "versionName": "The Path",
    "added": "2026-11-22",
    "updated": "2026-11-23",
    "status": "prototype",
    "versions": [
      {
        "v": "v1",
        "name": "Sisyphus",
        "file": "versions/v1.html"
      },
      {
        "v": "v2",
        "name": "The Valley",
        "file": "versions/v2.html"
      },
      {
        "v": "v3",
        "name": "The Climb",
        "file": "versions/v3.html"
      },
      {
        "v": "v4",
        "name": "Sisyphus",
        "file": "versions/v4.html"
      },
      {
        "v": "v5",
        "name": "The God",
        "file": "versions/v5.html"
      },
      {
        "v": "v6",
        "name": "The Statue",
        "file": "versions/v6.html"
      },
      {
        "v": "v7",
        "name": "The Old Road",
        "file": "versions/v7.html"
      },
      {
        "v": "v8",
        "name": "The Path",
        "file": "versions/v8.html"
      }
    ]
  }
];
