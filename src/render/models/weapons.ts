// Procedural weapon models: the 11 guns, the thrown grenade, launcher round,
// shell casings and dropped magazines.
//
// Convention: every weapon group has its origin at the main grip (the centre of
// the trigger hand), barrel toward -X, top toward +Y, its LEFT side toward +Z
// (the side the gameplay camera sees, since the hunter faces -X). Sizes are
// real-world-ish, thickened ~25% so they read at the small on-screen size.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  MATERIALS,
  PartBuilder,
  box,
  cyl,
  cylX,
  ellipsoid,
  extrude,
  hash3,
  lathe,
  mix,
  roundBox,
  sphere,
  torus,
  xfMatrix,
  type MatClass,
  type Xf,
} from './kit';
import type { ClipKind, ShellKind, WeaponId } from '../../config/weapons';

// ------------------------------------------------------------------ contract
export interface WeaponAnimState {
  /** Seconds since the last shot (large when idle). */
  fireT: number;
  /** Reload progress 0..1, or -1 when not reloading. */
  reloadT: number;
  /** Minigun heat 0..1 (barrel glow). */
  heat: number;
  /** Minigun barrel spin rate 0..1 (1 = full speed); the model integrates the angle. */
  spin: number;
  /** Shotgun pump cycle / punt-gun hammer cocking progress 0..1. */
  cock: number;
  /** Frame delta (s). */
  dt: number;
  /** Grenade throw progress 0..1, or -1 (hides the grenade after release). */
  throwT?: number;
}

/** How the hunter holds the weapon. */
export type HoldStyle = 'pistol' | 'shoulder' | 'dual' | 'hip' | 'throw';

export interface WeaponModel {
  id: WeaponId;
  /** Origin at the main grip (where the hand holds it), barrel toward -X, top toward +Y. */
  group: THREE.Group;
  /** Optional second gun (dual MAC-10) mounted on hand2. */
  group2?: THREE.Group;
  /** Muzzle points (muzzle flash + tracer start); two for dual MAC-10. Local -X = firing direction. */
  muzzles: THREE.Object3D[];
  /** Shell ejection port. Local +Y = ejection direction. */
  ejector: THREE.Object3D;
  /** Detachable magazine (hidden/dropped while reloading), if any. */
  magazine?: THREE.Object3D;
  /** AWP laser emitter. Local -X = beam direction. */
  laser?: THREE.Object3D;
  /** Hold pose used by the hunter rig. */
  hold: HoldStyle;
  /** Support-hand grip point (child of the part it grips, e.g. the pump). Null for dual guns. */
  support: THREE.Object3D | null;
  /** Muzzle position relative to the grip in the rest state (group space). */
  muzzleRest: THREE.Vector3;
  /** Second gun's muzzle relative to its own grip (dual MAC-10). */
  muzzleRest2?: THREE.Vector3;
  animate(s: WeaponAnimState): void;
}

// ------------------------------------------------------------------ palette
const C = {
  polymer: 0x24262a,
  polymerHi: 0x303339,
  blued: 0x2c2f35,
  bluedDark: 0x17181b,
  bore: 0x060606,
  stainless: 0xd2d6db,
  stainlessDark: 0xa3a8ae,
  grey: 0x9a9fa6,
  greyDark: 0x5f646b,
  greyLight: 0xc0c5cb,
  gunmetal: 0x3d4148,
  gunmetalDark: 0x2a2d32,
  wood: 0x7e4220,
  woodDark: 0x5c2e15,
  woodRed: 0x5d2317,
  woodRedDark: 0x401610,
  olive: 0x5d6d32,
  oliveDark: 0x46532a,
  od: 0x3f5a28,
  odDark: 0x2f4420,
  brass: 0xdcae40,
  brassDark: 0xa87b25,
  copper: 0xc07a3a,
  yellow: 0xe8c030,
  red: 0xb8261c,
  rubber: 0x161616,
  gold: 0xe6c048,
  strap: 0x1c5ee0,
  lens: 0x10204a,
  laser: 0xff2a1a,
};

const PI = Math.PI;
type V2 = [number, number];
type V3 = [number, number, number];

// ------------------------------------------------------------------ helpers
/**
 * Baked chrome-like shading: bright sky reflection on top, a dark horizon band
 * and a dim ground bounce below. Steel then reads as metal whether or not the
 * scene has an environment map (the kit's metal class is near-black without one).
 */
function steel(base: THREE.ColorRepresentation) {
  const c0 = new THREE.Color(base);
  return (_p: THREE.Vector3, n: THREE.Vector3) => {
    const y = n.y;
    const f = y > 0.2 ? 1.12 + 0.18 * y : y > -0.3 ? 0.6 + ((y + 0.3) / 0.5) * 0.4 : 0.8 - 0.1 * (y + 0.3);
    const c = c0.clone().multiplyScalar(f);
    c.r = Math.min(1, c.r);
    c.g = Math.min(1, c.g);
    c.b = Math.min(1, c.b);
    return c;
  };
}

/** PartBuilder whose 'metal' parts are steel-shaded on the low-metalness plastic class. */
class GunBuilder extends PartBuilder {
  override add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, mat: MatClass = 'plastic', xf: Xf = {}): this {
    if (mat === 'metal') return this.addShaded(geo, steel(color), 'plastic', xf);
    return super.add(geo, color, mat, xf);
  }
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Recoil impulse shape: quick rise over `up` seconds, eased return over `down`. */
export const kickCurve = (t: number, up = 0.02, down = 0.08) => {
  if (!(t >= 0)) return 0;
  if (t < up) return t / up;
  const u = clamp01((t - up) / down);
  return (1 - u) * (1 - u);
};

/** Cylinder along Z (pins, knobs, sight drums). */
const cylZ = (r: number, len: number, seg = 12, rEnd?: number) => {
  const g = new THREE.CylinderGeometry(rEnd ?? r, r, len, seg);
  g.rotateX(PI / 2);
  return g;
};

/** Barrel/tube between x0 and x1 at height y; rA at x0, rB at x1. */
function tube(P: PartBuilder, x0: number, x1: number, y: number, rA: number, color: THREE.ColorRepresentation, mat: MatClass, z = 0, rB = rA, seg = 16) {
  const len = Math.abs(x1 - x0);
  const lo = Math.min(x0, x1);
  const rMinus = x0 < x1 ? rA : rB; // radius at the -X end
  const rPlus = x0 < x1 ? rB : rA;
  P.add(cylX(rPlus, len, seg, rMinus), color, mat, { p: [lo + len / 2, y, z] });
}

/** Half-ring trigger guard hanging below (x, y). */
function guard(P: PartBuilder, x: number, y: number, r: number, t: number, color: THREE.ColorRepresentation, mat: MatClass, sx = 1) {
  const g = torus(r, t, 6, 14, PI);
  g.rotateZ(PI);
  P.add(g, color, mat, { p: [x, y, 0], s: [sx, 1, 1] });
}

/** Extrude an outline with holes (thumbhole stocks, carry handles). */
function extrudeHoles(outer: V2[], holes: V2[][], d: number, bevel = 0.003) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, d - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 6,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  return g;
}

/** Flat band swept along a curve (straps). `thick` across the curve's plane, `width` along its binormal. */
function ribbon(curve: THREE.Curve<THREE.Vector3>, thick: number, width: number, steps: number) {
  const sh = new THREE.Shape([
    new THREE.Vector2(-thick / 2, -width / 2),
    new THREE.Vector2(thick / 2, -width / 2),
    new THREE.Vector2(thick / 2, width / 2),
    new THREE.Vector2(-thick / 2, width / 2),
  ]);
  return new THREE.ExtrudeGeometry(sh, { steps, extrudePath: curve, bevelEnabled: false });
}

/** Wood with a subtle grain along the stock. */
const woodShade = (base: number, dark: number) => (p: THREE.Vector3) => {
  const g = Math.sin(p.x * 140 + p.y * 30 + Math.sin(p.x * 23) * 2.5) * 0.5 + 0.5;
  return mix(base, dark, 0.15 + g * 0.35 + hash3(p.x * 9, p.y * 9, p.z * 9) * 0.1);
};

function marker(name: string, parent: THREE.Object3D, p: V3, dirY?: V3): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(...p);
  if (dirY) o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dirY).normalize());
  parent.add(o);
  return o;
}

function part(name: string, parent: THREE.Object3D, p: V3 = [0, 0, 0]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...p);
  parent.add(g);
  return g;
}

/** Detects new shots from a resetting fireT. */
class ShotCounter {
  private last = Infinity;
  count = 0;
  update(fireT: number): boolean {
    const shot = fireT >= 0 && fireT < 0.25 && fireT < this.last - 1e-6;
    this.last = fireT;
    if (shot) this.count++;
    return shot;
  }
}

/** Magazine out/in during a reload: slides out along `axis`, hidden, slides back in. */
function magReload(mag: THREE.Object3D, base: THREE.Vector3, t: number, axis: THREE.Vector3, dist: number, tOut = 0.12, tIn0 = 0.5, tIn1 = 0.68) {
  mag.position.copy(base);
  mag.visible = true;
  if (t < 0) return;
  if (t < tOut) mag.position.addScaledVector(axis, dist * smooth(0, tOut, t));
  else if (t < tIn0) mag.visible = false;
  else if (t < tIn1) mag.position.addScaledVector(axis, dist * (1 - smooth(tIn0, tIn1, t)));
}

function finish(m: Omit<WeaponModel, 'muzzleRest'>): WeaponModel {
  m.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.group.matrixWorld).invert();
  const muzzleRest = m.muzzles[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const out: WeaponModel = { ...m, muzzleRest };
  if (m.group2 && m.muzzles[1]) {
    m.group2.updateMatrixWorld(true);
    const inv2 = new THREE.Matrix4().copy(m.group2.matrixWorld).invert();
    out.muzzleRest2 = m.muzzles[1].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv2);
  }
  return out;
}

// =================================================================== PISTOL
function buildPistol(): WeaponModel {
  const B = 0.066;
  const group = new THREE.Group();
  group.name = 'pistol';
  const F = new GunBuilder();
  // frame: dust cover + grip
  F.add(roundBox(0.125, 0.024, 0.032, 0.006), C.polymer, 'plastic', { p: [-0.088, 0.037, 0] });
  F.add(
    extrude([[-0.027, 0.046], [0.034, 0.046], [0.047, -0.058], [0.041, -0.074], [-0.005, -0.074], [-0.015, -0.063], [-0.029, 0.012]], 0.033, 0.004),
    C.polymer,
    'plastic',
  );
  // stippled grip panel
  F.add(extrude([[-0.02, 0.018], [0.028, 0.018], [0.036, -0.052], [-0.008, -0.052]], 0.0345, 0.001), 0x2a2d31, 'plastic');
  guard(F, -0.057, 0.03, 0.025, 0.0045, C.polymer, 'plastic', 1.1);
  F.add(box(0.006, 0.02, 0.006), C.bluedDark, 'darkmetal', { p: [-0.047, 0.018, 0], r: [0, 0, 0.25] });
  // slide stop / decocker levers (left side)
  F.add(box(0.03, 0.006, 0.004), C.bluedDark, 'darkmetal', { p: [-0.035, 0.05, 0.018] });
  F.add(box(0.012, 0.012, 0.004), C.bluedDark, 'darkmetal', { p: [0.028, 0.052, 0.018] });
  F.buildInto(group);

  const slide = part('slide', group);
  const S = new GunBuilder();
  S.add(roundBox(0.205, 0.043, 0.035, 0.007), C.blued, 'darkmetal', { p: [-0.053, B + 0.003, 0] });
  for (let i = 0; i < 5; i++) S.add(box(0.003, 0.03, 0.0365), C.bluedDark, 'darkmetal', { p: [0.018 + i * 0.006, B + 0.002, 0] });
  S.add(box(0.008, 0.008, 0.006), C.bluedDark, 'darkmetal', { p: [-0.145, B + 0.028, 0] });
  S.add(box(0.01, 0.009, 0.026), C.bluedDark, 'darkmetal', { p: [0.04, B + 0.029, 0] });
  S.add(box(0.04, 0.012, 0.002), C.bluedDark, 'darkmetal', { p: [-0.025, B + 0.012, 0.0178] });
  S.add(cylX(0.0068, 0.004), C.bore, 'rubber', { p: [-0.1555, B, 0] });
  S.buildInto(slide);

  const mag = part('magazine', group, [0.01, -0.02, 0]);
  mag.rotation.z = 0.12;
  const Mg = new GunBuilder();
  Mg.add(box(0.034, 0.1, 0.026), C.bluedDark, 'darkmetal', { p: [0, -0.005, 0] });
  Mg.add(roundBox(0.044, 0.012, 0.036, 0.004), C.polymer, 'plastic', { p: [0, -0.058, 0] });
  Mg.buildInto(mag);
  const magBase = mag.position.clone();
  const magAxis = new THREE.Vector3(Math.sin(0.12), -Math.cos(0.12), 0);

  const muzzle = marker('muzzle', group, [-0.158, B, 0]);
  const ejector = marker('ejector', group, [-0.025, B + 0.02, 0.018], [0.4, 0.8, 0.6]);
  const support = marker('support', group, [0.012, -0.03, -0.05]);

  return finish({
    id: 'pistol',
    group,
    muzzles: [muzzle],
    ejector,
    magazine: mag,
    hold: 'pistol',
    support,
    animate(s) {
      let back = 0.028 * kickCurve(s.fireT, 0.02, 0.06);
      if (s.reloadT >= 0) back = Math.max(back, 0.028 * (smooth(0.0, 0.08, s.reloadT) - smooth(0.82, 0.88, s.reloadT)));
      slide.position.x = back;
      magReload(mag, magBase, s.reloadT, magAxis, 0.09);
    },
  });
}

// =================================================================== MAGNUM
function buildMagnum(): WeaponModel {
  const B = 0.066;
  const CY = 0.048; // cylinder axis
  const group = new THREE.Group();
  group.name = 'magnum';
  const M = new GunBuilder();
  // wood grip with medallion
  M.addShaded(
    extrude([[-0.006, 0.03], [0.03, 0.036], [0.05, 0.024], [0.064, -0.034], [0.06, -0.07], [0.046, -0.084], [0.012, -0.08], [-0.004, -0.052], [-0.013, -0.008]], 0.039, 0.005),
    woodShade(C.wood, C.woodDark),
    'wood',
  );
  M.add(cylZ(0.0065, 0.042), C.gold, 'metal', { p: [0.03, -0.012, 0] });
  // frame
  M.add(roundBox(0.11, 0.024, 0.026, 0.006), C.stainless, 'metal', { p: [-0.035, 0.012, 0] });
  M.add(extrude([[-0.014, 0.0], [0.03, 0.03], [0.044, 0.062], [0.034, 0.09], [0.0, 0.097], [-0.014, 0.086]], 0.026, 0.003), C.stainless, 'metal');
  M.add(roundBox(0.085, 0.014, 0.024, 0.005), C.stainless, 'metal', { p: [-0.045, 0.084, 0] });
  M.add(roundBox(0.012, 0.07, 0.026, 0.004), C.stainless, 'metal', { p: [-0.085, 0.045, 0] });
  // hammer + trigger + guard
  M.add(extrude([[0.016, 0.084], [0.03, 0.084], [0.052, 0.104], [0.047, 0.111], [0.022, 0.099]], 0.01, 0.002), C.stainlessDark, 'metal');
  guard(M, -0.04, 0.004, 0.024, 0.0045, C.stainless, 'metal', 1.05);
  M.add(box(0.006, 0.022, 0.006), C.stainlessDark, 'metal', { p: [-0.036, -0.004, 0], r: [0, 0, 0.25] });
  // barrel, full underlug, vent rib
  tube(M, -0.085, -0.248, B, 0.0135, C.stainless, 'metal');
  M.add(roundBox(0.163, 0.026, 0.023, 0.006), C.stainless, 'metal', { p: [-0.166, B - 0.02, 0] });
  M.add(roundBox(0.163, 0.013, 0.012, 0.003), C.stainless, 'metal', { p: [-0.166, B + 0.019, 0] });
  for (let i = 0; i < 8; i++) M.add(box(0.009, 0.0075, 0.0126), C.bluedDark, 'darkmetal', { p: [-0.1 - i * 0.0185, B + 0.016, 0] });
  M.add(extrude([[-0.246, B + 0.024], [-0.216, B + 0.024], [-0.238, B + 0.04], [-0.246, B + 0.04]], 0.006, 0.001), C.stainlessDark, 'metal');
  M.add(extrude([[0.0, 0.091], [0.022, 0.091], [0.022, 0.1], [0.0, 0.1]], 0.016, 0.001), C.stainlessDark, 'metal');
  M.add(cylX(0.007, 0.004), C.bore, 'rubber', { p: [-0.2495, B, 0] });
  M.buildInto(group);

  // cylinder (turns 60 deg per shot, swings out on reload)
  const crane = part('crane', group, [-0.046, CY, 0]);
  const cylinder = part('cylinder', crane);
  const Cy = new GunBuilder();
  Cy.add(cylX(0.028, 0.058, 18), C.stainless, 'metal');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const af = a + PI / 6;
    Cy.add(box(0.036, 0.006, 0.008), C.stainlessDark, 'metal', { p: [0, Math.cos(af) * 0.026, Math.sin(af) * 0.026], r: [-af, 0, 0] });
    Cy.add(cylX(0.0065, 0.003), C.bore, 'rubber', { p: [-0.0295, Math.cos(a) * 0.017, Math.sin(a) * 0.017] });
    Cy.add(cylX(0.0068, 0.003), C.brass, 'metal', { p: [0.0295, Math.cos(a) * 0.017, Math.sin(a) * 0.017] });
  }
  Cy.buildInto(cylinder);
  const craneBase = crane.position.clone();

  const muzzle = marker('muzzle', group, [-0.25, B, 0]);
  const ejector = marker('ejector', cylinder, [0.03, 0, 0], [0.2, -1, 0.1]);
  const support = marker('support', group, [0.034, -0.045, -0.05]);
  const shots = new ShotCounter();
  let angle = 0;
  return finish({
    id: 'magnum',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'pistol',
    support,
    animate(s) {
      shots.update(s.fireT);
      const target = shots.count * (PI / 3);
      angle += (target - angle) * clamp01(s.dt * 30);
      if (Math.abs(target - angle) < 1e-3) angle = target;
      cylinder.rotation.x = angle;
      const out = s.reloadT >= 0 ? smooth(0.04, 0.14, s.reloadT) * (1 - smooth(0.82, 0.92, s.reloadT)) : 0;
      crane.position.set(craneBase.x, craneBase.y - 0.012 * out, craneBase.z + 0.045 * out);
      crane.rotation.x = -0.5 * out;
    },
  });
}

// =================================================================== MP5
function buildMP5(): WeaponModel {
  const B = 0.05;
  const group = new THREE.Group();
  group.name = 'mp5';
  const M = new GunBuilder();
  // receiver
  M.add(roundBox(0.33, 0.05, 0.04, 0.012), C.blued, 'darkmetal', { p: [-0.075, 0.06, 0] });
  // cocking tube + barrel
  tube(M, -0.24, -0.37, 0.072, 0.012, C.blued, 'darkmetal');
  tube(M, -0.24, -0.395, B, 0.009, C.bluedDark, 'darkmetal');
  tube(M, -0.385, -0.412, B, 0.012, C.bluedDark, 'darkmetal');
  M.add(cylX(0.006, 0.003), C.bore, 'rubber', { p: [-0.4135, B, 0] });
  // front sight hood
  M.add(roundBox(0.025, 0.03, 0.02, 0.004), C.blued, 'darkmetal', { p: [-0.358, 0.088, 0] });
  M.add(torus(0.012, 0.0035, 6, 12).rotateY(PI / 2), C.blued, 'darkmetal', { p: [-0.358, 0.108, 0] });
  // cocking lever
  M.add(box(0.034, 0.007, 0.007), C.bluedDark, 'darkmetal', { p: [-0.31, 0.088, 0.018], r: [0, 0, -0.6] });
  // rear diopter drum
  M.add(cylZ(0.013, 0.022, 12), C.blued, 'darkmetal', { p: [0.055, 0.098, 0] });
  M.add(box(0.03, 0.012, 0.02), C.blued, 'darkmetal', { p: [0.055, 0.086, 0] });
  // slim handguard
  M.add(extrude([[-0.24, 0.046], [-0.24, 0.016], [-0.3, 0.014], [-0.352, 0.028], [-0.358, 0.05], [-0.3, 0.056]], 0.046, 0.004), C.polymer, 'plastic');
  // trigger housing + pistol grip + guard
  M.add(extrude([[-0.075, 0.036], [0.045, 0.036], [0.05, 0.016], [-0.065, 0.01]], 0.036, 0.003), C.polymer, 'plastic');
  M.add(extrude([[-0.022, 0.02], [0.022, 0.02], [0.036, -0.078], [0.026, -0.088], [-0.012, -0.085], [-0.028, -0.03]], 0.034, 0.004), C.polymer, 'plastic');
  guard(M, -0.045, 0.014, 0.02, 0.004, C.polymer, 'plastic', 1.1);
  M.add(box(0.005, 0.018, 0.006), C.bluedDark, 'darkmetal', { p: [-0.04, 0.005, 0], r: [0, 0, 0.2] });
  M.add(box(0.016, 0.01, 0.006), C.bluedDark, 'darkmetal', { p: [0.01, 0.03, 0.019] }); // selector
  // mag well
  M.add(roundBox(0.05, 0.03, 0.036, 0.004), C.blued, 'darkmetal', { p: [-0.112, 0.024, 0] });
  // retractable stock: two rails + butt plate
  tube(M, 0.09, 0.27, 0.074, 0.0055, C.bluedDark, 'darkmetal', 0.014);
  tube(M, 0.09, 0.27, 0.074, 0.0055, C.bluedDark, 'darkmetal', -0.014);
  tube(M, 0.09, 0.27, 0.04, 0.0055, C.bluedDark, 'darkmetal', 0.014);
  tube(M, 0.09, 0.27, 0.04, 0.0055, C.bluedDark, 'darkmetal', -0.014);
  M.add(roundBox(0.024, 0.115, 0.042, 0.008), C.rubber, 'rubber', { p: [0.282, 0.035, 0] });
  M.buildInto(group);

  // curved magazine
  const mag = part('magazine', group, [-0.112, 0.01, 0]);
  const Mg = new GunBuilder();
  curvedMag(Mg, [0, 0], 5, 0.037, [-0.06, -0.12, -0.19, -0.26, -0.33], 0.034, 0.024, C.bluedDark);
  Mg.buildInto(mag);
  const magBase = mag.position.clone();

  const muzzle = marker('muzzle', group, [-0.414, B, 0]);
  const ejector = marker('ejector', group, [-0.03, 0.075, 0.021], [0.4, 0.8, 0.6]);
  const support = marker('support', group, [-0.3, -0.012, -0.004]);
  return finish({
    id: 'mp5',
    group,
    muzzles: [muzzle],
    ejector,
    magazine: mag,
    hold: 'shoulder',
    support,
    animate(s) {
      magReload(mag, magBase, s.reloadT, new THREE.Vector3(0.25, -1, 0).normalize(), 0.16);
    },
  });
}

/** Stack of box segments that curves forward (banana magazine). */
function curvedMag(P: PartBuilder, start: V2, n: number, segLen: number, angles: number[], w: number, d: number, color: number, mat: MatClass = 'darkmetal') {
  let [x, y] = start;
  for (let i = 0; i < n; i++) {
    const a = angles[i];
    const dx = Math.sin(a) * segLen; // a < 0 => bottom goes toward -X
    const dy = -Math.cos(a) * segLen;
    P.add(box(w, segLen * 1.08, d), color, mat, { p: [x + dx / 2, y + dy / 2, 0], r: [0, 0, a] });
    x += dx;
    y += dy;
  }
  const a = angles[n - 1];
  P.add(roundBox(w * 1.15, 0.01, d * 1.2, 0.003), color, mat, { p: [x, y, 0], r: [0, 0, a] });
}

// =================================================================== GRENADE
function grenadeParts(P: PartBuilder, ring: PartBuilder | null, s = 1) {
  // body: pineapple segments
  P.add(ellipsoid(0.04 * s, 0.05 * s, 0.04 * s, 16, 12), C.od, 'plastic');
  const rows = 5;
  const cols = 8;
  for (let r = 0; r < rows; r++) {
    const v = -0.75 + (r / (rows - 1)) * 1.5; // -0.75..0.75
    const phi = Math.asin(v);
    const ry = Math.sin(phi) * 0.05 * s;
    const rr = Math.cos(phi) * 0.04 * s;
    for (let c = 0; c < cols; c++) {
      const a = (c / cols) * PI * 2 + (r % 2) * (PI / cols);
      P.add(roundBox(0.017 * s, 0.017 * s, 0.01 * s, 0.004 * s, 1), mix(C.od, C.odDark, (r + c) % 3 === 0 ? 0.4 : 0.1), 'plastic', {
        p: [Math.cos(a) * rr, ry, Math.sin(a) * rr],
        r: [0, -a + PI / 2, -phi * 0.8],
      });
    }
  }
  // fuse
  P.add(cyl(0.015 * s, 0.017 * s, 0.026 * s, 12), C.grey, 'metal', { p: [0, 0.058 * s, 0] });
  P.add(cyl(0.01 * s, 0.01 * s, 0.012 * s, 10), C.grey, 'metal', { p: [0, 0.075 * s, 0] });
  // spoon down the +X side
  P.add(box(0.008 * s, 0.07 * s, 0.014 * s), C.grey, 'metal', { p: [0.043 * s, 0.035 * s, 0], r: [0, 0, 0.18] });
  P.add(box(0.03 * s, 0.006 * s, 0.014 * s), C.grey, 'metal', { p: [0.03 * s, 0.072 * s, 0] });
  if (ring) {
    ring.add(torus(0.013 * s, 0.0025 * s, 6, 14), C.grey, 'metal', { p: [-0.024 * s, 0.07 * s, 0.012 * s], r: [0, 0.6, 0] });
  }
}

/** Thrown grenade (origin at its centre). */
export function createGrenadeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'grenade';
  const P = new GunBuilder();
  grenadeParts(P, null, 1.25);
  P.buildInto(g);
  return g;
}

function buildGrenades(): WeaponModel {
  const group = new THREE.Group();
  group.name = 'grenades';
  const body = part('grenade', group);
  const ringPart = part('pin', body);
  const P = new GunBuilder();
  const R = new GunBuilder();
  grenadeParts(P, R, 1.25);
  P.buildInto(body);
  R.buildInto(ringPart);
  const muzzle = marker('muzzle', group, [0, 0, 0]);
  const ejector = marker('ejector', group, [0, 0.08, 0], [0, 1, 0]);
  return finish({
    id: 'grenades',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'throw',
    support: null,
    animate(s) {
      const th = s.throwT ?? -1;
      let vis = true;
      if (th >= 0) vis = th < 0.56;
      else if (s.reloadT >= 0) vis = s.reloadT > 0.42;
      body.visible = vis;
      ringPart.visible = !(th >= 0.12 && th < 0.56);
    },
  });
}

// =================================================================== SHOTGUN
function buildShotgun(): WeaponModel {
  const B = 0.058;
  const group = new THREE.Group();
  group.name = 'shotgun';
  const M = new GunBuilder();
  // receiver
  M.add(roundBox(0.19, 0.062, 0.037, 0.008), C.blued, 'darkmetal', { p: [-0.11, 0.045, 0] });
  M.add(box(0.06, 0.016, 0.002), C.bluedDark, 'darkmetal', { p: [-0.1, 0.06, 0.0192] }); // ejection port
  // barrel + bead, magazine tube + cap
  tube(M, -0.2, -0.73, B, 0.0128, C.blued, 'darkmetal');
  M.add(sphere(0.004, 8, 6), C.stainless, 'metal', { p: [-0.722, B + 0.014, 0] });
  M.add(cylX(0.0085, 0.003), C.bore, 'rubber', { p: [-0.7315, B, 0] });
  tube(M, -0.2, -0.63, 0.027, 0.0125, C.blued, 'darkmetal');
  tube(M, -0.63, -0.65, 0.027, 0.0135, C.bluedDark, 'darkmetal');
  M.add(box(0.02, 0.034, 0.02), C.bluedDark, 'darkmetal', { p: [-0.6, 0.043, 0] });
  // trigger plate, guard, trigger
  M.add(roundBox(0.09, 0.016, 0.032, 0.004), C.bluedDark, 'darkmetal', { p: [-0.045, 0.012, 0] });
  guard(M, -0.05, 0.008, 0.022, 0.0045, C.bluedDark, 'darkmetal', 1.15);
  M.add(box(0.006, 0.02, 0.006), C.bluedDark, 'darkmetal', { p: [-0.045, 0.0, 0], r: [0, 0, 0.25] });
  // stock with wrist
  M.add(
    extrude([[-0.018, 0.074], [0.06, 0.064], [0.36, 0.058], [0.37, 0.052], [0.37, -0.075], [0.355, -0.082], [0.11, -0.022], [0.045, -0.046], [0.024, -0.05], [0.0, -0.032], [-0.018, 0.016]], 0.039, 0.005),
    C.polymer,
    'plastic',
  );
  M.add(roundBox(0.022, 0.14, 0.042, 0.007), C.rubber, 'rubber', { p: [0.38, -0.01, 0] });
  M.buildInto(group);

  const pump = part('pump', group);
  const Pp = new GunBuilder();
  Pp.add(roundBox(0.17, 0.042, 0.044, 0.016), C.polymer, 'plastic', { p: [-0.37, 0.031, 0] });
  for (let i = 0; i < 7; i++) Pp.add(box(0.006, 0.044, 0.0455), C.bluedDark, 'plastic', { p: [-0.31 - i * 0.02, 0.031, 0] });
  Pp.buildInto(pump);
  const support = marker('support', pump, [-0.37, -0.012, -0.004]);

  const muzzle = marker('muzzle', group, [-0.733, B, 0]);
  const ejector = marker('ejector', group, [-0.1, 0.07, 0.02], [0.4, 0.8, 0.6]);
  return finish({
    id: 'shotgun',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'shoulder',
    support,
    animate(s) {
      const c = s.cock > 0 && s.cock < 1 ? Math.sin(PI * s.cock) : 0;
      pump.position.x = 0.09 * c;
    },
  });
}

// =================================================================== MAC-10
function macParts(group: THREE.Group, withStock: boolean) {
  const M = new GunBuilder();
  M.add(roundBox(0.27, 0.052, 0.05, 0.007), C.grey, 'metal', { p: [-0.07, 0.048, 0] });
  M.add(roundBox(0.24, 0.034, 0.048, 0.006), C.greyDark, 'metal', { p: [-0.085, 0.008, 0] });
  M.add(box(0.12, 0.004, 0.0505), C.greyDark, 'metal', { p: [-0.1, 0.06, 0] }); // seam
  // threaded barrel stub
  tube(M, -0.205, -0.255, 0.045, 0.011, C.greyDark, 'metal');
  for (let i = 0; i < 4; i++) M.add(cylX(0.012, 0.003), C.gunmetal, 'darkmetal', { p: [-0.215 - i * 0.01, 0.045, 0] });
  M.add(cylX(0.006, 0.003), C.bore, 'rubber', { p: [-0.2565, 0.045, 0] });
  // cocking knob + sights
  M.add(cyl(0.007, 0.007, 0.016, 10), C.gunmetal, 'darkmetal', { p: [-0.12, 0.08, 0] });
  M.add(box(0.012, 0.012, 0.01), C.greyDark, 'metal', { p: [-0.195, 0.078, 0] });
  M.add(box(0.012, 0.012, 0.03), C.greyDark, 'metal', { p: [0.05, 0.078, 0] });
  // grip with plastic panels (magazine goes through it)
  M.add(roundBox(0.046, 0.095, 0.042, 0.006), C.greyDark, 'metal', { p: [0.002, -0.045, 0], r: [0, 0, 0.06] });
  M.add(roundBox(0.036, 0.075, 0.046, 0.004), C.polymer, 'plastic', { p: [0.003, -0.045, 0], r: [0, 0, 0.06] });
  guard(M, -0.05, -0.008, 0.02, 0.0045, C.greyDark, 'metal', 1.1);
  M.add(box(0.006, 0.018, 0.006), C.gunmetal, 'darkmetal', { p: [-0.045, -0.014, 0], r: [0, 0, 0.25] });
  // folded wire stock along the sides + butt
  if (withStock) {
    tube(M, 0.065, -0.14, 0.02, 0.0045, C.gunmetal, 'darkmetal', 0.028);
    tube(M, 0.065, -0.14, 0.02, 0.0045, C.gunmetal, 'darkmetal', -0.028);
    M.add(roundBox(0.014, 0.05, 0.062, 0.004), C.gunmetal, 'darkmetal', { p: [0.072, 0.03, 0] });
  }
  M.buildInto(group);
  const mag = part('magazine', group, [0.004, -0.04, 0]);
  mag.rotation.z = 0.06;
  const Mg = new GunBuilder();
  Mg.add(box(0.034, 0.24, 0.028), C.gunmetalDark, 'darkmetal', { p: [0, -0.07, 0] });
  Mg.add(roundBox(0.04, 0.012, 0.034, 0.004), C.gunmetalDark, 'darkmetal', { p: [0, -0.193, 0] });
  Mg.buildInto(mag);
  return mag;
}

function buildMac10(): WeaponModel {
  const group = new THREE.Group();
  group.name = 'mac10';
  const group2 = new THREE.Group();
  group2.name = 'mac10_2';
  const mag1 = macParts(group, true);
  const mag2 = macParts(group2, true);
  const base1 = mag1.position.clone();
  const base2 = mag2.position.clone();
  const axis = new THREE.Vector3(Math.sin(0.06), -Math.cos(0.06), 0);
  const m1 = marker('muzzle', group, [-0.257, 0.045, 0]);
  const m2 = marker('muzzle2', group2, [-0.257, 0.045, 0]);
  const ejector = marker('ejector', group, [-0.06, 0.075, 0.026], [0.4, 0.8, 0.6]);
  return finish({
    id: 'mac10',
    group,
    group2,
    muzzles: [m1, m2],
    ejector,
    magazine: mag1,
    hold: 'dual',
    support: null,
    animate(s) {
      magReload(mag1, base1, s.reloadT, axis, 0.22, 0.12, 0.5, 0.66);
      magReload(mag2, base2, s.reloadT, axis, 0.22, 0.14, 0.56, 0.72);
    },
  });
}

// =================================================================== FLUNK (MGL)
function launcherRoundParts(P: PartBuilder, s: number, x = 0, y = 0, z = 0) {
  // nose toward -X
  P.add(cylX(0.02 * s, 0.032 * s, 14), C.brass, 'metal', { p: [x + 0.012 * s, y, z] });
  P.add(cylX(0.021 * s, 0.006 * s, 14), C.brassDark, 'metal', { p: [x + 0.029 * s, y, z] });
  const nose = lathe([[0.0, 0.03], [0.008, 0.028], [0.015, 0.02], [0.019, 0.01], [0.02, 0.0]], 14);
  nose.rotateZ(PI / 2);
  P.add(nose, C.yellow, 'plastic', { p: [x - 0.004 * s, y, z], s: [s, s, s] });
}

/** 40 mm launcher round in flight (origin at its centre, nose toward -X). */
export function createLauncherRoundModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'launcherRound';
  const P = new GunBuilder();
  launcherRoundParts(P, 1.6);
  P.buildInto(g);
  return g;
}

function buildFlunk(): WeaponModel {
  const B = 0.068;
  const DY = 0.02; // drum axis
  const DX = -0.14;
  const group = new THREE.Group();
  group.name = 'flunk';
  const M = new GunBuilder();
  // pistol grip + rear frame
  M.add(extrude([[-0.022, 0.032], [0.026, 0.032], [0.04, -0.07], [0.03, -0.082], [-0.01, -0.08], [-0.026, -0.022]], 0.036, 0.004), C.polymer, 'plastic');
  M.add(roundBox(0.09, 0.09, 0.044, 0.01), C.greyDark, 'metal', { p: [-0.02, 0.055, 0] });
  guard(M, -0.045, 0.018, 0.022, 0.0045, C.greyDark, 'metal', 1.1);
  M.add(box(0.006, 0.02, 0.006), C.gunmetal, 'darkmetal', { p: [-0.04, 0.012, 0], r: [0, 0, 0.25] });
  // top strap / rail over the drum
  M.add(roundBox(0.26, 0.018, 0.034, 0.005), C.greyDark, 'metal', { p: [-0.14, 0.106, 0] });
  M.add(box(0.03, 0.03, 0.006), C.gunmetal, 'darkmetal', { p: [-0.24, 0.128, 0], r: [0, 0, 0.3] }); // ladder sight
  // front frame plate + axis rod
  M.add(roundBox(0.022, 0.13, 0.05, 0.006), C.greyDark, 'metal', { p: [-0.228, 0.04, 0] });
  tube(M, -0.05, -0.24, DY, 0.012, C.gunmetal, 'darkmetal');
  // barrel
  tube(M, -0.235, -0.42, B, 0.027, C.greyDark, 'metal');
  tube(M, -0.4, -0.425, B, 0.03, C.gunmetal, 'darkmetal');
  M.add(cylX(0.021, 0.003), C.bore, 'rubber', { p: [-0.4265, B, 0] });
  // wooden stock
  M.addShaded(
    extrude([[0.022, 0.095], [0.06, 0.09], [0.34, 0.06], [0.355, 0.052], [0.355, -0.062], [0.338, -0.068], [0.08, 0.004], [0.026, 0.02]], 0.042, 0.005),
    woodShade(C.wood, C.woodDark),
    'wood',
  );
  M.add(roundBox(0.02, 0.125, 0.045, 0.006), C.rubber, 'rubber', { p: [0.362, -0.004, 0] });
  M.buildInto(group);

  // revolving drum with six rounds whose noses peek out of the front face
  const drum = part('drum', group, [DX, DY, 0]);
  const D = new GunBuilder();
  D.add(cylX(0.076, 0.15, 24), C.greyLight, 'metal');
  D.add(cylX(0.07, 0.006, 24), C.grey, 'metal', { p: [-0.0755, 0, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const af = a + PI / 6;
    D.add(box(0.13, 0.012, 0.014), C.grey, 'metal', { p: [0, Math.cos(af) * 0.071, Math.sin(af) * 0.071], r: [-af, 0, 0] });
    launcherRoundParts(D, 1.0, -0.092, Math.cos(a) * 0.048, Math.sin(a) * 0.048);
  }
  D.buildInto(drum);

  const muzzle = marker('muzzle', group, [-0.427, B, 0]);
  const ejector = marker('ejector', group, [-0.06, DY, 0.05], [0.3, 0.3, 1]);
  const support = marker('support', group, [-0.17, -0.07, -0.01]);
  const shots = new ShotCounter();
  let angle = 0;
  return finish({
    id: 'flunk',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'shoulder',
    support,
    animate(s) {
      shots.update(s.fireT);
      let target = shots.count * (PI / 3);
      if (s.reloadT >= 0) target += Math.floor(clamp01((s.reloadT - 0.1) / 0.8) * 6) * (PI / 3);
      angle += (target - angle) * clamp01(s.dt * 25);
      drum.rotation.x = angle;
    },
  });
}

// =================================================================== M4
function buildM4(): WeaponModel {
  const B = 0.06;
  const group = new THREE.Group();
  group.name = 'm4';
  const M = new GunBuilder();
  // upper receiver + carry handle
  M.add(roundBox(0.2, 0.046, 0.034, 0.006), C.blued, 'darkmetal', { p: [-0.03, B, 0] });
  M.add(extrudeHoles([[-0.1, 0.08], [0.07, 0.08], [0.07, 0.124], [0.045, 0.13], [-0.075, 0.13], [-0.1, 0.112]], [[[-0.075, 0.09], [0.045, 0.09], [0.045, 0.114], [-0.075, 0.114]]], 0.022, 0.003), C.blued, 'darkmetal');
  M.add(box(0.016, 0.014, 0.024), C.bluedDark, 'darkmetal', { p: [0.058, 0.138, 0] });
  M.add(box(0.03, 0.006, 0.004), C.bluedDark, 'darkmetal', { p: [0.0, 0.065, 0.018] }); // port
  M.add(cyl(0.006, 0.006, 0.006, 8).rotateX(PI / 2), C.bluedDark, 'darkmetal', { p: [-0.07, 0.07, 0.019] }); // forward assist
  // lower receiver + magwell
  M.add(extrude([[-0.125, 0.04], [0.07, 0.04], [0.07, 0.02], [0.03, 0.004], [-0.04, 0.0], [-0.125, 0.012]], 0.032, 0.003), C.polymer, 'darkmetal');
  M.add(roundBox(0.05, 0.034, 0.034, 0.004), C.polymer, 'darkmetal', { p: [-0.085, 0.008, 0] });
  // pistol grip + guard + trigger
  M.add(extrude([[-0.016, 0.016], [0.02, 0.016], [0.04, -0.072], [0.03, -0.08], [-0.002, -0.077], [-0.022, -0.02]], 0.03, 0.004), C.polymer, 'plastic');
  M.add(box(0.05, 0.005, 0.016), C.polymer, 'darkmetal', { p: [-0.04, -0.008, 0] });
  M.add(box(0.005, 0.016, 0.006), C.bluedDark, 'darkmetal', { p: [-0.036, 0.004, 0], r: [0, 0, 0.2] });
  // handguard (ribbed) + delta ring
  tube(M, -0.13, -0.31, 0.057, 0.025, C.polymer, 'plastic');
  for (let i = 0; i < 6; i++) M.add(cylX(0.0255, 0.008), C.polymerHi, 'plastic', { p: [-0.15 - i * 0.03, 0.057, 0] });
  tube(M, -0.125, -0.14, 0.057, 0.029, C.blued, 'darkmetal');
  // front sight tower
  M.add(extrude([[-0.335, 0.05], [-0.305, 0.05], [-0.316, 0.114], [-0.326, 0.114]], 0.014, 0.002), C.blued, 'darkmetal');
  M.add(roundBox(0.03, 0.022, 0.024, 0.004), C.blued, 'darkmetal', { p: [-0.32, 0.06, 0] });
  // barrel + flash hider
  tube(M, -0.31, -0.52, B, 0.0085, C.blued, 'darkmetal');
  tube(M, -0.51, -0.555, B, 0.011, C.bluedDark, 'darkmetal');
  M.add(cylX(0.005, 0.003), C.bore, 'rubber', { p: [-0.5565, B, 0] });
  // buffer tube + collapsible stock
  tube(M, 0.07, 0.24, 0.055, 0.015, C.blued, 'darkmetal');
  M.add(extrude([[0.135, 0.076], [0.3, 0.076], [0.312, 0.07], [0.312, -0.034], [0.3, -0.04], [0.245, -0.02], [0.18, 0.034], [0.135, 0.04]], 0.04, 0.004), C.polymer, 'plastic');
  M.add(box(0.014, 0.008, 0.03), C.bluedDark, 'darkmetal', { p: [0.075, 0.085, 0] }); // charging handle
  M.buildInto(group);

  const mag = part('magazine', group, [-0.085, -0.008, 0]);
  const Mg = new GunBuilder();
  curvedMag(Mg, [0, 0], 4, 0.045, [-0.04, -0.1, -0.16, -0.22], 0.04, 0.022, C.bluedDark);
  Mg.buildInto(mag);
  const magBase = mag.position.clone();

  const muzzle = marker('muzzle', group, [-0.557, B, 0]);
  const ejector = marker('ejector', group, [0.0, 0.07, 0.02], [0.4, 0.8, 0.6]);
  const support = marker('support', group, [-0.23, -0.004, -0.006]);
  return finish({
    id: 'm4',
    group,
    muzzles: [muzzle],
    ejector,
    magazine: mag,
    hold: 'shoulder',
    support,
    animate(s) {
      magReload(mag, magBase, s.reloadT, new THREE.Vector3(0.12, -1, 0).normalize(), 0.17);
    },
  });
}

// =================================================================== AWP
function buildAWP(): WeaponModel {
  const B = 0.062;
  const group = new THREE.Group();
  group.name = 'awp';
  const M = new GunBuilder();
  // olive thumbhole stock with forend
  M.add(
    extrudeHoles(
      [[-0.5, 0.042], [0.03, 0.042], [0.1, 0.06], [0.36, 0.068], [0.41, 0.062], [0.41, -0.078], [0.38, -0.088], [0.07, -0.088], [0.032, -0.08], [-0.018, -0.074], [-0.034, -0.02], [-0.06, -0.012], [-0.22, -0.012], [-0.5, 0.002]],
      [[[0.052, 0.024], [0.27, 0.034], [0.27, -0.052], [0.075, -0.058], [0.046, -0.032]]],
      0.052,
      0.006,
    ),
    C.olive,
    'plastic',
  );
  M.add(roundBox(0.16, 0.03, 0.05, 0.01), C.oliveDark, 'plastic', { p: [0.24, 0.074, 0] }); // cheek piece
  M.add(roundBox(0.026, 0.158, 0.054, 0.008), C.rubber, 'rubber', { p: [0.42, -0.008, 0] });
  guard(M, -0.04, 0.0, 0.022, 0.005, C.bluedDark, 'darkmetal', 1.1);
  M.add(box(0.006, 0.018, 0.006), C.bluedDark, 'darkmetal', { p: [-0.036, -0.004, 0], r: [0, 0, 0.25] });
  // receiver + bolt shroud
  tube(M, -0.25, 0.012, B, 0.022, C.oliveDark, 'darkmetal');
  tube(M, 0.012, 0.045, B, 0.017, C.bluedDark, 'darkmetal');
  M.add(box(0.06, 0.012, 0.002), C.bluedDark, 'darkmetal', { p: [-0.08, B + 0.008, 0.022] }); // port
  // fluted black barrel + muzzle brake
  tube(M, -0.25, -0.75, B, 0.015, C.bluedDark, 'darkmetal', 0, 0.012);
  for (let i = 0; i < 3; i++) M.add(box(0.2, 0.003, 0.003), C.blued, 'darkmetal', { p: [-0.6, B + Math.cos(i * 2.1) * 0.013, Math.sin(i * 2.1) * 0.013] });
  tube(M, -0.745, -0.8, B, 0.019, C.bluedDark, 'darkmetal');
  for (let i = 0; i < 3; i++) M.add(box(0.008, 0.04, 0.042), C.bore, 'rubber', { p: [-0.762 - i * 0.013, B, 0] });
  M.add(cylX(0.006, 0.003), C.bore, 'rubber', { p: [-0.8015, B, 0] });
  // scope: mounts, tube, objective bell, eyepiece, turrets
  M.add(roundBox(0.022, 0.05, 0.03, 0.004), C.bluedDark, 'darkmetal', { p: [-0.19, 0.1, 0] });
  M.add(roundBox(0.022, 0.05, 0.03, 0.004), C.bluedDark, 'darkmetal', { p: [-0.04, 0.1, 0] });
  tube(M, -0.27, 0.0, 0.135, 0.017, C.blued, 'darkmetal');
  tube(M, -0.27, -0.31, 0.135, 0.017, C.blued, 'darkmetal', 0, 0.031);
  tube(M, -0.31, -0.36, 0.135, 0.031, C.blued, 'darkmetal');
  M.add(cylX(0.026, 0.003), C.lens, 'eye', { p: [-0.3615, 0.135, 0] });
  tube(M, 0.0, 0.035, 0.135, 0.017, C.blued, 'darkmetal', 0, 0.024);
  tube(M, 0.035, 0.075, 0.135, 0.024, C.blued, 'darkmetal');
  M.add(cylX(0.019, 0.003), C.lens, 'eye', { p: [0.0765, 0.135, 0] });
  M.add(cyl(0.014, 0.014, 0.026, 12), C.bluedDark, 'darkmetal', { p: [-0.12, 0.162, 0] });
  M.add(cylZ(0.013, 0.026, 12), C.bluedDark, 'darkmetal', { p: [-0.12, 0.135, 0.026] });
  // laser module under the barrel
  M.add(roundBox(0.06, 0.022, 0.026, 0.005), C.bluedDark, 'darkmetal', { p: [-0.6, B - 0.03, 0] });
  M.add(box(0.012, 0.02, 0.012), C.bluedDark, 'darkmetal', { p: [-0.6, B - 0.016, 0] });
  M.add(cylX(0.007, 0.004), C.laser, 'eye', { p: [-0.632, B - 0.03, 0] });
  M.buildInto(group);

  const bolt = part('bolt', group, [0, B, 0]);
  const Bt = new GunBuilder();
  Bt.add(cylZ(0.005, 0.05), C.stainlessDark, 'metal', { p: [0.0, 0, 0.042] });
  Bt.add(sphere(0.012, 10, 8), C.bluedDark, 'darkmetal', { p: [0.0, 0, 0.068] });
  Bt.buildInto(bolt);

  const mag = part('magazine', group, [-0.11, -0.012, 0]);
  const Mg = new GunBuilder();
  Mg.add(roundBox(0.075, 0.07, 0.032, 0.004), C.bluedDark, 'darkmetal', { p: [0, -0.02, 0] });
  Mg.buildInto(mag);
  const magBase = mag.position.clone();

  const muzzle = marker('muzzle', group, [-0.802, B, 0]);
  const laser = marker('laser', group, [-0.635, B - 0.03, 0]);
  const ejector = marker('ejector', group, [-0.08, B + 0.015, 0.024], [0.4, 0.8, 0.6]);
  const support = marker('support', group, [-0.32, -0.04, -0.006]);
  return finish({
    id: 'awp',
    group,
    muzzles: [muzzle],
    ejector,
    magazine: mag,
    laser,
    hold: 'shoulder',
    support,
    animate(s) {
      // bolt cycles after each shot, and opens during the reload
      let open = 0;
      if (s.fireT >= 0.35 && s.fireT < 1.1) open = smooth(0.35, 0.55, s.fireT) * (1 - smooth(0.85, 1.05, s.fireT));
      if (s.reloadT >= 0) open = Math.max(open, smooth(0.02, 0.12, s.reloadT) * (1 - smooth(0.82, 0.94, s.reloadT)));
      const lift = smooth(0, 0.4, open);
      const back = smooth(0.4, 1, open);
      bolt.rotation.x = -1.2 * lift;
      bolt.position.x = 0.07 * back;
      magReload(mag, magBase, s.reloadT, new THREE.Vector3(0, -1, 0), 0.1, 0.18, 0.5, 0.66);
    },
  });
}

// =================================================================== PUNT GUN "FARFAR"
function buildVintage(): WeaponModel {
  const BU = 0.09; // upper barrel
  const BL = 0.034; // lower barrel
  const B = (BU + BL) / 2;
  const R = 0.028;
  const XM = -1.78; // muzzle
  const group = new THREE.Group();
  group.name = 'vintage';
  const M = new GunBuilder();
  // action / lock
  M.add(roundBox(0.15, 0.13, 0.074, 0.014), C.gunmetal, 'metal', { p: [-0.07, 0.05, 0] });
  M.add(roundBox(0.11, 0.07, 0.078, 0.01), C.gunmetalDark, 'darkmetal', { p: [-0.05, 0.035, 0] });
  M.add(cylZ(0.008, 0.084), C.gunmetalDark, 'darkmetal', { p: [-0.13, 0.0, 0] }); // hinge pin
  // triggers + guard
  guard(M, -0.05, -0.012, 0.026, 0.005, C.gunmetalDark, 'darkmetal', 1.2);
  M.add(box(0.006, 0.022, 0.006), C.gunmetalDark, 'darkmetal', { p: [-0.062, -0.02, 0], r: [0, 0, 0.25] });
  M.add(box(0.006, 0.022, 0.006), C.gunmetalDark, 'darkmetal', { p: [-0.04, -0.02, 0], r: [0, 0, 0.25] });
  // dark red-brown stock
  M.addShaded(
    extrude([[-0.004, 0.11], [0.06, 0.092], [0.44, 0.074], [0.462, 0.064], [0.462, -0.136], [0.432, -0.146], [0.11, -0.062], [0.032, -0.048], [-0.004, -0.03]], 0.068, 0.008),
    woodShade(C.woodRed, C.woodRedDark),
    'wood',
  );
  M.add(roundBox(0.012, 0.21, 0.07, 0.004), C.gunmetal, 'darkmetal', { p: [0.468, -0.036, 0], r: [0, 0, -0.02] });
  M.buildInto(group);

  // barrels + fore-end hinge down at the breech for reloading
  const barrels = part('barrels', group, [-0.13, 0.0, 0]);
  const Bb = new GunBuilder();
  const X0 = -0.015;
  const X1 = XM + 0.13;
  Bb.add(cylX(R, X0 - X1, 18, R * 0.92), C.gunmetal, 'metal', { p: [(X0 + X1) / 2, BU, 0] });
  Bb.add(cylX(R, X0 - X1, 18, R * 0.92), C.gunmetal, 'metal', { p: [(X0 + X1) / 2, BL, 0] });
  Bb.add(box(X0 - X1, BU - BL, 0.02), C.gunmetalDark, 'darkmetal', { p: [(X0 + X1) / 2, B, 0] });
  Bb.add(box(X0 - X1 - 0.05, 0.008, 0.012), C.gunmetalDark, 'darkmetal', { p: [(X0 + X1) / 2, BU + R, 0] }); // top rib
  for (const bx of [-0.36, -0.82, -1.24, X1 + 0.02]) {
    Bb.add(roundBox(0.03, BU - BL + 2 * R + 0.012, 2 * R + 0.012, 0.012), C.gunmetalDark, 'darkmetal', { p: [bx, B, 0] });
  }
  Bb.add(cylX(R * 0.6, 0.003), C.bore, 'rubber', { p: [X1 - 0.0015, BU, 0] });
  Bb.add(cylX(R * 0.6, 0.003), C.bore, 'rubber', { p: [X1 - 0.0015, BL, 0] });
  Bb.add(sphere(0.006, 8, 6), C.brass, 'metal', { p: [X1 + 0.01, BU + R + 0.006, 0] });
  // fore-end under the lower barrel
  Bb.addShaded(
    extrude([[0.0, 0.024], [-0.66, 0.024], [-0.69, 0.008], [-0.66, -0.026], [0.0, -0.034]], 0.07, 0.008),
    woodShade(C.woodRed, C.woodRedDark),
    'wood',
  );
  Bb.buildInto(barrels);
  // the muzzle rides with the barrels
  const muzzle = marker('muzzle', barrels, [X1 - 0.004, B, 0]);

  // two hammers
  const hammers: THREE.Object3D[] = [];
  for (const [hz, hx] of [[0.026, 0.0], [-0.026, -0.008]] as Array<[number, number]>) {
    const h = part('hammer', group, [hx, 0.105, hz]);
    const Hp = new GunBuilder();
    Hp.add(extrude([[-0.012, -0.01], [0.012, -0.01], [0.03, 0.03], [0.05, 0.044], [0.046, 0.054], [0.024, 0.046], [-0.006, 0.016]], 0.012, 0.002), C.gunmetalDark, 'darkmetal');
    Hp.buildInto(h);
    hammers.push(h);
  }

  const ejector = marker('ejector', group, [-0.13, B, 0.0], [0.5, 1, 0.2]);
  const support = marker('support', barrels, [-0.18, -0.06, -0.008]);
  let fall = 1;
  return finish({
    id: 'vintage',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'hip',
    support,
    animate(s) {
      // hammers: cocked by `cock`, snap forward when fired
      if (s.fireT >= 0 && s.fireT < 0.05) fall = 1;
      else if (s.cock > 0) fall = 0;
      const cocked = s.cock > 0 ? smooth(0, 1, s.cock) : fall > 0.5 ? 0 : 1;
      for (const h of hammers) h.rotation.z = 0.35 - 0.9 * cocked;
      const open = s.reloadT >= 0 ? smooth(0.05, 0.2, s.reloadT) * (1 - smooth(0.8, 0.95, s.reloadT)) : 0;
      barrels.rotation.z = 0.32 * open;
    },
  });
}

// =================================================================== MINIGUN

function buildMinigun(): WeaponModel {
  const B = 0.06;
  const XH = -0.33; // housing front
  const group = new THREE.Group();
  group.name = 'minigun';
  const M = new GunBuilder();
  // rear grip assembly
  M.add(roundBox(0.03, 0.15, 0.13, 0.01), C.greyDark, 'metal', { p: [-0.03, 0.05, 0] });
  M.add(roundBox(0.03, 0.12, 0.034, 0.008), C.polymer, 'plastic', { p: [0.012, -0.012, 0], r: [0, 0, -0.12] });
  M.add(box(0.05, 0.02, 0.03), C.greyDark, 'metal', { p: [-0.005, 0.05, 0] });
  M.add(box(0.012, 0.02, 0.016), C.red, 'plastic', { p: [0.012, 0.062, 0] }); // trigger button
  // housing + rear cap + motor
  tube(M, -0.04, XH, B, 0.068, C.grey, 'metal', 0, 0.068, 24);
  tube(M, -0.04, -0.06, B, 0.074, C.greyDark, 'metal', 0, 0.074, 24);
  tube(M, XH + 0.02, XH, B, 0.074, C.greyDark, 'metal', 0, 0.074, 24);
  tube(M, -0.12, -0.27, B + 0.07, 0.03, C.gunmetal, 'darkmetal', -0.04);
  // feed chute port on the near side
  M.add(roundBox(0.08, 0.06, 0.03, 0.008), C.greyDark, 'metal', { p: [-0.16, B, 0.07] });
  // carry handle
  M.add(box(0.016, 0.07, 0.02), C.greyDark, 'metal', { p: [-0.08, B + 0.1, 0] });
  M.add(box(0.016, 0.07, 0.02), C.greyDark, 'metal', { p: [-0.25, B + 0.1, 0] });
  tube(M, -0.07, -0.26, B + 0.14, 0.013, C.polymer, 'plastic');
  // ammo box (olive) on the near side + brass belt into the chute
  M.add(roundBox(0.2, 0.15, 0.1, 0.012), C.od, 'plastic', { p: [-0.1, -0.11, 0.1] });
  M.add(roundBox(0.205, 0.02, 0.105, 0.006), C.odDark, 'plastic', { p: [-0.1, -0.035, 0.1] });
  M.add(box(0.03, 0.012, 0.11), C.greyDark, 'metal', { p: [-0.02, -0.07, 0.1] });
  const belt = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.08, -0.03, 0.13),
    new THREE.Vector3(-0.05, 0.01, 0.16),
    new THREE.Vector3(-0.1, 0.05, 0.14),
    new THREE.Vector3(-0.16, 0.06, 0.09),
  ]);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const p = belt.getPoint(i / (N - 1));
    M.add(cylX(0.006, 0.05, 8), C.brass, 'metal', { p: [p.x, p.y, p.z] });
    M.add(cylX(0.0035, 0.012, 6, 0.0015), C.copper, 'metal', { p: [p.x - 0.031, p.y, p.z] });
    M.add(box(0.012, 0.012, 0.004), C.gunmetal, 'darkmetal', { p: [p.x + 0.01, p.y, p.z] });
  }
  // blue carry strap: from the front of the carry handle up over the shoulder
  const strap = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.25, B + 0.15, 0.0),
    new THREE.Vector3(-0.17, B + 0.25, 0.0),
    new THREE.Vector3(-0.02, B + 0.31, -0.02),
    new THREE.Vector3(0.12, B + 0.27, -0.08),
    new THREE.Vector3(0.2, B + 0.1, -0.16),
  ]);
  M.add(ribbon(strap, 0.006, 0.036, 32), C.strap, 'cloth');
  M.buildInto(group);

  // rotating barrel cluster
  const cluster = part('barrels', group, [XH, B, 0]);
  const L = 0.62;
  const Cb = new GunBuilder();
  const Hot = new GunBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const y = Math.cos(a) * 0.03;
    const z = Math.sin(a) * 0.03;
    Cb.add(cylX(0.0115, 0.3, 10), C.grey, 'metal', { p: [-0.15, y, z] });
    Hot.add(cylX(0.0115, L - 0.3, 10), C.grey, 'metal', { p: [-0.3 - (L - 0.3) / 2, y, z] });
    Hot.add(cylX(0.006, 0.003), C.bore, 'rubber', { p: [-L - 0.0015, y, z] });
  }
  Cb.add(cylX(0.012, L, 10), C.greyDark, 'metal', { p: [-L / 2, 0, 0] });
  for (const cx of [-0.05, -0.36, -L + 0.03]) Cb.add(cylX(0.05, 0.026, 18), C.greyDark, 'metal', { p: [cx, 0, 0] });
  Cb.buildInto(cluster);
  const hotMeshes = Hot.buildInto(cluster);
  const glow = MATERIALS.plastic.clone();
  glow.emissive = new THREE.Color(0, 0, 0);
  for (const m of hotMeshes) if (m.userData.matClass === 'plastic') m.material = glow;

  const muzzle = marker('muzzle', group, [XH - L - 0.005, B, 0]);
  const ejector = marker('ejector', group, [-0.2, B - 0.07, 0.0], [0.4, -1, 0.3]);
  const support = marker('support', group, [-0.165, B + 0.14, 0.0]);
  let angle = 0;
  return finish({
    id: 'minigun',
    group,
    muzzles: [muzzle],
    ejector,
    hold: 'hip',
    support,
    animate(s) {
      angle = (angle + s.spin * 28 * s.dt) % (PI * 2);
      cluster.rotation.x = angle;
      const h = clamp01(s.heat);
      const k = h * h * 2.2;
      glow.emissive.setRGB(1.0 * k, 0.28 * k * h, 0.04 * k * h);
    },
  });
}

// =================================================================== factory
export function createWeaponModel(id: WeaponId): WeaponModel {
  switch (id) {
    case 'pistol':
      return buildPistol();
    case 'magnum':
      return buildMagnum();
    case 'mp5':
      return buildMP5();
    case 'grenades':
      return buildGrenades();
    case 'shotgun':
      return buildShotgun();
    case 'mac10':
      return buildMac10();
    case 'flunk':
      return buildFlunk();
    case 'm4':
      return buildM4();
    case 'awp':
      return buildAWP();
    case 'vintage':
      return buildVintage();
    case 'minigun':
      return buildMinigun();
  }
}

// =================================================================== debris
/** Collects coloured primitives into one geometry (position, normal, color). */
class GeoBuilder {
  private geos: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: Xf = {}): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.applyMatrix4(xfMatrix(xf));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.geos, false)!;
    for (const x of this.geos) x.dispose();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/**
 * Spent casing geometry (vertex coloured, lying along X, origin at its centre).
 * About 2.5x real size so casings read at gameplay scale like the original's.
 * Render with a vertexColors material (e.g. MATERIALS.metal).
 */
export function createShellModel(kind: ShellKind): THREE.BufferGeometry {
  const G = new GeoBuilder();
  const straight = (r: number, len: number) => {
    G.add(cylX(r, len, 10), C.brass, { p: [0, 0, 0] });
    G.add(cylX(r * 1.08, len * 0.08, 10), C.brassDark, { p: [len / 2 - len * 0.04, 0, 0] });
    G.add(cylX(r * 0.35, len * 0.02, 8), C.copper, { p: [len / 2 + len * 0.005, 0, 0] });
  };
  const bottle = (r: number, len: number, neckR: number) => {
    const body = len * 0.68;
    const sh = len * 0.12;
    const neck = len - body - sh;
    const x0 = len / 2;
    G.add(cylX(r, body, 10), C.brass, { p: [x0 - body / 2, 0, 0] });
    G.add(cylX(r, sh, 10, neckR), C.brass, { p: [x0 - body - sh / 2, 0, 0] });
    G.add(cylX(neckR, neck, 10), C.brass, { p: [x0 - body - sh - neck / 2, 0, 0] });
    G.add(cylX(r * 1.05, len * 0.06, 10), C.brassDark, { p: [x0 - len * 0.03, 0, 0] });
    G.add(cylX(r * 0.3, len * 0.015, 8), C.copper, { p: [x0 + len * 0.005, 0, 0] });
  };
  switch (kind) {
    case 'shotgun':
      G.add(cylX(0.02, 0.06, 12), C.red, { p: [-0.009, 0, 0] });
      G.add(cylX(0.0205, 0.02, 12), C.brass, { p: [0.03, 0, 0] });
      G.add(cylX(0.022, 0.003, 12), C.brassDark, { p: [0.041, 0, 0] });
      G.add(cylX(0.012, 0.002, 8), C.bore, { p: [-0.0395, 0, 0] });
      break;
    case 'normal':
      bottle(0.0095, 0.07, 0.0065);
      break;
    case 'awp':
      bottle(0.0125, 0.095, 0.0075);
      break;
    case 'minigun':
      bottle(0.0105, 0.08, 0.007);
      break;
    case 'small':
    case 'none':
    default:
      straight(0.0105, 0.04);
      break;
  }
  return G.build();
}

/** Dropped magazine / clip (origin at its centre). */
export function createClipModel(kind: ClipKind): THREE.Group {
  const g = new THREE.Group();
  g.name = `clip_${kind}`;
  const P = new GunBuilder();
  switch (kind) {
    case 'small':
      P.add(box(0.04, 0.1, 0.026), C.bluedDark, 'darkmetal', { p: [0, 0.006, 0] });
      P.add(roundBox(0.05, 0.012, 0.036, 0.004), C.polymer, 'plastic', { p: [0, -0.05, 0] });
      break;
    case 'mp5':
      curvedMag(P, [0.02, 0.08], 5, 0.037, [-0.06, -0.12, -0.19, -0.26, -0.33], 0.034, 0.024, C.bluedDark);
      break;
    case 'mac':
      P.add(box(0.034, 0.24, 0.028), C.gunmetalDark, 'darkmetal');
      P.add(roundBox(0.04, 0.012, 0.034, 0.004), C.gunmetalDark, 'darkmetal', { p: [0, -0.123, 0] });
      break;
    case 'awp':
      P.add(roundBox(0.075, 0.07, 0.032, 0.004), C.bluedDark, 'darkmetal');
      P.add(cylX(0.006, 0.05, 8), C.brass, 'metal', { p: [0.0, 0.039, 0] });
      break;
    case 'drum':
      P.add(cylZ(0.06, 0.03, 20), C.bluedDark, 'darkmetal');
      break;
    case 'belt':
      for (let i = 0; i < 5; i++) {
        P.add(cylX(0.006, 0.05, 8), C.brass, 'metal', { p: [0, 0, (i - 2) * 0.014] });
        P.add(box(0.012, 0.012, 0.004), C.gunmetal, 'darkmetal', { p: [0.01, 0, (i - 2) * 0.014 + 0.007] });
      }
      break;
    case 'none':
    default:
      break;
  }
  if (!P.empty) P.buildInto(g);
  return g;
}
