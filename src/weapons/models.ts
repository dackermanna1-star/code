import * as THREE from 'three';
import { C, ModelBuilder, V3 } from './ModelBuilder';

/**
 * Procedural voxel weapon models. Weapon space: origin at the firing grip,
 * -Z forward, +Y up. Each model exposes animatable parts and anchors:
 *   grip (right hand), support (left hand), muzzle, eject, sight (ADS eye point),
 *   magwell (reload target).
 */
export interface WeaponModel {
  mb: ModelBuilder;
  /** Hip position of the model root in camera space. */
  hip: V3;
  /** Eye relief distance for ADS. */
  eye: number;
  /** Two-handed? (pistols use a cupped support hand). */
  twoHand: boolean;
}

type Builder = (mb: ModelBuilder, visual: string[]) => Partial<WeaponModel>;

const R = Math.PI / 180;

// ---------------------------------------------------------------- components
function pistolGrip(mb: ModelBuilder, z: number, color: number, angle = 18, len = 0.1, w = 0.03, d = 0.045, parent?: string) {
  mb.box([w, len, d], [0, -len / 2 + 0.01, z + Math.sin(angle * R) * len * 0.5], color, parent, [angle * R, 0, 0]);
}
function triggerGuard(mb: ModelBuilder, z: number, color: number, size = 0.05) {
  mb.box([0.008, 0.006, size], [0, -0.035, z - size / 2 + 0.005], color);
  mb.box([0.008, 0.03, 0.006], [0, -0.022, z - size + 0.008], color);
  const tr = mb.part('trigger', [0, -0.012, z - size * 0.45]);
  mb.box([0.005, 0.02, 0.006], [0, -0.008, 0], C.BLACK, tr, [0.3, 0, 0]);
}
function barrel(mb: ModelBuilder, r: number, len: number, z0: number, y: number, color: number, parent?: string, seg = 8) {
  mb.cyl(r, len, [0, y, z0 - len / 2], color, parent, 'z', seg);
}
function frontSight(mb: ModelBuilder, z: number, y: number, parent?: string) {
  mb.box([0.004, 0.012, 0.006], [0, y + 0.006, z], C.BLACK, parent);
}
function rearSight(mb: ModelBuilder, z: number, y: number, parent?: string) {
  mb.box([0.006, 0.01, 0.006], [-0.006, y + 0.005, z], C.BLACK, parent);
  mb.box([0.006, 0.01, 0.006], [0.006, y + 0.005, z], C.BLACK, parent);
}
function rail(mb: ModelBuilder, len: number, z: number, y: number, color = C.BLACK, parent?: string) {
  mb.box([0.022, 0.006, len], [0, y, z], color, parent);
  for (let i = 0; i < len / 0.012; i++) mb.box([0.024, 0.004, 0.005], [0, y + 0.004, z - len / 2 + i * 0.012 + 0.006], color, parent);
}
function scope(mb: ModelBuilder, len: number, r: number, z: number, y: number, color = C.BLACK, lens = C.GLASS) {
  const p = mb.part('scope', [0, y, z]);
  mb.cyl(r, len, [0, 0, 0], color, p, 'z', 10);
  mb.cyl(r * 1.35, len * 0.22, [0, 0, -len / 2 + len * 0.1], color, p, 'z', 10);
  mb.cyl(r * 1.2, len * 0.18, [0, 0, len / 2 - len * 0.09], color, p, 'z', 10);
  mb.cyl(r * 1.1, 0.004, [0, 0, -len / 2 - 0.001], lens, p, 'z', 10, 0x10202a);
  mb.box([0.012, 0.018, 0.018], [0, r + 0.006, 0], color, p);
  mb.box([0.018, 0.012, 0.018], [r + 0.006, 0, 0], color, p);
  mb.box([0.014, r * 0.9, 0.012], [0, -r * 0.8, len * 0.25], color, p);
  mb.box([0.014, r * 0.9, 0.012], [0, -r * 0.8, -len * 0.25], color, p);
  mb.anchor('sight', [0, y, z + len / 2 - 0.02]);
}
function redDot(mb: ModelBuilder, z: number, y: number) {
  const p = mb.part('optic', [0, y, z]);
  mb.box([0.03, 0.028, 0.045], [0, 0.014, 0], C.BLACK, p);
  mb.box([0.022, 0.018, 0.002], [0, 0.018, -0.023], C.GLASS, p);
  mb.box([0.003, 0.003, 0.002], [0, 0.018, -0.02], C.GLOW_R, p, undefined, 0xff2010);
  mb.anchor('sight', [0, y + 0.018, z + 0.02]);
}
function boxMag(mb: ModelBuilder, w: number, h: number, d: number, pos: V3, color: number, angle = 0, name = 'mag') {
  const p = mb.part(name, pos);
  mb.box([w, h, d], [0, -h / 2, 0], color, p, [angle * R, 0, 0]);
  mb.box([w + 0.004, 0.008, d + 0.004], [0, -h + 0.003, Math.sin(angle * R) * h * 0.5], C.BLACK, p);
  return p;
}
function curvedMag(mb: ModelBuilder, w: number, h: number, d: number, pos: V3, color: number, curve = 25, name = 'mag') {
  const p = mb.part(name, pos);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const a = (curve * t) * R;
    const seg = h / n;
    mb.box([w, seg + 0.004, d], [0, -seg * (i + 0.5), -Math.sin(a) * h * 0.55 * t], color, p, [a, 0, 0]);
  }
  return p;
}
function drumMag(mb: ModelBuilder, r: number, w: number, pos: V3, color: number, name = 'mag') {
  const p = mb.part(name, pos);
  mb.cyl(0.018, 0.03, [0, -0.015, 0], color, p, 'y', 6);
  mb.cyl(r, w, [0, -0.03 - r, 0], color, p, 'x', 12);
  mb.cyl(r * 0.35, w + 0.006, [0, -0.03 - r, 0], C.STEEL, p, 'x', 8);
  return p;
}
function stockSolid(mb: ModelBuilder, z0: number, len: number, color: number, drop = 0.02, h = 0.06, w = 0.036) {
  mb.box([w, h, len], [0, -0.01 - drop / 2, z0 + len / 2], color, undefined, [-Math.atan2(drop, len), 0, 0]);
  mb.box([w + 0.004, h + 0.014, 0.012], [0, -0.012 - drop, z0 + len], C.RUBBER);
}
function stockSkeleton(mb: ModelBuilder, z0: number, len: number, color: number) {
  mb.box([0.012, 0.012, len], [0, 0.005, z0 + len / 2], color);
  mb.box([0.012, 0.012, len], [0, -0.045, z0 + len / 2], color);
  mb.box([0.03, 0.07, 0.012], [0, -0.02, z0 + len], color);
}

function grip(mb: ModelBuilder, pos: V3 = [0, -0.03, 0.012], rot: V3 = [0.3, 0, 0]) {
  mb.anchor('grip', pos, undefined, rot);
}

// ---------------------------------------------------------------- models
const MODELS: Record<string, Builder> = {
  m686(mb) {
    const col = C.CHROME;
    mb.box([0.03, 0.045, 0.085], [0, 0.01, -0.035], col); // frame
    mb.box([0.03, 0.02, 0.03], [0, 0.028, -0.005], col);
    const bar = mb.part('barrel', [0, 0.0, -0.08]);
    mb.box([0.018, 0.02, 0.105], [0, 0.028, -0.052], col, bar); // barrel
    mb.box([0.016, 0.018, 0.1], [0, 0.009, -0.05], col, bar); // underlug
    mb.box([0.006, 0.006, 0.1], [0, 0.04, -0.05], col, bar); // rib
    mb.box([0.005, 0.012, 0.012], [0, 0.046, -0.098], C.RED, bar); // front sight insert
    mb.cyl(0.006, 0.004, [0, 0.028, -0.106], C.BLACK, bar, 'z', 8);
    // crane + cylinder swing out to the left
    const crane = mb.part('crane', [-0.012, 0.004, -0.05]);
    const cyl = mb.part('cylinder', [0.012, 0.016, 0.0], crane);
    mb.cyl(0.021, 0.042, [0, 0, 0], C.STEEL, cyl, 'z', 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      mb.cyl(0.004, 0.044, [Math.cos(a) * 0.013, Math.sin(a) * 0.013, 0], C.DARK, cyl, 'z', 5);
    }
    // speedloader rounds (shown in the cylinder when loaded)
    mb.box([0.004, 0.02, 0.004], [-0.016, -0.002, 0.018], col, crane);
    mb.box([0.012, 0.012, 0.012], [0, 0.034, -0.002], col); // top strap
    const hammer = mb.part('hammer', [0, 0.03, 0.008]);
    mb.box([0.008, 0.02, 0.008], [0, 0.008, 0.004], C.STEEL, hammer, [-0.4, 0, 0]);
    rearSight(mb, -0.001, 0.037);
    triggerGuard(mb, 0.0, col, 0.035);
    pistolGrip(mb, 0.012, C.RUBBER, 16, 0.075, 0.03, 0.04);
    mb.box([0.028, 0.02, 0.03], [0, -0.004, 0.01], col);
    grip(mb);
    mb.anchor('support', [-0.012, -0.045, 0.012], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.028, -0.19]);
    mb.anchor('eject', [0, 0.016, -0.05]);
    mb.anchor('sight', [0, 0.043, 0.02]);
    mb.anchor('magwell', [-0.03, 0.02, -0.02]);
    return { hip: [0.12, -0.11, -0.3], eye: 0.2, twoHand: true };
  },
  m500(mb) {
    const r = MODELS.m686(mb, []);
    mb.root.scale.set(1.18, 1.18, 1.22);
    const bar = mb.parts.barrel;
    mb.box([0.022, 0.024, 0.05], [0, 0.03, -0.12], C.CHROME, bar);
    for (let i = 0; i < 3; i++) mb.box([0.024, 0.004, 0.006], [0, 0.043, -0.1 - i * 0.012], C.BLACK, bar);
    mb.anchors.muzzle.position.set(0, 0.028, -0.25);
    return r;
  },
  m1911(mb, v) {
    const slide = mb.part('slide', [0, 0.018, 0]);
    mb.box([0.028, 0.03, 0.19], [0, 0.0, -0.07], C.BLUED, slide);
    for (let i = 0; i < 6; i++) mb.box([0.03, 0.022, 0.003], [0, 0, 0.005 + i * 0.006], C.DARK, slide);
    frontSight(mb, -0.158, 0.015, 'slide');
    rearSight(mb, 0.015, 0.015, 'slide');
    mb.box([0.026, 0.02, 0.15], [0, -0.006, -0.06], C.BLUED); // frame
    barrel(mb, 0.006, 0.02, -0.16, 0.02, C.DARK);
    triggerGuard(mb, -0.005, C.BLUED, 0.045);
    pistolGrip(mb, 0.015, C.WOOD, 14, 0.085, 0.03, 0.042);
    const hammer = mb.part('hammer', [0, 0.025, 0.025]);
    mb.box([0.008, 0.014, 0.008], [0, 0.005, 0.003], C.DARK, hammer);
    const mag = boxMag(mb, 0.022, 0.08, 0.035, [0, -0.012, 0.01], C.STEEL, 14);
    void mag; void v;
    grip(mb, [0, -0.035, 0.018]);
    mb.anchor('support', [-0.014, -0.05, 0.016], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.02, -0.17]);
    mb.anchor('eject', [0.016, 0.028, -0.04]);
    mb.anchor('sight', [0, 0.042, 0.03]);
    mb.anchor('magwell', [0, -0.09, 0.03]);
    return { hip: [0.12, -0.11, -0.3], eye: 0.22, twoHand: true };
  },
  glock17(mb, v) {
    const slide = mb.part('slide', [0, 0.02, 0]);
    mb.box([0.026, 0.028, 0.18], [0, 0, -0.065], C.DARK, slide);
    for (let i = 0; i < 5; i++) mb.box([0.028, 0.02, 0.003], [0, 0, 0.005 + i * 0.006], C.BLACK, slide);
    frontSight(mb, -0.15, 0.014, 'slide');
    rearSight(mb, 0.012, 0.014, 'slide');
    mb.box([0.025, 0.02, 0.15], [0, -0.004, -0.058], C.POLY);
    rail(mb, 0.04, -0.1, -0.017, C.POLY);
    triggerGuard(mb, -0.005, C.POLY, 0.045);
    pistolGrip(mb, 0.016, C.POLY, 22, 0.09, 0.03, 0.045);
    if (v.includes('drum')) {
      drumMag(mb, 0.045, 0.05, [0, -0.07, 0.036], C.BLACK);
      mb.box([0.028, 0.03, 0.035], [0, 0.02, -0.17], C.DARK, 'slide');
    } else if (v.includes('extmag')) boxMag(mb, 0.022, 0.15, 0.034, [0, -0.012, 0.012], C.BLACK, 22);
    else boxMag(mb, 0.022, 0.085, 0.034, [0, -0.012, 0.012], C.BLACK, 22);
    grip(mb, [0, -0.035, 0.02]);
    mb.anchor('support', [-0.014, -0.05, 0.02], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.02, -0.16]);
    mb.anchor('eject', [0.016, 0.03, -0.035]);
    mb.anchor('sight', [0, 0.042, 0.03]);
    mb.anchor('magwell', [0, -0.09, 0.03]);
    return { hip: [0.12, -0.11, -0.3], eye: 0.22, twoHand: true };
  },
  deagle(mb) {
    const slide = mb.part('slide', [0, 0.025, 0]);
    mb.box([0.034, 0.036, 0.23], [0, 0, -0.08], C.STEEL, slide);
    mb.box([0.02, 0.012, 0.2], [0, 0.022, -0.09], C.STEEL, slide);
    for (let i = 0; i < 6; i++) mb.box([0.036, 0.026, 0.003], [0, -0.002, 0.012 + i * 0.006], C.DARK, slide);
    frontSight(mb, -0.19, 0.028, 'slide');
    rearSight(mb, 0.02, 0.028, 'slide');
    mb.box([0.03, 0.024, 0.18], [0, -0.006, -0.06], C.STEEL);
    triggerGuard(mb, -0.004, C.STEEL, 0.05);
    pistolGrip(mb, 0.018, C.RUBBER, 16, 0.095, 0.034, 0.05);
    boxMag(mb, 0.026, 0.09, 0.04, [0, -0.014, 0.014], C.STEEL, 16);
    grip(mb, [0, -0.038, 0.02]);
    mb.anchor('support', [-0.016, -0.055, 0.02], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.025, -0.2]);
    mb.anchor('eject', [0.02, 0.034, -0.04]);
    mb.anchor('sight', [0, 0.058, 0.04]);
    mb.anchor('magwell', [0, -0.1, 0.03]);
    return { hip: [0.12, -0.115, -0.31], eye: 0.22, twoHand: true };
  },
  thunder50(mb) {
    const brk = mb.part('break', [0, 0.02, -0.03]);
    mb.box([0.042, 0.048, 0.26], [0, 0.012, -0.12], C.BLACK, brk);
    mb.cyl(0.018, 0.08, [0, 0.012, -0.29], C.DARK, brk, 'z', 8);
    for (let i = 0; i < 3; i++) mb.box([0.05, 0.012, 0.01], [0, 0.012, -0.27 - i * 0.02], C.STEEL, brk);
    frontSight(mb, -0.23, 0.036, 'break');
    mb.box([0.044, 0.05, 0.07], [0, 0.03, 0.01], C.DARK);
    triggerGuard(mb, 0.0, C.DARK, 0.05);
    pistolGrip(mb, 0.02, C.WOOD_D, 16, 0.1, 0.036, 0.052);
    rearSight(mb, 0.035, 0.056);
    grip(mb, [0, -0.04, 0.022]);
    mb.anchor('support', [-0.016, -0.06, 0.02], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.032, -0.33]);
    mb.anchor('eject', [0, 0.04, -0.02]);
    mb.anchor('sight', [0, 0.066, 0.05]);
    mb.anchor('magwell', [0, 0.05, -0.02]);
    return { hip: [0.13, -0.12, -0.32], eye: 0.24, twoHand: true };
  },
  // ---------------------------------------------------------- shotguns
  shorty(mb) {
    mb.box([0.042, 0.06, 0.16], [0, 0.025, -0.05], C.DARK); // receiver
    mb.box([0.043, 0.012, 0.05], [0, 0.03, -0.03], C.BLACK); // port
    barrel(mb, 0.013, 0.2, -0.13, 0.042, C.BLACK);
    barrel(mb, 0.011, 0.14, -0.13, 0.014, C.DARK); // mag tube
    frontSight(mb, -0.32, 0.056);
    const pump = mb.part('pump', [0, 0.012, -0.2]);
    mb.box([0.04, 0.036, 0.09], [0, 0, 0], C.POLY, pump);
    for (let i = 0; i < 5; i++) mb.box([0.042, 0.038, 0.004], [0, 0, -0.035 + i * 0.017], C.BLACK, pump);
    mb.box([0.026, 0.07, 0.03], [0, -0.05, 0.01], C.POLY, pump, [-0.2, 0, 0]); // vertical grip
    triggerGuard(mb, 0.01, C.BLACK, 0.05);
    pistolGrip(mb, 0.03, C.POLY, 20, 0.1, 0.034, 0.05);
    mb.box([0.036, 0.03, 0.03], [0, -0.005, 0.035], C.POLY);
    grip(mb, [0, -0.04, 0.035]);
    mb.anchor('support', [0, -0.072, 0.01], 'pump', [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.042, -0.34]);
    mb.anchor('eject', [0.024, 0.035, -0.04]);
    mb.anchor('sight', [0, 0.065, 0.02]);
    mb.anchor('magwell', [0, -0.005, -0.06]);
    return { hip: [0.14, -0.13, -0.36], eye: 0.22, twoHand: true };
  },
  r870(mb) {
    mb.box([0.042, 0.062, 0.2], [0, 0.025, -0.06], C.DARK);
    barrel(mb, 0.012, 0.44, -0.16, 0.046, C.DARK);
    barrel(mb, 0.011, 0.34, -0.16, 0.016, C.DARK);
    frontSight(mb, -0.59, 0.058);
    const pump = mb.part('pump', [0, 0.014, -0.26]);
    mb.box([0.04, 0.036, 0.13], [0, 0, 0], C.WOOD, pump);
    for (let i = 0; i < 8; i++) mb.box([0.042, 0.038, 0.004], [0, 0, -0.055 + i * 0.016], C.WOOD_D, pump);
    triggerGuard(mb, 0.02, C.BLACK, 0.05);
    pistolGrip(mb, 0.05, C.WOOD, 30, 0.07, 0.034, 0.05);
    stockSolid(mb, 0.07, 0.28, C.WOOD, 0.05, 0.07);
    grip(mb, [0, -0.035, 0.05]);
    mb.anchor('support', [0, -0.044, 0], 'pump', [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.046, -0.61]);
    mb.anchor('eject', [0.024, 0.035, -0.05]);
    mb.anchor('sight', [0, 0.066, 0.05]);
    mb.anchor('magwell', [0, -0.005, -0.08]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  db(mb) {
    const brk = mb.part('break', [0, 0.03, -0.1]);
    barrel(mb, 0.013, 0.5, 0.0, 0.012, C.BLUED, 'break');
    mb.cyl(0.013, 0.5, [0.026, 0.012, -0.25], C.BLUED, brk, 'z', 8);
    mb.box([0.006, 0.006, 0.5], [0.013, 0.026, -0.25], C.BLUED, brk);
    mb.box([0.05, 0.03, 0.18], [0.013, -0.012, -0.12], C.WOOD, brk); // fore-end
    frontSight(mb, -0.49, 0.02, 'break');
    brk.position.x = -0.013;
    mb.box([0.05, 0.05, 0.1], [0, 0.02, -0.05], C.CHROME); // receiver
    triggerGuard(mb, 0.0, C.BLUED, 0.05);
    pistolGrip(mb, 0.04, C.WOOD, 40, 0.07, 0.034, 0.05);
    stockSolid(mb, 0.05, 0.3, C.WOOD, 0.07, 0.065);
    grip(mb, [0, -0.03, 0.045]);
    mb.anchor('support', [0, -0.02, -0.21], brk, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.045, -0.62]);
    mb.anchor('eject', [0, 0.05, -0.1]);
    mb.anchor('sight', [0, 0.06, 0.05]);
    mb.anchor('magwell', [0, 0.05, -0.1]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  m590(mb) {
    MODELS.r870(mb, []);
    // synthetic furniture + heat shield + box mag
    mb.box([0.03, 0.02, 0.3], [0, 0.064, -0.34], C.BLACK);
    boxMag(mb, 0.036, 0.1, 0.06, [0, -0.005, -0.08], C.BLACK, 8);
    return { hip: [0.15, -0.14, -0.33], eye: 0.3, twoHand: true };
  },
  ks23(mb) {
    mb.box([0.05, 0.07, 0.22], [0, 0.025, -0.06], C.DARK);
    barrel(mb, 0.02, 0.38, -0.17, 0.05, C.BLUED, undefined, 10);
    barrel(mb, 0.013, 0.26, -0.17, 0.012, C.DARK);
    frontSight(mb, -0.54, 0.07);
    const pump = mb.part('pump', [0, 0.012, -0.27]);
    mb.box([0.048, 0.04, 0.12], [0, 0, 0], C.WOOD_L, pump);
    triggerGuard(mb, 0.02, C.BLACK, 0.05);
    pistolGrip(mb, 0.05, C.WOOD_L, 30, 0.07, 0.036, 0.05);
    stockSolid(mb, 0.07, 0.26, C.WOOD_L, 0.05, 0.075, 0.04);
    grip(mb, [0, -0.035, 0.05]);
    mb.anchor('support', [0, -0.044, 0], 'pump', [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.05, -0.56]);
    mb.anchor('eject', [0.028, 0.035, -0.05]);
    mb.anchor('sight', [0, 0.078, 0.05]);
    mb.anchor('magwell', [0, -0.005, -0.08]);
    return { hip: [0.15, -0.145, -0.33], eye: 0.3, twoHand: true };
  },
  saiga(mb) {
    akBody(mb, C.BLACK, C.POLY, false);
    drumMag(mb, 0.06, 0.06, [0, -0.01, -0.06], C.BLACK);
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  bp12(mb, v) {
    mb.box([0.05, 0.08, 0.42], [0, 0.03, -0.05], C.POLY);
    mb.box([0.046, 0.02, 0.3], [0, 0.08, -0.08], C.BLACK);
    barrel(mb, 0.013, 0.1, -0.26, 0.04, C.BLACK);
    pistolGrip(mb, 0.0, C.POLY, 18, 0.09, 0.032, 0.05);
    triggerGuard(mb, -0.03, C.POLY, 0.05);
    if (v.includes('drum')) drumMag(mb, 0.06, 0.05, [0, -0.01, 0.1], C.BLACK);
    else boxMag(mb, 0.04, 0.09, 0.06, [0, -0.01, 0.1], C.BLACK);
    rearSight(mb, 0.05, 0.09);
    frontSight(mb, -0.2, 0.09);
    grip(mb, [0, -0.035, 0.005]);
    mb.anchor('support', [0, -0.02, -0.2], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.37]);
    mb.anchor('eject', [0.028, 0.05, 0.08]);
    mb.anchor('sight', [0, 0.1, 0.06]);
    mb.anchor('magwell', [0, -0.02, 0.1]);
    return { hip: [0.15, -0.15, -0.32], eye: 0.24, twoHand: true };
  },
  aa12(mb) {
    mb.box([0.055, 0.085, 0.36], [0, 0.03, -0.1], C.OD);
    mb.box([0.03, 0.04, 0.2], [0, 0.1, -0.08], C.BLACK); // carry handle
    barrel(mb, 0.014, 0.18, -0.28, 0.045, C.BLACK);
    drumMag(mb, 0.065, 0.06, [0, -0.01, -0.1], C.BLACK);
    pistolGrip(mb, 0.04, C.BLACK, 18, 0.09, 0.034, 0.05);
    triggerGuard(mb, 0.01, C.BLACK, 0.05);
    stockSolid(mb, 0.08, 0.24, C.OD, 0.0, 0.075, 0.045);
    grip(mb, [0, -0.035, 0.045]);
    mb.anchor('support', [0, -0.02, -0.24], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.045, -0.46]);
    mb.anchor('eject', [0.03, 0.05, -0.05]);
    mb.anchor('sight', [0, 0.125, 0.0]);
    mb.anchor('magwell', [0, -0.02, -0.1]);
    return { hip: [0.15, -0.16, -0.33], eye: 0.26, twoHand: true };
  },
  // ---------------------------------------------------------- SMGs
  mac11(mb) {
    mb.box([0.034, 0.05, 0.14], [0, 0.02, -0.04], C.BLACK);
    barrel(mb, 0.008, 0.04, -0.11, 0.028, C.DARK);
    pistolGrip(mb, -0.005, C.BLACK, 4, 0.09, 0.03, 0.04);
    boxMag(mb, 0.024, 0.14, 0.035, [0, -0.01, -0.005], C.DARK, 4);
    triggerGuard(mb, -0.03, C.BLACK, 0.04);
    const bolt = mb.part('bolt', [0, 0.05, -0.02]);
    mb.box([0.01, 0.012, 0.02], [0, 0, 0], C.STEEL, bolt);
    grip(mb, [0, -0.035, 0.0]);
    mb.anchor('support', [0, -0.03, -0.1], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.028, -0.16]);
    mb.anchor('eject', [0.02, 0.04, -0.04]);
    mb.anchor('sight', [0, 0.06, 0.02]);
    mb.anchor('magwell', [0, -0.12, 0.0]);
    return { hip: [0.13, -0.12, -0.3], eye: 0.22, twoHand: true };
  },
  sterling(mb) {
    mb.cyl(0.02, 0.3, [0, 0.03, -0.1], C.BLACK, undefined, 'z', 10);
    for (let i = 0; i < 6; i++) mb.cyl(0.021, 0.008, [0, 0.03, -0.18 - i * 0.02], C.DARK, undefined, 'z', 10);
    barrel(mb, 0.007, 0.04, -0.25, 0.03, C.DARK);
    const mag = mb.part('mag', [-0.02, 0.022, -0.1]);
    mb.box([0.12, 0.022, 0.035], [-0.06, 0, 0], C.DARK, mag, [0, 0, 0.05]);
    pistolGrip(mb, 0.01, C.BLACK, 12, 0.09, 0.03, 0.04);
    triggerGuard(mb, -0.02, C.BLACK, 0.045);
    stockSkeleton(mb, 0.05, 0.22, C.DARK);
    grip(mb, [0, -0.035, 0.012]);
    mb.anchor('support', [0, 0.0, -0.18], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.29]);
    mb.anchor('eject', [0.022, 0.04, -0.06]);
    mb.anchor('sight', [0, 0.06, 0.02]);
    mb.anchor('magwell', [-0.12, 0.02, -0.1]);
    return { hip: [0.14, -0.13, -0.32], eye: 0.24, twoHand: true };
  },
  thompson(mb, v) {
    mb.box([0.04, 0.05, 0.22], [0, 0.03, -0.06], C.BLUED);
    barrel(mb, 0.012, 0.18, -0.17, 0.035, C.BLUED);
    for (let i = 0; i < 7; i++) mb.cyl(0.016, 0.005, [0, 0.035, -0.19 - i * 0.012], C.DARK, undefined, 'z', 8);
    mb.cyl(0.013, 0.03, [0, 0.035, -0.36], C.BLUED, undefined, 'z', 8);
    mb.box([0.026, 0.07, 0.035], [0, -0.03, -0.2], C.WOOD, undefined, [-0.25, 0, 0]); // fore grip
    pistolGrip(mb, 0.03, C.WOOD, 20, 0.08, 0.03, 0.045);
    triggerGuard(mb, 0.0, C.BLUED, 0.045);
    stockSolid(mb, 0.07, 0.24, C.WOOD, 0.04, 0.06);
    if (v.includes('drum')) drumMag(mb, 0.06, 0.05, [0, 0.005, -0.1], C.BLUED);
    else boxMag(mb, 0.024, 0.14, 0.035, [0, 0.005, -0.1], C.BLUED, 0);
    const bolt = mb.part('bolt', [0, 0.06, -0.02]);
    mb.box([0.012, 0.014, 0.018], [0, 0, 0], C.STEEL, bolt);
    rearSight(mb, 0.02, 0.058);
    frontSight(mb, -0.35, 0.05);
    grip(mb, [0, -0.035, 0.03]);
    mb.anchor('support', [0, -0.06, -0.2], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.38]);
    mb.anchor('eject', [0.022, 0.045, -0.06]);
    mb.anchor('sight', [0, 0.068, 0.03]);
    mb.anchor('magwell', [0, -0.12, -0.1]);
    return { hip: [0.14, -0.14, -0.33], eye: 0.26, twoHand: true };
  },
  mp40(mb) {
    mb.cyl(0.019, 0.26, [0, 0.03, -0.08], C.BLACK, undefined, 'z', 10);
    barrel(mb, 0.009, 0.1, -0.21, 0.03, C.DARK);
    boxMag(mb, 0.024, 0.2, 0.034, [0, 0.01, -0.12], C.BLACK, 0);
    pistolGrip(mb, 0.03, C.POLY, 14, 0.085, 0.03, 0.045);
    triggerGuard(mb, 0.0, C.BLACK, 0.045);
    stockSkeleton(mb, 0.06, 0.2, C.DARK);
    const bolt = mb.part('bolt', [-0.02, 0.035, -0.05]);
    mb.box([0.012, 0.012, 0.012], [0, 0, 0], C.STEEL, bolt);
    frontSight(mb, -0.3, 0.035);
    grip(mb, [0, -0.035, 0.03]);
    mb.anchor('support', [0, -0.04, -0.13], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.32]);
    mb.anchor('eject', [0.022, 0.04, -0.06]);
    mb.anchor('sight', [0, 0.062, 0.03]);
    mb.anchor('magwell', [0, -0.18, -0.12]);
    return { hip: [0.14, -0.13, -0.33], eye: 0.26, twoHand: true };
  },
  mp5k(mb) {
    mb.box([0.036, 0.055, 0.2], [0, 0.03, -0.06], C.BLACK);
    barrel(mb, 0.009, 0.05, -0.16, 0.035, C.DARK);
    curvedMag(mb, 0.024, 0.14, 0.035, [0, 0.005, -0.07], C.DARK, 22);
    mb.box([0.026, 0.07, 0.03], [0, -0.03, -0.14], C.BLACK, undefined, [-0.1, 0, 0]);
    pistolGrip(mb, 0.02, C.BLACK, 16, 0.085, 0.03, 0.045);
    triggerGuard(mb, -0.01, C.BLACK, 0.04);
    rearSight(mb, 0.025, 0.06);
    frontSight(mb, -0.14, 0.06);
    grip(mb, [0, -0.035, 0.022]);
    mb.anchor('support', [0, -0.06, -0.14], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.22]);
    mb.anchor('eject', [0.02, 0.045, -0.06]);
    mb.anchor('sight', [0, 0.072, 0.03]);
    mb.anchor('magwell', [0, -0.12, -0.08]);
    return { hip: [0.13, -0.13, -0.3], eye: 0.22, twoHand: true };
  },
  p90(mb) {
    mb.box([0.05, 0.09, 0.38], [0, 0.02, -0.05], C.TAN);
    mb.box([0.052, 0.03, 0.12], [0, -0.035, -0.02], C.BLACK);
    mb.box([0.03, 0.05, 0.03], [0, -0.03, 0.09], C.TAN); // thumbhole
    const mag = mb.part('mag', [0, 0.07, -0.04]);
    mb.box([0.036, 0.014, 0.24], [0, 0, 0], 0x6a6050, mag);
    barrel(mb, 0.008, 0.04, -0.24, 0.03, C.BLACK);
    redDot(mb, -0.02, 0.078);
    grip(mb, [0, -0.04, -0.03]);
    mb.anchor('support', [0, -0.03, -0.18], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.27]);
    mb.anchor('eject', [0, -0.03, 0.02]);
    mb.anchor('magwell', [0, 0.09, -0.04]);
    return { hip: [0.14, -0.14, -0.31], eye: 0.2, twoHand: true };
  },
  // ---------------------------------------------------------- rifles
  akm(mb) {
    akBody(mb, C.BLACK, C.WOOD, true);
    curvedMag(mb, 0.026, 0.19, 0.045, [0, 0.0, -0.06], 0x8a4a22, 28);
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  m16(mb) {
    arBody(mb, C.BLACK, true, false);
    boxMag(mb, 0.026, 0.16, 0.05, [0, 0.0, -0.06], C.DARK, 6);
    return { hip: [0.15, -0.15, -0.34], eye: 0.3, twoHand: true };
  },
  m4(mb) {
    arBody(mb, C.BLACK, false, true);
    boxMag(mb, 0.026, 0.15, 0.05, [0, 0.0, -0.06], C.DARK, 6);
    return { hip: [0.15, -0.15, -0.33], eye: 0.28, twoHand: true };
  },
  aug(mb) {
    mb.box([0.05, 0.08, 0.44], [0, 0.03, -0.06], C.OD);
    mb.box([0.052, 0.03, 0.14], [0, -0.02, 0.06], C.OD);
    barrel(mb, 0.011, 0.16, -0.28, 0.04, C.BLACK);
    mb.box([0.026, 0.07, 0.03], [0, -0.04, -0.2], C.OD, undefined, [-0.1, 0, 0]);
    pistolGrip(mb, -0.04, C.OD, 10, 0.08, 0.03, 0.045);
    boxMag(mb, 0.026, 0.14, 0.05, [0, -0.01, 0.07], 0x8a9a8a, 8);
    scope(mb, 0.14, 0.018, -0.04, 0.1, C.OD);
    grip(mb, [0, -0.035, -0.04]);
    mb.anchor('support', [0, -0.06, -0.2], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.44]);
    mb.anchor('eject', [0.028, 0.04, 0.08]);
    mb.anchor('magwell', [0, -0.13, 0.08]);
    return { hip: [0.15, -0.15, -0.32], eye: 0.16, twoHand: true };
  },
  scarh(mb, v) {
    arBody(mb, C.TAN, false, true, C.TAN);
    boxMag(mb, 0.03, v.includes('optic') ? 0.17 : 0.13, 0.055, [0, 0.0, -0.06], C.BLACK, 6);
    if (v.includes('optic')) redDot(mb, 0.0, 0.085);
    return { hip: [0.15, -0.15, -0.34], eye: 0.28, twoHand: true };
  },
  // ---------------------------------------------------------- MGs
  bar(mb, v) {
    mb.box([0.04, 0.06, 0.34], [0, 0.03, -0.12], C.BLUED);
    barrel(mb, 0.012, 0.36, -0.29, 0.04, C.BLUED);
    mb.box([0.03, 0.03, 0.2], [0, 0.005, -0.34], C.WOOD);
    pistolGrip(mb, 0.04, C.WOOD, 30, 0.07, 0.03, 0.045);
    triggerGuard(mb, 0.01, C.BLUED, 0.05);
    stockSolid(mb, 0.06, 0.3, C.WOOD, 0.05, 0.075);
    boxMag(mb, 0.03, v.includes('extmag') ? 0.2 : 0.12, 0.055, [0, 0.0, -0.08], C.BLUED, 0);
    mb.box([0.006, 0.12, 0.006], [-0.02, -0.04, -0.52], C.DARK, undefined, [0.3, 0, 0.3]);
    mb.box([0.006, 0.12, 0.006], [0.02, -0.04, -0.52], C.DARK, undefined, [0.3, 0, -0.3]);
    rearSight(mb, 0.0, 0.065);
    frontSight(mb, -0.63, 0.055);
    grip(mb, [0, -0.035, 0.045]);
    mb.anchor('support', [0, -0.012, -0.33], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.66]);
    mb.anchor('eject', [0.022, 0.045, -0.08]);
    mb.anchor('sight', [0, 0.074, 0.05]);
    mb.anchor('magwell', [0, -0.1, -0.08]);
    return { hip: [0.16, -0.16, -0.34], eye: 0.3, twoHand: true };
  },
  m1922(mb, v) {
    MODELS.bar(mb, v.filter((x) => x !== 'drum'));
    for (let i = 0; i < 9; i++) mb.cyl(0.02, 0.006, [0, 0.04, -0.34 - i * 0.02], C.DARK, undefined, 'z', 10);
    if (v.includes('drum')) {
      const old = mb.parts.mag;
      old.visible = false;
      old.name = 'oldmag';
      drumMag(mb, 0.07, 0.06, [0, 0.0, -0.08], C.BLUED);
    }
    return { hip: [0.16, -0.16, -0.34], eye: 0.3, twoHand: true };
  },
  m249(mb) {
    lmgBody(mb, C.BLACK, 0.5, false);
    return { hip: [0.16, -0.17, -0.34], eye: 0.3, twoHand: true };
  },
  pkm(mb) {
    lmgBody(mb, C.BLACK, 0.58, true, C.WOOD);
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  m240(mb) {
    lmgBody(mb, C.GUNMETAL, 0.56, false);
    rail(mb, 0.2, -0.1, 0.09);
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  mg42(mb) {
    mb.box([0.05, 0.07, 0.3], [0, 0.03, -0.08], C.BLACK);
    mb.cyl(0.024, 0.34, [0, 0.035, -0.4], C.DARK, undefined, 'z', 10);
    for (let i = 0; i < 10; i++) mb.box([0.05, 0.012, 0.012], [0, 0.035, -0.25 - i * 0.03], C.BLACK);
    barrel(mb, 0.01, 0.06, -0.56, 0.035, C.BLACK);
    pistolGrip(mb, 0.04, C.POLY, 25, 0.08, 0.03, 0.045);
    triggerGuard(mb, 0.01, C.BLACK, 0.05);
    stockSolid(mb, 0.07, 0.26, C.WOOD, 0.04, 0.07);
    const cover = mb.part('cover', [0, 0.07, -0.05]);
    mb.box([0.05, 0.012, 0.14], [0, 0, -0.07], C.DARK, cover);
    drumMag(mb, 0.05, 0.06, [-0.045, 0.02, -0.08], C.OD);
    grip(mb, [0, -0.035, 0.045]);
    mb.anchor('support', [0, -0.02, -0.26], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.63]);
    mb.anchor('eject', [0, -0.01, -0.08]);
    mb.anchor('sight', [0, 0.1, 0.03]);
    mb.anchor('magwell', [-0.04, 0.0, -0.08]);
    return { hip: [0.16, -0.17, -0.35], eye: 0.3, twoHand: true };
  },
  minigun(mb) {
    mb.box([0.09, 0.1, 0.22], [0, 0.0, 0.0], C.DARK);
    mb.cyl(0.045, 0.1, [0, 0.0, 0.14], C.BLACK, undefined, 'z', 10);
    const spin = mb.part('spin', [0, 0.0, -0.12]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.cyl(0.009, 0.5, [Math.cos(a) * 0.028, Math.sin(a) * 0.028, -0.25], C.STEEL, spin, 'z', 6);
    }
    mb.cyl(0.042, 0.02, [0, 0, -0.05], C.BLACK, spin, 'z', 10);
    mb.cyl(0.042, 0.02, [0, 0, -0.44], C.BLACK, spin, 'z', 10);
    mb.box([0.03, 0.12, 0.03], [0, 0.1, 0.02], C.BLACK); // top handle
    mb.box([0.12, 0.03, 0.03], [0, 0.15, 0.02], C.BLACK);
    mb.box([0.03, 0.1, 0.03], [0, -0.09, 0.08], C.POLY, undefined, [0.2, 0, 0]);
    const belt = mb.part('mag', [0.07, -0.04, 0.04]);
    mb.box([0.03, 0.1, 0.08], [0, -0.03, 0], C.OD, belt);
    for (let i = 0; i < 5; i++) mb.box([0.01, 0.012, 0.04], [0.02, 0.03 - i * 0.015, 0], C.BRASS, belt);
    grip(mb, [0, -0.06, 0.08]);
    mb.anchor('support', [-0.02, 0.15, 0.02], undefined, [0, 0, 0]);
    mb.anchor('muzzle', [0, 0.0, -0.62]);
    mb.anchor('eject', [0.05, -0.04, 0.0]);
    mb.anchor('sight', [0, 0.18, 0.02]);
    mb.anchor('magwell', [0.07, -0.06, 0.04]);
    return { hip: [0.14, -0.22, -0.38], eye: 0.3, twoHand: true };
  },
  m2(mb) {
    mb.box([0.08, 0.1, 0.34], [0, 0.03, -0.05], C.OD);
    mb.cyl(0.03, 0.2, [0, 0.03, -0.3], C.DARK, undefined, 'z', 10);
    for (let i = 0; i < 6; i++) mb.cyl(0.032, 0.008, [0, 0.03, -0.22 - i * 0.03], C.BLACK, undefined, 'z', 10);
    barrel(mb, 0.016, 0.4, -0.4, 0.03, C.DARK);
    mb.cyl(0.024, 0.05, [0, 0.03, -0.83], C.BLACK, undefined, 'z', 10);
    mb.box([0.02, 0.06, 0.02], [-0.04, -0.02, 0.14], C.BLACK); // spade grips
    mb.box([0.02, 0.06, 0.02], [0.04, -0.02, 0.14], C.BLACK);
    mb.box([0.1, 0.02, 0.02], [0, 0.01, 0.14], C.BLACK);
    const cover = mb.part('cover', [0, 0.08, 0.05]);
    mb.box([0.082, 0.014, 0.2], [0, 0, -0.1], C.OD, cover);
    const box = mb.part('mag', [-0.08, -0.02, -0.03]);
    mb.box([0.06, 0.12, 0.15], [0, -0.03, 0], C.OD, box);
    for (let i = 0; i < 4; i++) mb.box([0.03, 0.014, 0.012], [0.04, 0.03, -0.04 + i * 0.025], C.BRASS, box);
    grip(mb, [0.04, -0.02, 0.14], [0, 0, 0]);
    mb.anchor('support', [-0.04, -0.02, 0.14], undefined, [0, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.86]);
    mb.anchor('eject', [0, -0.02, -0.02]);
    mb.anchor('sight', [0, 0.1, 0.12]);
    mb.anchor('magwell', [-0.08, 0.0, -0.03]);
    return { hip: [0.1, -0.2, -0.45], eye: 0.3, twoHand: true };
  },
  // ---------------------------------------------------------- marksman / snipers
  garand(mb) {
    mb.box([0.04, 0.05, 0.22], [0, 0.03, -0.07], C.BLUED);
    barrel(mb, 0.011, 0.5, -0.18, 0.04, C.BLUED);
    mb.box([0.042, 0.038, 0.4], [0, 0.012, -0.34], C.WOOD);
    mb.box([0.03, 0.02, 0.22], [0, 0.05, -0.3], C.WOOD);
    const clip = mb.part('clip', [0, 0.056, -0.06]);
    mb.box([0.03, 0.02, 0.04], [0, 0, 0], C.BRASS, clip);
    const bolt = mb.part('bolt', [0.024, 0.04, -0.07]);
    mb.box([0.012, 0.012, 0.04], [0, 0, 0], C.STEEL, bolt);
    pistolGrip(mb, 0.04, C.WOOD, 40, 0.07, 0.034, 0.05);
    triggerGuard(mb, 0.01, C.BLUED, 0.05);
    stockSolid(mb, 0.06, 0.3, C.WOOD, 0.06, 0.07);
    rearSight(mb, 0.02, 0.06);
    frontSight(mb, -0.66, 0.05);
    grip(mb, [0, -0.03, 0.04]);
    mb.anchor('support', [0, -0.01, -0.32], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.69]);
    mb.anchor('eject', [0.02, 0.07, -0.06]);
    mb.anchor('sight', [0, 0.072, 0.05]);
    mb.anchor('magwell', [0, 0.08, -0.06]);
    return { hip: [0.15, -0.14, -0.34], eye: 0.3, twoHand: true };
  },
  vss(mb) {
    mb.box([0.04, 0.055, 0.2], [0, 0.03, -0.05], C.BLACK);
    mb.cyl(0.024, 0.3, [0, 0.035, -0.3], C.DARK, undefined, 'z', 10);
    mb.box([0.042, 0.035, 0.14], [0, 0.005, -0.2], C.WOOD);
    pistolGrip(mb, 0.03, C.WOOD, 20, 0.08, 0.03, 0.045);
    triggerGuard(mb, 0.0, C.BLACK, 0.045);
    mb.box([0.03, 0.012, 0.25], [0, 0.0, 0.18], C.WOOD, undefined, [0.12, 0, 0]);
    mb.box([0.03, 0.08, 0.02], [0, -0.03, 0.3], C.WOOD);
    boxMag(mb, 0.026, 0.1, 0.045, [0, 0.0, -0.06], C.BLACK, 4);
    scope(mb, 0.16, 0.017, -0.04, 0.095, C.BLACK);
    grip(mb, [0, -0.035, 0.03]);
    mb.anchor('support', [0, -0.018, -0.2], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.035, -0.46]);
    mb.anchor('eject', [0.022, 0.045, -0.05]);
    mb.anchor('magwell', [0, -0.1, -0.06]);
    return { hip: [0.15, -0.15, -0.33], eye: 0.12, twoHand: true };
  },
  k98(mb) {
    mb.box([0.036, 0.045, 0.22], [0, 0.03, -0.07], C.BLUED);
    barrel(mb, 0.01, 0.56, -0.18, 0.04, C.BLUED);
    mb.box([0.04, 0.036, 0.46], [0, 0.012, -0.36], C.WOOD);
    const bolt = mb.part('bolt', [0.024, 0.04, 0.02]);
    mb.box([0.024, 0.008, 0.008], [0.012, 0, 0], C.STEEL, bolt);
    mb.box([0.012, 0.012, 0.012], [0.028, -0.004, 0], C.STEEL, bolt);
    mb.box([0.012, 0.012, 0.06], [-0.012, 0, -0.03], C.STEEL, bolt);
    pistolGrip(mb, 0.04, C.WOOD, 40, 0.07, 0.034, 0.05);
    triggerGuard(mb, 0.01, C.BLUED, 0.05);
    stockSolid(mb, 0.06, 0.3, C.WOOD, 0.06, 0.07);
    scope(mb, 0.2, 0.017, -0.06, 0.085, C.BLACK);
    grip(mb, [0, -0.03, 0.04]);
    mb.anchor('support', [0, -0.012, -0.3], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.75]);
    mb.anchor('eject', [0.02, 0.05, -0.05]);
    mb.anchor('magwell', [0, 0.06, -0.05]);
    return { hip: [0.15, -0.14, -0.34], eye: 0.12, twoHand: true };
  },
  srs(mb) {
    mb.box([0.05, 0.08, 0.46], [0, 0.03, -0.02], C.BLACK);
    mb.cyl(0.02, 0.2, [0, 0.04, -0.34], C.DARK, undefined, 'z', 10);
    pistolGrip(mb, -0.02, C.POLY, 14, 0.085, 0.03, 0.045);
    boxMag(mb, 0.03, 0.08, 0.05, [0, -0.01, 0.1], C.DARK);
    const bolt = mb.part('bolt', [0.03, 0.05, 0.14]);
    mb.box([0.03, 0.01, 0.01], [0.012, 0, 0], C.STEEL, bolt);
    scope(mb, 0.22, 0.019, -0.04, 0.1, C.BLACK);
    grip(mb, [0, -0.035, -0.015]);
    mb.anchor('support', [0, -0.02, -0.22], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.45]);
    mb.anchor('eject', [0.03, 0.05, 0.12]);
    mb.anchor('magwell', [0, -0.08, 0.1]);
    return { hip: [0.15, -0.15, -0.3], eye: 0.12, twoHand: true };
  },
  awm(mb) {
    mb.box([0.05, 0.06, 0.34], [0, 0.03, -0.06], 0x4f5a3a);
    barrel(mb, 0.012, 0.5, -0.22, 0.04, C.BLACK);
    mb.box([0.05, 0.03, 0.06], [0, 0.04, -0.74], C.BLACK);
    const bolt = mb.part('bolt', [0.028, 0.05, 0.04]);
    mb.box([0.03, 0.01, 0.01], [0.012, 0, 0], C.STEEL, bolt);
    mb.box([0.014, 0.014, 0.014], [0.03, -0.004, 0], C.BLACK, bolt);
    pistolGrip(mb, 0.04, 0x4f5a3a, 20, 0.08, 0.032, 0.05);
    triggerGuard(mb, 0.01, C.BLACK, 0.05);
    stockSolid(mb, 0.08, 0.28, 0x4f5a3a, 0.0, 0.09, 0.045);
    boxMag(mb, 0.03, 0.08, 0.05, [0, 0.0, -0.06], C.BLACK);
    scope(mb, 0.26, 0.022, -0.06, 0.1, C.BLACK);
    grip(mb, [0, -0.035, 0.045]);
    mb.anchor('support', [0, -0.01, -0.26], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.78]);
    mb.anchor('eject', [0.026, 0.05, -0.04]);
    mb.anchor('magwell', [0, -0.08, -0.06]);
    return { hip: [0.15, -0.15, -0.34], eye: 0.12, twoHand: true };
  },
  barrett(mb) {
    mb.box([0.06, 0.09, 0.42], [0, 0.03, -0.06], C.BLACK);
    barrel(mb, 0.016, 0.6, -0.27, 0.05, C.DARK);
    mb.box([0.07, 0.04, 0.08], [0, 0.05, -0.9], C.BLACK);
    for (let i = 0; i < 2; i++) mb.box([0.072, 0.03, 0.01], [0, 0.05, -0.88 - i * 0.04], C.DARK);
    pistolGrip(mb, 0.05, C.POLY, 20, 0.09, 0.034, 0.05);
    triggerGuard(mb, 0.02, C.BLACK, 0.05);
    stockSolid(mb, 0.15, 0.24, C.BLACK, 0.0, 0.1, 0.05);
    boxMag(mb, 0.04, 0.12, 0.07, [0, -0.01, -0.02], C.DARK);
    mb.box([0.008, 0.15, 0.008], [-0.03, -0.05, -0.6], C.DARK, undefined, [0.25, 0, 0.35]);
    mb.box([0.008, 0.15, 0.008], [0.03, -0.05, -0.6], C.DARK, undefined, [0.25, 0, -0.35]);
    scope(mb, 0.28, 0.024, -0.08, 0.125, C.BLACK);
    grip(mb, [0, -0.04, 0.055]);
    mb.anchor('support', [0, -0.02, -0.3], undefined, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.05, -0.94]);
    mb.anchor('eject', [0.032, 0.05, -0.03]);
    mb.anchor('magwell', [0, -0.12, -0.02]);
    return { hip: [0.15, -0.17, -0.34], eye: 0.12, twoHand: true };
  },
  // ---------------------------------------------------------- launchers
  rpg(mb) {
    mb.cyl(0.025, 0.95, [0, 0.03, -0.1], C.OD, undefined, 'z', 10);
    mb.box([0.056, 0.056, 0.26], [0, 0.03, -0.12], C.WOOD);
    mb.cyl(0.035, 0.1, [0, 0.03, 0.39], C.OD, undefined, 'z', 10);
    pistolGrip(mb, 0.0, C.WOOD, 15, 0.08, 0.03, 0.045);
    mb.box([0.026, 0.08, 0.03], [0, -0.04, -0.2], C.WOOD);
    mb.box([0.03, 0.05, 0.05], [-0.04, 0.07, -0.06], C.BLACK);
    const rocket = mb.part('rocket', [0, 0.03, -0.57]);
    mb.cyl(0.02, 0.08, [0, 0, 0.02], C.OD, rocket, 'z', 8);
    mb.cyl(0.045, 0.12, [0, 0, -0.08], C.OD, rocket, 'z', 10);
    const cone = new THREE.ConeGeometry(0.045, 0.14, 10);
    cone.rotateX(-Math.PI / 2);
    const coneMesh = new THREE.Mesh(cone, mb.box([0.001, 0.001, 0.001], [0, 0, 0], C.OD, rocket).material as THREE.Material);
    coneMesh.position.set(0, 0, -0.21);
    rocket.add(coneMesh);
    grip(mb, [0, -0.035, 0.005]);
    mb.anchor('support', [0, -0.07, -0.2], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.6]);
    mb.anchor('eject', [0, 0.03, 0.44]);
    mb.anchor('sight', [-0.04, 0.1, -0.03]);
    mb.anchor('magwell', [0, 0.03, -0.6]);
    return { hip: [0.12, -0.13, -0.32], eye: 0.24, twoHand: true };
  },
  m79(mb) {
    const brk = mb.part('break', [0, 0.03, -0.05]);
    mb.cyl(0.024, 0.32, [0, 0.01, -0.16], 0x3e4a2e, brk, 'z', 10);
    mb.cyl(0.018, 0.004, [0, 0.01, -0.325], C.BLACK, brk, 'z', 10);
    mb.box([0.05, 0.04, 0.16], [0, -0.02, -0.12], C.WOOD, brk);
    mb.box([0.04, 0.06, 0.08], [0, 0.02, 0.0], C.DARK);
    mb.box([0.02, 0.05, 0.004], [0, 0.07, -0.06], C.BLACK, brk);
    pistolGrip(mb, 0.03, C.WOOD, 30, 0.07, 0.034, 0.05);
    triggerGuard(mb, 0.01, C.DARK, 0.05);
    stockSolid(mb, 0.04, 0.26, C.WOOD, 0.06, 0.07, 0.04);
    grip(mb, [0, -0.03, 0.035]);
    mb.anchor('support', [0, -0.045, -0.16], brk, [0.3, 0, 0]);
    mb.anchor('muzzle', [0, 0.04, -0.38]);
    mb.anchor('eject', [0, 0.05, -0.05]);
    mb.anchor('sight', [0, 0.1, 0.03]);
    mb.anchor('magwell', [0, 0.05, -0.06]);
    return { hip: [0.15, -0.14, -0.33], eye: 0.28, twoHand: true };
  },
  m32(mb) {
    const cyl = mb.part('cylinder', [0, 0.02, -0.12]);
    mb.cyl(0.065, 0.13, [0, 0, 0], C.BLACK, cyl, 'z', 12);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mb.cyl(0.021, 0.132, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0], C.DARK, cyl, 'z', 8);
    }
    mb.cyl(0.024, 0.2, [0, 0.05, -0.3], C.BLACK, undefined, 'z', 10);
    rail(mb, 0.25, -0.26, 0.08);
    mb.box([0.03, 0.03, 0.2], [0, 0.07, -0.08], C.BLACK);
    pistolGrip(mb, 0.03, C.POLY, 18, 0.09, 0.034, 0.05);
    mb.box([0.03, 0.08, 0.03], [0, -0.03, -0.3], C.POLY);
    triggerGuard(mb, 0.0, C.BLACK, 0.05);
    stockSkeleton(mb, 0.05, 0.22, C.BLACK);
    redDot(mb, -0.12, 0.085);
    grip(mb, [0, -0.035, 0.03]);
    mb.anchor('support', [0, -0.065, -0.3], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.05, -0.41]);
    mb.anchor('eject', [0, 0.02, -0.12]);
    mb.anchor('magwell', [0.06, 0.02, -0.12]);
    return { hip: [0.15, -0.16, -0.34], eye: 0.22, twoHand: true };
  },
  // ---------------------------------------------------------- bows
  bow(mb) {
    return bowModel(mb, C.WOOD_D, C.WOOD, false, false);
  },
  rambo(mb) {
    return bowModel(mb, C.BLACK, 0x4b5a33, true, false);
  },
  sunstrike(mb) {
    return bowModel(mb, 0xd8b040, 0xfff0a0, false, true);
  },
  // ---------------------------------------------------------- energy / flame / particle
  laser(mb) {
    mb.box([0.06, 0.09, 0.4], [0, 0.03, -0.1], 0xdcdcdc);
    mb.box([0.064, 0.03, 0.3], [0, 0.07, -0.12], C.BLACK);
    const coil = mb.part('coil', [0, 0.03, -0.32]);
    for (let i = 0; i < 4; i++) mb.cyl(0.03, 0.02, [0, 0, -i * 0.035], C.GLOW_B, coil, 'z', 10, 0x2090ff);
    mb.cyl(0.018, 0.2, [0, 0.03, -0.38], C.DARK, undefined, 'z', 8);
    mb.cyl(0.024, 0.03, [0, 0.03, -0.5], 0xdcdcdc, undefined, 'z', 10);
    pistolGrip(mb, 0.03, C.BLACK, 18, 0.09, 0.034, 0.05);
    mb.box([0.03, 0.09, 0.035], [0, -0.04, -0.24], C.BLACK);
    boxMag(mb, 0.035, 0.07, 0.07, [0, -0.02, -0.06], C.GLOW_B, 0);
    stockSolid(mb, 0.09, 0.2, 0xdcdcdc, 0.0, 0.08, 0.05);
    redDot(mb, -0.04, 0.086);
    grip(mb, [0, -0.04, 0.03]);
    mb.anchor('support', [0, -0.08, -0.24], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.52]);
    mb.anchor('eject', [0.03, 0.03, -0.05]);
    mb.anchor('magwell', [0, -0.09, -0.06]);
    return { hip: [0.15, -0.16, -0.34], eye: 0.22, twoHand: true };
  },
  naf(mb) {
    mb.box([0.04, 0.06, 0.34], [0, 0.03, -0.1], C.BLACK);
    mb.cyl(0.02, 0.2, [0, 0.03, -0.37], C.DARK, undefined, 'z', 8);
    mb.cyl(0.028, 0.06, [0, 0.03, -0.49], C.CHROME, undefined, 'z', 10);
    const pilot = mb.part('pilot', [0, 0.012, -0.52]);
    mb.box([0.006, 0.006, 0.01], [0, 0, 0], C.ORANGE, pilot, undefined, 0xff6010);
    mb.box([0.07, 0.1, 0.05], [0, -0.06, -0.12], 0xe0e0e0);
    pistolGrip(mb, 0.04, C.BLACK, 18, 0.09, 0.034, 0.05);
    mb.box([0.03, 0.08, 0.03], [0, -0.03, -0.26], C.BLACK);
    stockSolid(mb, 0.07, 0.22, C.BLACK, 0.0, 0.07, 0.04);
    const mag = mb.part('mag', [0, -0.03, -0.12]);
    mb.cyl(0.03, 0.14, [0, -0.06, 0], 0xe0e0e0, mag, 'y', 10);
    grip(mb, [0, -0.04, 0.04]);
    mb.anchor('support', [0, -0.07, -0.26], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.53]);
    mb.anchor('eject', [0, 0.03, -0.1]);
    mb.anchor('sight', [0, 0.08, 0.03]);
    mb.anchor('magwell', [0, -0.1, -0.12]);
    return { hip: [0.15, -0.15, -0.33], eye: 0.3, twoHand: true };
  },
  reedham(mb) {
    mb.cyl(0.024, 0.55, [0, 0.03, -0.22], C.OD, undefined, 'z', 10);
    mb.cyl(0.032, 0.08, [0, 0.03, -0.52], C.DARK, undefined, 'z', 10);
    const pilot = mb.part('pilot', [0, 0.005, -0.56]);
    mb.box([0.008, 0.008, 0.012], [0, 0, 0], C.GLOW_B, pilot, undefined, 0x3080ff);
    for (let i = 0; i < 4; i++) mb.cyl(0.028, 0.01, [0, 0.03, -0.1 - i * 0.08], C.BLACK, undefined, 'z', 10);
    pistolGrip(mb, 0.03, C.BLACK, 18, 0.09, 0.034, 0.05);
    mb.box([0.03, 0.09, 0.03], [0, -0.04, -0.28], C.BLACK);
    const mag = mb.part('mag', [0.05, -0.02, 0.02]);
    mb.cyl(0.04, 0.2, [0, -0.08, 0], C.OD, mag, 'y', 10);
    mb.cyl(0.006, 0.12, [-0.03, 0.02, -0.05], C.BLACK, mag, 'z', 6);
    grip(mb, [0, -0.04, 0.03]);
    mb.anchor('support', [0, -0.08, -0.28], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.58]);
    mb.anchor('eject', [0, 0.03, -0.1]);
    mb.anchor('sight', [0, 0.08, 0.03]);
    mb.anchor('magwell', [0.05, -0.12, 0.02]);
    return { hip: [0.14, -0.15, -0.33], eye: 0.3, twoHand: true };
  },
  pir(mb, v) {
    const glow = v.includes('l3') ? 0xff40ff : v.includes('l2') ? 0x40ffd0 : 0xffa030;
    mb.box([0.07, 0.1, 0.46], [0, 0.03, -0.1], 0x2a2d34);
    mb.box([0.074, 0.03, 0.34], [0, 0.085, -0.12], C.BLACK);
    const coil = mb.part('coil', [0, 0.03, -0.36]);
    for (let i = 0; i < 5; i++) mb.box([0.08, 0.08, 0.016], [0, 0, -i * 0.03], glow, coil, undefined, glow);
    mb.box([0.03, 0.03, 0.2], [0, 0.03, -0.44], C.DARK);
    mb.box([0.05, 0.05, 0.03], [0, 0.03, -0.55], 0x2a2d34);
    pistolGrip(mb, 0.04, C.BLACK, 18, 0.09, 0.034, 0.05);
    mb.box([0.03, 0.09, 0.035], [0, -0.045, -0.26], C.BLACK);
    boxMag(mb, 0.04, 0.06, 0.08, [0, -0.02, -0.04], glow, 0);
    stockSolid(mb, 0.13, 0.2, 0x2a2d34, 0.0, 0.09, 0.05);
    scope(mb, 0.14, 0.02, -0.08, 0.11, C.BLACK, glow);
    grip(mb, [0, -0.04, 0.045]);
    mb.anchor('support', [0, -0.085, -0.26], undefined, [0.2, 0, 0]);
    mb.anchor('muzzle', [0, 0.03, -0.58]);
    mb.anchor('eject', [0.036, 0.03, -0.05]);
    mb.anchor('magwell', [0, -0.08, -0.04]);
    return { hip: [0.15, -0.17, -0.35], eye: 0.14, twoHand: true };
  },
};

function akBody(mb: ModelBuilder, metal: number, furniture: number, stock: boolean) {
  mb.box([0.042, 0.06, 0.26], [0, 0.03, -0.08], metal);
  mb.box([0.036, 0.012, 0.22], [0, 0.066, -0.08], metal);
  barrel(mb, 0.01, 0.32, -0.21, 0.04, C.BLACK);
  mb.cyl(0.01, 0.2, [0, 0.07, -0.32], metal, undefined, 'z', 8); // gas tube
  mb.box([0.044, 0.04, 0.17], [0, 0.028, -0.3], furniture); // handguard
  mb.box([0.038, 0.02, 0.12], [0, 0.07, -0.29], furniture);
  mb.box([0.006, 0.03, 0.008], [0, 0.06, -0.5], C.BLACK); // front sight post
  mb.cyl(0.013, 0.04, [0, 0.04, -0.55], C.BLACK, undefined, 'z', 8);
  rearSight(mb, -0.17, 0.068);
  pistolGrip(mb, 0.03, furniture === C.WOOD ? 0x6a3a1a : C.POLY, 20, 0.08, 0.03, 0.045);
  triggerGuard(mb, 0.0, metal, 0.05);
  if (stock) stockSolid(mb, 0.05, 0.28, furniture, 0.06, 0.065);
  else stockSkeleton(mb, 0.05, 0.22, C.BLACK);
  const bolt = mb.part('bolt', [0.026, 0.045, -0.06]);
  mb.box([0.014, 0.012, 0.03], [0, 0, 0], C.STEEL, bolt);
  grip(mb, [0, -0.035, 0.03]);
  mb.anchor('support', [0, -0.005, -0.3], undefined, [0.3, 0, 0]);
  mb.anchor('muzzle', [0, 0.04, -0.58]);
  mb.anchor('eject', [0.024, 0.05, -0.08]);
  mb.anchor('sight', [0, 0.083, 0.02]);
  mb.anchor('magwell', [0, -0.12, -0.06]);
}

function arBody(mb: ModelBuilder, color: number, carry: boolean, quadRail: boolean, furniture: number = C.POLY) {
  mb.box([0.04, 0.05, 0.2], [0, 0.03, -0.06], color); // upper
  mb.box([0.036, 0.035, 0.16], [0, -0.005, -0.05], color); // lower
  barrel(mb, 0.009, 0.36, -0.16, 0.035, C.BLACK);
  if (quadRail) {
    mb.box([0.046, 0.046, 0.2], [0, 0.035, -0.26], color);
    rail(mb, 0.2, -0.26, 0.061, C.BLACK);
    rail(mb, 0.36, -0.12, 0.058, C.BLACK);
  } else {
    mb.box([0.05, 0.046, 0.22], [0, 0.034, -0.27], furniture);
  }
  if (carry) {
    mb.box([0.016, 0.03, 0.12], [0, 0.07, -0.04], color);
    rearSight(mb, 0.01, 0.085);
  } else {
    mb.box([0.02, 0.022, 0.02], [0, 0.07, 0.01], C.BLACK);
  }
  mb.box([0.006, 0.05, 0.008], [0, 0.062, -0.44], C.BLACK);
  mb.cyl(0.012, 0.05, [0, 0.035, -0.53], C.BLACK, undefined, 'z', 8);
  pistolGrip(mb, 0.03, C.POLY, 20, 0.08, 0.03, 0.045);
  triggerGuard(mb, 0.0, color, 0.05);
  stockSolid(mb, 0.06, 0.24, furniture === C.TAN ? C.TAN : C.POLY, 0.0, 0.07, 0.04);
  const bolt = mb.part('bolt', [0, 0.06, 0.06]);
  mb.box([0.03, 0.01, 0.012], [0, 0, 0], C.BLACK, bolt);
  grip(mb, [0, -0.035, 0.03]);
  mb.anchor('support', [0, -0.005, -0.28], undefined, [0.3, 0, 0]);
  mb.anchor('muzzle', [0, 0.035, -0.56]);
  mb.anchor('eject', [0.022, 0.04, -0.06]);
  mb.anchor('sight', [0, carry ? 0.093 : 0.083, 0.02]);
  mb.anchor('magwell', [0, -0.12, -0.06]);
}

function lmgBody(mb: ModelBuilder, color: number, len: number, woodStock: boolean, stockColor: number = C.POLY) {
  mb.box([0.05, 0.075, 0.3], [0, 0.03, -0.08], color);
  barrel(mb, 0.012, len, -0.23, 0.035, C.DARK);
  mb.box([0.03, 0.02, len * 0.5], [0, 0.065, -0.23 - len * 0.25], C.BLACK); // heat shield
  mb.cyl(0.015, 0.06, [0, 0.035, -0.23 - len], C.BLACK, undefined, 'z', 8);
  mb.box([0.014, 0.06, 0.1], [0, 0.1, -0.1], C.BLACK); // carry handle
  const cover = mb.part('cover', [0, 0.07, -0.03]);
  mb.box([0.052, 0.012, 0.14], [0, 0, -0.07], color, cover);
  pistolGrip(mb, 0.04, C.POLY, 22, 0.08, 0.03, 0.045);
  triggerGuard(mb, 0.01, color, 0.05);
  if (woodStock) stockSolid(mb, 0.07, 0.26, stockColor, 0.03, 0.075);
  else stockSolid(mb, 0.07, 0.24, C.POLY, 0.0, 0.08, 0.045);
  mb.box([0.006, 0.14, 0.006], [-0.022, -0.05, -0.23 - len * 0.8], C.DARK, undefined, [0.35, 0, 0.3]);
  mb.box([0.006, 0.14, 0.006], [0.022, -0.05, -0.23 - len * 0.8], C.DARK, undefined, [0.35, 0, -0.3]);
  const box = mb.part('mag', [-0.05, -0.02, -0.08]);
  mb.box([0.05, 0.1, 0.12], [0, -0.04, 0], C.OD, box);
  for (let i = 0; i < 4; i++) mb.box([0.012, 0.03, 0.01], [0.03, 0.03 - i * 0.012, -0.03 + i * 0.02], C.BRASS, box);
  frontSight(mb, -0.23 - len * 0.9, 0.05);
  grip(mb, [0, -0.035, 0.045]);
  mb.anchor('support', [0, -0.01, -0.28], undefined, [0.3, 0, 0]);
  mb.anchor('muzzle', [0, 0.035, -0.29 - len]);
  mb.anchor('eject', [0, -0.01, -0.06]);
  mb.anchor('sight', [0, 0.09, 0.03]);
  mb.anchor('magwell', [-0.05, 0.0, -0.08]);
}

function bowModel(mb: ModelBuilder, limbColor: number, gripColor: number, compound: boolean, magic: boolean): Partial<WeaponModel> {
  const bow = mb.part('bow', [0, 0, 0]);
  const segs = 7;
  const H = 0.62;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs - 0.5;
    const y = t * H;
    const z = -Math.cos(t * Math.PI) * 0.1 + 0.02;
    pts.push([y, z]);
  }
  for (let i = 0; i < segs; i++) {
    const [y0, z0] = pts[i];
    const [y1, z1] = pts[i + 1];
    const len = Math.hypot(y1 - y0, z1 - z0);
    const a = Math.atan2(z1 - z0, y1 - y0);
    const mid = i === 3;
    mb.box([mid ? 0.03 : 0.022, len + 0.004, mid ? 0.04 : 0.018], [0, (y0 + y1) / 2, (z0 + z1) / 2], mid ? gripColor : limbColor, bow, [-a, 0, 0], magic ? 0x6a5010 : 0);
  }
  if (compound) {
    mb.cyl(0.02, 0.012, [0, pts[0][0], pts[0][1]], C.BLACK, bow, 'x', 10);
    mb.cyl(0.02, 0.012, [0, pts[segs][0], pts[segs][1]], C.BLACK, bow, 'x', 10);
  }
  if (magic) mb.box([0.036, 0.06, 0.02], [0, 0, -0.1], 0xfff080, bow, undefined, 0xffc030);
  // string: two segments to a nock point (animated)
  const string = mb.part('string', [0, 0, 0.035]);
  mb.box([0.003, 1, 0.003], [0, 0, 0], magic ? 0xfff8c0 : 0xe8e0d0, string, undefined, magic ? 0xffe070 : 0);
  mb.box([0.003, 1, 0.003], [0, 0, 0], magic ? 0xfff8c0 : 0xe8e0d0, string, undefined, magic ? 0xffe070 : 0);
  const arrow = mb.part('arrow', [0, 0.0, 0.035]);
  const shaftColor = magic ? 0xfff4b0 : compound ? C.BLACK : 0xb08050;
  mb.box([0.006, 0.006, 0.6], [0, 0, -0.3], shaftColor, arrow, undefined, magic ? 0xffd040 : 0);
  mb.box([0.014, 0.014, 0.04], [0, 0, -0.61], magic ? 0xffffff : compound ? C.RED : C.STEEL, arrow, undefined, magic ? 0xffffa0 : compound ? 0x400000 : 0);
  mb.box([0.002, 0.02, 0.05], [0, 0.008, -0.01], C.RED, arrow);
  mb.box([0.02, 0.002, 0.05], [0.008, 0, -0.01], C.RED, arrow);
  mb.anchor('grip', [0, -0.01, -0.1], bow, [0, 0, 0]);
  mb.anchor('support', [0, 0, 0.04], arrow);
  mb.anchor('muzzle', [0, 0.0, -0.65], arrow);
  mb.anchor('sight', [0, 0.02, 0.1]);
  mb.anchor('eject', [0, 0, 0]);
  mb.anchor('magwell', [0, 0, 0.1]);
  // the bow is held by the left hand; swap roles: grip anchor used by left hand
  return { hip: [0.02, -0.08, -0.42], eye: 0.35, twoHand: true };
}

export function buildGrenade(): ModelBuilder {
  const mb = new ModelBuilder();
  const g = mb.part('grenade', [0, 0, 0]);
  mb.box([0.05, 0.062, 0.05], [0, 0, 0], 0x4a5630, g);
  mb.box([0.056, 0.012, 0.056], [0, 0.012, 0], 0x3a4424, g);
  mb.box([0.056, 0.012, 0.056], [0, -0.012, 0], 0x3a4424, g);
  mb.box([0.022, 0.018, 0.022], [0, 0.04, 0], C.STEEL, g);
  const spoon = mb.part('spoon', [0.012, 0.045, 0], g);
  mb.box([0.008, 0.05, 0.016], [0.004, -0.022, 0], C.STEEL, spoon, [0, 0, -0.12]);
  const pin = mb.part('pin', [-0.016, 0.042, 0], g);
  mb.box([0.022, 0.004, 0.004], [-0.008, 0, 0], C.CHROME, pin);
  mb.box([0.004, 0.022, 0.022], [-0.02, 0, 0], C.CHROME, pin);
  mb.anchor('grip', [0, -0.02, 0.01], g);
  return mb;
}

export function buildWeaponModel(id: string, visual: string[] = []): WeaponModel {
  const mb = new ModelBuilder();
  const b = MODELS[id] ?? MODELS.glock17;
  const r = b(mb, visual);
  // required anchors fallback
  for (const a of ['grip', 'support', 'muzzle', 'eject', 'sight', 'magwell']) {
    if (!mb.anchors[a]) mb.anchor(a, [0, 0.05, 0]);
  }
  mb.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  const h = r.hip ?? [0.14, -0.14, -0.33];
  // push the weapon further from the eye for a less claustrophobic viewmodel
  const hip: V3 = [h[0] * 1.1, h[1] * 1.12, h[2] * 1.32];
  return { mb, hip, eye: (r.eye ?? 0.26) * 1.55, twoHand: r.twoHand ?? true };
}

export const MODEL_IDS = Object.keys(MODELS);
