import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { crateTexture, drumTexture } from './textures';
import { canvas, tex } from './mapKit';

/** What a prop is made of: how it sounds, what it leaves when it breaks, how it slides. */
export type PropMaterial = 'wood' | 'metal' | 'glass' | 'ceramic' | 'plastic' | 'fabric' | 'paper' | 'electronics' | 'trash' | 'rubber';

export interface LayerSpec {
  parts: THREE.BufferGeometry[];
  rough: number;
  metal?: number;
  map?: () => THREE.Texture;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  /** Not shadow-casting (glass, glowing parts). */
  noShadow?: boolean;
}

export interface PropKindDef {
  key: string;
  /** Collider half extents (box), or cylinder radius = x, half height = y. */
  half: [number, number, number];
  cyl?: boolean;
  mass: number;
  material: PropMaterial;
  /** Impact (sudden change of velocity, m/s) that breaks it; Infinity = never. */
  breakDv: number;
  /** Debris colours when it breaks. */
  debris?: number[];
  /** What is left standing when it breaks (another kind spawned in its place). */
  remains?: string;
  friction?: number;
  restitution?: number;
  /** How easily fighters on foot shove it out of the way (1 = like a drum). */
  shove?: number;
  layers: () => LayerSpec[];
}

// ============================================================================ geometry helpers
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
/** A coloured, placed primitive (non-indexed, with uv and vertex colour) for merging. */
export function part(geo: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
export function merge(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts, false)!;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** A full, sagging plastic sack: a sphere pushed in and out, its bottom flattened on the floor. */
function lumpy(r: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position as THREE.BufferAttribute;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bumps: [THREE.Vector3, number][] = [];
  for (let i = 0; i < 9; i++) bumps.push([new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), (rnd() - 0.4) * 0.35]);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const [d, a] of bumps) k += a * Math.max(0, n.dot(d)) ** 3;
    v.multiplyScalar(k);
    if (v.y < -r * 0.55) v.y = -r * 0.55 + (v.y + r * 0.55) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const Cy = (rt: number, rb: number, h: number, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const Sp = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);

// ============================================================================ shared textures
let _static: THREE.CanvasTexture | null = null;
/** Television snow for screens (scrolled each frame by the props system). */
export function staticTexture() {
  if (_static) return _static;
  const [c, x] = canvas(128, 128);
  const img = x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = Math.random() * 255;
    img.data.set([v * 0.8, v * 0.9, v, 255], i * 4);
  }
  x.putImageData(img, 0, 0);
  _static = tex(c);
  return _static;
}
function cardboardTexture() {
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#b08a5a';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},30,0.25)`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1);
  }
  x.fillStyle = 'rgba(200,170,110,0.6)';
  x.fillRect(58, 0, 12, 128); // tape
  x.fillStyle = 'rgba(40,30,20,0.7)';
  x.font = 'bold 14px sans-serif';
  x.fillText('THIS SIDE UP', 14, 100);
  return tex(c);
}

// ============================================================================ the kinds
const DRUM = 0xffffff;
export const PROP_KINDS: Record<string, PropKindDef> = {
  drum: {
    key: 'drum', half: [0.29, 0.44, 0.29], cyl: true, mass: 18, material: 'metal', breakDv: Infinity, shove: 1,
    layers: () => [{ parts: [part(Cy(0.29, 0.29, 0.88, 16), DRUM)], rough: 0.55, metal: 0.45, map: () => drumTexture('#8a8a8a', 21) }],
  },
  crate: {
    key: 'crate', half: [0.375, 0.375, 0.375], mass: 9, material: 'wood', breakDv: 4.2, debris: [0x8a6a44, 0x6a4a2a], shove: 0.7,
    layers: () => [{ parts: [part(B(0.75, 0.75, 0.75), 0xe8dcc8)], rough: 0.8, map: () => crateTexture(31) }],
  },
  trashcan: {
    key: 'trashcan', half: [0.27, 0.42, 0.27], cyl: true, mass: 6, material: 'metal', breakDv: Infinity, shove: 1.3, restitution: 0.25,
    layers: () => [
      {
        parts: [
          part(Cy(0.27, 0.24, 0.8, 14), 0x7d8288, 0, -0.02, 0),
          ...[-0.25, 0.0, 0.25].map((y) => part(Cy(0.275, 0.275, 0.03, 14), 0x5a5e62, 0, y, 0)),
          part(Cy(0.29, 0.29, 0.05, 14), 0x6a6e72, 0, 0.4, 0),
          part(B(0.14, 0.04, 0.03), 0x4a4e52, 0, 0.44, 0),
        ],
        rough: 0.45, metal: 0.7,
      },
    ],
  },
  trashbag: {
    key: 'trashbag', half: [0.28, 0.22, 0.26], mass: 3, material: 'trash', breakDv: 4.5, debris: [0xd8d0c0, 0x8a2a20, 0x3a6a3a, 0xc8c8c8, 0x2a2a2a], shove: 1.8, restitution: 0.05, friction: 0.9,
    layers: () => [
      {
        parts: [part(lumpy(0.27, 7), 0x141416, 0, -0.02, 0, 0, 0, 0, 1.08, 0.82, 0.98), part(Cy(0.03, 0.1, 0.16, 7), 0x141416, 0, 0.21, 0, 0.2, 0, 0.15), part(B(0.16, 0.02, 0.05), 0x141416, 0.03, 0.29, 0, 0, 0.6, 0.5)],
        rough: 0.3, metal: 0.05,
      },
    ],
  },
  box: {
    key: 'box', half: [0.25, 0.2, 0.22], mass: 1.5, material: 'paper', breakDv: 6, debris: [0xb08a5a, 0x8a6a40], shove: 2,
    layers: () => [{ parts: [part(B(0.5, 0.4, 0.44), 0xffffff)], rough: 0.9, map: cardboardTexture }],
  },
  tire: {
    key: 'tire', half: [0.33, 0.11, 0.33], cyl: true, mass: 9, material: 'rubber', breakDv: Infinity, shove: 1, restitution: 0.45,
    layers: () => [{ parts: [part(new THREE.TorusGeometry(0.24, 0.1, 8, 18), 0x181818, 0, 0, 0, Math.PI / 2), part(Cy(0.17, 0.17, 0.1, 12), 0x5a5a5e)], rough: 0.85 }],
  },
  pallet: {
    key: 'pallet', half: [0.6, 0.07, 0.5], mass: 12, material: 'wood', breakDv: 6, debris: [0x9a7a4a, 0x7a5a32], shove: 0.5,
    layers: () => [
      {
        parts: [
          ...[-0.4, -0.2, 0, 0.2, 0.4].map((z) => part(B(1.2, 0.025, 0.14), 0xa08050, 0, 0.055, z)),
          ...[-0.5, 0, 0.5].map((x) => part(B(0.1, 0.09, 1.0), 0x8a6a40, x, -0.01, 0)),
        ],
        rough: 0.9,
      },
    ],
  },
  cone: {
    key: 'cone', half: [0.17, 0.33, 0.17], cyl: true, mass: 1.2, material: 'plastic', breakDv: Infinity, shove: 2.5, restitution: 0.3,
    layers: () => [{ parts: [part(Cy(0.03, 0.15, 0.6, 12), 0xff5a10, 0, 0.03, 0), part(Cy(0.11, 0.12, 0.08, 12), 0xf0f0f0, 0, 0.05, 0), part(B(0.36, 0.05, 0.36), 0x222222, 0, -0.3, 0)], rough: 0.55 }],
  },
  milkcrate: {
    key: 'milkcrate', half: [0.2, 0.15, 0.2], mass: 1.5, material: 'plastic', breakDv: Infinity, shove: 2.2,
    layers: () => {
      const c = [0x1a4a9a, 0xb0201a, 0x1a7a3a][Math.floor(Math.random() * 3)];
      return [{ parts: [part(B(0.4, 0.03, 0.4), c, 0, -0.135, 0), ...[-1, 1].flatMap((s) => [part(B(0.03, 0.3, 0.4), c, s * 0.185, 0, 0), part(B(0.4, 0.3, 0.03), c, 0, 0, s * 0.185)])], rough: 0.5 }];
    },
  },
  bottle: {
    key: 'bottle', half: [0.04, 0.13, 0.04], cyl: true, mass: 0.4, material: 'glass', breakDv: 3.0, debris: [0x2a5a2a, 0x3a2a14, 0x7a9a9a], shove: 3,
    layers: () => [{ parts: [part(Cy(0.04, 0.04, 0.18, 10), 0x2a6a32, 0, -0.04, 0), part(Cy(0.015, 0.04, 0.06, 10), 0x2a6a32, 0, 0.08, 0), part(Cy(0.014, 0.014, 0.03, 8), 0x2a6a32, 0, 0.12, 0)], rough: 0.08, metal: 0.2 }],
  },
  // ---------------------------------------------------------------- furniture
  chair: {
    key: 'chair', half: [0.22, 0.45, 0.22], mass: 5, material: 'wood', breakDv: 5.5, debris: [0x6a4428, 0x4a2e18], shove: 1.4,
    layers: () => {
      const w = 0x6a4428;
      return [{
        parts: [
          part(B(0.44, 0.05, 0.42), w, 0, 0.0, 0),
          ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(B(0.04, 0.45, 0.04), 0x4a2e18, sx * 0.19, -0.225, sz * 0.18)),
          part(B(0.04, 0.45, 0.04), 0x4a2e18, -0.19, 0.225, -0.18),
          part(B(0.04, 0.45, 0.04), 0x4a2e18, 0.19, 0.225, -0.18),
          part(B(0.42, 0.18, 0.03), w, 0, 0.36, -0.185),
        ],
        rough: 0.65,
      }];
    },
  },
  stool: {
    key: 'stool', half: [0.18, 0.38, 0.18], cyl: true, mass: 4, material: 'metal', breakDv: Infinity, shove: 1.6,
    layers: () => [{ parts: [part(Cy(0.18, 0.18, 0.06, 16), 0x2a2a2e, 0, 0.35, 0), part(Cy(0.025, 0.025, 0.66, 8), 0xb8bcc0, 0, 0.0, 0), part(Cy(0.16, 0.18, 0.03, 16), 0xb8bcc0, 0, -0.36, 0), part(new THREE.TorusGeometry(0.12, 0.012, 6, 16), 0xb8bcc0, 0, -0.1, 0, Math.PI / 2)], rough: 0.35, metal: 0.6 }],
  },
  officechair: {
    key: 'officechair', half: [0.3, 0.5, 0.3], mass: 9, material: 'plastic', breakDv: Infinity, shove: 1.6, friction: 0.35,
    layers: () => [{
      parts: [
        part(B(0.48, 0.08, 0.46), 0x1a1a1e, 0, -0.02, 0),
        part(B(0.46, 0.5, 0.06), 0x1a1a1e, 0, 0.28, -0.22, -0.1),
        part(Cy(0.03, 0.03, 0.34, 8), 0x8a8e92, 0, -0.24, 0),
        ...[0, 1, 2, 3, 4].map((i) => part(B(0.04, 0.04, 0.3), 0x2a2a2e, Math.sin((i / 5) * Math.PI * 2) * 0.14, -0.44, Math.cos((i / 5) * Math.PI * 2) * 0.14, 0, (i / 5) * Math.PI * 2)),
        ...[0, 1, 2, 3, 4].map((i) => part(Sp(0.035, 6, 4), 0x111111, Math.sin((i / 5) * Math.PI * 2) * 0.28, -0.47, Math.cos((i / 5) * Math.PI * 2) * 0.28)),
      ],
      rough: 0.6,
    }],
  },
  armchair: {
    key: 'armchair', half: [0.46, 0.4, 0.42], mass: 26, material: 'fabric', breakDv: Infinity, shove: 0.35, friction: 0.8,
    layers: () => {
      const f = 0x7a3a2a;
      return [{
        parts: [
          part(B(0.92, 0.22, 0.84), f, 0, -0.18, 0),
          part(B(0.7, 0.14, 0.62), 0x8a4634, 0, 0.0, 0.06),
          part(B(0.92, 0.5, 0.18), f, 0, 0.15, -0.33),
          part(B(0.14, 0.32, 0.84), f, -0.39, 0.02, 0),
          part(B(0.14, 0.32, 0.84), f, 0.39, 0.02, 0),
          ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(Cy(0.03, 0.025, 0.1, 6), 0x2a1a10, sx * 0.4, -0.35, sz * 0.36)),
        ],
        rough: 0.95,
      }];
    },
  },
  coffeetable: {
    key: 'coffeetable', half: [0.6, 0.21, 0.36], mass: 16, material: 'glass', breakDv: 4.2, debris: [0xa8d0d8, 0xc8e0e8], remains: 'tableframe', shove: 0.6,
    layers: () => [
      { parts: [part(B(1.2, 0.03, 0.72), 0xa8d0d8, 0, 0.2, 0)], rough: 0.04, metal: 0.1, opacity: 0.45, noShadow: true },
      { parts: [...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(B(0.04, 0.4, 0.04), 0x1a1a1c, sx * 0.56, -0.01, sz * 0.32)), part(B(1.16, 0.03, 0.03), 0x1a1a1c, 0, 0.18, -0.33), part(B(1.16, 0.03, 0.03), 0x1a1a1c, 0, 0.18, 0.33)], rough: 0.4, metal: 0.7 },
    ],
  },
  tableframe: {
    key: 'tableframe', half: [0.6, 0.2, 0.36], mass: 7, material: 'metal', breakDv: Infinity, shove: 1,
    layers: () => [{ parts: [...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(B(0.04, 0.4, 0.04), 0x1a1a1c, sx * 0.56, 0, sz * 0.32)), part(B(1.16, 0.03, 0.03), 0x1a1a1c, 0, 0.19, -0.33), part(B(1.16, 0.03, 0.03), 0x1a1a1c, 0, 0.19, 0.33)], rough: 0.4, metal: 0.7 }],
  },
  sidetable: {
    key: 'sidetable', half: [0.25, 0.28, 0.25], mass: 5, material: 'wood', breakDv: 6, debris: [0x5a3a22, 0x3a2414], shove: 1.2,
    layers: () => [{ parts: [part(B(0.5, 0.04, 0.5), 0x5a3a22, 0, 0.26, 0), part(B(0.44, 0.04, 0.44), 0x5a3a22, 0, -0.1, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => part(B(0.04, 0.56, 0.04), 0x3a2414, sx * 0.21, 0, sz * 0.21))], rough: 0.6 }],
  },
  floorlamp: {
    key: 'floorlamp', half: [0.2, 0.82, 0.2], mass: 4, material: 'metal', breakDv: 7, debris: [0xfff0d0, 0x2a2a2a], shove: 1.5,
    layers: () => [
      { parts: [part(Cy(0.18, 0.2, 0.04, 16), 0x1a1a1c, 0, -0.8, 0), part(Cy(0.015, 0.015, 1.4, 8), 0x1a1a1c, 0, -0.1, 0)], rough: 0.4, metal: 0.7 },
      { parts: [part(Cy(0.12, 0.2, 0.28, 16, ), 0xfff0d8, 0, 0.66, 0)], rough: 0.9, emissive: 0xffd0a0, emissiveIntensity: 0.75, noShadow: true },
    ],
  },
  tv: {
    key: 'tv', half: [0.58, 0.36, 0.05], mass: 12, material: 'electronics', breakDv: 4.5, debris: [0x111111, 0x2a2a2e, 0x9ab0c0], shove: 0.8,
    layers: () => [
      { parts: [part(B(1.16, 0.7, 0.07), 0x0c0c0e), part(B(0.3, 0.02, 0.18), 0x0c0c0e, 0, -0.36, 0.0)], rough: 0.3, metal: 0.3 },
      { parts: [part(new THREE.PlaneGeometry(1.08, 0.62), 0xffffff, 0, 0.0, 0.0361)], rough: 0.2, map: staticTexture, emissive: 0x8aa0c0, emissiveIntensity: 0.9, noShadow: true },
    ],
  },
  monitor: {
    key: 'monitor', half: [0.28, 0.22, 0.1], mass: 5, material: 'electronics', breakDv: 4.5, debris: [0x111111, 0x2a2a2e, 0x9ab0c0], shove: 1.2,
    layers: () => [
      { parts: [part(B(0.56, 0.34, 0.04), 0x101012, 0, 0.05, 0), part(B(0.05, 0.12, 0.04), 0x2a2a2e, 0, -0.16, 0), part(B(0.24, 0.02, 0.18), 0x2a2a2e, 0, -0.21, 0)], rough: 0.35, metal: 0.3 },
      { parts: [part(new THREE.PlaneGeometry(0.5, 0.28), 0xffffff, 0, 0.05, 0.0205)], rough: 0.2, map: staticTexture, emissive: 0x60c0a0, emissiveIntensity: 0.8, noShadow: true },
    ],
  },
  vase: {
    key: 'vase', half: [0.12, 0.22, 0.12], cyl: true, mass: 2, material: 'ceramic', breakDv: 3.0, debris: [0x2a4a7a, 0xe8e0d0], shove: 2,
    layers: () => {
      const pts = [0.06, 0.1, 0.12, 0.115, 0.09, 0.055, 0.05, 0.065].map((r, i) => new THREE.Vector2(r, -0.22 + i * 0.063));
      return [{ parts: [part(new THREE.LatheGeometry(pts, 14), [0x2a4a7a, 0x8a2a1a, 0xd8c8a8][Math.floor(Math.random() * 3)])], rough: 0.25, metal: 0.05 }];
    },
  },
  plant: {
    key: 'plant', half: [0.2, 0.42, 0.2], cyl: true, mass: 8, material: 'ceramic', breakDv: 4.5, debris: [0xc86a3a, 0x3a2a1a, 0x2a6a2a], shove: 0.9,
    layers: () => {
      const leaves: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        leaves.push(part(B(0.08, 0.36, 0.02), i % 2 ? 0x2a6a2a : 0x3a7a32, Math.sin(a) * 0.08, 0.2, Math.cos(a) * 0.08, Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5));
      }
      return [{ parts: [part(Cy(0.2, 0.15, 0.4, 14), 0xc86a3a, 0, -0.22, 0), part(Cy(0.18, 0.18, 0.02, 14), 0x3a2a1a, 0, -0.03, 0), ...leaves], rough: 0.7 }];
    },
  },
  speaker: {
    key: 'speaker', half: [0.18, 0.4, 0.18], mass: 8, material: 'electronics', breakDv: 6, debris: [0x111111, 0x5a3a22], shove: 1,
    layers: () => [{ parts: [part(B(0.36, 0.8, 0.36), 0x141416), part(Cy(0.12, 0.12, 0.02, 16), 0x2a2a2e, 0, 0.15, 0.181, Math.PI / 2), part(Cy(0.06, 0.06, 0.02, 12), 0x2a2a2e, 0, -0.2, 0.181, Math.PI / 2)], rough: 0.7 }],
  },
  // ---------------------------------------------------------------- lab
  gascan: {
    key: 'gascan', half: [0.12, 0.6, 0.12], cyl: true, mass: 14, material: 'metal', breakDv: Infinity, shove: 1, restitution: 0.2,
    layers: () => [{ parts: [part(Cy(0.12, 0.12, 1.1, 14), [0x2a6a3a, 0x8a8e92, 0x2a3a8a][Math.floor(Math.random() * 3)], 0, -0.05, 0), part(Sp(0.12, 12, 6), 0x8a8e92, 0, 0.5, 0, 0, 0, 0, 1, 0.6, 1), part(Cy(0.03, 0.03, 0.08, 8), 0xb8a040, 0, 0.6, 0)], rough: 0.4, metal: 0.6 }],
  },
  cart: {
    key: 'cart', half: [0.42, 0.45, 0.28], mass: 14, material: 'metal', breakDv: Infinity, shove: 1.4, friction: 0.25,
    layers: () => [{
      parts: [
        ...[0.4, 0.0, -0.36].map((y) => part(B(0.84, 0.03, 0.56), 0xc8ccd0, 0, y, 0)),
        ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].flatMap(([sx, sz]) => [part(Cy(0.015, 0.015, 0.8, 6), 0xb0b4b8, sx * 0.4, 0.02, sz * 0.26), part(Sp(0.04, 6, 4), 0x1a1a1a, sx * 0.4, -0.41, sz * 0.26)]),
        part(B(0.5, 0.12, 0.3), 0x7a8a9a, 0.1, 0.48, 0),
      ],
      rough: 0.35, metal: 0.7,
    }],
  },
  beaker: {
    key: 'beaker', half: [0.05, 0.1, 0.05], cyl: true, mass: 0.3, material: 'glass', breakDv: 2.6, debris: [0xa8d8e0, 0x60ff90], shove: 3,
    layers: () => [
      { parts: [part(Cy(0.05, 0.05, 0.2, 12, ), 0xc0e0e8)], rough: 0.05, metal: 0.1, opacity: 0.45, noShadow: true },
      { parts: [part(Cy(0.045, 0.045, 0.1, 12), [0x40ff80, 0x40c0ff, 0xff60a0][Math.floor(Math.random() * 3)], 0, -0.045, 0)], rough: 0.2, emissive: 0x40ff80, emissiveIntensity: 0.6, noShadow: true },
    ],
  },
  canister: {
    key: 'canister', half: [0.17, 0.26, 0.17], cyl: true, mass: 6, material: 'plastic', breakDv: Infinity, shove: 1.6,
    layers: () => [{ parts: [part(Cy(0.17, 0.17, 0.5, 14), 0xe8c020, 0, -0.01, 0), part(Cy(0.06, 0.06, 0.04, 10), 0x2a2a2a, 0.07, 0.26, 0), part(B(0.2, 0.12, 0.01), 0x111111, 0, 0.05, 0.169)], rough: 0.5 }],
  },
};
