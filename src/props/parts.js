// Shared building blocks for prop definitions.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as F from '../core/fracture.js';
import { applyUV, boxUV, cylUV, shellTileGeometry } from '../core/geometry.js';
import { surface } from '../core/materials.js';

/** Smooth radius profile r(y) through control points [[y, r], …] (monotone cubic). */
export function makeProfile(pts) {
  const n = pts.length;
  const m = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    m[i] = (b[1] - a[1]) / (b[0] - a[0] || 1);
  }
  return (y) => {
    if (y <= pts[0][0]) return pts[0][1];
    if (y >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (i < n - 2 && y > pts[i + 1][0]) i++;
    const h = pts[i + 1][0] - pts[i][0];
    const t = (y - pts[i][0]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}

function orient(poly) {
  if (F.polyMassProps(poly).volume < 0) for (const f of poly.faces) f.pts.reverse();
  return poly;
}

function triangulate(poly) {
  const faces = [];
  for (const f of poly.faces) {
    if (f.pts.length <= 3) { faces.push(f); continue; }
    for (let i = 1; i < f.pts.length - 1; i++) faces.push({ pts: [f.pts[0], f.pts[i], f.pts[i + 1]], tag: f.tag, smooth: f.smooth });
  }
  return { faces };
}

/**
 * Hollow surface of revolution (vase, mug, pot) built from irregular curved
 * tiles, each its own breakable chunk, plus a floor disc split into wedges.
 * o: { profile, th, sectors, rings, surf, pos, baseTh, repeatU, jitter, rng, strength, tags, bond, mass, tileOpts }
 */
export function addRevolved(b, name, o) {
  const rFn = makeProfile(o.profile);
  const H = o.profile[o.profile.length - 1][0];
  const S = o.sectors, K = o.rings;
  const th = o.th;
  const rng = o.rng || F.makeRng(7);
  const jit = o.jitter ?? 0.3;
  const s = typeof o.surf === 'string' ? surface(o.surf) : o.surf;
  const uv = cylUV(0, H, o.repeatU ?? 1);
  const pos = o.pos || [0, 0, 0];
  // ring heights: roughly uniform along the wall
  const ys = [];
  for (let j = 0; j <= K; j++) ys.push((H * j) / K);
  const base = rng() * Math.PI * 2;
  const P = [];
  for (let j = 0; j <= K; j++) {
    const row = [];
    for (let i = 0; i < S; i++) {
      const a = base + ((i + (rng() - 0.5) * jit) * Math.PI * 2) / S;
      const y = j === 0 || j === K ? ys[j] : ys[j] + (rng() - 0.5) * jit * (H / K);
      row.push([a, y]);
    }
    row.push([row[0][0] + Math.PI * 2, row[0][1]]);
    P.push(row);
  }
  const pt = (a, y, inner) => {
    const r = Math.max(0.002, rFn(y) - (inner ? th : 0));
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  };
  const parts = [];
  // wall area for mass distribution
  for (let j = 0; j < K; j++) {
    for (let i = 0; i < S; i++) {
      const c = [P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i]];
      const inner = c.map(([a, y]) => pt(a, y, true));
      const outer = c.map(([a, y]) => pt(a, y, false));
      const poly = triangulate(orient(F.hexaPoly(inner, outer, { top: 0, bottom: 2, sides: [1, 1, 1, 1] })));
      const geo = shellTileGeometry(c, rFn, th, 0, H, o.sub ?? 3, o.repeatU ?? 1);
      parts.push(
        b.poly(name, poly, pos, s, {
          geometry: geo, uv, thick: th, strength: o.strength, tags: o.tags, bond: o.bond,
          pattern: 'chunky', minRefracture: o.minRefracture ?? 0.05, density: o.density, ...(o.tileOpts || {}),
        })
      );
    }
  }
  // floor
  const bt = o.baseTh ?? th;
  const r0 = Math.max(0.004, rFn(0) - th + 0.0015);
  const wedges = Math.min(4, Math.max(1, Math.floor(S / 3)));
  const per = S / wedges;
  for (let w = 0; w < wedges; w++) {
    const pts2 = [[0, 0]];
    for (let i = Math.round(w * per); i <= Math.round((w + 1) * per); i++) {
      const a = P[0][i % S][0];
      // (a,b) plane for axis Y is (z, x)
      pts2.push([Math.sin(a) * r0, Math.cos(a) * r0]);
    }
    const poly = F.prismPoly(pts2, 1, 0, bt, 2, 0);
    parts.push(b.poly(name + '_base', poly, pos, s, { uv, thick: bt, strength: o.strength, tags: o.tags, bond: o.bond, pattern: 'chunky', minRefracture: 0.05, density: o.density }));
  }
  return parts;
}

/** Low-poly convex ellipsoid dome (flat bottom at y = 0) — mice, cushions, blobs. */
export function domePoly(rx, ry, rz, segs = 10, rings = 4) {
  const ring = (k) => {
    const phi = (k / rings) * (Math.PI / 2);
    const out = [];
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      out.push([Math.cos(t) * Math.cos(phi) * rx, Math.sin(phi) * ry, Math.sin(t) * Math.cos(phi) * rz]);
    }
    return out;
  };
  const faces = [];
  const rows = [];
  for (let k = 0; k < rings; k++) rows.push(ring(k));
  const top = [0, ry, 0];
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      faces.push({ pts: [rows[k][i], rows[k + 1][i], rows[k + 1][j], rows[k][j]], tag: 0, smooth: 1 });
    }
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    faces.push({ pts: [rows[rings - 1][i], top, rows[rings - 1][j]], tag: 0, smooth: 1 });
  }
  faces.push({ pts: rows[0].slice(), tag: 0 });
  const poly = { faces };
  if (F.polyMassProps(poly).volume < 0) for (const f of poly.faces) f.pts.reverse();
  return poly;
}

export function roundedBox(w, h, d, radius, scale = 0.2) {
  const g = new RoundedBoxGeometry(w, h, d, 3, radius);
  applyUV(g, boxUV(scale, 1));
  g.clearGroups();
  g.addGroup(0, g.index ? g.index.count : g.attributes.position.count, 0);
  return g;
}

const glowCache = new Map();
/** Self-lit accent material (LEDs, RGB fans, indicator lights). */
export function glowMat(color, intensity = 2.2) {
  const key = color + ':' + intensity;
  let m = glowCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: 0x101012, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
    glowCache.set(key, m);
  }
  return m;
}

/** Merge geometries into one with a material group per input (slot i = input i). */
export function mergeSlots(geos) {
  const prepared = geos.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') x.deleteAttribute(k);
    return x;
  });
  const merged = mergeGeometries(prepared, true);
  merged.computeBoundingSphere();
  return merged;
}

/** Simple LCD stack helper: returns fitUV parameters for a w×h screen centred on the origin. */
export function screenRect(w, h) {
  return [-w / 2, -h / 2, w, h];
}
