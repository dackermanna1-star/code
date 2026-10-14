// The Bosun's six guns (DESIGN §7), procedural.
//
// Convention: origin at the main grip (centre of the trigger hand), barrel
// toward -X, top toward +Y, LEFT side toward +Z (the side the gameplay camera
// sees, since the hunter faces -X). Sizes are real-world-ish, thickened ~30%
// so they read at ~50 px characters.
import * as THREE from 'three';
import { GunBuilder, MATERIALS, PartBuilder, box, cyl, cylX, extrude, hash3, mix, roundBox, sphere, torus, type MatClass } from './kit';
import { blob } from './common';
import { flareShellParts, harpoonBoltParts, HARPOON_BOLT_LENGTH } from './props';
import type { HoldStyle, WeaponAnimState, WeaponModel } from './types';
import type { WeaponId } from '../../config/ids';

const C = {
  blued: 0x2c2f35,
  bluedDark: 0x17181b,
  bore: 0x060606,
  steel: 0xc8ccd2,
  steelDark: 0x8e949a,
  gunmetal: 0x3d4148,
  wood: 0x8a4a22,
  woodDark: 0x5c2e15,
  walnut: 0x6a3a1c,
  walnutDark: 0x45230f,
  brass: 0xdcae40,
  brassDark: 0xa87b25,
  rubber: 0x161616,
  polymer: 0x24262a,
  orange: 0xff6a12,
  orangeDark: 0xc84a0a,
  teal: 0x18a4a0,
  tealDark: 0x0e6e6a,
  red: 0xc8261c,
  cream: 0xece6d6,
  rope: 0xe8a02a,
  ropeDark: 0xa86a18,
};
const PI = Math.PI;
type V3 = [number, number, number];
const V = (x: number, y: number, z: number): V3 => [x, y, z];

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
/** 0 → 1 → 0 window. */
const win = (t: number, a: number, b: number, c: number, d: number) => smooth(a, b, t) * (1 - smooth(c, d, t));

const cylZ = (r: number, len: number, seg = 12, rEnd?: number) => {
  const g = new THREE.CylinderGeometry(rEnd ?? r, r, len, seg);
  g.rotateX(PI / 2);
  return g;
};
function tube(P: PartBuilder, x0: number, x1: number, y: number, rA: number, color: THREE.ColorRepresentation, mat: MatClass, z = 0, rB = rA, seg = 16) {
  const len = Math.abs(x1 - x0);
  const lo = Math.min(x0, x1);
  const rMinus = x0 < x1 ? rA : rB;
  const rPlus = x0 < x1 ? rB : rA;
  P.add(cylX(rPlus, len, seg, rMinus), color, mat, { p: [lo + len / 2, y, z] });
}
function guard(P: PartBuilder, x: number, y: number, r: number, t: number, color: THREE.ColorRepresentation, mat: MatClass, sx = 1) {
  const g = torus(r, t, 6, 14, PI);
  g.rotateZ(PI);
  P.add(g, color, mat, { p: [x, y, 0], s: [sx, 1, 1] });
}
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

/** Extra, model-specific hooks the hunter rig reads (not part of the shared contract). */
export interface WeaponExtras {
  /** Outboard: pull-cord handle (the support hand follows it while yanking) and yank weight 0..1. */
  pullHandle?: THREE.Object3D;
  pullK?: number;
  /** Outboard: engine body (vibrates). */
  engine?: THREE.Object3D;
}
export type LFWeaponModel = WeaponModel & { extras: WeaponExtras };

// =================================================================== REVOLVER "Old Faithful"
function buildRevolver(): LFWeaponModel {
  const B = 0.078; // bore axis
  const CY = 0.058; // cylinder axis
  const group = new THREE.Group();
  group.name = 'revolver';
  const M = new GunBuilder();
  // cherry-wood grip with a brass butt cap
  M.addShaded(
    extrude([[-0.008, 0.034], [0.036, 0.04], [0.056, 0.026], [0.072, -0.04], [0.068, -0.08], [0.05, -0.095], [0.014, -0.09], [-0.004, -0.058], [-0.014, -0.008]], 0.042, 0.006),
    woodShade(C.wood, C.woodDark),
    'wood',
  );
  M.add(roundBox(0.06, 0.014, 0.044, 0.006), C.brass, 'metal', { p: V(0.034, -0.092, 0), r: [0, 0, -0.35] });
  // frame + top strap + recoil shield
  M.add(roundBox(0.13, 0.03, 0.03, 0.007), C.blued, 'darkmetal', { p: V(-0.04, 0.018, 0) });
  M.add(extrude([[-0.016, 0.0], [0.034, 0.034], [0.05, 0.07], [0.04, 0.104], [0.0, 0.11], [-0.016, 0.1]], 0.03, 0.003), C.blued, 'darkmetal');
  M.add(roundBox(0.1, 0.016, 0.028, 0.005), C.blued, 'darkmetal', { p: V(-0.05, 0.097, 0) });
  M.add(roundBox(0.016, 0.085, 0.03, 0.005), C.blued, 'darkmetal', { p: V(-0.1, 0.055, 0) });
  // brass trigger guard + trigger
  guard(M, -0.045, 0.006, 0.026, 0.005, C.brass, 'metal', 1.1);
  M.add(box(0.007, 0.026, 0.007), C.bluedDark, 'darkmetal', { p: V(-0.04, -0.002, 0), r: [0, 0, 0.25] });
  // long barrel with an ejector rod housing and a blade front sight
  tube(M, -0.1, -0.33, B, 0.016, C.blued, 'darkmetal');
  tube(M, -0.1, -0.24, B - 0.026, 0.008, C.bluedDark, 'darkmetal');
  M.add(box(0.016, 0.016, 0.004), C.steel, 'metal', { p: V(-0.318, B + 0.022, 0) });
  M.add(cylX(0.0085, 0.004), C.bore, 'rubber', { p: V(-0.332, B, 0) });
  M.buildInto(group);

  // hammer (pivots at the back of the frame)
  const hammer = part('hammer', group, [0.012, 0.096, 0]);
  const H = new GunBuilder();
  H.add(extrude([[-0.006, -0.012], [0.012, -0.012], [0.036, 0.022], [0.05, 0.03], [0.044, 0.04], [0.02, 0.03], [-0.004, 0.006]], 0.012, 0.002), C.bluedDark, 'darkmetal');
  H.buildInto(hammer);

  // crane + six-shot cylinder (turns 60° per shot, swings out to the camera side on reload)
  const crane = part('crane', group, [-0.055, CY - 0.034, 0]);
  const cylinder = part('cylinder', crane, [0, 0.034, 0]);
  const Cy = new GunBuilder();
  Cy.add(cylX(0.034, 0.068, 18), C.blued, 'darkmetal');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const af = a + PI / 6;
    Cy.add(box(0.046, 0.007, 0.01), C.bluedDark, 'darkmetal', { p: V(0, Math.cos(af) * 0.032, Math.sin(af) * 0.032), r: [-af, 0, 0] });
    Cy.add(cylX(0.0075, 0.003), C.bore, 'rubber', { p: V(-0.0345, Math.cos(a) * 0.02, Math.sin(a) * 0.02) });
    Cy.add(cylX(0.008, 0.003), C.brass, 'metal', { p: V(0.0345, Math.cos(a) * 0.02, Math.sin(a) * 0.02) });
  }
  Cy.buildInto(cylinder);

  const muzzle = marker('muzzle', group, [-0.336, B, 0]);
  const ejector = marker('ejector', cylinder, [0.036, 0, 0], [0.3, -1, 0.2]);
  const support = marker('support', group, [0.04, -0.05, -0.055]);
  const shots = new ShotCounter();
  let angle = 0;
  return {
    id: 'revolver',
    group,
    muzzle,
    ejector,
    support,
    hold: 'pistol',
    extras: {},
    animate(s: WeaponAnimState) {
      shots.update(s.fireT);
      let target = shots.count * (PI / 3);
      // reload: cylinder spins a full turn on the flick closed
      if (s.reloadT >= 0) target += smooth(0.8, 0.95, s.reloadT) * PI * 2;
      angle += (target - angle) * clamp01(s.dt * 30);
      cylinder.rotation.x = angle;
      // hammer: falls on the shot, thumb re-cocks it ("hammer flick")
      const cocked = s.fireT < 0.06 ? 0 : smooth(0.08, 0.2, s.fireT);
      hammer.rotation.z = -0.15 + 0.75 * cocked;
      const out = s.reloadT >= 0 ? smooth(0.04, 0.14, s.reloadT) * (1 - smooth(0.8, 0.9, s.reloadT)) : 0;
      crane.rotation.x = -1.25 * out;
    },
  };
}

// =================================================================== NAIL GUN
function buildNailgun(): LFWeaponModel {
  const group = new THREE.Group();
  group.name = 'nailgun';
  const M = new GunBuilder();
  // rubberised pistol grip (slanted)
  M.add(extrude([[-0.024, 0.03], [0.026, 0.03], [0.046, -0.08], [0.036, -0.095], [-0.006, -0.092], [-0.026, -0.03]], 0.044, 0.008), C.rubber, 'rubber');
  // teal body: air chamber drum on top, motor housing, nose
  M.add(cylX(0.06, 0.2, 18), C.teal, 'plastic', { p: V(-0.06, 0.085, 0) });
  M.add(cylX(0.062, 0.02, 18), C.tealDark, 'plastic', { p: V(0.045, 0.085, 0) });
  M.add(cylX(0.056, 0.02, 18), C.rubber, 'rubber', { p: V(0.06, 0.085, 0) });
  M.add(roundBox(0.12, 0.07, 0.07, 0.018), C.teal, 'plastic', { p: V(-0.14, 0.04, 0) });
  M.add(box(0.1, 0.012, 0.072), C.cream, 'plastic', { p: V(-0.08, 0.135, 0) });
  // nose / driver guide and the safety contact tip
  M.add(roundBox(0.09, 0.045, 0.04, 0.008), C.steelDark, 'metal', { p: V(-0.24, 0.04, 0) });
  M.add(box(0.04, 0.055, 0.03), C.steel, 'metal', { p: V(-0.3, 0.04, 0) });
  M.add(box(0.012, 0.03, 0.04), C.red, 'plastic', { p: V(-0.322, 0.04, 0) });
  M.add(cylX(0.008, 0.004), C.bore, 'rubber', { p: V(-0.33, 0.045, 0) });
  // trigger
  guard(M, -0.05, 0.0, 0.024, 0.005, C.rubber, 'rubber', 1.2);
  M.add(box(0.012, 0.03, 0.01), C.red, 'plastic', { p: V(-0.04, 0.0, 0), r: [0, 0, 0.2] });
  // magazine rail under the body, running back from the nose
  M.add(box(0.2, 0.026, 0.03), C.tealDark, 'plastic', { p: V(-0.17, -0.02, 0), r: [0, 0, -0.18] });
  // air fitting + a short coiled hose
  M.add(cylX(0.012, 0.03, 8), C.brass, 'metal', { p: V(0.04, -0.1, 0), r: [0, 0, 1.2] });
  for (let i = 0; i < 4; i++) {
    M.add(torus(0.03, 0.007, 5, 12), 0xe8c018, 'rubber', { p: V(0.06 + i * 0.006, -0.135 - i * 0.022, 0.0), r: [PI / 2, 0.15, 0] });
  }
  M.add(cyl(0.007, 0.007, 0.08, 6), 0xe8c018, 'rubber', { p: V(0.085, -0.25, 0), r: [0, 0, 0.3] });
  M.buildInto(group);

  // nail strip (copper-headed nails in a row) = the magazine
  const mag = part('magazine', group, [-0.17, -0.02, 0]);
  mag.rotation.z = -0.18;
  const Mg = new GunBuilder();
  for (let i = 0; i < 9; i++) {
    Mg.add(cylX(0.008, 0.004, 6), C.brass, 'metal', { p: V(-0.08 + i * 0.02, -0.02, 0.022) });
    Mg.add(box(0.004, 0.03, 0.004), C.steelDark, 'metal', { p: V(-0.08 + i * 0.02, -0.032, 0.022) });
  }
  Mg.add(box(0.19, 0.012, 0.012), C.brassDark, 'plastic', { p: V(0, -0.024, 0.022) });
  Mg.buildInto(mag);
  const magBase = mag.position.clone();

  // driver (kicks back on every nail)
  const driver = part('driver', group);
  const D = new GunBuilder();
  D.add(cylX(0.014, 0.06, 10), C.steel, 'metal', { p: V(-0.19, 0.085, 0) });
  D.buildInto(driver);

  const muzzle = marker('muzzle', group, [-0.334, 0.045, 0]);
  const support = marker('support', group, [-0.13, 0.12, -0.03]);
  return {
    id: 'nailgun',
    group,
    muzzle,
    magazine: mag,
    support,
    hold: 'pistol',
    extras: {},
    animate(s: WeaponAnimState) {
      driver.position.x = 0.025 * kickCurve(s.fireT, 0.008, 0.04);
      // strip slides out backwards, gone, a new one slides in
      mag.position.copy(magBase);
      mag.visible = true;
      const t = s.reloadT;
      if (t >= 0) {
        const dir = new THREE.Vector3(Math.cos(-0.18), Math.sin(-0.18), 0);
        if (t < 0.25) mag.position.addScaledVector(dir, 0.22 * smooth(0.05, 0.25, t));
        else if (t < 0.55) mag.visible = false;
        else if (t < 0.85) mag.position.addScaledVector(dir, 0.22 * (1 - smooth(0.55, 0.85, t)));
      }
    },
  };
}

// =================================================================== PUMP SHOTGUN
function buildShotgun(): LFWeaponModel {
  const B = 0.06;
  const group = new THREE.Group();
  group.name = 'shotgun';
  const M = new GunBuilder();
  M.add(roundBox(0.2, 0.066, 0.04, 0.009), C.blued, 'darkmetal', { p: V(-0.11, 0.046, 0) });
  M.add(box(0.07, 0.018, 0.002), C.bluedDark, 'darkmetal', { p: V(-0.1, 0.062, 0.0205) });
  tube(M, -0.2, -0.74, B, 0.015, C.blued, 'darkmetal');
  M.add(sphere(0.005, 8, 6), C.brass, 'metal', { p: V(-0.73, B + 0.016, 0) });
  M.add(cylX(0.01, 0.003), C.bore, 'rubber', { p: V(-0.7415, B, 0) });
  tube(M, -0.2, -0.64, 0.025, 0.014, C.blued, 'darkmetal');
  tube(M, -0.64, -0.66, 0.025, 0.015, C.bluedDark, 'darkmetal');
  M.add(box(0.022, 0.036, 0.022), C.bluedDark, 'darkmetal', { p: V(-0.61, 0.043, 0) });
  M.add(roundBox(0.09, 0.016, 0.034, 0.004), C.bluedDark, 'darkmetal', { p: V(-0.045, 0.012, 0) });
  guard(M, -0.05, 0.008, 0.024, 0.005, C.bluedDark, 'darkmetal', 1.15);
  M.add(box(0.007, 0.022, 0.007), C.bluedDark, 'darkmetal', { p: V(-0.045, 0.0, 0), r: [0, 0, 0.25] });
  // walnut stock
  M.addShaded(
    extrude([[-0.018, 0.078], [0.06, 0.068], [0.36, 0.062], [0.375, 0.054], [0.375, -0.08], [0.36, -0.088], [0.11, -0.024], [0.045, -0.05], [0.024, -0.054], [0.0, -0.034], [-0.018, 0.016]], 0.044, 0.006),
    woodShade(C.walnut, C.walnutDark),
    'wood',
  );
  M.add(roundBox(0.024, 0.15, 0.048, 0.008), C.rubber, 'rubber', { p: V(0.385, -0.012, 0) });
  M.buildInto(group);

  const pump = part('pump', group);
  const Pp = new GunBuilder();
  Pp.addShaded(roundBox(0.18, 0.046, 0.05, 0.018), woodShade(C.walnut, C.walnutDark), 'wood', { p: V(-0.38, 0.03, 0) });
  for (let i = 0; i < 6; i++) Pp.add(box(0.006, 0.048, 0.0515), C.walnutDark, 'wood', { p: V(-0.32 - i * 0.024, 0.03, 0) });
  Pp.buildInto(pump);
  const support = marker('support', pump, [-0.31, -0.012, -0.006]);

  const muzzle = marker('muzzle', group, [-0.744, B, 0]);
  const ejector = marker('ejector', group, [-0.1, 0.072, 0.022], [0.4, 0.8, 0.6]);
  return {
    id: 'shotgun',
    group,
    muzzle,
    ejector,
    support,
    hold: 'shoulder',
    extras: {},
    animate(s: WeaponAnimState) {
      const c = s.cock > 0 && s.cock < 1 ? Math.sin(PI * s.cock) : 0;
      pump.position.x = 0.1 * c;
    },
  };
}

// =================================================================== FLARE PISTOL
function buildFlare(): LFWeaponModel {
  const B = 0.075;
  const R = 0.034;
  const group = new THREE.Group();
  group.name = 'flare';
  const M = new GunBuilder();
  // orange frame + grip with a black grip panel
  M.add(extrude([[-0.026, 0.044], [0.032, 0.05], [0.052, -0.07], [0.042, -0.088], [-0.002, -0.086], [-0.016, -0.06], [-0.03, 0.006]], 0.046, 0.008), C.orange, 'plastic');
  M.add(extrude([[-0.012, 0.0], [0.03, 0.006], [0.042, -0.07], [0.002, -0.072]], 0.048, 0.002), C.rubber, 'rubber');
  M.add(roundBox(0.09, 0.05, 0.05, 0.012), C.orange, 'plastic', { p: V(-0.04, 0.054, 0) });
  // hammer spur + big trigger guard
  M.add(extrude([[0.02, 0.07], [0.034, 0.07], [0.05, 0.095], [0.042, 0.1], [0.024, 0.086]], 0.014, 0.002), C.rubber, 'rubber');
  guard(M, -0.045, 0.012, 0.03, 0.007, C.orange, 'plastic', 1.15);
  M.add(box(0.008, 0.028, 0.008), C.rubber, 'rubber', { p: V(-0.04, 0.002, 0), r: [0, 0, 0.25] });
  // hinge pin
  M.add(cylZ(0.009, 0.056, 10), C.steelDark, 'metal', { p: V(-0.08, 0.044, 0) });
  M.buildInto(group);

  // barrel (breaks open downwards about the hinge)
  const barrel = part('barrel', group, [-0.08, 0.044, 0]);
  const Bb = new GunBuilder();
  Bb.add(cylX(R, 0.21, 18), C.orange, 'plastic', { p: V(-0.08, B - 0.044, 0) });
  Bb.add(cylX(R * 1.12, 0.03, 18), C.orangeDark, 'plastic', { p: V(-0.17, B - 0.044, 0) });
  Bb.add(cylX(R * 1.08, 0.02, 18), C.orangeDark, 'plastic', { p: V(0.015, B - 0.044, 0) });
  Bb.add(cylX(R * 0.72, 0.004), C.bore, 'rubber', { p: V(-0.187, B - 0.044, 0) });
  Bb.add(box(0.03, 0.012, 0.03), C.orangeDark, 'plastic', { p: V(-0.005, -0.004, 0) });
  Bb.buildInto(barrel);
  // the cartridge (= magazine): its brass base shows at the breech when the gun breaks open
  const cart = part('magazine', barrel, [0.0, B - 0.044, 0]);
  const Ct = new GunBuilder();
  flareShellParts(Ct, -0.035, 0, 0, 1.25);
  Ct.buildInto(cart);
  // the flare's nose, visible in the muzzle while loaded
  const nose = part('flareNose', barrel);
  const Fn = new GunBuilder();
  Fn.add(cylX(R * 0.7, 0.004), 0xff3a10, 'glow', { p: V(-0.184, B - 0.044, 0) });
  Fn.buildInto(nose);

  const muzzle = marker('muzzle', group, [-0.27, B, 0]);
  const ejector = marker('ejector', barrel, [0.03, B - 0.044, 0.0], [1, 0.6, 0.2]);
  const support = marker('support', group, [0.036, -0.055, -0.058]);
  return {
    id: 'flare',
    group,
    muzzle,
    ejector,
    magazine: cart,
    support,
    hold: 'pistol',
    extras: {},
    animate(s: WeaponAnimState) {
      const t = s.reloadT;
      const open = t >= 0 ? smooth(0.04, 0.18, t) * (1 - smooth(0.78, 0.86, t)) : 0;
      barrel.rotation.z = -0.95 * open;
      // spent cartridge pops at 0.22, new one in from 0.55
      cart.visible = t >= 0 ? t < 0.22 || t > 0.55 : s.loaded;
      cart.position.x = t >= 0.55 && t < 0.7 ? 0.07 * (1 - smooth(0.55, 0.7, t)) : 0;
      nose.visible = s.loaded && t < 0;
    },
  };
}

// =================================================================== HARPOON GUN
function buildHarpoon(): LFWeaponModel {
  const B = 0.075;
  const group = new THREE.Group();
  group.name = 'harpoon';
  const M = new GunBuilder();
  // heavy launch tube (marine green) with reinforcement rings
  tube(M, -0.04, -0.72, B, 0.04, 0x3a5a4a, 'plastic', 0, 0.036, 18);
  for (const x of [-0.1, -0.36, -0.6]) M.add(cylX(0.045, 0.03, 18), C.steelDark, 'metal', { p: V(x, B, 0) });
  M.add(cylX(0.046, 0.04, 18), C.steelDark, 'metal', { p: V(-0.71, B, 0) });
  M.add(cylX(0.028, 0.004), C.bore, 'rubber', { p: V(-0.732, B, 0) });
  // breech block + air cylinder underneath
  M.add(roundBox(0.12, 0.09, 0.07, 0.016), C.gunmetal, 'darkmetal', { p: V(-0.02, 0.06, 0) });
  tube(M, -0.1, -0.5, 0.012, 0.022, 0x2a3a34, 'plastic');
  // pistol grip + guard + trigger
  M.add(extrude([[-0.022, 0.03], [0.024, 0.03], [0.042, -0.08], [0.032, -0.092], [-0.006, -0.09], [-0.026, -0.03]], 0.04, 0.006), C.rubber, 'rubber');
  guard(M, -0.045, 0.012, 0.024, 0.005, C.gunmetal, 'darkmetal', 1.15);
  M.add(box(0.007, 0.022, 0.007), C.steelDark, 'metal', { p: V(-0.04, 0.004, 0), r: [0, 0, 0.25] });
  // teak stock
  M.addShaded(
    extrude([[0.02, 0.1], [0.08, 0.09], [0.33, 0.07], [0.345, 0.06], [0.345, -0.07], [0.33, -0.078], [0.1, -0.02], [0.03, -0.03]], 0.046, 0.006),
    woodShade(0x9a6a3a, 0x6a4422),
    'wood',
  );
  M.add(roundBox(0.022, 0.14, 0.05, 0.008), C.rubber, 'rubber', { p: V(0.355, 0.0, 0) });
  // reel bracket on the near side
  M.add(box(0.03, 0.06, 0.03), C.gunmetal, 'darkmetal', { p: V(-0.2, 0.012, 0.04) });
  // ring sight
  M.add(torus(0.016, 0.003, 5, 12), C.steelDark, 'metal', { p: V(-0.5, B + 0.06, 0), r: [0, PI / 2, 0] });
  M.add(box(0.004, 0.02, 0.004), C.steelDark, 'metal', { p: V(-0.5, B + 0.04, 0) });
  M.buildInto(group);

  // line spool (rotates when the bolt flies / reels in)
  const spool = part('spool', group, [-0.2, -0.02, 0.085]);
  const Sp = new GunBuilder();
  Sp.add(cylZ(0.06, 0.008, 18), C.steelDark, 'metal', { p: V(0, 0, 0.032) });
  Sp.add(cylZ(0.06, 0.008, 18), C.steelDark, 'metal', { p: V(0, 0, -0.032) });
  Sp.add(cylZ(0.046, 0.056, 18), C.rope, 'cloth');
  for (let i = 0; i < 5; i++) Sp.add(torus(0.046, 0.004, 4, 18), C.ropeDark, 'cloth', { p: V(0, 0, -0.024 + i * 0.012) });
  Sp.add(box(0.012, 0.03, 0.01), C.red, 'plastic', { p: V(0.04, 0.0, 0.04) });
  Sp.add(cylZ(0.008, 0.03, 8), C.rubber, 'rubber', { p: V(0.04, 0.0, 0.058) });
  Sp.buildInto(spool);
  // line from the spool along the tube to the bolt's eye
  const line = part('line', group);
  const Ln = new GunBuilder();
  Ln.add(cylX(0.004, 0.52, 5), C.rope, 'cloth', { p: V(-0.46, 0.035, 0.05), r: [0, 0.05, 0.1] });
  Ln.buildInto(line);

  // the bolt (= magazine): seated in the tube, its barbed head out of the muzzle
  const L = HARPOON_BOLT_LENGTH;
  const seatX = -0.72 + L - 0.26;
  const bolt = part('magazine', group, [seatX, B, 0]);
  bolt.add(harpoonBoltParts());

  const muzzle = marker('muzzle', group, [-0.735, B, 0]);
  const support = marker('support', group, [-0.3, 0.02, -0.03]);
  let spin = 0;
  return {
    id: 'harpoon',
    group,
    muzzle,
    magazine: bolt,
    support,
    hold: 'shoulder',
    extras: {},
    animate(s: WeaponAnimState) {
      const t = s.reloadT;
      // spool: pays out fast after the shot, then reels in
      const rate = s.fireT < 0.35 ? 40 : s.fireT < 1.4 ? -8 : 0;
      spin += rate * s.dt;
      spool.rotation.z = spin;
      line.visible = s.loaded || t >= 0.55;
      if (t >= 0) {
        // the new bolt is laid on top of the open breech, drops in and is slid home
        bolt.visible = t > 0.45;
        bolt.position.x = seatX + 0.25 * (1 - smooth(0.7, 0.85, t));
        bolt.position.y = B + 0.09 * (1 - smooth(0.52, 0.7, t));
      } else {
        bolt.visible = s.loaded;
        bolt.position.set(seatX, B, 0);
      }
    },
  };
}

// =================================================================== "OUTBOARD" MINIGUN
// A boat outboard motor turned into a gatling: the engine head rides at the
// Bosun's hip behind the tiller grip, the leg points forward, and where the
// propeller should be a six-barrel cluster spins (the prop still spins too).
function buildOutboard(): LFWeaponModel {
  const B = -0.07; // barrel / leg axis relative to the tiller grip
  const group = new THREE.Group();
  group.name = 'outboard';
  const engine = part('engine', group);
  // tiller handle (the main grip) with a red twist throttle, arm back to the engine
  const T = new GunBuilder();
  T.add(cylX(0.027, 0.13, 12), C.rubber, 'rubber', { p: V(-0.01, 0, 0) });
  T.add(cylX(0.029, 0.04, 12), C.red, 'plastic', { p: V(-0.085, 0, 0) });
  T.add(cylX(0.022, 0.12, 10), 0x2a2a2e, 'plastic', { p: V(0.1, -0.015, 0), r: [0, 0, 0.2] });
  T.buildInto(group);

  // engine head: tall rounded cowling, cream with a red band and a black cap
  const E = new GunBuilder();
  const cx = 0.27;
  const cy = 0.0;
  const cowl = (base: number) => (_p: THREE.Vector3, n: THREE.Vector3) => new THREE.Color(base).multiplyScalar(0.84 + 0.22 * Math.max(0, n.y) - 0.1 * Math.max(0, -n.y));
  E.addShaded(roundBox(0.28, 0.24, 0.25, 0.07, 3), cowl(C.cream), 'plastic', { p: V(cx, cy - 0.03, 0) });
  E.addShaded(roundBox(0.285, 0.05, 0.255, 0.02, 2), cowl(C.red), 'plastic', { p: V(cx, cy + 0.06, 0) });
  E.addShaded(roundBox(0.27, 0.09, 0.24, 0.05, 3), cowl(0x26262c), 'plastic', { p: V(cx, cy + 0.115, 0) });
  // brand plate on the near side: navy with a white flash
  E.add(roundBox(0.14, 0.045, 0.006, 0.004), 0x1a2a6a, 'plastic', { p: V(cx, cy - 0.06, 0.125) });
  E.add(box(0.1, 0.012, 0.004), 0xf0f0f0, 'plastic', { p: V(cx, cy - 0.06, 0.13) });
  // cord exit on the front-top, exhaust stub and lower cowl
  E.add(cylX(0.018, 0.03, 10), C.rubber, 'rubber', { p: V(cx - 0.14, cy + 0.12, 0.05) });
  E.add(cyl(0.022, 0.026, 0.07, 10), C.gunmetal, 'darkmetal', { p: V(cx + 0.05, cy - 0.18, -0.06) });
  E.add(roundBox(0.22, 0.08, 0.2, 0.03), 0x2a2a30, 'plastic', { p: V(cx - 0.02, B - 0.01, 0) });
  // the leg (drive shaft housing), anti-cavitation plate, carry handle on top
  E.add(roundBox(0.66, 0.085, 0.07, 0.03), 0x2e2e34, 'plastic', { p: V(-0.27, B, 0) });
  E.add(box(0.3, 0.012, 0.14), C.gunmetal, 'darkmetal', { p: V(-0.44, B + 0.045, 0) });
  E.add(box(0.02, 0.07, 0.02), C.gunmetal, 'darkmetal', { p: V(-0.2, B + 0.075, -0.035) });
  E.add(box(0.02, 0.07, 0.02), C.gunmetal, 'darkmetal', { p: V(-0.36, B + 0.075, -0.035) });
  E.add(cylX(0.016, 0.2, 8), C.rubber, 'rubber', { p: V(-0.28, B + 0.11, -0.035) });
  // gearcase "torpedo" + skeg
  E.add(blob(0.13, 0.06, 0.062, 14, 10), 0x2e2e34, 'plastic', { p: V(-0.66, B, 0) });
  E.add(box(0.12, 0.09, 0.012), 0x2e2e34, 'plastic', { p: V(-0.64, B - 0.09, 0), r: [0, 0, -0.3] });
  // ammo feed chute from the can into the leg
  E.add(roundBox(0.05, 0.12, 0.04, 0.012), C.gunmetal, 'darkmetal', { p: V(-0.12, B - 0.08, 0.06), r: [0, 0, 0.5] });
  E.buildInto(engine);

  // ammo can (magazine) slung under the leg on the near side, brass belt up into the chute
  const mag = part('magazine', engine, [-0.2, B - 0.17, 0.09]);
  const Mg = new GunBuilder();
  Mg.add(roundBox(0.2, 0.13, 0.09, 0.012), 0x4a5a2c, 'plastic');
  Mg.add(roundBox(0.205, 0.018, 0.095, 0.006), 0x3a4622, 'plastic', { p: V(0, 0.065, 0) });
  Mg.add(box(0.07, 0.014, 0.096), 0xf0e0a0, 'plastic', { p: V(0.02, 0.0, 0.0) });
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    Mg.add(cylX(0.006, 0.04, 6), C.brass, 'metal', { p: V(0.06 + t * 0.05, 0.075 + t * 0.07, -0.01 - t * 0.03), r: [0, 0, PI / 2] });
  }
  Mg.buildInto(mag);
  const magBase = mag.position.clone();

  // propeller (3 blades) on the shaft just behind the barrel cluster
  const prop = part('prop', engine, [-0.79, B, 0]);
  const Pr = new GunBuilder();
  Pr.add(cylX(0.04, 0.06, 12), C.steelDark, 'metal');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    Pr.add(roundBox(0.03, 0.13, 0.055, 0.015), C.brass, 'metal', { p: V(0, Math.cos(a) * 0.08, Math.sin(a) * 0.08), r: [-a, 0.5, 0] });
  }
  Pr.buildInto(prop);

  // rotating six-barrel cluster
  const XB = -0.83;
  const cluster = part('barrels', engine, [XB, B, 0]);
  const Lb = 0.42;
  const Cb = new GunBuilder();
  const Hot = new GunBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const y = Math.cos(a) * 0.03;
    const z = Math.sin(a) * 0.03;
    Cb.add(cylX(0.011, 0.16, 8), C.steelDark, 'metal', { p: V(-0.08, y, z) });
    Hot.add(cylX(0.011, Lb - 0.16, 8), C.steelDark, 'plastic', { p: V(-0.16 - (Lb - 0.16) / 2, y, z) });
    Hot.add(cylX(0.006, 0.003), C.bore, 'rubber', { p: V(-Lb - 0.0015, y, z) });
  }
  Cb.add(cylX(0.011, Lb, 8), C.gunmetal, 'darkmetal', { p: V(-Lb / 2, 0, 0) });
  for (const x of [-0.02, -0.2, -Lb + 0.03]) Cb.add(cylX(0.05, 0.022, 16), C.gunmetal, 'darkmetal', { p: V(x, 0, 0) });
  Cb.buildInto(cluster);
  const hot = Hot.buildInto(cluster);
  const glow = MATERIALS.plastic.clone();
  glow.emissive = new THREE.Color(0, 0, 0);
  for (const m of hot) if (m.userData.matClass === 'plastic') m.material = glow;

  // pull-start T-handle + cord (unit cylinder stretched to the handle)
  const cordFrom = new THREE.Vector3(cx - 0.155, cy + 0.12, 0.05);
  const handleRest = new THREE.Vector3(cx - 0.175, cy + 0.12, 0.05);
  const pullHandle = part('pullHandle', engine, [handleRest.x, handleRest.y, handleRest.z]);
  const Ph = new GunBuilder();
  Ph.add(cylZ(0.014, 0.08, 8), C.rubber, 'rubber');
  Ph.buildInto(pullHandle);
  const cord = part('cord', engine);
  const Cd = new GunBuilder();
  Cd.add(cyl(0.004, 0.004, 1, 5), 0xe8e0d0, 'cloth', { p: V(0, 0.5, 0) });
  Cd.buildInto(cord);
  cord.position.copy(cordFrom);

  const muzzle = marker('muzzle', group, [XB - Lb - 0.005, B, 0]);
  const ejector = marker('ejector', group, [-0.4, B - 0.05, 0.04], [0.3, -1, 0.4]);
  const support = marker('support', engine, [-0.28, B + 0.11, -0.035]);
  let angle = 0;
  let lastSpin = 0;
  let pullT = -1;
  const extras: WeaponExtras = { pullHandle, pullK: 0, engine };
  const _a = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  return {
    id: 'outboard',
    group,
    muzzle,
    ejector,
    magazine: mag,
    support,
    hold: 'hip',
    extras,
    animate(s: WeaponAnimState) {
      angle = (angle + s.spin * 30 * s.dt) % (PI * 2);
      cluster.rotation.x = angle;
      prop.rotation.x = -angle * 1.3;
      const h = clamp01(s.heat);
      const k = h * h * 1.8;
      glow.emissive.setRGB(1.0 * k, 0.22 * k * h, 0.02 * k * h);
      // engine vibration when running
      const vib = s.spin > 0.02 ? 0.002 + 0.004 * s.spin : 0;
      engine.position.set((Math.random() - 0.5) * vib, (Math.random() - 0.5) * vib, 0);
      // pull-start: on a cold start (spin rising from zero) or at the end of a reload
      if (s.spin > 0.001 && lastSpin <= 0.001 && pullT < 0) pullT = 0;
      lastSpin = s.spin;
      let yank = 0;
      if (pullT >= 0) {
        pullT += s.dt;
        yank = Math.sin(clamp01(pullT / 0.45) * PI);
        if (pullT > 0.45) pullT = -1;
      }
      if (s.reloadT >= 0) yank = Math.max(yank, win(s.reloadT, 0.74, 0.84, 0.86, 0.95));
      extras.pullK = s.reloadT >= 0 ? win(s.reloadT, 0.68, 0.74, 0.95, 1.0) : pullT >= 0 ? Math.min(1, pullT / 0.08) : 0;
      // the handle is yanked up and back, away from the hood
      pullHandle.position.copy(handleRest).add(_a.set(0.1, 0.26, -0.2).multiplyScalar(yank));
      _a.copy(pullHandle.position).sub(cordFrom);
      const len = Math.max(0.001, _a.length());
      cord.scale.set(1, len, 1);
      cord.quaternion.setFromUnitVectors(_up, _a.normalize());
      cord.visible = len > 0.03;
      // ammo can swap
      mag.position.copy(magBase);
      mag.visible = true;
      const t = s.reloadT;
      if (t >= 0) {
        if (t < 0.18) mag.position.y -= 0.25 * smooth(0.06, 0.18, t);
        else if (t < 0.42) mag.visible = false;
        else if (t < 0.6) mag.position.y -= 0.12 * (1 - smooth(0.42, 0.6, t));
      }
    },
  };
}

// =================================================================== factory
export function createWeaponModel(id: WeaponId): LFWeaponModel {
  let m: LFWeaponModel;
  switch (id) {
    case 'revolver':
      m = buildRevolver();
      break;
    case 'nailgun':
      m = buildNailgun();
      break;
    case 'shotgun':
      m = buildShotgun();
      break;
    case 'flare':
      m = buildFlare();
      break;
    case 'harpoon':
      m = buildHarpoon();
      break;
    case 'outboard':
      m = buildOutboard();
      break;
  }
  m.group.userData.weaponId = id;
  m.animate({ fireT: 99, reloadT: -1, spin: 0, heat: 0, cock: 0, loaded: true, dt: 0 });
  return m;
}

/** Muzzle position relative to the grip in the rest pose (group space). */
export function muzzleRest(m: WeaponModel): THREE.Vector3 {
  m.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(m.group.matrixWorld).invert();
  return m.muzzle.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
}

export type { HoldStyle };
