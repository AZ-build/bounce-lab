// Packs the sculpted body into a compact binary: int16 positions, int8 normals, uint8 skin, delta-coded indices, gzipped.
import { buildBody } from './sdfbody.mjs';
import zlib from 'zlib';
export function packBody() {
  const b = buildBody(), N = b.count, T = b.idx.length;
  const head = new Uint32Array([N, T]);
  const pos = new Int16Array(N * 3); for (let i = 0; i < N * 3; i++) pos[i] = Math.round(b.pos[i] / 2 * 32767);
  const nrm = new Int8Array(N * 3); for (let i = 0; i < N * 3; i++) nrm[i] = Math.round(b.nrm[i] * 127);
  const si = new Uint8Array(N * 3), sw = new Uint8Array(N * 3);
  for (let v = 0; v < N; v++) for (let k = 0; k < 3; k++) { si[v * 3 + k] = b.skinI[v * 4 + k]; sw[v * 3 + k] = Math.round(b.skinW[v * 4 + k] * 255); }
  const idx = new Int32Array(T); let prev = 0; for (let i = 0; i < T; i++) { idx[i] = b.idx[i] - prev; prev = b.idx[i]; }
  const parts = [head, pos, nrm, si, sw, idx].map(a => Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  const raw = Buffer.concat(parts);
  const gz = zlib.gzipSync(raw, { level: 9 });
  return { b64: gz.toString('base64'), raw: raw.length, gz: gz.length, N, T };
}
if (process.argv[1].endsWith('pack.mjs')) { const r = packBody(); console.log('verts', r.N, 'raw', r.raw, 'gz', r.gz, 'b64', r.b64.length); }
