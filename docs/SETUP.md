# Bounce Lab: going live

- **Site:** https://az-build.github.io/bounce-lab/
- **Repo:** https://github.com/AZ-build/bounce-lab
- **Firebase project:** `bounce-lab-ebfbd` (Bounce Lab only, so nothing else to worry about)

Until Firebase is connected, the site runs in **demo mode**: scores and feedback are saved only on the device being used.

---

## Firebase: 4 steps (about 10 minutes)

Open **console.firebase.google.com** and click the **bounce lab** project.

### Step 1: Create the database
1. In the left menu, open **Build → Firestore Database** (if you don't see "Build", click **All products**).
2. Click **Create database**.
3. If it asks for an edition, keep **Standard**.
4. **Location:** pick `nam5 (United States)`. This can't be changed later, and any US option is fine.
5. **Security:** choose **Start in production mode**.
6. Click **Create** and wait for the empty database page.

### Step 2: Paste the security rules
These decide who can read and write what. Anyone can post scores and feedback; only you can read feedback.
1. On the Firestore page, click the **Rules** tab.
2. Open this link in a new tab, press **Ctrl+A** then **Ctrl+C** to copy everything:
   https://raw.githubusercontent.com/AZ-build/bounce-lab/main/firebase/firestore.rules
3. Back in the Rules tab, click in the editor, press **Ctrl+A** then **Ctrl+V** to replace what's there.
4. Find `you@example.com` (line 15) and replace it with **your Google email, in lowercase**. Keep the quote marks.
5. Click **Publish**.

### Step 3: Turn on Google sign-in (for the admin page)
1. Left menu: **Build → Authentication → Get started**.
2. Under **Sign-in providers**, click **Google**, switch it to **Enable**, pick your email as the support email, and click **Save**.
3. Click the **Settings** tab (top of the Authentication page), then **Authorized domains → Add domain**.
4. Type `az-build.github.io` and click **Add**.

### Step 4: Register the web app and send Claude the config
1. Click the **gear icon** (top left, next to "Project Overview") → **Project settings**.
2. Scroll to **Your apps** and click the **`</>`** (Web) button.
3. App nickname: `Bounce Lab`. Leave "Firebase Hosting" **unchecked**. Click **Register app**.
4. You'll see a block of code starting with `const firebaseConfig = {`. Copy that whole block and paste it to Claude, along with the Google email you used in step 2.

Claude puts it in `lab/config.js` and pushes the update. Then demo mode turns off and scores are shared by everyone.

> The values in that block (including `apiKey`) are meant to be public. They only identify the project; the rules from step 2 protect the data.

---

## GoatCounter (visit counts)
**Connected:** https://bounce-lab.goatcounter.com

1. Log in at goatcounter.com, or sign up there for free.
2. Your site code is the first part of your dashboard address. For `https://bouncelab.goatcounter.com`, the code is `bouncelab`. A new site just for Bounce Lab keeps its numbers separate from your other projects.
3. Send Claude the code, or put it in `lab/config.js` → `goatcounter: "bouncelab"`.

It records page views for the lobby and each game, plus events such as `ascent/start`, `ascent/gameover`, `bouncer/rate-5`, `rebound/share-score`, `ascent/challenge-won` and `lobby/play-ascent`.

---

## The admin page
https://az-build.github.io/bounce-lab/admin/ is not linked anywhere, so bookmark it. Sign in with the Google account whose email you put in the rules (step 2). The rules decide who's admin; nothing else to set.

**Status (Nov 22):** all four Firebase steps done and tested live. Scores, plays, ratings and feedback save, and the rules block faked numbers.

## Sharing
- **Each game has its own link:** `https://az-build.github.io/bounce-lab/games/ascent/` (or `bouncer`, `rebound`). Pasted into iMessage, Slack, Discord, X and similar apps, it shows a preview card with the game's art.
- **Lobby card link:** `https://az-build.github.io/bounce-lab/#ascent` opens the lobby with that game's card showing.
- **Challenge link:** after a run, the share button sends `.../games/ascent/?vs=1234&by=Adrian`. Whoever opens it sees "Adrian scored 1,234. Beat it!" and is told whether they beat it.

## Troubleshooting
| What you see | Fix |
|---|---|
| Still says DEMO MODE | `apiKey` or `appId` in `lab/config.js` is empty (step 4 not done yet) |
| "Leaderboard is offline" | Step 1 or step 2 isn't finished (database not created, or rules not published) |
| Admin says this account "isn't the admin email" | Sign in with the Google account whose email is in the Firestore rules (line 15), or change the rules |
| Google sign-in popup errors | `az-build.github.io` isn't in Authorized domains (step 3) |
| Admin shows "Missing or insufficient permissions" | Your email isn't in the rules (step 2.4), or the rules weren't published |
| Link preview shows an old picture | Apps cache previews for a while. New links refresh on their own |
