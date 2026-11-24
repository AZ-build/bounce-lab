/* Bounce Lab — data layer.
   One API, two back ends:
   - Firebase Firestore (when lab/config.js has a projectId)
   - Local demo mode (localStorage on this device) otherwise
   Data shape in Firestore:
     bouncelab_games/{gameId}                 summary: plays, ratingSum, ratingCount, r1..r5
     bouncelab_games/{gameId}/scores/{id}     name, score, v, stats, device, ts
     bouncelab_games/{gameId}/feedback/{id}   stars, text, name, v, score, device, ua, ts
     bouncelab_games/{gameId}/sessions/{id}   score, dur, v, device, ts
*/
/* ---------- Bounce Lab sound kit (shared by the lobby and every game) ----------
   iPhone fixes: (1) Safari silences web audio when the phone's ring/silent switch is on silent, unless the page asks
   for "playback" audio; (2) sound may only start inside a finished tap (touchend / click), not on touch-down, so
   contexts created on touch-down get stuck "suspended" (or "interrupted" after a call / app switch). This wakes them
   on every tap, except when a game paused its own sound on purpose.
   One sound preference for the whole site: BounceLabSound.muted / BounceLabSound.setMuted(bool) (localStorage bouncelab-muted). */
(function () {
  if (window.BounceLabSound) return;
  const KEY = 'bouncelab-muted';
  const read = () => { try { const v = localStorage.getItem(KEY); if (v != null) return v === 'true'; for (const k of ['bouncelab-lobby-muted', 'smashball-muted', 'summit-muted']) { const o = localStorage.getItem(k); if (o === 'true') return true; } return localStorage.getItem('bouncer-ascent-muted') === '1'; } catch (e) { return false; } };
  const session = m => { try { if (navigator.audioSession) navigator.audioSession.type = m ? 'ambient' : 'playback'; } catch (e) {} };
  let muted = read(); session(muted);
  window.BounceLabSound = {
    get muted() { return muted; },
    setMuted(m) { muted = !!m; try { localStorage.setItem(KEY, String(muted)); } catch (e) {} session(muted); if (!muted) wake(); }
  };
  const Native = window.AudioContext || window.webkitAudioContext; if (!Native) return;
  const live = new Set();
  function LabAudioContext(opts) {
    const c = opts ? new Native(opts) : new Native(); live.add(c);
    const sus = c.suspend.bind(c), res = c.resume.bind(c);
    c.suspend = function () { c.__held = true; return sus(); };     // the game paused its sound on purpose
    c.resume = function () { c.__held = false; return res(); };
    return c;
  }
  LabAudioContext.prototype = Native.prototype;
  try { window.AudioContext = LabAudioContext; if (window.webkitAudioContext) window.webkitAudioContext = LabAudioContext; } catch (e) {}
  function wake() {
    for (const c of live) {
      if (c.state === 'running' || c.state === 'closed' || c.__held) continue;
      c.resume().catch(() => {});
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}   // a silent blip finishes the unlock on older iPhones
    }
  }
  for (const ev of ['touchend', 'pointerup', 'click', 'keydown']) window.addEventListener(ev, wake, { capture: true, passive: true });
})();
(function () {
  'use strict';
  const CFG = window.BOUNCE_LAB_CONFIG || {};
  const FB_VER = '10.12.2';
  const ROOT = 'bouncelab_games';
  const hasFirebase = !!(CFG.firebase && CFG.firebase.projectId && CFG.firebase.apiKey);

  // ---------- small helpers ----------
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function deviceId() {
    let id = ls.get('bouncelab-device', null);
    if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); ls.set('bouncelab-device', id); }
    return id;
  }
  const cleanName = n => String(n || '').replace(/[<>]/g, '').trim().slice(0, 16);
  const cleanText = t => String(t || '').replace(/\u0000/g, '').trim().slice(0, 1000);
  const toMs = ts => ts && ts.toMillis ? ts.toMillis() : (typeof ts === 'number' ? ts : Date.now());
  // ---------- LOCAL (demo) back end ----------
  const LK = (g, kind) => 'bouncelab-demo:' + g + ':' + kind;
  const Local = {
    mode: 'demo',
    async topScores(g, n = 10) {
      // top N scores (the same player can appear more than once)
      return ls.get(LK(g, 'scores'), []).sort((a, b) => b.score - a.score).slice(0, n);
    },
    async postScore(g, e) {
      const rows = ls.get(LK(g, 'scores'), []);
      const row = { id: 's' + Date.now(), name: cleanName(e.name), score: Math.floor(e.score), v: e.v || '', stats: e.stats || {}, device: deviceId(), ts: Date.now() };
      rows.push(row); rows.sort((a, b) => b.score - a.score); ls.set(LK(g, 'scores'), rows.slice(0, 500));
      return { rank: rows.filter(r => r.score > row.score).length + 1, total: rows.length };
    },
    async recordPlay(g, s) {
      const rows = ls.get(LK(g, 'sessions'), []);
      rows.push({ id: 'p' + Date.now(), score: Math.floor(s.score || 0), dur: Math.round(s.dur || 0), v: s.v || '', device: deviceId(), ts: Date.now() });
      ls.set(LK(g, 'sessions'), rows.slice(-1000));
      const sum = ls.get(LK(g, 'summary'), {}); sum.plays = (sum.plays || 0) + 1; ls.set(LK(g, 'summary'), sum);
    },
    async rate(g, stars, prev) {
      const sum = ls.get(LK(g, 'summary'), {});
      if (prev) { sum.ratingSum = (sum.ratingSum || 0) - prev; sum['r' + prev] = Math.max(0, (sum['r' + prev] || 0) - 1); sum.ratingCount = Math.max(0, (sum.ratingCount || 0) - 1); }
      sum.ratingSum = (sum.ratingSum || 0) + stars; sum.ratingCount = (sum.ratingCount || 0) + 1; sum['r' + stars] = (sum['r' + stars] || 0) + 1;
      ls.set(LK(g, 'summary'), sum);
    },
    async sendFeedback(g, f) {
      const rows = ls.get(LK(g, 'feedback'), []);
      rows.push({ id: 'f' + Date.now(), stars: f.stars || null, text: cleanText(f.text), name: cleanName(f.name), v: f.v || '', score: f.score == null ? null : Math.floor(f.score), device: deviceId(), ua: navigator.userAgent.slice(0, 160), ts: Date.now() });
      ls.set(LK(g, 'feedback'), rows.slice(-500));
    },
    async summary(g) { return Object.assign({ plays: 0, ratingSum: 0, ratingCount: 0 }, ls.get(LK(g, 'summary'), {})); },
    // admin
    async listFeedback(g) { return ls.get(LK(g, 'feedback'), []).slice().reverse(); },
    async listSessions(g) { return ls.get(LK(g, 'sessions'), []).slice().reverse(); },
    async allScores(g, n = 100) { return ls.get(LK(g, 'scores'), []).sort((a, b) => b.score - a.score).slice(0, n); },
    async deleteItem(g, kind, id) { ls.set(LK(g, kind), ls.get(LK(g, kind), []).filter(r => r.id !== id)); },
    async signIn() { return { email: 'demo mode' }; },
    async signOut() {},
    onAuth(cb) { cb({ email: 'demo mode' }); }
  };

  // ---------- FIREBASE back end ----------
  let fbReady = null;
  function loadFirebase() {
    if (fbReady) return fbReady;
    const base = 'https://www.gstatic.com/firebasejs/' + FB_VER + '/';
    fbReady = Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-firestore.js')
    ]).then(([app, fs]) => {
      const a = app.getApps().length ? app.getApp() : app.initializeApp(CFG.firebase);
      return { app: a, fs, db: fs.getFirestore(a), base };
    });
    return fbReady;
  }
  const Firebase = {
    mode: 'online',
    async topScores(g, n = 10) {
      const { fs, db } = await loadFirebase();
      // top N scores (the same player can appear more than once)
      const q = fs.query(fs.collection(db, ROOT, g, 'scores'), fs.orderBy('score', 'desc'), fs.limit(n));
      const snap = await fs.getDocs(q);
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data(), { ts: toMs(d.data().ts) }));
    },
    async postScore(g, e) {
      const { fs, db } = await loadFirebase();
      const col = fs.collection(db, ROOT, g, 'scores');
      const score = Math.floor(e.score);
      await fs.addDoc(col, { name: cleanName(e.name), score, v: String(e.v || '').slice(0, 20), stats: e.stats || {}, device: deviceId(), ts: fs.serverTimestamp() });
      let rank = null, total = null;
      try {
        rank = (await fs.getCountFromServer(fs.query(col, fs.where('score', '>', score)))).data().count + 1;
        total = (await fs.getCountFromServer(col)).data().count;
      } catch (err) {}
      return { rank, total };
    },
    async recordPlay(g, s) {
      const { fs, db } = await loadFirebase();
      await fs.addDoc(fs.collection(db, ROOT, g, 'sessions'), { score: Math.max(0, Math.floor(s.score || 0)), dur: Math.max(0, Math.round(s.dur || 0)), v: String(s.v || '').slice(0, 20), device: deviceId(), ts: fs.serverTimestamp() });
      await fs.setDoc(fs.doc(db, ROOT, g), { plays: fs.increment(1) }, { merge: true });
    },
    async rate(g, stars, prev) {
      const { fs, db } = await loadFirebase();
      const upd = { ratingSum: fs.increment(stars - (prev || 0)) };
      upd['r' + stars] = fs.increment(1);
      if (prev) upd['r' + prev] = fs.increment(-1); else upd.ratingCount = fs.increment(1);
      if (prev === stars) return;
      await fs.setDoc(fs.doc(db, ROOT, g), upd, { merge: true });
    },
    async sendFeedback(g, f) {
      const { fs, db } = await loadFirebase();
      await fs.addDoc(fs.collection(db, ROOT, g, 'feedback'), {
        stars: f.stars || null, text: cleanText(f.text), name: cleanName(f.name), v: String(f.v || '').slice(0, 20),
        score: f.score == null ? null : Math.floor(f.score), device: deviceId(), ua: navigator.userAgent.slice(0, 160), ts: fs.serverTimestamp()
      });
    },
    async summary(g) {
      const { fs, db } = await loadFirebase();
      const s = await fs.getDoc(fs.doc(db, ROOT, g));
      return Object.assign({ plays: 0, ratingSum: 0, ratingCount: 0 }, s.exists() ? s.data() : {});
    },
    async _list(g, kind, n) {
      const { fs, db } = await loadFirebase();
      const snap = await fs.getDocs(fs.query(fs.collection(db, ROOT, g, kind), fs.orderBy('ts', 'desc'), fs.limit(n)));
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data(), { ts: toMs(d.data().ts) }));
    },
    listFeedback(g) { return this._list(g, 'feedback', 300); },
    listSessions(g) { return this._list(g, 'sessions', 1000); },
    async allScores(g, n = 100) {
      const { fs, db } = await loadFirebase();
      const snap = await fs.getDocs(fs.query(fs.collection(db, ROOT, g, 'scores'), fs.orderBy('score', 'desc'), fs.limit(n)));
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data(), { ts: toMs(d.data().ts) }));
    },
    async deleteItem(g, kind, id) { const { fs, db } = await loadFirebase(); await fs.deleteDoc(fs.doc(db, ROOT, g, kind, id)); },
    async _auth() {
      const { app, base } = await loadFirebase();
      const au = await import(base + 'firebase-auth.js');
      return { au, auth: au.getAuth(app) };
    },
    async signIn() { const { au, auth } = await this._auth(); const r = await au.signInWithPopup(auth, new au.GoogleAuthProvider()); return r.user; },
    async signOut() { const { au, auth } = await this._auth(); await au.signOut(auth); },
    onAuth(cb) { this._auth().then(({ au, auth }) => au.onAuthStateChanged(auth, cb)).catch(() => cb(null)); }
  };

  // If Firebase fails to load (offline, blocked), fall back to local so games never break.
  function guarded(api) {
    const out = { mode: api.mode };
    for (const k of Object.keys(api)) {
      if (typeof api[k] !== 'function') continue;
      out[k] = function () {
        try { const r = api[k].apply(api, arguments); return r && r.catch ? r.catch(err => { console.warn('[BounceLab] ' + k + ' failed', err); throw err; }) : r; }
        catch (err) { return Promise.reject(err); }
      };
    }
    return out;
  }

  // ---------- GoatCounter analytics ----------
  // Page views are counted automatically; events are counted as paths like "bouncer/gameover".
  const gcCode = String(CFG.goatcounter || '').trim();
  if (gcCode && !document.querySelector('script[data-goatcounter]')) {
    const s = document.createElement('script');
    s.async = true; s.src = 'https://gc.zgo.at/count.js';
    s.setAttribute('data-goatcounter', 'https://' + gcCode + '.goatcounter.com/count');
    document.head.appendChild(s);
  }
  const pending = [];
  function track(path, title) {
    if (!gcCode) return;
    const send = () => window.goatcounter.count({ path: String(path), title: title || String(path), event: true });
    if (window.goatcounter && window.goatcounter.count) send();
    else if (pending.length < 30) { pending.push(send); }
  }
  const flush = setInterval(() => {
    if (window.goatcounter && window.goatcounter.count) { while (pending.length) { try { pending.shift()(); } catch (e) {} } clearInterval(flush); }
  }, 1000);
  setTimeout(() => clearInterval(flush), 20000);

  // ---------- sharing ----------
  // Links always point at the live site (config.siteUrl) so a link shared from anywhere works.
  function siteUrl(path) {
    let base = String(CFG.siteUrl || '').trim();
    if (!/^https?:/.test(base)) base = new URL('./', (document.currentScript && document.currentScript.src) || location.href).href.replace(/lab\/$/, '');
    if (!base.endsWith('/')) base += '/';
    return base + String(path || '').replace(/^\//, '');
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-100px;opacity:0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  // Returns 'shared' | 'copied' | 'cancelled' | 'failed'
  async function share(data) {
    if (navigator.share && matchMedia('(pointer:coarse)').matches) {
      try { await navigator.share(data); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    return (await copyText((data.text ? data.text + ' ' : '') + data.url)) ? 'copied' : 'failed';
  }

  window.BounceLabStore = Object.assign(guarded(hasFirebase ? Firebase : Local), {
    track, share, siteUrl, copyText,
    online: hasFirebase,
    config: CFG,
    deviceId,
    ls,
    adminEmails: (CFG.adminEmails || []).map(e => String(e).toLowerCase())
  });
})();
