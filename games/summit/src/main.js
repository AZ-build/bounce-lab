// SUMMIT v1 — a Sisyphus game for Bounce Lab.
// Evolved from Rebound: a tall Titan pillar, a heavy boulder, a low chase camera,
// and an endless mountain that gets steeper and meaner the higher you go.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- tuning
const CFG = {
  g: 26,              // gravity (heavier than Rebound's 19)
  ballR: 1.45,        // boulder radius (Rebound ball was 1)
  ballBounce: 0.3,    // heavy = low bounce
  ballRoll: 0.16,     // rolling resistance
  strikerR: 1.25,     // Titan radius
  strikerH: 3.0,      // Titan height (Rebound's puck was ~0.45)
  moveMax: 11.5,      // Titan top speed
  spring: 14,         // how quickly the Titan follows your thumb
  dragGain: 1.3,      // a bit more than 1:1 thumb movement
  smackUp: 11.5,
  smackFwd: 17,
  smackReach: 2.3,    // gap between Titan and boulder surfaces that still counts
  smackCool: 0.5,
  perfectGap: 1.0,
  hw: 6.5,            // half track width
  ridgeHw: 5.0,
  stageLen: 180,
  campLen: 16,
  startFlat: 10,
};
const STAGES = [
  { name: 'Foothills', note: 'Smack the boulder uphill. Catch it on the way back.', color: 0x3ef6ff, deg: 8, rocks: .5, tumble: 0, gaps: 0, gates: 0, ridge: 0 },
  { name: 'The Scree', note: 'Loose rocks tumble down. Dodge them.', color: 0xffb43a, deg: 10.5, rocks: .55, tumble: 1, gaps: 0, gates: 0, ridge: 0 },
  { name: 'Crevasses', note: 'Smack it clean over the gaps.', color: 0xff3fb4, deg: 12.5, rocks: .4, tumble: .45, gaps: 1, gates: 0, ridge: 0 },
  { name: 'The Gates', note: 'Sliding slabs knock it back down.', color: 0x7dff6a, deg: 14, rocks: .35, tumble: .5, gaps: .35, gates: 1, ridge: 0 },
  { name: 'The Ridge', note: 'No walls up here. Keep it on the path.', color: 0xa77bff, deg: 15, rocks: .3, tumble: .4, gaps: .35, gates: .3, ridge: 1 },
];
function stageDef(k) {
  if (k < STAGES.length) return STAGES[k];
  const loop = k - STAGES.length, lap = Math.floor(loop / (STAGES.length - 1)) + 1;
  const base = STAGES[1 + (loop % (STAGES.length - 1))];
  const c = new THREE.Color(base.color); c.offsetHSL(0.07 * lap, 0, 0);
  return { ...base, name: base.name + ' ' + roman(lap + 1), color: c.getHex(), deg: Math.min(24, base.deg + 2.5 * lap),
    rocks: Math.min(.8, base.rocks + .1 * lap), tumble: Math.min(1.4, base.tumble + .35 * lap), gaps: Math.min(1, base.gaps + .3 * lap),
    gates: Math.min(1, base.gates + .25 * lap), ridge: base.ridge, mixed: true };
}
const roman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);

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

// ---------------------------------------------------------------- the mountain (height along the path)
// d = distance up the path (d = -z). Ground height H(d) is the integral of the slope.
const STEP = 0.5, D0 = -60;
const Harr = [0];
let Hmax = D0;
function slopeDeg(d) {
  const { stageLen: L, campLen: C, startFlat } = CFG;
  if (d < startFlat) return d < -20 ? 6 : 0;
  const k = Math.floor(d / L), local = d - k * L;
  if (k >= 1 && local < C) return 0;
  const st = stageDef(k);
  const start = k === 0 ? startFlat : C;
  const ease = smooth(start, start + 14, local);
  // a near-flat landing ledge just past each crevasse
  let ledge = 1;
  for (const g of gapsFor(k)) { if (d > g.d1 - 1 && d < g.d1 + 14) ledge = Math.min(ledge, .15 + .85 * smooth(g.d1 + 7, g.d1 + 14, d)); }
  return st.deg * ease * ledge * (1 + 0.16 * Math.sin(d * 0.045));
}
function ensureH(d) {
  while (Hmax < d + 2) {
    const i = Harr.length - 1;
    const dm = D0 + i * STEP + STEP / 2;
    // behind the start the mountain keeps falling away below you
    const deg = dm < -20 ? 6 : slopeDeg(dm);
    Harr.push(Harr[i] + Math.tan(deg * Math.PI / 180) * STEP);
    Hmax = D0 + (Harr.length - 1) * STEP;
  }
}
function H(d) {
  if (d <= D0) return Harr[0] - (D0 - d) * 0.1;
  ensureH(d);
  const f = (d - D0) / STEP, i = Math.floor(f), t = f - i;
  return Harr[i] + (Harr[i + 1] - Harr[i]) * t;
}
function Hp(d) { return (H(d + 0.25) - H(d - 0.25)) / 0.5; }
const stageAt = d => d < 0 ? 0 : Math.floor(d / CFG.stageLen);
function hwAt(d) {
  const k = stageAt(d), local = d - k * CFG.stageLen, st = stageDef(k);
  if (!st.ridge) return CFG.hw;
  return lerp(CFG.hw, CFG.ridgeHw, smooth(CFG.campLen, CFG.campLen + 8, local));
}
function railsAt(d) {
  const k = stageAt(d), local = d - k * CFG.stageLen;
  return !(stageDef(k).ridge && local >= CFG.campLen);
}

// ---------------------------------------------------------------- course objects per stage
const gapCache = new Map(); // stage -> [{d0, d1}] (pure function of the stage, so the slope can use it)
function gapsFor(k) {
  if (k < 0) return [];
  if (gapCache.has(k)) return gapCache.get(k);
  const st = stageDef(k), out = [];
  if (st.gaps > 0) {
    const R = mulberry(k * 104729 + 7), L = CFG.stageLen, base = k * L;
    const start = k === 0 ? 34 : CFG.campLen + 14, end = L - 10;
    let d = base + start + 8;
    while (d < base + end - 18) {
      if (R() < st.gaps) {
        const w = Math.min(7, 3 + Math.min(k, 8) * .35 + R() * 1.6);
        out.push({ d0: d, d1: d + w });
        d += w + 26 + R() * 14;
      } else d += 18 + R() * 12;
    }
  }
  gapCache.set(k, out); return out;
}
const rocks = [];    // static outcrops {x, d, r, mesh}
const gates = [];    // sliding slabs
const shards = [];   // pickups
const camps = [];    // {k, d, mesh, reached}
const builtStages = new Set();
function inGap(d) { for (const g of gapsFor(stageAt(d))) if (d > g.d0 && d < g.d1) return g; return null; }
function nearGap(d, m) { for (const k of [stageAt(d - m), stageAt(d + m)]) for (const g of gapsFor(k)) if (d > g.d0 - m && d < g.d1 + m) return true; return false; }

// ---------------------------------------------------------------- renderer + scene
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const FOG = new THREE.Color(0x07081a);
scene.fog = new THREE.Fog(FOG, 30, 150);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1200);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
if ('environmentIntensity' in scene) scene.environmentIntensity = 0.35;
scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x120a08, 0.5));
const moon = new THREE.DirectionalLight(0xbfd4ff, 1.1);
moon.position.set(-8, 20, 6);
scene.add(moon); scene.add(moon.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.4, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// soft round sprite used for glows, shadows and particles
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// ---- sky, stars and the summit that never gets closer
const skyUni = { top: { value: new THREE.Color(0x010208) }, horizon: { value: new THREE.Color(0x0a0c24) }, glow: { value: new THREE.Color(0x3ef6ff) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform vec3 top, horizon, glow; varying vec3 vP; void main(){ float h = vP.y; vec3 c = mix(horizon, top, smoothstep(-0.02,0.5,h)); c += glow*exp(-abs(h-0.03)*16.0)*0.16; c = mix(c, horizon*0.5, smoothstep(0.0,-0.3,h)); gl_FragColor = vec4(c,1.); }',
}));
const skyGroup = new THREE.Group(); skyGroup.add(sky); scene.add(skyGroup);
{
  const n = 1200, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 820, s = Math.sqrt(1 - u * u);
    pos[i * 3] = r * s * Math.cos(a); pos[i * 3 + 1] = Math.abs(r * u) * 0.9 + 20; pos[i * 3 + 2] = r * s * Math.sin(a);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  skyGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9dcff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: .8 })));
}
// distant peak: a dark low-poly mountain with a beacon on top
const peak = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: 1, metalness: 0, flatShading: true, fog: false });
  const mk = (r, h, x, z, seg) => {
    const geo = new THREE.ConeGeometry(r, h, seg, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < h / 2 - 1) { p.setX(i, p.getX(i) * rnd(.85, 1.12)); p.setZ(i, p.getZ(i) * rnd(.85, 1.12)); p.setY(i, y + rnd(-h * .03, h * .03)); } }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.position.set(x, h / 2, z); peak.add(m); return m;
  };
  mk(260, 360, 0, 0, 9); mk(180, 210, -230, 60, 7); mk(200, 240, 250, 40, 8); mk(140, 150, -420, 90, 7); mk(150, 170, 430, 100, 7);
  // snow-line glow edges
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(peak.children[0].geometry, 25), new THREE.LineBasicMaterial({ color: 0x3ef6ff, transparent: true, opacity: .12, fog: false }));
  edge.position.copy(peak.children[0].position); peak.add(edge); peak.userData.edge = edge;
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, .55, .2).multiplyScalar(3), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  beacon.scale.set(34, 34, 1); beacon.position.set(0, 362, 0); peak.add(beacon); peak.userData.beacon = beacon;
}
skyGroup.add(peak);
peak.position.set(0, -120, -620);

// ---- materials
const stageColor = new THREE.Color(STAGES[0].color);
const stageTarget = new THREE.Color(STAGES[0].color);
function gridTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 3;
  x.strokeRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,.25)'; x.lineWidth = 1.5;
  x.beginPath(); x.moveTo(128, 0); x.lineTo(128, 256); x.moveTo(0, 128); x.lineTo(256, 128); x.stroke();
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rockTexture(size = 256, base = [26, 28, 34], spread = 18) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (Math.random() - .5) * spread + (Math.random() < .02 ? 22 : 0);
    img.data[i * 4] = base[0] + n; img.data[i * 4 + 1] = base[1] + n; img.data[i * 4 + 2] = base[2] + n; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},${rnd(.03, .07)})`; x.beginPath(); x.arc(rnd(0, size), rnd(0, size), rnd(8, 40), 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const grid = gridTexture(); grid.repeat.set(1 / 4, 1 / 4);
const trackTex = rockTexture(256, [30, 32, 38], 16); trackTex.repeat.set(1 / 6, 1 / 6);
const trackMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ad, map: trackTex, roughness: .82, metalness: .15, emissive: stageColor.clone(), emissiveMap: grid, emissiveIntensity: .32 });
const wallTex = rockTexture(256, [18, 19, 24], 14); wallTex.repeat.set(1 / 10, 1 / 10);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, map: wallTex, roughness: 1, metalness: 0, flatShading: true });
const cliffMat = new THREE.MeshStandardMaterial({ color: 0x6a6f7c, map: wallTex, roughness: 1, flatShading: true, side: THREE.DoubleSide });
const railGlass = new THREE.MeshBasicMaterial({ color: stageColor.clone(), transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide });
const railLine = new THREE.MeshBasicMaterial({ color: stageColor.clone().multiplyScalar(2) });
const dangerLine = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .3, .15).multiplyScalar(2.6) });
const abyssMat = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(1, .25, .08).multiplyScalar(.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const crevMat = new THREE.MeshStandardMaterial({ color: 0x0c0d12, roughness: 1, side: THREE.DoubleSide });
const postMat = new THREE.MeshBasicMaterial({ color: stageColor.clone().multiplyScalar(2.2) });

// ---------------------------------------------------------------- terrain chunks
const CH = 40;
const chunks = new Map();
function ribbon(points, mat) { // points: array of [x,y,z] pairs (bottom, top) along a path
  const g = new THREE.BufferGeometry(), pos = [], idx = [];
  for (let i = 0; i < points.length; i++) pos.push(...points[i][0], ...points[i][1]);
  for (let i = 0; i < points.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
function buildChunk(c) {
  const grp = new THREE.Group();
  const a = c * CH, b = a + CH;
  // split [a,b] into solid pieces around crevasses
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
    if (p1 - p0 < 0.05) continue;
    const ds = []; for (let d = p0; d < p1; d += 1) ds.push(d); ds.push(p1);
    // track surface
    const pos = [], uv = [], idx = [];
    const cols = 4;
    ds.forEach((d, i) => {
      const hw = hwAt(d), h = H(d);
      for (let j = 0; j <= cols; j++) { const x = -hw + (2 * hw) * j / cols; pos.push(x, h, -d); uv.push(x, d); }
      if (i > 0) for (let j = 0; j < cols; j++) { const r0 = (i - 1) * (cols + 1) + j, r1 = i * (cols + 1) + j; idx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    grp.add(new THREE.Mesh(g, trackMat));
    // sides: canyon walls where there are rails, sheer drops on the ridge
    for (const s of [-1, 1]) {
      const wallPos = [], wallIdx = [], wc = 4;
      ds.forEach((d, i) => {
        const hw = hwAt(d), h = H(d), rails = railsAt(d);
        for (let j = 0; j <= wc; j++) {
          const t = j / wc, x = s * (hw + t * 34);
          const y = rails ? h + 0.9 + Math.pow(t, 1.3) * 22 + (j > 0 ? Math.sin(d * .31 + j * 1.7 + s) * 1.6 * t : 0)
                          : h - 0.2 - t * 26 + (j > 0 ? Math.sin(d * .27 + j) * 1.5 : 0);
          wallPos.push(j === 0 ? s * hw : x, j === 0 ? (rails ? h + 0.9 : h - 0.05) : y, -d);
        }
        if (i > 0) for (let j = 0; j < wc; j++) {
          const r0 = (i - 1) * (wc + 1) + j, r1 = i * (wc + 1) + j;
          if (s > 0) wallIdx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1); else wallIdx.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
        }
      });
      const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); wg.setIndex(wallIdx); wg.computeVertexNormals();
      grp.add(new THREE.Mesh(wg, railsAt((p0 + p1) / 2) ? wallMat : cliffMat));
      // rail: a glass barrier with a neon top line, or a warning edge on the ridge
      const railPts = [], linePts = [], edgePts = [];
      for (const d of ds) {
        const hw = hwAt(d), h = H(d);
        if (railsAt(d)) { railPts.push([[s * hw, h, -d], [s * hw, h + .9, -d]]); linePts.push([[s * hw, h + .84, -d], [s * hw, h + .96, -d]]); }
        else edgePts.push([[s * hw, h + .02, -d], [s * (hw - .12), h + .03, -d]]);
      }
      if (railPts.length > 1) { grp.add(ribbon(railPts, railGlass)); grp.add(ribbon(linePts, railLine)); }
      if (edgePts.length > 1) grp.add(ribbon(edgePts, dangerLine));
    }
    // marker posts for a sense of speed
    for (let d = Math.ceil(p0 / 10) * 10; d < p1; d += 10) {
      if (!railsAt(d)) continue;
      for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.12, 1.4, .12), postMat); m.position.set(s * (hwAt(d) + .05), H(d) + .7, -d); grp.add(m); }
    }
  }
  // crevasse walls, glowing lips and a hot glow far below
  for (const g of near) {
    if (g.d1 < a || g.d0 > b) continue;
    const mid = (g.d0 + g.d1) / 2;
    if (mid < a || mid >= b) continue;
    for (const ld of [g.d0, g.d1]) {
      const hw = hwAt(ld) + .3, h = H(ld);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 14), crevMat);
      wall.position.set(0, h - 7, -ld); grp.add(wall);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - .6, .08, .14), dangerLine);
      lip.position.set(0, h + .03, -ld + (ld === g.d0 ? -.07 : .07)); grp.add(lip);
    }
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(g.d1 - g.d0, 14), crevMat);
      side.rotation.y = Math.PI / 2; side.position.set(s * (hwAt(mid) + .3), H(mid) - 7, -mid); grp.add(side);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(hwAt(mid) * 2, (g.d1 - g.d0) * 1.3), abyssMat);
    glow.rotation.x = -Math.PI / 2; glow.position.set(0, H(mid) - 9, -mid); grp.add(glow);
  }
  scene.add(grp);
  chunks.set(c, grp);
}
function disposeGroup(g) { scene.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
function updateChunks(d) {
  const c0 = Math.floor((d - 50) / CH), c1 = Math.floor((d + 170) / CH);
  for (let s = stageAt(Math.max(0, d)); s <= stageAt(d + 240); s++) buildStage(s);
  for (let c = c0; c <= c1; c++) if (!chunks.has(c)) buildChunk(c);
  for (const [c, g] of chunks) if (c < c0 - 1 || c > c1 + 1) { disposeGroup(g); chunks.delete(c); }
}

// ---------------------------------------------------------------- stage contents
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5e68, map: rockTexture(128, [40, 42, 48], 26), roughness: .95, metalness: .05, flatShading: true });
const slabMat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: .8, roughness: .3 });
const shardMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .72, .2).multiplyScalar(2.2) });
const shardMatB = new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, .95, 1).multiplyScalar(2.4) });
const shardGeo = new THREE.OctahedronGeometry(.42, 0);
function rockGeo(r, seedR) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 0.82 + seedR() * 0.32);
    const f = map.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * .9, p.getZ(i) * f);
  }
  g.computeVertexNormals(); return g;
}
function buildStage(k) {
  if (builtStages.has(k)) return;
  builtStages.add(k);
  const R = mulberry(k * 7919 + 13), st = stageDef(k);
  const L = CFG.stageLen, base = k * L, C = CFG.campLen;
  // camp terrace marker (from stage 1 up)
  if (k >= 1) {
    const d = base + C * 0.5, h = H(d), hw = CFG.hw;
    const grp = new THREE.Group();
    const col = new THREE.Color(st.color);
    const postM = new THREE.MeshStandardMaterial({ color: 0x20232b, metalness: .85, roughness: .3 });
    const neon = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4) });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.5, 7, .5), postM); p.position.set(s * (hw + .4), h + 3.5, -d); grp.add(p);
      const n = new THREE.Mesh(new THREE.BoxGeometry(.08, 6.4, .08), neon); n.position.set(s * (hw + .4) - s * .27, h + 3.5, -d + .27); grp.add(n);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.3, .5, .5), postM); bar.position.set(0, h + 7, -d); grp.add(bar);
    const barN = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + .4, .1, .1), neon); barN.position.set(0, h + 6.7, -d + .27); grp.add(barN);
    const sign = textSprite(`CAMP ${k}`, '#' + col.getHexString()); sign.position.set(0, h + 8.3, -d); grp.add(sign);
    const lineM = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, .25), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8), transparent: true, opacity: .85 }));
    lineM.rotation.x = -Math.PI / 2; lineM.position.set(0, H(base + 2) + .03, -(base + 2)); grp.add(lineM);
    scene.add(grp);
    camps.push({ k, d: base + 2, mesh: grp, reached: false, name: st.name, note: st.note, color: st.color });
  }
  const start = k === 0 ? 34 : C + 14;
  const end = L - 10;
  // static outcrops
  if (st.rocks > 0) {
    let d = base + start;
    while (d < base + end) {
      if (R() < st.rocks && !nearGap(d, 5)) {
        const hw = hwAt(d), r = 0.9 + R() * 0.8;
        const x = (R() * 2 - 1) * (hw - r - .6);
        const mesh = new THREE.Mesh(rockGeo(r, R), stoneMat);
        const cy = H(d) + r * .35;
        mesh.position.set(x, cy, -d); mesh.rotation.set(R() * 3, R() * 3, R() * 3);
        scene.add(mesh);
        rocks.push({ x, d, r, cy, mesh });
      }
      d += 12 + R() * 12;
    }
  }
  // sliding slabs
  if (st.gates > 0) {
    let d = base + start + 20;
    while (d < base + end - 6) {
      if (R() < st.gates && !nearGap(d, 6)) {
        const hw = hwAt(d), w = 4.4 + R() * 1.6, hgt = 2.4 + R() * .6;
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, .9), slabMat); grp.add(body);
        const col = new THREE.Color(1, .3, .55).multiplyScalar(2.4);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: col }));
        grp.add(edge);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(w * .86, .14, .04), new THREE.MeshBasicMaterial({ color: col })); stripe.position.set(0, hgt * .15, .47); grp.add(stripe);
        scene.add(grp);
        gates.push({ d, w, h: hgt, amp: hw - w / 2 - .2, speed: .7 + R() * .6 + Math.min(k, 10) * .04, phase: R() * 6.28, x: 0, vx: 0, mesh: grp });
      }
      d += 26 + R() * 14;
    }
  }
  // shards
  let d = base + (k === 0 ? 20 : C + 6);
  while (d < base + L - 4) {
    const hw = hwAt(d), high = R() < .3;
    const x = (R() * 2 - 1) * (hw - 1.4);
    const y = high ? 4 + R() * 2.5 : 1.3 + R() * 1.6;
    const mesh = new THREE.Mesh(shardGeo, high ? shardMatB : shardMatA);
    if (high) mesh.scale.setScalar(1.35);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: high ? 0x3ef6ff : 0xffb43a, transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(high ? 2.2 : 1.5); mesh.add(halo);
    mesh.position.set(x, H(d) + y, -d); scene.add(mesh);
    shards.push({ x, d, y, high, mesh, taken: false, t: R() * 6 });
    d += 7 + R() * 7;
  }
}
function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.font = '800 74px -apple-system, Segoe UI, Roboto, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = color; x.shadowBlur = 24; x.fillStyle = '#fff'; x.fillText(text, 256, 66);
  x.shadowBlur = 0; x.fillStyle = color; x.globalAlpha = .35; x.fillText(text, 256, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(8, 2, 1); return s;
}
function cullBehind(d) {
  const cut = d - 60;
  for (let i = rocks.length - 1; i >= 0; i--) if (rocks[i].d < cut) { disposeGroup(rocks[i].mesh); rocks.splice(i, 1); }
  for (let i = gates.length - 1; i >= 0; i--) if (gates[i].d < cut) { disposeGroup(gates[i].mesh); gates.splice(i, 1); }
  for (let i = shards.length - 1; i >= 0; i--) if (shards[i].d < cut) { scene.remove(shards[i].mesh); shards.splice(i, 1); }
  for (let i = camps.length - 1; i >= 0; i--) if (camps[i].d < cut - 40) { disposeGroup(camps[i].mesh); camps.splice(i, 1); }
}

// ---------------------------------------------------------------- the boulder
function boulderTextures() {
  const W = 512, Hh = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const x = c.getContext('2d'), img = x.createImageData(W, Hh);
  for (let i = 0; i < W * Hh; i++) { const n = (Math.random() - .5) * 26; img.data[i * 4] = 62 + n; img.data[i * 4 + 1] = 60 + n; img.data[i * 4 + 2] = 62 + n; img.data[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${Math.random() < .55 ? '0,0,0' : '255,240,220'},${rnd(.04, .1)})`; x.beginPath(); x.ellipse(rnd(0, W), rnd(0, Hh), rnd(10, 60), rnd(6, 30), rnd(0, 3), 0, 7); x.fill(); }
  const e = document.createElement('canvas'); e.width = W; e.height = Hh;
  const ex = e.getContext('2d'); ex.fillStyle = '#000'; ex.fillRect(0, 0, W, Hh);
  // glowing cracks: random walks drawn on both maps
  for (let k = 0; k < 16; k++) {
    let px = rnd(0, W), py = rnd(20, Hh - 20), ang = rnd(0, 6.28);
    const pts = [[px, py]];
    for (let s = 0; s < 14; s++) { ang += rnd(-.9, .9); px += Math.cos(ang) * rnd(8, 20); py += Math.sin(ang) * rnd(4, 12); pts.push([px, py]); }
    for (const [ctx, col, w] of [[x, 'rgba(10,6,4,.9)', 4], [ex, 'rgba(255,110,30,1)', 2.2], [ex, 'rgba(255,200,120,.9)', .8]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(...pts[0]); for (const p of pts) ctx.lineTo(...p); ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const em = new THREE.CanvasTexture(e); em.colorSpace = THREE.SRGBColorSpace;
  return { map, em };
}
const ball = (() => {
  const { map, em } = boulderTextures();
  const geo = new THREE.IcosahedronGeometry(CFG.ballR, 4);
  const p = geo.attributes.position, tmp = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); const n = 1 + .045 * Math.sin(tmp.x * 2.3 + tmp.y * 1.7) * Math.cos(tmp.z * 2.1 - tmp.x); tmp.multiplyScalar(n); p.setXYZ(i, tmp.x, tmp.y, tmp.z); }
  geo.computeVertexNormals();
  // spherical UVs for the textures
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).normalize(); uv[i * 2] = .5 + Math.atan2(tmp.z, tmp.x) / (2 * Math.PI); uv[i * 2 + 1] = .5 + Math.asin(tmp.y) / Math.PI; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const mat = new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2.5, roughness: .88, metalness: .08, emissive: new THREE.Color(1, .55, .3), emissiveMap: em, emissiveIntensity: 1.6 });
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group(); group.add(mesh); scene.add(group);
  const light = new THREE.PointLight(0xff8a3a, 10, 9, 2); group.add(light);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: .7, depthWrite: false }));
  scene.add(shadow);
  const marker = new THREE.Mesh(new THREE.RingGeometry(.86, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .6, .25).multiplyScalar(1.8), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  scene.add(marker);
  return { p: new THREE.Vector3(), v: new THREE.Vector3(), r: CFG.ballR, m: 4, bounce: CFG.ballBounce, roll: CFG.ballRoll, mesh, mat, group, light, shadow, marker,
    grounded: false, heat: 0, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, lost: 0, lostWhy: '' };
})();

// ---------------------------------------------------------------- the Titan (your striker)
const rimVS = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }';
const rimFS = `uniform vec3 rim; uniform float glow; varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
    vec3 L = normalize(vec3(-0.4, 0.8, 0.5)); vec3 Hh = normalize(L + vV); float spec = pow(max(dot(vN, Hh), 0.0), 80.0);
    vec3 c = rim * (0.02 + f * (0.5 + glow*1.6)) + vec3(1.0) * spec * 0.6;
    gl_FragColor = vec4(c, clamp(0.03 + f*0.45 + spec*0.5 + glow*0.12, 0.0, 1.0)); }`;
const P = { p: new THREE.Vector3(), v: new THREE.Vector3(), tx: 0, td: 0, stun: 0, punch: 0, cool: 0, group: new THREE.Group(), contact: false };
(() => {
  const g = P.group, R = CFG.strikerR, Hh = CFG.strikerH;
  const steel = new THREE.MeshStandardMaterial({ color: 0x1b1f27, metalness: .9, roughness: .25 });
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .95, 1).multiplyScalar(1.4) });
  P.neon = neon;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.1, .55, 40), steel); base.position.y = .28; g.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * .96, R * 1.0, .32, 40), steel); cap.position.y = Hh - .16; g.add(cap);
  // glass body you can see the boulder through
  const glassUni = { rim: { value: new THREE.Color(.45, .9, 1) }, glow: { value: .2 } };
  P.glassUni = glassUni;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R * .97, R * 1.0, Hh - .85, 40, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: glassUni, vertexShader: rimVS, fragmentShader: rimFS }));
  body.position.y = .55 + (Hh - .85) / 2; g.add(body);
  // inner core column
  const core = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, Hh - .9, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .95, 1).multiplyScalar(1.1), transparent: true, opacity: .22 }));
  core.position.y = Hh / 2; g.add(core); P.core = core;
  for (const y of [.56, Hh * .5, Hh - .33]) { const t = new THREE.Mesh(new THREE.TorusGeometry(R * 1.01, .04, 8, 56), neon); t.rotation.x = Math.PI / 2; t.position.y = y; g.add(t); }
  // strike plate on the uphill face
  const plate = new THREE.Group();
  const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(R + .08, R + .08, Hh * .74, 24, 1, true, Math.PI - .85, 1.7),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(.5, .95, 1).multiplyScalar(1.4), transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  plate.add(plateMesh); plate.position.y = Hh * .52; g.add(plate); P.plate = plate; P.plateMat = plateMesh.material;
  // hover glow
  const thr = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.6, R * 3.6), new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(.4, .9, 1).multiplyScalar(1.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  thr.rotation.x = -Math.PI / 2; thr.position.y = .04; g.add(thr); P.thr = thr;
  const l = new THREE.PointLight(0x7fe8ff, 6, 8, 2); l.position.y = 1.5; g.add(l);
  scene.add(g);
})();
// reach ring shown on the ground when the boulder is smackable
const reachRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.025, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .76, .25).multiplyScalar(1.6), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
scene.add(reachRing);

// ---------------------------------------------------------------- falling rocks (tumblers)
const tumblers = [];
const tumbleMat = new THREE.MeshStandardMaterial({ color: 0x3a3c44, map: stoneMat.map, roughness: .9, flatShading: true, emissive: new THREE.Color(1, .2, .08), emissiveIntensity: .35 });
function spawnTumbler(d) {
  const r = rnd(.6, .95), hw = hwAt(d);
  const mesh = new THREE.Mesh(rockGeo(r, Math.random), tumbleMat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a1a, transparent: true, opacity: .6, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(r * 4); mesh.add(halo);
  scene.add(mesh);
  const t = { p: new THREE.Vector3(rnd(-hw + r + .4, hw - r - .4), H(d) + r + 2, -d), v: new THREE.Vector3(rnd(-1, 1), 0, rnd(4, 7)), r, m: 1, bounce: .45, roll: .02, mesh, grounded: false, spinAxis: new THREE.Vector3(1, 0, 0), spin: 0, dead: false };
  tumblers.push(t);
}

// ---------------------------------------------------------------- particles, rings, pops
const NP = 380;
const pGeo = new THREE.BufferGeometry(), pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = Array.from({ length: NP }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), c: new THREE.Color(), grav: 12 }));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .32, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
pts.frustumCulled = false; scene.add(pts);
let pIdx = 0;
function burst(at, n, color, speed = 6, dir = null, grav = 12, life = [.35, .9]) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const o = parts[pIdx], k = pIdx * 3; pIdx = (pIdx + 1) % NP;
    o.life = o.max = rnd(life[0], life[1]); o.grav = grav;
    o.v.set(rnd(-1, 1), rnd(-.2, 1), rnd(-1, 1)).normalize(); if (dir) o.v.addScaledVector(dir, 1.3).normalize();
    o.v.multiplyScalar(rnd(.3, 1) * speed); o.c.copy(c).multiplyScalar(rnd(1, 2.2));
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
const rings = [];
function ring(at, color, size = 3, normal = null) {
  const m = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.copy(at);
  if (normal) m.lookAt(at.clone().add(normal)); else m.rotation.x = -Math.PI / 2;
  scene.add(m); rings.push({ m, t: 0, size });
}
const popEls = [];
function pop(text, at, cls = '') {
  const el = document.createElement('div'); el.className = 'pop ' + cls; el.textContent = text; $('#pops').appendChild(el);
  popEls.push({ el, p: at.clone(), t: 0 });
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

// ---------------------------------------------------------------- sound (synthesized, no files)
let ac = null, master = null, noiseBuf = null, muted = store.get('summit-muted', false);
function audio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * .8, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind drone
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = .6;
    const gn = ac.createGain(); gn.gain.value = .05; src.connect(f); f.connect(gn); gn.connect(master); src.start();
    const lfo = ac.createOscillator(); lfo.frequency.value = .07; const lg = ac.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    [55, 82.4].forEach((fr, i) => { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = fr; o.detune.value = rnd(-6, 6); const g = ac.createGain(); g.gain.value = .02; o.connect(g); g.connect(master); o.start(); });
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
  thud(i) { const e = clamp(i / 16, 0, 1); tone(48 + e * 30, 'sine', .25 + e * .5, .28, .45); noise(.06 + e * .2, .14, 300 + e * 300, .7, 'lowpass'); },
  smack(p) { tone(70, 'sine', .7, .3, .4); noise(.35, .12, 1600, .7); tone(220 * p, 'square', .08, .12, .5); },
  perfect() { [0, 7, 12, 19].forEach((n, i) => tone(523 * Math.pow(2, n / 12), 'triangle', .12, .35, 0, i * .045)); },
  whiff() { noise(.08, .12, 2600, 1.4); },
  wall(i) { const e = clamp(i / 14, 0, 1); tone(110 + e * 50, 'triangle', .1 + e * .2, .14, .6); noise(.05 + e * .1, .08, 2200, 1.2); },
  shard(h) { tone(h ? 1318 : 988, 'sine', .14, .22, 0); tone(h ? 1976 : 1480, 'sine', .08, .3, 0, .06); },
  camp() { noise(.25, 1.4, 900, .3); [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(392 * Math.pow(2, n / 12), 'triangle', .15, .6, 0, i * .07)); tone(98, 'sine', .5, .9, .5); },
  lost() { [7, 3, 0, -5].forEach((n, i) => tone(220 * Math.pow(2, n / 12), 'sawtooth', .09, .45, .85, i * .16)); noise(.3, 1.2, 160, .5, 'lowpass'); },
  hurt() { tone(160, 'square', .15, .2, .4); noise(.25, .25, 500, .6, 'lowpass'); },
  rockfall() { noise(.08, .5, 240, .5, 'lowpass'); },
  over() { [12, 7, 3, 0].forEach((n, i) => tone(330 * Math.pow(2, n / 12), 'triangle', .14, .5, 0, i * .14)); },
};
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };

// ---------------------------------------------------------------- game state
let mode = 'title';
const S = { score: 0, bonus: 0, maxAlt: 0, lives: 3, mult: 1, perfects: 0, shards: 0, camps: 0, stage: 0, time: 0, tumbleT: 4, best: store.get('summit-best', 0) };
const cam = { x: 0, y: 3, z: 6, shake: 0, fov: 70, lookY: 0 };

function resetWorld() {
  for (const c of [...chunks.keys()]) { disposeGroup(chunks.get(c)); chunks.delete(c); }
  for (const r of rocks) disposeGroup(r.mesh); rocks.length = 0;
  for (const g of gates) disposeGroup(g.mesh); gates.length = 0;
  for (const s of shards) scene.remove(s.mesh); shards.length = 0;
  for (const c of camps) disposeGroup(c.mesh); camps.length = 0;
  for (const t of tumblers) scene.remove(t.mesh); tumblers.length = 0;
  builtStages.clear();
  P.p.set(0, H(0), 0); P.v.set(0, 0, 0); P.tx = 0; P.td = 0; P.stun = 0; P.cool = 0; P.punch = 0;
  placeBall(9, 0, 1.5);
  stageColor.set(STAGES[0].color); stageTarget.set(STAGES[0].color);
  updateChunks(0);
}
function placeBall(d, x, lift = 3) {
  ball.p.set(x, H(d) + ball.r + lift, -d); ball.v.set(0, 0, 0); ball.lost = 0; ball.heat = 0;
}
function start() {
  if (mode === 'play') return;
  audio();
  Object.assign(S, { score: 0, bonus: 0, maxAlt: 0, lives: 3, mult: 1, perfects: 0, shards: 0, camps: 0, stage: 0, time: 0, tumbleT: 4 });
  resetWorld();
  mode = 'play';
  window.BounceLab && BounceLab.start();
  $('#title').classList.add('hide'); $('#over').classList.add('hide'); $('#hud').classList.remove('hide'); $('#smackBtn').classList.remove('hide');
  banner('THE FOOTHILLS', 'Drag to move · tap to smack it uphill');
  hud();
}
const QUOTES = [
  'One must imagine Sisyphus happy.',
  'The struggle itself toward the heights is enough to fill a heart.',
  'The summit was always a little further.',
  'The boulder does not hold a grudge. Probably.',
  'Back to the bottom. Again.',
];
function gameOver() {
  mode = 'over'; sfx.over(); drag = null; $('#touch').classList.remove('on');
  const score = S.score, isBest = score > S.best;
  if (isBest) { S.best = score; store.set('summit-best', score); }
  $('#oScore').textContent = score;
  $('#oBest').textContent = isBest ? 'New best!' : 'Best ' + S.best;
  $('#oAlt').textContent = Math.round(S.maxAlt) + ' m';
  $('#oCamps').textContent = S.camps;
  $('#oPerf').textContent = S.perfects;
  $('#oShards').textContent = S.shards;
  $('#oQuote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  window.BounceLab && BounceLab.gameOver(score, { altitude: Math.round(S.maxAlt), camps: S.camps, perfects: S.perfects });
  $('#over').classList.remove('hide'); $('#hud').classList.add('hide'); $('#smackBtn').classList.add('hide');
}
let bannerT = 0;
function banner(t, s) {
  $('#bTitle').textContent = t; $('#bSub').textContent = s || '';
  const b = $('#banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); bannerT = 3.4;
}
let livesShown = -1;
function hud() {
  $('#score').textContent = S.score;
  const nextCamp = (stageAt(-ball.p.z) + 1);
  const toCamp = clamp((-ball.p.z - (nextCamp - 1) * CFG.stageLen) / CFG.stageLen, 0, 1);
  $('#alt').textContent = `${Math.max(0, Math.round(H(-ball.p.z)))} m`;
  $('#campT').textContent = `CAMP ${nextCamp}`;
  $('#progFill').style.transform = `scaleX(${toCamp})`;
  $('#mult').textContent = '×' + S.mult; $('#mult').classList.toggle('hot', S.mult > 1);
  if (livesShown !== S.lives) { const l = $('#lives'); l.innerHTML = ''; for (let i = 0; i < S.lives; i++) l.appendChild(document.createElement('i')); livesShown = S.lives; }
}
function addPoints(n, at, label, cls) { const v = n * S.mult; S.bonus += v; pop(label || '+' + v, at, cls || ''); }

// ---------------------------------------------------------------- input
let drag = null;
const touchEl = $('#touch');
const isUI = t => t && t.closest && t.closest('.ui');
window.addEventListener('pointerdown', e => {
  audio();
  if (isUI(e.target) || mode !== 'play') return;
  e.preventDefault();
  if (drag) { smack(); return; } // second finger = smack
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() };
  touchEl.style.left = e.clientX + 'px'; touchEl.style.top = e.clientY + 'px'; touchEl.classList.add('on');
}, { passive: false });
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  // screen pixels -> metres on the slope. Full screen width ≈ track width × gain.
  const k = (CFG.hw * 2 * CFG.dragGain) / Math.min(innerWidth, 520);
  P.tx += (e.clientX - drag.x) * k;
  P.td -= (e.clientY - drag.y) * k * 1.15;
  drag.x = e.clientX; drag.y = e.clientY;
  touchEl.style.left = e.clientX + 'px'; touchEl.style.top = e.clientY + 'px';
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (performance.now() - drag.t0 < 230 && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 14) smack();
  drag = null; touchEl.classList.remove('on');
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (mode === 'play') smack(); else start(); }
  else if (e.code === 'Enter' && mode !== 'play') start();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
const smackBtn = $('#smackBtn');
smackBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio(); smackBtn.classList.add('down'); smack(); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) smackBtn.addEventListener(ev, () => smackBtn.classList.remove('down'));
$('#playBtn').addEventListener('click', start);
$('#againBtn').addEventListener('click', start);
$('#mute').addEventListener('click', () => { muted = !muted; store.set('summit-muted', muted); $('#mute').textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : .55; });
$('#mute').textContent = muted ? '🔇' : '🔊';
$('#bestT').textContent = S.best ? 'Best ' + S.best : '';

// ---------------------------------------------------------------- smack
const axisPt = new THREE.Vector3(), nrm = new THREE.Vector3();
function ballGap() { // distance between Titan surface and boulder surface (and normal from Titan to boulder)
  const top = P.p.y + CFG.strikerH, bot = P.p.y;
  axisPt.set(P.p.x, clamp(ball.p.y, bot + .3, top - .2), P.p.z);
  nrm.subVectors(ball.p, axisPt);
  const d = nrm.length() || 1e-4; nrm.divideScalar(d);
  return d - CFG.strikerR - ball.r;
}
function smack() {
  if (mode !== 'play' || P.cool > 0 || P.stun > 0 || ball.lost) return;
  const gap = ballGap();
  const ahead = (-ball.p.z) > (-P.p.z) - .4;
  P.punch = 1;
  if (gap < CFG.smackReach && ahead) {
    P.cool = CFG.smackCool;
    const incoming = Math.max(0, ball.v.z); // boulder rolling down at you
    const perfect = gap < CFG.perfectGap && incoming > 1.2;
    const k = stageAt(-ball.p.z);
    const power = (perfect ? 1.3 : 1) * (1 + Math.min(k, 8) * .025);
    const lateral = clamp((ball.p.x - P.p.x) * 1.5, -6, 6) + P.v.x * .35;
    ball.v.set(lateral, CFG.smackUp * power, -(CFG.smackFwd * power + Math.max(0, -P.v.z) * .4));
    ball.heat = perfect ? 1.4 : .8;
    ball.spinAxis.set(1, 0, 0); ball.spin = -12;
    const at = ball.p.clone().addScaledVector(nrm, -ball.r);
    burst(at, perfect ? 46 : 26, perfect ? 0xffc23a : stageColor.getHex(), perfect ? 11 : 8, new THREE.Vector3(0, .6, -1));
    ring(at, perfect ? 0xffc23a : stageColor.getHex(), perfect ? 4.5 : 3.2, new THREE.Vector3(0, .3, 1));
    cam.shake = perfect ? .5 : .32;
    sfx.smack(perfect ? 1.5 : 1); buzz(perfect ? [18, 30, 30] : 22);
    if (perfect) {
      sfx.perfect(); S.perfects++; S.mult = Math.min(5, S.mult + 1);
      addPoints(50, ball.p, `PERFECT +${50 * S.mult}`, 'perfect');
    }
  } else {
    P.cool = .28; sfx.whiff();
    if (gap < CFG.smackReach + 3) pop('too far', P.p.clone().setY(P.p.y + CFG.strikerH + .5), 'dim');
  }
}

// ---------------------------------------------------------------- physics
const n3 = new THREE.Vector3(), c3 = new THREE.Vector3();
function bounceOff(o, n, vel, e, impactFn) {
  const vn = o.v.dot(n) - (vel ? vel.dot(n) : 0);
  if (vn < 0) { o.v.addScaledVector(n, -(1 + e) * vn); if (impactFn) impactFn(-vn); }
}
function cornerCollide(o, cx, cy, cz, e, impactFn) {
  c3.set(cx, cy, cz); n3.subVectors(o.p, c3);
  const d = n3.length();
  if (d < o.r && d > 1e-4) { n3.divideScalar(d); o.p.addScaledVector(n3, o.r - d); bounceOff(o, n3, null, e, impactFn); return true; }
  return false;
}
function stepSphere(o, dt, isBall) {
  o.v.y -= CFG.g * dt;
  o.p.addScaledVector(o.v, dt);
  const d = -o.p.z, hw = hwAt(d);
  const impact = isBall ? (s => { if (s > 2.5) { sfx.thud(s); cam.shake = Math.max(cam.shake, clamp(s / 40, 0, .3)); burst(o.p.clone().setY(o.p.y - o.r), Math.min(18, s | 0), 0x8a8f9c, s * .35, null, 14); buzz(s > 10 ? 12 : 0); } }) : null;
  o.grounded = false;
  const gap = inGap(d);
  const over = Math.abs(o.p.x) <= hw;
  if (!gap && over) {
    const h = H(d), sl = Hp(d);
    n3.set(0, 1, sl).normalize();
    const dist = (o.p.y - h) * n3.y;
    if (dist < o.r) {
      o.p.addScaledVector(n3, o.r - dist);
      const vn = o.v.dot(n3);
      if (vn < 0) { const s = -vn, e = s > 2.4 ? o.bounce : 0; o.v.addScaledVector(n3, -(1 + e) * vn); if (impact) impact(s); }
      o.v.multiplyScalar(1 - o.roll * dt);
      o.grounded = true;
    }
  } else if (gap) {
    // roll over the lips of the crevasse
    if (Math.abs(o.p.x) <= hw) {
      cornerCollide(o, o.p.x, H(gap.d0), -gap.d0, .3, impact);
      cornerCollide(o, o.p.x, H(gap.d1), -gap.d1, .3, impact);
    }
  } else {
    // past the edge of the ridge: catch the edge line
    const s = Math.sign(o.p.x);
    cornerCollide(o, s * hw, H(d), o.p.z, .3, impact);
  }
  // rails
  if (railsAt(d) && Math.abs(o.p.x) > hw - o.r && o.p.y < H(d) + 2.2) {
    const s = Math.sign(o.p.x); o.p.x = s * (hw - o.r);
    if (o.v.x * s > 0) { const sp = Math.abs(o.v.x); o.v.x *= -.45; if (isBall && sp > 2) { sfx.wall(sp); burst(o.p.clone().setX(s * hw), 8, stageColor.getHex(), 4); } }
  }
  // static outcrops
  for (const r of rocks) {
    if (Math.abs(r.d - d) > r.r + o.r + 1) continue;
    c3.set(r.x, r.cy, -r.d); n3.subVectors(o.p, c3);
    const dd = n3.length(), min = r.r * .95 + o.r;
    if (dd < min && dd > 1e-4) { n3.divideScalar(dd); o.p.addScaledVector(n3, min - dd); bounceOff(o, n3, null, .45, isBall ? (s => { if (s > 2) { sfx.wall(s); burst(c3.clone().addScaledVector(n3, r.r), 10, 0xb0b4c0, 4); } }) : null); }
  }
  // sliding slabs
  for (const g of gates) {
    if (Math.abs(g.d - d) > 2 + o.r) continue;
    const gy = H(g.d);
    c3.set(clamp(o.p.x, g.x - g.w / 2, g.x + g.w / 2), clamp(o.p.y, gy, gy + g.h), clamp(o.p.z, -g.d - .45, -g.d + .45));
    n3.subVectors(o.p, c3); const dd = n3.length();
    if (dd < o.r) {
      if (dd < 1e-4) n3.set(0, 0, 1); else n3.divideScalar(dd);
      o.p.addScaledVector(n3, o.r - dd);
      bounceOff(o, n3, tmpV.set(g.vx, 0, 0), .55, isBall ? (s => { if (s > 1.5) { sfx.wall(s + 4); burst(c3, 14, 0xff4f8a, 6); cam.shake = Math.max(cam.shake, .15); } }) : null);
    }
  }
  // roll visuals
  if (o.grounded) {
    tmpV.set(0, 1, 0).cross(o.v); const sp = tmpV.length();
    if (sp > 1e-3) { o.spinAxis.copy(tmpV).divideScalar(sp); o.spin = sp / o.r; } else o.spin = 0;
  } else o.spin *= (1 - .3 * dt);
  if (Math.abs(o.spin) > 1e-3) { const q = new THREE.Quaternion().setFromAxisAngle(o.spinAxis, o.spin * dt); o.mesh.quaternion.premultiply(q); }
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

const prevP = new THREE.Vector3();
function stepTitan(dt) {
  const d = -P.p.z;
  // keyboard
  const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  const kd = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  if (kx || kd) { P.tx += kx * CFG.moveMax * dt * 1.1; P.td += kd * CFG.moveMax * dt * 1.1; }
  // keep the target on the path and near the action
  const hw = hwAt(P.td);
  P.tx = clamp(P.tx, -hw + CFG.strikerR * .7, hw - CFG.strikerR * .7);
  P.td = clamp(P.td, Math.max(-12, -ball.p.z - 34), -ball.p.z + 26);
  if (P.stun > 0) { P.stun -= dt; P.tx = P.p.x; P.td = d; }
  prevP.copy(P.p);
  const want = n3.set(P.tx - P.p.x, 0, -P.td - P.p.z);
  const vel = want.multiplyScalar(CFG.spring);
  const sp = vel.length(); if (sp > CFG.moveMax) vel.multiplyScalar(CFG.moveMax / sp);
  P.v.x = lerp(P.v.x, vel.x, clamp(dt * 18, 0, 1)); P.v.z = lerp(P.v.z, vel.z, clamp(dt * 18, 0, 1));
  P.p.x += P.v.x * dt; P.p.z += P.v.z * dt;
  // hover over the ground (bridges crevasses)
  const nd = -P.p.z, nhw = hwAt(nd);
  P.p.x = clamp(P.p.x, -nhw + CFG.strikerR * .7, nhw - CFG.strikerR * .7);
  P.p.y = H(nd) + .12;
  // bump into outcrops and slabs
  for (const r of rocks) {
    const dx = P.p.x - r.x, dz = P.p.z + r.d, dd = Math.hypot(dx, dz), min = r.r * .9 + CFG.strikerR;
    if (dd < min && dd > 1e-4) { P.p.x += dx / dd * (min - dd); P.p.z += dz / dd * (min - dd); }
  }
  for (const g of gates) {
    const cx = clamp(P.p.x, g.x - g.w / 2, g.x + g.w / 2), cz = clamp(P.p.z, -g.d - .45, -g.d + .45);
    const dx = P.p.x - cx, dz = P.p.z - cz, dd = Math.hypot(dx, dz);
    if (dd < CFG.strikerR) {
      if (dd < 1e-4) { P.p.z = -g.d + .45 + CFG.strikerR; }
      else { P.p.x += dx / dd * (CFG.strikerR - dd); P.p.z += dz / dd * (CFG.strikerR - dd); }
    }
  }
  P.v.set((P.p.x - prevP.x) / dt, 0, (P.p.z - prevP.z) / dt);
  // the boulder vs the Titan: a tall capsule that catches and shoves it
  const gap = ballGap();
  P.contact = false;
  if (gap < 0 && !ball.lost) {
    P.contact = true;
    ball.p.addScaledVector(nrm, -gap);
    const rel = tmpV.subVectors(ball.v, P.v).dot(nrm);
    if (rel < 0) {
      const s = -rel;
      ball.v.addScaledVector(nrm, -(1 + .18) * rel);
      if (s > 3) { sfx.thud(s * .8); burst(ball.p.clone().addScaledVector(nrm, -ball.r), 10, 0x9fe8ff, 4); cam.shake = Math.max(cam.shake, clamp(s / 50, 0, .2)); }
      if (s > 5) pop('caught', ball.p.clone().setY(ball.p.y + 1.6), 'dim');
    }
    // pushing a boulder uphill is hard, and harder the steeper it gets
    const into = P.v.x * nrm.x + P.v.z * nrm.z;
    if (into > 0) {
      const slope = Math.max(0, Hp(-ball.p.z));
      const keep = clamp(.55 - slope * 1.2, .2, .55);
      const cut = into * (1 - keep);
      P.p.x -= nrm.x * cut * dt; P.p.z -= nrm.z * cut * dt;
    }
  }
}

// ---------------------------------------------------------------- main update
let lastCampCheck = 0;
function update(dt) {
  S.time += dt;
  P.cool = Math.max(0, P.cool - dt);
  stepTitan(dt);
  for (const g of gates) { const nx = g.amp * Math.sin(S.time * g.speed + g.phase); g.vx = (nx - g.x) / dt; g.x = nx; }
  stepSphere(ball, dt, true);
  for (const t of tumblers) {
    stepSphere(t, dt, false);
    const sp = t.v.length(); if (sp > 15) t.v.multiplyScalar(15 / sp);
    const hit = sphereSphere(t, ball, .4);
    if (hit > 3 && !ball.lost) { sfx.wall(hit + 4); burst(ball.p.clone(), 14, 0xff5a2a, 6); cam.shake = Math.max(cam.shake, .2); }
    // hits the Titan
    const dx = t.p.x - P.p.x, dz = t.p.z - P.p.z, dd = Math.hypot(dx, dz);
    if (dd < t.r + CFG.strikerR && t.p.y < P.p.y + CFG.strikerH + t.r && !t.dead) {
      t.dead = true;
      if (P.stun <= 0) {
        P.stun = .65; P.p.z += 1.2; sfx.hurt(); buzz([30, 40, 30]); cam.shake = .45;
        $('#flash').classList.add('on'); setTimeout(() => $('#flash').classList.remove('on'), 60);
        pop('STUNNED', P.p.clone().setY(P.p.y + CFG.strikerH + .6), 'bad');
        S.mult = Math.max(1, S.mult - 1);
      }
      burst(t.p.clone(), 22, 0xff5a2a, 7);
      t.v.set(dx / dd * 6, 5, Math.abs(t.v.z) * .3);
    }
  }
  for (let i = tumblers.length - 1; i >= 0; i--) {
    const t = tumblers[i];
    if (-t.p.z < -P.p.z - 14 || t.p.y < H(-t.p.z) - 12) { scene.remove(t.mesh); tumblers.splice(i, 1); }
  }
  // falling rocks timer
  const st = stageDef(stageAt(-ball.p.z));
  if (st.tumble > 0 && mode === 'play') {
    S.tumbleT -= dt;
    if (S.tumbleT <= 0) {
      const kk = stageAt(-ball.p.z);
      S.tumbleT = Math.max(1.3, (3.4 - Math.min(kk, 10) * .1) / st.tumble) * rnd(.7, 1.3);
      spawnTumbler(-P.p.z + 62); sfx.rockfall();
    }
  }
  // shards
  for (const s of shards) {
    if (s.taken) continue;
    const sp = s.mesh.position;
    const byBall = ball.p.distanceTo(sp) < ball.r + .6;
    const byTitan = Math.hypot(P.p.x - sp.x, P.p.z - sp.z) < CFG.strikerR + .4 && sp.y < P.p.y + CFG.strikerH + .4;
    if (byBall || byTitan) {
      s.taken = true; S.shards++;
      const v = (s.high ? 60 : 20) * (byBall ? 1 : .5);
      addPoints(v, sp, null, s.high ? 'big' : '');
      sfx.shard(s.high); burst(sp.clone(), 18, s.high ? 0x3ef6ff : 0xffc23a, 5, null, 4);
      s.mesh.visible = false;
    }
  }
  // camps
  for (const c of camps) {
    if (!c.reached && -ball.p.z > c.d && !ball.lost) {
      c.reached = true; S.camps = Math.max(S.camps, c.k);
      const bonus = 200 * c.k;
      S.bonus += bonus * S.mult;
      const extra = S.lives < 3; if (extra) S.lives++;
      banner(`CAMP ${c.k} · ${c.name.toUpperCase()}`, c.note + (extra ? '  ·  +1 boulder' : ''));
      sfx.camp(); buzz([20, 40, 20, 40, 60]);
      burst(ball.p.clone().setY(ball.p.y + 2), 60, c.color, 12, new THREE.Vector3(0, 1, 0), 6, [.6, 1.4]);
      ring(new THREE.Vector3(0, H(c.d) + .1, -c.d), c.color, 9);
      stageTarget.set(c.color);
      pop(`+${bonus * S.mult}`, ball.p.clone().setY(ball.p.y + 2.5), 'big');
    }
  }
  // lost boulder?
  if (!ball.lost) {
    const bd = -ball.p.z, pd = -P.p.z;
    let why = '';
    if (ball.p.y < H(bd) - 3.5) why = inGap(bd) ? 'INTO THE CREVASSE' : 'OVER THE EDGE';
    else if (bd < pd - 3.2) why = 'IT GOT PAST YOU';
    if (why) {
      ball.lost = 1.8; ball.lostWhy = why;
      sfx.lost(); buzz([60, 50, 90]);
      pop(why, P.p.clone().setY(P.p.y + CFG.strikerH + 1.5), 'bad');
      S.mult = 1;
    }
  } else {
    ball.lost -= dt;
    if (ball.lost <= 0) {
      S.lives--;
      if (S.lives <= 0) { ball.lost = 0; gameOver(); }
      else {
        const pd = -P.p.z;
        let d = pd + 7; while (inGap(d) || nearGap(d, 2)) d += 1.5;
        placeBall(d, P.p.x * .4, 3);
        for (const t of tumblers) if (Math.abs(-t.p.z - d) < 10) t.p.y -= 100;
        banner(S.lives === 1 ? 'LAST BOULDER' : 'A NEW BOULDER', S.lives === 1 ? 'Make it count.' : `${S.lives} left`);
      }
    }
  }
  // score
  if (!ball.lost) S.maxAlt = Math.max(S.maxAlt, H(-ball.p.z));
  S.score = Math.round(S.maxAlt * 10) + S.bonus;
  const k = stageAt(-ball.p.z);
  if (k !== S.stage) { S.stage = k; }
  if (mode === 'play') updateChunks(Math.max(-P.p.z, -ball.p.z - 20));
  cullBehind(-P.p.z);
}

// ---------------------------------------------------------------- visuals per frame
const lookAt = new THREE.Vector3();
function render(dt, t) {
  // stage tint drifts toward the current stage colour
  stageColor.lerp(stageTarget, 1 - Math.exp(-1.5 * dt));
  trackMat.emissive.copy(stageColor); railGlass.color.copy(stageColor); railLine.color.copy(stageColor).multiplyScalar(2);
  postMat.color.copy(stageColor).multiplyScalar(2.2); skyUni.glow.value.copy(stageColor);
  peak.userData.edge.material.color.copy(stageColor);
  document.documentElement.style.setProperty('--accent', '#' + stageColor.getHexString());
  // Titan
  const g = P.group;
  g.position.copy(P.p); g.position.y += Math.sin(t * 3) * .05;
  P.punch = Math.max(0, P.punch - dt * 4.5);
  const jab = Math.sin(Math.min(1, 1 - P.punch) * Math.PI) * (P.punch > 0 ? 1 : 0);
  P.plate.position.z = -jab * .75;
  P.plateMat.opacity = .14 + jab * .7;
  const leanX = clamp(P.v.x * .015, -.12, .12), leanZ = clamp(-P.v.z * .012, -.1, .1);
  g.rotation.z = lerp(g.rotation.z, -leanX, .2); g.rotation.x = lerp(g.rotation.x, -leanZ - Hp(-P.p.z) * .2, .2);
  const stunned = P.stun > 0;
  P.neon.color.setRGB(stunned ? 1 : .55, stunned ? .3 : .95, stunned ? .2 : 1).multiplyScalar(1.4);
  P.glassUni.glow.value = .2 + jab * .9;
  P.thr.material.opacity = .45 + Math.sin(t * 20) * .08;
  // reach indicator
  const gap = ballGap();
  const inReach = gap < CFG.smackReach && -ball.p.z > -P.p.z - .4 && !ball.lost;
  reachRing.position.set(P.p.x, H(-P.p.z) + .06, P.p.z);
  reachRing.rotation.set(-Math.PI / 2 + Math.atan(Hp(-P.p.z)), 0, 0);
  const rr = CFG.strikerR + CFG.smackReach + ball.r * .3;
  reachRing.scale.setScalar(rr);
  reachRing.material.opacity = lerp(reachRing.material.opacity, inReach ? .75 : .05, .25);
  smackBtn.classList.toggle('ready', P.cool <= 0);
  smackBtn.classList.toggle('inreach', inReach && P.cool <= 0);
  smackBtn.style.setProperty('--p', P.cool > 0 ? 1 - P.cool / CFG.smackCool : 1);
  // boulder
  ball.group.position.copy(ball.p);
  ball.mesh.position.set(0, 0, 0);
  ball.heat = Math.max(0, ball.heat - dt * .8);
  ball.mat.emissiveIntensity = 1.5 + ball.heat * 2.2 + Math.sin(t * 2.2) * .15;
  ball.light.intensity = 8 + ball.heat * 20;
  const bd = -ball.p.z, gh = inGap(bd) ? H(bd) - 9 : H(bd);
  const above = ball.p.y - ball.r - gh;
  ball.shadow.position.set(ball.p.x, gh + .05, ball.p.z);
  ball.shadow.rotation.set(-Math.PI / 2 + Math.atan(Hp(bd)), 0, 0);
  const ss = ball.r * 2.6 * (1 + above * .05);
  ball.shadow.scale.set(ss, ss, 1);
  ball.shadow.material.opacity = clamp(.75 - above * .06, .15, .75) * (inGap(bd) ? 0 : 1);
  ball.marker.position.copy(ball.shadow.position); ball.marker.position.y += .02; ball.marker.rotation.copy(ball.shadow.rotation);
  ball.marker.scale.setScalar(ball.r * (1 + above * .12));
  ball.marker.material.opacity = clamp((above - 1.2) * .25, 0, .8) * (inGap(bd) ? 0 : 1);
  // tumblers and shards
  for (const tb of tumblers) tb.mesh.position.copy(tb.p);
  for (const s of shards) if (!s.taken) { s.t += dt; s.mesh.rotation.y = s.t * 2; s.mesh.position.y = H(s.d) + s.y + Math.sin(s.t * 2.4) * .18; }
  for (const gt of gates) gt.mesh.position.set(gt.x, H(gt.d) + gt.h / 2, -gt.d);
  // rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / .55; if (k >= 1) { scene.remove(r.m); r.m.geometry.dispose(); rings.splice(i, 1); continue; }
    r.m.scale.setScalar(.3 + k * r.size); r.m.material.opacity = 1 - k;
  }
  stepParts(dt); stepPops(dt);
  // camera: locked behind the Titan, low and close, wide lens
  const pd = -P.p.z;
  const back = 7.6, up = 6.0;
  cam.x = lerp(cam.x, P.p.x, 1 - Math.exp(-10 * dt));
  const camD = pd - back;
  const camY = Math.max(H(camD), H(pd) - 1.2) + up;
  cam.y = lerp(cam.y, camY, 1 - Math.exp(-8 * dt));
  cam.z = lerp(cam.z, -camD, 1 - Math.exp(-10 * dt));
  const ahead = 18;
  let ly = H(pd + ahead) + 2.0;
  if (!ball.lost) ly += Math.max(0, ball.p.y - (H(-ball.p.z) + 3)) * .3;
  cam.lookY = lerp(cam.lookY, ly, 1 - Math.exp(-4 * dt));
  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  const sh = cam.shake * cam.shake;
  camera.position.set(cam.x + rnd(-1, 1) * sh, cam.y + rnd(-1, 1) * sh, cam.z);
  lookAt.set(cam.x * .9 + (ball.lost ? 0 : ball.p.x * .08), cam.lookY, -(pd + ahead));
  camera.lookAt(lookAt);
  skyGroup.position.set(camera.position.x, camera.position.y, camera.position.z);
  peak.userData.beacon.material.opacity = .75 + Math.sin(t * 1.3) * .25;
  moon.position.set(camera.position.x - 8, camera.position.y + 20, camera.position.z + 6);
  moon.target.position.set(camera.position.x, camera.position.y - 4, camera.position.z - 20);
}

// ---------------------------------------------------------------- resize & loop
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  // wide-angle: aim for ~60° across in portrait, cap the vertical
  const vfov = clamp(2 * Math.atan(Math.tan(30 * Math.PI / 180) / aspect) * 180 / Math.PI, 66, 96);
  camera.fov = vfov; camera.aspect = aspect; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
resetWorld();
render(1 / 60, 0);
let last = performance.now(), acc = 0;
const FIXED = 1 / 120;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(.05, (now - last) / 1000); last = now;
  if (mode === 'play') {
    acc += dt;
    while (acc >= FIXED) { update(FIXED); acc -= FIXED; if (mode !== 'play') break; }
    hud();
  } else if (mode === 'title') {
    // idle: the boulder rests on the slope, the Titan hums
    ball.p.y = H(-ball.p.z) + ball.r; ball.v.set(0, 0, 0);
  } else {
    acc += dt; while (acc >= FIXED) { stepSphere(ball, FIXED, false); acc -= FIXED; }
  }
  if (bannerT > 0) bannerT -= dt;
  render(dt, now / 1000);
  composer.render();
}
requestAnimationFrame(frame);
// test hook (used by automated checks; harmless in play)
window.__summit = { S, P, ball, CFG, H, start, smack, update, get mode() { return mode; } };
