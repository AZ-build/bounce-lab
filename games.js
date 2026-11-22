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
    "id": "rebound",
    "title": "Rebound",
    "tagline": "3D arena striker",
    "description": "Rocket-League-style: drive a striker around a glass arena, flick the ball into the far goal and jump for aerial hits.",
    "controls": "Drag to move, flick to smash, tap to jump",
    "color": "#ff9a3c",
    "icon": "goal",
    "version": "v3",
    "versionName": "Striker",
    "added": "2026-11-19",
    "updated": "2026-11-20",
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
  }
];
