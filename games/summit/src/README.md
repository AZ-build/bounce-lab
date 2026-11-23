# Summit source

`index.html` one folder up is generated from these files. Don't edit it by hand.

- `main.js`: the whole game (three.js scene, physics, obstacles, sound, HUD wiring). Tuning knobs are in `CFG` and `STAGES` at the top.
- `template.html`: the page (styles, HUD, title and game-over screens). The build drops the bundled script into it.
- `build.mjs`: bundles three.js + main.js into one inline script.

To rebuild (needs Node):
```
npm install
npm run build
```
That writes `../index.html` (with the Bounce Lab hooks) and `../versions/v1.html` (plain archive). For a new version, change the `data-version` in build.mjs and the output file name in package.json first.
