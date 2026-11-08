import * as THREE from 'three';

/**
 * Builds form-fitting garments by cutting a region out of the body surface
 * along the zero iso-line of a signed field (so hems are clean curves, not
 * jagged triangle edges), offsetting it along the normals by the fabric's
 * thickness + ease, and relaxing it so the fabric bridges concavities (the
 * cleavage, the small of the back, the navel) the way real cloth does.
 *
 * The result is a skinned geometry that inherits (interpolated) skin weights
 * from the body, so it deforms exactly with the character.
 */

function mergeSkin(i0, w0, a, i1, w1, b) {
  const m = new Map();
  for (let k = 0; k < 4; k++) {
    if (w0[k] > 0) m.set(i0[k], (m.get(i0[k]) || 0) + w0[k] * a);
    if (w1[k] > 0) m.set(i1[k], (m.get(i1[k]) || 0) + w1[k] * b);
  }
  const arr = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  let s = 0; for (const e of arr) s += e[1];
  const I = [0, 0, 0, 0], W = [0, 0, 0, 0];
  arr.forEach((e, k) => { I[k] = e[0]; W[k] = e[1] / (s || 1); });
  return [I, W];
}

export function buildFitted(atlas, spec) {
  const nw = atlas.count;
  const F = new Float32Array(nw);
  const OFF = new Float32Array(nw);
  const SM = new Float32Array(nw);
  const L = atlas.L;
  for (let w = 0; w < nw; w++) {
    const s = atlas.sample(w);
    s.armT = (side) => atlas.armCoord(w, side);
    s.L = L;
    F[w] = spec.field(s);
    OFF[w] = spec.offset ? spec.offset(s) : 0.003;
    SM[w] = spec.smoothMask ? spec.smoothMask(s) : 1;
  }

  const P = [], N = [], SI = [], SW = [], O = [], M = [], BASE = [], BN = [];
  const vmap = new Int32Array(nw).fill(-1);
  const emap = new Map();
  const tris = [];

  const addVert = (p, n, si, sw, off, sm) => {
    P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]);
    SI.push(...si); SW.push(...sw); O.push(off); M.push(sm);
    return O.length - 1;
  };
  const vOf = (w) => {
    if (vmap[w] >= 0) return vmap[w];
    const si = [], sw = [];
    for (let k = 0; k < 4; k++) { si.push(atlas.SI[w * 4 + k]); sw.push(atlas.SW[w * 4 + k]); }
    vmap[w] = addVert([atlas.P[w * 3], atlas.P[w * 3 + 1], atlas.P[w * 3 + 2]],
      [atlas.N[w * 3], atlas.N[w * 3 + 1], atlas.N[w * 3 + 2]], si, sw, OFF[w], SM[w]);
    return vmap[w];
  };
  const eOf = (a, b) => {
    const key = a < b ? a * nw + b : b * nw + a;
    let v = emap.get(key);
    if (v !== undefined) return v;
    const t = F[a] / (F[a] - F[b]);
    const p = [], n = [];
    for (let k = 0; k < 3; k++) {
      p.push(atlas.P[a * 3 + k] * (1 - t) + atlas.P[b * 3 + k] * t);
      n.push(atlas.N[a * 3 + k] * (1 - t) + atlas.N[b * 3 + k] * t);
    }
    const ln = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= ln; n[1] /= ln; n[2] /= ln;
    const ia = [], wa = [], ib = [], wb = [];
    for (let k = 0; k < 4; k++) {
      ia.push(atlas.SI[a * 4 + k]); wa.push(atlas.SW[a * 4 + k]);
      ib.push(atlas.SI[b * 4 + k]); wb.push(atlas.SW[b * 4 + k]);
    }
    const [si, sw] = mergeSkin(ia, wa, 1 - t, ib, wb, t);
    v = addVert(p, n, si, sw, OFF[a] * (1 - t) + OFF[b] * t, SM[a] * (1 - t) + SM[b] * t);
    emap.set(key, v);
    return v;
  };

  const T = atlas.T;
  const covered = new Uint8Array(atlas.triCount);
  const margin = spec.coverMargin ?? 0.012;
  for (let t = 0; t < atlas.triCount; t++) {
    const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2];
    const fa = F[a], fb = F[b], fc = F[c];
    if (Math.max(fa, fb, fc) < -margin) covered[t] = 1;
    const ia = fa < 0, ib = fb < 0, ic = fc < 0;
    const n = ia + ib + ic;
    if (n === 0) continue;
    if (n === 3) { tris.push(vOf(a), vOf(b), vOf(c)); continue; }
    const vs = [a, b, c], ins = [ia, ib, ic];
    const poly = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (ins[i]) poly.push(vOf(vs[i]));
      if (ins[i] !== ins[j]) poly.push(eOf(vs[i], vs[j]));
    }
    for (let i = 1; i < poly.length - 1; i++) tris.push(poly[0], poly[i], poly[i + 1]);
  }

  const nv = O.length;
  const pos = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) {
      BASE.push(P[i * 3 + k]); BN.push(N[i * 3 + k]);
      pos[i * 3 + k] = P[i * 3 + k] + N[i * 3 + k] * O[i];
    }
  }

  // adjacency + boundary detection
  const edgeCount = new Map();
  const adj = Array.from({ length: nv }, () => new Set());
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[i + k], b = tris[i + (k + 1) % 3];
      adj[a].add(b); adj[b].add(a);
      const key = a < b ? a * nv + b : b * nv + a;
      edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
    }
  }
  const boundary = new Uint8Array(nv);
  const bEdges = [];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tris[i + k], b = tris[i + (k + 1) % 3];
      const key = a < b ? a * nv + b : b * nv + a;
      if (edgeCount.get(key) === 1) { boundary[a] = boundary[b] = 1; bEdges.push(a, b); }
    }
  }

  // relax: fabric bridges concavities but never sinks below its minimum offset
  const iters = spec.smooth ?? 0;
  if (iters > 0) {
    const tmp = new Float32Array(nv * 3);
    const minOff = spec.minOffset ?? 0.0015;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < nv; i++) {
        let sx = 0, sy = 0, sz = 0, c = 0;
        for (const j of adj[i]) { sx += pos[j * 3]; sy += pos[j * 3 + 1]; sz += pos[j * 3 + 2]; c++; }
        const lam = (boundary[i] ? 0.15 : 0.6) * M[i];
        if (!c) { tmp[i * 3] = pos[i * 3]; tmp[i * 3 + 1] = pos[i * 3 + 1]; tmp[i * 3 + 2] = pos[i * 3 + 2]; continue; }
        tmp[i * 3] = pos[i * 3] + (sx / c - pos[i * 3]) * lam;
        tmp[i * 3 + 1] = pos[i * 3 + 1] + (sy / c - pos[i * 3 + 1]) * lam;
        tmp[i * 3 + 2] = pos[i * 3 + 2] + (sz / c - pos[i * 3 + 2]) * lam;
      }
      for (let i = 0; i < nv; i++) {
        // keep outside the body: signed distance along the base normal
        const dx = tmp[i * 3] - BASE[i * 3], dy = tmp[i * 3 + 1] - BASE[i * 3 + 1], dz = tmp[i * 3 + 2] - BASE[i * 3 + 2];
        const d = dx * BN[i * 3] + dy * BN[i * 3 + 1] + dz * BN[i * 3 + 2];
        const need = Math.max(minOff, O[i] * 0.55);
        if (d < need) {
          tmp[i * 3] += BN[i * 3] * (need - d);
          tmp[i * 3 + 1] += BN[i * 3 + 1] * (need - d);
          tmp[i * 3 + 2] += BN[i * 3 + 2] * (need - d);
        }
      }
      pos.set(tmp);
    }
  }

  // hems: turn the cut edge back towards the body so it reads as real fabric
  const hem = spec.hem ?? 0.004;
  let finalPos = Array.from(pos), finalSI = SI.slice(), finalSW = SW.slice(), finalBase = BASE.slice();
  const finalTris = tris.slice();
  if (hem > 0 && bEdges.length) {
    const dup = new Map();
    const getDup = (v) => {
      if (dup.has(v)) return dup.get(v);
      const id = finalPos.length / 3;
      finalPos.push(pos[v * 3] - BN[v * 3] * hem * 0.7, pos[v * 3 + 1] - BN[v * 3 + 1] * hem * 0.7, pos[v * 3 + 2] - BN[v * 3 + 2] * hem * 0.7);
      finalSI.push(SI[v * 4], SI[v * 4 + 1], SI[v * 4 + 2], SI[v * 4 + 3]);
      finalSW.push(SW[v * 4], SW[v * 4 + 1], SW[v * 4 + 2], SW[v * 4 + 3]);
      finalBase.push(BASE[v * 3], BASE[v * 3 + 1], BASE[v * 3 + 2]);
      dup.set(v, id);
      return id;
    };
    for (let i = 0; i < bEdges.length; i += 2) {
      const a = bEdges[i], b = bEdges[i + 1];
      const a2 = getDup(a), b2 = getDup(b);
      // boundary edge a->b belongs to a triangle with CCW order; the strip continues it
      finalTris.push(b, a, a2, b, a2, b2);
    }
  }

  const geom = new THREE.BufferGeometry();
  const fp = new Float32Array(finalPos);
  geom.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(finalSI, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(finalSW, 4));
  geom.setAttribute('restPos', new THREE.BufferAttribute(fp.slice(), 3));
  geom.setIndex(finalTris);
  geom.computeVertexNormals();
  geom.setAttribute('restNormal', new THREE.BufferAttribute(geom.attributes.normal.array.slice(), 3));
  return { geometry: geom, covered };
}
