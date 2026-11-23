// SUMMIT v2 "The Valley" — a Sisyphus game for Bounce Lab.
// Sisyphus is bored: the Titan walks uphill on its own at a steady pace. You steer,
// wind up (hold) and hurl the boulder ahead (release), then line up for it as it
// rolls back down at you. Camps hand out advantages; the mountain hands out trouble.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- tuning
const CFG = {
  g: 26,
  ballR: 1.45, ballBounce: .3, ballRoll: .1,
  titanR: 1.15, titanH: 3.9,
  speed0: 5.2, speedStep: .42, speedMax: 10.5,   // the walk uphill, per stage
  steer: 14, steerMax: 13, dragGain: 1.3,
  chargeTime: .8,
  fwdMin: 9, fwdMax: 23, upMin: 7, upMax: 14,
  reach: 2.6, perfectGap: 1.15,
  hw: 6, ridgeHw: 4.4,
  stageLen: 190, campLen: 16, startFlat: 12,
};
const STAGES = [
  { name: 'The Foothills', note: 'Wind up, let go, hurl it uphill.', deg: 8, rocks: .45, tumble: 0, gaps: 0, gates: 0, ridge: 0, tint: 0x3ef6ff },
  { name: 'The Scree', note: 'Rockfall. Steer clear or get knocked silly.', deg: 10.5, rocks: .5, tumble: 1, gaps: 0, gates: 0, ridge: 0, tint: 0xffb43a },
  { name: 'The Crevasses', note: 'Throw it clean over the gaps.', deg: 12, rocks: .4, tumble: .45, gaps: 1, gates: 0, ridge: 0, tint: 0xff4fa0 },
  { name: 'The Blast Doors', note: 'Lab doors slide across the valley.', deg: 13.5, rocks: .35, tumble: .5, gaps: .35, gates: 1, ridge: 0, tint: 0x7dff6a },
  { name: 'The Ridge', note: 'The valley ends. Nothing on either side.', deg: 14.5, rocks: .3, tumble: .4, gaps: .35, gates: .3, ridge: 1, tint: 0xa77bff },
];
function stageDef(k) {
  if (k < STAGES.length) return STAGES[k];
  const loop = k - STAGES.length, lap = Math.floor(loop / (STAGES.length - 1)) + 1;
  const b = STAGES[1 + (loop % (STAGES.length - 1))];
  return { ...b, name: b.name + ' ' + ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][lap] , deg: Math.min(23, b.deg + 2.4 * lap),
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

// ---------------------------------------------------------------- the valley
// d = distance up the path (d = -z). xc(d) = where the valley floor's centre is.
// H(d) = floor height. G(d, x) = ground height anywhere, including the valley walls.
const stageAt = d => d < 0 ? 0 : Math.floor(d / CFG.stageLen);
const xc = d => (5 * Math.sin(d * .042) + 2.5 * Math.sin(d * .017 + 1)) * smooth(10, 60, d) - 2.5 * Math.sin(1) * 0;
const xcp = d => (xc(d + .5) - xc(d - .5));
const gapCache = new Map();
function gapsFor(k) {
  if (k < 0) return [];
  if (gapCache.has(k)) return gapCache.get(k);
  const st = stageDef(k), out = [];
  if (st.gaps > 0) {
    const R = mulberry(k * 104729 + 7), L = CFG.stageLen, base = k * L;
    let d = base + (k === 0 ? 40 : CFG.campLen + 22);
    while (d < base + L - 30) {
      if (R() < st.gaps) {
        const w = Math.min(7, 3 + Math.min(k, 8) * .35 + R() * 1.6);
        out.push({ d0: d, d1: d + w });
        d += w + 28 + R() * 14;
      } else d += 18 + R() * 12;
    }
  }
  gapCache.set(k, out); return out;
}
function inGap(d) { for (const g of gapsFor(stageAt(d))) if (d > g.d0 && d < g.d1) return g; return null; }
function nearGap(d, m) { for (const k of new Set([stageAt(d - m), stageAt(d + m)])) for (const g of gapsFor(k)) if (d > g.d0 - m && d < g.d1 + m) return true; return false; }
function slopeDeg(d) {
  const { stageLen: L, campLen: C, startFlat } = CFG;
  if (d < startFlat) return d < -20 ? 6 : 0;
  const k = Math.floor(d / L), local = d - k * L;
  if (k >= 1 && local < C) return 0;
  const st = stageDef(k);
  const start = k === 0 ? startFlat : C;
  let ledge = 1;
  for (const g of gapsFor(k)) if (d > g.d1 - 1 && d < g.d1 + 14) ledge = Math.min(ledge, .15 + .85 * smooth(g.d1 + 7, g.d1 + 14, d));
  return st.deg * smooth(start, start + 14, local) * ledge * (1 + .16 * Math.sin(d * .045));
}
const STEP = .5, D0 = -80, Harr = [0];
let Hmax = D0;
function ensureH(d) {
  while (Hmax < d + 2) {
    const i = Harr.length - 1, dm = D0 + i * STEP + STEP / 2;
    Harr.push(Harr[i] + Math.tan(slopeDeg(dm) * Math.PI / 180) * STEP);
    Hmax = D0 + (Harr.length - 1) * STEP;
  }
}
function H(d) {
  if (d <= D0) return Harr[0] - (D0 - d) * .1;
  ensureH(d);
  const f = (d - D0) / STEP, i = Math.floor(f), t = f - i;
  return Harr[i] + (Harr[i + 1] - Harr[i]) * t;
}
const Hp = d => (H(d + .25) - H(d - .25)) / .5;
function ridgeAmt(d) {
  const k = stageAt(d), local = d - k * CFG.stageLen, st = stageDef(k);
  return st.ridge ? smooth(CFG.campLen, CFG.campLen + 10, local) : 0;
}
const hwAt = d => lerp(CFG.hw, CFG.ridgeHw, ridgeAmt(d));
function wallY(u, d) { // height of the valley wall u metres beyond the floor edge
  const base = u < 5 ? .22 * u * u : 5.5 + 1.1 * (u - 5) + .014 * (u - 5) * (u - 5);
  const lumps = (Math.sin(d * .21 + u * .7) * .5 + Math.sin(d * .067 - u * .33) * 1.3 + Math.sin(d * .013 + u * .11) * 2.2) * smooth(1, 5, u);
  return base + lumps;
}
function G(d, x) {
  const h = H(d), off = x - xc(d), hw = hwAt(d), u = Math.abs(off) - hw;
  const r = ridgeAmt(d), bk = lerp(.015, .05, r);   // the ridge path is a worn groove that helps a little
  if (u <= 0) return h + bk * off * off;
  const wall = wallY(u, d), drop = (u < .9 ? .35 * Math.sin(Math.PI * u / .9) : 0) - (.55 * u * u + .6 * u) * smooth(.4, 1.2, u);
  return h + bk * hw * hw + lerp(wall, drop, r);
}
const Gx = (d, x) => (G(d, x + .1) - G(d, x - .1)) / .2;
const Gd = (d, x) => (G(d + .1, x) - G(d - .1, x)) / .2;

// ---------------------------------------------------------------- renderer + scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0x141a26);
scene.fog = new THREE.Fog(FOG, 28, 150);
const camera = new THREE.PerspectiveCamera(70, 1, .1, 1500);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = .28;
const hemi = new THREE.HemisphereLight(0x9fb4d8, 0x2a2520, .75);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xdfe8ff, 2.1);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
Object.assign(moon.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 140 });
moon.shadow.bias = -.0006; moon.shadow.normalBias = .04;
scene.add(moon); scene.add(moon.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .4, .9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// ---- procedural textures: rock, brushed steel, concrete
function noiseCanvas(size, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); fn(x, size); return c;
}
function rockCanvas(size = 512) {
  return noiseCanvas(size, (x, s) => {
    const img = x.createImageData(s, s);
    for (let i = 0; i < s * s; i++) { const n = 150 + (Math.random() - .5) * 60; img.data[i * 4] = n; img.data[i * 4 + 1] = n; img.data[i * 4 + 2] = n; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    for (let i = 0; i < 260; i++) {
      const r = rnd(4, 60) * (Math.random() < .2 ? 1.6 : 1), dark = Math.random() < .55;
      x.fillStyle = `rgba(${dark ? '20,20,20' : '255,255,255'},${rnd(.04, .14)})`;
      x.beginPath(); x.ellipse(rnd(0, s), rnd(0, s), r, r * rnd(.4, 1), rnd(0, 3), 0, 7); x.fill();
    }
    // pebbles
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '40,38,36' : '210,205,200'},${rnd(.2, .5)})`; const r = rnd(.8, 3); x.beginPath(); x.arc(rnd(0, s), rnd(0, s), r, 0, 7); x.fill(); }
    // strata cracks
    x.strokeStyle = 'rgba(15,15,15,.25)';
    for (let i = 0; i < 40; i++) { x.lineWidth = rnd(.5, 2); x.beginPath(); let px = rnd(0, s), py = rnd(0, s); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-30, 30); py += rnd(-8, 8); x.lineTo(px, py); } x.stroke(); }
  });
}
function steelCanvas(size = 256) {
  return noiseCanvas(size, (x, s) => {
    x.fillStyle = '#8a929c'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) { const y = rnd(0, s); x.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${rnd(.02, .07)})`; x.fillRect(0, y, s, rnd(.5, 1.5)); }
    // panel seams + bolts
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
const groundMap = tex(rockC, 1); const groundBump = tex(rockC, 1, false);
const steelC = steelCanvas(256);
const steelMap = tex(steelC); const concreteMap = tex(concreteCanvas(256));

// ---- sky, moon, distant peaks
const skyUni = { top: { value: new THREE.Color(0x03050b) }, horizon: { value: new THREE.Color(0x1c2536) }, glow: { value: new THREE.Color(0x3a4a66) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top, horizon, glow; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(horizon, top, smoothstep(-0.02,0.45,h)); c += glow*exp(-abs(h-0.02)*10.0)*0.35; c = mix(c, horizon*0.55, smoothstep(0.0,-0.3,h)); gl_FragColor = vec4(c,1.); }',
}));
const skyGroup = new THREE.Group(); skyGroup.add(sky); scene.add(skyGroup);
{
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 1100, s = Math.sqrt(1 - u * u); pos[i * 3] = r * s * Math.cos(a); pos[i * 3 + 1] = Math.abs(r * u) * .9 + 40; pos[i * 3 + 2] = r * s * Math.sin(a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  skyGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: .75 })));
  const moonS = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xeef3ff, fog: false, transparent: true, depthWrite: false }));
  moonS.scale.set(70, 70, 1); moonS.position.set(-420, 380, -900); skyGroup.add(moonS);
  const moonCore = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: 0xf4f7ff, fog: false }));
  moonCore.position.copy(moonS.position); moonCore.lookAt(0, 0, 0); skyGroup.add(moonCore);
}
const peak = new THREE.Group();
{
  const mk = (r, h, x, z, seg, col) => {
    const geo = new THREE.ConeGeometry(r, h, seg, 8), p = geo.attributes.position;
    const colors = [];
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y < h / 2 - 1) { const k = rnd(.7, 1.2); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, y + rnd(-h * .06, h * .05)); }
      const snow = smooth(h * .05, h * .3, p.getY(i)) * rnd(.7, 1);
      const c = new THREE.Color(col).lerp(new THREE.Color(0x4e5766), snow); colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, fog: false }));
    m.position.set(x, h / 2, z); peak.add(m); return m;
  };
  mk(330, 420, 0, 0, 15, 0x151921); mk(160, 300, -90, 40, 11, 0x13161d); mk(240, 260, -300, 80, 12, 0x12151b); mk(250, 290, 300, 60, 12, 0x13171d); mk(170, 180, -520, 120, 9, 0x101318); mk(180, 200, 540, 130, 9, 0x101318);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, .55, .25).multiplyScalar(2.5), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.scale.set(26, 26, 1); beacon.position.set(0, 424, 0); peak.add(beacon); peak.userData.beacon = beacon;
}
skyGroup.add(peak);
peak.position.set(0, -210, -820);

// ---------------------------------------------------------------- terrain
const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundMap, bumpMap: groundBump, bumpScale: 1.4, roughness: .96, metalness: 0 });
groundMat.map.repeat.set(1 / 7, 1 / 7); groundMat.bumpMap.repeat.set(1 / 7, 1 / 7);
const crevMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 1, side: THREE.DoubleSide });
const lipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .45, .2).multiplyScalar(1.8) });
const abyssMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1, .3, .1).multiplyScalar(.55), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const decoRockMat = new THREE.MeshStandardMaterial({ color: 0x6d6f74, map: groundMap, bumpMap: groundBump, bumpScale: 1.2, roughness: .95, flatShading: true });
const OFFS = (() => { const o = []; for (let i = -4; i <= 4; i++) o.push(i / 4); return o; })(); // across the floor, as a fraction of hw
const WALL_U = [.6, 1.4, 2.4, 3.6, 5, 7, 9.5, 13, 18, 25, 34, 46];
const COL_FLOOR = new THREE.Color(0x8a837a), COL_WALL = new THREE.Color(0x5d6068), COL_SNOW = new THREE.Color(0xdfe6ef), COL_MOSS = new THREE.Color(0x4b5545);
function snowAt(d) { return clamp((d - CFG.stageLen * 1.2) / (CFG.stageLen * 3), 0, .85); }
function rowPoints(d) { // x positions across the valley at distance d
  const c = xc(d), hw = hwAt(d), xs = [];
  for (let i = WALL_U.length - 1; i >= 0; i--) xs.push(c - hw - WALL_U[i]);
  for (const f of OFFS) xs.push(c + f * hw);
  for (const u of WALL_U) xs.push(c + hw + u);
  return xs;
}
const CH = 40, chunks = new Map(), blinkers = [];
const tmpC = new THREE.Color();
function buildChunk(c) {
  const grp = new THREE.Group();
  const a = c * CH, b = a + CH;
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
  for (const [p0, p1] of pieces) {
    if (p1 - p0 < .05) continue;
    const ds = []; for (let d = p0; d < p1; d += 1) ds.push(d); ds.push(p1);
    const pos = [], uv = [], col = [], idx = [];
    let cols = 0;
    ds.forEach((d, i) => {
      const xs = rowPoints(d); cols = xs.length;
      const hw = hwAt(d), cc = xc(d), snow = snowAt(d), h = H(d);
      for (const x of xs) {
        const y = G(d, x); pos.push(x, y, -d); uv.push(x + Math.sign(x - xc(d)) * Math.max(0, y - H(d)) * .8, d);
        const u = Math.abs(x - cc) - hw;
        const n = (Math.sin(x * 1.7 + d * .9) + Math.sin(x * .37 - d * .53)) * .04;
        tmpC.copy(u <= 0 ? COL_FLOOR : COL_WALL);
        if (u > 0 && u < 6) tmpC.lerp(COL_MOSS, .25 * smooth(0, 2, u) * (1 - snow));
        const sAmt = u <= 0 ? snow * .45 : snow * smooth(2, 8, y - h);
        tmpC.lerp(COL_SNOW, sAmt).offsetHSL(0, 0, n);
        col.push(tmpC.r, tmpC.g, tmpC.b);
      }
      if (i > 0) for (let j = 0; j < cols - 1; j++) { const r0 = (i - 1) * cols + j, r1 = i * cols + j; idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMat); m.receiveShadow = true; grp.add(m);
    // scattered rocks high on the walls (scenery, no collision)
    const R = mulberry(Math.floor(p0 * 13) + 99);
    for (let k = 0; k < (p1 - p0) * .35; k++) {
      const d = p0 + R() * (p1 - p0), side = R() < .5 ? -1 : 1, u = 6 + R() * 22;
      if (ridgeAmt(d) > .3) continue;
      const x = xc(d) + side * (hwAt(d) + u), r = .5 + R() * 2.2;
      const rock = new THREE.Mesh(rockGeo(r, R), decoRockMat);
      rock.position.set(x, G(d, x) + r * .2, -d); rock.rotation.set(R() * 3, R() * 3, R() * 3); rock.castShadow = r > 1.2;
      grp.add(rock);
    }
  }
  // crevasses: dark walls, a warm warning lip, faint glow below
  for (const g of near) {
    const mid = (g.d0 + g.d1) / 2;
    if (mid < a || mid >= b) continue;
    for (const ld of [g.d0, g.d1]) {
      const xs = rowPoints(ld).filter(x => Math.abs(x - xc(ld)) < hwAt(ld) + 14);
      const pts = xs.map(x => [[x, G(ld, x) - 16, -ld], [x, G(ld, x), -ld]]);
      grp.add(ribbon(pts, crevMat));
      const lip = new THREE.Mesh(new THREE.BoxGeometry(hwAt(ld) * 2 - .4, .12, .3), lipMat);
      if (ld === g.d0) for (const sd of [-1, 1]) { // warning bollards on the near edge
        const bx = xc(ld) + sd * (hwAt(ld) + .4), by = G(ld, bx);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(.22, .26, 1.6, 10), hazardMat); post.position.set(bx, by + .8, -ld + .4); grp.add(post);
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        lamp.scale.setScalar(1.6); lamp.position.set(bx, by + 1.75, -ld + .4); lamp.userData.blink = true; grp.add(lamp); blinkers.push(lamp);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), lipMat); bulb.position.copy(lamp.position); grp.add(bulb);
      }
      lip.position.set(xc(ld), G(ld, xc(ld)) + .05, -ld + (ld === g.d0 ? -.06 : .06)); grp.add(lip);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(hwAt(mid) * 2.2, (g.d1 - g.d0) * 1.2), abyssMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(xc(mid), H(mid) - 10, -mid); grp.add(glow);
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
function rockGeo(r, R) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, .8 + R() * .36);
    const f = map.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .85, p.getZ(i) * f);
  }
  g.computeVertexNormals(); return g;
}
function disposeGroup(g) { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
function updateChunks(d) {
  const c0 = Math.floor((d - 50) / CH), c1 = Math.floor((d + 170) / CH);
  for (let s = stageAt(Math.max(0, d)); s <= stageAt(d + 240); s++) buildStage(s);
  for (let c = c0; c <= c1; c++) if (!chunks.has(c)) buildChunk(c);
  for (const [c, g] of chunks) if (c < c0 - 1 || c > c1 + 1) { disposeGroup(g); chunks.delete(c); }
}

// ---------------------------------------------------------------- course objects
const rocks = [], gates = [], cells = [], camps = [], builtStages = new Set();
const boulderMat = new THREE.MeshStandardMaterial({ color: 0x7a7c82, map: groundMap, bumpMap: groundBump, bumpScale: 1.6, roughness: .92, flatShading: true });
const slabMat = new THREE.MeshStandardMaterial({ color: 0xc4cbd4, map: steelMap, metalness: .75, roughness: .36, envMapIntensity: 2.2 });
const concreteMat = new THREE.MeshStandardMaterial({ color: 0x9a9da3, map: concreteMap, roughness: .9, metalness: 0 });
const hazardTex = (() => { const c = noiseCanvas(128, (x, s) => { x.fillStyle = '#1a1a1a'; x.fillRect(0, 0, s, s); x.fillStyle = '#e7b52c'; for (let i = -s; i < s * 2; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 16 - s, s); x.lineTo(i - s, s); x.fill(); } }); return tex(c); })();
const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: .6 });
const neonMat = col => new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.2) });
// energy cell (lobby-style glass capsule)
const CELL = [
  { col: 0xffb43a, val: 20, y: [1.4, 2.8], size: .9 },
  { col: 0x3ef6ff, val: 60, y: [4, 6.2], size: 1.1 },
  { col: 0xff3fb4, val: 150, y: [6.5, 8], size: 1.25 },
];
const cellGlassMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: .1, roughness: .05, transparent: true, opacity: .28 });
const cellCapMat = new THREE.MeshStandardMaterial({ color: 0xb8c0ca, map: steelMap, metalness: .9, roughness: .3 });
function makeCell(tier) {
  const t = CELL[tier], g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .8, 16), cellGlassMat); g.add(glass);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .66, 12), neonMat(t.col)); g.add(core);
  for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .13, 16), cellCapMat); cap.position.y = s * .45; g.add(cap); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: t.col, transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(2.2); g.add(halo);
  g.scale.setScalar(t.size); g.rotation.z = .35;
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
function buildStage(k) {
  if (builtStages.has(k)) return;
  builtStages.add(k);
  const R = mulberry(k * 7919 + 13), st = stageDef(k), L = CFG.stageLen, base = k * L, C = CFG.campLen;
  if (k >= 1) { // lab outpost at each camp
    const d = base + C * .5, cx = xc(d), h = H(d), hw = CFG.hw + 1.2, grp = new THREE.Group();
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), concreteMat); p.position.set(cx + s * hw, G(d, cx + s * hw) + 3.6, -d); p.castShadow = true; grp.add(p);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 6.4, 8), neonMat(st.tint)); tube.position.set(cx + s * (hw - .53), G(d, cx + s * hw) + 3.8, -d + .3); grp.add(tube);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.4, .7, .9), slabMat); beam.position.set(cx, h + 8.1, -d); beam.castShadow = true; grp.add(beam);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.42, .18, .92), hazardMat); stripe.position.set(cx, h + 7.7, -d); grp.add(stripe);
    const sign = textSprite(`CAMP ${k}`, '#' + new THREE.Color(st.tint).getHexString()); sign.position.set(cx, h + 9.5, -d); grp.add(sign);
    const lamp = new THREE.PointLight(st.tint, 18, 22, 2); lamp.position.set(cx, h + 7, -d + 1); grp.add(lamp);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(CFG.hw * 2, .22), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.tint).multiplyScalar(1.3), transparent: true, opacity: .8 }));
    line.rotation.x = -Math.PI / 2; line.position.set(xc(base + 2), H(base + 2) + .05, -(base + 2)); grp.add(line);
    scene.add(grp);
    camps.push({ k, d: base + 2, mesh: grp, reached: false, st });
  }
  const start = k === 0 ? 30 : C + 14, end = L - 10;
  if (st.rocks > 0) {
    let d = base + start;
    while (d < base + end) {
      if (R() < st.rocks && !nearGap(d, 5)) {
        const hw = hwAt(d), r = .8 + R() * .7, off = (R() * 2 - 1) * (hw - r - .5), x = xc(d) + off;
        const mesh = new THREE.Mesh(rockGeo(r, R), boulderMat);
        const cy = G(d, x) + r * .3;
        mesh.position.set(x, cy, -d); mesh.rotation.set(R() * 3, R() * 3, R() * 3); mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh); rocks.push({ x, d, r, cy, mesh, hit: 0 });
      }
      d += 13 + R() * 12;
    }
  }
  if (st.gates > 0) {
    let d = base + start + 20;
    while (d < base + end - 6) {
      if (R() < st.gates && !nearGap(d, 6)) {
        const hw = hwAt(d), w = 4.2 + R() * 1.4, hgt = 2.6 + R() * .6, grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, .8), slabMat); body.castShadow = true; grp.add(body);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + .02, .35, .82), hazardMat); stripe.position.y = -hgt / 2 + .3; grp.add(stripe);
        const tube = new THREE.Mesh(new THREE.BoxGeometry(w * .8, .07, .05), neonMat(0xff4f5a)); tube.position.set(0, hgt / 2 - .3, .42); grp.add(tube);
        scene.add(grp);
        gates.push({ d, w, h: hgt, amp: hw - w / 2 - .1, speed: .7 + R() * .6 + Math.min(k, 10) * .04, phase: R() * 6.28, x: 0, vx: 0, mesh: grp, hit: 0 });
      }
      d += 26 + R() * 14;
    }
  }
  let d = base + (k === 0 ? 22 : C + 6);
  while (d < base + L - 4) {
    const hw = hwAt(d), r = R(), tier = r < .07 + k * .01 ? 2 : r < .35 ? 1 : 0, t = CELL[tier];
    const off = (R() * 2 - 1) * (hw - 1.4), y = t.y[0] + R() * (t.y[1] - t.y[0]);
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

// ---------------------------------------------------------------- the boulder
const ball = (() => {
  const geo = new THREE.IcosahedronGeometry(CFG.ballR, 4), p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + .05 * Math.sin(v.x * 2.3 + v.y * 1.7) * Math.cos(v.z * 2.1 - v.x) + .025 * Math.sin(v.y * 5.1 + v.z * 3.3); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z); }
  geo.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); uv[i * 2] = .5 + Math.atan2(v.z, v.x) / (2 * Math.PI); uv[i * 2 + 1] = .5 + Math.asin(v.y) / Math.PI; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // a granite boulder with a steel band and a faint lab seam
  const em = noiseCanvas(256, (x, s) => { x.fillStyle = '#000'; x.fillRect(0, 0, s, s); x.fillStyle = '#ff9a4a'; x.fillRect(0, s / 2 - 2, s, 4); });
  const map = tex(rockC); map.repeat.set(2, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c9890, map, bumpMap: groundBump, bumpScale: 2.2, roughness: .9, metalness: .02,
    emissive: new THREE.Color(1, .55, .25), emissiveMap: new THREE.CanvasTexture(em), emissiveIntensity: .3 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
  const band = new THREE.Mesh(new THREE.TorusGeometry(CFG.ballR * 1.02, .07, 8, 64), new THREE.MeshStandardMaterial({ color: 0xc0c8d2, map: steelMap, metalness: .9, roughness: .3 }));
  mesh.add(band);
  const group = new THREE.Group(); group.add(mesh); scene.add(group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .7, .35).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(marker);
  return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: CFG.ballR, m: 4, bounce: CFG.ballBounce, roll: CFG.ballRoll, mesh, mat, group, marker,
    grounded: false, heat: 0, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, lost: 0, lostWhy: '', flying: false, throwFrom: 0 };
})();

// ---------------------------------------------------------------- the Titan (brushed steel, concrete base)
const P = { d: 0, off: 0, toff: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), stun: 0, stagger: 0, charge: 0, charging: false, release: 0, cool: 0, bumpCool: 0, group: new THREE.Group(), lean: 0, fade: 1 };
const titanMats = [];
(() => {
  const g = P.group, R = CFG.titanR, Hh = CFG.titanH;
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4dbe4, map: steelMap, metalness: .8, roughness: .32, transparent: true, envMapIntensity: 2.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: .8, roughness: .4, transparent: true, envMapIntensity: 2 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x8d9096, map: concreteMap, roughness: .85, transparent: true });
  titanMats.push(steel, dark, conc);
  const body = new THREE.Group(); g.add(body); P.body = body;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.12, R * 1.22, .55, 32), conc); base.position.y = .28; base.castShadow = true; body.add(base);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(R * .92, R, Hh - 1.0, 32), steel); col.position.y = .55 + (Hh - 1.0) / 2; col.castShadow = true; body.add(col);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * .7, R * .95, .45, 32), dark); cap.position.y = Hh - .23; cap.castShadow = true; body.add(cap);
  for (const y of [.62, Hh * .5, Hh - .5]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R * (y > Hh * .6 ? .94 : 1.01), .07, 8, 40), dark); t.rotation.x = Math.PI / 2; t.position.y = y; body.add(t); }
  // vertical neon tube on the back (the side you look at)
  const tubeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(.45, .95, 1).multiplyScalar(2), transparent: true });
  titanMats.push(tubeM); P.tubeM = tubeM;
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, Hh - 1.5, 8), tubeM); tube.position.set(0, Hh / 2 + .1, R * .97); body.add(tube);
  for (const s of [-1, 1]) { const clip = new THREE.Mesh(new THREE.BoxGeometry(.22, .12, .12), dark); clip.position.set(0, Hh / 2 + .1 + s * (Hh - 1.6) / 2, R * .98); body.add(clip); }
  // ram head on the uphill face: retracts as you wind up
  const ram = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(R + .2, R + .2, Hh * .52, 24, 1, false, Math.PI - .8, 1.6), steel); plate.castShadow = true; ram.add(plate);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R + .215, R + .215, .22, 24, 1, true, Math.PI - .8, 1.6), hazardMat); ram.add(stripe);
  const chargeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .55, .2), transparent: true, opacity: .0 });
  titanMats.push(chargeM); P.chargeM = chargeM;
  for (const y of [-.55, .55]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(R + .23, R + .23, .06, 24, 1, true, Math.PI - .75, 1.5), chargeM); l.position.y = y; ram.add(l); }
  ram.position.y = Hh * .45; body.add(ram); P.ram = ram;
  // pistons between body and ram
  P.pistons = [];
  for (const s of [-1, 1]) { const ps = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1, 8), dark); ps.rotation.x = Math.PI / 2; ps.position.set(s * .5, Hh * .45, -R * .9); body.add(ps); P.pistons.push(ps); }
  const thr = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.2, R * 3.2), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(.4, .85, 1).multiplyScalar(.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  thr.rotation.x = -Math.PI / 2; thr.position.y = .04; g.add(thr); P.thr = thr;
  const l = new THREE.PointLight(0x7fe8ff, 3, 7, 2); l.position.set(0, 2, 1.4); g.add(l);
  scene.add(g);
})();
const reachRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .78, .35).multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
scene.add(reachRing);
// aim arc (Foresight perk)
const ARC_N = 40;
const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
const arc = new THREE.Points(arcGeo, new THREE.PointsMaterial({ size: .28, map: glowTex, color: new THREE.Color(1, .8, .4).multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
arc.frustumCulled = false; arc.visible = false; scene.add(arc);
const arcLand = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.3, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .8, .4).multiplyScalar(1.6), transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
arcLand.visible = false; scene.add(arcLand);

// ---------------------------------------------------------------- rockfall
const tumblers = [];
const tumbleMat = new THREE.MeshStandardMaterial({ color: 0x5c5650, map: groundMap, roughness: .95, flatShading: true });
function spawnTumbler(d) {
  const r = rnd(.6, 1), hw = hwAt(d), side = Math.random() < .5 ? -1 : 1;
  const mesh = new THREE.Mesh(rockGeo(r, Math.random), tumbleMat); mesh.castShadow = true;
  const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8a7a6a, transparent: true, opacity: .35, depthWrite: false })); dust.scale.setScalar(r * 3.5); mesh.add(dust);
  scene.add(mesh);
  // they come off the valley walls and roll down into the floor
  const x = xc(d) + side * (hw + rnd(2, 6));
  tumblers.push({ p: new THREE.Vector3(x, G(d, x) + r + 1, -d), v: new THREE.Vector3(-side * rnd(1, 3), 0, rnd(3, 6)), r, m: 1, bounce: .45, roll: .02, mesh, grounded: false, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, dead: false });
}

// ---------------------------------------------------------------- particles, rings, pops, snow
const NP = 420;
const pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = Array.from({ length: NP }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color(), grav: 12 }));
const ptsAdd = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .3, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
ptsAdd.frustumCulled = false; scene.add(ptsAdd);
let pIdx = 0;
function burst(at, n, color, speed = 6, dir = null, grav = 12, life = [.35, .9]) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const o = parts[pIdx], k = pIdx * 3; pIdx = (pIdx + 1) % NP;
    o.life = o.max = rnd(life[0], life[1]); o.grav = grav;
    o.v.set(rnd(-1, 1), rnd(-.2, 1), rnd(-1, 1)).normalize(); if (dir) o.v.addScaledVector(dir, 1.3).normalize();
    o.v.multiplyScalar(rnd(.3, 1) * speed); o.c.copy(c).multiplyScalar(rnd(.6, 1.3));
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
// dust that isn't glowing (normal blending)
const NDUST = 160;
const dGeo = new THREE.BufferGeometry(), dPos = new Float32Array(NDUST * 3), dAlpha = new Float32Array(NDUST);
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
const dusts = Array.from({ length: NDUST }, () => ({ life: 0, max: 1, v: new THREE.Vector3() }));
const dustPts = new THREE.Points(dGeo, new THREE.PointsMaterial({ size: .9, map: glowTex, color: 0x9a8e80, transparent: true, opacity: .4, depthWrite: false }));
dustPts.frustumCulled = false; scene.add(dustPts);
let dIdx = 0;
function dust(at, n, speed = 3) {
  for (let i = 0; i < n; i++) {
    const o = dusts[dIdx], k = dIdx * 3; dIdx = (dIdx + 1) % NDUST;
    o.life = o.max = rnd(.5, 1.1); o.v.set(rnd(-1, 1), rnd(.1, .8), rnd(-1, 1)).normalize().multiplyScalar(rnd(.4, 1) * speed);
    dPos[k] = at.x; dPos[k + 1] = at.y; dPos[k + 2] = at.z;
  }
}
function stepDust(dt) {
  for (let i = 0; i < NDUST; i++) {
    const o = dusts[i], k = i * 3;
    if (o.life <= 0) { dPos[k + 1] = -1e4; continue; }
    o.life -= dt; o.v.multiplyScalar(1 - 2 * dt); o.v.y -= 1.5 * dt;
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
const rings = [];
function ring(at, color, size = 3, normal = null) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(at);
  if (normal) m.lookAt(at.clone().add(normal)); else m.rotation.x = -Math.PI / 2;
  scene.add(m); rings.push({ m, t: 0, size });
}
const popEls = [];
function pop(text, at, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; $('#pops').appendChild(el);
  popEls.push({ el, p: at.clone(), t: 0 });
  if (popEls.length > 8) { popEls[0].el.remove(); popEls.shift(); }
}
const tmpV = new THREE.Vector3();
function stepPops(dt) {
  for (let i = popEls.length - 1; i >= 0; i--) {
    const o = popEls[i]; o.t += dt;
    if (o.t > 1.15) { o.el.remove(); popEls.splice(i, 1); continue; }
    tmpV.copy(o.p); tmpV.y += o.t * 1.6; tmpV.project(camera);
    const x = (tmpV.x * .5 + .5) * innerWidth, y = (-tmpV.y * .5 + .5) * innerHeight;
    o.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${o.t < .12 ? .6 + o.t * 3.3 : 1})`;
    o.el.style.opacity = o.t > .8 ? 1 - (o.t - .8) / .35 : 1;
  }
}

// ---------------------------------------------------------------- sound
let ac = null, master = null, noiseBuf = null, muted = store.get('summit-muted', false), chargeOsc = null, chargeGain = null;
function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * .8, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = .5;
    const gn = ac.createGain(); gn.gain.value = .06; src.connect(f); f.connect(gn); gn.connect(master); src.start();
    const lfo = ac.createOscillator(); lfo.frequency.value = .08; const lg = ac.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    chargeOsc = ac.createOscillator(); chargeOsc.type = 'sawtooth'; chargeOsc.frequency.value = 60;
    const cf = ac.createBiquadFilter(); cf.type = 'lowpass'; cf.frequency.value = 700;
    chargeGain = ac.createGain(); chargeGain.gain.value = 0; chargeOsc.connect(cf); cf.connect(chargeGain); chargeGain.connect(master); chargeOsc.start();
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
  thud(i) { const e = clamp(i / 16, 0, 1); tone(45 + e * 30, 'sine', .25 + e * .55, .3, .45); noise(.08 + e * .22, .16, 260 + e * 260, .7, 'lowpass'); },
  strike(c) { tone(65, 'sine', .7, .35, .4); noise(.3 + c * .2, .14, 1400, .7); tone(140 + c * 160, 'square', .07, .14, .5); noise(.15, .3, 300, .5, 'lowpass', .02); },
  perfect() { [0, 7, 12, 19].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 'triangle', .12, .35, 0, i * .045)); },
  whiff() { noise(.1, .16, 2400, 1.2); },
  bonk() { tone(120, 'triangle', .25, .18, .6); noise(.15, .1, 900, 1); },
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
  power:    { name: 'Heavy Hands', desc: 'Strikes hit 15% harder.', max: 3, ic: '⚒', col: '#ff8a3a', chip: 'POWER' },
  reach:    { name: 'Long Arms', desc: 'Bigger strike range.', max: 3, ic: '◎', col: '#3ef6ff', chip: 'REACH' },
  quick:    { name: 'Quick Wind-up', desc: 'Charge up 35% faster.', max: 2, ic: '»', col: '#ffc23a', chip: 'QUICK' },
  arc:      { name: 'Foresight', desc: 'See where your throw will land while winding up.', max: 1, ic: '⌒', col: '#9fe870', chip: 'ARC' },
  focus:    { name: 'Focus', desc: 'Time slows while you wind up near the boulder.', max: 1, ic: '◔', col: '#a77bff', chip: 'FOCUS' },
  shield:   { name: 'Stone Skin', desc: 'Shrug off one hit per stage from rocks or doors.', max: 1, ic: '⛨', col: '#c9d2de', chip: 'SKIN' },
  backstop: { name: 'Backstop', desc: 'Once per stage, catch a boulder that gets past you.', max: 1, ic: '↺', col: '#ff3fb4', chip: 'SAVE' },
  spare:    { name: 'Spare Boulder', desc: '+1 boulder now and +1 max.', max: 2, ic: '●', col: '#ff8a3a', chip: 'SPARE' },
  magnet:   { name: 'Lodestone', desc: 'Energy cells drift toward the boulder.', max: 1, ic: 'Ʊ', col: '#3ef6ff', chip: 'MAGNET' },
  steady:   { name: 'Sure Footing', desc: 'Faster steering. Bumps don\'t break your combo.', max: 1, ic: '≡', col: '#9fe870', chip: 'STEADY' },
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
  pop(PERKS[k].name.toUpperCase(), P.p.clone().setY(P.p.y + CFG.titanH + 1), 'big');
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
  longest: 0, perks: perkLv(), shieldReady: false, backstopReady: false, grace: 0, best: store.get('summit-best-v2', 0) };
const cam = { x: 0, y: 5, z: 8, shake: 0, lookY: 0, lookX: 0 };
function resetWorld() {
  for (const c of [...chunks.keys()]) { disposeGroup(chunks.get(c)); chunks.delete(c); }
  for (const arr of [rocks, gates, cells]) { for (const o of arr) disposeGroup(o.mesh); arr.length = 0; }
  for (const c of camps) disposeGroup(c.mesh); camps.length = 0;
  for (const t of tumblers) scene.remove(t.mesh); tumblers.length = 0;
  builtStages.clear();
  Object.assign(P, { d: 0, off: 0, toff: 0, stun: 0, stagger: 0, charge: 0, charging: false, release: 0, cool: 0, bumpCool: 0, lean: 0 });
  P.p.set(xc(0), G(0, xc(0)), 0);
  placeBall(10, 0, 1);
  updateChunks(0);
}
function placeBall(d, off, lift = 3) {
  const x = xc(d) + off;
  ball.p.set(x, G(d, x) + ball.r + lift, -d); ball.v.set(0, 0, 0); ball.lost = 0; ball.heat = 0; ball.flying = false;
}
function start() {
  if (mode === 'play' || mode === 'perk') return;
  audio();
  Object.assign(S, { score: 0, bonus: 0, maxAlt: 0, lives: 3, maxLives: 3, mult: 1, perfects: 0, cells: 0, camps: 0, stage: 0, time: 0, tumbleT: 4, longest: 0, perks: perkLv(), shieldReady: false, backstopReady: false, grace: 1.5, pendingPerk: 0 });
  resetWorld(); chips();
  mode = 'play';
  window.BounceLab && BounceLab.start();
  $('#title').classList.add('hide'); $('#over').classList.add('hide'); $('#hud').classList.remove('hide'); $('#smackBtn').classList.remove('hide');
  banner('THE FOOTHILLS', 'Hold STRIKE to wind up · let go as it reaches you');
  hud();
}
const QUOTES = ['One must imagine Sisyphus happy.', 'The struggle itself toward the heights is enough to fill a heart.', 'The summit was always a little further.', 'He was bored anyway.', 'Back to the bottom. Again.'];
function gameOver() {
  mode = 'over'; sfx.over(); drag = null; P.charging = false; $('#touch').classList.remove('on');
  if (chargeGain) chargeGain.gain.value = 0;
  const score = S.score, isBest = score > S.best;
  if (isBest) { S.best = score; store.set('summit-best-v2', score); }
  $('#oScore').textContent = score;
  $('#oBest').textContent = isBest ? 'New best!' : 'Best ' + S.best;
  $('#oAlt').textContent = Math.round(S.maxAlt) + ' m';
  $('#oCamps').textContent = S.camps;
  $('#oPerf').textContent = S.perfects;
  $('#oThrow').textContent = Math.round(S.longest) + ' m';
  $('#oShards').textContent = S.cells;
  $('#oQuote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  window.BounceLab && BounceLab.gameOver(score, { altitude: Math.round(S.maxAlt), camps: S.camps, perfects: S.perfects, longest: Math.round(S.longest) });
  $('#over').classList.remove('hide'); $('#hud').classList.add('hide'); $('#smackBtn').classList.add('hide'); $('#perkChips').innerHTML = '';
}
function banner(t, s) {
  $('#bTitle').textContent = t; $('#bSub').textContent = s || '';
  const b = $('#banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
let livesShown = '';
function hud() {
  $('#score').textContent = S.score;
  const nextCamp = stageAt(P.d) + 1;
  $('#alt').textContent = `${Math.max(0, Math.round(H(P.d)))} m · ${speedNow().toFixed(1)} m/s`;
  $('#campT').textContent = `CAMP ${nextCamp}`;
  $('#progFill').style.transform = `scaleX(${clamp((P.d - (nextCamp - 1) * CFG.stageLen) / CFG.stageLen, 0, 1)})`;
  $('#mult').textContent = '×' + S.mult; $('#mult').classList.toggle('hot', S.mult > 1);
  const key = S.lives + '/' + S.maxLives;
  if (livesShown !== key) { const l = $('#lives'); l.innerHTML = ''; for (let i = 0; i < S.maxLives; i++) { const e = document.createElement('i'); if (i >= S.lives) e.style.opacity = .2; l.appendChild(e); } livesShown = key; }
}
function addPoints(n, at, label, cls) { const v = Math.round(n * S.mult); S.bonus += v; pop(label ? label.replace('#', v) : '+' + v, at, cls || ''); }
const speedNow = () => Math.min(CFG.speedMax, CFG.speed0 + CFG.speedStep * stageAt(P.d));

// ---------------------------------------------------------------- input
let drag = null, chargePointer = null;
const touchEl = $('#touch'), smackBtn = $('#smackBtn');
const isUI = t => t && t.closest && t.closest('.ui');
function beginCharge() { if (mode !== 'play' || P.cool > 0 || P.stun > 0 || ball.lost) return; P.charging = true; }
function endCharge() { if (!P.charging) return; P.charging = false; strike(P.charge, false); P.charge = 0; }
window.addEventListener('pointerdown', e => {
  audio();
  if (isUI(e.target) || mode !== 'play') return;
  e.preventDefault();
  if (drag) { chargePointer = e.pointerId; beginCharge(); return; } // a second finger winds up
  drag = { id: e.pointerId, x: e.clientX };
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
  if (chargePointer === e.pointerId) { chargePointer = null; endCharge(); return; }
  if (!drag || e.pointerId !== drag.id) return;
  drag = null; touchEl.classList.remove('on');
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
smackBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); smackBtn.classList.add('down'); try { smackBtn.setPointerCapture(e.pointerId); } catch {} beginCharge(); });
for (const ev of ['pointerup', 'pointercancel']) smackBtn.addEventListener(ev, () => { smackBtn.classList.remove('down'); endCharge(); });
$('#playBtn').addEventListener('click', start);
$('#againBtn').addEventListener('click', start);
$('#mute').addEventListener('click', () => { muted = !muted; store.set('summit-muted', muted); $('#mute').textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : .55; });
$('#mute').textContent = muted ? '🔇' : '🔊';
$('#bestT').textContent = S.best ? 'Best ' + S.best : '';

// ---------------------------------------------------------------- strike
const axisPt = new THREE.Vector3(), nrm = new THREE.Vector3();
function ballGap() {
  axisPt.set(P.p.x, clamp(ball.p.y, P.p.y + .3, P.p.y + CFG.titanH - .2), P.p.z);
  nrm.subVectors(ball.p, axisPt);
  const d = nrm.length() || 1e-4; nrm.divideScalar(d);
  return d - CFG.titanR - ball.r;
}
const reachNow = () => CFG.reach + .55 * S.perks.reach;
function strikeVel(c, perfect, out) {
  const power = (1 + .15 * S.perks.power) * (perfect ? 1.2 : 1) * (1 + Math.min(stageAt(P.d), 8) * .02);
  const fwd = lerp(CFG.fwdMin, CFG.fwdMax, c) * power + speedNow() * .5, up = lerp(CFG.upMin, CFG.upMax, c) * power;
  const bd = -ball.p.z, slope = xcp(bd);
  const aim = (clamp((ball.p.x - P.p.x) * 1.3, -5, 5) + P.v.x * .3) * (1 - .45 * ridgeAmt(bd));
  return out.set(slope * fwd + aim, up, -fwd);
}
function strike(charge, auto) {
  if (mode !== 'play' || P.stun > 0 || ball.lost) return;
  const gap = ballGap(), ahead = -ball.p.z > P.d - .4;
  P.release = 1;
  const c = Math.max(.12, charge);
  if (gap < reachNow() && ahead) {
    P.cool = .25;
    const perfect = !auto && gap < CFG.perfectGap + .25 * S.perks.reach && c > .5;
    strikeVel(c, perfect, ball.v);
    ball.heat = perfect ? 1.4 : .5 + c * .5; ball.flying = true; ball.throwFrom = -ball.p.z;
    ball.spinAxis.set(1, 0, 0); ball.spin = -10;
    const at = ball.p.clone().addScaledVector(nrm, -ball.r);
    burst(at, perfect ? 44 : 16 + c * 20, perfect ? 0xffc23a : 0xffa060, perfect ? 11 : 7, new THREE.Vector3(0, .6, -1));
    dust(at, 10, 4);
    ring(at, perfect ? 0xffc23a : 0xffffff, perfect ? 4.5 : 2.5 + c, new THREE.Vector3(0, .3, 1));
    cam.shake = .2 + c * .25 + (perfect ? .15 : 0);
    sfx.strike(c); buzz(perfect ? [18, 30, 30] : 15 + c * 20);
    if (perfect) { sfx.perfect(); S.perfects++; S.mult = Math.min(6, S.mult + 1); addPoints(50, ball.p, 'PERFECT +#', 'perfect'); }
    else if (c > .85) pop('FULL POWER', ball.p.clone().setY(ball.p.y + 1.5), 'dim');
  } else {
    P.cool = .3; sfx.whiff();
    if (gap < reachNow() + 4) pop('too early', P.p.clone().setY(P.p.y + CFG.titanH + .5), 'dim');
  }
}

// ---------------------------------------------------------------- physics
const n3 = new THREE.Vector3(), c3 = new THREE.Vector3(), q = new THREE.Quaternion();
function bounceOff(o, n, vel, e, impactFn) {
  const vn = o.v.dot(n) - (vel ? vel.dot(n) : 0);
  if (vn < 0) { o.v.addScaledVector(n, -(1 + e) * vn); if (impactFn) impactFn(-vn); }
}
function cornerCollide(o, cx, cy, cz, e, impactFn) {
  c3.set(cx, cy, cz); n3.subVectors(o.p, c3);
  const d = n3.length();
  if (d < o.r && d > 1e-4) { n3.divideScalar(d); o.p.addScaledVector(n3, o.r - d); bounceOff(o, n3, null, e, impactFn); }
}
function stepSphere(o, dt, isBall) {
  o.v.y -= CFG.g * dt;
  o.p.addScaledVector(o.v, dt);
  const d = -o.p.z;
  const impact = isBall ? (s => {
    if (s > 2.5) { sfx.thud(s); cam.shake = Math.max(cam.shake, clamp(s / 45, 0, .25)); dust(o.p.clone().setY(o.p.y - o.r * .8), Math.min(14, s | 0), s * .3); buzz(s > 10 ? 12 : 0); }
    if (ball.flying) { ball.flying = false; const dist = -ball.p.z - ball.throwFrom; if (dist > 6 && o.p.y > H(-o.p.z) - 2) { S.longest = Math.max(S.longest, dist); addPoints(dist * 1.5, ball.p.clone().setY(ball.p.y + 1.6), `${Math.round(dist)} m · +#`, dist > 18 ? 'big' : ''); } }
  }) : null;
  o.grounded = false;
  const gap = inGap(d);
  if (!gap) {
    const h = G(d, o.p.x);
    n3.set(-Gx(d, o.p.x), 1, Gd(d, o.p.x)).normalize();
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
    if (dd < min && dd > 1e-4) { n3.divideScalar(dd); o.p.addScaledVector(n3, min - dd); bounceOff(o, n3, null, .45, isBall ? (s => { if (s > 2) { sfx.thud(s * .7); dust(c3.clone().addScaledVector(n3, r.r), 8, 3); } }) : null); }
  }
  for (const g of gates) {
    if (Math.abs(g.d - d) > 2 + o.r) continue;
    const gy = G(g.d, g.x);
    c3.set(clamp(o.p.x, g.x - g.w / 2, g.x + g.w / 2), clamp(o.p.y, gy, gy + g.h), clamp(o.p.z, -g.d - .4, -g.d + .4));
    n3.subVectors(o.p, c3); const dd = n3.length();
    if (dd < o.r) {
      if (dd < 1e-4) n3.set(0, 0, 1); else n3.divideScalar(dd);
      o.p.addScaledVector(n3, o.r - dd);
      bounceOff(o, n3, tmpV.set(g.vx, 0, 0), .55, isBall ? (s => { if (s > 1.5) { sfx.clang(); burst(c3, 12, 0xffd27a, 5); cam.shake = Math.max(cam.shake, .15); } }) : null);
    }
  }
  if (o.grounded) {
    tmpV.set(0, 1, 0).cross(o.v); const sp = tmpV.length();
    if (sp > 1e-3) { o.spinAxis.copy(tmpV).divideScalar(sp); o.spin = sp / o.r; } else o.spin = 0;
  } else o.spin *= (1 - .3 * dt);
  if (Math.abs(o.spin) > 1e-3) { q.setFromAxisAngle(o.spinAxis, o.spin * dt); o.mesh.quaternion.premultiply(q); }
}
function sphereSphere(a, b, e) {
  n3.subVectors(b.p, a.p); const d = n3.length(), min = a.r + b.r;
  if (d >= min || d < 1e-4) return 0;
  n3.divideScalar(d);
  const tot = a.m + b.m, pen = min - d;
  a.p.addScaledVector(n3, -pen * b.m / tot); b.p.addScaledVector(n3, pen * a.m / tot);
  const rv = tmpV.subVectors(b.v, a.v).dot(n3);
  if (rv >= 0) return 0;
  const j = -(1 + e) * rv / (1 / a.m + 1 / b.m);
  a.v.addScaledVector(n3, -j / a.m); b.v.addScaledVector(n3, j / b.m);
  return -rv;
}
function hitTitan(what) { // rocks, doors and rockfall knock the Titan about
  if (S.shieldReady) { S.shieldReady = false; chips(); sfx.save(); pop('STONE SKIN', P.p.clone().setY(P.p.y + CFG.titanH + .6), 'big'); ring(P.p.clone().setY(P.p.y + 1.5), 0xc9d2de, 3); return; }
  P.stun = .7; sfx.hurt(); buzz([30, 40, 30]); cam.shake = .45;
  $('#flash').classList.add('on'); setTimeout(() => $('#flash').classList.remove('on'), 60);
  pop(what, P.p.clone().setY(P.p.y + CFG.titanH + .6), 'bad');
  S.mult = Math.max(1, S.mult - 1);
}
const prevP = new THREE.Vector3();
function stepTitan(dt) {
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (kx) P.toff += kx * 12 * dt;
  const hw = hwAt(P.d);
  P.toff = clamp(P.toff, -hw + .5, hw - .5);
  P.stun = Math.max(0, P.stun - dt); P.stagger = Math.max(0, P.stagger - dt);
  prevP.copy(P.p);
  // the walk: always uphill, a little faster every stage
  const sp = speedNow() * (P.stun > 0 ? .35 : P.stagger > 0 ? .55 : 1) * (S.grace > 0 ? .5 : 1);
  P.d += sp * dt;
  const steerMax = CFG.steerMax * (S.perks.steady ? 1.35 : 1);
  P.off += clamp((P.toff - P.off) * CFG.steer * (S.perks.steady ? 1.3 : 1), -steerMax, steerMax) * dt * (P.stun > 0 ? .3 : 1);
  P.off = clamp(P.off, -hwAt(P.d) + .5, hwAt(P.d) - .5);
  const x = xc(P.d) + P.off;
  // outcrops and doors shove you aside
  for (const r of rocks) {
    const dx = x - r.x, dz = -P.d + r.d, dd = Math.hypot(dx, dz), min = r.r * .85 + CFG.titanR;
    if (dd < min) {
      P.off += (dx >= 0 ? 1 : -1) * (min - Math.abs(dx)) * .25;
      if (!r.hit) { r.hit = 1; hitTitan('CRUNCH'); dust(P.p.clone().setY(P.p.y + 1), 14, 4); }
    }
  }
  for (const g of gates) {
    if (Math.abs(P.d - g.d) < CFG.titanR + .4 && Math.abs(x - g.x) < g.w / 2 + CFG.titanR * .8) {
      if (!g.hit) { g.hit = 1; hitTitan('CLANG'); sfx.clang(); P.stagger = .5; }
    } else if (P.d > g.d + 2) g.hit = 0;
  }
  P.p.set(xc(P.d) + P.off, 0, -P.d);
  P.p.y = G(P.d, P.p.x) + .08;
  P.v.subVectors(P.p, prevP).divideScalar(dt);
  // winding up
  if (P.charging) {
    P.charge = Math.min(1, P.charge + dt / (CFG.chargeTime / (1 + .35 * S.perks.quick)));
    if (P.stun > 0) { P.charging = false; P.charge = 0; }
  }
  P.cool = Math.max(0, P.cool - dt); P.bumpCool = Math.max(0, P.bumpCool - dt);
  // the boulder meets the Titan
  const gap = ballGap();
  if (gap < 0 && !ball.lost) {
    ball.p.addScaledVector(nrm, -gap);
    if (P.charging && P.charge > .15) { // winding up when it arrives: it gets hit anyway, just not perfectly
      const c = P.charge * .75; P.charging = false; P.charge = 0; strike(c, true);
    } else {
      const rel = tmpV.subVectors(ball.v, P.v).dot(nrm);
      if (rel < 0) ball.v.addScaledVector(nrm, -(1 + .2) * rel);
      if (P.bumpCool <= 0) { // a bonk: a weak shove ahead, costs your combo
        P.bumpCool = .45; P.stagger = .3;
        const bd = -ball.p.z;
        ball.v.set(xcp(bd) * 6 + (rnd(-2.5, 2.5) + (ball.p.x - P.p.x)) * (1 - .6 * ridgeAmt(bd)), 5.5, -(speedNow() + 4));
        ball.flying = false;
        sfx.bonk(); dust(ball.p.clone().addScaledVector(nrm, -ball.r), 8, 3);
        pop('bonk', ball.p.clone().setY(ball.p.y + 1.6), 'dim');
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
    const hit = sphereSphere(t, ball, .4);
    if (hit > 3 && !ball.lost) { sfx.thud(hit); dust(ball.p.clone(), 10, 4); cam.shake = Math.max(cam.shake, .2); }
    const dx = t.p.x - P.p.x, dz = t.p.z - P.p.z, dd = Math.hypot(dx, dz);
    if (dd < t.r + CFG.titanR && t.p.y < P.p.y + CFG.titanH + t.r && !t.dead) {
      t.dead = true; hitTitan('ROCKFALL'); dust(t.p.clone(), 18, 5);
      t.v.set(dx / dd * 6, 5, Math.abs(t.v.z) * .3);
    }
  }
  for (let i = tumblers.length - 1; i >= 0; i--) {
    const t = tumblers[i];
    if (-t.p.z < P.d - 14 || t.p.y < H(-t.p.z) - 14) { scene.remove(t.mesh); tumblers.splice(i, 1); }
  }
  const st = stageDef(stageAt(P.d));
  if (st.tumble > 0) {
    S.tumbleT -= dt;
    if (S.tumbleT <= 0) { S.tumbleT = Math.max(1.4, (3.6 - Math.min(stageAt(P.d), 10) * .1) / st.tumble) * rnd(.7, 1.3); spawnTumbler(P.d + rnd(45, 65)); sfx.rockfall(); }
  }
  // energy cells
  for (const s of cells) {
    if (s.taken) continue;
    const sp = s.mesh.position;
    if (S.perks.magnet && ball.p.distanceTo(sp) < 7 && !ball.lost) { tmpV.subVectors(ball.p, sp).multiplyScalar(dt * 3); s.off += tmpV.x; s.y += tmpV.y; s.d -= tmpV.z; }
    const byBall = ball.p.distanceTo(sp) < ball.r + .7;
    const byTitan = Math.hypot(P.p.x - sp.x, P.p.z - sp.z) < CFG.titanR + .5 && sp.y < P.p.y + CFG.titanH + .4;
    if (byBall || byTitan) {
      s.taken = true; S.cells++;
      addPoints(CELL[s.tier].val * (byBall ? 1 : .5), sp, null, s.tier ? 'big' : '');
      sfx.cell(s.tier); burst(sp.clone(), 18, CELL[s.tier].col, 5, null, 4);
      s.mesh.visible = false;
    }
  }
  // camps: bonus, a boulder back, and an advantage to choose
  for (const c of camps) {
    if (!c.reached && P.d > c.d) {
      c.reached = true; S.camps = Math.max(S.camps, c.k);
      const bonus = 150 * c.k;
      S.bonus += bonus * S.mult;
      if (S.lives < S.maxLives) S.lives++;
      if (S.perks.shield) S.shieldReady = true;
      if (S.perks.backstop) S.backstopReady = true;
      sfx.camp(); buzz([20, 40, 20, 40, 60]);
      burst(P.p.clone().setY(P.p.y + 4), 50, c.st.tint, 10, new THREE.Vector3(0, 1, 0), 6, [.6, 1.4]);
      const next = stageDef(c.k);
      banner(`CAMP ${c.k} · ${next.name.toUpperCase()}`, next.note);
      pop(`+${bonus * S.mult}`, P.p.clone().setY(P.p.y + CFG.titanH + 2), 'big');
      chips();
      if (!ball.lost) offerPerks(c.k); else S.pendingPerk = c.k;
      return;
    }
  }
  // lost boulder?
  if (!ball.lost) {
    const bd = -ball.p.z;
    let why = '';
    if (ball.p.y < H(bd) - 5) why = nearGap(bd, 4) ? 'INTO THE CREVASSE' : 'OFF THE RIDGE';
    else if (bd < P.d - 2.6) why = 'IT GOT PAST YOU';
    if (why === 'IT GOT PAST YOU' && S.backstopReady) {
      S.backstopReady = false; chips(); sfx.save();
      placeBall(P.d + 8, P.off * .5, 2.5);
      pop('BACKSTOP', P.p.clone().setY(P.p.y + CFG.titanH + 1), 'big');
      ring(ball.p.clone(), 0xff3fb4, 4);
    } else if (why) {
      ball.lost = 1.8; ball.lostWhy = why; S.mult = 1;
      sfx.lost(); buzz([60, 50, 90]);
      pop(why, P.p.clone().setY(P.p.y + CFG.titanH + 1.5), 'bad');
    }
  } else {
    ball.lost -= dt;
    if (ball.lost <= 0) {
      S.lives--;
      if (S.lives <= 0) { ball.lost = 0; gameOver(); return; }
      let d = P.d + 11; while (nearGap(d, 3)) d += 1.5;
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
const lookAt = new THREE.Vector3(), scr = new THREE.Vector3(), scr2 = new THREE.Vector3();
const stageTint = new THREE.Color(STAGES[0].tint);
function predictArc() {
  const v = strikeVel(Math.max(.12, P.charge), false, new THREE.Vector3());
  const p = ball.p.clone(), pos = arcGeo.attributes.position;
  let landed = false, i = 0;
  for (let s = 0; s < 240 && i < ARC_N; s++) {
    v.y -= CFG.g / 60; p.addScaledVector(v, 1 / 60);
    if (s % 3 === 0) { pos.setXYZ(i++, p.x, p.y, p.z); }
    const d = -p.z;
    if (!inGap(d) && p.y - ball.r < G(d, p.x)) { landed = true; break; }
    if (p.y < H(d) - 6) break;
  }
  for (; i < ARC_N; i++) pos.setXYZ(i, p.x, p.y, p.z);
  pos.needsUpdate = true;
  const d = -p.z, bad = !landed || inGap(d);
  arcLand.position.set(p.x, G(d, p.x) + .08, p.z); arcLand.rotation.set(-Math.PI / 2, 0, 0);
  arcLand.material.color.setRGB(bad ? 1 : 1, bad ? .3 : .8, bad ? .2 : .4).multiplyScalar(1.6);
}
function render(dt, t) {
  // Titan pose: lean back and draw the ram in while winding up, snap forward on release
  const c = P.charging ? P.charge : 0;
  P.release = Math.max(0, P.release - dt * 4);
  const snap = Math.sin(Math.min(1, 1 - P.release) * Math.PI) * (P.release > 0 ? 1 : 0);
  const shiver = c > .95 ? Math.sin(t * 60) * .012 : 0;
  const leanTarget = c * .28 - snap * .2 + shiver;
  P.lean = lerp(P.lean, leanTarget, 1 - Math.exp(-(P.charging ? 10 : 22) * dt));
  const g = P.group;
  g.position.copy(P.p); g.position.y += Math.sin(t * 3) * .04 + (P.stun > 0 ? Math.sin(t * 40) * .05 : 0);
  g.rotation.y = -Math.atan(xcp(P.d)) * .8;
  P.body.rotation.x = P.lean; // positive = leaning back toward the camera
  P.body.rotation.z = lerp(P.body.rotation.z, -clamp((P.toff - P.off) * .03, -.12, .12), .2);
  P.ram.position.z = c * .55 - snap * .7;
  for (const ps of P.pistons) { ps.scale.y = clamp(.3 + (1 - c) * .5 + snap * .7, .2, 1.4); ps.position.z = -CFG.titanR * .9 + c * .3 - snap * .35; }
  P.chargeM.opacity = c * .9 + snap * .6;
  const stunned = P.stun > 0;
  P.tubeM.color.setRGB(stunned ? 1 : .45 + c * .55, stunned ? .3 : .95 - c * .4, stunned ? .2 : 1 - c * .8).multiplyScalar(2);
  P.thr.material.opacity = .4 + Math.sin(t * 20) * .06;
  // see-through when the boulder is behind it
  scr.copy(ball.p).project(camera);
  scr2.copy(P.p).setY(P.p.y + CFG.titanH * .5).project(camera);
  const titanW = .26, titanHgt = .5;
  const behind = Math.abs(scr.x - scr2.x) < titanW && Math.abs(scr.y - scr2.y) < titanHgt && camera.position.distanceTo(ball.p) > camera.position.distanceTo(P.p);
  P.fade = lerp(P.fade, behind ? .5 : 1, 1 - Math.exp(-10 * dt));
  for (const m of titanMats) { if (m === P.chargeM) continue; m.opacity = m === P.tubeM ? Math.max(.85, P.fade) : P.fade; m.depthWrite = P.fade > .95; }
  // reach ring + button
  const gap = ballGap();
  const inReach = gap < reachNow() && -ball.p.z > P.d - .4 && !ball.lost;
  reachRing.position.set(P.p.x, P.p.y + .06, P.p.z);
  reachRing.rotation.set(-Math.PI / 2 + Math.atan(Hp(P.d)), 0, 0);
  reachRing.scale.setScalar(CFG.titanR + reachNow() + ball.r * .3);
  reachRing.material.opacity = lerp(reachRing.material.opacity, inReach ? .8 : (P.charging ? .3 : .05), .25);
  smackBtn.classList.toggle('ready', P.cool <= 0 && !P.charging);
  smackBtn.classList.toggle('inreach', inReach && !P.charging);
  smackBtn.classList.toggle('charging', P.charging);
  smackBtn.style.setProperty('--p', P.charging ? P.charge : 1);
  smackBtn.style.setProperty('--c', P.charge);
  smackBtn.style.setProperty('--rc', P.charging ? (P.charge > .95 ? '#ffd27a' : '#ff8a3a') : 'var(--accent)');
  if (chargeGain) { chargeGain.gain.value = P.charging ? .03 + P.charge * .05 : 0; chargeOsc.frequency.value = 55 + P.charge * 90; }
  // aim arc
  const showArc = S.perks.arc && P.charging && !ball.lost && mode === 'play';
  arc.visible = arcLand.visible = !!showArc;
  if (showArc) predictArc();
  // boulder
  ball.group.position.copy(ball.p);
  ball.heat = Math.max(0, ball.heat - dt * .9);
  ball.mat.emissiveIntensity = .25 + ball.heat * 2;
  const bd = -ball.p.z, gh = inGap(bd) ? H(bd) - 10 : G(bd, ball.p.x);
  const above = ball.p.y - ball.r - gh;
  ball.marker.position.set(ball.p.x, gh + .07, ball.p.z);
  ball.marker.rotation.set(-Math.PI / 2 + Math.atan(Hp(bd)), 0, 0);
  ball.marker.scale.setScalar(ball.r * (1 + above * .1));
  ball.marker.material.opacity = clamp((above - 1.5) * .2, 0, .6) * (inGap(bd) ? 0 : 1);
  for (const tb of tumblers) tb.mesh.position.copy(tb.p);
  for (const s of cells) if (!s.taken) { s.t += dt; s.mesh.rotation.y = s.t * 1.6; s.mesh.position.set(xc(s.d) + s.off, H(s.d) + s.y + Math.sin(s.t * 2.2) * .15, -s.d); }
  for (const gt of gates) gt.mesh.position.set(gt.x, G(gt.d, gt.x) + gt.h / 2, -gt.d);
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / .55; if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); continue; }
    r.m.scale.setScalar(.3 + k * r.size); r.m.material.opacity = 1 - k;
  }
  stepParts(dt); stepDust(dt); stepPops(dt);
  // stage tint for the lab bits
  stageTint.lerp(new THREE.Color(stageDef(stageAt(P.d)).tint), 1 - Math.exp(-1.5 * dt));
  document.documentElement.style.setProperty('--accent', '#' + stageTint.getHexString());
  // camera: locked behind the Titan, low, close and wide, turning with the valley
  const back = 7.4 + c * 1.1 - snap * .5, up = 5.4 + c * .45, ahead = 18;
  const cd = P.d - back;
  const tx = xc(cd) + P.off * .9, ty = Math.max(H(cd), H(P.d) - 1.2) + up;
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-9 * dt));
  cam.y = lerp(cam.y, ty, 1 - Math.exp(-8 * dt));
  cam.z = lerp(cam.z, -cd, 1 - Math.exp(-12 * dt));
  let ly = H(P.d + ahead) + 2.2;
  if (!ball.lost) ly += Math.max(0, ball.p.y - (G(-ball.p.z, ball.p.x) + 3)) * .3;
  cam.lookY = lerp(cam.lookY, ly, 1 - Math.exp(-4 * dt));
  cam.lookX = lerp(cam.lookX, xc(P.d + ahead) + P.off * .6, 1 - Math.exp(-5 * dt));
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  const sh = cam.shake * cam.shake;
  camera.position.set(cam.x + rnd(-1, 1) * sh, cam.y + rnd(-1, 1) * sh, cam.z);
  lookAt.set(cam.lookX, cam.lookY, -(P.d + ahead));
  camera.lookAt(lookAt);
  skyGroup.position.copy(camera.position);
  peak.userData.beacon.material.opacity = .6 + Math.sin(t * 1.3) * .4;
  const blink = (Math.sin(t * 6) > 0) ? 1 : .15;
  for (let i = blinkers.length - 1; i >= 0; i--) { const b = blinkers[i]; if (!b.parent || !b.parent.parent) { blinkers.splice(i, 1); continue; } b.material.opacity = blink; }
  moon.position.set(camera.position.x - 14, camera.position.y + 26, camera.position.z - 6);
  moon.target.position.set(camera.position.x, camera.position.y - 5, camera.position.z - 16);
  // snow gets heavier the higher you go
  const sAmt = snowAt(P.d);
  snowPts.material.opacity = sAmt * .9;
  if (sAmt > 0) {
    const sp = sGeo.attributes.position;
    for (let i = 0; i < NSNOW; i++) {
      let y = sp.getY(i) - dt * (1.6 + (i % 5) * .3), x = sp.getX(i) + Math.sin(t * .7 + i) * dt * .6;
      if (y < -6) y += 30;
      sp.setXY(i, x, y);
    }
    sp.needsUpdate = true;
    snowPts.position.set(camera.position.x, camera.position.y - 5, camera.position.z);
  }
}

// ---------------------------------------------------------------- resize & loop
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  camera.fov = clamp(2 * Math.atan(Math.tan(30 * Math.PI / 180) / aspect) * 180 / Math.PI, 66, 94);
  camera.aspect = aspect; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize(); resetWorld(); render(1 / 60, 0);
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000); last = now;
  if (mode === 'play') {
    let scale = 1;
    if (S.perks.focus && P.charging && ballGap() < 7 && -ball.p.z > P.d) scale = .55;
    acc += dt * scale;
    while (acc >= FIXED) { update(FIXED); acc -= FIXED; if (mode !== 'play') { acc = 0; break; } }
    hud();
    render(dt * scale, now / 1000);
  } else {
    if (mode === 'title') { ball.p.y = G(-ball.p.z, ball.p.x) + ball.r; ball.v.set(0, 0, 0); }
    else if (mode === 'over') { acc += dt; while (acc >= FIXED) { stepSphere(ball, FIXED, false); acc -= FIXED; } }
    render(mode === 'perk' ? 0 : dt, now / 1000);
  }
  composer.render();
}
requestAnimationFrame(frame);
window.__summit = { S, P, ball, CFG, H, G, xc, inGap, offerPerks, start, strike, update, takePerk, get mode() { return mode; }, get perkChoices() { return perkChoices; }, ballGap, reachNow };
