/* Bounce Lab — in-game kit.
   Add ONE line to any game's <head>:
     <script src="../../lab/lab.js" data-game="mygame" data-version="v1"></script>
   Then call these from the game code (both optional, but needed for leaderboards):
     BounceLab.start()                     // when a run begins
     BounceLab.gameOver(score, {stats})    // when a run ends
   Everything else (back button, leaderboard, rating, feedback, analytics) is automatic.
*/
(function () {
  'use strict';
  if (window.BounceLab && window.BounceLab._ready !== undefined) return;
  const me = document.currentScript;
  const LAB_URL = new URL('./', me.src);                 // .../lab/
  const VQ = (new URL(me.src).search.match(/v=([^&]+)/) || [])[1] ? '?v=' + new URL(me.src).search.match(/v=([^&]+)/)[1] : '';  // cache-buster passed on from the game page
  const ROOT_URL = new URL('../', LAB_URL);              // site root (lobby)
  const GAME = (me.dataset.game || location.pathname.split('/').filter(Boolean).slice(-2, -1)[0] || 'game').toLowerCase();
  const VERSION = me.dataset.version || '';
  const NO_BOARD = me.dataset.leaderboard === 'off';
  // challenge links look like games/ascent/?vs=1234&by=Adrian
  const CHALLENGE = (() => { try { const q = new URLSearchParams(location.search), vs = parseInt(q.get('vs'), 10); if (!(vs > 0)) return null; return { vs, by: (q.get('by') || 'A friend').replace(/[<>]/g, '').slice(0, 16) }; } catch (e) { return null; } })();

  // queue calls made before the store finishes loading
  const queue = [];
  let S = null, ui = null;
  const state = { playing: false, startT: 0, score: null, stats: null, posted: false, runId: 0 };
  const API = {
    _ready: false,
    game: GAME, version: VERSION,
    start() { if (!API._ready) return queue.push(['start', arguments]); onStart(); },
    gameOver(score, stats) { if (!API._ready) return queue.push(['gameOver', arguments]); onOver(score, stats); },
    menu() { if (!API._ready) return queue.push(['menu', arguments]); state.playing = false; state.runId++; ui.root.classList.remove('bl-playing', 'bl-over'); },
    exit() { location.href = new URL('index.html', ROOT_URL).href; },
    openFeedback() { if (ui) openSheet('fb'); }
  };
  window.BounceLab = API;

  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('lab.css', LAB_URL).href + VQ; document.head.appendChild(css);

  (window.BOUNCE_LAB_CONFIG ? Promise.resolve() : load(new URL('config.js', LAB_URL).href + VQ))
    .catch(() => {})
    .then(() => window.BounceLabStore ? null : load(new URL('store.js', LAB_URL).href + VQ))
    .then(() => window.BOUNCE_LAB_GAMES ? null : load(new URL('../games.js', LAB_URL).href + VQ).catch(() => {}))
    .then(() => {
      S = window.BounceLabStore;
      const go = () => { buildUI(); API._ready = true; while (queue.length) { const [fn, args] = queue.shift(); API[fn].apply(API, args); } };
      if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
      S.track(GAME + '/open' + (VERSION ? '-' + VERSION : ''), 'Opened ' + GAME + ' ' + VERSION);
      if (CHALLENGE) { S.track(GAME + '/challenge-open', 'Opened a challenge link'); setTimeout(() => toast('\u2694\uFE0F ' + CHALLENGE.by + ' scored ' + fmt(CHALLENGE.vs) + '. Beat it!', 5500), 900); }
    })
    .catch(err => console.warn('[BounceLab] could not start', err));

  // ---------- helpers ----------
  const $ = sel => ui.root.querySelector(sel);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString();
  const key = k => 'bouncelab-' + k + ':' + GAME + (VERSION ? ':' + VERSION : '');
  let toastT = 0;
  function toast(msg, ms) { const t = $('#bl-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2400); }
  function info() { return (window.BOUNCE_LAB_GAMES || []).find(g => g.id === GAME) || { title: GAME.charAt(0).toUpperCase() + GAME.slice(1) }; }
  function gameUrl() { return S.siteUrl('games/' + GAME + '/'); }
  async function doShare(data, label) {
    const r = await S.share(data);
    if (r === 'copied') toast('Link copied · paste it anywhere');
    else if (r === 'failed') toast(data.url, 6000);
    if (r !== 'cancelled') S.track(GAME + '/' + label, 'Shared ' + label);
  }
  function shareGame() { const g = info(); doShare({ title: g.title + ' · Bounce Lab', text: 'Play ' + g.title + (g.tagline ? ' (' + g.tagline.toLowerCase() + ')' : '') + ' on Bounce Lab:', url: gameUrl() }, 'share'); }
  function shareScore() {
    const g = info();
    if (state.score == null || state.score <= 0) return shareGame();
    const name = S.ls.get('bouncelab-name', '');
    const url = gameUrl() + '?vs=' + state.score + (name ? '&by=' + encodeURIComponent(name.slice(0, 16)) : '');
    doShare({ title: g.title + ' challenge', text: 'I scored ' + fmt(state.score) + ' in ' + g.title + '. Think you can beat it?', url }, 'share-score');
  }

  // ---------- UI ----------
  const TAGS = ['Too hard', 'Too easy', 'Controls feel off', 'Love the feel', 'Looks amazing', 'Confusing', 'Want more', 'Found a bug'];
  function buildUI() {
    const root = document.createElement('div');
    root.id = 'bl-root';
    root.innerHTML = `
      <div id="bl-top"><a id="bl-chip" href="${new URL('index.html', ROOT_URL).href}" aria-label="Back to Bounce Lab"><span class="bl-dot"></span>Lab</a><button id="bl-sharechip" aria-label="Share this game"><svg viewBox="0 0 24 24" class="bl-i"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/></svg></button></div>
      <div id="bl-bar" role="toolbar" aria-label="Bounce Lab">
        <button class="bl-home" aria-label="Back to the lab">&#9664;</button>
        ${NO_BOARD ? '<button class="bl-board bl-fbbtn"><span>Leave feedback</span></button>' : '<button class="bl-board"><span>Scores</span></button>'}
        <button class="bl-sharebtn" aria-label="Share your score"><svg viewBox="0 0 24 24" class="bl-i"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/></svg></button>
        <button class="bl-stars" aria-label="Rate this game"><div class="bl-starrow">${[1,2,3,4,5].map(i => `<span class="bl-star" data-s="${i}">&#9733;</span>`).join('')}</div></button>
      </div>
      <div id="bl-scrim"></div>
      <div id="bl-sheet" role="dialog" aria-label="Leaderboard and feedback">
        <div class="bl-head">
          <div class="bl-tabs">
            ${NO_BOARD ? '' : '<button class="bl-tab" data-tab="lb">Leaderboard</button>'}
            <button class="bl-tab" data-tab="fb">Rate &amp; feedback</button>
          </div>
          <button class="bl-x" aria-label="Close">&times;</button>
        </div>
        <div class="bl-body">
          <div class="bl-pane" data-pane="lb">
            <div class="bl-yours"><div class="bl-lbl">Your score</div><div class="bl-num">&ndash;</div><div class="bl-rank"></div></div>
            <div class="bl-post"><input id="bl-name" maxlength="16" placeholder="Your name" autocomplete="nickname" enterkeyhint="send"><button class="bl-btn" id="bl-postbtn">Post score</button></div>
            <ol class="bl-list" id="bl-list"></ol>
            <div class="bl-muted" id="bl-lbmsg"></div>
          </div>
          <div class="bl-pane" data-pane="fb">
            <div class="bl-form">
              <div class="bl-q">How was that?</div>
              <div class="bl-starrow">${[1,2,3,4,5].map(i => `<button class="bl-star" data-s="${i}" aria-label="${i} stars">&#9733;</button>`).join('')}</div>
              <div class="bl-tags">${TAGS.map(t => `<button class="bl-tagb">${t}</button>`).join('')}</div>
              <textarea id="bl-text" maxlength="1000" placeholder="What felt good? What didn't? Any ideas?"></textarea>
              <div class="bl-row"><button class="bl-btn" id="bl-send">Send</button></div>
            </div>
            <div class="bl-thanks"><b>Thanks!</b>Your feedback goes straight to the lab notebook.<div style="margin-top:14px"><button class="bl-btn bl-ghost" id="bl-more">Send more</button></div></div>
          </div>
          <div class="bl-mode">${S.online ? '' : 'Demo mode &middot; saved on this device only'}${VERSION ? (S.online ? '' : ' &middot; ') + GAME + ' ' + esc(VERSION) : ''}</div>
        </div>
      </div>
      <div id="bl-toast"></div>`;
    document.body.appendChild(root);
    if (!document.querySelector('link[data-bl-font]')) { const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.blFont = '1'; f.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap'; document.head.appendChild(f); }
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(new URL('sw.js', ROOT_URL).href).catch(() => {});
    ui = { root };

    // Keep taps and key presses inside the lab UI from reaching the game.
    ['pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove', 'click', 'keydown', 'keyup', 'wheel'].forEach(ev =>
      root.addEventListener(ev, e => { if (e.target.closest('#bl-top,#bl-bar,#bl-sheet,#bl-scrim')) e.stopPropagation(); }, { passive: true }));

    $('#bl-chip').addEventListener('click', () => S.track(GAME + '/back-to-lab', 'Back to lab'));
    $('#bl-sharechip').addEventListener('click', shareGame);
    $('.bl-sharebtn').addEventListener('click', shareScore);
    $('.bl-home').addEventListener('click', () => { S.track(GAME + '/back-to-lab', 'Back to lab'); API.exit(); });
    $('.bl-board').addEventListener('click', () => openSheet(NO_BOARD ? 'fb' : 'lb'));
    $('#bl-scrim').addEventListener('click', closeSheet);
    $('.bl-x').addEventListener('click', closeSheet);
    root.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    root.querySelectorAll('.bl-tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

    // stars (bar = quick rate, sheet = rate + comment)
    $('#bl-bar .bl-stars').addEventListener('click', e => {
      const st = e.target.closest('.bl-star');
      if (!st) { openSheet('fb'); return; }
      rate(+st.dataset.s, true);
    });
    root.querySelectorAll('.bl-pane .bl-star').forEach(b => b.addEventListener('click', () => rate(+b.dataset.s, false)));
    root.querySelectorAll('.bl-tagb').forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
    $('#bl-send').addEventListener('click', sendFeedback);
    $('#bl-more').addEventListener('click', () => { $('.bl-form').style.display = ''; $('.bl-thanks').style.display = 'none'; });

    const nm = $('#bl-name');
    nm.value = S.ls.get('bouncelab-name', '');
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') postScore(); });
    $('#bl-postbtn').addEventListener('click', postScore);
    paintStars(S.ls.get(key('rating'), 0));
  }

  function paintStars(n) { ui.root.querySelectorAll('.bl-star').forEach(s => s.classList.toggle('on', +s.dataset.s <= n)); }
  function showTab(t) {
    ui.root.querySelectorAll('.bl-tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    ui.root.querySelectorAll('.bl-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t));
    if (t === 'lb') refreshBoard();
  }
  function openSheet(tab) { ui.root.classList.add('bl-open'); showTab(tab || 'lb'); S.track(GAME + '/open-' + (tab || 'lb'), 'Opened ' + tab); }
  function closeSheet() { ui.root.classList.remove('bl-open'); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  // ---------- run lifecycle ----------
  function onStart() {
    state.playing = true; state.startT = performance.now(); state.score = null; state.posted = false; state.runId++;
    ui.root.classList.add('bl-playing'); ui.root.classList.remove('bl-over'); closeSheet();
    S.track(GAME + '/start', 'Run started');
  }
  function onOver(score, stats) {
    score = Math.max(0, Math.floor(Number(score) || 0));
    const dur = state.startT ? (performance.now() - state.startT) / 1000 : 0;
    state.playing = false; state.score = score; state.stats = stats || null; state.posted = false;
    const run = state.runId;
    S.recordPlay(GAME, { score, dur, v: VERSION }).catch(() => {});
    S.track(GAME + '/gameover', 'Run ended');
    $('.bl-num').textContent = fmt(score);
    $('.bl-rank').textContent = '';
    if (!NO_BOARD) $('.bl-board span').innerHTML = '&#127942; Post';
    setTimeout(() => { if (state.runId === run && !state.playing) { ui.root.classList.remove('bl-playing'); ui.root.classList.add('bl-over'); } }, 1300);
    // Auto-post when the player already has a name and this beats their best on this device.
    const name = S.ls.get('bouncelab-name', '');
    const pb = S.ls.get(key('pb'), 0);
    if (!NO_BOARD && name && score > 0 && score > pb) postScore();
    if (CHALLENGE && score > 0) setTimeout(() => {
      if (state.runId !== run) return;
      if (score > CHALLENGE.vs) { toast('\uD83C\uDF89 You beat ' + CHALLENGE.by + "'s " + fmt(CHALLENGE.vs) + '! Share it back', 5000); S.track(GAME + '/challenge-won', 'Beat a challenge'); }
      else toast(CHALLENGE.by + "'s " + fmt(CHALLENGE.vs) + ' still stands. ' + fmt(CHALLENGE.vs - score + 1) + ' more to go', 4000);
    }, 1600);
  }

  async function postScore() {
    if (state.score == null || state.posted) return;
    const name = $('#bl-name').value.replace(/[<>]/g, '').trim().slice(0, 16);
    if (!name) { openSheet('lb'); $('#bl-name').focus(); toast('Add a name to post'); return; }
    if (state.score <= 0) { toast('Score some points first'); return; }
    S.ls.set('bouncelab-name', name);
    state.posted = true;
    const btn = $('#bl-postbtn'); btn.disabled = true; btn.textContent = '...';
    try {
      const r = await S.postScore(GAME, { name, score: state.score, v: VERSION, stats: state.stats || {} });
      S.ls.set(key('pb'), Math.max(S.ls.get(key('pb'), 0), state.score));
      const rk = r && r.rank ? `#${r.rank}${r.total ? ' of ' + fmt(r.total) : ''}` : 'Posted';
      $('.bl-rank').textContent = r && r.rank ? 'Rank ' + rk : 'Posted!';
      $('.bl-board span').innerHTML = r && r.rank ? `&#127942; <b>#${r.rank}</b>` : '&#127942; Posted';
      btn.textContent = 'Posted';
      toast(r && r.rank ? 'Score posted · ' + rk : 'Score posted');
      S.track(GAME + '/post-score', 'Posted score');
      if (ui.root.classList.contains('bl-open')) refreshBoard();
    } catch (e) {
      state.posted = false; btn.disabled = false; btn.textContent = 'Try again';
      toast('Could not post. Check your connection.');
    }
  }

  async function refreshBoard() {
    const list = $('#bl-list'), msg = $('#bl-lbmsg');
    if (state.score == null) { $('.bl-num').innerHTML = '&ndash;'; }
    $('.bl-post').style.display = state.score == null || state.posted ? 'none' : 'flex';
    if (!state.posted) { const b = $('#bl-postbtn'); b.disabled = false; b.textContent = 'Post score'; }
    msg.textContent = 'Loading...';
    try {
      const rows = await S.topScores(GAME, 10);
      const myName = (S.ls.get('bouncelab-name', '') || '').toLowerCase();
      list.innerHTML = rows.map((r, i) => `<li class="${r.name && r.name.toLowerCase() === myName ? 'me' : ''}"><span class="bl-pos">${i + 1}</span><span class="bl-nm">${esc(r.name || 'anon')}</span><span class="bl-sc">${fmt(r.score)}</span></li>`).join('');
      msg.textContent = rows.length ? '' : 'No scores yet. Be the first!';
    } catch (e) { msg.textContent = 'Leaderboard is offline right now.'; }
  }

  // ---------- rating + feedback ----------
  async function rate(stars, fromBar) {
    const prev = S.ls.get(key('rating'), 0);
    paintStars(stars);
    if (prev === stars) { if (fromBar) openSheet('fb'); return; }
    S.ls.set(key('rating'), stars);
    S.rate(GAME, stars, prev || 0).catch(() => {});
    S.track(GAME + '/rate-' + stars, 'Rated ' + stars);
    if (fromBar) { toast('Thanks! Tap ★ again to add a comment'); }
  }
  async function sendFeedback() {
    const tags = [...ui.root.querySelectorAll('.bl-tagb.on')].map(b => b.textContent);
    const text = $('#bl-text').value.trim();
    const stars = S.ls.get(key('rating'), 0) || null;
    if (!text && !tags.length && !stars) { toast('Pick some stars or write a note'); return; }
    const btn = $('#bl-send'); btn.disabled = true; btn.textContent = '...';
    try {
      await S.sendFeedback(GAME, { stars, text: (tags.length ? '[' + tags.join(', ') + '] ' : '') + text, name: S.ls.get('bouncelab-name', ''), v: VERSION, score: state.score });
      S.track(GAME + '/feedback', 'Sent feedback');
      $('#bl-text').value = ''; ui.root.querySelectorAll('.bl-tagb.on').forEach(b => b.classList.remove('on'));
      $('.bl-form').style.display = 'none'; $('.bl-thanks').style.display = 'block';
    } catch (e) { toast('Could not send. Try again in a moment.'); }
    btn.disabled = false; btn.textContent = 'Send';
  }
})();
