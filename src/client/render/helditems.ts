import * as THREE from 'three';
import { instantiate, shade, template, type ModelBuilder, type PartBuilder, type Painter, type BoxOpts } from './voxelmodel';

/**
 * Hand-held item models for every item icon shape, built from boxes with
 * pixel-art face textures. Convention: the grip (where the hand closes) is
 * at the origin, the item points along -Z ("forward"), +Y is up. Sizes are
 * in blocks. Returned groups expose:
 *   userData.flames: Object3D[]  — flame pivots to flicker
 *   userData.muzzle: Object3D    — barrel tip (guns/bows)
 *   userData.sightY: number      — sight line height above the grip (guns)
 */

type V3 = [number, number, number];
type P = Painter;

const STEEL = 0x3a3a40;
const ROPE = 0xb8a070;

// ------------------------------------------------------------- painters
const grain = (p: P) => {
  // wood grain runs along the long axis of the face
  if (p.w >= p.h) for (let y = 0; y < p.h; y += 2) for (let x = 0; x < p.w; x++) { if (p.rnd() < 0.6) p.shade(x, y, 0.88); }
  else for (let x = 0; x < p.w; x += 2) for (let y = 0; y < p.h; y++) { if (p.rnd() < 0.6) p.shade(x, y, 0.88); }
};
const metal = (p: P) => { p.speckle(shade(p.base, 1.18), 0.08); p.speckle(shade(p.base, 0.82), 0.08); };
const rusty = (p: P) => { metal(p); p.speckle(0x8a4a2a, 0.12, 0.15); };
const bevel = (p: P) => p.border(0.82);
const leather = (p: P) => { for (let x = 1; x < p.w; x += 3) p.cols(x, 1, shade(p.base, 0.8)); };

function builder(shape: string, c1: number, c2: number, build: (m: ModelBuilder, b: PartBuilder) => void) {
  return template(`held:${shape}:${c1.toString(16)}:${c2.toString(16)}`, (m) => build(m, m.part('item')), 32);
}

/** Build (or fetch from cache) the template for a shape and return a new instance. */
export function buildHeld(shape: string, c1: number, c2: number): THREE.Group {
  const t = builder(shape, c1, c2, (m, b) => {
    let muzzleAt: V3 | null = null;
    const box = (s: V3, p: V3, c: number, o: BoxOpts = {}) => b.box(s, p, c, o);
    const flame = (at: V3, s: number) => {
      const f = m.part('flame', 'item', at);
      f.box([0.085 * s, 0.085 * s, 0.08 * s], [0, 0, -0.035 * s], 0xff6a14, { glow: true, n: 0.15, f: { all: (p) => p.speckle(0xffb030, 0.3) } });
      f.box([0.06 * s, 0.06 * s, 0.07 * s], [0, 0, -0.1 * s], 0xffa020, { glow: true, n: 0.1, f: { all: (p) => p.speckle(0xffe080, 0.3) } });
      f.box([0.034 * s, 0.034 * s, 0.06 * s], [0, 0, -0.16 * s], 0xffe27a, { glow: true, n: 0.05 });
    };
    switch (shape) {
      case 'rock':
        box([0.2, 0.16, 0.19], [0, 0.0, -0.03], c1, { n: 0.12, f: { all: (p) => { p.speckle(shade(c1, 0.7), 0.15); p.speckle(shade(c1, 1.2), 0.1); bevel(p); } } });
        box([0.13, 0.1, 0.12], [0.045, 0.07, 0.0], shade(c1, 1.08), { r: [0.2, 0.4, 0.1], n: 0.12, f: { all: bevel } });
        box([0.12, 0.09, 0.11], [-0.06, -0.06, -0.08], shade(c1, 0.9), { r: [0.3, -0.2, 0.3], n: 0.12, f: { all: bevel } });
        break;
      case 'axe':
        box([0.045, 0.045, 0.6], [0, 0, -0.19], c1, { f: { all: grain } });
        box([0.055, 0.055, 0.13], [0, 0, 0.05], shade(c1, 0.55), { f: { all: leather } });
        box([0.06, 0.06, 0.05], [0, 0, -0.4], ROPE, { f: { all: (p) => p.speckle(shade(ROPE, 0.75), 0.3) } });
        box([0.06, 0.1, 0.12], [0, 0.02, -0.46], c2, { f: { all: metal } });
        box([0.036, 0.15, 0.14], [0, 0.12, -0.465], c2, { f: { all: metal, side: (p) => { metal(p); p.rows(0, 2, shade(c2, 1.3)); }, top: (p) => p.fill(shade(c2, 1.35)) } });
        box([0.05, 0.05, 0.08], [0, -0.05, -0.46], shade(c2, 0.85), { f: { all: metal } });
        break;
      case 'pick':
        box([0.045, 0.045, 0.62], [0, 0, -0.2], c1, { f: { all: grain } });
        box([0.055, 0.055, 0.12], [0, 0, 0.06], shade(c1, 0.55), { f: { all: leather } });
        box([0.065, 0.075, 0.085], [0, 0, -0.5], c2, { f: { all: metal } });
        for (const s of [1, -1]) {
          box([0.045, 0.2, 0.055], [0, s * 0.13, -0.48], c2, { r: [s * 0.35, 0, 0], f: { all: metal } });
          box([0.035, 0.09, 0.042], [0, s * 0.26, -0.425], shade(c2, 1.2), { r: [s * 0.8, 0, 0], f: { all: metal } });
        }
        break;
      case 'hammer':
        box([0.045, 0.045, 0.46], [0, 0, -0.13], c1, { f: { all: grain } });
        box([0.055, 0.055, 0.12], [0, 0, 0.06], shade(c1, 0.55), { f: { all: leather } });
        box([0.085, 0.19, 0.09], [0, 0.03, -0.385], c2, { f: { all: (p) => { metal(p); bevel(p); } } });
        box([0.095, 0.04, 0.1], [0, 0.135, -0.385], shade(c2, 1.25), { f: { all: metal } });
        box([0.045, 0.09, 0.06], [0, -0.1, -0.36], c2, { r: [0.45, 0, 0], f: { all: metal } });
        break;
      case 'spear':
        box([0.04, 0.04, 1.5], [0, 0, -0.25], c1, { f: { all: grain } });
        box([0.05, 0.05, 0.16], [0, 0, 0.0], shade(c1, 0.55), { f: { all: leather } });
        box([0.05, 0.05, 0.07], [0, 0, -0.94], ROPE, { f: { all: (p) => p.speckle(shade(ROPE, 0.75), 0.3) } });
        box([0.034, 0.034, 0.16], [0, 0, -1.07], shade(c1, 1.3), { f: { all: grain } });
        box([0.022, 0.022, 0.07], [0, 0, -1.18], 0x3a2a1a);
        break;
      case 'blade':
        box([0.04, 0.07, 0.15], [0, 0, 0.02], c2, { f: { all: (p) => { leather(p); p.px(p.cx, p.h >> 1, 0xb0b0b0, 0); } } });
        box([0.046, 0.08, 0.03], [0, -0.005, 0.105], shade(c2, 0.8));
        box([0.05, 0.12, 0.025], [0, 0.0, -0.065], 0x6a6a72, { f: { all: metal } });
        box([0.018, 0.085, 0.36], [0, 0.005, -0.255], c1, { f: { side: (p) => { metal(p); p.rows(0, 1, shade(c1, 0.75)); p.rows(p.h - 2, 2, shade(c1, 1.25)); } } });
        box([0.018, 0.105, 0.17], [0, 0.015, -0.51], c1, { f: { side: (p) => { metal(p); p.rows(0, 1, shade(c1, 0.75)); p.rows(p.h - 2, 2, shade(c1, 1.25)); } } });
        box([0.017, 0.075, 0.07], [0, -0.005, -0.6], shade(c1, 1.1), { r: [0.55, 0, 0] });
        break;
      case 'torch':
        box([0.05, 0.05, 0.42], [0, 0, -0.08], c1, { f: { all: grain } });
        box([0.075, 0.075, 0.1], [0, 0, -0.3], 0x3a2a1a, { f: { all: (p) => p.speckle(0x6a4a2a, 0.3) } });
        flame([0, 0, -0.34], 1);
        break;
      case 'bow': {
        box([0.05, 0.14, 0.06], [0, 0, 0], shade(c1, 0.6), { f: { all: leather } });
        for (const s of [1, -1]) {
          box([0.04, 0.17, 0.045], [0, s * 0.15, 0.02], c1, { r: [s * 0.25, 0, 0], f: { all: grain } });
          box([0.035, 0.16, 0.04], [0, s * 0.3, 0.068], c1, { r: [s * 0.45, 0, 0], f: { all: grain } });
          box([0.03, 0.12, 0.035], [0, s * 0.42, 0.125], shade(c1, 1.1), { r: [s * 0.7, 0, 0], f: { all: grain } });
        }
        box([0.01, 0.93, 0.01], [0, 0, 0.165], c2);
        // nocked arrow
        box([0.016, 0.016, 0.62], [0.024, 0.0, -0.14], 0xc8a070);
        box([0.03, 0.03, 0.05], [0.024, 0, -0.475], 0xa0a0a8, { r: [0, 0, Math.PI / 4] });
        box([0.004, 0.05, 0.08], [0.024, 0, 0.12], 0xd04030);
        box([0.05, 0.004, 0.08], [0.024, 0, 0.12], 0xe8e0d0);
        muzzleAt = [0.024, 0, -0.5];
        break;
      }
      case 'crossbow': {
        box([0.07, 0.08, 0.62], [0, 0.07, -0.12], c1, { f: { all: grain } });
        box([0.075, 0.13, 0.16], [0, 0.04, 0.22], c1, { f: { all: (p) => { grain(p); bevel(p); } } });
        box([0.05, 0.12, 0.06], [0, -0.02, 0.03], shade(c1, 0.8), { r: [-0.3, 0, 0] });
        box([0.015, 0.04, 0.015], [0, 0.02, -0.04], STEEL);
        box([0.03, 0.012, 0.5], [0, 0.116, -0.18], shade(c2, 0.6));
        box([0.12, 0.05, 0.05], [0, 0.08, -0.42], c2, { f: { all: metal } });
        for (const s of [1, -1]) {
          box([0.22, 0.035, 0.04], [s * 0.17, 0.08, -0.4], c2, { r: [0, -s * 0.25, 0], f: { all: metal } });
          box([0.03, 0.05, 0.03], [s * 0.28, 0.08, -0.36], shade(c2, 0.7));
          box([0.37, 0.008, 0.008], [s * 0.14, 0.095, -0.24], 0xe0d8c0, { r: [0, s * 0.708, 0] });
        }
        box([0.018, 0.018, 0.34], [0, 0.13, -0.28], 0xc8a070);
        box([0.026, 0.026, 0.045], [0, 0.13, -0.465], 0x9a9aa0, { r: [0, 0, Math.PI / 4] });
        muzzleAt = [0, 0.13, -0.5];
        break;
      }
      case 'pistol':
        box([0.055, 0.15, 0.075], [0, -0.06, 0.03], c2, { r: [-0.25, 0, 0], f: { all: (p) => { grain(p); bevel(p); } } });
        box([0.06, 0.07, 0.2], [0, 0.045, -0.04], c1, { f: { all: (p) => { rusty(p); bevel(p); } } });
        box([0.045, 0.045, 0.24], [0, 0.055, -0.25], shade(c1, 0.75), { f: { all: metal, front: (p) => { p.fill(0x111111, 0); } } });
        box([0.056, 0.056, 0.025], [0, 0.055, -0.2], 0xa06a3a, { f: { all: rusty } });
        box([0.056, 0.056, 0.025], [0, 0.055, -0.32], 0xa06a3a, { f: { all: rusty } });
        box([0.012, 0.05, 0.07], [0, -0.015, -0.065], shade(c1, 0.7));
        box([0.01, 0.03, 0.012], [0, 0.0, -0.045], STEEL);
        box([0.02, 0.04, 0.03], [0, 0.09, 0.055], STEEL);
        box([0.032, 0.02, 0.016], [0, 0.088, 0.03], STEEL, { f: { back: (p) => p.px(p.cx, 0, 0x000000, 0) } });
        box([0.012, 0.024, 0.012], [0, 0.088, -0.35], 0xd0d0d0);
        muzzleAt = [0, 0.055, -0.38];
        break;
      case 'shotgun':
        box([0.05, 0.12, 0.07], [0, -0.05, 0.03], c2, { r: [-0.3, 0, 0], f: { all: grain } });
        box([0.065, 0.11, 0.3], [0, -0.01, 0.24], c2, { r: [0.12, 0, 0], f: { all: (p) => { grain(p); bevel(p); } } });
        box([0.07, 0.12, 0.02], [0, -0.035, 0.395], 0x2a2a2a);
        box([0.075, 0.085, 0.16], [0, 0.04, -0.04], c1, { f: { all: (p) => { rusty(p); bevel(p); } } });
        for (const s of [1, -1]) box([0.038, 0.038, 0.6], [s * 0.02, 0.064, -0.42], shade(c1, 0.8), { f: { all: metal, front: (p) => p.fill(0x0a0a0a, 0) } });
        box([0.07, 0.05, 0.2], [0, 0.025, -0.26], c2, { f: { all: grain } });
        box([0.09, 0.05, 0.025], [0, 0.064, -0.5], 0x9a6a3a, { f: { all: rusty } });
        box([0.09, 0.05, 0.025], [0, 0.064, -0.66], 0x8a8a8a, { f: { all: metal } });
        box([0.012, 0.012, 0.012], [0, 0.09, -0.7], 0xe0e0d0);
        muzzleAt = [0, 0.064, -0.73];
        break;
      case 'rifle':
        box([0.05, 0.12, 0.065], [0, -0.05, 0.03], shade(c2, 0.85), { r: [-0.3, 0, 0], f: { all: grain } });
        box([0.065, 0.12, 0.3], [0, 0.0, 0.25], c2, { r: [0.1, 0, 0], f: { all: (p) => { grain(p); bevel(p); } } });
        box([0.07, 0.13, 0.025], [0, -0.015, 0.4], 0x222222);
        box([0.075, 0.1, 0.26], [0, 0.05, -0.06], c1, { f: { all: (p) => { metal(p); bevel(p); }, side: (p) => { metal(p); bevel(p); p.rect(2, 2, 4, 2, shade(c1, 0.55), 0); } } });
        box([0.07, 0.075, 0.28], [0, 0.045, -0.33], c2, { f: { all: (p) => { grain(p); }, side: (p) => { grain(p); for (let x = 2; x < p.w - 2; x += 3) p.px(x, 2, 0x111111, 0); } } });
        box([0.036, 0.036, 0.32], [0, 0.06, -0.6], STEEL, { f: { all: metal } });
        box([0.046, 0.046, 0.05], [0, 0.06, -0.78], 0x222226, { f: { front: (p) => p.fill(0x050505, 0) } });
        box([0.015, 0.035, 0.015], [0, 0.093, -0.72], 0x1a1a1a);
        box([0.036, 0.026, 0.02], [0, 0.112, 0.04], 0x1a1a1a, { f: { back: (p) => p.px(p.cx, 0, 0x000000, 0) } });
        box([0.05, 0.15, 0.08], [0, -0.07, -0.13], shade(c1, 0.8), { r: [0.22, 0, 0], f: { all: (p) => { metal(p); p.rows(p.h - 1, 1, shade(c1, 0.6)); } } });
        muzzleAt = [0, 0.06, -0.81];
        break;
      case 'arrow':
        box([0.018, 0.018, 0.6], [0, 0, -0.15], c1, { f: { all: grain } });
        box([0.035, 0.035, 0.06], [0, 0, -0.48], 0xa0a0a8, { r: [0, 0, Math.PI / 4] });
        box([0.004, 0.05, 0.09], [0, 0, 0.1], c2);
        box([0.05, 0.004, 0.09], [0, 0, 0.1], c2);
        break;
      case 'bullet':
        for (const x of [-0.05, 0, 0.05]) {
          box([0.035, 0.08, 0.035], [x, 0, 0], c1, { f: { all: (p) => { metal(p); p.rows(p.h - 1, 1, shade(c1, 0.7)); } } });
          box([0.028, 0.03, 0.028], [x, 0.055, 0], c2 === c1 ? 0xb07040 : c2, { f: { all: metal } });
        }
        break;
      case 'shell':
        for (const x of [-0.035, 0.035]) {
          box([0.05, 0.1, 0.05], [x, 0.01, 0], c1, { f: { all: (p) => p.rows(0, 1, shade(c1, 0.8)) } });
          box([0.055, 0.025, 0.055], [x, -0.05, 0], c2, { f: { all: metal } });
        }
        break;
      case 'grenade':
        box([0.12, 0.15, 0.12], [0, 0, 0], c1, { f: { all: (p) => { rusty(p); p.rows(1, 1, shade(c1, 1.25)); p.rows(p.h - 2, 1, shade(c1, 1.25)); p.rect(0, 4, p.w, 2, 0xb0a070); } } });
        box([0.13, 0.02, 0.13], [0, 0.085, 0], shade(c1, 1.15), { f: { all: metal } });
        box([0.04, 0.04, 0.04], [0, 0.11, 0], 0x333333);
        box([0.012, 0.07, 0.012], [0.012, 0.155, 0], 0x3a2a1a, { r: [0, 0, -0.35] });
        break;
      case 'charge':
        box([0.22, 0.16, 0.1], [0, 0, 0], c1, { f: { all: (p) => { p.speckle(shade(c1, 0.8), 0.25); bevel(p); } } });
        box([0.23, 0.07, 0.11], [0, 0.06, -0.003], shade(c1, 0.85), { f: { front: (p) => { stitch(p); }, back: stitch } });
        for (const s of [-1, 1]) box([0.03, 0.17, 0.106], [s * 0.065, 0, 0], c2, { f: { all: leather } });
        box([0.08, 0.05, 0.05], [0, 0.1, 0], 0x3a3a3a, { f: { all: metal } });
        box([0.02, 0.02, 0.02], [0.025, 0.13, 0], 0xff3020, { glow: true });
        break;
      case 'bandage':
        box([0.14, 0.1, 0.1], [0, 0, 0], c1, { f: { left: rings, right: rings, all: (p) => p.speckle(shade(c1, 0.9), 0.2) } });
        box([0.03, 0.105, 0.105], [0, 0, 0], c2);
        box([0.1, 0.006, 0.06], [0.04, -0.052, -0.07], c1);
        break;
      case 'syringe':
        box([0.04, 0.04, 0.18], [0, 0, -0.06], c1, { f: { all: (p) => { for (let x = 1; x < p.w; x += 2) p.px(x, 0, 0x606070, 0); } } });
        box([0.044, 0.044, 0.1], [0, 0, -0.1], c2, { n: 0.04, f: { all: (p) => p.rows(0, 1, shade(c2, 1.3)) } });
        box([0.015, 0.015, 0.08], [0, 0, 0.07], 0xd0d0d8);
        box([0.05, 0.05, 0.012], [0, 0, 0.11], 0x3a3a3a);
        box([0.08, 0.02, 0.015], [0, 0, 0.03], c1);
        box([0.02, 0.02, 0.02], [0, 0, -0.16], 0x9a9aa0);
        box([0.006, 0.006, 0.08], [0, 0, -0.21], 0xd8d8e0);
        break;
      case 'pills':
        box([0.08, 0.12, 0.08], [0, 0, 0], c1, { f: { all: (p) => { const y = p.h >> 1; p.rows(y - 1, 2, 0xf0f0e8); p.px(p.cx, y, 0x202020, 0); } } });
        box([0.086, 0.035, 0.086], [0, 0.075, 0], c2, { f: { all: (p) => { for (let x = 0; x < p.w; x += 2) p.px(x, 0, shade(c2, 1.4), 0); } } });
        break;
      case 'plan': {
        const blueprint = (p: P) => {
          p.fill(c1, 0.03);
          for (let x = 2; x < p.w; x += 4) p.cols(x, 1, shade(c1, 1.15), 0.02);
          for (let y = 2; y < p.h; y += 4) p.rows(y, 1, shade(c1, 1.15), 0.02);
          // a little house elevation: walls, door, gable roof
          const x0 = Math.round(p.w * 0.22), x1 = Math.round(p.w * 0.78), yb = Math.round(p.h * 0.82), yw = Math.round(p.h * 0.45);
          for (let x = x0; x <= x1; x++) { p.px(x, yb, c2, 0); p.px(x, yw, c2, 0); }
          for (let y = yw; y <= yb; y++) { p.px(x0, y, c2, 0); p.px(x1, y, c2, 0); }
          const mid = (x0 + x1) >> 1, rise = yw - Math.round(p.h * 0.18);
          for (let x = x0 - 1; x <= x1 + 1; x++) p.px(x, yw - Math.round((1 - Math.abs(x - mid) / (mid - x0 + 1)) * rise), c2, 0);
          for (let y = yb - 4; y < yb; y++) { p.px(mid - 1, y, c2, 0); p.px(mid + 1, y, c2, 0); }
          p.px(mid, yb - 4, c2, 0);
          p.border(0.75);
        };
        box([0.3, 0.22, 0.012], [0, 0.05, 0], c1, { d: 64, f: { front: blueprint, back: blueprint } });
        box([0.07, 0.03, 0.022], [0, 0.16, 0], 0x9a9aa0, { f: { all: metal } });
        break;
      }
      case 'door':
        box([0.16, 0.3, 0.03], [0, 0.05, 0], c1, { f: { all: (p) => { grain(p); bevel(p); }, front: (p) => { grain(p); bevel(p); p.rows(3, 1, shade(c1, 0.7)); p.rows(p.h - 4, 1, shade(c1, 0.7)); } } });
        box([0.02, 0.02, 0.05], [0.05, 0.04, 0], 0x2a2a2a);
        break;
      case 'lock': {
        const pad = (p: P) => { metal(p); for (let y = 1; y < p.h - 1; y += 2) for (let x = 1; x < p.w - 1; x += 2) p.px(x, y, 0xc8c8c8, 0); };
        box([0.1, 0.14, 0.05], [0, 0, 0], c1, { f: { front: pad, back: pad } });
        box([0.02, 0.02, 0.054], [0.03, 0.055, 0], c2, { glow: true });
        break;
      }
      case 'box': {
        const cross = (p: P) => { if (c2 !== c1) { p.rect(p.cx - 1, 1, 2, p.h - 2, c2, 0.02); p.rect(1, (p.h >> 1) - 1, p.w - 2, 2, c2, 0.02); } };
        box([0.22, 0.15, 0.16], [0, 0, 0], c1, { f: { all: (p) => { if (c2 === c1) grain(p); bevel(p); }, front: (p) => { if (c2 === c1) grain(p); bevel(p); cross(p); }, top: (p) => { bevel(p); cross(p); } } });
        box([0.226, 0.03, 0.166], [0, 0.04, 0], shade(c1, 0.75));
        box([0.03, 0.04, 0.012], [0, 0.03, -0.085], c2 === c1 ? 0x5a5a5a : 0x5a5a5a);
        break;
      }
      case 'bench':
        box([0.26, 0.04, 0.16], [0, 0.05, 0], c1, { f: { all: (p) => { grain(p); bevel(p); } } });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([0.03, 0.1, 0.03], [sx * 0.11, -0.02, sz * 0.06], shade(c1, 0.6));
        box([0.04, 0.04, 0.04], [0.08, 0.09, 0], 0x6a6a72, { f: { all: metal } });
        break;
      case 'furnace':
        box([0.18, 0.24, 0.18], [0, 0, 0], c1, { f: { all: (p) => { for (let y = 2; y < p.h; y += 3) p.rows(y, 1, shade(c1, 0.75)); p.speckle(shade(c1, 1.15), 0.1); } } });
        box([0.08, 0.06, 0.01], [0, -0.05, -0.092], 0xff8a20, { glow: true, n: 0.2 });
        box([0.06, 0.06, 0.06], [0, 0.15, 0.04], shade(c1, 0.8));
        break;
      case 'fire':
        box([0.05, 0.05, 0.26], [0, -0.06, 0], 0x6a4a2a, { r: [0, 0.6, 0], f: { all: grain } });
        box([0.05, 0.05, 0.26], [0, -0.06, 0], 0x5a3a20, { r: [0, -0.6, 0], f: { all: grain } });
        box([0.05, 0.05, 0.24], [0, -0.05, 0], 0x6a4a2a, { r: [0, Math.PI / 2, 0], f: { all: grain } });
        {
          const f = m.part('flame', 'item', [0, -0.03, 0], [-Math.PI / 2, 0, 0]);
          f.box([0.09, 0.09, 0.08], [0, 0, -0.035], 0xff6a14, { glow: true, n: 0.15 });
          f.box([0.06, 0.06, 0.07], [0, 0, -0.1], 0xffa020, { glow: true, n: 0.1 });
          f.box([0.034, 0.034, 0.06], [0, 0, -0.16], 0xffe27a, { glow: true });
        }
        break;
      case 'bag':
        box([0.24, 0.12, 0.12], [0, 0, 0], c1, { f: { all: (p) => p.speckle(shade(c1, 0.85), 0.2), left: swirl, right: swirl } });
        for (const s of [-1, 1]) box([0.02, 0.126, 0.126], [s * 0.07, 0, 0], 0x3a3020);
        break;
      case 'totem':
        box([0.1, 0.3, 0.1], [0, 0.06, 0], c1, { f: { all: metal, front: (p) => { metal(p); p.rect(1, 2, 1, 1, 0x2a2010, 0); p.rect(p.w - 2, 2, 1, 1, 0x2a2010, 0); p.rect(1, 5, p.w - 2, 1, 0x2a2010, 0); } } });
        box([0.14, 0.04, 0.14], [0, -0.1, 0], shade(c1, 0.7));
        box([0.12, 0.03, 0.12], [0, 0.225, 0], shade(c1, 1.15));
        break;
      case 'gear':
        box([0.14, 0.14, 0.035], [0, 0, 0], c1, { f: { all: metal, front: (p) => { metal(p); p.rect(p.cx - 1, (p.h >> 1) - 1, 2, 2, shade(c2, 0.5), 0); }, back: (p) => { metal(p); p.rect(p.cx - 1, (p.h >> 1) - 1, 2, 2, shade(c2, 0.5), 0); } } });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          box([0.04, 0.04, 0.035], [Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0], c1, { r: [0, 0, a], f: { all: metal } });
        }
        break;
      case 'pipe':
        box([0.05, 0.05, 0.3], [0, 0, -0.05], c1, { f: { all: rusty, front: (p) => { p.fill(0x111111, 0); p.border(1.0); }, back: (p) => p.fill(0x111111, 0) } });
        for (const z of [0.09, -0.19]) box([0.058, 0.058, 0.02], [0, 0, z], shade(c1, 1.2), { f: { all: metal } });
        break;
      case 'spring':
        for (let i = 0; i < 7; i++) box([0.09, 0.014, 0.016], [0, -0.07 + i * 0.023, 0], c1, { r: [0, 0, i % 2 ? 0.3 : -0.3], f: { all: metal } });
        break;
      case 'chip':
        box([0.16, 0.015, 0.12], [0, 0, 0], c1, { f: { top: (p) => { for (let x = 1; x < p.w; x += 3) p.cols(x, 1, shade(c2, 0.8), 0.02); } } });
        box([0.06, 0.015, 0.06], [0, 0.014, 0], 0x1a1a1a);
        break;
      case 'can':
        box([0.1, 0.14, 0.1], [0, 0, 0], c1, { f: { all: (p) => { metal(p); p.rows(0, 1, shade(c1, 1.25)); p.rows(p.h - 1, 1, shade(c1, 1.25)); p.rect(0, 1, p.w, Math.max(1, p.h - 2), c2, 0.04); }, top: (p) => { metal(p); p.border(1.25); } } });
        break;
      case 'rope':
        box([0.18, 0.05, 0.18], [0, -0.02, 0], c1, { f: { all: (p) => { for (let y = 0; y < p.h; y += 2) p.rows(y, 1, shade(c1, 0.8)); } } });
        box([0.15, 0.04, 0.15], [0, 0.025, 0], shade(c1, 1.06), { f: { top: (p) => { for (let i = 0; i < 3; i++) p.border(0.85); p.rect(p.cx - 1, (p.h >> 1) - 1, 3, 3, 0x2a2010, 0); } } });
        box([0.025, 0.025, 0.1], [0.08, 0.01, -0.1], c1, { r: [0, 0.4, 0] });
        break;
      case 'research':
        box([0.24, 0.03, 0.14], [0, 0.04, 0], c1, { f: { all: metal } });
        for (const sx of [-1, 1]) box([0.03, 0.1, 0.03], [sx * 0.1, -0.03, 0], 0x333333);
        box([0.1, 0.07, 0.012], [0.04, 0.1, 0.03], 0x9af0d0, { glow: true, f: { all: (p) => { p.border(0.6); p.rows(2, 1, 0x40a080); } } });
        break;
      case 'mushroom':
        box([0.05, 0.1, 0.05], [0, -0.03, 0], c2);
        box([0.15, 0.06, 0.15], [0, 0.04, 0], c1, { f: { top: (p) => { p.speckle(0xf0e8d8, 0.12, 0); bevel(p); }, all: (p) => p.rows(p.h - 1, 1, shade(c1, 0.8)) } });
        box([0.12, 0.02, 0.12], [0, 0.005, 0], shade(c2, 0.85));
        break;
      case 'pile': {
        const chunk = (s: number, p: V3, c: number, r: V3) => box([s, s * 0.8, s], p, c, { r, n: 0.12, f: { all: bevel } });
        chunk(0.09, [-0.04, -0.03, 0.02], c1, [0, 0, 0]);
        chunk(0.08, [0.05, -0.035, -0.02], c2, [0, 0.4, 0]);
        chunk(0.075, [0.0, 0.02, -0.03], c1, [0, 0.8, 0]);
        chunk(0.065, [-0.03, 0.03, 0.05], c2, [0.2, 0.2, 0]);
        chunk(0.06, [0.05, 0.02, 0.05], shade(c1, 1.1), [0.3, 0.3, 0]);
        break;
      }
      case 'ore':
        box([0.18, 0.14, 0.16], [0, 0, 0], 0x6d6d6d, { n: 0.1, f: { all: (p) => { p.speckle(c1, 0.12, 0.1); p.speckle(c2, 0.08, 0.1); bevel(p); } } });
        box([0.05, 0.05, 0.05], [0.07, 0.05, -0.05], c1, { r: [0.3, 0.5, 0] });
        box([0.05, 0.05, 0.05], [-0.06, 0.06, 0.03], c2, { r: [0.5, 0.2, 0.3] });
        box([0.045, 0.045, 0.045], [0.02, -0.06, -0.08], c1, { r: [0.2, 0.3, 0.4] });
        break;
      case 'ingot':
        box([0.2, 0.06, 0.1], [0, -0.01, 0], c1, { f: { all: (p) => { metal(p); p.border(1.15); } } });
        box([0.16, 0.03, 0.07], [0, 0.035, 0], shade(c1, 1.1), { f: { all: metal } });
        break;
      case 'log':
        box([0.3, 0.12, 0.12], [0, 0, 0], c1, { f: { all: (p) => { grain(p); p.speckle(shade(c1, 0.7), 0.1); }, left: endGrain(c2), right: endGrain(c2) } });
        break;
      case 'cloth':
        box([0.2, 0.035, 0.15], [0, -0.02, 0], c1, { f: { top: (p) => { for (let x = 1; x < p.w; x += 3) p.cols(x, 1, c2); } } });
        box([0.19, 0.035, 0.145], [0, 0.016, 0.003], shade(c1, 1.05), { f: { top: (p) => { for (let x = 1; x < p.w; x += 3) p.cols(x, 1, c2); } } });
        break;
      case 'powder':
        box([0.16, 0.04, 0.16], [0, -0.04, 0], c1, { n: 0.12 });
        box([0.11, 0.04, 0.11], [0, 0, 0], c2, { n: 0.12 });
        box([0.06, 0.035, 0.06], [0, 0.035, 0], c1, { n: 0.12 });
        break;
      case 'meat':
        box([0.17, 0.05, 0.13], [0, 0, 0], c1, { f: { all: (p) => { p.speckle(c2, 0.12, 0.05); p.border(1.12); } } });
        box([0.03, 0.03, 0.09], [0.06, 0, 0.09], 0xf0e8d8);
        box([0.045, 0.04, 0.035], [0.06, 0, 0.14], 0xf0e8d8);
        break;
      case 'berry': {
        const pts: V3[] = [[-0.03, 0, 0], [0.03, 0.005, 0.01], [0, 0.04, -0.01], [0.0, -0.005, 0.045], [-0.035, 0.035, 0.03], [0.035, 0.04, 0.03]];
        pts.forEach((pt, i) => box([0.045, 0.045, 0.045], pt, shade(c1, 0.85 + (i % 3) * 0.12), { f: { all: (p) => p.px(0, 0, shade(c1, 1.6), 0) } }));
        box([0.08, 0.01, 0.05], [0.01, 0.075, 0.0], c2, { r: [0, 0, 0.3] });
        box([0.012, 0.04, 0.012], [0, 0.065, 0], shade(c2, 0.7));
        break;
      }
      case 'bottle':
        box([0.09, 0.15, 0.09], [0, 0, 0], c1, { n: 0.03, f: { all: (p) => { p.cols(1, 1, shade(c1, 1.3), 0.02); p.rect(0, 4, p.w, 2, 0xf0f0f0, 0.02); } } });
        box([0.065, 0.03, 0.065], [0, 0.09, 0], c1, { n: 0.03 });
        box([0.035, 0.04, 0.035], [0, 0.12, 0], c1, { n: 0.03 });
        box([0.04, 0.022, 0.04], [0, 0.15, 0], c2 === c1 ? 0x2a6ab0 : 0x2a6ab0);
        break;
      case 'shirt':
        box([0.18, 0.2, 0.03], [0, 0, 0], c1, { f: { all: (p) => { p.speckle(shade(c1, 0.85), 0.2); p.rect(p.cx - 1, 0, 2, 1, shade(c1, 0.6), 0); } } });
        for (const s of [-1, 1]) box([0.08, 0.08, 0.03], [s * 0.115, 0.06, 0], c1, { r: [0, 0, -s * 0.6] });
        break;
      case 'pants':
        box([0.16, 0.05, 0.03], [0, 0.09, 0], shade(c1, 0.85));
        for (const s of [-1, 1]) box([0.07, 0.19, 0.03], [s * 0.045, -0.03, 0], c1, { r: [0, 0, s * 0.08], f: { all: (p) => p.speckle(shade(c1, 0.85), 0.2) } });
        break;
      case 'boots':
        for (const s of [-1, 1]) {
          box([0.06, 0.12, 0.07], [s * 0.05, 0.02, 0.02], c1, { f: { all: (p) => p.rows(0, 1, shade(c1, 0.8)) } });
          box([0.062, 0.04, 0.13], [s * 0.05, -0.06, -0.01], shade(c1, 0.85), { f: { all: (p) => p.rows(p.h - 1, 1, 0x1a1a1a) } });
        }
        break;
      case 'gloves':
        for (const s of [-1, 1]) {
          box([0.07, 0.1, 0.03], [s * 0.05, 0, 0], c1, { f: { all: (p) => { for (let x = 1; x < p.w; x += 2) p.rect(x, 0, 1, 3, shade(c1, 0.75)); } } });
          box([0.025, 0.04, 0.025], [s * 0.095, -0.01, 0], c1, { r: [0, 0, -s * 0.5] });
        }
        break;
      case 'helmet':
        box([0.2, 0.12, 0.2], [0, 0.03, 0], c1, { f: { all: (p) => { metal(p); bevel(p); } } });
        box([0.22, 0.03, 0.22], [0, -0.03, 0], shade(c1, 0.85), { f: { all: metal } });
        box([0.16, 0.08, 0.02], [0, -0.08, -0.1], shade(c1, 0.95), { f: { front: (p) => { metal(p); p.rows(1, 1, 0x111111); } } });
        break;
      case 'vest':
        box([0.2, 0.22, 0.04], [0, 0, 0], c1, { f: { all: (p) => { metal(p); bevel(p); }, front: (p) => { metal(p); bevel(p); for (const [x, y] of [[1, 1], [p.w - 2, 1], [1, p.h - 2], [p.w - 2, p.h - 2]]) p.px(x, y, shade(c1, 1.4), 0); } } });
        for (const s of [-1, 1]) box([0.04, 0.04, 0.05], [s * 0.07, 0.12, 0], 0x3a3020);
        break;
      case 'block':
      default:
        box([0.25, 0.25, 0.25], [0, 0, 0], c1, { f: { all: bevel } });
    }
    if (muzzleAt) m.part('muzzle', 'item', muzzleAt);
  });
  const inst = instantiate(t);
  const g = new THREE.Group();
  g.add(inst.root);
  g.userData.flames = t.parts.filter((p) => p.name === 'flame').map((p) => inst.nodes[p.name]);
  g.userData.muzzle = inst.nodes.muzzle ?? null;
  g.userData.sightY = SIGHT[shape] ?? 0;
  g.userData.shape = shape;
  return g;
}

/** Sight-line heights above the grip. */
const SIGHT: Record<string, number> = { pistol: 0.1, shotgun: 0.097, rifle: 0.126, crossbow: 0.14, bow: 0 };

function stitch(p: P) {
  for (let x = 0; x < p.w; x += 2) p.px(x, p.h - 2, shade(p.base, 1.3), 0);
}
function rings(p: P) {
  p.border(0.85);
  p.rect(p.cx - 1, (p.h >> 1) - 1, 2, 2, shade(p.base, 0.8), 0);
}
function swirl(p: P) {
  p.fill(0xd0c8a0, 0.05);
  p.border(0.8);
  p.rect(p.cx - 1, (p.h >> 1) - 1, 2, 2, shade(0xd0c8a0, 0.7), 0);
}
function endGrain(c2: number) {
  return (p: P) => {
    p.fill(c2, 0.05);
    p.border(0.55);
    p.rect(1, 1, p.w - 2, p.h - 2, c2, 0.05);
    for (let i = 2; i < Math.min(p.w, p.h) / 2; i += 2) {
      for (let x = i; x < p.w - i; x++) { p.shade(x, i, 0.85); p.shade(x, p.h - 1 - i, 0.85); }
      for (let y = i; y < p.h - i; y++) { p.shade(i, y, 0.85); p.shade(p.w - 1 - i, y, 0.85); }
    }
  };
}
