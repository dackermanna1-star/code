/**
 * Procedural alien ship designs. Every design is one BufferGeometry with per-vertex `color`
 * (hull albedo, or the emitted colour for lights) and `glow` (0 = hull, >0 = emissive), built
 * in ship space: forward -Z, up +Y, metres (= blocks).
 *
 *  - fighter  "Wraith"     ~15 m: knife-edge spindle hull, forward-swept crescent blades, twin fins,
 *                           cyan engine bells, a red sensor eye.
 *  - bomber   "Trident"    ~32 m: hexagonal spine, three forward prongs, engine block; its halo
 *                           ring is a separate mesh (spins).
 *  - destroyer "Leviathan" ~180 m: layered blade hull with a stepped dorsal citadel, spines, swept
 *                           fins, glowing seams and window rows, five-engine bank, keel cannon.
 *  - mothership "Harbinger" 1.1 km: terraced disc with radial ribs and spire forests on top,
 *                           concentric light rings, radial trenches and window bands below, an
 *                           inverted central spire; core orb and outer ring are separate meshes.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const HULL = 0x2a2e35;
const PANEL = 0x3a4049;
const DARK = 0x15171b;
const CHROME = 0x8c939c;
const CYAN = 0x45f4ff;
const TEAL = 0x2bffb4;
const RED = 0xff3a1c;

/** Accumulates primitive geometries with a colour, glow and transform. */
export class ShipBuilder {
  private parts: THREE.BufferGeometry[] = [];
  private c = new THREE.Color();

  add(geo: THREE.BufferGeometry, color: number, glow = 0, m?: THREE.Matrix4, jitter = 0, seed = 0): this {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const gl = new Float32Array(n);
    this.c.set(color);
    for (let i = 0; i < n; i++) {
      // per-triangle panel variation
      const tri = Math.floor(i / 3);
      const v = jitter ? 1 + (hash(tri + seed * 7919) - 0.5) * 2 * jitter : 1;
      col[i * 3] = this.c.r * v;
      col[i * 3 + 1] = this.c.g * v;
      col[i * 3 + 2] = this.c.b * v;
      gl[i] = glow;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(gl, 1));
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts)!;
    g.computeBoundingSphere();
    return g;
  }
}

function hash(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const M = () => new THREE.Matrix4();
const T = (x: number, y: number, z: number) => M().makeTranslation(x, y, z);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const flat = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  n.computeVertexNormals();
  return n;
};
/** Thin plate from a 2D outline in the XZ plane (x right, y = -z forward), thickness along Y. */
function plate(shape: THREE.Shape, thick: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 12 });
  g.translate(0, 0, -thick / 2);
  g.rotateX(Math.PI / 2); // shape y → -z
  return g;
}

// ------------------------------------------------------------------------------- fighter
export function fighterGeometry(): THREE.BufferGeometry {
  const b = new ShipBuilder();
  // spindle hull
  b.add(flat(new ConvexGeometry([v3(0, 0, -8.5), v3(0, 0.25, 6.2), v3(1.5, 0, -0.8), v3(-1.5, 0, -0.8), v3(0, 1.25, 0.6), v3(0, -0.85, 0.6), v3(0.9, 0.5, 4), v3(-0.9, 0.5, 4), v3(0.9, -0.4, 4), v3(-0.9, -0.4, 4)])), HULL, 0, undefined, 0.12, 1);
  // canopy ridge
  b.add(flat(new ConvexGeometry([v3(0, 1.0, -2.5), v3(0.45, 0.9, 0.5), v3(-0.45, 0.9, 0.5), v3(0, 1.45, 0.8), v3(0, 1.1, 2.6)])), DARK, 0);
  // crescent blades (forward swept)
  for (const s of [1, -1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0.9, 2.4);
    sh.quadraticCurveTo(5.0, 2.8, 9.6, 6.8); // trailing edge out to the tip (shape y = -z)
    sh.lineTo(10.2, 6.3);
    sh.quadraticCurveTo(6.0, 1.2, 1.0, -2.6); // leading edge back to the root
    sh.lineTo(0.9, 2.4);
    const wing = plate(sh, 0.32);
    // shape y is -z: forward swept means tips forward (negative z)
    wing.scale(s, 1, 1);
    const m = M().makeRotationZ(-s * 0.08).premultiply(T(0, -0.15, 0.6));
    b.add(flat(wing), PANEL, 0, m, 0.1, 2);
    // glowing leading-edge seam
    b.add(new THREE.BoxGeometry(0.12, 0.1, 5.5), CYAN, 0.9, M().makeRotationY(s * 0.62).premultiply(T(s * 4.6, -0.05, -2.3)));
    // wing-tip light
    b.add(new THREE.SphereGeometry(0.22, 8, 6), CYAN, 1.2, T(s * 9.9, -0.2, -6.5));
  }
  // twin canted fins
  for (const s of [1, -1]) {
    b.add(flat(new ConvexGeometry([v3(0, 0, 2.0), v3(0, 0, 5.4), v3(0, 2.4, 5.8), v3(0.12, 0, 3.6), v3(-0.12, 0, 3.6)])), PANEL, 0, M().makeRotationZ(-s * 0.35).premultiply(T(s * 0.9, 0.5, 0)));
  }
  // engines
  for (const s of [1, -1]) {
    b.add(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 12).rotateX(Math.PI / 2), DARK, 0, T(s * 0.85, 0.05, 5.6));
    b.add(new THREE.CircleGeometry(0.5, 12), CYAN, 1.6, T(s * 0.85, 0.05, 6.81));
  }
  // sensor eye
  b.add(new THREE.SphereGeometry(0.35, 10, 8), RED, 1.4, T(0, -0.35, -5.4));
  return b.build();
}

// ------------------------------------------------------------------------------- bomber
export function bomberGeometry(): THREE.BufferGeometry {
  const b = new ShipBuilder();
  b.add(new THREE.CylinderGeometry(1.6, 2.8, 26, 6).rotateX(Math.PI / 2), HULL, 0, T(0, 0, 0), 0.12, 3);
  b.add(new THREE.CylinderGeometry(0.01, 1.6, 6, 6).rotateX(-Math.PI / 2), PANEL, 0, T(0, 0, -16));
  // three forward prongs
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const ox = Math.cos(a) * 4.4, oy = Math.sin(a) * 4.4;
    b.add(flat(new ConvexGeometry([v3(ox * 0.5, oy * 0.5, -2), v3(ox * 1.1, oy * 1.1, -4), v3(ox, oy, -23), v3(ox * 0.8 + 0.6, oy * 0.8, -6), v3(ox * 0.8 - 0.6, oy * 0.8, -6)])), PANEL, 0, undefined, 0.1, 4 + i);
    b.add(new THREE.SphereGeometry(0.35, 8, 6), TEAL, 1.4, T(ox, oy, -22.6));
  }
  // engine block with three nozzles
  b.add(new THREE.BoxGeometry(7, 3.4, 5), DARK, 0, T(0, 0, 13));
  for (const x of [-2.2, 0, 2.2]) {
    b.add(new THREE.CylinderGeometry(0.9, 1.1, 1.4, 10).rotateX(Math.PI / 2), HULL, 0, T(x, 0, 16));
    b.add(new THREE.CircleGeometry(0.85, 10), TEAL, 1.6, T(x, 0, 16.71));
  }
  // belly light strip + ring mounts
  b.add(new THREE.BoxGeometry(0.3, 0.2, 18), TEAL, 1.0, T(0, -2.2, 0));
  for (const s of [1, -1]) b.add(new THREE.BoxGeometry(5, 0.6, 1.2), PANEL, 0, T(s * 3.5, 0, 2));
  return b.build();
}

/** The bomber's spinning halo ring (separate instanced mesh, spins about Z). */
export function bomberRingGeometry(): THREE.BufferGeometry {
  const b = new ShipBuilder();
  b.add(new THREE.TorusGeometry(7, 0.75, 8, 48), CHROME, 0, T(0, 0, 2), 0.15, 9);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add(new THREE.BoxGeometry(0.5, 0.5, 0.9), TEAL, 1.5, M().makeRotationZ(a).premultiply(T(0, 0, 2)).multiply(T(7.7, 0, 0)));
  }
  return b.build();
}

// ------------------------------------------------------------------------------- destroyer
export function destroyerGeometry(): THREE.BufferGeometry {
  const b = new ShipBuilder();
  // blade hull
  b.add(flat(new ConvexGeometry([v3(0, 0, -98), v3(0, 6, -60), v3(13, 0, 10), v3(-13, 0, 10), v3(15, -3, 60), v3(-15, -3, 60), v3(0, 12, 40), v3(0, -9, 30), v3(10, 6, 85), v3(-10, 6, 85), v3(10, -6, 85), v3(-10, -6, 85)])), HULL, 0, undefined, 0.14, 11);
  // stepped dorsal citadel
  for (let i = 0; i < 5; i++) {
    const w = 16 - i * 2.6, l = 60 - i * 9, h = 4.5;
    b.add(new THREE.BoxGeometry(w, h, l), i % 2 ? PANEL : HULL, 0, T(0, 8 + i * 3.6, 40 - i * 3), 0.12, 20 + i);
    // window rows on each tier
    for (const s of [1, -1]) for (let k = 0; k < 14; k++) b.add(new THREE.BoxGeometry(0.15, 0.6, 1.2), TEAL, 1.0, T(s * (w / 2 + 0.05), 8 + i * 3.6, 40 - i * 3 - l / 2 + 2 + k * ((l - 4) / 13)));
  }
  // dorsal spines
  for (let i = 0; i < 9; i++) {
    const z = -40 + i * 9;
    b.add(flat(new ConvexGeometry([v3(0, 4, z - 3), v3(0, 4, z + 4), v3(0, 14 + (i % 3) * 3, z + 3), v3(0.5, 4, z), v3(-0.5, 4, z)])), DARK, 0);
  }
  // swept fins
  for (const s of [1, -1]) {
    b.add(flat(new ConvexGeometry([v3(s * 12, 0, 10), v3(s * 12, 0, 60), v3(s * 38, -6, 70), v3(s * 36, -6, 58), v3(s * 12, 1.2, 35), v3(s * 12, -1.2, 35)])), PANEL, 0, undefined, 0.1, 30);
    b.add(new THREE.BoxGeometry(0.4, 0.4, 30), CYAN, 1.0, M().makeRotationY(s * -0.45).premultiply(T(s * 25, -3, 40)));
    // side seam
    b.add(new THREE.BoxGeometry(0.3, 0.5, 120), CYAN, 0.8, M().makeRotationY(s * 0.12).premultiply(T(s * 9.5, 0.5, 0)));
  }
  // engine bank
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 5.2, y = i % 2 ? 1 : -1.5;
    b.add(new THREE.CylinderGeometry(2.2, 2.7, 9, 14).rotateX(Math.PI / 2), DARK, 0, T(x, y, 88));
    b.add(new THREE.CircleGeometry(2.1, 14), CYAN, 1.8, T(x, y, 92.55));
  }
  // keel cannon
  b.add(new THREE.CylinderGeometry(1.4, 2.2, 70, 12).rotateX(Math.PI / 2), DARK, 0, T(0, -8, -20));
  b.add(new THREE.SphereGeometry(2.2, 12, 8), RED, 1.6, T(0, -8, -55));
  return b.build();
}

// ------------------------------------------------------------------------------- mothership
export const MOTHER_RADIUS = 560;

/** Terraced disc: [radius, height] profile from the top centre round the rim to the bottom centre. */
const MOTHER_PROFILE: [number, number][] = [
  [0, 132], [55, 130], [80, 112], [130, 108], [150, 92], [240, 86], [262, 70], [370, 62], [392, 46], [480, 40], [500, 26], [552, 18], [560, 8],
  [560, -4], [548, -14], [470, -24], [380, -30], [300, -40], [210, -52], [140, -66], [100, -84], [0, -90],
];

export interface MotherParts {
  hull: THREE.BufferGeometry;
  core: THREE.BufferGeometry;
  ring: THREE.BufferGeometry;
}

export function mothershipGeometry(): MotherParts {
  const rnd = mulberry(1979);
  const b = new ShipBuilder();
  // main disc (lathe, faceted)
  const pts = MOTHER_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)).reverse();
  const disc = flat(new THREE.LatheGeometry(pts, 96));
  b.add(disc, HULL, 0, undefined, 0.16, 41);
  const topAt = (r: number) => {
    for (let i = 0; i < 12; i++) {
      const [r0, y0] = MOTHER_PROFILE[i], [r1, y1] = MOTHER_PROFILE[i + 1];
      if (r >= r0 && r <= r1) return y0 + ((y1 - y0) * (r - r0)) / Math.max(1e-6, r1 - r0);
    }
    return 8;
  };
  const botAt = (r: number) => {
    const list = MOTHER_PROFILE.slice(13);
    for (let i = 0; i < list.length - 1; i++) {
      const [r0, y0] = list[i], [r1, y1] = list[i + 1];
      if (r <= r0 && r >= r1) return y0 + ((y1 - y0) * (r - r0)) / (r1 - r0);
    }
    return -90;
  };
  // radial ribs over the terraces
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r0 = 90 + (i % 2) * 40, r1 = 548;
    for (let r = r0; r < r1; r += 18) {
      const y = topAt(r + 9);
      const m = M().makeRotationY(-a).multiply(T(r + 9, y + 2.2, 0));
      b.add(new THREE.BoxGeometry(18, 4.4, 4.5), PANEL, 0, m, 0.1, 50 + i);
    }
  }
  // spire forests on the terraces
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 70 + Math.pow(rnd(), 0.7) * 470;
    const y = topAt(r);
    const h = 8 + Math.pow(rnd(), 2.2) * (r < 160 ? 90 : 45);
    const w = 3 + rnd() * 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (rnd() < 0.6) b.add(new THREE.BoxGeometry(w, h, w), rnd() < 0.5 ? HULL : PANEL, 0, T(x, y + h / 2, z), 0.12, 100 + i);
    else b.add(new THREE.CylinderGeometry(w * 0.2, w * 0.6, h, 6), DARK, 0, T(x, y + h / 2, z));
    if (rnd() < 0.5) b.add(new THREE.BoxGeometry(1.5, 1.5, 1.5), rnd() < 0.85 ? TEAL : RED, 1.4, T(x, y + h + 0.8, z));
  }
  // the crown spire
  b.add(new THREE.CylinderGeometry(4, 22, 160, 8), DARK, 0, T(0, 132 + 80, 0));
  b.add(new THREE.SphereGeometry(6, 12, 8), RED, 2, T(0, 132 + 162, 0));
  // underside: concentric light rings and radial trenches
  for (const r of [150, 240, 330, 420, 500]) {
    const y = botAt(r) - 0.6;
    const ring = new THREE.RingGeometry(r - 2.2, r + 2.2, 128, 1).rotateX(Math.PI / 2);
    b.add(ring, TEAL, 1.2, T(0, y, 0));
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (let r = 120; r < 540; r += 20) {
      const y = botAt(r + 10) - 0.6;
      b.add(new THREE.BoxGeometry(20, 1.2, 3.2), i % 4 === 0 ? RED : CYAN, i % 4 === 0 ? 0.9 : 0.6, M().makeRotationY(-a).multiply(T(r + 10, y, 0)));
    }
  }
  // rim window bands
  for (let i = 0; i < 900; i++) {
    const a = (i / 900) * Math.PI * 2;
    for (const y of [-1, 4]) {
      if (rnd() < 0.25) continue;
      b.add(new THREE.BoxGeometry(2.4, 1.2, 0.3), rnd() < 0.08 ? 0xffd27a : TEAL, 1.1, M().makeRotationY(-a + Math.PI / 2).premultiply(T(Math.cos(a) * 560.2, y, Math.sin(a) * 560.2)));
    }
  }
  // underside greebles: hanging structures, pods and machinery
  for (let i = 0; i < 520; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 110 + Math.sqrt(rnd()) * 430;
    const y = botAt(r);
    const w = 5 + rnd() * 26, l = 5 + rnd() * 30, h = 2 + rnd() * 9;
    const m = M().makeRotationY(-a + (rnd() < 0.5 ? 0 : Math.PI / 2)).premultiply(T(Math.cos(a) * r, y - h / 2 + 0.5, Math.sin(a) * r));
    b.add(new THREE.BoxGeometry(w, h, l), rnd() < 0.5 ? PANEL : DARK, 0, m, 0.12, 500 + i);
    if (rnd() < 0.35) b.add(new THREE.BoxGeometry(w * 0.7, 0.4, 0.6), rnd() < 0.8 ? TEAL : 0xffd27a, 1.0, M().makeTranslation(0, -h / 2 - 0.1, l / 2 - 0.5).premultiply(m));
  }
  // city lights: thousands of small lit windows across the underside
  for (let i = 0; i < 1600; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 100 + Math.sqrt(rnd()) * 450;
    const y = botAt(r) - 0.3;
    b.add(new THREE.BoxGeometry(1.6, 0.3, 1.6), rnd() < 0.7 ? 0xffe2a8 : TEAL, 0.9 + rnd() * 0.6, T(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  // hangar bays: dark mouths framed in light
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = 300;
    const y = botAt(r);
    const m = M().makeRotationY(-a).premultiply(T(Math.cos(a) * r, y - 1, Math.sin(a) * r));
    b.add(new THREE.BoxGeometry(46, 6, 24), 0x050607, 0, m);
    b.add(new THREE.BoxGeometry(48, 0.8, 1.2), CYAN, 1.4, M().makeTranslation(0, -3.2, 12.5).premultiply(m));
    b.add(new THREE.BoxGeometry(48, 0.8, 1.2), CYAN, 1.4, M().makeTranslation(0, -3.2, -12.5).premultiply(m));
  }
  // underside petals around the core
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = M().makeRotationY(-a);
    b.add(flat(new ConvexGeometry([v3(70, -80, -20), v3(70, -80, 20), v3(190, -48, -46), v3(190, -48, 46), v3(150, -70, 0), v3(110, -62, 0)])), PANEL, 0, m, 0.1, 200 + i);
  }
  // inverted central spire
  b.add(new THREE.CylinderGeometry(95, 8, 150, 12), DARK, 0, T(0, -90 - 75, 0), 0.08, 300);
  for (const [y, r] of [[-115, 77], [-150, 54], [-185, 31]]) b.add(new THREE.TorusGeometry(r, 1.4, 6, 48).rotateX(Math.PI / 2), TEAL, 1.4, T(0, y, 0));
  // core orb (weapon) — separate so it can charge
  const cb = new ShipBuilder();
  cb.add(new THREE.SphereGeometry(26, 32, 20), 0x9effc8, 1.0, T(0, -236, 0));
  // outer rotating ring: segmented band beyond the rim
  const rb = new ShipBuilder();
  for (let i = 0; i < 36; i++) {
    const a0 = (i / 36) * Math.PI * 2;
    const seg = new THREE.CylinderGeometry(600, 600, 14, 6, 1, true, a0, (Math.PI * 2) / 36 * 0.82);
    rb.add(seg, CHROME, 0, T(0, 4, 0), 0.08, 400 + i);
    rb.add(new THREE.CylinderGeometry(601, 601, 1.5, 6, 1, true, a0, (Math.PI * 2) / 36 * 0.82), TEAL, 1.2, T(0, 4, 0));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rb.add(new THREE.BoxGeometry(46, 4, 6), DARK, 0, M().makeRotationY(-a).multiply(T(580, 4, 0)));
  }
  return { hull: b.build(), core: cb.build(), ring: rb.build() };
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
