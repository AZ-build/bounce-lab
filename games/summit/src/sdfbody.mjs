// Sculpts Sisyphus's body as ONE smooth surface: muscles are soft shapes blended together
// (a "signed distance field"), turned into a mesh with surface nets, then skinned to bones so
// it bends at the joints instead of being a stack of separate cylinders.
// Units: a 1.8 m figure standing at the origin, facing -z, arms hanging straight down.

export const BONES = {
  // name: [parent, x, y, z]   (rest positions relative to parent)
  root: [null, 0, 0, 0],
  hips: ['root', 0, .93, 0],
  spine: ['hips', 0, .05, 0],
  head: ['spine', 0, .76, 0],
  'sh1': ['spine', .3, .45, 0], 'el1': ['sh1', 0, -.31, 0],
  'sh-1': ['spine', -.3, .45, 0], 'el-1': ['sh-1', 0, -.31, 0],
  'hip1': ['hips', .1, -.04, 0], 'knee1': ['hip1', 0, -.43, 0], 'ankle1': ['knee1', 0, -.42, 0],
  'hip-1': ['hips', -.1, -.04, 0], 'knee-1': ['hip-1', 0, -.43, 0], 'ankle-1': ['knee-1', 0, -.42, 0],
};
export const BONE_NAMES = Object.keys(BONES);

// ---- distance functions
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEllipsoid(px, py, pz, c, r) {
  const x = px - c[0], y = py - c[1], z = pz - c[2];
  const k0 = len3(x / r[0], y / r[1], z / r[2]), k1 = len3(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
function sdRoundCone(px, py, pz, a, b, r1, r2) { // a capsule whose radius changes from r1 at a to r2 at b
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const xx = pax * l2 - bax * y, xy = pay * l2 - bay * y, xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---- the sculpture: [group, bone, kind, ...params, blend]
function parts() {
  const P = [];
  const E = (grp, bone, c, r, k = .035) => P.push({ grp, bone, f: (x, y, z) => sdEllipsoid(x, y, z, c, r), box: [c[0] - r[0], c[1] - r[1], c[2] - r[2], c[0] + r[0], c[1] + r[1], c[2] + r[2]], k });
  const C = (grp, bone, a, b, r1, r2, k = .035) => { const m = Math.max(r1, r2); P.push({ grp, bone, f: (x, y, z) => sdRoundCone(x, y, z, a, b, r1, r2), box: [Math.min(a[0], b[0]) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m, Math.max(a[0], b[0]) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m], k }); };
  // core: pelvis, glutes, waist, ribcage, chest, back, neck
  E('core', 'hips', [0, .93, .005], [.165, .12, .115]);
  for (const s of [-1, 1]) E('core', 'hips', [s * .075, .865, .065], [.088, .1, .075], .04);
  E('core', 'spine', [0, 1.07, -.005], [.148, .14, .105]);
  for (const s of [-1, 1]) E('core', 'spine', [s * .115, 1.04, .0], [.055, .1, .08], .04);           // obliques
  E('core', 'spine', [0, 1.27, .005], [.195, .19, .122]);                                            // ribcage
  for (const s of [-1, 1]) {
    E('core', 'spine', [s * .088, 1.31, -.055], [.105, .058, .042], .05);                            // pecs (broad and flat)
    E('core', 'spine', [s * .14, 1.23, .03], [.062, .14, .065], .045);                               // lats
    E('core', 'spine', [s * .095, 1.33, .085], [.085, .1, .045], .035);                              // shoulder blades
    C('core', 'spine', [0, 1.49, .015], [s * .235, 1.435, .01], .056, .05, .05);                     // traps run into the shoulders
  }
  for (const s of [-1, 1]) for (const y of [1.02, 1.09, 1.16]) E('core', 'spine', [s * .04, y, -.1], [.036, .03, .022], .015); // abs
  C('core', 'spine', [0, 1.46, .0], [0, 1.64, -.01], .066, .056, .04);                              // neck
  // head
  E('head', 'head', [0, 1.745, .0], [.096, .116, .11], .03);
  E('head', 'head', [0, 1.675, -.03], [.07, .055, .075], .04);                                       // jaw
  E('head', 'head', [0, 1.77, -.085], [.08, .025, .03], .03);                                        // brow
  C('head', 'head', [0, 1.76, -.105], [0, 1.715, -.128], .012, .019, .015);                          // nose
  // arms: deltoid, biceps, triceps, forearm, fist
  for (const s of [-1, 1]) {
    const x = s * .3, sh = 'sh' + s, el = 'el' + s, A = 'arm' + s;
    E(A, sh, [s * .282, 1.425, 0], [.078, .09, .084], .03);                                         // deltoid
    C(A, sh, [x, 1.41, 0], [x, 1.13, 0], .062, .05, .03);
    E(A, sh, [x, 1.27, -.026], [.054, .09, .053], .03);                                             // biceps
    E(A, sh, [x, 1.3, .03], [.052, .095, .05], .03);                                                // triceps
    E(A, el, [x, 1.12, 0], [.047, .045, .047], .03);
    C(A, el, [x, 1.11, 0], [x, .86, 0], .054, .037, .03);
    E(A, el, [x + s * .012, 1.05, -.01], [.052, .08, .05], .03);                                    // forearm muscle
    E(A, el, [x, .805, -.005], [.042, .056, .052], .025);                                           // fist
  }
  // legs: thigh, quads, hamstrings, knee, shin, calf, foot
  for (const s of [-1, 1]) {
    const x = s * .1, hip = 'hip' + s, kn = 'knee' + s, an = 'ankle' + s, L = 'leg' + s;
    C(L, hip, [x, .9, 0], [x, .48, 0], .1, .06, .03);
    E(L, hip, [x + s * .008, .7, -.03], [.09, .175, .082], .035);                                   // quads
    E(L, hip, [s * .072, .78, .0], [.05, .12, .07], .03);                                          // adductors
    E(L, hip, [x - s * .022, .545, -.035], [.05, .06, .048], .03);                                  // inner quad
    E(L, hip, [x, .72, .04], [.07, .15, .062], .035);                                               // hamstring
    E(L, kn, [x, .462, -.008], [.058, .055, .052], .035);
    C(L, kn, [x, .45, 0], [x, .07, 0], .055, .034, .03);
    E(L, kn, [x, .33, .032], [.06, .105, .062], .035);                                              // calf
    C(L, an, [x, .045, .03], [x, .025, -.13], .043, .03, .03);                                      // foot
  }
  return P;
}
// groups blend into the core softly; left and right limbs never blend with each other
const ORDER = ['core', 'head', 'arm1', 'arm-1', 'leg1', 'leg-1'];
const JOIN_K = { head: .03, arm1: .045, 'arm-1': .045, leg1: .035, 'leg-1': .035 };

export function buildBody() {
  const PARTS = parts();
  const groups = {}; for (const g of ORDER) groups[g] = PARTS.filter(p => p.grp === g);
  const PAD = .06;
  function groupDist(list, x, y, z) {
    let d = 1e9;
    for (const p of list) {
      const b = p.box;
      if (x < b[0] - PAD || y < b[1] - PAD || z < b[2] - PAD || x > b[3] + PAD || y > b[4] + PAD || z > b[5] + PAD) continue;
      d = d === 1e9 ? p.f(x, y, z) : smin(d, p.f(x, y, z), p.k);
    }
    return d;
  }
  function sdf(x, y, z) {
    let d = groupDist(groups.core, x, y, z);
    for (const g of ORDER) {
      if (g === 'core') continue;
      const gd = groupDist(groups[g], x, y, z);
      if (gd < 1e8) d = smin(d, gd, JOIN_K[g]);
    }
    // eye sockets
    for (const s of [-1, 1]) d = smax(d, -len3(x - s * .036, y - 1.752, z + .105) + .021, .012);
    return d;
  }
  const T0 = performance.now();
  // --- surface nets
  const h = .0135, x0 = -.44, y0 = -.02, z0 = -.21;
  const nx = Math.ceil(.88 / h) + 1, ny = Math.ceil(1.92 / h) + 1, nz = Math.ceil(.44 / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  // coarse pass first, then only evaluate the fine grid near the surface (5-10x faster)
  const S = 4, cx = Math.ceil(nx / S) + 1, cy = Math.ceil(ny / S) + 1, cz = Math.ceil(nz / S) + 1, Cg = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) Cg[i + cx * (j + cy * k)] = sdf(x0 + i * S * h, y0 + j * S * h, z0 + k * S * h);
  const far = S * h * 1.9;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = Cg[Math.round(i / S) + cx * (Math.round(j / S) + cy * Math.round(k / S))];
    V[at(i, j, k)] = Math.abs(c) > far ? c : sdf(x0 + i * h, y0 + j * h, z0 + k * h);
  }
  const T1 = performance.now();
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cAt = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [], idx = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { const v = V[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; cv[c] = v; if (v < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += corner[a][0] + t * (corner[b][0] - corner[a][0]);
      sy += corner[a][1] + t * (corner[b][1] - corner[a][1]);
      sz += corner[a][2] + t * (corner[b][2] - corner[a][2]);
      n++;
    }
    cellIdx[cAt(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  // faces: one quad per grid edge that crosses the surface
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const inside = V[at(i, j, k)] < 0;
    const quads = [
      [V[at(i + 1, j, k)] < 0, cAt(i, j, k), cAt(i, j - 1, k), cAt(i, j - 1, k - 1), cAt(i, j, k - 1)],
      [V[at(i, j + 1, k)] < 0, cAt(i, j, k), cAt(i, j, k - 1), cAt(i - 1, j, k - 1), cAt(i - 1, j, k)],
      [V[at(i, j, k + 1)] < 0, cAt(i, j, k), cAt(i - 1, j, k), cAt(i - 1, j - 1, k), cAt(i, j - 1, k)],
    ];
    for (const [other, a, b, c, d] of quads) {
      if (inside === other) continue;
      const A = cellIdx[a], B = cellIdx[b], Cc = cellIdx[c], D = cellIdx[d];
      if (A < 0 || B < 0 || Cc < 0 || D < 0) continue;
      if (inside) idx.push(A, B, Cc, A, Cc, D); else idx.push(A, Cc, B, A, D, Cc);
    }
  }
  const T2 = performance.now();
  // normals from the distance field, cylindrical uvs (seam at the front, where the drapery is)
  const N = pos.length / 3, nrm = new Float32Array(N * 3), uv = new Float32Array(N * 2), e = .004;
  for (let v = 0; v < N; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; nrm[v * 3] = gx / l; nrm[v * 3 + 1] = gy / l; nrm[v * 3 + 2] = gz / l;
    uv[v * 2] = Math.atan2(x, z) / (2 * Math.PI) + .5; uv[v * 2 + 1] = y * 1.6;
  }
  const T3 = performance.now();
  // skin weights: each vertex follows the bones whose shapes it is closest to (soft blend at joints)
  const boneIndex = Object.fromEntries(BONE_NAMES.map((n, i) => [n, i]));
  const byBone = {}; for (const p of PARTS) (byBone[p.bone] = byBone[p.bone] || []).push(p);
  const skinI = new Uint16Array(N * 4), skinW = new Float32Array(N * 4);
  const SIG = .022;
  for (let v = 0; v < N; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const scores = [];
    for (const b in byBone) {
      let d = 1e9; for (const p of byBone[b]) d = Math.min(d, p.f(x, y, z));
      scores.push([b, Math.exp(-Math.max(0, d) / SIG)]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    const top = scores.slice(0, 3); let sum = 0; for (const s of top) sum += s[1];
    top.forEach((s, i) => { skinI[v * 4 + i] = boneIndex[s[0]]; skinW[v * 4 + i] = s[1] / sum; });
  }
  if (typeof process !== 'undefined' && process.env.PROF) console.log('grid', (T1-T0)|0, 'nets', (T2-T1)|0, 'normals', (T3-T2)|0, 'skin', (performance.now()-T3)|0);
  return { pos: new Float32Array(pos), idx: N > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), nrm, uv, skinI, skinW, count: N };
}
