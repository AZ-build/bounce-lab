# Rebound source

`index.html` one folder up is generated from these files. Don't edit it by hand.

- `main.js`: the whole game (three.js arena, physics, bot, camera, sound, HUD wiring). Tuning knobs are in `CFG` at the top.
- `template.html`: the page (styles, scoreboard, title and results screens). The build drops the bundled script into it.
- `build.mjs`: bundles three.js + main.js into one inline script.

To rebuild (needs Node):
```
npm install
npm run build
```
That writes `../index.html` (with the Bounce Lab hooks) and `../versions/v4.html` (plain archive). For a new version, change `data-version` in build.mjs and the versions/vN.html file name in package.json first.
