// =============================================================================
// Stencil decals on the wings (NO STEP, EXIT, walkway, fuel). Built per side so
// that text is never mirrored on the left wing (the wing geometry itself is a
// mirrored copy). Quads follow the wing surface (subdivided) slightly above it.
// =============================================================================
import * as THREE from 'three';
import { wingPoint, chordX, station } from './planform.js';
import { patchExterior } from './shading.js';

/**
 * items: { id, s (span m), f (chord fraction), w (m along text), h (m), along: 'span'|'chord', side: 1 upper / -1 lower, flipText }
 * The text baseline runs along `along`; text "up" points towards the LE (span text) or outboard (chord text).
 */
const ITEMS = [
  { id: 'nostep', s: 4.4, f: 0.5, w: 0.62, h: 0.15, along: 'chord' },
  { id: 'nostep', s: 6.6, f: 0.45, w: 0.62, h: 0.15, along: 'chord' },
  { id: 'nostep', s: 9.4, f: 0.45, w: 0.55, h: 0.14, along: 'chord' },
  { id: 'nostep', s: 12.2, f: 0.45, w: 0.5, h: 0.13, along: 'chord' },
  { id: 'nostep', s: 14.6, f: 0.45, w: 0.45, h: 0.11, along: 'chord' },
  { id: 'nostepBlack', s: 4.0, f: 0.13, w: 0.5, h: 0.12, along: 'span' },
  { id: 'nostepBlack', s: 8.0, f: 0.11, w: 0.45, h: 0.11, along: 'span' },
  { id: 'nostepBlack', s: 12.5, f: 0.1, w: 0.4, h: 0.1, along: 'span' },
  { id: 'exit', s: 2.75, f: 0.21, w: 0.36, h: 0.09, along: 'chord' },
  { id: 'walk', s: 3.75, f: 0.42, w: 1.1, h: 0.13, along: 'chord' },
  { id: 'fuel', s: 12.9, f: 0.47, w: 0.34, h: 0.085, along: 'chord' },
  { id: 'chevron', s: 2.75, f: 0.31, w: 0.26, h: 0.13, along: 'chord' },
];

export function buildDecals(sheet, sgn = 1, material = null) {
  const pos = [], uv = [], idx = [];
  const p = {};
  const N = 4;
  for (const it of ITEMS) {
    const cell = sheet.cells[it.id];
    if (!cell) continue;
    const c = chordX(it.s);
    const base = pos.length / 3;
    for (let a = 0; a <= N; a++) {
      for (let b = 0; b <= 1; b++) {
        // a: along the text (0..1), b: across (0 bottom .. 1 top)
        const ta = a / N - 0.5, tb = b - 0.5;
        let s, f;
        if (it.along === 'chord') {
          // baseline from TE towards LE? We read from the root: baseline runs aft->fwd... choose LE->TE
          s = it.s + tb * it.h;                 // top of the text points outboard
          f = it.f + (ta * it.w) / c;
        } else {
          s = it.s + ta * it.w;
          f = it.f - (tb * it.h) / c;           // top towards the LE
        }
        wingPoint(s, f, it.side || 1, p, 0.004);
        pos.push(p.x, p.y, p.z);
        let u = cell.u0 + (cell.u1 - cell.u0) * (a / N);
        const v = cell.v0 + (cell.v1 - cell.v0) * b;
        // the left wing group mirrors x: flip the text direction so it reads correctly
        if (sgn < 0) u = cell.u1 - (cell.u1 - cell.u0) * (a / N);
        uv.push(u, v);
      }
    }
    for (let a = 0; a < N; a++) {
      const i0 = base + a * 2;
      idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals point up
  const n = g.attributes.normal;
  let sy = 0; for (let i = 0; i < n.count; i++) sy += n.getY(i);
  if (sy < 0) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.computeVertexNormals(); }
  const mat = material || decalMaterial(sheet);
  const mesh = new THREE.Mesh(g, mat);
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  return mesh;
}

export function decalMaterial(sheet) {
  return patchExterior(new THREE.MeshStandardMaterial({
    name: 'ext-decal', map: sheet.texture, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0,
    alphaTest: 0.02,
  }));
}
