// Non-weapon viewmodel models: fists, flashlight, throwables, bottles and the Minecraft-style extruded icon.
import * as THREE from 'three';
import { ModelBuilder, lin } from './builder.js';
import { M } from './material.js';
import { C } from './palette.js';

const PI = Math.PI;

function itemMeta(extra) {
  return Object.assign({
    kind: 'tool', weight: 0.15, scale: 1.3,
    hip: { pos: [0.16, -0.17, -0.35], rot: [-0.1, 0.25, 0.2] },
    sprint: { pos: [0.16, -0.28, -0.3], rot: [-0.9, 0.2, 0.3] },
    hands: { R: 'handR', L: null },
  }, extra);
}

export function fists() {
  const b = new ModelBuilder();
  b.point('handR', [0, 0, 0]);
  return {
    b,
    meta: {
      kind: 'fists', weight: 0.05,
      hip: { pos: [0.22, -0.13, -0.42], rot: [0.1, 0.3, -0.12] },
      sprint: { pos: [0.23, -0.19, -0.37], rot: [-0.2, 0.35, -0.05] },
      hands: { R: 'handR', L: null },
      freeL: { pos: [-0.15, -0.17, -0.35] },
      shoulders: { R: [0.46, -0.52, 0.04], L: [-0.3, -0.45, 0.0] },
      swing: 'punch',
    },
  };
}

export function flashlight() {
  const b = new ModelBuilder({ texel: 0.5 });
  const A = 0x232528;
  b.tubeZ(0, 0, -0.5, 3.0, 13, A, M.METAL);
  for (let i = 0; i < 6; i++) b.tubeZ(0, 0, -3 + i * 0.9, 3.12, 0.35, 0x17181a, M.METAL, { core: false });
  b.tubeZ(0, 0, 6.5, 3.3, 1.4, A, M.METAL);
  b.tubeZ(0, 0, -9.0, 3.6, 3.0, A, M.METAL);
  b.tubeZ(0, 0, -11.6, 4.4, 2.6, A, M.METAL);
  b.box(0, 0, -12.95, 3.6, 3.6, 0.08, 0xfff4d6, M.LENS);
  b.box(0, 0, -12.9, 4.1, 4.1, 0.05, 0x9ea4aa, M.STEEL);
  b.box(0, 1.6, 2.0, 1.0, 0.4, 1.2, 0x111111, M.RUBBER);
  b.point('handR', [0, -0.4, 0.8]);
  b.point('muzzle', [0, 0, -13.2]);
  return {
    b,
    meta: itemMeta({
      kind: 'tool', weight: 0.15, scale: 1.6,
      hip: { pos: [0.15, -0.14, -0.35], rot: [0.04, 0.16, -0.05] },
      sprint: { pos: [0.14, -0.26, -0.32], rot: [-0.75, 0.3, 0.2] },
    }),
  };
}

function bottleBody(b, glass, liquid, liquidLevel) {
  b.box(0, 3.5, 0, 5.4, 11, 5.4, glass, M.GLASS);
  b.box(0, 3.5, 0, 4.6, 11, 5.8, glass, M.GLASS);
  b.box(0, 3.5, 0, 5.8, 11, 4.6, glass, M.GLASS);
  if (liquid != null) {
    const h = 11 * liquidLevel;
    b.box(0, -2 + h / 2, 0, 5.85, h, 5.85, liquid, M.GLASS, { skip: 'py,ny' });
  }
  b.box(0, 9.8, 0, 3.8, 1.8, 3.8, glass, M.GLASS);
  b.box(0, 12.6, 0, 1.9, 4.2, 1.9, glass, M.GLASS);
}

export function molotov() {
  const b = new ModelBuilder({ texel: 0.6 });
  bottleBody(b, C.glassGreen, 0x8a5a14, 0.7);
  b.box(0, 15.4, 0, 2.6, 2.6, 2.6, C.clothDirty, M.CLOTH);
  b.box(0.3, 17.2, 0.2, 1.8, 1.6, 1.8, 0xc8bc9c, M.CLOTH, { r: [0.3, 0, 0.4] });
  b.box(1.0, 12.4, 0.8, 0.6, 5, 1.8, C.clothDirty, M.CLOTH, { r: [0.1, 0, -0.15] });
  b.point('handR', [0, 2.5, 0]);
  b.point('flame', [0.4, 18.6, 0.2]);
  return { b, meta: itemMeta({ kind: 'throw', flame: 'flame' }) };
}

export function pipeBomb() {
  const b = new ModelBuilder({ texel: 0.5 });
  b.tubeY(0, 2, 0, 3.4, 14, 0x55595e, M.METAL);
  b.box(0, 9.6, 0, 4.2, 1.4, 4.2, 0x44484c, M.METAL);
  b.box(0, -5.6, 0, 4.2, 1.4, 4.2, 0x44484c, M.METAL);
  b.box(0, 3, 0, 3.7, 3.4, 3.7, C.tape, M.TAPE);
  b.box(1.85, 1, 0.6, 0.3, 10, 0.3, 0xb02020, M.POLY);
  b.box(-1.85, 0, -0.6, 0.3, 8, 0.3, 0x2050b0, M.POLY);
  b.box(0, 11.6, 0, 0.4, 2.8, 0.4, 0x3a2a1a, M.CLOTH);
  b.point('handR', [0, 0.5, 0]);
  b.point('flame', [0, 13.1, 0]);
  return { b, meta: itemMeta({ kind: 'throw', flame: 'flame', flameKind: 'spark' }) };
}

export function grenade() {
  const b = new ModelBuilder({ texel: 0.5 });
  const O = C.olive;
  b.box(0, 2, 0, 5.4, 6.2, 5.4, O, M.PAINT);
  b.box(0, 2, 0, 6.0, 5.0, 6.0, O, M.PAINT);
  b.box(0, 2, 0, 4.2, 7.0, 4.2, O, M.PAINT);
  b.box(0, 2.3, 3.05, 3.0, 0.6, 0.1, 0xd8c860, M.PLAIN);
  b.box(0, 6.0, 0, 2.2, 1.8, 2.2, 0x6e7068, M.METAL);
  b.box(0, 7.1, 0.6, 1.6, 0.6, 2.6, 0x6e7068, M.METAL);
  b.box(0, 4.6, 2.9, 1.4, 5.0, 0.4, 0x6e7068, M.METAL, { r: [-0.18, 0, 0] });
  b.part('pin', { origin: [-1.2, 6.4, 0] });
  for (const [y, z, sy, sz] of [[7.4, 0, 0.3, 2.4], [5.2, 0, 0.3, 2.4], [6.3, 1.05, 2.4, 0.3], [6.3, -1.05, 2.4, 0.3]]) b.box(-2.0, y, z, 0.3, sy, sz, C.steelLight, M.STEEL);
  b.box(-1.4, 6.3, 0, 1.2, 0.25, 0.25, C.steelLight, M.STEEL);
  b.part('body');
  b.point('handR', [0, 1.5, 0]);
  return { b, meta: itemMeta({ kind: 'throw' }) };
}

export function flare() {
  const b = new ModelBuilder({ texel: 0.5 });
  b.tubeY(0, 4, 0, 3.0, 20, 0xc1271b, M.POLY);
  b.tubeY(0, 4, 0, 3.08, 4, 0xe6e0d0, M.PLAIN);
  b.tubeY(0, 15.2, 0, 3.3, 2.4, 0x1a1a1a, M.POLY);
  b.tubeY(0, -6.4, 0, 3.2, 1.0, 0x8a1a12, M.POLY);
  b.point('handR', [0, 0, 0]);
  b.point('flame', [0, 16.6, 0]);
  return { b, meta: itemMeta({ kind: 'throw', flame: 'flame', flameKind: 'flare' }) };
}

export function bottle() {
  const b = new ModelBuilder({ texel: 0.6 });
  bottleBody(b, C.glassBrown, null, 0);
  b.box(0, 3.5, 2.95, 3.6, 4.0, 0.06, 0xe6d6a8, M.PLAIN);
  b.box(0, 14.9, 0, 2.2, 0.6, 2.2, C.brass, M.BRASS);
  b.point('handR', [0, 2.5, 0]);
  return { b, meta: itemMeta({ kind: 'throw' }) };
}

// ------------------------------------------------------------------------------ extruded icon
/**
 * Minecraft-style held item: 16x16 icon extruded 1 pixel deep. Front/back faces per opaque pixel,
 * side faces only where the neighbour pixel is transparent.
 */
export function generic(iconCanvas) {
  const b = new ModelBuilder({ texel: 1 });
  const S = 1.0; // cm per pixel
  const w = iconCanvas?.width || 16, h = iconCanvas?.height || 16;
  let data = null;
  try {
    // copy into a private canvas (avoids repeated readbacks on the shared icon canvas)
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(iconCanvas, 0, 0);
    data = g.getImageData(0, 0, w, h).data;
  } catch (e) {
    data = null;
  }
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h || !data ? 0 : data[(y * w + x) * 4 + 3]);
  // hand anchor: a couple of pixels from the bottom-left-most opaque pixel toward the centroid
  let sx = 0, sy = 0, cnt = 0, best = null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha(x, y) < 128) continue;
      sx += x; sy += y; cnt++;
      const score = x - y;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (!cnt) {
    b.box(0, 0, 0, 6, 6, 6, 0x888888, M.PLAIN);
    b.point('handR', [0, -2, 0]);
    b.point('center', [0, 0, 0]);
  } else {
    const cx = sx / cnt, cy = sy / cnt;
    const dx = cx - best.x, dy = cy - best.y;
    const dl = Math.hypot(dx, dy) || 1;
    const k = Math.min(2.5, dl * 0.5);
    const ax = best.x + 0.5 + (dx / dl) * k, ay = best.y + 0.5 + (dy / dl) * k;
    // model origin = hand anchor
    const ox = (ax - w / 2) * S, oy = (h / 2 - ay) * S;
    const p = b.cur;
    const quad = (corners, n, col) => {
      const base = p.pos.length / 3;
      for (const c of corners) {
        p.pos.push(c[0] - ox, c[1] - oy, c[2]);
        p.nrm.push(n[0], n[1], n[2]);
        p.col.push(col[0], col[1], col[2]);
        p.face.push(1, 1, M.FLAT, 0);
        p.tex.push(0, 0);
      }
      p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const lc = new THREE.Color();
    const hd = S * 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha(x, y) < 128) continue;
        const i = (y * w + x) * 4;
        lc.setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.SRGBColorSpace);
        const col = [lc.r, lc.g, lc.b];
        const side = [col[0] * 0.82, col[1] * 0.82, col[2] * 0.82];
        const x0 = (x - w / 2) * S, x1 = x0 + S;
        const y1 = (h / 2 - y) * S, y0 = y1 - S;
        quad([[x0, y0, hd], [x1, y0, hd], [x1, y1, hd], [x0, y1, hd]], [0, 0, 1], col);
        quad([[x1, y0, -hd], [x0, y0, -hd], [x0, y1, -hd], [x1, y1, -hd]], [0, 0, -1], col);
        if (alpha(x + 1, y) < 128) quad([[x1, y0, hd], [x1, y0, -hd], [x1, y1, -hd], [x1, y1, hd]], [1, 0, 0], side);
        if (alpha(x - 1, y) < 128) quad([[x0, y0, -hd], [x0, y0, hd], [x0, y1, hd], [x0, y1, -hd]], [-1, 0, 0], side);
        if (alpha(x, y - 1) < 128) quad([[x0, y1, hd], [x1, y1, hd], [x1, y1, -hd], [x0, y1, -hd]], [0, 1, 0], side);
        if (alpha(x, y + 1) < 128) quad([[x0, y0, -hd], [x1, y0, -hd], [x1, y0, hd], [x0, y0, hd]], [0, -1, 0], side);
      }
    }
    b.point('handR', [0, 0, 0]);
    b.point('center', [(cx + 0.5 - w / 2) * S - ox, (h / 2 - cy - 0.5) * S - oy, 0]);
  }
  return {
    b,
    meta: itemMeta({
      kind: 'generic', weight: 0.1, scale: 1.25,
      hip: { pos: [0.15, -0.16, -0.34], rot: genericHoldRot() },
      sprint: { pos: [0.16, -0.27, -0.3], rot: [-0.9, 0.25, 0.3] },
    }),
  };
}

/** Rotation (euler YXZ: [pitch, yaw, roll]) holding an icon like Minecraft: diagonal up-forward-left, face toward camera. */
let _genericRot = null;
export function genericHoldRot() {
  if (_genericRot) return _genericRot.slice();
  const D = new THREE.Vector3(-0.42, 0.78, -0.48).normalize();
  let N = new THREE.Vector3(-0.55, 0.15, 0.82);
  N.sub(D.clone().multiplyScalar(N.dot(D))).normalize();
  const NxD = new THREE.Vector3().crossVectors(N, D);
  const Y = D.clone().add(NxD).multiplyScalar(Math.SQRT1_2);
  const X = D.clone().sub(NxD).multiplyScalar(Math.SQRT1_2);
  const m = new THREE.Matrix4().makeBasis(X, Y, N);
  const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
  _genericRot = [e.x, e.y, e.z];
  return _genericRot.slice();
}

// ------------------------------------------------------------------------------ props
/** Small prop meshes attached to the hands during reloads (shell, round). */
export function buildProp(kind) {
  const b = new ModelBuilder({ texel: 0.4 });
  if (kind === 'shell') {
    b.box(0, 0, -0.6, 1.9, 1.9, 5.0, C.shellRed, M.POLY);
    b.box(0, 0, 2.3, 2.05, 2.05, 0.9, C.brass, M.BRASS);
  } else if (kind === 'big') {
    b.box(0, 0, 0.8, 1.0, 1.0, 4.6, C.brass, M.BRASS);
    b.box(0, 0, -2.3, 0.7, 0.7, 1.8, C.copper, M.BRASS);
  } else if (kind === 'revolver') {
    b.box(0, 0, 0.6, 0.95, 0.95, 3.0, C.brass, M.BRASS);
    b.box(0, 0, -1.2, 0.75, 0.75, 0.9, 0x9a9da0, M.METAL);
  } else if (kind === 'shell_case') {
    b.box(0, 0, -0.6, 1.9, 1.9, 5.0, C.shellRed, M.POLY);
    b.box(0, 0, 2.3, 2.05, 2.05, 0.9, C.brass, M.BRASS);
    b.box(0, 0, -3.15, 1.5, 1.5, 0.1, 0x3a0d08, M.FLAT);
  } else if (kind === 'big_case') {
    b.box(0, 0, 0.4, 1.0, 1.0, 3.6, C.brass, M.BRASS);
    b.box(0, 0, -1.8, 0.65, 0.65, 0.9, C.brass, M.BRASS);
  } else if (kind === 'round_case') {
    b.box(0, 0, 0, 0.9, 0.9, 1.9, C.brass, M.BRASS);
  } else {
    b.box(0, 0, 0.4, 0.9, 0.9, 2.0, C.brass, M.BRASS);
    b.box(0, 0, -0.9, 0.7, 0.7, 0.8, C.copper, M.BRASS);
  }
  return b;
}
