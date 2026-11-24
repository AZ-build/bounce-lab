// SMASHBALL (game id "rebound", v4 "Goal") — a 1v1 arena striker for Bounce Lab.
// You are a tall steel striker in a concrete-and-glass lab arena. The camera sits close
// behind you and always swings to keep the ball in view. Drag anywhere to run (up = toward
// the ball), tap to jump + smash. A bot striker attacks your goal. Heavy ball, 2-minute match.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- tuning
const CFG = {
  // arena (metres). You defend +z, the bot defends -z.
  W: 17, L: 26, chamfer: 5, goalW: 5.5, goalH: 4.4, goalD: 4, wallH: 9, ceil: 14,
  // the ball: heavy, low bounce, rolls to a stop
  r: 1.0, g: 30, floorE: .38, wallE: .55, roll: .45, air: .05, ballMax: 44,
  // strikers
  R: .8, H: 3.5, speed: 15, accel: 88, airAccel: 34, gp: 36, jumpV: 12.5, jumpMax: 17.5,
  dash: 18, dashRange: 10,
  hitE: .5, hitBase: 2.2, hitLift: .1,
  smashWin: .45, smashCool: .75, smashSpeed: 32, smashLift: 5, smashAssist: .45,
  // the bot
  botSpeed: 11.0, botAccel: 54, botThink: .12, botSmash: .4, botSmashCool: 2.2,
  // camera: close, low-ish, wide
  camDist: 6.4, camH: 5.6, camSide: 1.2, hfov: 80,
  matchTime: 120,
};
const { W, L, r: BR } = CFG;
const CH = CFG.chamfer, GW = CFG.goalW, GH = CFG.goalH, GD = CFG.goalD;
const DIAG = (W + L - CH) / Math.SQRT2;
const TEAM = { you: 0x3ef6ff, bot: 0xff3fb4 };

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const $ = s => document.querySelector(s);
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const V = () => new THREE.Vector3();

// ---------------------------------------------------------------- renderer + scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR_STEPS = [2, 1.6, 1.3, 1];
let dprIdx = DPR_STEPS.findIndex(v => v <= Math.min(window.devicePixelRatio || 1, 2)); if (dprIdx < 0) dprIdx = DPR_STEPS.length - 1;
renderer.setPixelRatio(DPR_STEPS[dprIdx]);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050507);
scene.fog = new THREE.Fog(0x08090b, 80, 190);
const camera = new THREE.PerspectiveCamera(75, 1, .1, 400);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = .55;
// one fixed set of lights (never add/remove lights mid-game: it recompiles every shader)
scene.add(new THREE.HemisphereLight(0xb9c8e6, 0x1b1d22, .75));
const sun = new THREE.DirectionalLight(0xe6eeff, 2.0);
sun.position.set(-14, 34, 10);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 34, bottom: -34, near: 4, far: 80 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = .04;
scene.add(sun); scene.add(sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .2, .25, .95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- textures
function cv(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
function tex(c, { srgb = true, rep = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  t.anisotropy = 4;
  return t;
}
function speckle(x, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < .5 ? 0 : 255;
    x.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    const s = Math.random() < .9 ? 1 : 2 + Math.random() * 3;
    x.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}
const glowTex = tex(cv(64, 64, (x) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
}));
const concreteC = cv(256, 256, (x, w, h) => {
  x.fillStyle = '#5a5e66'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { const g = x.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 40 + Math.random() * 60);
    g.addColorStop(0, `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.06)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  speckle(x, w, h, 5000, .18);
});
const formC = cv(512, 512, (x, w, h) => {
  x.fillStyle = '#6a6e75'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { const cx = Math.random() * w, cy = Math.random() * h, g = x.createRadialGradient(cx, cy, 0, cx, cy, 30 + Math.random() * 90);
    g.addColorStop(0, `rgba(${Math.random() < .55 ? '0,0,0' : '255,255,255'},${.04 + Math.random() * .05})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  speckle(x, w, h, 14000, .16);
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 0, w, 3); x.fillRect(0, 0, 3, h);
  x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, 3, w, 1); x.fillRect(3, 0, 1, h);
  for (const [u, v] of [[.2, .22], [.5, .22], [.8, .22], [.2, .72], [.5, .72], [.8, .72]]) {
    const g = x.createRadialGradient(u * w, v * h, 1, u * w, v * h, 9); g.addColorStop(0, '#0b0c0e'); g.addColorStop(.6, '#25272b'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(u * w, v * h, 9, 0, Math.PI * 2); x.fill();
  }
});
const steelC = cv(256, 256, (x, w, h) => {
  x.fillStyle = '#9aa3ae'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${Math.random() * .08})`; x.fillRect(0, Math.random() * h, w, 1); }
  speckle(x, w, h, 1200, .06);
});
const steelTex = tex(steelC, { rep: [1, 2] });

// the arena floor: polished lab concrete with painted markings
const PPM = 30;
const floorTex = tex(cv(W * 2 * PPM, L * 2 * PPM, (x, w, h) => {
  const X = v => (v + W) * PPM, Z = v => (v + L) * PPM;
  x.fillStyle = '#26292f'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const cx = Math.random() * w, cy = Math.random() * h, g = x.createRadialGradient(cx, cy, 0, cx, cy, 60 + Math.random() * 160);
    g.addColorStop(0, `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${.03 + Math.random() * .04})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  speckle(x, w, h, 60000, .14);
  // pour joints every 4 m
  x.lineWidth = 2;
  for (let v = -W + 1; v < W; v += 4) { x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.moveTo(X(v), 0); x.lineTo(X(v), h); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.moveTo(X(v) + 2, 0); x.lineTo(X(v) + 2, h); x.stroke(); }
  for (let v = -L + 2; v < L; v += 4) { x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.moveTo(0, Z(v)); x.lineTo(w, Z(v)); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.05)'; x.beginPath(); x.moveTo(0, Z(v) + 2); x.lineTo(w, Z(v) + 2); x.stroke(); }
  // team halves glow faintly near each goal
  for (const [z, c] of [[-L, '255,63,180'], [L, '62,246,255']]) {
    const g = x.createRadialGradient(X(0), Z(z), 0, X(0), Z(z), 16 * PPM);
    g.addColorStop(0, `rgba(${c},.16)`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  // markings
  const line = (wd = .12, a = .42) => { x.lineWidth = wd * PPM; x.strokeStyle = `rgba(222,236,255,${a})`; };
  const inset = .7, c2 = CH;
  line(.16);
  x.beginPath();
  x.moveTo(X(-W + inset), Z(-L + c2)); x.lineTo(X(-W + c2), Z(-L + inset)); x.lineTo(X(W - c2), Z(-L + inset)); x.lineTo(X(W - inset), Z(-L + c2));
  x.lineTo(X(W - inset), Z(L - c2)); x.lineTo(X(W - c2), Z(L - inset)); x.lineTo(X(-W + c2), Z(L - inset)); x.lineTo(X(-W + inset), Z(L - c2)); x.closePath(); x.stroke();
  x.beginPath(); x.moveTo(X(-W + inset), Z(0)); x.lineTo(X(W - inset), Z(0)); x.stroke();
  x.beginPath(); x.arc(X(0), Z(0), 5 * PPM, 0, Math.PI * 2); x.stroke();
  x.fillStyle = 'rgba(222,236,255,.6)'; x.beginPath(); x.arc(X(0), Z(0), .35 * PPM, 0, Math.PI * 2); x.fill();
  for (const s of [-1, 1]) {
    const e = s * (L - inset);
    x.beginPath(); x.moveTo(X(-9), Z(e)); x.lineTo(X(-9), Z(e - s * 6.5)); x.lineTo(X(9), Z(e - s * 6.5)); x.lineTo(X(9), Z(e)); x.stroke();
    x.beginPath(); x.arc(X(0), Z(e - s * 6.5), 3.2 * PPM, s < 0 ? 0 : Math.PI, s < 0 ? Math.PI : Math.PI * 2); x.stroke();
  }
  // goal lines glow in team colour
  for (const [z, c] of [[-L, '#ff3fb4'], [L, '#3ef6ff']]) {
    x.shadowColor = c; x.shadowBlur = 18; x.strokeStyle = c; x.lineWidth = .22 * PPM;
    x.beginPath(); x.moveTo(X(-GW), Z(z - Math.sign(z) * .15)); x.lineTo(X(GW), Z(z - Math.sign(z) * .15)); x.stroke(); x.shadowBlur = 0;
  }
  // outside the chamfered corners
  x.fillStyle = '#0c0d10';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    x.beginPath(); x.moveTo(X(sx * W), Z(sz * (L - CH))); x.lineTo(X(sx * W), Z(sz * L)); x.lineTo(X(sx * (W - CH)), Z(sz * L)); x.closePath(); x.fill();
  }
}));

// the ball: graphite shell with amber seams (seams glow, and run white-hot after a smash)
const ballC = cv(512, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a3f47'); g.addColorStop(.5, '#2a2e35'); g.addColorStop(1, '#3a3f47');
  x.fillStyle = g; x.fillRect(0, 0, w, h); speckle(x, w, h, 6000, .12);
  x.strokeStyle = 'rgba(0,0,0,.55)'; x.lineWidth = 3;
  for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(0, i * h / 6); x.lineTo(w, i * h / 6); x.stroke(); }
  for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * w / 8, 0); x.lineTo(i * w / 8, h); x.stroke(); }
});
const seamC = cv(512, 256, (x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#fff'; x.lineWidth = 7; x.shadowColor = '#fff'; x.shadowBlur = 8;
  for (const ph of [0, Math.PI]) { x.beginPath(); for (let i = 0; i <= 128; i++) { const u = i / 128; const y = h / 2 + Math.sin(u * Math.PI * 4 + ph) * h * .26; i ? x.lineTo(u * w, y) : x.moveTo(u * w, y); } x.stroke(); }
});
const netTex = (col) => tex(cv(128, 128, (x, w, h) => {
  x.clearRect(0, 0, w, h); x.strokeStyle = col; x.lineWidth = 2.5; x.globalAlpha = .75;
  for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 16); x.lineTo(w, i * 16); x.stroke(); }
}), { rep: [4, 3] });

// ---------------------------------------------------------------- materials
const concreteMat = new THREE.MeshStandardMaterial({ map: tex(concreteC, { rep: [8, 3] }), color: 0x3a3d44, roughness: .92, metalness: 0 });
const steelMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0xb6bec9, roughness: .38, metalness: .85 });
const darkSteelMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x4a5059, roughness: .45, metalness: .8 });
const glassMat = new THREE.MeshStandardMaterial({ color: 0xc8e8ff, transparent: true, opacity: .06, roughness: .04, metalness: .3, depthWrite: false, side: THREE.DoubleSide });
const neon = (c, k = 1.12) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
const neonWhite = neon(0xcfe9ff), neonYou = neon(TEAM.you), neonBot = neon(TEAM.bot), neonAmber = neon(0xffb43a), kickLine = neon(0x9fdfff, .8);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const boxMesh = (w, h, d, m) => { const o = new THREE.Mesh(UNIT_BOX, m); o.scale.set(w, h, d); return o; };

// ---------------------------------------------------------------- the arena
const arena = new THREE.Group(); scene.add(arena);
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, L * 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .5, metalness: .22 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; arena.add(floor);
  // the hall around the arena: dark concrete with neon tubes, so there's depth through the glass
  const formMat = new THREE.MeshStandardMaterial({ map: tex(formC, { rep: [14, 5] }), color: 0x7d828a, roughness: .9, side: THREE.BackSide });
  const hall = new THREE.Mesh(new THREE.BoxGeometry(100, 40, 140), formMat);
  hall.position.y = 19.9; arena.add(hall);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(100, 140), new THREE.MeshStandardMaterial({ map: tex(concreteC, { rep: [14, 20] }), color: 0x2a2c31, roughness: .8, metalness: .1 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -.02; arena.add(apron);
  // a few thin neon tubes on the hall walls, like the lobby
  const tubeCols = [neon(TEAM.you, 1), neon(0xffb43a, 1), neon(TEAM.bot, 1)];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const t = boxMesh(.12, .12, 14, tubeCols[(i + (s > 0 ? 1 : 0)) % 3]); t.position.set(s * 49.8, 9 + (i % 2) * 4, -45 + i * 30); arena.add(t);
  }
  for (const s of [-1, 1]) { const t = boxMesh(18, .12, .12, s > 0 ? neon(TEAM.you, 1) : neon(TEAM.bot, 1)); t.position.set(0, 14, s * 69.8); arena.add(t); }
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { // steel-capped concrete pillars
    const p = boxMesh(2.2, 40, 2.2, concreteMat); p.position.set(s * 48.8, 20, -60 + i * 24); arena.add(p);
    const c = boxMesh(2.4, .5, 2.4, darkSteelMat); c.position.set(s * 48.8, 1.6, -60 + i * 24); arena.add(c);
  }
  // recessed ceiling light strips
  const ceilLight = new THREE.MeshBasicMaterial({ color: 0xdfe8f5, toneMapped: true });
  for (let i = 0; i < 5; i++) for (const x of [-9, 9]) { const t = boxMesh(1.2, .08, 10, ceilLight); t.position.set(x, 26, -28 + i * 14); arena.add(t);
    const h = boxMesh(1.6, .3, 10.4, darkSteelMat); h.position.set(x, 26.2, -28 + i * 14); arena.add(h); }
}

// arena walls: a steel kickboard, glass panels, steel posts and a neon rail
function wallRun(x1, z1, x2, z2, holeX = 0) {
  const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const seg = (along0, along1, y0, y1) => {
    const a = (along0 + along1) / 2, l = along1 - along0, px = x1 + dx / len * a, pz = z1 + dz / len * a;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(l, y1 - y0), glassMat);
    g.position.set(px, (y0 + y1) / 2, pz); g.rotation.y = ang + Math.PI / 2; arena.add(g);
  };
  if (holeX) { // end wall with the goal mouth cut out
    const hole0 = len / 2 - holeX, hole1 = len / 2 + holeX;
    seg(0, hole0, 0, CFG.wallH); seg(hole1, len, 0, CFG.wallH); seg(hole0, hole1, GH + .35, CFG.wallH);
  } else seg(0, len, 0, CFG.wallH);
  const rail = boxMesh(.22, .22, len, darkSteelMat); rail.position.set(mx, CFG.wallH, mz); rail.rotation.y = ang; arena.add(rail);
  const kb = (a0, a1) => {
    const l = a1 - a0, a = (a0 + a1) / 2;
    const k = boxMesh(.3, .55, l, darkSteelMat); k.position.set(x1 + dx / len * a, .275, z1 + dz / len * a); k.rotation.y = ang; k.receiveShadow = true; arena.add(k);
    const n = boxMesh(.31, .035, l, kickLine); n.position.set(k.position.x, .57, k.position.z); n.rotation.y = ang; arena.add(n);
  };
  if (holeX) { kb(0, len / 2 - holeX - .3); kb(len / 2 + holeX + .3, len); } else kb(0, len);
  const posts = Math.max(1, Math.round(len / 7));
  for (let i = 0; i <= posts; i++) {
    const a = len * i / posts; if (holeX && Math.abs(a - len / 2) < holeX + .5) continue;
    const p = boxMesh(.24, CFG.wallH, .24, steelMat); p.position.set(x1 + dx / len * a, CFG.wallH / 2, z1 + dz / len * a); p.rotation.y = ang; p.castShadow = true; arena.add(p);
  }
}
for (const s of [-1, 1]) {
  wallRun(s * W, -(L - CH), s * W, L - CH);
  wallRun(-(W - CH), s * L, W - CH, s * L, GW);
  wallRun(s * W, L - CH, s * (W - CH), L); wallRun(s * W, -(L - CH), s * (W - CH), -L);
}

// goals: glowing neon frame, a lit floor and a net
const goals = [];
for (const s of [-1, 1]) { // s = -1 bot's goal (you attack it), +1 your goal
  const col = s > 0 ? TEAM.you : TEAM.bot, nm = s > 0 ? neonYou : neonBot, g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(.26, .26, GH, 16);
  const lineGeo = new THREE.BoxGeometry(.07, GH - .3, .07);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, steelMat); p.position.set(sx * GW, GH / 2, s * L); p.castShadow = true; g.add(p);
    const ln = new THREE.Mesh(lineGeo, nm); ln.position.set(sx * (GW - .26), (GH - .3) / 2, s * L); g.add(ln);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, GW * 2 + .52, 16), steelMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, GH, s * L); bar.castShadow = true; g.add(bar);
  const barLn = boxMesh(GW * 2 - .5, .07, .07, nm); barLn.position.set(0, GH - .26, s * L); g.add(barLn);
  const netMat = new THREE.MeshBasicMaterial({ map: netTex('#' + new THREE.Color(col).getHexString()), transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GH), netMat); back.position.set(0, GH / 2, s * (L + GD)); g.add(back);
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.PlaneGeometry(GD, GH), netMat); side.rotation.y = Math.PI / 2; side.position.set(sx * GW, GH / 2, s * (L + GD / 2)); g.add(side); }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GD), netMat); top.rotation.x = Math.PI / 2; top.position.set(0, GH, s * (L + GD / 2)); g.add(top);
  const gf = new THREE.Mesh(new THREE.PlaneGeometry(GW * 2, GD), new THREE.MeshStandardMaterial({ color: 0x15171b, emissive: col, emissiveIntensity: .15, roughness: .5, metalness: .4 }));
  gf.rotation.x = -Math.PI / 2; gf.position.set(0, .01, s * (L + GD / 2)); gf.receiveShadow = true; g.add(gf);
  // steel housing around the goal box
  for (const sx of [-1, 1]) { const h = boxMesh(.4, GH + .6, GD + .4, darkSteelMat); h.position.set(sx * (GW + .5), (GH + .6) / 2, s * (L + GD / 2)); g.add(h); }
  const hb = boxMesh(GW * 2 + 1.4, GH + .6, .4, darkSteelMat); hb.position.set(0, (GH + .6) / 2, s * (L + GD + .3)); g.add(hb);
  arena.add(g);
  goals.push({ s, netMat, floorMat: gf.material, flash: 0 });
}

// ---------------------------------------------------------------- strikers
// a tall steel pillar on a heavy base: easy to hit with, and the visor shows which way it faces
const BODY_GEO = new THREE.CapsuleGeometry(.72, 1.85, 6, 20);
const BASE_GEO = new THREE.CylinderGeometry(.95, 1.05, .34, 28);
const BAND_GEO = new THREE.TorusGeometry(.74, .055, 8, 36);
const RING_GEO = new THREE.TorusGeometry(1.0, .06, 8, 40);
const VISOR_GEO = new THREE.BoxGeometry(.95, .26, .3);
const FOOT_GEO = new THREE.RingGeometry(1.25, 1.5, 40);
function makeStriker(col) {
  const g = new THREE.Group(), lean = new THREE.Group(); g.add(lean);
  const bodyMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x8a929d, roughness: .24, metalness: .92, emissive: 0xffb43a, emissiveIntensity: 0, transparent: true });
  const baseMat = new THREE.MeshStandardMaterial({ map: steelTex, color: 0x9aa3ae, roughness: .35, metalness: .9, transparent: true });
  const glow = neon(col, 1.05); glow.transparent = true;
  const base = new THREE.Mesh(BASE_GEO, baseMat); base.position.y = .17; lean.add(base);
  const ring = new THREE.Mesh(RING_GEO, glow); ring.rotation.x = Math.PI / 2; ring.position.y = .34; ring.scale.set(.97, .97, .6); lean.add(ring);
  const body = new THREE.Mesh(BODY_GEO, bodyMat); body.position.y = .3 + .72 + 1.85 / 2; lean.add(body);
  const band = new THREE.Mesh(BAND_GEO, glow); band.rotation.x = Math.PI / 2; band.position.y = 2.25; band.scale.set(1, 1, .55); lean.add(band);
  const collar = new THREE.Mesh(BAND_GEO, baseMat); collar.rotation.x = Math.PI / 2; collar.position.y = 1.05; collar.scale.set(1.04, 1.04, 2.2); lean.add(collar);
  const visor = new THREE.Mesh(VISOR_GEO, glow); visor.position.set(0, 3.0, .6); visor.scale.set(.8, .55, 1); lean.add(visor);
  const visorRim = new THREE.Mesh(VISOR_GEO, baseMat); visorRim.position.set(0, 3.0, .54); visorRim.scale.set(.95, .9, 1); lean.add(visorRim);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  const foot = new THREE.Mesh(FOOT_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .35, depthWrite: false }));
  foot.rotation.x = -Math.PI / 2; foot.position.y = .03; scene.add(foot);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc23a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(3.5, 3.5, 1); halo.position.y = 2; lean.add(halo);
  scene.add(g);
  return { g, lean, bodyMat, baseMat, glow, foot, halo, ring };
}
function newStriker(col, isBot) {
  return { mesh: makeStriker(col), isBot, col, p: V(), v: V(), yaw: 0, ground: true, smash: 0, cool: 0, jumpT: 0, squash: 0, land: 0, hitFx: 0,
    fade: 1, ai: { t: 0, tx: 0, tz: 0, charge: false, jump: 0 } };
}
const P = newStriker(TEAM.you, false), B = newStriker(TEAM.bot, true);
const strikers = [P, B];

// ---------------------------------------------------------------- the ball
const ballMat = new THREE.MeshStandardMaterial({ map: tex(ballC), emissiveMap: tex(seamC, { srgb: false }), emissive: 0xffa53a, emissiveIntensity: .8, roughness: .28, metalness: .75 });
const ball = { p: V(), v: V(), spin: V(), mesh: new THREE.Mesh(new THREE.SphereGeometry(BR, 40, 24), ballMat), heat: 0, last: null, smashBy: null, smashT: 0, live: true };
ball.mesh.castShadow = true; scene.add(ball.mesh);
const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa53a, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
ballGlow.scale.set(4.2, 4.2, 1); scene.add(ballGlow);
// a ring on the floor under the ball, so you can judge where it'll come down
const ballMark = new THREE.Mesh(new THREE.RingGeometry(.75, 1.0, 36), new THREE.MeshBasicMaterial({ color: 0xffc23a, transparent: true, opacity: .35, depthWrite: false }));
ballMark.rotation.x = -Math.PI / 2; scene.add(ballMark);

// ---------------------------------------------------------------- particles
const PN = 900;
const partGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
partGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); partGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = new THREE.Points(partGeo, new THREE.PointsMaterial({ size: .24, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
parts.frustumCulled = false; scene.add(parts);
const P_ = Array.from({ length: PN }, () => ({ life: 0, max: 1, p: V(), v: V(), c: new THREE.Color(), g: 10 }));
let pIdx = 0;
for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -99;
function burst(at, n, color, speed = 8, grav = 12, dir = null, life = [.4, 1]) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const q = P_[pIdx]; pIdx = (pIdx + 1) % PN;
    q.p.copy(at); q.v.set(rnd(-1, 1), rnd(-.3, 1), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(.3, 1));
    if (dir) q.v.addScaledVector(dir, speed * .6);
    q.life = q.max = rnd(life[0], life[1]); q.c.copy(c).multiplyScalar(rnd(.8, 1.8)); q.g = grav;
  }
}
function stepParts(dt) {
  for (let i = 0; i < PN; i++) {
    const q = P_[i];
    if (q.life <= 0) { pPos[i * 3 + 1] = -99; continue; }
    q.life -= dt; q.v.y -= q.g * dt; q.v.multiplyScalar(Math.exp(-1.5 * dt)); q.p.addScaledVector(q.v, dt);
    if (q.p.y < .05) { q.p.y = .05; q.v.y *= -.4; }
    const f = Math.max(0, q.life / q.max);
    pPos[i * 3] = q.p.x; pPos[i * 3 + 1] = q.p.y; pPos[i * 3 + 2] = q.p.z;
    pCol[i * 3] = q.c.r * f; pCol[i * 3 + 1] = q.c.g * f; pCol[i * 3 + 2] = q.c.b * f;
  }
  partGeo.attributes.position.needsUpdate = true; partGeo.attributes.color.needsUpdate = true;
}

// ---------------------------------------------------------------- popups
const popsEl = $('#pops'), pops = [];
const tmpV = V();
function pop(text, at, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; popsEl.appendChild(el);
  pops.push({ el, at: at.clone(), t: 0 });
}
function stepPops(dt) {
  for (let i = pops.length - 1; i >= 0; i--) {
    const o = pops[i]; o.t += dt;
    if (o.t > 1.1) { o.el.remove(); pops.splice(i, 1); continue; }
    tmpV.copy(o.at); tmpV.y += 1.5 + o.t * 2; tmpV.project(camera);
    const x = (tmpV.x * .5 + .5) * innerWidth, y = (-tmpV.y * .5 + .5) * innerHeight;
    o.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${1 + Math.max(0, .25 - o.t)})`;
    o.el.style.opacity = tmpV.z > 1 ? 0 : (o.t > .75 ? 1 - (o.t - .75) / .35 : 1);
  }
}

// ---------------------------------------------------------------- sound
let ac = null, master = null, noiseBuf = null, muted = store.get('rebound-muted', false), rollOsc = null, rollGain = null;
function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * .8, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // room tone
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
    const gn = ac.createGain(); gn.gain.value = .035; src.connect(f); f.connect(gn); gn.connect(master); src.start();
    // the ball rolling
    const rs = ac.createBufferSource(); rs.buffer = noiseBuf; rs.loop = true;
    const rf = ac.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 180; rf.Q.value = .7;
    rollGain = ac.createGain(); rollGain.gain.value = 0; rs.connect(rf); rf.connect(rollGain); rollGain.connect(master); rs.start();
  } catch { ac = null; }
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(1e-4, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(1e-4, t + a + dec); }
function tone(freq, type, vol, dur, slide = 0, delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq * slide), t + dur);
  env(g, t, .005, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function noise(vol, dur, freq = 1200, q = .8, type = 'bandpass', delay = 0) {
  if (!ac) return; const t = ac.currentTime + delay, s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, .004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + .05);
}
const sfx = {
  kick(j) { const e = clamp(j / 20, 0, 1); tone(70 + e * 50, 'sine', .25 + e * .5, .22, .5); noise(.08 + e * .25, .1, 700 + e * 900, .8); },
  smash() { tone(52, 'sine', .9, .42, .4); noise(.5, .18, 1400, .6); tone(180, 'square', .1, .18, .4); tone(1200, 'triangle', .06, .5, .7, .02); },
  bounce(j) { const e = clamp(j / 18, 0, 1); if (e < .08) return; tone(48 + e * 30, 'sine', .15 + e * .45, .3, .5); noise(.05 + e * .15, .12, 260, .7, 'lowpass'); },
  wall(j) { const e = clamp(j / 20, 0, 1); if (e < .1) return; noise(.08 + e * .25, .2, 2400, 1.4); tone(220, 'triangle', .04 + e * .08, .35, .9); },
  post() { tone(660, 'triangle', .2, .9, .99); tone(990, 'sine', .12, .7, .99); noise(.2, .1, 4000, 2); },
  jump() { tone(180, 'sine', .14, .16, 2.2); noise(.06, .12, 900, .8); },
  land() { tone(60, 'sine', .14, .12, .6); },
  goal(mine) {
    noise(.35, 1.8, 900, .3);
    if (mine) { [0, 4, 7, 12, 16].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 'triangle', .16, .6, 0, i * .07));
      [12, 16, 19, 24].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 'sine', .1, .9, 0, .55 + i * .11)); noise(.18, 2.6, 1400, .25, 'bandpass', .3); }
    else [7, 3, 0].forEach((n, i) => tone(262 * Math.pow(2, n / 12), 'sawtooth', .07, .5, .9, i * .14));
    tone(98, 'sine', .55, 1, .5);
  },
  rocket() { noise(.05, .5, 2600, 2.5); tone(400, 'sine', .04, .5, 3); },
  pop(i) { noise(.22, .35, 900 + i * 200, .5); tone(1400 + i * 120, 'triangle', .05, .5, .5); },
  whistle() { tone(2300, 'sine', .14, .18, 1.02); tone(2300, 'sine', .14, .35, .98, .22); },
  tick() { tone(880, 'sine', .1, .08); },
  save() { [12, 16, 19].forEach((n, i) => tone(440 * Math.pow(2, n / 12), 'triangle', .12, .3, 0, i * .05)); },
  win() { [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 'triangle', .13, .35, 0, i * .09)); },
  lose() { [7, 3, 0, -5].forEach((n, i) => tone(220 * Math.pow(2, n / 12), 'triangle', .12, .45, 0, i * .15)); },
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ---------------------------------------------------------------- game state
let mode = 'title';           // title | play | over
const S = { phase: 'kickoff', phaseT: 0, clock: CFG.matchTime, golden: false, gy: 0, gb: 0, pts: 0, touches: 0, smashes: 0, saves: 0, fastest: 0, smashGoals: 0,
  hitstop: 0, slow: 1, slowT: 0, shake: 0, best: store.get('rebound-best-v4', 0), countdown: 0, tapped: false, autoplay: false };

// ---------------------------------------------------------------- physics
const tmp = V(), tmp2 = V(), nrm = V();
// the arena's flat walls as planes (outward normal n, limit d): two sides, four chamfered corners
const PLANES = [[1, 0, W], [-1, 0, W]];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) PLANES.push([sx / Math.SQRT2, sz / Math.SQRT2, DIAG]);
function wallHit(o, nx, nz, e, rad, impact) {
  const vn = o.v.x * nx + o.v.z * nz;
  if (vn > 0) { o.v.x -= (1 + e) * vn * nx; o.v.z -= (1 + e) * vn * nz; if (impact) impact(vn); }
}
function constrainFlat(o, rad, e, impact, inMouth) {
  for (const [nx, nz, d] of PLANES) {
    const pen = o.p.x * nx + o.p.z * nz + rad - d;
    if (pen > 0) { o.p.x -= nx * pen; o.p.z -= nz * pen; wallHit(o, nx, nz, e, rad, impact); }
  }
  for (const s of [-1, 1]) {
    if (inMouth && inMouth(s)) continue;
    const pen = s * o.p.z + rad - L;
    if (pen > 0) { o.p.z -= s * pen; wallHit(o, 0, s, e, rad, impact); }
  }
}
// sphere vs. capsule segment a-b (radius cr): pushes the ball out and bounces it
function sphereSeg(o, ax, ay, az, bx, by, bz, cr, e, impact) {
  const abx = bx - ax, aby = by - ay, abz = bz - az, l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 ? clamp(((o.p.x - ax) * abx + (o.p.y - ay) * aby + (o.p.z - az) * abz) / l2, 0, 1) : 0;
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  nrm.set(o.p.x - cx, o.p.y - cy, o.p.z - cz);
  const d = nrm.length(), min = BR + cr;
  if (d >= min || d < 1e-6) return false;
  nrm.divideScalar(d); o.p.set(cx, cy, cz).addScaledVector(nrm, min);
  if (e === null) return true;
  const vn = o.v.dot(nrm);
  if (vn < 0) { o.v.addScaledVector(nrm, -(1 + e) * vn); impact && impact(-vn); }
  return true;
}
const inMouthBall = s => Math.abs(ball.p.x) < GW && ball.p.y < GH;
let wallSnd = 0;
function stepBall(dt) {
  const o = ball;
  o.v.y -= CFG.g * dt;
  o.v.multiplyScalar(Math.exp(-CFG.air * dt));
  o.p.addScaledVector(o.v, dt);
  // floor
  if (o.p.y < BR) {
    o.p.y = BR;
    if (o.v.y < -1.5) { sfx.bounce(-o.v.y); o.v.y *= -CFG.floorE; } else o.v.y = 0;
    const k = Math.exp(-CFG.roll * dt); o.v.x *= k; o.v.z *= k;
  }
  if (o.p.y > CFG.ceil - BR) { o.p.y = CFG.ceil - BR; if (o.v.y > 0) o.v.y *= -CFG.wallE; }
  const impact = vn => { if (wallSnd <= 0) { sfx.wall(vn); wallSnd = .08; } if (vn > 14) burst(o.p, 6, 0xcfe9ff, 5); };
  const inGoal = Math.abs(o.p.z) > L;
  if (!inGoal) constrainFlat(o, BR, CFG.wallE, impact, inMouthBall);
  else { // inside a goal box: net on the sides, back and top
    const s = Math.sign(o.p.z), ne = .2, damp = vn => { o.v.multiplyScalar(.75); };
    if (Math.abs(o.p.x) > GW - BR) { const sx = Math.sign(o.p.x); o.p.x = sx * (GW - BR); if (o.v.x * sx > 0) { o.v.x *= -ne; damp(); } }
    if (o.p.y > GH - BR) { o.p.y = GH - BR; if (o.v.y > 0) o.v.y *= -ne; }
    if (s * o.p.z > L + GD - BR) { o.p.z = s * (L + GD - BR); if (o.v.z * s > 0) { o.v.z *= -ne; damp(); } }
  }
  // goal posts and crossbars
  const ring = vn => { if (vn > 3) { sfx.post(); burst(o.p, 8, 0xffffff, 6); } };
  for (const s of [-1, 1]) {
    if (Math.abs(o.p.z - s * L) > 2) continue;
    for (const sx of [-1, 1]) sphereSeg(o, sx * GW, 0, s * L, sx * GW, GH, s * L, .26, .6, ring);
    sphereSeg(o, -GW, GH, s * L, GW, GH, s * L, .26, .6, ring);
  }
  const sp = o.v.length();
  if (sp > CFG.ballMax) o.v.multiplyScalar(CFG.ballMax / sp);
  // rolling spin (visual)
  if (o.p.y <= BR + .02) o.spin.set(o.v.z / BR, 0, -o.v.x / BR); else o.spin.multiplyScalar(Math.exp(-.3 * dt));
}

// a striker touching the ball
function hitBall(o) {
  const ay = o.p.y + CFG.R, by = o.p.y + CFG.H - CFG.R;
  let j = 0;
  const hit = sphereSeg(ball, o.p.x, ay, o.p.z, o.p.x, by, o.p.z, CFG.R, null, null);
  if (!hit) return;
  // relative velocity along the contact normal (the striker is far heavier than the ball)
  tmp.copy(ball.v).sub(o.v); const vn = tmp.dot(nrm);
  if (vn < 0) {
    j = -(1 + CFG.hitE) * vn;
    ball.v.addScaledVector(nrm, j + CFG.hitBase * Math.min(1, j / 5));
    ball.v.y += CFG.hitLift * j;
    o.v.addScaledVector(tmp2.set(nrm.x, 0, nrm.z), -j * .06);
  }
  const smashed = o.smash > 0;
  if (smashed) smash(o);
  else if (j > 1.5) {
    if (o.touchSnd <= 0) { sfx.kick(j); o.touchSnd = .12; }
    if (j > 10) burst(ball.p, 5, o.col, 4);
  }
  if (j > 1.5 || smashed) touched(o, j);
  o.hitFx = Math.min(1, o.hitFx + j / 14);
}
// is the ball heading into the goal at z = s*L in the next ~1.5 s?
function onTarget(s, pos = ball.p, vel = ball.v) {
  if (vel.z * s <= 2) return false;
  const t = (s * L - pos.z) / vel.z;
  if (t < 0 || t > 1.5) return false;
  const x = pos.x + vel.x * t; if (Math.abs(x) > GW + .4) return false;
  let y = pos.y + vel.y * t - .5 * CFG.g * t * t; if (y < BR) y = BR + (BR - y) * .3;
  return y < GH + .3;
}
let threat = false; // was the ball on target for your goal just before your touch?
function touched(o, j) {
  if (o === P) {
    S.touches++;
    if (threat && !onTarget(1) && S.phase === 'live') { S.saves++; addPts(30, ball.p, 'SAVE +30'); sfx.save(); buzz(20); }
  }
  ball.last = o; ball.lastT = 0;
}
function smash(o) {
  o.smash = 0;
  const s = o === P ? -1 : 1; // which goal this striker attacks
  tmp2.set(nrm.x, 0, nrm.z); if (tmp2.lengthSq() < .01) tmp2.set(Math.sin(o.yaw), 0, Math.cos(o.yaw)); tmp2.normalize();
  tmp.set(-ball.p.x, 0, s * (L + 1) - ball.p.z).normalize();
  // aim assist: if the goal is roughly where you hit it, bend the shot toward it
  if (tmp2.dot(tmp) > Math.cos(80 * Math.PI / 180)) tmp2.lerp(tmp, CFG.smashAssist).normalize();
  const hs = Math.hypot(o.v.x, o.v.z), sp = CFG.smashSpeed + hs * .25;
  ball.v.set(tmp2.x * sp, ball.p.y > 3 ? 2 : CFG.smashLift, tmp2.z * sp);
  ball.heat = 1; ball.smashBy = o; ball.smashT = 1.6;
  S.hitstop = .07; S.shake = Math.max(S.shake, o === P ? .55 : .3);
  burst(ball.p, 26, 0xffc23a, 12, 6, tmp2, [.3, .7]);
  sfx.smash(); if (o === P) { buzz(25); S.smashes++; flash('rgba(255,194,58,.35)'); }
}
function stepStriker(o, ix, iz, dt) {
  const max = o.isBot ? botSpeed() : CFG.speed;
  const acc = o.ground ? (o.isBot ? CFG.botAccel : CFG.accel) : CFG.airAccel;
  // steer toward the wanted velocity; above top speed (after a dash) ease back down
  const tx = ix * max, tz = iz * max;
  const dx = tx - o.v.x, dz = tz - o.v.z, dl = Math.hypot(dx, dz), step = acc * dt;
  if (dl > step) { o.v.x += dx / dl * step; o.v.z += dz / dl * step; } else { o.v.x = tx; o.v.z = tz; }
  o.v.y -= CFG.gp * dt;
  o.p.addScaledVector(o.v, dt);
  if (o.p.y <= 0) {
    if (!o.ground && o.v.y < -6) { o.land = 1; if (o === P) sfx.land(); }
    o.p.y = 0; o.v.y = 0; o.ground = true;
  } else o.ground = false;
  constrainFlat(o, CFG.R, .1, null, null);
  o.smash = Math.max(0, o.smash - dt); o.cool = Math.max(0, o.cool - dt); o.touchSnd = Math.max(0, (o.touchSnd || 0) - dt);
  // face where you're going (or the ball when standing still)
  const hs = Math.hypot(o.v.x, o.v.z);
  const want = hs > 1.5 ? Math.atan2(o.v.x, o.v.z) : Math.atan2(ball.p.x - o.p.x, ball.p.z - o.p.z);
  o.yaw = angLerp(o.yaw, want, 1 - Math.exp(-10 * dt));
}
function strikersCollide() {
  const dx = B.p.x - P.p.x, dz = B.p.z - P.p.z, d = Math.hypot(dx, dz), min = CFG.R * 2 + .1;
  if (d < min && d > 1e-4 && Math.abs(B.p.y - P.p.y) < CFG.H) {
    const nx = dx / d, nz = dz / d, pen = (min - d) / 2;
    P.p.x -= nx * pen; P.p.z -= nz * pen; B.p.x += nx * pen; B.p.z += nz * pen;
    const rv = (B.v.x - P.v.x) * nx + (B.v.z - P.v.z) * nz;
    if (rv < 0) { const j = -rv * .75; P.v.x -= nx * j; P.v.z -= nz * j; B.v.x += nx * j; B.v.z += nz * j; if (j > 4) sfx.kick(j * .6); }
  }
}
// tap: jump, dash at the ball if it's close, and arm a smash for a split second
function tap(o) {
  if (mode !== 'play' || S.phase !== 'live' || o.cool > 0) return false;
  o.cool = CFG.smashCool; o.smash = CFG.smashWin;
  const dx = ball.p.x - o.p.x, dz = ball.p.z - o.p.z, hd = Math.hypot(dx, dz);
  if (hd < CFG.dashRange && hd > .3) {
    // dash toward where the ball will be in a moment
    const t = Math.min(.25, hd / 20), px = dx + ball.v.x * t, pz = dz + ball.v.z * t, pl = Math.hypot(px, pz) || 1;
    const along = (o.v.x * px + o.v.z * pz) / pl, sp = Math.max(along, CFG.dash);
    o.v.x = px / pl * sp; o.v.z = pz / pl * sp;
  }
  if (o.ground) {
    // jump higher when the ball is up high and close (an easy aerial)
    let vy = CFG.jumpV;
    const need = ball.p.y - 2.2;
    if (hd < 6 && need > 1.8) vy = clamp(Math.sqrt(2 * CFG.gp * need), CFG.jumpV, CFG.jumpMax);
    o.v.y = vy; o.ground = false; o.squash = 1;
  }
  if (o === P) { sfx.jump(); buzz(8); }
  return true;
}

// ---------------------------------------------------------------- the bot
const botSpeed = () => CFG.botSpeed + .55 * clamp(S.gy - S.gb, 0, 4) + (S.golden ? .6 : 0) + .4 * (1 - S.clock / CFG.matchTime);
// gets behind the ball (relative to the goal it attacks) and drives through it
function think(o, s, dt) { // s = +1 attacks your goal (+z), -1 attacks the bot's goal
  const A = o.ai; A.t -= dt; A.jump = Math.max(0, A.jump - dt);
  if (A.t <= 0) {
    A.t = CFG.botThink * rnd(.8, 1.3);
    const dist = Math.hypot(ball.p.x - o.p.x, ball.p.z - o.p.z), lt = clamp(dist / 16, 0, .8);
    let bx = clamp(ball.p.x + ball.v.x * lt, -W + 1.5, W - 1.5), bz = clamp(ball.p.z + ball.v.z * lt, -L + 1.5, L - 1.5);
    let gx = -bx, gz = s * L - bz; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
    const rx = o.p.x - bx, rz = o.p.z - bz, along = rx * gx + rz * gz, lat = rx * -gz + rz * gx;
    const own = -s; // the goal this striker defends
    A.charge = false;
    if (onTarget(own) && Math.abs(o.p.z - own * L) < Math.abs(ball.p.z - own * L) + 3) {
      // ball heading into my goal: get to it
      A.tx = bx; A.tz = bz; A.charge = true;
    } else if (along > -1.0) {
      // wrong side of the ball: loop around it
      const side = Math.sign(lat) || 1;
      A.tx = bx - gx * 3.4 + -gz * side * 3.4; A.tz = bz - gz * 3.4 + gx * side * 3.4;
    } else if (Math.abs(lat) > 1.3) {
      A.tx = bx - gx * 2.2; A.tz = bz - gz * 2.2;
    } else { // lined up: drive through it
      A.tx = bx + gx * 3; A.tz = bz + gz * 3; A.charge = true;
    }
    A.tx += rnd(-.35, .35); A.tz += rnd(-.35, .35);
  }
  let dx = A.tx - o.p.x, dz = A.tz - o.p.z; const d = Math.hypot(dx, dz) || 1;
  const want = A.charge ? 1 : clamp(d / 3, 0, 1);
  const ix = dx / d * want, iz = dz / d * want;
  // smash when close and lined up
  const bdx = ball.p.x - o.p.x, bdz = ball.p.z - o.p.z, bd = Math.hypot(bdx, bdz);
  if (o.isBot && A.charge && bd < 4.2 && o.cool <= 0 && ball.p.y < 4) {
    const gx = -ball.p.x, gz = s * L - ball.p.z, gl = Math.hypot(gx, gz) || 1;
    if ((bdx * gx + bdz * gz) / (bd * gl) > .65) { if (Math.random() < CFG.botSmash + .1 * clamp(S.gy - S.gb, 0, 3)) tap(o); else o.cool = .6; }
  }
  if (!o.isBot && A.charge && bd < 4 && o.cool <= 0) tap(o);
  // jump for a ball dropping close by
  if (o.ground && A.jump <= 0 && bd < 3 && ball.p.y > 3.4 && ball.v.y < 2) { A.jump = 1.4; if (o.isBot) tap(o); }
  return [ix, iz];
}

// ---------------------------------------------------------------- goal celebration
// When you score: your striker hops and spins in gold, fireworks fire off the goal posts,
// a shockwave rings out across the floor and the camera swings round to watch.
const GOLD = 0xffc23a;
const CEL = { t: -1, by: null, hops: 0, rockets: [], fired: 0, dur: 3.2 };
const ROCKET_AT = [.15, .4, .65, .9, 1.2, 1.5, 1.85];
const ROCKET_COL = [GOLD, TEAM.you, GOLD, 0xffffff, TEAM.you, GOLD, 0xff8a3a];
const shock = new THREE.Mesh(new THREE.RingGeometry(.85, 1.0, 64), new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
shock.rotation.x = -Math.PI / 2; shock.position.y = .05; scene.add(shock);
let shockT = 9;
function celebrate(o, goalS) {
  CEL.t = 0; CEL.by = o; CEL.hops = 0; CEL.fired = 0; CEL.goal = goalS; CEL.rockets.length = 0;
  o.mesh.glow.color.set(GOLD).multiplyScalar(1.1);
  if (o === P) { shockT = 0; shock.position.set(o.p.x, .05, o.p.z); }
}
function endCelebration() {
  if (CEL.by) CEL.by.mesh.glow.color.set(CEL.by.col).multiplyScalar(1.05);
  CEL.t = -1; CEL.by = null; CEL.rockets.length = 0;
  for (const o of strikers) o.spinA = 0;
}
const rocketTrail = V();
function stepCelebration(dt) {
  if (CEL.t < 0) return;
  CEL.t += dt;
  const o = CEL.by, mine = o === P;
  // three happy hops, two full spins
  if (o.ground && CEL.hops < 3 && CEL.t > .3 + CEL.hops * .5) { if (mine) burst(tmp2.set(o.p.x, CFG.H + .5, o.p.z), 40, CEL.hops % 2 ? TEAM.you : GOLD, 7, 7, V().set(0, 1, 0), [.6, 1.2]); o.v.y = CEL.hops === 2 ? 13 : 9; o.ground = false; o.squash = 1; CEL.hops++; if (mine) sfx.jump(); }
  const sp = clamp((CEL.t - .3) / 1.5, 0, 1);
  o.spinA = (1 - Math.pow(1 - sp, 3)) * Math.PI * 4;
  if (!mine) return;
  // fireworks from the goal posts
  while (CEL.fired < ROCKET_AT.length && CEL.t >= ROCKET_AT[CEL.fired]) {
    const i = CEL.fired++, sx = i % 2 ? 1 : -1;
    CEL.rockets.push({ p: V().set(sx * GW, GH + .3, CEL.goal * L), v: V().set(sx * rnd(1, 3.5) - 0, rnd(15, 19), -CEL.goal * rnd(2, 5)), t: 0, life: rnd(.7, .95), col: ROCKET_COL[i], i });
    sfx.rocket();
  }
  for (let k = CEL.rockets.length - 1; k >= 0; k--) {
    const r = CEL.rockets[k];
    r.t += dt; r.v.y -= 14 * dt; r.p.addScaledVector(r.v, dt);
    burst(rocketTrail.copy(r.p), 1, 0xffe2a0, 1, 2, null, [.15, .35]);
    if (r.t >= r.life) {
      burst(r.p, 75, r.col, 13, 3.5, null, [.8, 1.5]);
      burst(r.p, 14, 0xffffff, 5, 2, null, [.3, .6]);
      sfx.pop(r.i); CEL.rockets.splice(k, 1);
    }
  }
}

// ---------------------------------------------------------------- match flow
function placeKickoff() {
  P.p.set(0, 0, 15); B.p.set(0, 0, -15); P.v.set(0, 0, 0); B.v.set(0, 0, 0);
  P.yaw = Math.PI; B.yaw = 0; P.smash = B.smash = 0; P.cool = B.cool = 0;
  ball.p.set(rnd(-.4, .4), 5, 0); ball.v.set(0, 0, 0); ball.spin.set(0, 0, 0); ball.heat = 0; ball.last = null; ball.smashBy = null; ball.live = true;
  camYaw = Math.PI;
}
function kickoff() {
  S.phase = 'kickoff'; S.phaseT = 1.4; S.countdown = 3;
  endCelebration(); snapCam = true;
  placeKickoff();
  banner(S.golden ? 'Golden goal' : 'Ready', S.golden ? 'Next goal wins' : '', S.golden ? '#ffc23a' : '#3ef6ff');
}
function start() {
  if (mode === 'play') return;
  audio();
  Object.assign(S, { phase: 'kickoff', clock: CFG.matchTime, golden: false, gy: 0, gb: 0, pts: 0, touches: 0, smashes: 0, saves: 0, fastest: 0, smashGoals: 0, hitstop: 0, slow: 1, slowT: 0, shake: 0 });
  mode = 'play';
  window.BounceLab && BounceLab.start();
  $('#title').classList.add('hide'); $('#over').classList.add('hide'); $('#hud').classList.remove('hide');
  kickoff();
  const plays = store.get('rebound-plays-v4', 0); store.set('rebound-plays-v4', plays + 1);
  S.tapped = plays >= 2;
  hint(S.tapped ? '' : '<b>Drag</b> to run at the ball · <b>tap</b> to jump + smash');
  hud();
}
function scored(s) { // s = goal the ball went into (+1 yours, -1 the bot's)
  const mine = s < 0;
  ball.live = false; S.phase = 'goal'; S.phaseT = mine ? CEL.dur : 2.4; S.slow = .3; S.slowT = mine ? .7 : 1.0;
  celebrate(mine ? P : B, s);
  const g = goals.find(q => q.s === s); g.flash = 1;
  const col = s > 0 ? TEAM.you : TEAM.bot;
  burst(V().set(ball.p.x, ball.p.y, s * L), 60, mine ? 0xffc23a : col, 13, 9, V().set(0, .6, -s), [.5, 1.2]);
  sfx.goal(mine); buzz(mine ? [30, 40, 60] : 60);
  if (mine) {
    S.gy++;
    const smashGoal = ball.smashBy === P && ball.smashT > 0;
    if (smashGoal) S.smashGoals++;
    const n = smashGoal ? 150 : 100;
    addPts(n, ball.p, smashGoal ? 'SMASH GOAL +' + n : '+' + n);
    const own = ball.last === B;
    const cheers = ['What a strike!', 'Top corner!', 'Unstoppable!', 'Back of the net!', 'Clinical.', 'The lab goes wild'];
    banner('Goal!', own ? 'The bot put it in its own net' : smashGoal ? 'Smashed it in!' : cheers[Math.floor(Math.random() * cheers.length)], '#ffc23a');
    flash('rgba(255,194,58,.45)');
    const gy = $('#gYou'); gy.classList.remove('bump'); void gy.offsetWidth; gy.classList.add('bump');
  } else {
    S.gb++;
    banner('Bot scores', ball.last === P ? 'Own goal. Ouch.' : 'Guard your goal', '#ff3fb4');
    flash('rgba(255,63,180,.45)');
  }
  S.shake = 1;
  hud();
}
function endMatch() {
  mode = 'over'; joyEnd();
  const won = S.gy > S.gb;
  if (won) S.pts += 250;
  const score = S.pts, isBest = score > S.best;
  if (isBest) { S.best = score; store.set('rebound-best-v4', score); }
  (won ? sfx.win : sfx.lose)();
  $('#oResult').textContent = won ? 'You win' : 'Bot wins';
  $('#oResult').style.setProperty('--n', won ? '#ffc23a' : '#ff3fb4');
  $('#oLine').innerHTML = `<span class="y neon">${S.gy}</span> – <span class="b neon">${S.gb}</span>`;
  $('#oScore').textContent = score;
  $('#oBest').textContent = isBest && score > 0 ? 'New best!' : 'Best ' + S.best;
  $('#oGoals').textContent = S.gy + (S.smashGoals ? ` (${S.smashGoals} smashed)` : '');
  $('#oSmash').textContent = S.smashes; $('#oTouch').textContent = S.touches; $('#oSaves').textContent = S.saves;
  $('#oFast').textContent = Math.round(S.fastest * 3.6) + ' km/h';
  window.BounceLab && BounceLab.gameOver(score, { goals: S.gy, against: S.gb, won: won ? 1 : 0, smashes: S.smashes, saves: S.saves, touches: S.touches });
  $('#over').classList.remove('hide'); $('#hud').classList.add('hide'); hint('');
}
function addPts(n, at, label) { S.pts += n; pop(label || '+' + n, at); }

// ---------------------------------------------------------------- HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function hud() {
  setText('#pts', String(S.pts)); setText('#gYou', String(S.gy)); setText('#gBot', String(S.gb));
  const c = $('#clock');
  if (S.golden) { setText('#clock', 'GOLDEN'); c.className = 'gold'; }
  else { const t = Math.ceil(S.clock); setText('#clock', Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')); c.className = t <= 10 ? 'low' : ''; }
}
function banner(t, s, col) {
  $('#bTitle').textContent = t; $('#bSub').textContent = s || '';
  const b = $('#banner'); b.style.setProperty('--bc', col || '#3ef6ff'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function flash(col) { const f = $('#flash'); f.style.setProperty('--fc', col); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on'))); }
function hint(html) { const h = $('#hint'); if (html) h.innerHTML = html; h.classList.toggle('on', !!html); }

// ---------------------------------------------------------------- input: a floating joystick + tap
const joyEl = $('#joy'), knobEl = $('#knob'), tapEl = $('#tapFx');
let joy = null; const stick = { x: 0, y: 0 };
const JR = 46;
const isUI = t => t && t.closest && t.closest('.ui');
function tapFx(x, y) { tapEl.style.left = x + 'px'; tapEl.style.top = y + 'px'; tapEl.classList.remove('go'); void tapEl.offsetWidth; tapEl.classList.add('go'); }
function doTap(x, y) {
  if (tap(P)) { tapFx(x, y); if (!S.tapped) { S.tapped = true; hint(''); } }
}
function joyEnd() { joy = null; stick.x = stick.y = 0; joyEl.classList.remove('on'); }
window.addEventListener('pointerdown', e => {
  audio();
  if (isUI(e.target) || mode !== 'play') return;
  e.preventDefault();
  if (joy) { doTap(e.clientX, e.clientY); return; } // a second finger taps
  joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0 };
  joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; knobEl.style.transform = '';
  joyEl.classList.add('on');
}, { passive: false });
window.addEventListener('pointermove', e => {
  if (!joy || e.pointerId !== joy.id) return;
  let dx = e.clientX - joy.x0, dy = e.clientY - joy.y0, d = Math.hypot(dx, dy);
  joy.moved = Math.max(joy.moved, d);
  if (d > JR * 1.35) { // the base follows your thumb so you can always reverse quickly
    const k = (d - JR * 1.35) / d; joy.x0 += dx * k; joy.y0 += dy * k; dx = e.clientX - joy.x0; dy = e.clientY - joy.y0; d = Math.hypot(dx, dy);
    joyEl.style.left = joy.x0 + 'px'; joyEl.style.top = joy.y0 + 'px';
  }
  const m = Math.min(1, d / JR), dz = .12, a = m < dz ? 0 : (m - dz) / (1 - dz);
  stick.x = d ? dx / d * a : 0; stick.y = d ? dy / d * a : 0;
  const kd = Math.min(d, JR);
  knobEl.style.transform = `translate(${d ? dx / d * kd : 0}px,${d ? dy / d * kd : 0}px)`;
});
function endPointer(e) {
  if (!joy || e.pointerId !== joy.id) return;
  const quick = performance.now() - joy.t0 < 260 && joy.moved < 16;
  joyEnd();
  if (quick) doTap(e.clientX, e.clientY);
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (e.repeat) return; if (mode === 'play') doTap(innerWidth / 2, innerHeight * .75); else start(); }
  else if (e.code === 'Enter' && mode !== 'play') start();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
$('#playBtn').addEventListener('click', start);
$('#againBtn').addEventListener('click', start);
const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function muteIcon() { $('#mute').innerHTML = muted ? ICON_OFF : ICON_ON; $('#mute').classList.toggle('off', muted); }
$('#mute').addEventListener('click', () => { muted = !muted; store.set('rebound-muted', muted); muteIcon(); if (master) master.gain.value = muted ? 0 : .55; });
muteIcon();
$('#bestT').textContent = S.best ? 'Best ' + S.best : '';
document.addEventListener('visibilitychange', () => { if (document.hidden) joyEnd(); });
// the stick is read in the camera's frame: up = the way the camera looks (toward the ball)
const camF = V();
function playerInput() {
  let sx = stick.x, sy = stick.y;
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), ky = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); sx = kx / l; sy = ky / l; }
  camera.getWorldDirection(camF); camF.y = 0; camF.normalize();
  const fx = camF.x, fz = camF.z, rx = -fz, rz = fx;
  return [fx * -sy + rx * sx, fz * -sy + rz * sx];
}

// ---------------------------------------------------------------- update
function update(dt) {
  S.phaseT -= dt;
  if (S.phase === 'kickoff') {
    const n = Math.ceil(S.phaseT / .45);
    if (n !== S.countdown && n > 0) { S.countdown = n; sfx.tick(); }
    // the ball drops at centre while you wait; strikers can't move yet
    stepBall(dt);
    if (S.phaseT <= 0) { S.phase = 'live'; sfx.whistle(); banner('Go', '', '#3ef6ff'); }
    for (const o of strikers) { o.v.set(0, o.v.y, 0); stepStriker(o, 0, 0, dt); }
    return;
  }
  if (S.phase === 'live' && !S.golden) {
    S.clock -= dt;
    if (S.clock <= 0) {
      S.clock = 0;
      if (S.gy === S.gb) { S.golden = true; banner('Golden goal', 'Tied. Next goal wins.', '#ffc23a'); sfx.whistle(); }
      else { S.phase = 'end'; S.phaseT = 1.6; sfx.whistle(); banner('Full time', '', '#ffc23a'); }
    }
  }
  if (S.phase === 'goal') stepCelebration(dt);
  if (S.phase === 'goal' && S.phaseT <= 0) {
    if (S.golden || (S.clock <= 0 && S.gy !== S.gb)) { S.phase = 'end'; S.phaseT = .3; }
    else { kickoff(); return; }
  }
  if (S.phase === 'end') { stepCelebration(dt); if (S.phaseT <= 0) endMatch(); }
  // move
  const live = S.phase === 'live';
  const [ix, iz] = live ? (S.autoplay ? think(P, -1, dt) : playerInput()) : [0, 0];
  stepStriker(P, ix, iz, dt);
  const [bx, bz] = live ? think(B, 1, dt) : [0, 0];
  stepStriker(B, bx, bz, dt);
  strikersCollide();
  // ball
  threat = onTarget(1);
  stepBall(dt);
  if (ball.live) for (const o of strikers) hitBall(o);
  ball.heat = Math.max(0, ball.heat - dt * .9); ball.smashT -= dt;
  const sp = ball.v.length();
  if (ball.last === P && sp > S.fastest && ball.lastT < .3) S.fastest = sp;
  ball.lastT = (ball.lastT || 0) + dt;
  // goal?
  if (ball.live && Math.abs(ball.p.z) > L + BR * .95 && Math.abs(ball.p.x) < GW) scored(Math.sign(ball.p.z));
  wallSnd -= dt;
}

// ---------------------------------------------------------------- camera + render
let camYaw = Math.PI, snapCam = false;
const camPos = V(), camLook = V(), look = V(), shakeV = V(), celPos = V(), celLook = V();
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function keepInside(v) { // keep a camera point inside the arena; returns how far it was pushed
  let push = 0; const m = .5;
  for (const [nx, nz, d] of PLANES) { const pen = v.x * nx + v.z * nz - (d - m); if (pen > 0) { v.x -= nx * pen; v.z -= nz * pen; push += pen; } }
  for (const s of [-1, 1]) { const pen = s * v.z - (L - m); if (pen > 0) { v.z -= s * pen; push += pen; } }
  return push;
}
function cameraUpdate(dt, snap) {
  if (snapCam) { snap = true; snapCam = false; }
  const dx = ball.p.x - P.p.x, dz = ball.p.z - P.p.z, hd = Math.hypot(dx, dz);
  // ball cam: swing round so the ball is always in front of you. Slow the swing when
  // the ball is right on top of you so the view doesn't whip around.
  if (hd > 1.5) camYaw = angLerp(camYaw, Math.atan2(dx, dz), snap ? 1 : 1 - Math.exp(-lerp(1.2, 6.5, clamp((hd - 1.5) / 5, 0, 1)) * dt));
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
  const lift = clamp((ball.p.y - 3) * .3, 0, 3.5) + clamp((10 - hd) * .08, 0, .6);
  const want = tmp.set(P.p.x - fx * CFG.camDist - fz * CFG.camSide, CFG.camH + lift + P.p.y * .5, P.p.z - fz * CFG.camDist + fx * CFG.camSide);
  // keep the camera inside the arena (lift it up a bit when it gets pushed in by a wall)
  want.y += keepInside(want) * .6;
  // look between a point ahead of you and the ball, so both stay in frame
  look.set(P.p.x + fx * 4, 1.0 + P.p.y * .5, P.p.z + fz * 4).lerp(ball.p, .55);
  // after you score, swing round from your side toward the front to watch the celebration
  if (CEL.by === P && CEL.t >= 0) {
    const k = smooth(0, .8, CEL.t), a = Math.atan2(-P.p.x, CEL.goal * L - P.p.z) + Math.PI / 2 + CEL.t * .55; // start beside you (goal to one side), drift round to the front
    celPos.set(P.p.x + Math.sin(a) * 8, 3.4, P.p.z + Math.cos(a) * 8); keepInside(celPos);
    celLook.set(P.p.x, 2.4 + P.p.y * .5, P.p.z).lerp(tmp2.set(0, GH + 3, CEL.goal * L), .25);
    want.lerp(celPos, k); look.lerp(celLook, k);
  }
  if (snap) camPos.copy(want); else camPos.lerp(want, 1 - Math.exp(-12 * dt));
  if (snap) camLook.copy(look); else camLook.lerp(look, 1 - Math.exp(-14 * dt));
  S.shake = Math.max(0, S.shake - dt * 2.4);
  const sh = S.shake * S.shake * .35;
  shakeV.set(rnd(-sh, sh), rnd(-sh, sh), rnd(-sh, sh));
  camera.position.copy(camPos).add(shakeV);
  camera.lookAt(camLook);
}
const ballQ = new THREE.Quaternion(), qTmp = new THREE.Quaternion(), axis = V();
const camToBall = V();
function render(dt, t) {
  cameraUpdate(dt, false);
  // ball
  ball.mesh.position.copy(ball.p);
  const w = ball.spin.length();
  if (w > 1e-3) { axis.copy(ball.spin).divideScalar(w); qTmp.setFromAxisAngle(axis, w * dt); ballQ.premultiply(qTmp); ball.mesh.quaternion.copy(ballQ); }
  ballMat.emissiveIntensity = .75 + ball.heat * 2.2;
  ballMat.emissive.setRGB(1, lerp(.65, .95, ball.heat), lerp(.23, .8, ball.heat));
  ballGlow.position.copy(ball.p); ballGlow.material.opacity = ball.heat * .35; const gs = 3 + ball.heat * 2; ballGlow.scale.set(gs, gs, 1);
  ballMark.position.set(ball.p.x, .04, ball.p.z);
  const hgt = ball.p.y - BR, ms = 1 + clamp(hgt * .12, 0, 1.2); ballMark.scale.set(ms, ms, 1);
  ballMark.material.opacity = Math.abs(ball.p.z) > L ? 0 : clamp(.15 + hgt * .08, .15, .6);
  if (ball.heat > .5 && Math.random() < ball.heat * .5) burst(ball.p, 1, 0xffc23a, 1.5, -1, null, [.15, .35]);
  // strikers
  camToBall.copy(ball.p).sub(camera.position);
  const cbl = camToBall.length(); camToBall.divideScalar(cbl);
  for (const o of strikers) {
    const M = o.mesh;
    M.g.position.copy(o.p); M.g.rotation.y = o.yaw + (o.spinA || 0);
    o.squash = Math.max(0, o.squash - dt * 4); o.land = Math.max(0, o.land - dt * 5); o.hitFx = Math.max(0, o.hitFx - dt * 3);
    const sy = 1 + o.squash * .1 - o.land * .12, sxz = 1 / Math.sqrt(sy);
    M.lean.scale.set(sxz, sy, sxz);
    // lean into the run
    const lv = Math.cos(o.yaw) * o.v.z + Math.sin(o.yaw) * o.v.x;
    M.lean.rotation.x = lerp(M.lean.rotation.x, clamp(lv * .018, -.15, .22) - o.hitFx * .12, 1 - Math.exp(-10 * dt));
    // smash armed: gold glow; recharging: dim ring
    const armed = o.smash > 0 ? 1 : 0, ready = o.cool <= 0 ? 1 : 0;
    const cel = CEL.by === o ? .3 + .25 * Math.sin(t * 12) : 0;
    M.bodyMat.emissiveIntensity = lerp(M.bodyMat.emissiveIntensity, Math.max(armed * .45, cel), 1 - Math.exp(-20 * dt));
    M.halo.material.opacity = armed * .25;
    M.foot.position.set(o.p.x, .03, o.p.z);
    M.foot.material.opacity = (ready ? .4 : .12) + armed * .35;
    M.foot.material.color.set(armed ? 0xffc23a : o.col);
    const fs = 1 + armed * .25; M.foot.scale.set(fs, fs, 1);
    // fade the striker if it's hiding the ball from the camera
    let fade = 1;
    tmp.set(o.p.x - camera.position.x, 0, o.p.z - camera.position.z);
    for (let k = 0; k < 2; k++) {
      tmp.set(o.p.x - camera.position.x, o.p.y + (k ? 2.6 : 1.2) - camera.position.y, o.p.z - camera.position.z);
      const along = tmp.dot(camToBall);
      if (along > 0 && along < cbl - BR) { const perp = tmp.addScaledVector(camToBall, -along).length(); if (perp < CFG.R + BR * .45) fade = .38; }
    }
    if (CEL.by === o) fade = 1;
    o.fade = lerp(o.fade, fade, 1 - Math.exp(-14 * dt));
    M.bodyMat.opacity = M.baseMat.opacity = o.fade; M.glow.opacity = lerp(.3, 1, o.fade);
    M.bodyMat.depthWrite = M.baseMat.depthWrite = o.fade > .95;
  }
  // goals pulse after a score
  for (const g of goals) { g.flash = Math.max(0, g.flash - dt * .6); g.netMat.opacity = .28 + g.flash * .5; g.floorMat.emissiveIntensity = .15 + g.flash * 1.6 * (.6 + .4 * Math.sin(t * 20)); }
  sun.target.position.set(0, 0, 0);
  if (shockT < 1.2) { shockT += dt; const k = shockT / 1.2, sc = 1 + 14 * (1 - Math.pow(1 - k, 3)); shock.scale.set(sc, sc, 1); shock.material.opacity = .7 * (1 - k); }
  else shock.material.opacity = 0;
  stepParts(dt); stepPops(dt);
  if (rollGain) { const rolling = ball.p.y < BR + .05 ? clamp(Math.hypot(ball.v.x, ball.v.z) / 25, 0, 1) : 0; rollGain.gain.value = lerp(rollGain.gain.value, rolling * .25, .2); }
}

// ---------------------------------------------------------------- resize, warm-up & loop
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setPixelRatio(DPR_STEPS[dprIdx]); composer.setPixelRatio(DPR_STEPS[dprIdx]);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  // wide angle: aim for a fixed horizontal field of view so a narrow phone still sees enough
  camera.fov = clamp(2 * Math.atan(Math.tan(CFG.hfov / 2 * Math.PI / 180) / aspect) * 180 / Math.PI, 62, 96);
  camera.aspect = aspect; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
placeKickoff(); ball.p.y = BR;
cameraUpdate(1 / 60, true);
render(1 / 60, 0);
try { renderer.compile(scene, camera); } catch {}
composer.render();
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
const perf = { t: 0, n: 0 };
function watchPerf(dt) {
  if (navigator.webdriver) return;
  perf.t += dt; perf.n++;
  if (perf.t > 1.5) {
    const avg = perf.t / perf.n;
    if (avg > .024 && dprIdx < DPR_STEPS.length - 1) { dprIdx++; resize(); }
    else if (avg > .028 && dprIdx === DPR_STEPS.length - 1) bloom.enabled = false;
    perf.t = 0; perf.n = 0;
  }
}
let titleT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  let dt = Math.min(.05, raw);
  if (mode === 'play') {
    watchPerf(Math.min(raw, .1));
    if (S.hitstop > 0) { S.hitstop -= dt; dt *= .06; }
    if (S.slowT > 0) { S.slowT -= dt; dt *= lerp(1, S.slow, clamp(S.slowT / .3, 0, 1)); }
    acc += dt;
    let steps = 0;
    while (acc >= FIXED && steps < 8) { update(FIXED); acc -= FIXED; steps++; if (mode !== 'play') { acc = 0; break; } }
    if (steps >= 8) acc = 0;
    hud();
    render(dt, now / 1000);
  } else {
    // title / results: the ball and strikers idle while the camera drifts
    titleT += dt;
    acc += dt; let n = 0; while (acc >= FIXED && n++ < 8) { stepBall(FIXED); acc -= FIXED; }
    if (mode === 'title' && ball.p.y <= BR + .01 && Math.random() < .01) ball.v.set(rnd(-4, 4), rnd(8, 12), rnd(-4, 4));
    render(dt, now / 1000);
    if (mode === 'title') { camera.position.set(Math.sin(titleT * .12) * 9, 4.5, 10 + Math.cos(titleT * .12) * 4); camera.lookAt(0, 2, -2); }
  }
  composer.render();
}
requestAnimationFrame(frame);
window.__rebound = { S, P, B, ball, CFG, CEL, start, tap, update, think, camera, stick, cameraUpdate, scored, get mode() { return mode; } };
