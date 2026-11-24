// SUMMIT v8 "The Path" — a Sisyphus game for Bounce Lab.
// Sisyphus is bored. He rides a tracked lab crawler with a sledgehammer arm up an
// endless mountain road, hurling a giant boulder ahead and smashing it again when it
// rolls back. Treeline -> rock -> through the clouds -> snow -> sunrise.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BONES as BODY_BONES, BONE_NAMES as BODY_BONE_NAMES } from './sdfbody.mjs';

// ---------------------------------------------------------------- tuning
const CFG = {
  g: 28,
  ballR: 2.0, ballMass: 6, ballBounce: .22, ballRoll: .08,
  bodyR: 1.0, bodyH: 3.3,                       // Sisyphus as an upright capsule
  speed0: 5.2, speedStep: .42, speedMax: 10.5,  // the drive uphill, per stage
  steer: 14, steerMax: 13, dragGain: 1.3,
  chargeTime: .8,
  fwdMin: 12, fwdMax: 27, upMin: 8, upMax: 16,
  reach: 2.2, perfectGap: 1.0,
  hw: 6.5, ridgeHw: 5,
  stageLen: 190, campLen: 18, startFlat: 12,
  cloudY: 78,                                   // the cloud layer you climb through
};
const STAGES = [
  { name: 'The Foothills', note: 'Wind up, let go, smash it uphill.', deg: 8, rocks: .45, tumble: 0, gaps: 0, gates: 0, ridge: 0, tint: 0x3ef6ff },
  { name: 'The Switchback', note: 'Rockfall from the cliff. Dodge it.', deg: 10.5, rocks: .5, tumble: 1, gaps: 0, gates: 0, ridge: 0, tint: 0xffb43a },
  { name: 'The Crevasses', note: 'Smash it clean over the gaps.', deg: 12, rocks: .4, tumble: .45, gaps: 1, gates: 0, ridge: 0, tint: 0xff4fa0 },
  { name: 'The Clashing Rocks', note: 'Stone blocks grind across the road.', deg: 13.5, rocks: .35, tumble: .5, gaps: .35, gates: 1, ridge: 0, tint: 0x7dff6a },
  { name: 'The Ridge', note: 'Nothing on either side now.', deg: 14.5, rocks: .3, tumble: .4, gaps: .35, gates: .3, ridge: 1, tint: 0xa77bff },
];
function stageDef(k) {
  if (k < STAGES.length) return STAGES[k];
  const loop = k - STAGES.length, lap = Math.floor(loop / (STAGES.length - 1)) + 1;
  const b = STAGES[1 + (loop % (STAGES.length - 1))];
  return { ...b, name: b.name + ' ' + ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][Math.min(lap, 8)], deg: Math.min(23, b.deg + 2.4 * lap),
    rocks: Math.min(.8, b.rocks + .1 * lap), tumble: Math.min(1.5, b.tumble + .4 * lap), gaps: Math.min(1, b.gaps + .3 * lap),
    gates: Math.min(1, b.gates + .25 * lap), mixed: true };
}

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- the mountain road
// d = distance up the road (d = -z). xc(d) = road centre line. H(d) = road height.
// G(d, x) = ground height anywhere: the road, a cliff on one side, a drop on the other.
const stageAt = d => d < 0 ? 0 : Math.floor(d / CFG.stageLen);
const xc = d => (4.5 * Math.sin(d * .04) + 2.5 * Math.sin(d * .017 + 1)) * smooth(10, 60, d);
const xcp = d => (xc(d + .5) - xc(d - .5));
const gapCache = new Map();
function gapsFor(k) {
  if (k < 0) return [];
  if (gapCache.has(k)) return gapCache.get(k);
  const st = stageDef(k), out = [], L = CFG.stageLen;
  if (st.gaps > 0) {
    const R = mulberry(k * 104729 + 7), base = k * L;
    let d = base + (k === 0 ? 40 : CFG.campLen + 22);
    while (d < base + L - 30) {
      if (R() < st.gaps) {
        const w = Math.min(7.5, 3.5 + Math.min(k, 8) * .35 + R() * 1.6);
        const hw = st.ridge ? CFG.ridgeHw : CFG.hw, side = R() < .5 ? -1 : 1;
        // each gap gets ONE helper: a marble bridge along one edge (b0..b1), or a rock launch ramp (r0..r1). Offsets from the road centre.
        const gp = { d0: d, d1: d + w, b0: 0, b1: 0, r0: 0, r1: 0 };
        if (R() < .5) { const b = [side * (hw - 4.6), side * hw]; gp.b0 = Math.min(...b); gp.b1 = Math.max(...b); }
        else { const rw = Math.min(7, hw * 2 - 2.5), c = (R() * 2 - 1) * (hw - rw / 2 - .4); gp.r0 = c - rw / 2; gp.r1 = c + rw / 2; }
        out.push(gp);
        d += w + 30 + R() * 14;
      } else d += 18 + R() * 12;
    }
  }
  gapCache.set(k, out); return out;
}
const RAMP_L = 7, RAMP_H = 2.4;
const onBridge = (g, off) => off > g.b0 + .1 && off < g.b1 - .1;
const bridgeY = (g, d, x) => lerp(G(g.d0, x), G(g.d1, x), clamp((d - g.d0) / (g.d1 - g.d0), 0, 1)) + .14;
function openGap(d, x) { const g = inGap(d); return g && !onBridge(g, x - xc(d)) ? g : null; }
function rampAt(d, off) {
  for (const k of new Set([stageAt(d), stageAt(d + RAMP_L)])) for (const g of gapsFor(k))
    if (d > g.d0 - RAMP_L && d < g.d0 && off > g.r0 && off < g.r1) return g;
  return null;
}
function inGap(d) { for (const g of gapsFor(stageAt(d))) if (d > g.d0 && d < g.d1) return g; return null; }
function nearGap(d, m) { for (const k of new Set([stageAt(d - m), stageAt(d + m)])) for (const g of gapsFor(k)) if (d > g.d0 - m && d < g.d1 + m) return true; return false; }
function slopeDeg(d) {
  const { stageLen: L, campLen: C, startFlat } = CFG;
  if (d < startFlat) return d < -20 ? 7 : 0;
  const k = Math.floor(d / L), local = d - k * L;
  if (k >= 1 && local < C) return 0;
  const st = stageDef(k), start = k === 0 ? startFlat : C;
  let ledge = 1;
  for (const g of gapsFor(k)) if (d > g.d1 - 1 && d < g.d1 + 15) ledge = Math.min(ledge, .15 + .85 * smooth(g.d1 + 8, g.d1 + 15, d));
  return st.deg * smooth(start, start + 14, local) * ledge * (1 + .16 * Math.sin(d * .045));
}
const STEP = .5, D0 = -100, Harr = [0];
let Hmax = D0;
function ensureH(d) {
  while (Hmax < d + 2) {
    const i = Harr.length - 1, dm = D0 + i * STEP + STEP / 2;
    Harr.push(Harr[i] + Math.tan(slopeDeg(dm) * Math.PI / 180) * STEP);
    Hmax = D0 + (Harr.length - 1) * STEP;
  }
}
function H(d) {
  if (d <= D0) return Harr[0] - (D0 - d) * .12;
  ensureH(d);
  const f = (d - D0) / STEP, i = Math.floor(f), t = f - i;
  return Harr[i] + (Harr[i + 1] - Harr[i]) * t;
}
const Hp = d => (H(d + .25) - H(d - .25)) / .5;
function ridgeAmt(d) {
  const k = stageAt(d), local = d - k * CFG.stageLen;
  return stageDef(k).ridge ? smooth(CFG.campLen, CFG.campLen + 12, local) : 0;
}
const hwAt = d => lerp(CFG.hw, CFG.ridgeHw, ridgeAmt(d));
// the cliff is always on the left and the open drop on the right, so the view keeps opening up as you climb
function cliffSide(d) { return -1; }
function stairs(x, p) { const k = x / p, f = Math.floor(k); return (f + smooth(.3, .72, k - f)) * p; }
function cliffY(u, d) { // a stepped rock face with ledges
  const n = Math.sin(d * .13 + u * .4) * .6 + Math.sin(d * .041 - u * .23) * 1.6;
  if (u < 1.6) return .45 * u * u + n * smooth(0, 1.6, u) * .2;
  // a stepped rock face for the first ~25 m, then it rolls back into the mountainside so you see sky above it
  const uu = u - 1.6 + Math.sin(d * .09) * .7, face = 3.1 * stairs(Math.min(uu, 8.5), 2.7);
  return 1.15 + face + Math.max(0, uu - 8.5) * (1.1 - .012 * Math.max(0, uu - 8.5)) + n * smooth(1.6, 5, u);
}
function dropY(u, d) { // a rocky berm at the edge, then a long fall
  const n = Math.sin(d * .19 + u * .5) * .22;
  if (u < 1.8) return .8 * Math.sin(Math.PI * u / 1.8) + n;
  const x = u - 1.8;
  return -(x * 1.7 + x * x * .085) + Math.sin(d * .07 + u * .2) * 1.3 * smooth(0, 4, x);
}
function sideY(u, d, s) {
  const w = (1 + s * cliffSide(d)) / 2;
  const base = w >= .999 ? cliffY(u, d) : w <= .001 ? dropY(u, d) : lerp(dropY(u, d), cliffY(u, d), w);
  const r = ridgeAmt(d);
  return r > 0 ? lerp(base, dropY(u, d) * 1.25 - .25 * u, r) : base;
}
function G(d, x) {
  const h = H(d), off = x - xc(d), hw = hwAt(d), u = Math.abs(off) - hw, r = ridgeAmt(d), bk = lerp(.012, .045, r);
  const camber = .045 * (1 - r) * clamp(off, -hw, hw);   // the road leans gently into the cliff, away from the drop
  if (u <= 0) return h + bk * off * off + camber;
  return h + bk * hw * hw + camber + sideY(u, d, off < 0 ? -1 : 1);
}
const Gx = (d, x) => (G(d, x + .1) - G(d, x - .1)) / .2;
const Gd = (d, x) => (G(d + .1, x) - G(d - .1, x)) / .2;

// ---------------------------------------------------------------- renderer + scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR_STEPS = [2, 1.6, 1.3, 1];
let dprIdx = DPR_STEPS.findIndex(v => v <= Math.min(window.devicePixelRatio || 1, 2)); if (dprIdx < 0) dprIdx = DPR_STEPS.length - 1;
renderer.setPixelRatio(DPR_STEPS[dprIdx]);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x141a26, 30, 170);
const camera = new THREE.PerspectiveCamera(70, 1, .1, 5000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = .3;
// one fixed set of lights for the whole game: adding or removing lights mid-game makes
// every shader rebuild at once, which is what caused the v2 freezes
const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x2a2520, .8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xdfe8ff, 2.1);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 160 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = .05;
scene.add(sun); scene.add(sun.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .4, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function noiseCanvas(size, fn, h = size) { const c = document.createElement('canvas'); c.width = size; c.height = h; fn(c.getContext('2d'), size, h); return c; }
function rockCanvas(size = 512) {
  return noiseCanvas(size, (x, s) => {
    const img = x.createImageData(s, s);
    for (let i = 0; i < s * s; i++) { const n = 150 + (Math.random() - .5) * 60; img.data[i * 4] = n; img.data[i * 4 + 1] = n; img.data[i * 4 + 2] = n; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) { const r = rnd(4, 60) * (Math.random() < .2 ? 1.6 : 1), dark = Math.random() < .55; x.fillStyle = `rgba(${dark ? '20,20,20' : '255,255,255'},${rnd(.04, .14)})`; x.beginPath(); x.ellipse(rnd(0, s), rnd(0, s), r, r * rnd(.4, 1), rnd(0, 3), 0, 7); x.fill(); }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '40,38,36' : '210,205,200'},${rnd(.2, .5)})`; const r = rnd(.8, 3); x.beginPath(); x.arc(rnd(0, s), rnd(0, s), r, 0, 7); x.fill(); }
    x.strokeStyle = 'rgba(15,15,15,.28)';
    for (let i = 0; i < 50; i++) { x.lineWidth = rnd(.5, 2); x.beginPath(); let px = rnd(0, s), py = rnd(0, s); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-30, 30); py += rnd(-6, 6); x.lineTo(px, py); } x.stroke(); }
  });
}
function steelCanvas(size = 256) {
  return noiseCanvas(size, (x, s) => {
    x.fillStyle = '#8a929c'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { const y = rnd(0, s); x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${rnd(.02, .07)})`; x.fillRect(0, y, s, rnd(.5, 1.5)); }
    x.fillStyle = 'rgba(0,0,0,.55)';
    for (const y of [s * .25, s * .5, s * .75]) x.fillRect(0, y, s, 2);
    for (let i = 0; i < 4; i++) x.fillRect(i * s / 4, 0, 2, s);
    for (const y of [s * .25, s * .5, s * .75]) for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,.6)'; x.beginPath(); x.arc(i * s / 8 + s / 16, y + 7, 2.4, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(i * s / 8 + s / 16 - .6, y + 6.4, 1, 0, 7); x.fill(); }
  });
}
function concreteCanvas(size = 256) {
  return noiseCanvas(size, (x, s) => {
    const img = x.createImageData(s, s);
    for (let i = 0; i < s * s; i++) { const n = 120 + (Math.random() - .5) * 26; img.data[i * 4] = n; img.data[i * 4 + 1] = n; img.data[i * 4 + 2] = n + 3; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.03, .07)})`; x.beginPath(); x.arc(rnd(0, s), rnd(0, s), rnd(10, 50), 0, 7); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, s / 2, s, 2); x.fillRect(s / 2, 0, 2, s);
    for (const [a, b] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) { x.fillStyle = 'rgba(0,0,0,.6)'; x.beginPath(); x.arc(a * s, b * s, 4, 0, 7); x.fill(); }
  });
}
const tex = (c, rep = 1, srgb = true) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
const rockC = rockCanvas(512);
const groundMap = tex(rockC), groundBump = tex(rockC, 1, false);
const steelMap = tex(steelCanvas(256)), concreteMap = tex(concreteCanvas(256));
const hazardTex = tex(noiseCanvas(128, (x, s) => { x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, s, s); x.fillStyle = '#e7b52c'; for (let i = -s; i < s * 2; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 16 - s, s); x.lineTo(i - s, s); x.fill(); } }));
// ---- the old works on the mountain: weathered marble, worn grey stone, bronze, firelight
const stoneC = noiseCanvas(256, (x, s) => {
  x.fillStyle = '#cdc4b4'; x.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '96,88,78' : '255,250,240'},${rnd(.03, .09)})`; x.beginPath(); x.arc(rnd(0, s), rnd(0, s), rnd(8, 46), 0, 7); x.fill(); }
  for (let i = 0; i < 12; i++) {
    x.strokeStyle = `rgba(110,100,90,${rnd(.12, .3)})`; x.lineWidth = rnd(.5, 1.6);
    x.beginPath(); let px = rnd(0, s), py = rnd(0, s); x.moveTo(px, py); for (let k = 0; k < 9; k++) { px += rnd(-30, 30); py += rnd(-20, 20); x.lineTo(px, py); } x.stroke();
  }
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(64,56,46,${rnd(.03, .09)})`; x.fillRect(rnd(0, s), rnd(-20, s), rnd(1, 4), rnd(20, 90)); } // rain streaks
  for (let i = 0; i < 2200; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '60,55,50' : '255,255,255'},${rnd(.04, .14)})`; x.fillRect(rnd(0, s), rnd(0, s), rnd(1, 2.5), rnd(1, 2.5)); }
  for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(70,80,52,${rnd(.08, .2)})`; x.beginPath(); x.arc(rnd(0, s), rnd(0, s), rnd(2, 9), 0, 7); x.fill(); } // lichen
});
const stoneMap = tex(stoneC), stoneBump = tex(stoneC, 1, false);
const flameTex = tex(noiseCanvas(64, (x, s, h) => {
  const g = x.createRadialGradient(s / 2, h * .72, 1, s / 2, h * .6, s * .5);
  g.addColorStop(0, 'rgba(255,250,215,1)'); g.addColorStop(.25, 'rgba(255,196,90,.95)'); g.addColorStop(.55, 'rgba(255,110,30,.5)'); g.addColorStop(1, 'rgba(160,30,0,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(s / 2, 0); x.bezierCurveTo(s * .95, h * .45, s * .95, h, s / 2, h); x.bezierCurveTo(s * .05, h, s * .05, h * .45, s / 2, 0); x.fill();
}, 128), 1);
flameTex.wrapS = flameTex.wrapT = THREE.ClampToEdgeWrapping;
const treadTex = tex(noiseCanvas(64, (x, s) => { x.fillStyle = '#16181b'; x.fillRect(0, 0, s, s); x.fillStyle = '#2d3035'; for (let i = 0; i < s; i += 16) x.fillRect(0, i, s, 8); x.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < s; i += 16) x.fillRect(0, i, s, 1); }));

// ---------------------------------------------------------------- sky: night at the bottom, sunrise at the top
const skyUni = {
  top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunCol: { value: new THREE.Color(1, .6, .3) },
  sunDir: { value: new THREE.Vector3(-.35, .05, -1).normalize() }, dawn: { value: 0 },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(3600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform vec3 top, horizon, sunCol, sunDir; uniform float dawn; varying vec3 vP;
    void main(){ float h = vP.y; vec3 c = mix(horizon, top, smoothstep(-0.05,0.55,h));
      float s = max(dot(vP, sunDir), 0.0);
      c += sunCol * (pow(s, 6.0) * 0.55 + pow(s, 120.0) * 2.0) * dawn;
      c = mix(c, horizon * 0.6, smoothstep(0.0,-0.35,h)); gl_FragColor = vec4(c,1.); }`,
}));
sky.frustumCulled = false; sky.renderOrder = -10;
const skyGroup = new THREE.Group(); skyGroup.add(sky); scene.add(skyGroup);
const stars = (() => {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 2800, s = Math.sqrt(1 - u * u); pos[i * 3] = r * s * Math.cos(a); pos[i * 3 + 1] = Math.abs(r * u) * .9 + 60; pos[i * 3 + 2] = r * s * Math.sin(a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .8, depthWrite: false }));
  p.frustumCulled = false; skyGroup.add(p); return p;
})();
const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd9a0, fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sunDisc.scale.set(420, 420, 1); skyGroup.add(sunDisc);

// ---- the distant world is anchored in height: you climb past the lower ranges, never reach the summit
const far = new THREE.Group(); scene.add(far);
const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false });
function rangeRing(radius, n, hMin, hMax, base, seed, col, colHi) {
  const R = mulberry(seed), pos = [], cols = [], idx = [];
  const c0 = new THREE.Color(col), c1 = new THREE.Color(colHi), snow = new THREE.Color(0xcfd7e3), tc = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const a = i / n * Math.PI * 2;
    const peak = i % 2 === 0 ? hMin + Math.pow(R(), 1.5) * (hMax - hMin) : hMin * .6 + R() * (hMax - hMin) * .3;
    const rr = radius * (1 + (R() - .5) * .12);
    for (const [r, y] of [[radius * 1.25, base], [rr, base + peak * .45], [rr * .97, base + peak]]) {
      pos.push(Math.sin(a) * r, y, -Math.cos(a) * r);
      const sn = smooth(.55, .9, (y - base) / Math.max(1, hMax)) * (y - base > 60 ? 1 : 0);
      tc.copy(c0).lerp(c1, (y - base) / (hMax + 1)).lerp(snow, sn * .85); cols.push(tc.r, tc.g, tc.b);
    }
    if (i < n) { const a0 = i * 3, a1 = (i + 1) * 3; for (let k = 0; k < 2; k++) idx.push(a0 + k, a1 + k, a0 + k + 1, a0 + k + 1, a1 + k, a1 + k + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, farMat); m.frustumCulled = false; return m;
}
far.add(rangeRing(700, 70, 40, 170, -120, 11, 0x1a1d22, 0x2a2e36));
far.add(rangeRing(1300, 90, 120, 330, -160, 23, 0x161a22, 0x2a3140));
// The mountain you are on. A long ridge starts just ahead of you (its foot always level with where you
// are) and climbs all the way to the summit, so the peak reads as the top of YOUR mountain, not an island
// across the cloud sea. Lower slopes sink into haze and cloud; the high ridge and the peak stand clear.
const summit = (() => {
  const A = [-30, -330], B = [-160, -2500], PEAK = 1380, X0 = -1700, X1 = 1300, Z0 = -3500, Z1 = -260, NX = 120, NZ = 150;
  const abx = B[0] - A[0], abz = B[1] - A[1], L2 = abx * abx + abz * abz;
  const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
  const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return lerp(lerp(hash(i, j), hash(i + 1, j), su), lerp(hash(i, j + 1), hash(i + 1, j + 1), su), sv); };
  const ridged = (x, z) => { let a = 0, amp = 1, f = 1; for (let o = 0; o < 5; o++) { a += (1 - Math.abs(vn(x * f, z * f) * 2 - 1)) * amp; amp *= .5; f *= 2.03; } return a / 1.94; };
  const shape = (x, z) => { // returns [height without your altitude, how much of your altitude to add]
    const t = clamp(((x - A[0]) * abx + (z - A[1]) * abz) / L2, 0, 1), px = A[0] + abx * t, pz = A[1] + abz * t;
    const e = Math.hypot(x - px, z - pz), f = Math.pow(t, 2.3), w = lerp(.9, 2.2, Math.sqrt(t));
    let y = -10 * (1 - f) + PEAK * f - (e / w) * .75 - (e / w) * (e / w) / 900;
    y += (ridged(x / 240, z / 240) - .55) * lerp(50, 210, t) * smooth(0, 120, e + 60);                   // buttresses and gullies
    y += 170 * Math.exp(-((x - B[0] - 70) ** 2 + (z - B[1] + 40) ** 2) / (150 * 150));                   // the horn of the summit
    return [Math.max(y, -420), 1 - f];
  };
  const pos = [], aw = [], cols = [], idx = [], tc = new THREE.Color(), lo = new THREE.Color(0x14171d), mid = new THREE.Color(0x30353e), hi = new THREE.Color(0xa6afbd);
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const x = X0 + (X1 - X0) * i / NX, z = Z0 + (Z1 - Z0) * Math.pow(j / NZ, .8);
    const [y, w] = shape(x, z), yw = y + 150 * w;                       // colour as if you were ~180 m up
    pos.push(x, y, z); aw.push(w);
    const snow = smooth(520, 860, yw + (ridged(x / 90, z / 90) - .5) * 160), rock = smooth(-100, 300, yw);
    tc.copy(lo).lerp(mid, rock).lerp(hi, snow * .9); cols.push(tc.r, tc.g, tc.b);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('aw', new THREE.Float32BufferAttribute(aw, 1)); g.setIndex(idx); g.computeVertexNormals();
  const uni = { uAlt: { value: 0 }, hazeCol: { value: new THREE.Color() }, hazeMin: { value: 0 } };
  const ridgeMat = (hazeK, extra) => { const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, ...extra }); m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = 'attribute float aw; uniform float uAlt; varying float vHaze;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      transformed.y += uAlt * aw;
      float hd = length(position.xz);
      vHaze = max(.14 + .3 * smoothstep(600., 3400., hd), (1. - smoothstep(uAlt - 40., uAlt + 380., transformed.y)) * .74);`);
    sh.fragmentShader = 'uniform vec3 hazeCol; uniform float hazeMin; varying float vHaze;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      `gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, max(vHaze * ${hazeK.toFixed(2)}, hazeMin));\n#include <dithering_fragment>`);
  }; return m; };
  const mat = ridgeMat(1, {});
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; far.add(m); m.userData.uni = uni;
  { // the old stone path: it carries on from the end of your road and switchbacks up the ridge to the summit
    const pts = [], ax = abx / Math.sqrt(L2), az = abz / Math.sqrt(L2), nx = -az, nz = ax, N = 900;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 2.2 * t + 3.8 * t * t;                             // legs get shorter as it steepens (7 switchbacks in all)
      const leg = Math.floor(u), f = u - leg, sgn = leg % 2 ? -1 : 1, tri = sgn * (1 - 2 * f) * -1;   // zig-zag from side to side
      const amp = lerp(40, 120, t) * (.7 + .5 * lerp(hash(leg, 3), hash(leg + 1, 3), f)) * smooth(0, .04, t) * (1 - smooth(.9, 1, t)) + 12 * Math.sin(t * 61);
      const cx = A[0] + abx * t + nx * tri * amp, cz = A[1] + abz * t + nz * tri * amp;
      pts.push([cx, cz]);
    }
    const pos = [], aw = [], cols = [], idx = [], pc = new THREE.Color(0x9a8b74);
    pts.forEach(([x, z], i) => {
      const [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(N, i + 1)], dl = Math.hypot(x1 - x0, z1 - z0) || 1;
      const ox = -(z1 - z0) / dl, oz = (x1 - x0) / dl, hw = lerp(4, 9, i / N);
      for (const sd of [-1, 1]) { const vx = x + ox * hw * sd, vz = z + oz * hw * sd, [y, w] = shape(vx, vz); pos.push(vx, y + 2.5, vz); aw.push(w); cols.push(pc.r, pc.g, pc.b); }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    pg.setAttribute('aw', new THREE.Float32BufferAttribute(aw, 1)); pg.setIndex(idx);
    const path = new THREE.Mesh(pg, ridgeMat(.55, { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    path.frustumCulled = false; far.add(path); m.userData.path = path;
  }
  const top = shape(B[0] + 70, B[1] - 40)[0];
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, .55, .25).multiplyScalar(2.2), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.scale.set(40, 40, 1); beacon.position.set(B[0] + 70, top + 14, B[1] - 40); m.add(beacon); m.userData.beacon = beacon;
  return m;
})();
// a village far down in the valley: warm firelight that shrinks away as you climb
{
  const n = 170, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), R = mulberry(5), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const cl = R() < .7, cx = cl ? 260 : 480, cz = cl ? 120 : -260, sp = cl ? 120 : 220;
    pos[i * 3] = cx + (R() - .5) * sp * 2; pos[i * 3 + 1] = -128 + R() * 4; pos[i * 3 + 2] = cz + (R() - .5) * sp * 2;
    c.set(R() < .7 ? 0xffb066 : 0xff8a3a).multiplyScalar(.5 + R() * .5); col.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const town = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  town.frustumCulled = false; scene.add(town);
}
// the cloud sea: only visible from above (from below you just see sky), thick fog while you climb through it
const cloudTex = (() => {
  const c = noiseCanvas(512, (x, s) => {
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 380; i++) {
      const px = rnd(0, s), py = rnd(0, s), r = rnd(14, 70);
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
        const a = rnd(.08, .22); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.beginPath(); x.arc(px + ox, py + oy, r, 0, 7); x.fill();
      }
    }
  });
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 5); return t;
})();
const clouds = [0, 7].map((dy, i) => {
  const map = i ? cloudTex.clone() : cloudTex; if (i) { map.needsUpdate = true; map.repeat.set(9, 9); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshBasicMaterial({ map, color: 0xdfe6f0, transparent: true, opacity: i ? .5 : .85, depthWrite: false, fog: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = CFG.cloudY + dy; m.frustumCulled = false; scene.add(m); return m;
});

// ---------------------------------------------------------------- terrain
// natural ground: layered noise for dirt and rock, shaded pebbles and grit, a few cracks, plus a matching normal map
function groundTextures(S = 512) {
  const R = mulberry(9), lat = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = R(); return a; };
  const noise = (n) => { // tileable value noise sampled at S x S
    const L = lat(n), out = new Float32Array(S * S), f = n / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x * f, gy = y * f, ix = Math.floor(gx), iy = Math.floor(gy), tx = gx - ix, ty = gy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), x1 = (ix + 1) % n, y1 = (iy + 1) % n;
      const a = L[ix + iy * n], b = L[x1 + iy * n], c = L[ix + y1 * n], d = L[x1 + y1 * n];
      out[x + y * S] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
    return out;
  };
  const o1 = noise(4), o2 = noise(8), o3 = noise(16), o4 = noise(32), o5 = noise(64), o6 = noise(128);
  const hgt = new Float32Array(S * S), col = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const f = o1[i] * .35 + o2[i] * .25 + o3[i] * .17 + o4[i] * .11 + o5[i] * .07 + o6[i] * .05;
    hgt[i] = f * .7; col[i] = .52 + (f - .5) * .55 + (o5[i] - .5) * .12;
  }
  // pebbles and grit: little domes, each a slightly different shade
  const stamp = (cx, cy, r, h, tone) => {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d2 = x * x + y * y; if (d2 > r2) continue;
      const px = ((cx + x) % S + S) % S, py = ((cy + y) % S + S) % S, i = px + py * S, k = 1 - d2 / r2;
      hgt[i] = Math.max(hgt[i], hgt[i] * .5 + Math.sqrt(k) * h);
      col[i] = col[i] * (1 - k * .8) + tone * k * .8;
    }
  };
  for (let i = 0; i < 700; i++) { const r = 2 + Math.floor(R() * R() * 8); stamp(Math.floor(R() * S), Math.floor(R() * S), r, .22 + r * .025, .5 + R() * .3); }
  for (let i = 0; i < 4000; i++) stamp(Math.floor(R() * S), Math.floor(R() * S), 1, .1, .45 + R() * .3);
  // a few hairline cracks
  for (let k = 0; k < 14; k++) {
    let x = R() * S, y = R() * S, a = R() * 6.28;
    for (let s = 0; s < 70; s++) { a += (R() - .5) * .7; x += Math.cos(a) * 2; y += Math.sin(a) * 2; const i = (((x | 0) % S + S) % S) + (((y | 0) % S + S) % S) * S; hgt[i] -= .12; col[i] *= .7; }
  }
  const c1 = document.createElement('canvas'), c2 = document.createElement('canvas'); c1.width = c1.height = c2.width = c2.height = S;
  const x1 = c1.getContext('2d'), x2 = c2.getContext('2d'), im1 = x1.createImageData(S, S), im2 = x2.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = x + y * S, l = hgt[((x - 1 + S) % S) + y * S], r = hgt[((x + 1) % S) + y * S], u = hgt[x + ((y - 1 + S) % S) * S], d = hgt[x + ((y + 1) % S) * S];
    const nx = (l - r) * 6, ny = (d - u) * 6, nz = 1, nl = Math.hypot(nx, ny, nz);
    const ao = clamp(.75 + hgt[i] * .6, .5, 1.1), v = clamp(col[i] * ao, 0, 1) * 255;
    im1.data.set([v * 1.02, v, v * .96, 255], i * 4);
    im2.data.set([(nx / nl * .5 + .5) * 255, (ny / nl * .5 + .5) * 255, (nz / nl * .5 + .5) * 255, 255], i * 4);
  }
  x1.putImageData(im1, 0, 0); x2.putImageData(im2, 0, 0);
  const map = tex(c1), nmap = tex(c2, 1, false);
  return { map, nmap };
}
const GT = groundTextures();
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: GT.map, normalMap: GT.nmap, normalScale: new THREE.Vector2(1.3, 1.3), roughness: .95, metalness: 0 });
groundMat.map.repeat.set(1 / 5, 1 / 5); groundMat.normalMap.repeat.set(1 / 5, 1 / 5);
const crevMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 1, side: THREE.DoubleSide });
const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .5, .25).multiplyScalar(1.15) });
const abyssMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(.55, .62, .75).multiplyScalar(.1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const decoRockMat = new THREE.MeshStandardMaterial({ color: 0x77787c, map: groundMap, bumpMap: groundBump, bumpScale: 1.2, roughness: .95, flatShading: true });
const pineMat = new THREE.MeshStandardMaterial({ color: 0x223024, roughness: .95, flatShading: true });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 1 });
const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: .6 });
const marbleStoneMat = new THREE.MeshStandardMaterial({ color: 0xe6ded0, map: stoneMap, bumpMap: stoneBump, bumpScale: .9, roughness: .74 });
const oldStoneMat = new THREE.MeshStandardMaterial({ color: 0x9c958b, map: stoneMap, bumpMap: stoneBump, bumpScale: 1.4, roughness: .92 });
const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb98042, metalness: .9, roughness: .4, envMapIntensity: 1.4 });
const rampRockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, map: groundMap, bumpMap: groundBump, bumpScale: 1.4, roughness: .95, flatShading: true, side: THREE.DoubleSide });
const flameMats = [0, 1].map(i => new THREE.SpriteMaterial({ map: flameTex, color: i ? 0xff7a2a : 0xffd28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
const fireGlowMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, .45, .15).multiplyScalar(.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function rockGeo(r, R) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, .8 + R() * .36);
    const f = map.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .85, p.getZ(i) * f);
  }
  g.computeVertexNormals(); return g;
}
// shared shapes, reused everywhere (never rebuilt per object, never disposed)
const ROCKS = (() => { const R = mulberry(77), out = []; for (let i = 0; i < 8; i++) out.push(rockGeo(1, R)); return out; })();
const PINE = [new THREE.ConeGeometry(1, 2.4, 7), new THREE.ConeGeometry(.75, 1.8, 7), new THREE.CylinderGeometry(.12, .16, 1, 5)];
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
// a Doric column shaft (radius .55, 7.6 tall) with 20 flutes and a slight taper
const COL_SHAFT = (() => {
  const g = new THREE.CylinderGeometry(.5, .56, 7.6, 120, 6), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const r = Math.hypot(v.x, v.z); if (r < .01) continue;
    const a = Math.atan2(v.z, v.x), f = 1 - .07 * Math.pow(.5 + .5 * Math.cos(a * 20), 1.5);
    p.setXYZ(i, v.x * f, v.y, v.z * f);
  }
  g.computeVertexNormals(); return g;
})();
const COL_CAP = new THREE.CylinderGeometry(.78, .5, .42, 32);
// a block of rough-dressed stone: a box with chipped, uneven faces (unit size, scale it)
const BLOCK_GEO = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1, 8, 6, 3), p = g.attributes.position, R = mulberry(41), m = new Map(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const k = v.toArray().map(n => n.toFixed(3)).join();
    if (!m.has(k)) m.set(k, [R() - .5, R() - .5, R() - .5]);
    const o = m.get(k), edge = (Math.abs(v.x) > .49) + (Math.abs(v.y) > .49) + (Math.abs(v.z) > .49);
    const f = edge >= 2 ? .05 : .018; p.setXYZ(i, v.x * (1 - (edge >= 2 ? .03 : 0)) + o[0] * f, v.y + o[1] * f, v.z + o[2] * f);
  }
  g.computeVertexNormals(); return g;
})();
const SHARED_GEOS = new Set([...ROCKS, ...PINE, UNIT_BOX, COL_SHAFT, COL_CAP, BLOCK_GEO]);
const flames = [];
// a bronze fire-bowl on a stone pedestal; the flames flicker (sprites only: no new lights, ever)
function brazier(scale = 1) {
  const b = new THREE.Group();
  const ped = new THREE.Mesh(BLOCK_GEO, oldStoneMat); ped.scale.set(.8, 1.1, .8); ped.position.y = .55; ped.castShadow = true; b.add(ped);
  const bowl = new THREE.Mesh(COL_CAP, bronzeMat); bowl.scale.set(.8, .9, .8); bowl.position.y = 1.3; b.add(bowl);
  const f = new THREE.Group(); f.position.y = 1.45; b.add(f);
  const s0 = new THREE.Sprite(flameMats[1]); s0.scale.set(1.3, 2.1, 1); s0.position.y = .8; f.add(s0);
  const s1 = new THREE.Sprite(flameMats[0]); s1.scale.set(.8, 1.4, 1); s1.position.y = .55; f.add(s1);
  const gl = new THREE.Sprite(fireGlowMat); gl.scale.setScalar(4.5); gl.position.y = .5; f.add(gl);
  f.userData = { s0, s1, ph: Math.random() * 9 }; flames.push(f);
  b.scale.setScalar(scale); return b;
}
function cairn(x, y, z, R) {
  const c = new THREE.Group(); let h = 0;
  for (const r of [.55, .42, .32, .2]) { const m = new THREE.Mesh(ROCKS[(R() * 8) | 0], decoRockMat); m.scale.set(r, r * .55, r); h += r * .45; m.position.y = h; h += r * .3; m.rotation.y = R() * 6; c.add(m); }
  c.position.set(x, y, z); return c;
}
const ROMAN = n => { let o = ''; for (const [v, r] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { o += r; n -= v; } return o; };
function pine(h) {
  const t = new THREE.Group();
  const a = new THREE.Mesh(PINE[0], pineMat); a.position.y = 1.6; t.add(a);
  const b = new THREE.Mesh(PINE[1], pineMat); b.position.y = 2.7; t.add(b);
  const c = new THREE.Mesh(PINE[2], trunkMat); c.position.y = .5; t.add(c);
  a.castShadow = true; t.scale.setScalar(h); return t;
}
const OFFS = [-1, -.75, -.5, -.25, 0, .25, .5, .75, 1];
const SIDE_U = [.45, .9, 1.35, 1.8, 2.4, 3.1, 3.8, 4.5, 5.3, 6.1, 6.9, 7.8, 8.8, 9.9, 11.2, 12.6, 14.3, 16.3, 18.8, 22, 26, 31, 38, 48];
const C_ROAD = new THREE.Color(0x8a7f70), C_ROCK1 = new THREE.Color(0x5b5d63), C_ROCK2 = new THREE.Color(0x76706a), C_GRASS = new THREE.Color(0x4f5a36),
  C_SNOW = new THREE.Color(0xe3e9f1), C_DIRT = new THREE.Color(0x6a5a48);
const grassAt = y => 1 - smooth(35, 95, y);
const snowAt = y => smooth(95, 200, y);
function rowPoints(d) {
  const c = xc(d), hw = hwAt(d), xs = [];
  for (let i = SIDE_U.length - 1; i >= 0; i--) xs.push(c - hw - SIDE_U[i]);
  for (const f of OFFS) xs.push(c + f * hw);
  for (const u of SIDE_U) xs.push(c + hw + u);
  return xs;
}
const CH = 20, chunks = new Map(), blinkers = [];
const tmpC = new THREE.Color();
function buildChunk(c) {
  const grp = new THREE.Group(), a = c * CH, b = a + CH;
  let pieces = [[a, b]];
  const near = [...new Set([stageAt(a), stageAt(b)])].flatMap(gapsFor);
  for (const g of near) {
    const next = [];
    for (const [p0, p1] of pieces) {
      if (g.d1 <= p0 || g.d0 >= p1) { next.push([p0, p1]); continue; }
      if (g.d0 > p0) next.push([p0, g.d0]);
      if (g.d1 < p1) next.push([g.d1, p1]);
    }
    pieces = next;
  }
  const R = mulberry(c * 131 + 5);
  for (const [p0, p1] of pieces) {
    if (p1 - p0 < .05) continue;
    const ds = []; for (let d = p0; d < p1; d += 1) ds.push(d); ds.push(p1);
    const pos = [], uv = [], idx = [], meta = [];
    let cols = 0;
    ds.forEach((d, i) => {
      const xs = rowPoints(d); cols = xs.length;
      const cc = xc(d), hw = hwAt(d), h = H(d);
      for (const x of xs) {
        const y = G(d, x), u = Math.abs(x - cc) - hw;
        pos.push(x, y, -d);
        uv.push(x + Math.sign(x - cc) * Math.abs(y - h) * .8, d);
        meta.push(u, y);
      }
      if (i > 0) for (let j = 0; j < cols - 1; j++) { const r0 = (i - 1) * cols + j, r1 = i * cols + j; idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // colour by height and slope: grass low on flat bits, bare rock on faces, snow on ledges up high
    const nrmA = g.attributes.normal, col = new Float32Array(nrmA.count * 3);
    for (let i = 0; i < nrmA.count; i++) {
      const u = meta[i * 2], y = meta[i * 2 + 1], ny = nrmA.getY(i);
      const flat = smooth(.55, .85, ny), n = (Math.sin(pos[i * 3] * .31 + pos[i * 3 + 2] * .23) + Math.sin(y * .4)) * .025;
      if (u <= 0) tmpC.copy(C_ROAD).lerp(C_DIRT, .3 * grassAt(y)).lerp(C_SNOW, snowAt(y) * .35);
      else {
        tmpC.copy(C_ROCK1).lerp(C_ROCK2, .5 + .5 * Math.sin(y * .8 + u * .1));
        tmpC.lerp(C_GRASS, flat * grassAt(y) * .85);
        tmpC.lerp(C_SNOW, Math.max(flat * snowAt(y), snowAt(y - 50) * .6));
      }
      tmpC.offsetHSL(0, 0, n);
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; grp.add(m);
    // scenery: boulders on the slopes, pines below the treeline
    for (let k = 0; k < (p1 - p0) * .5; k++) {
      const d = p0 + R() * (p1 - p0), s = R() < .5 ? -1 : 1, onCliff = (1 + s * cliffSide(d)) / 2 > .5;
      const u = onCliff ? 3 + R() * 18 : 2.5 + R() * 20;
      if (ridgeAmt(d) > .3 && u < 6) continue;
      const x = xc(d) + s * (hwAt(d) + u), y = G(d, x);
      if ((!onCliff && grassAt(y) > .3 && R() < .6) || (onCliff && grassAt(y) > .5 && R() < .35)) {
        const t = pine(.8 + R() * 1.1); t.position.set(x, y - .2, -d); t.rotation.y = R() * 6; grp.add(t);
      } else {
        const r = .5 + R() * 2;
        const rock = new THREE.Mesh(ROCKS[(R() * 8) | 0], decoRockMat);
        rock.scale.setScalar(r); rock.position.set(x, y + r * .2, -d); rock.rotation.set(R() * 3, R() * 3, R() * 3); rock.castShadow = r > 1.3;
        grp.add(rock);
      }
    }
  }
  for (const g of near) {
    const mid = (g.d0 + g.d1) / 2;
    if (mid < a || mid >= b) continue;
    for (const ld of [g.d0, g.d1]) {
      const xs = rowPoints(ld).filter(x => Math.abs(x - xc(ld)) < hwAt(ld) + 16);
      grp.add(ribbon(xs.map(x => [[x, G(ld, x) - 18, -ld], [x, G(ld, x), -ld]]), crevMat));
      if (ld === g.d0) for (const sd of [-1, 1]) { const bx = xc(ld) + sd * (hwAt(ld) + .7); grp.add(cairn(bx, G(ld, bx) - .05, -ld + .6, R)); }
    }
    if (g.b1 > g.b0) { // the bridge: one great slab of old marble laid across, a fallen column along its outer edge
      const bw = g.b1 - g.b0, cx = xc(mid) + (g.b0 + g.b1) / 2, len = g.d1 - g.d0 + 2.4, outer = Math.sign(g.b0 + g.b1);
      const y0 = G(g.d0, cx), y1 = G(g.d1, cx), ang = Math.atan2(y1 - y0, g.d1 - g.d0), my = (y0 + y1) / 2 + .02;
      const br = new THREE.Group(); br.position.set(cx, my, -mid); br.rotation.x = ang; grp.add(br);
      const slab = new THREE.Mesh(BLOCK_GEO, marbleStoneMat); slab.scale.set(bw + .3, .7, len); slab.position.y = -.22; slab.receiveShadow = true; slab.castShadow = true; br.add(slab);
      const col = new THREE.Mesh(COL_SHAFT, marbleStoneMat); col.rotation.x = Math.PI / 2; col.scale.set(.72, Math.min(1.2, (len - .6) / 7.6), .72);
      col.position.set(outer * (bw / 2 + .15), .36, 0); col.castShadow = true; br.add(col);
      for (const e of [-1, 1]) { // stone footings and rubble at both lips
        for (let i = 0; i < 3; i++) { const r = .45 + R() * .5, rk = new THREE.Mesh(ROCKS[(R() * 8) | 0], decoRockMat); rk.scale.setScalar(r); rk.position.set((R() - .5) * bw, -.5, e * (len / 2 - .2 + R() * .6)); br.add(rk); }
      }
    }
    if (g.r1 > g.r0) { // the launch ramp: a tilted shelf of bedrock rising to the near lip
      const NI = 6, NK = 9, pos = [], uv = [], idx = [], add = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1; };
      const top = [], dS = g.d0 - RAMP_L, rough = (a, b) => .5 + .5 * Math.sin(a * 12.9898 + b * 78.233 + g.d0) * Math.cos(a * 4.1 + b * 7.7);
      for (let k = 0; k <= NK; k++) {
        const d = dS + RAMP_L * k / NK, rise = RAMP_H * k / NK, row = [];
        for (let i = 0; i <= NI; i++) {
          const off = g.r0 + (g.r1 - g.r0) * i / NI, x = xc(d) + off;
          row.push(add(x, G(d, x) + rise - .05 + (i % NI ? rough(i, k) * .05 : 0), -d, x / 3, d / 3));
        }
        top.push(row);
      }
      for (let k = 0; k < NK; k++) for (let i = 0; i < NI; i++) { const a = top[k][i], b = top[k][i + 1], c = top[k + 1][i], e = top[k + 1][i + 1]; idx.push(a, b, c, b, e, c); }
      for (const side of [0, NI]) { // rocky flanks that bulge out and down to the road
        const sg = side ? 1 : -1, mids = [], bots = [];
        for (let k = 0; k <= NK; k++) {
          const d = dS + RAMP_L * k / NK, rise = RAMP_H * k / NK, off = side ? g.r1 : g.r0, bul = .35 + rough(k, side) * .45;
          const xm = xc(d) + off + sg * bul, xb = xc(d) + off + sg * (bul + .5 + rise * .35);
          mids.push(add(xm, G(d, xm) + rise * .55, -d, d / 3, (rise * .55) / 3)); bots.push(add(xb, G(d, xb) - .3, -d, d / 3, -.1));
        }
        for (let k = 0; k < NK; k++) {
          const t0 = top[k][side], t1 = top[k + 1][side], m0 = mids[k], m1 = mids[k + 1], b0 = bots[k], b1 = bots[k + 1];
          if (side) idx.push(t0, t1, m0, m0, t1, m1, m0, m1, b0, b0, m1, b1); else idx.push(t0, m0, t1, t1, m0, m1, m0, b0, m1, m1, b0, b1);
        }
      }
      { // the rock face at the lip, dropping into the crevasse
        const row = top[NK], low = [];
        for (let i = 0; i <= NI; i++) { const off = g.r0 + (g.r1 - g.r0) * i / NI, x = xc(g.d0) + off; low.push(add(x + (rough(i, 9) - .5) * .4, G(g.d0, x) - 4, -g.d0 - .15 - rough(i, 3) * .3, x / 3, -1)); }
        for (let i = 0; i < NI; i++) idx.push(row[i], row[i + 1], low[i], low[i], row[i + 1], low[i + 1]);
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const ramp = new THREE.Mesh(geo, rampRockMat); ramp.castShadow = true; ramp.receiveShadow = true; grp.add(ramp);
      for (let i = 0; i < 5; i++) { // loose scree at its foot and flanks
        const d = dS + R() * RAMP_L * .7, off = (R() < .5 ? g.r0 - .6 - R() * .8 : g.r1 + .6 + R() * .8), x = xc(d) + off, r = .3 + R() * .45;
        if (Math.abs(off) > hwAt(d) - .3) continue;
        const rk = new THREE.Mesh(ROCKS[(R() * 8) | 0], decoRockMat); rk.scale.setScalar(r); rk.position.set(x, G(d, x) + r * .2, -d); rk.rotation.set(R() * 3, R() * 3, R() * 3); grp.add(rk);
      }
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(hwAt(mid) * 2.2, (g.d1 - g.d0) * 1.2), abyssMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(xc(mid), H(mid) - 12, -mid); grp.add(glow);
  }
  scene.add(grp); chunks.set(c, grp);
}
function ribbon(points, mat) {
  const g = new THREE.BufferGeometry(), pos = [], idx = [];
  for (const p of points) pos.push(...p[0], ...p[1]);
  for (let i = 0; i < points.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function disposeGroup(g) { scene.remove(g); g.traverse(o => { if (o.geometry && !o.isSprite && !SHARED_GEOS.has(o.geometry)) o.geometry.dispose(); }); }
// building is queued and done a little each frame, so the game never builds a whole mountain in one go
const work = [], queued = new Set();
function queue(key, fn) { if (queued.has(key)) return; queued.add(key); work.push(fn); }
function doWork(budgetMs) { const t0 = performance.now(); while (work.length && performance.now() - t0 < budgetMs) work.shift()(); }
function updateChunks(d, now) {
  const c0 = Math.floor((d - 50) / CH), c1 = Math.floor((d + 180) / CH);
  for (let s = stageAt(Math.max(0, d)); s <= stageAt(d + 250); s++) if (!builtStages.has(s)) queue('s' + s, () => buildStage(s));
  for (let c = c0; c <= c1; c++) if (!chunks.has(c)) queue('c' + c, () => { queued.delete('c' + c); if (!chunks.has(c)) buildChunk(c); });
  for (const [c, g] of chunks) if (c < c0 - 1 || c > c1 + 1) { disposeGroup(g); chunks.delete(c); }
  if (now) doWork(1e9);
}

// ---------------------------------------------------------------- course objects
const rocks = [], gates = [], cells = [], camps = [], builtStages = new Set();
const boulderMat = new THREE.MeshStandardMaterial({ color: 0x7a7c82, map: groundMap, bumpMap: groundBump, bumpScale: 1.6, roughness: .92, flatShading: true });
const slabMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, map: steelMap, metalness: .75, roughness: .36, envMapIntensity: 2.2 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, map: concreteMap, roughness: .9, metalness: 0 });
const neonMats = new Map();
const neonMat = col => { if (!neonMats.has(col)) neonMats.set(col, new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2) })); return neonMats.get(col); };
const CELL = [ // coins: bronze obol, silver drachma, gold stater
  { col: 0xd9925a, val: 20, y: [1.6, 3], size: 1 },
  { col: 0xe8eef6, val: 60, y: [4.5, 7], size: 1.15 },
  { col: 0xffcf4a, val: 150, y: [7.5, 9.5], size: 1.35 },
];
const coinFace = tex(noiseCanvas(128, (x, s) => { // an owl struck into the metal, beaded rim
  x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, s, s);
  x.fillStyle = '#d8d8d8'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill();
  x.fillStyle = '#9a9a9a'; x.beginPath(); x.arc(64, 64, 52, 0, 7); x.fill();
  x.fillStyle = '#e8e8e8'; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283; x.beginPath(); x.arc(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56, 2.6, 0, 7); x.fill(); }
  x.fillStyle = '#d0d0d0'; x.beginPath(); x.ellipse(64, 72, 19, 27, 0, 0, 7); x.fill();           // body
  x.beginPath(); x.ellipse(64, 46, 18, 14, 0, 0, 7); x.fill();                                    // head
  x.beginPath(); x.moveTo(48, 36); x.lineTo(52, 26); x.lineTo(57, 36); x.fill(); x.beginPath(); x.moveTo(80, 36); x.lineTo(76, 26); x.lineTo(71, 36); x.fill();
  x.fillStyle = '#f4f4f4'; for (const ex of [57, 71]) { x.beginPath(); x.arc(ex, 46, 6.5, 0, 7); x.fill(); }
  x.fillStyle = '#6a6a6a'; for (const ex of [57, 71]) { x.beginPath(); x.arc(ex, 46, 2.8, 0, 7); x.fill(); }
  x.beginPath(); x.moveTo(61, 51); x.lineTo(67, 51); x.lineTo(64, 57); x.fill();
  x.strokeStyle = '#8a8a8a'; x.lineWidth = 2; for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(64, 70 + i * 7, 12 - i * 2, .4, 2.7); x.stroke(); }
  x.fillStyle = '#bdbdbd'; x.font = 'bold 15px Georgia, serif'; x.textAlign = 'center'; x.fillText('ΑΘΕ', 98, 74);
}), 1);
const glintTex = tex(noiseCanvas(64, (x, s) => {
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 8); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s);
  for (const [w, h] of [[30, 1.6], [1.6, 30]]) { const l = x.createLinearGradient(32 - w, 32 - h, 32 + w, 32 + h); x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.ellipse(32, 32, w, h, 0, 0, 7); x.fill(); }
}), 1);
const COIN_GEO = new THREE.CylinderGeometry(.42, .42, .085, 36).rotateX(Math.PI / 2);
const CELL_GEO = [COIN_GEO]; CELL_GEO.forEach(g => SHARED_GEOS.add(g));
const coinMats = CELL.map(t => {
  const c = new THREE.Color(t.col);
  const face = new THREE.MeshStandardMaterial({ color: c, map: coinFace, bumpMap: coinFace, bumpScale: 3, metalness: 1, roughness: .32, envMapIntensity: 2.2, emissive: c.clone().multiplyScalar(.22) });
  const edge = new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: .28, envMapIntensity: 2.2, emissive: c.clone().multiplyScalar(.2) });
  return [edge, face, face];
});
const haloMats = CELL.map(t => new THREE.SpriteMaterial({ map: glintTex, color: t.col, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
function makeCell(tier) {
  const t = CELL[tier], g = new THREE.Group();
  g.add(new THREE.Mesh(COIN_GEO, coinMats[tier]));
  const glint = new THREE.Sprite(haloMats[tier]); glint.scale.setScalar(1.3); glint.position.set(.18, .18, .1); g.add(glint);
  g.scale.setScalar(t.size);
  return g;
}
function textSprite(text, color, w = 8) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = '600 70px -apple-system, Segoe UI, Roboto, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 22; x.strokeStyle = color; x.lineWidth = 3; x.strokeText(text, 256, 66);
  x.shadowBlur = 8; x.fillStyle = '#fff8ee'; x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(w, w / 4, 1); return s;
}
function boxMesh(w, h, dpt, mat) { const m = new THREE.Mesh(UNIT_BOX, mat); m.scale.set(w, h, dpt); return m; }
function friezeTex(k) {
  const c = noiseCanvas(1024, (x, w, h) => {
    x.drawImage(stoneC, 0, 0, 256, 256, 0, 0, w, h);
    x.fillStyle = 'rgba(255,248,236,.35)'; x.fillRect(0, 0, w, h);
    const tw = 34, gapW = 70;
    for (let px = 14; px < w; px += tw + gapW) { // triglyphs
      if (px > w * .3 && px < w * .7 - tw) continue;
      x.fillStyle = 'rgba(60,52,44,.4)'; x.fillRect(px, 10, tw, h - 20);
      x.fillStyle = 'rgba(255,250,240,.5)'; for (const gx of [8, 17, 26]) x.fillRect(px + gx - 2, 14, 2, h - 28);
    }
    x.font = '600 86px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const txt = `CAMP ${ROMAN(k)}`;
    x.fillStyle = 'rgba(255,252,244,.7)'; x.fillText(txt, w / 2 + 2, h / 2 + 4);
    x.fillStyle = 'rgba(52,44,36,.85)'; x.fillText(txt, w / 2, h / 2 + 1);
  }, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function buildCamp(k) {
  const st = stageDef(k), base = k * CFG.stageLen, d = base + CFG.campLen * .5, cx = xc(d), h = H(d), hw = CFG.hw + 1.3, grp = new THREE.Group();
  const topY = h + 8.4;
  for (const s of [-1, 1]) {
    const x = cx + s * hw, gy = Math.min(G(d, x), h + 1);
    const step = new THREE.Mesh(BLOCK_GEO, oldStoneMat); step.scale.set(2, 1.2, 2); step.position.set(x, gy - .1, -d); step.castShadow = true; grp.add(step);
    const sh = new THREE.Mesh(COL_SHAFT, marbleStoneMat), shH = topY - .8 - (gy + .5);
    sh.scale.set(1.15, shH / 7.6, 1.15); sh.position.set(x, gy + .5 + shH / 2, -d); sh.castShadow = true; grp.add(sh);
    const cap = new THREE.Mesh(COL_CAP, marbleStoneMat); cap.scale.set(1.15, 1, 1.15); cap.position.set(x, topY - .59, -d); grp.add(cap);
    const ab = boxMesh(1.85, .4, 1.85, marbleStoneMat); ab.position.set(x, topY - .2, -d); grp.add(ab);
    const bz = brazier(1.1); bz.position.set(cx + s * (hw + 2.3), G(d, cx + s * (hw + 2.3)) - .1, -d + 1.2); grp.add(bz);
  }
  const W = hw * 2 + 2.4, archMats = [marbleStoneMat, marbleStoneMat, marbleStoneMat, marbleStoneMat, new THREE.MeshStandardMaterial({ map: friezeTex(k), roughness: .8 }), marbleStoneMat];
  const arch = boxMesh(W, .9, 1.5, marbleStoneMat); arch.position.set(cx, topY + .45, -d); arch.castShadow = true; grp.add(arch);
  const frieze = new THREE.Mesh(UNIT_BOX, archMats); frieze.scale.set(W - .1, 1.05, 1.35); frieze.position.set(cx, topY + 1.42, -d); grp.add(frieze);
  const cor = boxMesh(W + .5, .3, 1.8, marbleStoneMat); cor.position.set(cx, topY + 2.08, -d); grp.add(cor);
  const tri = new THREE.Shape(); tri.moveTo(-W / 2 - .25, 0); tri.lineTo(W / 2 + .25, 0); tri.lineTo(0, 1.9); tri.lineTo(-W / 2 - .25, 0);
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 1.6, bevelEnabled: false }), marbleStoneMat);
  ped.position.set(cx, topY + 2.23, -d - .8); ped.castShadow = true; grp.add(ped);
  { // a threshold of worn marble paving across the road
    const td = base + 2, tc = xc(td), y0 = G(td, tc - CFG.hw), y1 = G(td, tc + CFG.hw);
    const slab = new THREE.Mesh(BLOCK_GEO, marbleStoneMat); slab.scale.set(CFG.hw * 2 + .6, .22, 1.3);
    slab.position.set(tc, G(td, tc) + .02, -td); slab.rotation.z = Math.atan2(y1 - y0, CFG.hw * 2); slab.receiveShadow = true; grp.add(slab);
  }
  scene.add(grp);
  return { k, d: base + 2, mesh: grp, reached: false, st };
}
function buildGate(w, hgt) { // a great block of grey stone that grinds back and forth across the road, bound in bronze
  const grp = new THREE.Group();
  const body = new THREE.Mesh(BLOCK_GEO, oldStoneMat); body.scale.set(w, hgt, .9); body.castShadow = true; body.receiveShadow = true; grp.add(body);
  for (const e of [-.3, .3]) { const strap = boxMesh(.26, hgt + .05, .98, bronzeMat); strap.position.x = e * w; grp.add(strap); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.26, .06, 8, 20), bronzeMat); ring.position.set(0, hgt * .1, .5); grp.add(ring);
  return grp;
}
function buildStage(k) {
  if (builtStages.has(k)) return;
  builtStages.add(k);
  const R = mulberry(k * 7919 + 13), st = stageDef(k), L = CFG.stageLen, base = k * L, C = CFG.campLen;
  if (k >= 1) camps.push(buildCamp(k));
  const start = k === 0 ? 30 : C + 14, end = L - 10;
  if (st.rocks > 0) {
    let d = base + start;
    while (d < base + end) {
      if (R() < st.rocks && !nearGap(d, 6)) {
        const hw = hwAt(d), r = .9 + R() * .7, off = (R() * 2 - 1) * (hw - r - .6), x = xc(d) + off;
        const mesh = new THREE.Mesh(ROCKS[(R() * 8) | 0], boulderMat);
        const cy = G(d, x) + r * .3;
        mesh.scale.setScalar(r); mesh.position.set(x, cy, -d); mesh.rotation.set(R() * 3, R() * 3, R() * 3); mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh); rocks.push({ x, d, r, cy, mesh, hit: 0 });
      }
      d += 14 + R() * 12;
    }
  }
  if (st.gates > 0) {
    let d = base + start + 20;
    while (d < base + end - 6) {
      if (R() < st.gates && !nearGap(d, 7)) {
        const hw = hwAt(d), w = 4.4 + R() * 1.4, hgt = 3 + R() * .6, mesh = buildGate(w, hgt);
        scene.add(mesh);
        gates.push({ d, w, h: hgt, amp: hw - w / 2 - .1, speed: .7 + R() * .6 + Math.min(k, 10) * .04, phase: R() * 6.28, x: xc(d), vx: 0, mesh, hit: 0 });
      }
      d += 28 + R() * 14;
    }
  }
  let d = base + (k === 0 ? 22 : C + 6);
  while (d < base + L - 4) {
    const hw = hwAt(d), r = R(), tier = r < .07 + k * .01 ? 2 : r < .35 ? 1 : 0, t = CELL[tier];
    const off = (R() * 2 - 1) * (hw - 1.5), y = t.y[0] + R() * (t.y[1] - t.y[0]);
    const mesh = makeCell(tier); mesh.position.set(xc(d) + off, H(d) + y, -d); scene.add(mesh);
    cells.push({ d, off, y, tier, mesh, taken: false, t: R() * 6 });
    d += 7 + R() * 7;
  }
}
function cullBehind(d) {
  const cut = d - 60;
  for (const arr of [rocks, gates, cells]) for (let i = arr.length - 1; i >= 0; i--) if (arr[i].d < cut) { disposeGroup(arr[i].mesh); arr.splice(i, 1); }
  for (let i = camps.length - 1; i >= 0; i--) if (camps[i].d < cut - 40) { disposeGroup(camps[i].mesh); camps.splice(i, 1); }
}

// ---------------------------------------------------------------- the boulder (bigger, heavier)
const ball = (() => {
  const R0 = CFG.ballR, geo = new THREE.IcosahedronGeometry(R0, 5), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).divideScalar(R0); const n = 1 + .05 * Math.sin(v.x * 3.3 + v.y * 2.5) * Math.cos(v.z * 3 - v.x * 1.4) + .03 * Math.sin(v.y * 7.4 + v.z * 4.8); v.multiplyScalar(R0 * n); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); uv[i * 2] = .5 + Math.atan2(v.z, v.x) / (2 * Math.PI); uv[i * 2 + 1] = .5 + Math.asin(v.y) / Math.PI; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const em = noiseCanvas(256, (x, s) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s); x.strokeStyle = '#ff9a4a'; x.lineCap = 'round';
    for (let i = 0; i < 16; i++) { x.lineWidth = rnd(.8, 2.4); x.beginPath(); let px = rnd(0, s), py = rnd(s * .15, s * .85); x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += rnd(-22, 22); py += rnd(-14, 14); x.lineTo(px, py); } x.stroke(); }
  });
  const map = tex(rockC); map.repeat.set(2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c9890, map, bumpMap: groundBump, bumpScale: 2.4, roughness: .9, metalness: .02,
    emissive: new THREE.Color(1, .55, .25), emissiveMap: new THREE.CanvasTexture(em), emissiveIntensity: .3 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.add(mesh); scene.add(group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(.88, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .7, .35).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(marker);
  return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: R0, m: CFG.ballMass, bounce: CFG.ballBounce, roll: CFG.ballRoll, mesh, mat, group, marker,
    grounded: false, heat: 0, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, lost: 0, lostWhy: '', flying: false, throwFrom: 0 };
})();

// ---------------------------------------------------------------- Sisyphus himself
// A big marble figure (about 3.6 m) trudging uphill. Right fist in a steel gauntlet for punching,
// left forearm raised to block when the boulder rolls into him.
const P = { d: 0, off: 0, toff: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), stun: 0, stagger: 0, charge: 0, charging: false, release: 0, cool: 0, bumpCool: 0,
  group: new THREE.Group(), walk: 0, lastStep: 0, guard: 0, block: 0, bonk: 0, cheer: 0, fade: 1, yaw: 0, coil: 0, punchT: -1, punchPow: .5, air: -1 };
const figMats = [];
const J = {}; // bones
// Sisyphus: one continuous sculpted marble body (pre-built, see sdfbody.mjs), skinned to a skeleton so it
// bends at the joints, dressed in crimson drapery and gold.
(() => {
  const g = P.group, TAU = Math.PI * 2;
  const marbleTex = tex(noiseCanvas(512, (x, s) => {
    x.fillStyle = '#efe8dc'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      x.strokeStyle = `rgba(${rnd(120, 160)},${rnd(115, 145)},${rnd(110, 135)},${rnd(.05, .14)})`; x.lineWidth = rnd(.6, 2.4);
      x.beginPath(); let px = rnd(0, s), py = rnd(0, s); x.moveTo(px, py);
      for (let k = 0; k < 10; k++) { px += rnd(-50, 50); py += rnd(-35, 35); x.lineTo(px, py); } x.stroke();
    }
    for (let i = 0; i < 1200; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '140,128,115'},${rnd(.02, .06)})`; x.fillRect(rnd(0, s), rnd(0, s), 2, 2); }
  }));
  marbleTex.repeat.set(3, 1);
  const withRim = (m, col, k) => {
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        totalEmissiveRadiance += vec3(${col.r.toFixed(3)}, ${col.g.toFixed(3)}, ${col.b.toFixed(3)}) * pow(rimF, 3.0) * ${k.toFixed(2)};`);
    };
    return m;
  };
  const mk = (Ctor, o, rim) => { const m = new Ctor({ transparent: true, ...o }); if (rim) withRim(m, rim[0], rim[1]); figMats.push(m); return m; };
  const rimC = new THREE.Color(.7, .82, 1);
  const marble = mk(THREE.MeshPhysicalMaterial, { color: 0xd3c9b8, map: marbleTex, roughness: .42, metalness: 0, clearcoat: .22, clearcoatRoughness: .45, envMapIntensity: .95 }, [rimC, .3]);
  const marbleDk = mk(THREE.MeshPhysicalMaterial, { color: 0xa99d8a, map: marbleTex, roughness: .6, clearcoat: .1, envMapIntensity: .8 }, [rimC, .22]);
  const cloth = mk(THREE.MeshStandardMaterial, { color: 0x8a1d22, roughness: .78, side: THREE.DoubleSide }, [new THREE.Color(1, .45, .35), .3]);
  const gold = mk(THREE.MeshStandardMaterial, { color: 0xe0a94a, metalness: 1, roughness: .34, envMapIntensity: 1.3 });
  const leather = mk(THREE.MeshStandardMaterial, { color: 0x5a3a22, roughness: .75 });
  const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .55, .2), transparent: true, opacity: 0 }); P.glowM = glowM;
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const ellip = (rx, ry, rz, ws = 18, hs = 14) => { const q = new THREE.SphereGeometry(1, ws, hs); q.scale(rx, ry, rz); return q; };
  function lathe(profile, segs, bump, sx = 1, sz = 1) {
    const geo = new THREE.LatheGeometry(profile.map(([y, r]) => new THREE.Vector2(r, y)).reverse(), segs), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (Math.hypot(x, z) < 1e-5) continue;
      const k = bump ? 1 + bump(Math.atan2(x, -z), y) : 1; p.setXYZ(i, x * k * sx, y, z * k * sz);
    }
    geo.computeVertexNormals(); return geo;
  }
  // skeleton (rest pose matches the sculpture)
  const root = new THREE.Group(); root.scale.setScalar(2); g.add(root); J.root = root;
  for (const [name, [parent, x, y, z]] of Object.entries(BODY_BONES)) {
    const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
    (parent ? J[parent] : root).add(b); J[name] = b;
  }
  const bones = BODY_BONE_NAMES.map(n => J[n]);
  // the marble body arrives a moment after load (it's unpacked in the background)
  loadBodyGeometry().then(geo => {
    root.updateMatrixWorld(true);
    const mesh = new THREE.SkinnedMesh(geo, marble);
    mesh.castShadow = true; mesh.frustumCulled = false;
    root.add(mesh);
    root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));
    P.body = mesh;
  }).catch(err => console.warn('body', err));
  // drapery: hip wrap with deep folds, gold belt
  const wrap = lathe([[.06, .2], [-.02, .215], [-.14, .245], [-.27, .28], [-.33, .29]], 40,
    (th, y) => .07 * Math.sin(th * 9 + y * 6) * smooth(.02, -.25, y) + .03 * Math.sin(th * 4 + 1), 1.1, .95);
  add(J.hips, wrap, cloth);
  { const belt = add(J.hips, new THREE.TorusGeometry(.2, .016, 8, 40), gold, 0, .055, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1.05, .95, 1); }
  // sash over the left shoulder, diagonally to the right hip
  {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(.31, -.02, -.13), new THREE.Vector3(.1, .2, -.19), new THREE.Vector3(-.15, .45, -.16), new THREE.Vector3(-.28, .56, 0),
      new THREE.Vector3(-.15, .45, .17), new THREE.Vector3(.1, .2, .17), new THREE.Vector3(.31, -.02, .13),
    ], true);
    const N = 120, W = .085, pos = [], idx = [], tmp = new THREE.Vector3(), out = new THREE.Vector3(), bn = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
      out.set(p.x, 0, p.z).normalize(); bn.crossVectors(tg, out).normalize();
      const fold = .012 * Math.sin(t * 60), w = W * (1 + .25 * Math.sin(t * TAU * 2));
      for (const e of [-1, 1]) { tmp.copy(p).addScaledVector(out, .035 + fold).addScaledVector(bn, e * w); pos.push(tmp.x, tmp.y, tmp.z); }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    add(J.spine, geo, cloth);
    add(J.spine, new THREE.CylinderGeometry(.03, .03, .012, 16), gold, -.26, .55, -.07).rotation.x = Math.PI / 2;
  }
  // carved curls and beard, gold laurel
  const curl = new THREE.IcosahedronGeometry(1, 1), R = mulberry(41);
  for (let i = 0; i < 120; i++) {
    const th = R() * TAU, ph = R() * 1.3;
    if (Math.cos(th) < 0 && ph > .85) continue;
    const dir = new THREE.Vector3(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
    const m = add(J.head, curl, marbleDk, dir.x * .1, dir.y * .114 + .006, dir.z * .108);
    m.scale.set(.018 + R() * .006, .013, .018 + R() * .006); m.lookAt(m.position.clone().multiplyScalar(3)); m.castShadow = false;
  }
  for (let i = 0; i < 60; i++) {
    const a = (R() - .5) * 2.2, y = -.04 - R() * .09, r = .09 * (1 - .4 * smooth(-.04, -.13, y));
    const m = add(J.head, curl, marbleDk, Math.sin(a) * r, y, -Math.cos(a) * r * .95 - .006); m.scale.set(.016 + R() * .006, .02, .014); m.castShadow = false;
  }
  const wreathG = new THREE.Group(); wreathG.position.set(0, .045, .005); wreathG.rotation.x = -.18; J.head.add(wreathG);
  add(wreathG, new THREE.TorusGeometry(.116, .005, 6, 32), gold).rotation.x = Math.PI / 2;
  const leafG = ellip(.012, .004, .03, 8, 6);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU; if (Math.cos(a) < -.85) continue;
    for (const e of [-1, 1]) { const m = add(wreathG, leafG, gold, Math.sin(a) * .118, .008 * e, Math.cos(a) * .118); m.rotation.set(e * .5, a + Math.PI / 2, e * .4); m.castShadow = false; }
  }
  // gold cestus on the punching fist, leather bracer + gold rings on the guarding arm
  add(J.el1, ellip(.06, .06, .07), gold, 0, -.31, -.006);
  for (const y of [-.19, -.225, -.26]) add(J.el1, new THREE.TorusGeometry(.043, .009, 6, 18), gold, 0, y, 0).rotateX(Math.PI / 2);
  { const r1 = new THREE.Mesh(new THREE.TorusGeometry(.068, .012, 6, 22), glowM); r1.rotation.x = Math.PI / 2; r1.position.y = -.3; J.el1.add(r1); const r2 = r1.clone(); r2.position.y = -.245; J.el1.add(r2); }
  add(J['el-1'], lathe([[-.08, .056], [-.14, .056], [-.21, .048], [-.25, .044]], 16), leather);
  add(J['el-1'], new THREE.TorusGeometry(.056, .008, 6, 18), gold, 0, -.09, 0).rotateX(Math.PI / 2);
  add(J['sh-1'], new THREE.TorusGeometry(.078, .011, 6, 20), gold, 0, -.12, 0).rotateX(Math.PI / 2);
  // sandals
  for (const s of [-1, 1]) {
    add(J['ankle' + s], new THREE.BoxGeometry(.1, .018, .24), leather, 0, -.04, -.05);
    for (const [y, r] of [[-.2, .062], [-.27, .052], [-.34, .045]]) add(J['knee' + s], new THREE.TorusGeometry(r, .006, 6, 18), leather, 0, y, 0).rotateX(Math.PI / 2);
  }
  scene.add(g);
})();
const ease = { out: t => 1 - (1 - t) * (1 - t) * (1 - t), inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2 };
// the pose: a heavy uphill trudge with hips and shoulders counter-rotating; the punch drives from the
// hips, then the shoulders, then the arm, with a lunge and follow-through; guard, block, stumble, leap
function poseFigure(dt, t, sp) {
  const TAU = Math.PI * 2, amp = clamp(sp / 6, 0, 1.25);
  P.walk += dt * sp / 2.6 * TAU;
  const ph = P.walk;
  const stepIdx = Math.floor(ph / Math.PI);
  if (stepIdx !== P.lastStep && mode === 'play' && P.air < 0) { P.lastStep = stepIdx; sfx.step(); J['ankle' + (stepIdx % 2 ? 1 : -1)].localToWorld(dustAt.set(0, -.04, 0)); dust(dustAt, 3, 1.2); }
  P.coil = P.charging ? lerp(P.coil, P.charge, 1 - Math.exp(-14 * dt)) : lerp(P.coil, 0, 1 - Math.exp(-9 * dt));
  const c = P.coil;
  // punch timeline
  let e = 0, hipT = 0;
  if (P.punchT >= 0) {
    P.punchT += dt; const q = P.punchT;
    hipT = q < .05 ? ease.out(q / .05) : q < .22 ? 1 : Math.max(0, 1 - ease.inOut((q - .22) / .3));
    e = q < .02 ? 0 : q < .08 ? ease.out((q - .02) / .06) * 1.1 : q < .12 ? lerp(1.1, 1, (q - .08) / .04) : q < .2 ? 1 : Math.max(0, 1 - ease.inOut((q - .2) / .3));
    if (q > .55) P.punchT = -1;
  }
  const pw = P.punchPow || .5;
  const airK = P.air >= 0 ? Math.sin(Math.PI * P.air) : 0;
  P.block = Math.max(0, P.block - dt * 2.5); P.bonk = Math.max(0, P.bonk - dt * 1.8); P.cheer = Math.max(0, P.cheer - dt);
  const bk = P.block, bo = P.bonk;
  // legs
  for (const s of [-1, 1]) {
    const lp = ph + (s > 0 ? Math.PI : 0);
    let th = amp * (.42 * Math.sin(lp) + .06);
    let kn = -(.1 + amp * .85 * Math.pow(Math.max(0, Math.cos(lp - .35)), 1.6));
    th += .22 * c; kn -= .45 * c;                                   // crouch into the wind-up
    if (s < 0) { th += .4 * e * pw; kn -= .25 * e; } else { th -= .3 * e * pw; kn -= .1 * e; } // lunge: front leg forward, back leg drives
    th += .1 * bk; kn -= .35 * bk;
    th = lerp(th, .95, airK); kn = lerp(kn, -1.6, airK);            // tuck for a leap
    J['hip' + s].rotation.set(th, 0, s * (.03 + .04 * c));
    J['knee' + s].rotation.x = kn;
    J['ankle' + s].rotation.x = -(th + kn) * .75 + (s < 0 ? .1 * e : 0);
  }
  // hips: bob, sway, turn into the punch
  J.hips.position.y = .925 + .028 * amp * Math.cos(ph * 2) - .085 * c - .05 * bk;
  J.hips.rotation.set(0, .14 * amp * Math.sin(ph) - .35 * c + .32 * hipT * pw, .05 * amp * Math.cos(ph));
  J.root.position.z = -e * .38 * pw + .18 * bk + .25 * bo;
  // torso: lean into the hill, counter-rotate, coil and uncoil
  const slope = Math.atan(Hp(P.d));
  const stunWob = P.stun > 0 ? Math.sin(t * 30) * .12 : 0;
  J.spine.rotation.set(-.24 * amp - slope * .45 - .05 + .12 * c - .16 * e + .3 * bk + .4 * bo - .2 * airK,
    -.18 * amp * Math.sin(ph) - .62 * c + .55 * e * pw, .04 * Math.sin(ph) + stunWob, 'YXZ');
  J.head.rotation.set(-J.spine.rotation.x * .6 + .12 - .3 * bo, -(J.hips.rotation.y + J.spine.rotation.y) * .6, Math.sin(t * .6) * .05 - stunWob * .5, 'YXZ');
  // right arm: swing -> cocked -> punch
  const swing = .38 * amp * Math.sin(ph);
  const rx = lerp(lerp(swing, -1.25, c), 1.52, e), rz = lerp(lerp(.07, .8, c), -.06, e), re = lerp(lerp(.3 + .25 * Math.max(0, Math.sin(ph)), 2.2, c), .04, e);
  J.sh1.rotation.set(lerp(rx, .3, bo), 0, lerp(rz, 1.1, bo));
  J.el1.rotation.x = lerp(re, .3, bo);
  // left arm: swing, guard up, brace on a block, fist in the air after a PERFECT, flail on a bonk
  P.guard = lerp(P.guard, (P.charging || bk > 0 || nearBall()) ? 1 : 0, 1 - Math.exp(-10 * dt));
  const lswing = .38 * amp * Math.sin(ph + Math.PI);
  let lx = lerp(lswing, 1.1 + bk * .35, P.guard), lz = lerp(-.07, .5, P.guard), le = lerp(.3 + .25 * Math.max(0, -Math.sin(ph)), 1.6, P.guard);
  if (e > 0) { lx = lerp(lx, .5, e); le = lerp(le, 1.9, e); }      // pull the other hand back to the chin while punching
  if (P.cheer > 0) { const k = Math.min(1, P.cheer * 3); lx = lerp(lx, 2.95, k); lz = lerp(lz, -.25, k); le = lerp(le, .25, k); }
  lx = lerp(lx, .3, bo); lz = lerp(lz, -1.1, bo); le = lerp(le, .3, bo);
  lx = lerp(lx, -.6, airK); lz = lerp(lz, -.5, airK);
  J['sh-1'].rotation.set(lx, 0, lz); J['el-1'].rotation.x = le;
  if (airK > 0) { J.sh1.rotation.x = lerp(J.sh1.rotation.x, -.6, airK); J.sh1.rotation.z = lerp(J.sh1.rotation.z, .5, airK); }
  // cloak ripple
  if (P.cape) {
    const { geo, base, cw } = P.cape, p = geo.attributes.position.array, a2 = .03 + sp * .006 + e * .06 + airK * .08;
    for (let i = 0; i < p.length; i += 3) {
      const y = base[i + 1], k = -y / .95, col = (i / 3) % (cw + 1);
      p[i] = base[i] + Math.sin(t * 3 + y * 6 + col) * .01 * k;
      p[i + 2] = base[i + 2] + k * k * (.18 + .06 * c + .2 * airK) + Math.sin(t * 5.5 - y * 9 + col * .5) * a2 * k + Math.sin(ph) * .03 * k;
    }
    geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }
  P.glowM.opacity = (P.charging ? P.charge : 0) * .95 + e * .8;
  P.glowM.color.setRGB(1, .55 + c * .3, .2 + c * .3);
}
const nearBall = () => !ball.lost && -ball.p.z > P.d && ballGap() < 5;
// unpack the pre-built body (gzipped, base64) into a skinned geometry
async function loadBodyGeometry() {
  const bin = Uint8Array.from(atob(BODY_DATA), ch => ch.charCodeAt(0));
  const buf = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const [N, T] = new Uint32Array(buf, 0, 2);
  let o = 8;
  const pos16 = new Int16Array(buf, o, N * 3); o += N * 6;
  const nrm8 = new Int8Array(buf, o, N * 3); o += N * 3;
  const si = new Uint8Array(buf, o, N * 3); o += N * 3;
  const sw = new Uint8Array(buf, o, N * 3); o += N * 3;
  const idxD = new Int32Array(buf.slice(o, o + T * 4));
  const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3), uv = new Float32Array(N * 2), sI = new Uint16Array(N * 4), sW = new Float32Array(N * 4);
  for (let i = 0; i < N * 3; i++) { pos[i] = pos16[i] / 32767 * 2; nrm[i] = nrm8[i] / 127; }
  for (let v = 0; v < N; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    uv[v * 2] = Math.atan2(x, z) / (2 * Math.PI) + .5; uv[v * 2 + 1] = y * 1.6;
    let sum = 0; for (let k = 0; k < 3; k++) { sI[v * 4 + k] = si[v * 3 + k]; sW[v * 4 + k] = sw[v * 3 + k]; sum += sw[v * 3 + k]; }
    for (let k = 0; k < 3; k++) sW[v * 4 + k] /= sum || 1;
  }
  const idx = N > 65535 ? new Uint32Array(T) : new Uint16Array(T); let prev = 0; for (let i = 0; i < T; i++) { prev += idxD[i]; idx[i] = prev; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(sI, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sW, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
const reachRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .78, .35).multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
scene.add(reachRing);
const ARC_N = 40;
const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
const arc = new THREE.Points(arcGeo, new THREE.PointsMaterial({ size: .34, map: glowTex, color: new THREE.Color(1, .8, .4).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
arc.frustumCulled = false; arc.visible = false; scene.add(arc);
const arcLand = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .8, .4).multiplyScalar(1.6), transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
arcLand.visible = false; scene.add(arcLand);

// ---------------------------------------------------------------- rockfall
const tumblers = [];
const tumbleMat = new THREE.MeshStandardMaterial({ color: 0x5c5650, map: groundMap, roughness: .95, flatShading: true });
const dustSpriteMat = new THREE.SpriteMaterial({ map: glowTex, color: 0x8a7a6a, transparent: true, opacity: .35, depthWrite: false });
function spawnTumbler(d) {
  const r = rnd(.6, 1.05), hw = hwAt(d), side = cliffSide(d) < 0 ? -1 : 1; // they come off the cliff side
  const mesh = new THREE.Mesh(ROCKS[(Math.random() * 8) | 0], tumbleMat); mesh.scale.setScalar(r); mesh.castShadow = true;
  const puff = new THREE.Sprite(dustSpriteMat); puff.scale.setScalar(3.5); mesh.add(puff);
  scene.add(mesh);
  const x = xc(d) + side * (hw + rnd(3, 8));
  tumblers.push({ p: new THREE.Vector3(x, G(d, x) + r + 1, -d), v: new THREE.Vector3(-side * rnd(2, 4), 0, rnd(3, 6)), r, m: 1, bounce: .45, roll: .02, mesh, grounded: false, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, dead: false });
}

// ---------------------------------------------------------------- particles, rings, pops, snow
const NP = 420;
const pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = Array.from({ length: NP }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color(), grav: 12 }));
const ptsAdd = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .32, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
ptsAdd.frustumCulled = false; scene.add(ptsAdd);
let pIdx = 0;
const tmpCol = new THREE.Color();
function burst(at, n, color, speed = 6, dir = null, grav = 12, life = [.35, .9]) {
  tmpCol.set(color);
  for (let i = 0; i < n; i++) {
    const o = parts[pIdx], k = pIdx * 3; pIdx = (pIdx + 1) % NP;
    o.life = o.max = rnd(life[0], life[1]); o.grav = grav;
    o.v.set(rnd(-1, 1), rnd(-.2, 1), rnd(-1, 1)).normalize(); if (dir) o.v.addScaledVector(dir, 1.3).normalize();
    o.v.multiplyScalar(rnd(.3, 1) * speed); o.c.copy(tmpCol).multiplyScalar(rnd(.6, 1.3));
    pPos[k] = at.x; pPos[k + 1] = at.y; pPos[k + 2] = at.z;
  }
}
function stepParts(dt) {
  for (let i = 0; i < NP; i++) {
    const o = parts[i], k = i * 3;
    if (o.life <= 0) { pCol[k] = pCol[k + 1] = pCol[k + 2] = 0; continue; }
    o.life -= dt; o.v.y -= o.grav * dt; o.v.multiplyScalar(1 - 1.5 * dt);
    pPos[k] += o.v.x * dt; pPos[k + 1] += o.v.y * dt; pPos[k + 2] += o.v.z * dt;
    const f = Math.max(0, o.life / o.max); pCol[k] = o.c.r * f; pCol[k + 1] = o.c.g * f; pCol[k + 2] = o.c.b * f;
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}
const NDUST = 200;
const dGeo = new THREE.BufferGeometry(), dPos = new Float32Array(NDUST * 3);
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
const dusts = Array.from({ length: NDUST }, () => ({ life: 0, v: new THREE.Vector3() }));
const dustPts = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: 1.1, map: glowTex, color: 0x9a8e80, transparent: true, opacity: .4, depthWrite: false }));
dustPts.frustumCulled = false; scene.add(dustPts);
let dIdx = 0;
function dust(at, n, speed = 3) {
  for (let i = 0; i < n; i++) {
    const o = dusts[dIdx], k = dIdx * 3; dIdx = (dIdx + 1) % NDUST;
    o.life = rnd(.5, 1.2); o.v.set(rnd(-1, 1), rnd(.1, .8), rnd(-1, 1)).normalize().multiplyScalar(rnd(.4, 1) * speed);
    dPos[k] = at.x; dPos[k + 1] = at.y; dPos[k + 2] = at.z;
  }
}
function stepDust(dt) {
  for (let i = 0; i < NDUST; i++) {
    const o = dusts[i], k = i * 3;
    if (o.life <= 0) { dPos[k + 1] = -1e4; continue; }
    o.life -= dt; o.v.multiplyScalar(1 - 2 * dt); o.v.y -= 1.2 * dt;
    dPos[k] += o.v.x * dt; dPos[k + 1] += o.v.y * dt; dPos[k + 2] += o.v.z * dt;
  }
  dGeo.attributes.position.needsUpdate = true;
}
const NSNOW = 500;
const sGeo = new THREE.BufferGeometry(), sPos = new Float32Array(NSNOW * 3);
for (let i = 0; i < NSNOW; i++) { sPos[i * 3] = rnd(-25, 25); sPos[i * 3 + 1] = rnd(-5, 25); sPos[i * 3 + 2] = rnd(-50, 8); }
sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const snowPts = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: .22, map: glowTex, color: 0xeef3ff, transparent: true, opacity: 0, depthWrite: false }));
snowPts.frustumCulled = false; scene.add(snowPts);
const rings = [], ringPool = [];
const RING_GEO = new THREE.RingGeometry(.8, 1, 48);
const newRingMat = () => new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
function ring(at, color, size = 3, normal = null) {
  const m = ringPool.pop() || new THREE.Mesh(RING_GEO, newRingMat());
  m.material.color.set(color).multiplyScalar(1.6);
  m.position.copy(at); m.rotation.set(0, 0, 0);
  if (normal) m.lookAt(tmpV.copy(at).add(normal)); else m.rotation.x = -Math.PI / 2;
  scene.add(m); rings.push({ m, t: 0, size });
}
const popEls = [];
function pop(text, at, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; $('#pops').appendChild(el);
  popEls.push({ el, p: at.clone(), t: 0 });
  if (popEls.length > 7) { popEls[0].el.remove(); popEls.shift(); }
}
const tmpV = new THREE.Vector3();
const popV = new THREE.Vector3();
function stepPops(dt) {
  for (let i = popEls.length - 1; i >= 0; i--) {
    const o = popEls[i]; o.t += dt;
    if (o.t > 1.15) { o.el.remove(); popEls.splice(i, 1); continue; }
    popV.copy(o.p); popV.y += o.t * 1.6; popV.project(camera);
    const x = (popV.x * .5 + .5) * innerWidth, y = (-popV.y * .5 + .5) * innerHeight;
    o.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${o.t < .12 ? .6 + o.t * 3.3 : 1})`;
    o.el.style.opacity = o.t > .8 ? 1 - (o.t - .8) / .35 : 1;
  }
}

// ---------------------------------------------------------------- sound
let ac = null, master = null, noiseBuf = null, muted = store.get('summit-muted', false), chargeOsc = null, chargeGain = null, engineOsc = null, engineGain = null;
function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * .8, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .5;
    const gn = ac.createGain(); gn.gain.value = .05; src.connect(f); f.connect(gn); gn.connect(master); src.start();
    const lfo = ac.createOscillator(); lfo.frequency.value = .08; const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    chargeOsc = ac.createOscillator(); chargeOsc.type = 'sawtooth'; chargeOsc.frequency.value = 60;
    const cf = ac.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 700;
    chargeGain = ac.createGain(); chargeGain.gain.value = 0; chargeOsc.connect(cf); cf.connect(chargeGain); chargeGain.connect(master); chargeOsc.start();
    engineOsc = ac.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 38;
    const ef = ac.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 180;
    engineGain = ac.createGain(); engineGain.gain.value = 0; engineOsc.connect(ef); ef.connect(engineGain); engineGain.connect(master); engineOsc.start();
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
  thud(i) { const e = clamp(i / 16, 0, 1); tone(38 + e * 26, 'sine', .3 + e * .6, .38, .45); noise(.1 + e * .25, .2, 220 + e * 220, .7, 'lowpass'); },
  strike(c) { tone(55, 'sine', .9, .45, .35); noise(.35 + c * .25, .16, 1200, .7); tone(120 + c * 140, 'square', .08, .16, .5); noise(.2, .4, 260, .5, 'lowpass', .02); tone(880 + c * 400, 'triangle', .05, .5, .98, .01); },
  perfect() { [0, 7, 12, 19].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 'triangle', .12, .35, 0, i * .045)); },
  whiff() { noise(.12, .2, 1800, 1.2); },
  step() { tone(62, 'sine', .12, .12, .6); noise(.04, .08, 400, .8, 'lowpass'); },
  block() { tone(150, 'triangle', .22, .16, .7); noise(.14, .1, 1100, 1); },
  bonk() { tone(110, 'triangle', .28, .2, .6); noise(.18, .12, 800, 1); },
  clang() { tone(330, 'square', .08, .3, .7); tone(510, 'triangle', .1, .4, .8); noise(.2, .12, 3000, 2); },
  cell(t) { const f = [988, 1318, 1760][t]; tone(f, 'sine', .14, .22); tone(f * 1.5, 'sine', .08, .3, 0, .06); },
  camp() { noise(.2, 1.4, 900, .3); [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 'triangle', .15, .6, 0, i * .07)); tone(98, 'sine', .5, .9, .5); },
  perk() { [0, 7, 12].forEach((n, i) => tone(660 * Math.pow(2, n / 12), 'sine', .13, .3, 0, i * .06)); },
  lost() { [7, 3, 0, -5].forEach((n, i) => tone(220 * Math.pow(2, n / 12), 'sawtooth', .08, .45, .85, i * .16)); noise(.3, 1.2, 160, .5, 'lowpass'); },
  hurt() { tone(160, 'square', .15, .2, .4); noise(.25, .25, 500, .6, 'lowpass'); },
  rockfall() { noise(.1, .7, 200, .5, 'lowpass'); },
  save() { [12, 16, 19].forEach((n, i) => tone(440 * Math.pow(2, n / 12), 'triangle', .12, .3, 0, i * .05)); },
  over() { [12, 7, 3, 0].forEach((n, i) => tone(330 * Math.pow(2, n / 12), 'triangle', .14, .5, 0, i * .14)); },
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ---------------------------------------------------------------- perks (advantages earned at camps)
const PERKS = {
  power:    { name: 'Heavy Fist', desc: 'Punches hit 15% harder.', max: 3, ic: '⚒', col: '#ff8a3a', chip: 'POWER' },
  reach:    { name: 'Long Arm', desc: 'Bigger strike range.', max: 3, ic: '◎', col: '#3ef6ff', chip: 'REACH' },
  quick:    { name: 'Quick Wind-up', desc: 'Charge up 35% faster.', max: 2, ic: '»', col: '#ffc23a', chip: 'QUICK' },
  arc:      { name: 'Foresight', desc: 'See where your throw will land while winding up.', max: 1, ic: '⌒', col: '#9fe870', chip: 'ARC' },
  focus:    { name: 'Focus', desc: 'Time slows while you wind up near the boulder.', max: 1, ic: '◔', col: '#a77bff', chip: 'FOCUS' },
  shield:   { name: 'Bronze Armour', desc: 'Shrug off one hit per stage from rocks or stone blocks.', max: 1, ic: '⛨', col: '#c9d2de', chip: 'ARMOUR' },
  backstop: { name: 'Backstop', desc: 'Once per stage, catch a boulder that gets past you.', max: 1, ic: '↺', col: '#ff3fb4', chip: 'SAVE' },
  spare:    { name: 'Spare Boulder', desc: '+1 boulder now and +1 max.', max: 2, ic: '●', col: '#ff8a3a', chip: 'SPARE' },
  magnet:   { name: 'Lodestone', desc: 'Coins drift toward the boulder.', max: 1, ic: 'Ʊ', col: '#3ef6ff', chip: 'MAGNET' },
  steady:   { name: 'Sure Footing', desc: 'Faster steering. Bumps don\'t break your combo.', max: 1, ic: '≡', col: '#9fe870', chip: 'TRACKS' },
};
const perkLv = () => Object.fromEntries(Object.keys(PERKS).map(k => [k, 0]));
let perkChoices = null;
function offerPerks(campK) {
  const pool = Object.keys(PERKS).filter(k => S.perks[k] < PERKS[k].max);
  const pick = [];
  while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  if (!pick.length) return;
  perkChoices = pick; mode = 'perk';
  P.charging = false; P.charge = 0; drag = null; $('#touch').classList.remove('on');
  $('#pTitle').textContent = `CAMP ${campK}`;
  const box = $('#pCards'); box.innerHTML = '';
  for (const k of pick) {
    const p = PERKS[k], b = document.createElement('button'); b.className = 'card';
    b.style.setProperty('--pc', p.col);
    b.innerHTML = `<div class="ic">${p.ic}</div><div><b>${p.name}</b><small>${p.desc}</small>${p.max > 1 ? `<i>LEVEL ${S.perks[k] + 1} / ${p.max}</i>` : ''}</div>`;
    b.addEventListener('click', () => takePerk(k));
    box.appendChild(b);
  }
  $('#perks').classList.remove('hide');
}
function takePerk(k) {
  S.perks[k]++;
  if (k === 'spare') { S.maxLives++; S.lives++; }
  if (k === 'shield') S.shieldReady = true;
  if (k === 'backstop') S.backstopReady = true;
  sfx.perk(); buzz(20);
  $('#perks').classList.add('hide'); perkChoices = null; mode = 'play'; S.grace = 1.2;
  pop(PERKS[k].name.toUpperCase(), P.p.clone().setY(P.p.y + 4), 'big');
  chips();
}
function chips() {
  const el = $('#perkChips'); el.innerHTML = '';
  for (const k of Object.keys(PERKS)) {
    if (!S.perks[k]) continue;
    const s = document.createElement('span');
    s.textContent = PERKS[k].chip + (PERKS[k].max > 1 ? ' ' + S.perks[k] : '');
    if ((k === 'shield' && !S.shieldReady) || (k === 'backstop' && !S.backstopReady)) s.className = 'off';
    el.appendChild(s);
  }
}

// ---------------------------------------------------------------- game state
let mode = 'title';
const S = { score: 0, bonus: 0, maxAlt: 0, lives: 3, maxLives: 3, mult: 1, perfects: 0, cells: 0, camps: 0, stage: 0, time: 0, tumbleT: 4,
  longest: 0, perks: perkLv(), shieldReady: false, backstopReady: false, grace: 0, pendingPerk: 0, hitstop: 0, best: store.get('summit-best-v3', 0) };
const cam = { x: 0, y: 5, z: 8, shake: 0, lookY: 0, lookX: 0, kick: 0 };
function resetWorld() {
  for (const c of [...chunks.keys()]) { disposeGroup(chunks.get(c)); chunks.delete(c); }
  for (const arr of [rocks, gates, cells]) { for (const o of arr) disposeGroup(o.mesh); arr.length = 0; }
  for (const c of camps) disposeGroup(c.mesh); camps.length = 0;
  for (const t of tumblers) scene.remove(t.mesh); tumblers.length = 0;
  builtStages.clear(); work.length = 0; queued.clear();
  Object.assign(P, { d: 0, off: 0, toff: 0, stun: 0, stagger: 0, charge: 0, charging: false, release: 0, cool: 0, bumpCool: 0, guard: 0, block: 0, cheer: 0, bonk: 0, coil: 0, punchT: -1, air: -1 });
  P.p.set(xc(0), G(0, xc(0)), 0);
  placeBall(11, 0, .5);
  updateChunks(0, true);
}
function placeBall(d, off, lift = 3) {
  const x = xc(d) + off;
  ball.p.set(x, G(d, x) + ball.r + lift, -d); ball.v.set(0, 0, 0); ball.lost = 0; ball.heat = 0; ball.flying = false;
}
function start() {
  if (mode === 'play' || mode === 'perk') return;
  audio();
  Object.assign(S, { score: 0, bonus: 0, maxAlt: 0, lives: 3, maxLives: 3, mult: 1, perfects: 0, cells: 0, camps: 0, stage: 0, time: 0, tumbleT: 4, longest: 0, perks: perkLv(), shieldReady: false, backstopReady: false, grace: 1.5, pendingPerk: 0, hitstop: 0 });
  resetWorld(); chips();
  mode = 'play';
  window.BounceLab && BounceLab.start();
  $('#title').classList.add('hide'); $('#over').classList.add('hide'); $('#hud').classList.remove('hide');
  banner('THE FOOTHILLS', 'Hold anywhere to wind up · slide to steer · let go to punch');
  hud();
}
const QUOTES = ['One must imagine Sisyphus happy.', 'The struggle itself toward the heights is enough to fill a heart.', 'The summit was always a little further.', 'He was bored anyway.', 'Back to the bottom. Again.', 'Sisyphus yawns.'];
function gameOver() {
  mode = 'over'; sfx.over(); drag = null; P.charging = false; $('#touch').classList.remove('on');
  if (chargeGain) chargeGain.gain.value = 0;
  const score = S.score, isBest = score > S.best;
  if (isBest) { S.best = score; store.set('summit-best-v3', score); }
  $('#oScore').textContent = score;
  $('#oBest').textContent = isBest ? 'New best!' : 'Best ' + S.best;
  $('#oAlt').textContent = Math.round(S.maxAlt) + ' m';
  $('#oCamps').textContent = S.camps;
  $('#oPerf').textContent = S.perfects;
  $('#oThrow').textContent = Math.round(S.longest) + ' m';
  $('#oShards').textContent = S.cells;
  $('#oQuote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  window.BounceLab && BounceLab.gameOver(score, { altitude: Math.round(S.maxAlt), camps: S.camps, perfects: S.perfects, longest: Math.round(S.longest) });
  $('#over').classList.remove('hide'); $('#hud').classList.add('hide'); $('#perkChips').innerHTML = '';
}
function banner(t, s) {
  $('#bTitle').textContent = t; $('#bSub').textContent = s || '';
  const b = $('#banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let livesShown = '';
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function hud() {
  setText('#score', String(S.score));
  const nextCamp = stageAt(P.d) + 1;
  setText('#alt', `${Math.max(0, Math.round(H(P.d)))} m · ${speedNow().toFixed(1)} m/s`);
  setText('#campT', `CAMP ${nextCamp}`);
  $('#progFill').style.transform = `scaleX(${clamp((P.d - (nextCamp - 1) * CFG.stageLen) / CFG.stageLen, 0, 1).toFixed(3)})`;
  setText('#mult', '×' + S.mult); $('#mult').classList.toggle('hot', S.mult > 1);
  const key = S.lives + '/' + S.maxLives;
  if (livesShown !== key) { const l = $('#lives'); l.innerHTML = ''; for (let i = 0; i < S.maxLives; i++) { const e = document.createElement('i'); if (i >= S.lives) e.style.opacity = .2; l.appendChild(e); } livesShown = key; }
}
function addPoints(n, at, label, cls) { const v = Math.round(n * S.mult); S.bonus += v; pop(label ? label.replace('#', v) : '+' + v, at, cls || ''); }
const speedNow = () => Math.min(CFG.speedMax, CFG.speed0 + CFG.speedStep * stageAt(P.d));

// ---------------------------------------------------------------- input
let drag = null;
const touchEl = $('#touch'), powerEl = $('#power');
const isUI = t => t && t.closest && t.closest('.ui');
function beginCharge() { if (mode !== 'play' || P.stun > 0 || ball.lost) return; P.charging = true; }
function endCharge() { if (!P.charging) return; P.charging = false; strike(P.charge, false); P.charge = 0; }
// one finger does everything: press anywhere to wind up, slide to steer while holding, let go to punch (a tap is a quick jab)
window.addEventListener('pointerdown', e => {
  audio();
  if (isUI(e.target) || mode !== 'play' || drag) return;
  e.preventDefault();
  drag = { id: e.pointerId, x: e.clientX };
  beginCharge();
  touchEl.style.left = e.clientX + 'px'; touchEl.style.top = e.clientY + 'px'; touchEl.classList.add('on');
}, { passive: false });
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const k = (CFG.hw * 2 * CFG.dragGain) / Math.min(innerWidth, 520);
  P.toff += (e.clientX - drag.x) * k;
  drag.x = e.clientX;
  touchEl.style.left = e.clientX + 'px'; touchEl.style.top = e.clientY + 'px';
});
function endPointer(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null; touchEl.classList.remove('on');
  endCharge();
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
const keys = {};
window.addEventListener('keydown', e => {
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'play') beginCharge(); else if (mode !== 'perk') start(); }
  else if (e.code === 'Enter' && mode !== 'play' && mode !== 'perk') start();
  else if (mode === 'perk' && /^Digit[123]$/.test(e.code) && perkChoices) { const i = +e.code.slice(5) - 1; if (perkChoices[i]) takePerk(perkChoices[i]); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') endCharge(); });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
$('#playBtn').addEventListener('click', start);
$('#againBtn').addEventListener('click', start);
$('#mute').addEventListener('click', () => { muted = !muted; store.set('summit-muted', muted); $('#mute').textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : .55; });
$('#mute').textContent = muted ? '🔇' : '🔊';
$('#bestT').textContent = S.best ? 'Best ' + S.best : '';
document.addEventListener('visibilitychange', () => { if (document.hidden && P.charging) { P.charging = false; P.charge = 0; } });

// ---------------------------------------------------------------- strike
const axisPt = new THREE.Vector3(), nrm = new THREE.Vector3();
function ballGap() { // the crawler body as an upright capsule
  axisPt.set(P.p.x, clamp(ball.p.y, P.p.y + .3, P.p.y + CFG.bodyH), P.p.z);
  nrm.subVectors(ball.p, axisPt);
  const d = nrm.length() || 1e-4; nrm.divideScalar(d);
  return d - CFG.bodyR - ball.r;
}
const reachNow = () => CFG.reach + .6 * S.perks.reach;
function strikeVel(c, perfect, out) {
  const power = (1 + .15 * S.perks.power) * (perfect ? 1.2 : 1) * (1 + Math.min(stageAt(P.d), 8) * .02);
  const fwd = lerp(CFG.fwdMin, CFG.fwdMax, c) * power + speedNow() * .3, up = lerp(CFG.upMin, CFG.upMax, c) * power;
  // aim down the road: head for where the road will be when it lands, plus a nudge from where you hit it
  const bd = -ball.p.z, T = 1.6 * up / CFG.g, land = bd + fwd * T;
  const follow = (xc(land) - ball.p.x) / T * .85;
  const aim = (clamp((ball.p.x - P.p.x) * .8, -3.5, 3.5) + P.v.x * .25) * (1 - .5 * ridgeAmt(bd));
  return out.set(follow + aim, up, -fwd);
}
function strike(charge, auto) {
  if (mode !== 'play' || P.stun > 0 || ball.lost) return;
  const gap = ballGap(), ahead = -ball.p.z > P.d - .4;
  P.release = 1; P.punchT = 0; P.punchPow = Math.max(.3, charge);
  const c = Math.max(.12, charge);
  if (gap < reachNow() && ahead) {
    P.cool = .25;
    const perfect = !auto && gap < CFG.perfectGap + .25 * S.perks.reach && c > .5;
    strikeVel(c, perfect, ball.v);
    ball.heat = perfect ? 1.4 : .5 + c * .5; ball.flying = true; ball.throwFrom = -ball.p.z;
    ball.spinAxis.set(1, 0, 0); ball.spin = -8;
    const at = ball.p.clone().addScaledVector(nrm, -ball.r);
    burst(at, perfect ? 50 : 20 + c * 24, perfect ? 0xffc23a : 0xffa060, perfect ? 12 : 8, new THREE.Vector3(0, .6, -1));
    dust(at, 16, 5);
    ring(at, perfect ? 0xffc23a : 0xffffff, perfect ? 5.5 : 3 + c * 1.5, new THREE.Vector3(0, .3, 1));
    cam.shake = .25 + c * .3 + (perfect ? .2 : 0); cam.kick = .6 + c;
    S.hitstop = perfect ? .12 : .04 + c * .05;   // a heavy hit freezes for a beat
    sfx.strike(c); buzz(perfect ? [25, 30, 40] : 18 + c * 25);
    if (perfect) { sfx.perfect(); S.perfects++; S.mult = Math.min(6, S.mult + 1); P.cheer = 1.4; addPoints(50, ball.p, 'PERFECT +#', 'perfect'); }
    else if (c > .85) pop('FULL POWER', ball.p.clone().setY(ball.p.y + 2), 'dim');
  } else {
    P.cool = .3; sfx.whiff();
    if (gap < reachNow() + 4) pop('too early', P.p.clone().setY(P.p.y + 3.5), 'dim');
  }
}

// ---------------------------------------------------------------- physics
const n3 = new THREE.Vector3(), c3 = new THREE.Vector3(), q = new THREE.Quaternion(), gv = new THREE.Vector3();
function bounceOff(o, n, vel, e, impactFn) {
  const vn = o.v.dot(n) - (vel ? vel.dot(n) : 0);
  if (vn < 0) { o.v.addScaledVector(n, -(1 + e) * vn); if (impactFn) impactFn(-vn); }
}
function cornerCollide(o, cx, cy, cz, e, impactFn) {
  c3.set(cx, cy, cz); n3.subVectors(o.p, c3);
  const d = n3.length();
  if (d < o.r && d > 1e-4) { n3.divideScalar(d); o.p.addScaledVector(n3, o.r - d); bounceOff(o, n3, null, e, impactFn); }
}
const dustAt = new THREE.Vector3();
const ballImpact = s => {
  if (s > 2.5) { sfx.thud(s); cam.shake = Math.max(cam.shake, clamp(s / 40, 0, .3)); dustAt.copy(ball.p).setY(ball.p.y - ball.r * .85); dust(dustAt, Math.min(20, s | 0), s * .35); buzz(s > 10 ? 14 : 0); }
  if (ball.flying) { ball.flying = false; const dist = -ball.p.z - ball.throwFrom; if (dist > 6 && ball.p.y > H(-ball.p.z) - 2) { S.longest = Math.max(S.longest, dist); addPoints(dist * 1.5, ball.p.clone().setY(ball.p.y + 2.2), `${Math.round(dist)} m · +#`, dist > 22 ? 'big' : ''); } }
};
const rockImpact = s => { if (s > 2) { sfx.thud(s * .7); dustAt.copy(c3).addScaledVector(n3, 1); dust(dustAt, 8, 3); } };
const gateImpact = s => { if (s > 1.5) { sfx.clang(); burst(c3, 12, 0xffd27a, 5); cam.shake = Math.max(cam.shake, .15); } };
function stepSphere(o, dt, isBall) {
  o.v.y -= CFG.g * dt;
  o.p.addScaledVector(o.v, dt);
  const d = -o.p.z, impact = isBall ? ballImpact : null;
  o.grounded = false;
  let gap = inGap(d);
  const offX = o.p.x - xc(d);
  const bridged = gap && onBridge(gap, offX);
  if (!gap || bridged) {
    let h, gdx = 0, gdd = 0;
    if (bridged) { h = bridgeY(gap, d, o.p.x); gdd = (G(gap.d1, o.p.x) - G(gap.d0, o.p.x)) / (gap.d1 - gap.d0); gap = null; }
    else {
      h = G(d, o.p.x); gdx = Gx(d, o.p.x); gdd = Gd(d, o.p.x);
      const rg = rampAt(d, offX);
      if (rg) { h += RAMP_H * (d - (rg.d0 - RAMP_L)) / RAMP_L; gdd += RAMP_H / RAMP_L; }
    }
    n3.set(-gdx, 1, gdd).normalize();
    const dist = (o.p.y - h) * n3.y;
    if (dist < o.r && dist > -o.r * 3) {
      o.p.addScaledVector(n3, o.r - dist);
      const vn = o.v.dot(n3);
      if (vn < 0) { const s = -vn, e = s > 2.4 ? o.bounce : 0; o.v.addScaledVector(n3, -(1 + e) * vn); if (impact) impact(s); }
      o.v.multiplyScalar(1 - o.roll * dt);
      o.grounded = true;
    }
  } else {
    cornerCollide(o, o.p.x, G(gap.d0, o.p.x), -gap.d0, .3, impact);
    cornerCollide(o, o.p.x, G(gap.d1, o.p.x), -gap.d1, .3, impact);
  }
  for (const r of rocks) {
    if (Math.abs(r.d - d) > r.r + o.r + 1) continue;
    c3.set(r.x, r.cy, -r.d); n3.subVectors(o.p, c3);
    const dd = n3.length(), min = r.r * .95 + o.r;
    if (dd < min && dd > 1e-4) { n3.divideScalar(dd); o.p.addScaledVector(n3, min - dd); bounceOff(o, n3, null, .4, isBall ? rockImpact : null); }
  }
  for (const g of gates) {
    if (Math.abs(g.d - d) > 2 + o.r) continue;
    const gy = G(g.d, g.x);
    c3.set(clamp(o.p.x, g.x - g.w / 2, g.x + g.w / 2), clamp(o.p.y, gy, gy + g.h), clamp(o.p.z, -g.d - .45, -g.d + .45));
    n3.subVectors(o.p, c3); const dd = n3.length();
    if (dd < o.r) {
      if (dd < 1e-4) n3.set(0, 0, 1); else n3.divideScalar(dd);
      o.p.addScaledVector(n3, o.r - dd);
      bounceOff(o, n3, gv.set(g.vx, 0, 0), .5, isBall ? gateImpact : null);
    }
  }
  if (o.grounded) {
    gv.set(0, 1, 0).cross(o.v); const sp = gv.length();
    if (sp > 1e-3) { o.spinAxis.copy(gv).divideScalar(sp); o.spin = sp / o.r; } else o.spin = 0;
  } else o.spin *= (1 - .3 * dt);
  if (Math.abs(o.spin) > 1e-3) { q.setFromAxisAngle(o.spinAxis, o.spin * dt); o.mesh.quaternion.premultiply(q); }
}
function sphereSphere(a, b, e) {
  n3.subVectors(b.p, a.p); const d = n3.length(), min = a.r + b.r;
  if (d >= min || d < 1e-4) return 0;
  n3.divideScalar(d);
  const tot = a.m + b.m, pen = min - d;
  a.p.addScaledVector(n3, -pen * b.m / tot); b.p.addScaledVector(n3, pen * a.m / tot);
  const rv = gv.subVectors(b.v, a.v).dot(n3);
  if (rv >= 0) return 0;
  const j = -(1 + e) * rv / (1 / a.m + 1 / b.m);
  a.v.addScaledVector(n3, -j / a.m); b.v.addScaledVector(n3, j / b.m);
  return -rv;
}
function hitTitan(what) {
  if (S.shieldReady) { S.shieldReady = false; chips(); sfx.save(); pop('ARMOUR', P.p.clone().setY(P.p.y + 3.5), 'big'); ring(P.p.clone().setY(P.p.y + 1.5), 0xc9d2de, 3); return; }
  P.stun = .7; sfx.hurt(); buzz([30, 40, 30]); cam.shake = .45;
  $('#flash').classList.add('on'); setTimeout(() => $('#flash').classList.remove('on'), 60);
  pop(what, P.p.clone().setY(P.p.y + 3.5), 'bad');
  S.mult = Math.max(1, S.mult - 1);
}
const prevP = new THREE.Vector3();
function stepTitan(dt) {
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (kx) P.toff += kx * 12 * dt;
  const hw = hwAt(P.d);
  P.toff = clamp(P.toff, -hw + .9, hw - .9);
  P.stun = Math.max(0, P.stun - dt); P.stagger = Math.max(0, P.stagger - dt);
  prevP.copy(P.p);
  const sp = speedNow() * (P.stun > 0 ? .35 : P.stagger > 0 ? .55 : 1) * (S.grace > 0 ? .5 : 1);
  P.d += sp * dt; P.speedNow = sp;
  const steerMax = CFG.steerMax * (S.perks.steady ? 1.35 : 1);
  P.off += clamp((P.toff - P.off) * CFG.steer * (S.perks.steady ? 1.3 : 1), -steerMax, steerMax) * dt * (P.stun > 0 ? .3 : 1);
  P.off = clamp(P.off, -hwAt(P.d) + .9, hwAt(P.d) - .9);
  const x = xc(P.d) + P.off;
  for (const r of rocks) {
    const dx = x - r.x, dz = -P.d + r.d, dd = Math.hypot(dx, dz), min = r.r * .85 + CFG.bodyR;
    if (dd < min) {
      P.off += (dx >= 0 ? 1 : -1) * (min - Math.abs(dx)) * .25;
      if (!r.hit) { r.hit = 1; hitTitan('CRUNCH'); dustAt.copy(P.p).setY(P.p.y + 1); dust(dustAt, 14, 4); }
    }
  }
  for (const g of gates) {
    if (Math.abs(P.d - g.d) < CFG.bodyR + .45 && Math.abs(x - g.x) < g.w / 2 + CFG.bodyR * .8) {
      if (!g.hit) { g.hit = 1; hitTitan('CLANG'); sfx.clang(); P.stagger = .5; }
    } else if (P.d > g.d + 2) g.hit = 0;
  }
  P.p.set(xc(P.d) + P.off, 0, -P.d);
  P.p.y = G(P.d, P.p.x);
  { const rg = rampAt(P.d, P.off); if (rg) P.p.y += RAMP_H * (P.d - (rg.d0 - RAMP_L)) / RAMP_L; }
  P.air = -1;
  for (const g of gapsFor(stageAt(P.d))) {
    if (P.d < g.d0 - .6 || P.d > g.d1 + .6) continue;
    if (onBridge(g, P.off)) { if (P.d > g.d0 && P.d < g.d1) P.p.y = bridgeY(g, P.d, P.p.x); }
    else { const t = (P.d - (g.d0 - .6)) / (g.d1 - g.d0 + 1.2); P.p.y = lerp(G(g.d0 - .6, P.p.x) + (P.off > g.r0 && P.off < g.r1 ? RAMP_H * (RAMP_L - .6) / RAMP_L : 0), G(g.d1 + .6, P.p.x), t) + (1.1 + (g.d1 - g.d0) * .2) * 4 * t * (1 - t); P.air = t; }
  }
  P.v.subVectors(P.p, prevP).divideScalar(dt);
  if (P.charging) {
    P.charge = Math.min(1, P.charge + dt / (CFG.chargeTime / (1 + .35 * S.perks.quick)));
    if (P.stun > 0) { P.charging = false; P.charge = 0; }
  }
  P.cool = Math.max(0, P.cool - dt); P.bumpCool = Math.max(0, P.bumpCool - dt);
  const gap = ballGap();
  if (gap < 0 && !ball.lost) {
    ball.p.addScaledVector(nrm, -gap);
    if (P.charging) { // guard is up: the left forearm takes it and shoves it back up the hill. Keeps your combo and your wind-up.
      const rel = gv.subVectors(ball.v, P.v).dot(nrm);
      if (rel < 0) ball.v.addScaledVector(nrm, -(1 + .15) * rel);
      if (P.bumpCool <= 0) {
        P.bumpCool = .45; P.block = 1; P.stagger = .2;
        const bd = -ball.p.z;
        ball.v.set((xc(bd + 6) - ball.p.x) * .6, 5, -(speedNow() + 5));
        ball.flying = false;
        sfx.block(); dustAt.copy(ball.p).addScaledVector(nrm, -ball.r); dust(dustAt, 8, 3); cam.shake = Math.max(cam.shake, .15);
        pop('block', ball.p.clone().setY(ball.p.y + 2.2), 'dim');
      }
    } else {
      const rel = gv.subVectors(ball.v, P.v).dot(nrm);
      if (rel < 0) ball.v.addScaledVector(nrm, -(1 + .15) * rel);
      if (P.bumpCool <= 0) {
        P.bumpCool = .45; P.stagger = .35; P.bonk = 1;
        const bd = -ball.p.z;
        ball.v.set(xcp(bd) * 6 + (rnd(-2.5, 2.5) + (ball.p.x - P.p.x)) * (1 - .6 * ridgeAmt(bd)), 6, -(speedNow() + 4));
        ball.flying = false;
        sfx.bonk(); dustAt.copy(ball.p).addScaledVector(nrm, -ball.r); dust(dustAt, 10, 3); cam.shake = Math.max(cam.shake, .2);
        pop('bonk', ball.p.clone().setY(ball.p.y + 2.2), 'dim');
        if (!S.perks.steady) S.mult = 1;
      }
    }
  }
}

// ---------------------------------------------------------------- main update
function update(dt) {
  S.time += dt; S.grace = Math.max(0, S.grace - dt);
  stepTitan(dt);
  for (const g of gates) { const nx = xc(g.d) + g.amp * Math.sin(S.time * g.speed + g.phase); g.vx = (nx - g.x) / dt; g.x = nx; }
  stepSphere(ball, dt, true);
  for (const t of tumblers) {
    stepSphere(t, dt, false);
    const sp = t.v.length(); if (sp > 14) t.v.multiplyScalar(14 / sp);
    const hit = sphereSphere(t, ball, .35);
    if (hit > 3 && !ball.lost) { sfx.thud(hit * .8); dust(ball.p, 10, 4); }
    const dx = t.p.x - P.p.x, dz = t.p.z - P.p.z, dd = Math.hypot(dx, dz);
    if (dd < t.r + CFG.bodyR && t.p.y < P.p.y + CFG.bodyH + t.r && !t.dead) {
      t.dead = true; hitTitan('ROCKFALL'); dust(t.p, 18, 5);
      t.v.set(dx / dd * 6, 5, Math.abs(t.v.z) * .3);
    }
  }
  for (let i = tumblers.length - 1; i >= 0; i--) {
    const t = tumblers[i];
    if (-t.p.z < P.d - 14 || t.p.y < H(-t.p.z) - 18) { scene.remove(t.mesh); tumblers.splice(i, 1); }
  }
  const st = stageDef(stageAt(P.d));
  if (st.tumble > 0) {
    S.tumbleT -= dt;
    if (S.tumbleT <= 0) { S.tumbleT = Math.max(1.4, (3.6 - Math.min(stageAt(P.d), 10) * .1) / st.tumble) * rnd(.7, 1.3); spawnTumbler(P.d + rnd(45, 65)); sfx.rockfall(); }
  }
  for (const s of cells) {
    if (s.taken) continue;
    const sp = s.mesh.position;
    if (S.perks.magnet && ball.p.distanceTo(sp) < 8 && !ball.lost) { gv.subVectors(ball.p, sp).multiplyScalar(dt * 3); s.off += gv.x; s.y += gv.y; s.d -= gv.z; }
    const byBall = ball.p.distanceTo(sp) < ball.r + .7;
    const byTitan = Math.hypot(P.p.x - sp.x, P.p.z - sp.z) < CFG.bodyR + .5 && sp.y < P.p.y + 3.2;
    if (byBall || byTitan) {
      s.taken = true; S.cells++;
      addPoints(CELL[s.tier].val * (byBall ? 1 : .5), sp, null, s.tier ? 'big' : '');
      sfx.cell(s.tier); burst(sp, 18, CELL[s.tier].col, 5, null, 4);
      s.mesh.visible = false;
    }
  }
  for (const c of camps) {
    if (!c.reached && P.d > c.d) {
      c.reached = true; S.camps = Math.max(S.camps, c.k);
      const bonus = 150 * c.k;
      S.bonus += bonus * S.mult;
      if (S.lives < S.maxLives) S.lives++;
      if (S.perks.shield) S.shieldReady = true;
      if (S.perks.backstop) S.backstopReady = true;
      sfx.camp(); buzz([20, 40, 20, 40, 60]);
      dustAt.copy(P.p).setY(P.p.y + 4); burst(dustAt, 40, 0xffc870, 9, new THREE.Vector3(0, 1, 0), 9, [.5, 1.1]);
      const next = stageDef(c.k);
      banner(`CAMP ${c.k} · ${next.name.toUpperCase()}`, next.note);
      pop(`+${bonus * S.mult}`, P.p.clone().setY(P.p.y + 5), 'big');
      chips();
      if (!ball.lost) offerPerks(c.k); else S.pendingPerk = c.k;
      return;
    }
  }
  if (!ball.lost) {
    const bd = -ball.p.z;
    let why = '';
    if (ball.p.y < H(bd) - 6) why = nearGap(bd, 5) ? 'INTO THE CREVASSE' : 'OVER THE EDGE';
    else if (bd < P.d - 3) why = 'IT GOT PAST YOU';
    if (why === 'IT GOT PAST YOU' && S.backstopReady) {
      S.backstopReady = false; chips(); sfx.save();
      placeBall(P.d + 9, P.off * .5, 2.5);
      pop('BACKSTOP', P.p.clone().setY(P.p.y + 4), 'big');
      ring(ball.p, 0xff3fb4, 4);
    } else if (why) {
      ball.lost = 1.8; ball.lostWhy = why; S.mult = 1;
      sfx.lost(); buzz([60, 50, 90]);
      pop(why, P.p.clone().setY(P.p.y + 4.5), 'bad');
    }
  } else {
    ball.lost -= dt;
    if (ball.lost <= 0) {
      S.lives--;
      if (S.lives <= 0) { ball.lost = 0; gameOver(); return; }
      let d = P.d + 12; while (nearGap(d, 4)) d += 1.5;
      placeBall(d, P.off * .4, 3);
      for (const t of tumblers) if (Math.abs(-t.p.z - d) < 10) t.p.y -= 100;
      banner(S.lives === 1 ? 'LAST BOULDER' : 'A NEW BOULDER', S.lives === 1 ? 'Make it count.' : `${S.lives} left`);
      if (S.pendingPerk) { const k = S.pendingPerk; S.pendingPerk = 0; offerPerks(k); }
    }
  }
  if (!ball.lost) S.maxAlt = Math.max(S.maxAlt, H(Math.min(-ball.p.z, P.d + 30)));
  S.score = Math.round(S.maxAlt * 10) + S.bonus;
  S.stage = stageAt(P.d);
  updateChunks(P.d);
  cullBehind(P.d);
}

// ---------------------------------------------------------------- visuals per frame
const lookAt = new THREE.Vector3(), scrA = new THREE.Vector3(), scrB = new THREE.Vector3(), scrC = new THREE.Vector3();
const NIGHT_TOP = new THREE.Color(0x060a18), NIGHT_HOR = new THREE.Color(0x2b3956), DAWN_TOP = new THREE.Color(0x24375c), DAWN_HOR = new THREE.Color(0xf2a36e);
const CLOUD_NIGHT = new THREE.Color(0x2a3246), CLOUD_DAWN = new THREE.Color(0xf3d2c0);
const MOON_COL = new THREE.Color(0xdfe8ff), SUN_COL = new THREE.Color(0xffc796), HEMI_NIGHT = new THREE.Color(0x9fb4d8), HEMI_DAWN = new THREE.Color(0xffd6b8);
const HAZE = new THREE.Color(0x56627a), fogCol = new THREE.Color(), arcV = new THREE.Vector3(), arcP = new THREE.Vector3();
function predictArc() {
  strikeVel(Math.max(.12, P.charge), false, arcV);
  arcP.copy(ball.p);
  const pos = arcGeo.attributes.position;
  let landed = false, i = 0;
  for (let s = 0; s < 240 && i < ARC_N; s++) {
    arcV.y -= CFG.g / 60; arcP.addScaledVector(arcV, 1 / 60);
    if (s % 3 === 0) pos.setXYZ(i++, arcP.x, arcP.y, arcP.z);
    const d = -arcP.z;
    if (!openGap(d, arcP.x) && arcP.y - ball.r < G(d, arcP.x)) { landed = true; break; }
    if (arcP.y < H(d) - 6) break;
  }
  for (; i < ARC_N; i++) pos.setXYZ(i, arcP.x, arcP.y, arcP.z);
  pos.needsUpdate = true;
  const d = -arcP.z, bad = !landed || openGap(d, arcP.x) || Math.abs(arcP.x - xc(d)) > hwAt(d) + 1;
  arcLand.position.set(arcP.x, G(d, arcP.x) + .1, arcP.z); arcLand.rotation.set(-Math.PI / 2, 0, 0);
  arcLand.material.color.setRGB(1, bad ? .3 : .8, bad ? .2 : .4).multiplyScalar(1.6);
}
function render(dt, t) {
  // Sisyphus: walk, wind up, punch, guard; turns to follow the road
  const c = P.charging ? P.charge : 0;
  P.release = Math.max(0, P.release - dt * 3.2);
  poseFigure(dt, t, mode === 'play' ? (P.speedNow || speedNow()) : 0);
  const g = P.group;
  g.position.copy(P.p);
  P.yaw = lerp(P.yaw, -Math.atan(xcp(P.d)) - clamp((P.toff - P.off) * .04, -.25, .25), 1 - Math.exp(-8 * dt));
  g.rotation.set(0, P.yaw, 0);
  // see-through when the boulder is behind him from the camera's point of view
  // (only when the boulder's centre is actually inside his outline on screen)
  scrA.copy(ball.p).project(camera); scrB.copy(P.p).project(camera); scrC.copy(P.p).setY(P.p.y + 3.4).project(camera);
  const behind = Math.abs(scrA.x - scrB.x) < .16 && scrA.y > scrB.y && scrA.y < scrC.y && camera.position.distanceToSquared(ball.p) > camera.position.distanceToSquared(P.p);
  P.fade = lerp(P.fade, behind ? .5 : 1, 1 - Math.exp(-10 * dt));
  for (const m of figMats) { m.opacity = P.fade; m.depthWrite = P.fade > .95; }
  const gap = ballGap();
  const inReach = gap < reachNow() && -ball.p.z > P.d - .4 && !ball.lost;
  reachRing.position.set(P.p.x, P.p.y + .08, P.p.z);
  reachRing.rotation.set(-Math.PI / 2 + Math.atan(Hp(P.d)), 0, 0);
  reachRing.scale.setScalar(CFG.bodyR + reachNow() + ball.r * .3);
  reachRing.material.opacity = lerp(reachRing.material.opacity, inReach ? .8 : (P.charging ? .3 : .05), .25);
  // power meter above his head (projected to the screen each frame)
  scrC.copy(P.p).setY(P.p.y + 4.3).project(camera);
  powerEl.style.transform = `translate(${((scrC.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - scrC.y) / 2 * innerHeight - 6).toFixed(1)}px)`;
  powerEl.style.setProperty('--c', P.charge.toFixed(3));
  powerEl.classList.toggle('on', P.charging && mode === 'play');
  powerEl.classList.toggle('reach', inReach);
  powerEl.classList.toggle('full', P.charge > .97);
  if (chargeGain) { chargeGain.gain.value = P.charging ? .03 + P.charge * .05 : 0; chargeOsc.frequency.value = 55 + P.charge * 90; }
  const showArc = S.perks.arc && P.charging && !ball.lost && mode === 'play';
  arc.visible = arcLand.visible = !!showArc;
  if (showArc) predictArc();
  ball.group.position.copy(ball.p);
  ball.heat = Math.max(0, ball.heat - dt * .9);
  ball.mat.emissiveIntensity = ball.heat * 2.4;
  const bd = -ball.p.z, gh = openGap(bd, ball.p.x) ? H(bd) - 12 : G(bd, ball.p.x);
  const above = ball.p.y - ball.r - gh;
  ball.marker.position.set(ball.p.x, gh + .08, ball.p.z);
  ball.marker.rotation.set(-Math.PI / 2 + Math.atan(Hp(bd)), 0, 0);
  ball.marker.scale.setScalar(ball.r * (1 + above * .08));
  ball.marker.material.opacity = clamp((above - 1.5) * .2, 0, .6) * (openGap(bd, ball.p.x) ? 0 : 1);
  for (const tb of tumblers) tb.mesh.position.copy(tb.p);
  for (const s of cells) if (!s.taken) { s.t += dt; s.mesh.rotation.y = s.t * 1.6; s.mesh.position.set(xc(s.d) + s.off, H(s.d) + s.y + Math.sin(s.t * 2.2) * .15, -s.d); s.mesh.visible = s.mesh.position.distanceToSquared(camera.position) > 30; }
  for (const gt of gates) gt.mesh.position.set(gt.x, G(gt.d, gt.x) + gt.h / 2, -gt.d);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / .55; if (k >= 1) { scene.remove(r.m); ringPool.push(r.m); rings.splice(i, 1); continue; }
    r.m.scale.setScalar(.3 + k * r.size); r.m.material.opacity = 1 - k;
  }
  stepParts(dt); stepDust(dt); stepPops(dt);
  // camera: low and close behind the crawler, eases back as you wind up, kicks on impact
  cam.kick = Math.max(0, cam.kick - dt * 4);
  const back = 6.7 + c * 1.1 - cam.kick * .6, up = 4.8 + c * .35, ahead = 18;
  const cd = P.d - back;
  const tx = xc(cd) + P.off * .9 + 1.5, ty = Math.max(H(cd), H(P.d) - 1.2) + up;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-9 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-8 * dt));
  cam.z = lerp(cam.z, -cd, 1 - Math.exp(-12 * dt));
  let ly = H(P.d + ahead) + 2.4;
  if (!ball.lost) ly += Math.max(0, ball.p.y - (G(-ball.p.z, ball.p.x) + 4)) * .3;
  cam.lookY = lerp(cam.lookY, ly, 1 - Math.exp(-4 * dt));
  cam.lookX = lerp(cam.lookX, xc(P.d + ahead) + P.off * .6 + .8, 1 - Math.exp(-5 * dt));
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  const sh = cam.shake * cam.shake;
  camera.position.set(cam.x + rnd(-1, 1) * sh, cam.y + rnd(-1, 1) * sh, cam.z);
  lookAt.set(cam.lookX, cam.lookY, -(P.d + ahead));
  camera.lookAt(lookAt);
  if (window.__camOverride) { const o = window.__camOverride; camera.position.set(P.p.x + o[0], P.p.y + o[1], P.p.z + o[2]); camera.lookAt(P.p.x, P.p.y + o[3], P.p.z); }
  // the climb: dawn comes up as you gain height, the clouds end up below you, the ranges fall away
  const alt = camera.position.y, dawn = smooth(20, 300, alt);
  skyUni.top.value.copy(NIGHT_TOP).lerp(DAWN_TOP, dawn);
  skyUni.horizon.value.copy(NIGHT_HOR).lerp(DAWN_HOR, dawn);
  skyUni.dawn.value = dawn;
  skyGroup.position.copy(camera.position);
  skyUni.sunDir.value.set(.62, lerp(-.08, .16, dawn), -1).normalize();
  sunDisc.position.copy(skyUni.sunDir.value).multiplyScalar(2600);
  sunDisc.material.opacity = smooth(.1, .4, dawn);
  stars.material.opacity = .8 * (1 - smooth(.2, .75, dawn));
  sun.color.copy(MOON_COL).lerp(SUN_COL, dawn); sun.intensity = 1.9 + dawn * .8;
  sun.position.set(camera.position.x - 16, camera.position.y + 24 - dawn * 8, camera.position.z + 16 - dawn * 10); // key light from behind the camera so his back and the road get real shading
  sun.target.position.set(camera.position.x, camera.position.y - 5, camera.position.z - 16);
  hemi.color.copy(HEMI_NIGHT).lerp(HEMI_DAWN, dawn * .6); hemi.intensity = .75 + dawn * .35;
  far.position.set(camera.position.x, 0, camera.position.z);
  summit.material.emissive.copy(skyUni.horizon.value).multiplyScalar(.16 + dawn * .14);
  summit.userData.beacon.material.opacity = .75 + Math.sin(t * 7.3) * .08 + Math.sin(t * 11.1) * .06;
  farMat.emissive.copy(skyUni.horizon.value).multiplyScalar(.12 + dawn * .1);
  const cloudNear = 1 - smooth(6, 26, Math.abs(alt - CFG.cloudY));   // in the cloud layer
  // once you're through the clouds they stay a little below you: a sea of cloud to the right of the road
  const cy = Math.max(CFG.cloudY, alt - 34);
  clouds.forEach((cl, i) => {
    cl.position.set(camera.position.x, cy + i * 7, camera.position.z);
    cl.material.map.offset.set(camera.position.x / 1000 + t * .002 * (i + 1), -camera.position.z / 1000);
    cl.material.color.copy(CLOUD_NIGHT).lerp(CLOUD_DAWN, dawn);
    cl.material.opacity = (i ? .45 : .85) * (1 - cloudNear);
  });
  fogCol.copy(skyUni.horizon.value).lerp(HAZE, .55 + dawn * .15).multiplyScalar(.75 + dawn * .2).lerp(clouds[0].material.color, cloudNear * .8);
  scene.fog.color.copy(fogCol);
  { const u = summit.userData.uni; u.uAlt.value = alt; u.hazeCol.value.copy(fogCol); u.hazeMin.value = cloudNear * .97; }
  scene.fog.near = lerp(30, 4, cloudNear); scene.fog.far = lerp(190 + dawn * 120, 55, cloudNear);
  for (let i = flames.length - 1; i >= 0; i--) {
    const f = flames[i]; if (!f.parent || !f.parent.parent || !f.parent.parent.parent) { flames.splice(i, 1); continue; }
    const u = f.userData, n = Math.sin(t * 13 + u.ph) * .5 + Math.sin(t * 23.7 + u.ph * 2) * .3 + Math.sin(t * 5.1 + u.ph) * .2;
    u.s0.scale.set(1.3 + n * .12, 2.1 + n * .35, 1); u.s1.scale.set(.8 - n * .06, 1.4 + n * .25, 1); u.s0.position.x = n * .05;
  }
  haloMats.forEach((m, i) => { m.opacity = .35 + .65 * Math.pow(.5 + .5 * Math.sin(t * 3.1 + i * 2), 4); m.rotation = t * .6; });
  const blink = (Math.sin(t * 6) > 0) ? 1 : .15;
  for (let i = blinkers.length - 1; i >= 0; i--) { const b = blinkers[i]; if (!b.parent || !b.parent.parent) { blinkers.splice(i, 1); continue; } b.material.opacity = blink; }
  const sAmt = smooth(110, 200, alt);
  snowPts.material.opacity = sAmt * .9;
  if (sAmt > 0) {
    const sp = sGeo.attributes.position;
    for (let i = 0; i < NSNOW; i++) {
      let y = sp.getY(i) - dt * (1.6 + (i % 5) * .3);
      if (y < -6) y += 30;
      sp.setXY(i, sp.getX(i) + Math.sin(t * .7 + i) * dt * .6, y);
    }
    sp.needsUpdate = true;
    snowPts.position.set(camera.position.x, camera.position.y - 5, camera.position.z);
  }
}

// ---------------------------------------------------------------- resize, warm-up & loop
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setPixelRatio(DPR_STEPS[dprIdx]); composer.setPixelRatio(DPR_STEPS[dprIdx]);
  renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  camera.fov = clamp(2 * Math.atan(Math.tan(31 * Math.PI / 180) / aspect) * 180 / Math.PI, 66, 94);
  camera.aspect = aspect; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize(); resetWorld();
// compile every kind of object once, up front, behind the title screen (no mid-game shader hitches)
(() => {
  const warm = new THREE.Group();
  const add = o => { o.position.set(P.p.x + rnd(-3, 3), P.p.y + 2, P.p.z - 14); warm.add(o); };
  CELL.forEach((_, i) => add(makeCell(i)));
  add(buildGate(4, 3)); add(new THREE.Mesh(ROCKS[0], boulderMat)); add(new THREE.Mesh(ROCKS[1], tumbleMat)); add(pine(1));
  for (const m of [hazardMat, concreteMat, crevMat, lipMat, slabMat, abyssMat, marbleStoneMat, oldStoneMat, bronzeMat, rampRockMat]) add(new THREE.Mesh(UNIT_BOX, m));
  add(brazier()); add(new THREE.Mesh(UNIT_BOX, [marbleStoneMat, marbleStoneMat, marbleStoneMat, marbleStoneMat, new THREE.MeshStandardMaterial({ map: friezeTex(1), roughness: .8 }), marbleStoneMat])); add(cairn(0, 0, 0, Math.random));
  add(new THREE.Mesh(RING_GEO, newRingMat())); add(textSprite('CAMP', '#3ef6ff')); add(new THREE.Sprite(dustSpriteMat));
  for (const c of [0x3ef6ff, 0xffb43a, 0xff4fa0, 0x7dff6a, 0xa77bff, 0xff4f5a]) add(new THREE.Mesh(UNIT_BOX, neonMat(c)));
  warm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(warm);
  arc.visible = arcLand.visible = true; snowPts.material.opacity = .5;
  render(1 / 60, 0);
  try { renderer.compile(scene, camera); } catch {}
  composer.render();
  scene.remove(warm);
  arc.visible = arcLand.visible = false;
})();
render(1 / 60, 0);
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
// automatic quality: if frames stay slow, lower the resolution step by step (and finally bloom)
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
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  let dt = Math.min(.05, raw);
  if (mode === 'play') {
    watchPerf(Math.min(raw, .1));
    if (S.hitstop > 0) { S.hitstop -= dt; dt *= .05; }
    let scale = 1;
    if (S.perks.focus && P.charging && ballGap() < 8 && -ball.p.z > P.d) scale = .55;
    acc += dt * scale;
    let steps = 0;
    while (acc >= FIXED && steps < 8) { update(FIXED); acc -= FIXED; steps++; if (mode !== 'play') { acc = 0; break; } }
    if (steps >= 8) acc = 0;
    doWork(4);
    hud();
    render(dt * scale, now / 1000);
  } else {
    if (mode === 'title') { ball.p.y = G(-ball.p.z, ball.p.x) + ball.r; ball.v.set(0, 0, 0); }
    else if (mode === 'over') { acc += dt; let n = 0; while (acc >= FIXED && n++ < 8) { stepSphere(ball, FIXED, false); acc -= FIXED; } }
    doWork(4);
    render(mode === 'perk' ? 0 : dt, now / 1000);
  }
  composer.render();
}
requestAnimationFrame(frame);
window.__summit = { gapsFor, openGap, buildChunk, buildStage, far, clouds, scene, S, P, ball, CFG, H, G, xc, inGap, offerPerks, start, strike, update, takePerk, get mode() { return mode; }, get perkChoices() { return perkChoices; }, ballGap, reachNow, doWork };
