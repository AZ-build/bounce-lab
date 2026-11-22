# Adding a game to Bounce Lab

**Easiest:** tell Claude "Add <game> to Bounce Lab" and attach the game's HTML file. Claude does all of this.

**By hand:**

## 1. Make the folder
Copy `games/_template` and rename the copy to your game's id. Use lowercase with no spaces, for example `games/orbit`.

Put the game's HTML in it as `index.html`. Make a `versions` folder inside it and keep a copy of each version (`v1.html`, `v2.html`, ...).

## 2. Connect it to the lab (one line)
In the game's `index.html`, just above `</head>`, add:
```html
<script src="../../lab/lab.js" data-game="orbit" data-version="v1"></script>
```
`data-game` must match the folder name.

That line alone gives the game the **LAB** back button, ratings and feedback.

## 3. Turn on the leaderboard (two hooks)
In the game's code, find where a run **starts** and add:
```js
window.BounceLab && BounceLab.start();
```
Find where the game **ends** (game over) and add:
```js
window.BounceLab && BounceLab.gameOver(score);
```
Optional: pass extra stats, which are saved with the score:
`BounceLab.gameOver(score, { level: 4, coins: 31 })`.

If the game has a "quit to menu" button, add `BounceLab.menu()` there so the LAB button comes back.

`games/_template/index.html` is a tiny working example of all three.

## 4. Add it to the lobby
Open `games.js` and copy one of the entries. Change `id`, `title`, `tagline`, `description`, `controls`, `color` and `version`. The new ball appears in the lobby automatically.

`icon` can be `"side"`, `"goal"` or `"up"`. Leave it `""` to show the game's first letter.

## 5. Preview image for sharing
Ask Claude to run `tools/make_share_images.py`. It makes `games/<id>/share.jpg` and adds the preview tags, so the game's link shows a picture in chat apps.

## 6. Shipping a new version of an existing game
1. Save the new version as `games/<id>/versions/vN.html`.
2. Make `games/<id>/index.html` the new version, with the lab line and hooks, and `data-version="vN"`.
3. In `games.js`, update `version`, `versionName` and `updated`, and add `vN` to `versions`.

Each version's runs, scores and feedback are tagged with its version number, so the admin page shows whether v6 is liked more than v5.
