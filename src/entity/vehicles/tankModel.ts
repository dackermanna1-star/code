/**
 * Procedural M1A2 Abrams model (metres, body frame: origin on the ground under the hull centre,
 * forward = -Z, right = +X, up = +Y). G-buffer PBR via `createEntityMaterial` with per-vertex
 * colours, merged per moving part (~30 draw calls), casts shadows like any entity model.
 *
 *  - hull: faceted lower/upper hull with the very shallow upper glacis, sponsons/fenders,
 *    7-panel armoured side skirts (heavier front panels, bolt rows), engine deck grilles, the
 *    big rear exhaust grille, head / tail lights, driver's hatch with periscopes, tow hooks
 *  - running gear: 7 dual road wheels per side on animated torsion-bar travel, front idlers,
 *    toothed rear drive sprockets; articulated track links (CPU-posed every frame) that wrap
 *    the wheels, follow the suspension and roll with the track travel
 *  - turret (rotates): the angular composite-armour turret (sloped cheeks and sides), gun
 *    mantlet, gunner's primary sight, CITV, commander's cupola with M2 .50 cal, loader's hatch
 *    with M240, smoke grenade launchers, bustle rack with stowed gear, blowout panels, crosswind
 *    sensor and antennas, a crew figure in the cupola when crewed
 *  - gun (elevates, recoils): M256 120 mm with segmented thermal shroud, bore evacuator,
 *    muzzle reference sensor
 * Desert tan CARC paint with panel-to-panel tone variation; dark rubber and steel tracks.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { createEntityMaterial, setEntityLight } from '../../render/entityMaterial';
import { CONTACTS, TANK } from './tankPhysics';

// ---------------------------------------------------------------------------------- palette
/** Track shoe thickness under the road wheels (the physics contact is the track's ground face). */
const SHOE = 0.07;

const C = {
  tan: 0xc4ae84,
  tanDark: 0xa99470,
  tanLight: 0xd2c19c,
  rubber: 0x252422,
  steel: 0x46433e,
  steelLight: 0x77736b,
  dark: 0x1d1c1a,
  glass: 0x0b1316,
  olive: 0x5d5b3c,
  canvas: 0x8b7e5b,
  black: 0x141414,
  uniform: 0x8f8466,
  helmet: 0x4c4b33,
  skin: 0xc49a76,
};

const col = (hex: number) => new THREE.Color(hex);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Non-indexed copy with a flat vertex colour (and optional transform). */
function prep(g: THREE.BufferGeometry, color: number | THREE.Color, m?: THREE.Matrix4): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  if (m) geo.applyMatrix4(m);
  for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = color instanceof THREE.Color ? color : col(color);
  const ca = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  geo.clearGroups();
  g.dispose();
  return geo;
}

class Bucket {
  readonly parts: THREE.BufferGeometry[] = [];
  add(g: THREE.BufferGeometry, color: number | THREE.Color, m?: THREE.Matrix4) {
    this.parts.push(prep(g, color, m));
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const T = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const TR = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), V(1, 1, 1));

/** Axis-aligned box from min/max corners. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
/** Convex solid from points (flat faceted armour). */
function convex(pts: THREE.Vector3[]) {
  return new ConvexGeometry(pts);
}
/** Side profile [z, y][] extruded across x0..x1 as a convex prism. */
function prism(profile: [number, number][], x0: number, x1: number) {
  const pts: THREE.Vector3[] = [];
  for (const [z, y] of profile) pts.push(V(x0, y, z), V(x1, y, z));
  return convex(pts);
}
/** Cylinder along X (wheels) centred at (x, y, z). */
function cylX(r: number, len: number, x: number, y: number, z: number, seg = 20) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}
/** Cylinder along Z (gun parts) from z0 to z1. */
function cylZ(r0: number, r1: number, z0: number, z1: number, seg = 16, y = 0, x = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, Math.abs(z1 - z0), seg, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, (z0 + z1) / 2);
  return g;
}
/** Cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 8) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1)));
  return g;
}

/** Small deterministic tone jitter so armour panels read as separate plates. */
function tone(base: number, k: number, amount = 0.05) {
  const c = col(base);
  const h = Math.sin(k * 12.9898) * 43758.5453;
  const f = 1 + (h - Math.floor(h) - 0.5) * 2 * amount;
  return c.multiplyScalar(f);
}

// ---------------------------------------------------------------------------------- geometry
interface TankGeometry {
  hull: THREE.BufferGeometry;
  hullDark: THREE.BufferGeometry;
  hullGlass: THREE.BufferGeometry;
  lights: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
  turret: THREE.BufferGeometry;
  turretDark: THREE.BufferGeometry;
  turretGlass: THREE.BufferGeometry;
  crew: THREE.BufferGeometry;
  gun: THREE.BufferGeometry;
  roadWheel: THREE.BufferGeometry;
  idler: THREE.BufferGeometry;
  sprocket: THREE.BufferGeometry;
  link: THREE.BufferGeometry;
}

let GEO: TankGeometry | null = null;

function buildGeometry(): TankGeometry {
  const hull = new Bucket(), hullDark = new Bucket(), hullGlass = new Bucket(), lights = new Bucket(), tail = new Bucket();
  const W = TANK.halfWidth;
  // ---- main hull between the tracks
  hull.add(prism([[-3.45, 0.5], [-3.95, 1.02], [-2.15, 1.6], [3.55, 1.62], [3.95, 1.48], [3.95, 0.62], [3.5, 0.48]], -1.26, 1.26), C.tan);
  // sponsons / fenders over the tracks
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -W : 1.26, x1 = s < 0 ? -1.26 : W;
    hull.add(prism([[-3.82, 1.2], [-3.82, 1.3], [-2.45, 1.5], [3.9, 1.5], [3.92, 1.2]], x0, x1), tone(C.tan, s * 3));
    // fender lip at the front (mud guard)
    hull.add(box(x0, 1.12, -3.86, x1, 1.22, -3.6), C.tanDark);
  }
  // ---- side skirts: 7 panels per side, the first three heavier
  const skirt0 = -3.72, skirt1 = 2.95, panels = 7;
  const pl = (skirt1 - skirt0) / panels;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      const z0 = skirt0 + i * pl + 0.008, z1 = skirt0 + (i + 1) * pl - 0.008;
      const thick = i < 3 ? 0.11 : 0.06;
      const xo = s * W, xi = s * (W - thick);
      const bottom = i === 0 ? 0.66 : 0.44;
      const pts: THREE.Vector3[] = [];
      for (const x of [xo, xi]) {
        pts.push(V(x, 1.22, z0), V(x, 1.22, z1), V(x, bottom, z1));
        pts.push(V(x, i === 0 ? 0.98 : bottom, z0));
        if (i === 0) pts.push(V(x, 0.72, z0 + 0.35));
      }
      hull.add(convex(pts), tone(C.tan, i * 7 + s));
      // bolt row
      for (let b = 0; b < 4; b++) hull.add(cylX(0.016, 0.02, xo + s * 0.01, 1.14, z0 + 0.12 + (b * (z1 - z0 - 0.24)) / 3, 6), C.tanDark);
    }
  }
  // ---- driver's hatch + periscopes on the glacis
  hull.add(new THREE.CylinderGeometry(0.33, 0.35, 0.05, 18).translate(0, 1.6, -2.5), C.tanDark, TR(0, 0, 0, 0.0, 0, 0));
  for (const dx of [-0.22, 0, 0.22]) hullGlass.add(box(dx - 0.08, 1.6, -2.86, dx + 0.08, 1.67, -2.8), C.glass);
  // ---- engine deck grilles and access panels
  for (let i = 0; i < 9; i++) hullDark.add(box(-0.95, 1.62, 1.05 + i * 0.26, 0.95, 1.635, 1.2 + i * 0.26), C.dark);
  for (const x of [-1.0, 1.0]) hullDark.add(box(x - 0.01, 1.62, 0.6, x + 0.01, 1.63, 3.5), C.dark);
  hullDark.add(box(-1.0, 1.62, 0.6, 1.0, 1.63, 0.62), C.dark);
  // ---- rear: exhaust grille (slats), tail lights, tow pintle
  hullDark.add(box(-0.98, 0.72, 3.95, 0.98, 1.38, 3.98), C.dark);
  for (let i = 0; i < 7; i++) hull.add(box(-0.96, 0.76 + i * 0.09, 3.97, 0.96, 0.79 + i * 0.09, 4.02), tone(C.tanDark, i), TR(0, 0, 0));
  for (const s of [-1, 1]) {
    tail.add(box(s * 1.45 - 0.09, 1.3, 3.9, s * 1.45 + 0.09, 1.42, 3.96), 0xff2a18);
    hull.add(box(s * 1.45 - 0.13, 1.27, 3.86, s * 1.45 + 0.13, 1.45, 3.9), C.tanDark);
  }
  hullDark.add(box(-0.1, 0.55, 3.95, 0.1, 0.68, 4.15), C.steel);
  // ---- front: headlight clusters on the fenders, tow hooks
  for (const s of [-1, 1]) {
    hull.add(box(s * 1.55 - 0.16, 1.28, -3.86, s * 1.55 + 0.16, 1.45, -3.66), C.tanDark);
    lights.add(box(s * 1.55 - 0.12, 1.31, -3.89, s * 1.55 - 0.01, 1.42, -3.86), 0xfff3d6);
    lights.add(box(s * 1.55 + 0.02, 1.31, -3.89, s * 1.55 + 0.12, 1.42, -3.86), 0xffd9a0);
    hullDark.add(new THREE.TorusGeometry(0.07, 0.022, 6, 12), C.steel, TR(s * 0.75, 0.62, -3.6, 0, Math.PI / 2, 0));
  }
  // lower hull belly plate (dark, visible from low angles)
  hullDark.add(box(-1.24, 0.48, -3.4, 1.24, 0.5, 3.45), C.dark);

  // ---- turret (frame: ring centre on the deck)
  const turret = new Bucket(), turretDark = new Bucket(), turretGlass = new Bucket(), crew = new Bucket();
  const bot: [number, number][] = [[0.4, -2.55], [1.62, -1.92], [1.86, -1.2], [1.86, 1.15], [1.62, 2.3], [0.9, 2.42]];
  const top: [number, number][] = [[0.45, -2.35], [1.5, -1.78], [1.75, -1.15], [1.75, 1.1], [1.52, 2.2], [0.85, 2.3]];
  const tp: THREE.Vector3[] = [];
  for (const [x, z] of bot) tp.push(V(x, 0.03, z), V(-x, 0.03, z));
  for (const [x, z] of top) tp.push(V(x, 0.82, z), V(-x, 0.82, z));
  turret.add(convex(tp), C.tan);
  // turret ring collar
  turretDark.add(new THREE.CylinderGeometry(1.12, 1.15, 0.06, 32).translate(0, 0.01, 0), C.dark);
  // gun mantlet (recessed shield between the cheeks)
  turretDark.add(box(-0.4, 0.12, -2.66, 0.4, 0.7, -2.42), C.dark);
  turret.add(box(-0.47, 0.08, -2.62, -0.4, 0.74, -2.38), C.tanDark);
  turret.add(box(0.4, 0.08, -2.62, 0.47, 0.74, -2.38), C.tanDark);
  // gunner's primary sight (right front) with armoured doors
  turret.add(box(0.52, 0.82, -1.98, 1.02, 1.16, -1.42), tone(C.tan, 11));
  turretGlass.add(box(0.58, 0.88, -2.0, 0.96, 1.08, -1.97), C.glass);
  turret.add(box(0.5, 1.1, -2.02, 1.04, 1.13, -1.95), C.tanDark);
  // CITV (left front, commander's independent thermal viewer)
  turret.add(new THREE.CylinderGeometry(0.19, 0.21, 0.1, 16).translate(-0.7, 0.87, -1.3), C.tanDark);
  turret.add(box(-0.93, 0.92, -1.5, -0.47, 1.3, -1.1), tone(C.tan, 13));
  turretGlass.add(box(-0.88, 0.98, -1.52, -0.52, 1.24, -1.49), C.glass);
  // commander's cupola (right rear) with vision blocks and M2 .50 cal
  turret.add(new THREE.CylinderGeometry(0.47, 0.5, 0.2, 24).translate(0.72, 0.92, 0.55), tone(C.tan, 17));
  turret.add(new THREE.CylinderGeometry(0.4, 0.42, 0.06, 20).translate(0.72, 1.05, 0.62), C.tanDark);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.45;
    const x = 0.72 + Math.cos(a) * 0.47, z = 0.55 + Math.sin(a) * 0.47;
    turretGlass.add(box(-0.07, -0.04, -0.02, 0.07, 0.04, 0.02), C.glass, TR(x, 0.95, z, 0, -a + Math.PI / 2, 0));
  }
  turretDark.add(box(0.63, 1.04, -0.05, 0.77, 1.18, 0.38), C.dark); // receiver
  turretDark.add(rod(V(0.7, 1.12, -0.05), V(0.7, 1.12, -1.15), 0.025), C.dark); // barrel
  turretDark.add(rod(V(0.7, 1.12, -0.6), V(0.7, 1.12, -0.85), 0.04), C.dark); // jacket
  turretDark.add(rod(V(0.7, 0.98, 0.15), V(0.7, 1.06, 0.15), 0.03), C.steel); // pintle
  // loader's hatch (left) with M240 on a skate mount
  turret.add(new THREE.CylinderGeometry(0.41, 0.43, 0.06, 20).translate(-0.75, 0.85, 0.5), C.tanDark);
  turretDark.add(box(-1.15, 0.88, 0.05, -1.05, 0.98, 0.35), C.dark);
  turretDark.add(rod(V(-1.1, 0.94, 0.05), V(-1.1, 0.94, -0.65), 0.018), C.dark);
  // smoke grenade launchers (2 banks of 6)
  for (const s of [-1, 1]) {
    turret.add(box(s * 1.62, 0.45, -1.5, s * 1.84, 0.62, -1.05), C.tanDark);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const g = new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8);
      g.rotateX(-Math.PI / 2 - 0.45);
      g.rotateY(s * 0.35);
      g.translate(s * (1.68 + c * 0.05), 0.68 + r * 0.1, -1.42 + c * 0.14);
      turretDark.add(g, C.olive);
    }
  }
  // turret side stowage boxes
  for (const s of [-1, 1]) turret.add(box(s * 1.74, 0.18, 0.2, s * 1.92, 0.62, 1.5), tone(C.tan, 21 + s));
  // blowout panels on the bustle roof
  for (const s of [-1, 1]) {
    turret.add(box(s * 0.15, 0.82, 1.2, s * 0.98, 0.84, 2.05), tone(C.tan, 23 + s, 0.08));
    turretDark.add(box(s * 0.15 - 0.005, 0.82, 1.19, s * 0.98 + 0.005, 0.825, 2.06), C.dark);
  }
  // bustle rack with stowed gear
  const rack = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => turretDark.add(box(x0, y0, z0, x1, y1, z1), C.steel);
  for (const y of [0.1, 0.72]) {
    rack(-1.55, y, 3.02, 1.55, y + 0.04, 3.06);
    for (const s of [-1, 1]) rack(s * 1.55 - 0.02, y, 2.25, s * 1.55 + 0.02, y + 0.04, 3.06);
  }
  for (let i = 0; i <= 6; i++) rack(-1.55 + i * 0.516 - 0.02, 0.1, 3.02, -1.55 + i * 0.516 + 0.02, 0.76, 3.06);
  for (const s of [-1, 1]) rack(s * 1.55 - 0.02, 0.1, 2.62, s * 1.55 + 0.02, 0.76, 2.66);
  turret.add(box(-1.4, 0.1, 2.35, -0.5, 0.55, 2.95), col(C.olive));
  turret.add(box(-0.4, 0.1, 2.4, 0.4, 0.42, 2.98), col(C.canvas));
  turret.add(new THREE.CapsuleGeometry(0.2, 0.8, 4, 10).rotateZ(Math.PI / 2).translate(0.95, 0.42, 2.7), col(C.canvas).multiplyScalar(0.9));
  turret.add(box(0.5, 0.1, 2.35, 1.4, 0.3, 2.95), col(C.olive).multiplyScalar(0.85));
  // crosswind sensor mast and antennas
  turretDark.add(rod(V(0, 0.82, 1.95), V(0, 1.55, 1.95), 0.02), C.dark);
  turretDark.add(rod(V(-0.12, 1.55, 1.95), V(0.12, 1.55, 1.95), 0.012), C.dark);
  for (const s of [-1, 1]) {
    turretDark.add(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10).translate(s * 1.28, 0.88, 2.0), C.dark);
    turretDark.add(rod(V(s * 1.28, 0.9, 2.0), V(s * 1.33, 3.1, 2.15), 0.008, 5), C.black);
  }
  // crew: commander standing in the cupola (CVC helmet)
  crew.add(new THREE.CapsuleGeometry(0.21, 0.34, 4, 10).translate(0.72, 1.18, 0.58), C.uniform);
  crew.add(new THREE.SphereGeometry(0.15, 12, 10).translate(0.72, 1.56, 0.56), C.skin);
  crew.add(new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).translate(0.72, 1.6, 0.57), C.helmet);
  crew.add(box(0.62, 1.53, 0.42, 0.82, 1.58, 0.44), C.dark); // goggles strap

  // ---- gun (frame: trunnion; barrel along -Z)
  const gun = new Bucket();
  gun.add(cylZ(0.24, 0.22, 0.5, -0.55, 18), C.tanDark);
  const shroudSegs = 6;
  for (let i = 0; i < shroudSegs; i++) {
    const z0 = -0.55 - i * 0.66, z1 = z0 - 0.64;
    gun.add(cylZ(0.14 - i * 0.004, 0.137 - i * 0.004, z0, z1, 10), tone(C.tan, 31 + i, 0.06));
    gun.add(cylZ(0.15 - i * 0.004, 0.15 - i * 0.004, z1 + 0.025, z1 - 0.005, 10), C.tanDark);
  }
  gun.add(cylZ(0.15, 0.185, -2.35, -2.5, 16), C.tanDark);
  gun.add(cylZ(0.185, 0.185, -2.5, -2.95, 16), tone(C.tan, 41));
  gun.add(cylZ(0.185, 0.14, -2.95, -3.1, 16), C.tanDark);
  gun.add(cylZ(0.13, 0.125, -4.52, -TANK.barrelLength, 14), C.dark);
  gun.add(box(-0.05, 0.12, -4.9, 0.05, 0.2, -4.76), C.dark); // muzzle reference sensor

  // ---- running gear
  const wheel = (r: number, hubCol: number) => {
    const b = new Bucket();
    for (const dx of [-0.15, 0.15]) {
      b.add(cylX(r, 0.19, dx, 0, 0, 22), C.rubber);
      b.add(cylX(r * 0.8, 0.2, dx, 0, 0, 18), tone(hubCol, dx * 10));
      b.add(cylX(r * 0.25, 0.22, dx, 0, 0, 10), C.steel);
    }
    b.add(cylX(r * 0.3, 0.12, 0, 0, 0, 12), C.dark);
    return b.build();
  };
  const sprocket = new Bucket();
  for (const dx of [-0.17, 0.17]) {
    sprocket.add(cylX(0.29, 0.06, dx, 0, 0, 22), C.steel);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      sprocket.add(box(-0.03, -0.045, -0.05, 0.03, 0.045, 0.05), C.steelLight, TR(dx, Math.sin(a) * 0.3, Math.cos(a) * 0.3, a, 0, 0));
    }
  }
  sprocket.add(cylX(0.22, 0.3, 0, 0, 0, 18), C.tanDark);
  sprocket.add(cylX(0.1, 0.4, 0, 0, 0, 10), C.dark);
  // track link (x across the track, y outward from the wheels, z along the run)
  const link = new Bucket();
  const tw = TANK.trackWidth;
  link.add(box(-tw / 2 + 0.04, 0, -0.085, tw / 2 - 0.04, 0.05, 0.085), C.rubber); // rubber pad
  link.add(box(-tw / 2 + 0.06, 0.05, -0.04, tw / 2 - 0.06, 0.07, 0.04), C.steel); // grouser
  for (const s of [-1, 1]) link.add(box(s * tw / 2 - 0.05, -0.01, -0.095, s * tw / 2 + 0.01, 0.045, 0.095), C.steelLight); // end connectors
  link.add(box(-0.03, -0.11, -0.04, 0.03, 0, 0.04), C.steel); // centre guide horn
  return {
    hull: hull.build(), hullDark: hullDark.build(), hullGlass: hullGlass.build(), lights: lights.build(), tail: tail.build(),
    turret: turret.build(), turretDark: turretDark.build(), turretGlass: turretGlass.build(), crew: crew.build(), gun: gun.build(),
    roadWheel: wheel(TANK.wheelR, C.tan), idler: wheel(0.33, C.tanDark), sprocket: sprocket.build(), link: link.build(),
  };
}

// ---------------------------------------------------------------------------------- tracks
/** One side's track: link poses rebuilt along the wheel path every frame (CPU skinning). */
class TrackMesh {
  readonly mesh: THREE.Mesh;
  private readonly base: { pos: Float32Array; nor: Float32Array; col: Float32Array };
  private readonly n: number;
  private readonly pos: THREE.BufferAttribute;
  private readonly nor: THREE.BufferAttribute;
  private readonly path: number[] = [];
  private readonly cum: number[] = [];
  readonly pitch = 0.19;

  constructor(link: THREE.BufferGeometry, mat: THREE.Material, readonly x: number) {
    const p = link.attributes.position.array as Float32Array;
    const nn = link.attributes.normal.array as Float32Array;
    const c = link.attributes.color.array as Float32Array;
    this.base = { pos: p, nor: nn, col: c };
    // links around the loop (perimeter ≈ 2 × run + wheel arcs)
    this.n = 92;
    const vpl = p.length / 3;
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(vpl * this.n * 3), 3);
    this.nor = new THREE.BufferAttribute(new Float32Array(vpl * this.n * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nor.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(vpl * this.n * 3);
    for (let k = 0; k < this.n; k++) colors.set(c, k * vpl * 3);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nor);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vpl * this.n * 2), 2));
    geo.boundingSphere = new THREE.Sphere(V(x, 0.7, 0), 4.6);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** Closed path (z, y) around sprocket → top run → idler → road wheels. */
  private buildPath(wheelY: number[]) {
    const P = this.path;
    P.length = 0;
    const R = 0.335;
    const arc = (cz: number, cy: number, r: number, a0: number, a1: number, steps: number) => {
      for (let i = 0; i <= steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        P.push(cz + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    };
    // top run from the sprocket (rear, +z) to the idler (front, -z), slight sag between rollers
    const sZ = TANK.sprocketZ, sY = TANK.sprocketY, iZ = TANK.idlerZ, iY = TANK.idlerY;
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const z = sZ + (iZ - sZ) * t;
      const y = sY + R + (iY - sY) * t - Math.sin(t * Math.PI * 3) ** 2 * 0.025;
      P.push(z, y);
    }
    // around the idler front (top → front → down-back)
    arc(iZ, iY, R, Math.PI / 2, Math.PI * 1.32, 8);
    // bottom run under the road wheels, front to rear
    const wz = TANK.wheelZ;
    for (let i = 0; i < wz.length; i++) {
      const y = wheelY[i] - TANK.wheelR;
      P.push(wz[i] - 0.18, y + 0.012, wz[i], y, wz[i] + 0.18, y + 0.012);
    }
    // up around the sprocket (rear-bottom → back → top)
    arc(sZ, sY, R, -Math.PI * 0.62, Math.PI / 2, 10);
    const cum = this.cum;
    cum.length = 0;
    let L = 0;
    cum.push(0);
    for (let i = 2; i < P.length; i += 2) {
      L += Math.hypot(P[i] - P[i - 2], P[i + 1] - P[i - 1]);
      cum.push(L);
    }
    // closing segment
    L += Math.hypot(P[0] - P[P.length - 2], P[1] - P[P.length - 1]);
    return L;
  }

  update(wheelY: number[], travel: number) {
    const L = this.buildPath(wheelY);
    const P = this.path, cum = this.cum;
    const nPts = P.length / 2;
    const { pos: bp, nor: bn } = this.base;
    const vpl = bp.length / 3;
    const out = this.pos.array as Float32Array, onr = this.nor.array as Float32Array;
    // loop centroid (to orient link normals outward)
    let cz = 0, cy = 0;
    for (let i = 0; i < nPts; i++) { cz += P[i * 2]; cy += P[i * 2 + 1]; }
    cz /= nPts; cy /= nPts;
    const step = L / this.n;
    let seg = 0;
    const off = ((travel % step) + step) % step;
    for (let k = 0; k < this.n; k++) {
      const s = k * step + off;
      while (seg < nPts - 1 && cum[seg + 1] < s) seg++;
      let z0: number, y0: number, z1: number, y1: number, segLen: number, s0: number;
      if (seg >= nPts - 1) {
        z0 = P[(nPts - 1) * 2]; y0 = P[(nPts - 1) * 2 + 1]; z1 = P[0]; y1 = P[1];
        s0 = cum[nPts - 1];
        segLen = L - s0;
      } else {
        z0 = P[seg * 2]; y0 = P[seg * 2 + 1]; z1 = P[seg * 2 + 2]; y1 = P[seg * 2 + 3];
        s0 = cum[seg];
        segLen = cum[seg + 1] - s0;
      }
      const t = segLen > 1e-6 ? (s - s0) / segLen : 0;
      const z = z0 + (z1 - z0) * t, y = y0 + (y1 - y0) * t;
      let tz = z1 - z0, ty = y1 - y0;
      const tl = Math.hypot(tz, ty) || 1;
      tz /= tl; ty /= tl;
      // outward normal in the (z, y) plane
      let nz = -ty, ny = tz;
      if (nz * (z - cz) + ny * (y - cy) < 0) { nz = -nz; ny = -ny; }
      // basis: X = (1,0,0), Y = (0, ny, nz), Z = (0, ty, tz)
      const o = k * vpl * 3;
      for (let v = 0; v < vpl; v++) {
        const lx = bp[v * 3], ly = bp[v * 3 + 1], lz = bp[v * 3 + 2];
        out[o + v * 3] = this.x + lx;
        out[o + v * 3 + 1] = y + ny * ly + ty * lz;
        out[o + v * 3 + 2] = z + nz * ly + tz * lz;
        const nx = bn[v * 3], nyy = bn[v * 3 + 1], nzz = bn[v * 3 + 2];
        onr[o + v * 3] = nx;
        onr[o + v * 3 + 1] = ny * nyy + ty * nzz;
        onr[o + v * 3 + 2] = nz * nyy + tz * nzz;
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

// ---------------------------------------------------------------------------------- visual
export interface TankVisualState {
  /** Interpolated hull origin (ground under the centre) and attitude. */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  turretYaw: number;
  gun: number;
  /** Barrel recoil travel (m). */
  recoil: number;
  /** Per contact compression (CONTACTS order). */
  compression: ArrayLike<number>;
  trackL: number;
  trackR: number;
  light: number;
  hurt: number;
  engine: number;
  crewed: boolean;
  /** Hide the commander (first-person sight view). */
  hideCrew: boolean;
  destroyed: boolean;
  camDist: number;
  time: number;
}

type Mat = THREE.RawShaderMaterial;

export class TankVisual {
  readonly root = new THREE.Group();
  readonly turret = new THREE.Group();
  readonly gunPivot = new THREE.Group();
  readonly barrel = new THREE.Group();
  private readonly mats: Mat[] = [];
  private readonly paintMats: Mat[] = [];
  private readonly lightMat: Mat;
  private readonly tailMat: Mat;
  private readonly wheels: THREE.Mesh[] = [];
  private readonly tracks: TrackMesh[] = [];
  private readonly crew: THREE.Mesh;
  private readonly wheelY: number[][] = [[], []];
  private wasDestroyed = false;

  constructor() {
    GEO ??= buildGeometry();
    const G = GEO;
    const mk = (o: Parameters<typeof createEntityMaterial>[0], paint = false) => {
      const m = createEntityMaterial(o);
      this.mats.push(m);
      if (paint) this.paintMats.push(m);
      return m;
    };
    const paint = mk({ vertexColors: true, roughness: 0.78, metalness: 0.02 }, true);
    const dark = mk({ vertexColors: true, roughness: 0.6, metalness: 0.55 }, true);
    const glass = mk({ vertexColors: true, roughness: 0.06, metalness: 0.3 });
    const gear = mk({ vertexColors: true, roughness: 0.72, metalness: 0.25 }, true);
    const track = mk({ vertexColors: true, roughness: 0.68, metalness: 0.45 }, true);
    const crewMat = mk({ vertexColors: true, roughness: 0.85 });
    this.lightMat = mk({ vertexColors: true, roughness: 0.2, emissive: 0 });
    this.tailMat = mk({ vertexColors: true, roughness: 0.2, emissive: 0 });
    const mesh = (g: THREE.BufferGeometry, m: Mat, parent: THREE.Object3D) => {
      const o = new THREE.Mesh(g, m);
      parent.add(o);
      return o;
    };
    mesh(G.hull, paint, this.root);
    mesh(G.hullDark, dark, this.root);
    mesh(G.hullGlass, glass, this.root);
    mesh(G.lights, this.lightMat, this.root);
    mesh(G.tail, this.tailMat, this.root);
    // turret / gun hierarchy
    this.turret.position.copy(TANK.turretPos);
    this.root.add(this.turret);
    mesh(G.turret, paint, this.turret);
    mesh(G.turretDark, dark, this.turret);
    mesh(G.turretGlass, glass, this.turret);
    this.crew = mesh(G.crew, crewMat, this.turret);
    this.gunPivot.position.copy(TANK.trunnion);
    this.turret.add(this.gunPivot);
    this.gunPivot.add(this.barrel);
    mesh(G.gun, paint, this.barrel);
    // running gear in CONTACTS order
    for (const c of CONTACTS) {
      const g = c.wheel >= 0 ? G.roadWheel : c.z < 0 ? G.idler : G.sprocket;
      const w = mesh(g, gear, this.root);
      w.position.set(c.x, c.wheel >= 0 ? TANK.wheelR + SHOE : c.z < 0 ? TANK.idlerY : TANK.sprocketY, c.z);
      this.wheels.push(w);
    }
    for (const s of [-1, 1]) {
      const t = new TrackMesh(G.link, track, s * TANK.trackX);
      this.root.add(t.mesh);
      this.tracks.push(t);
    }
  }

  get materials(): readonly Mat[] {
    return this.mats;
  }

  update(s: TankVisualState) {
    this.root.position.copy(s.pos);
    this.root.quaternion.copy(s.quat);
    this.turret.rotation.y = s.turretYaw;
    this.gunPivot.rotation.x = s.gun;
    this.barrel.position.z = s.recoil;
    for (const m of this.mats) {
      setEntityLight(m, s.light);
      m.uniforms.u_hurt.value = s.hurt * 0.3;
    }
    // burnt wreck
    if (s.destroyed !== this.wasDestroyed) {
      this.wasDestroyed = s.destroyed;
      for (const m of this.paintMats) (m.uniforms.u_color.value as THREE.Color).setRGB(s.destroyed ? 0.16 : 1, s.destroyed ? 0.15 : 1, s.destroyed ? 0.14 : 1);
    }
    const on = s.engine > 0.05 && !s.destroyed ? 1 : 0;
    this.lightMat.uniforms.u_emissive.value = on * 2.5;
    this.tailMat.uniforms.u_emissive.value = on * 1.6;
    this.crew.visible = s.crewed && !s.hideCrew && !s.destroyed;
    // suspension, wheel spin, tracks
    const comp = s.compression;
    const wy = this.wheelY;
    wy[0].length = 0;
    wy[1].length = 0;
    for (let i = 0; i < CONTACTS.length; i++) {
      const c = CONTACTS[i];
      const w = this.wheels[i];
      const side = c.x < 0 ? 0 : 1;
      const travel = side === 0 ? s.trackL : s.trackR;
      if (c.wheel >= 0) {
        const y = TANK.wheelR + SHOE + Math.max(-0.12, Math.min(TANK.travel + 0.04, comp[i] ?? 0));
        w.position.y = y;
        wy[side].push(y);
        w.rotation.x = -travel / TANK.wheelR;
      } else w.rotation.x = -travel / 0.33;
    }
    // tracks only when someone could see the links move
    if (s.camDist < 90) {
      this.tracks[0].update(wy[0], s.trackL);
      this.tracks[1].update(wy[1], s.trackR);
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const t of this.tracks) t.dispose();
  }
}
