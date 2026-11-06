// Firearm viewmodel models (boxes, cm, barrel along -Z, origin = right hand grip).
// Each builder returns {b: ModelBuilder, meta}. See models.js for the meta schema.
import { ModelBuilder } from './builder.js';
import { M } from './material.js';
import { C, } from './palette.js';

const PI = Math.PI;

// ----------------------------------------------------------------------------------- helpers
/** Picatinny rail along Z. dir: 'up'|'down'|'left'|'right' (side the ridges face). (x,y) = rail base centre. */
function picatinny(b, x, y, z0, z1, w = 2.1, col = C.gunDark, dir = 'up') {
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const vert = dir === 'up' || dir === 'down';
  const sg = dir === 'up' || dir === 'right' ? 1 : -1;
  if (vert) b.box(x, y, zc, w, 0.45, len, col, M.METAL);
  else b.box(x, y, zc, 0.45, w, len, col, M.METAL);
  for (let z = z0 + 0.45; z < z1 - 0.3; z += 1.0) {
    if (vert) b.box(x, y + sg * 0.36, z, w, 0.3, 0.55, col, M.METAL);
    else b.box(x + sg * 0.36, y, z, 0.3, w, 0.55, col, M.METAL);
  }
}

function triggerPart(b, origin, col = C.gunLight, rx = -0.25) {
  b.part('trigger', { origin });
  b.box(origin[0], origin[1] - 0.8, origin[2] - 0.2, 0.55, 1.9, 0.55, col, M.METAL, { r: [rx, 0, 0] });
  b.part('body');
}

/** A round of ammunition (used as reload prop), along -Z */
export function buildRound(b, kind) {
  if (kind === 'shell') {
    b.box(0, 0, -0.6, 1.9, 1.9, 5.2, C.shellRed, M.POLY);
    b.box(0, 0, 2.3, 2.05, 2.05, 1.0, C.brass, M.BRASS);
  } else if (kind === 'big') {
    b.box(0, 0, 0.6, 1.0, 1.0, 4.4, C.brass, M.BRASS);
    b.box(0, 0, -2.4, 0.7, 0.7, 1.8, C.copper, M.BRASS);
  } else {
    b.box(0, 0, 0.4, 0.9, 0.9, 2.0, C.brass, M.BRASS);
    b.box(0, 0, -0.9, 0.7, 0.7, 0.8, C.copper, M.BRASS);
  }
}

// ----------------------------------------------------------------------------------- pistols
function clean(o) {
  for (const k in o) if (o[k] === undefined) delete o[k];
  return o;
}

function pistolCommonMeta(extra) {
  clean(extra);
  return Object.assign({
    kind: 'gun', hold: 'pistol', weight: 0.15, scale: 1.3,
    hip: { pos: [0.14, -0.15, -0.3], rot: [0.06, 0.28, -0.1] },
    sprint: { pos: [0.1, -0.24, -0.28], rot: [-0.95, 0.4, 0.25] },
    shoulders: { R: [0.3, -0.42, 0.04], L: [0.0, -0.5, -0.12] },
    adsDist: 0.3, adsNear: 0.12,
    hands: { R: 'handR', L: 'handL' },
    recoil: { pitch: 0.16, back: 0.045, yaw: 0.03, roll: 0.06, up: 0.012 },
    flash: 0.8, shell: 'brass', ejectOnFire: true, fireAnim: 'slide',
    reload: { style: 'pistol', charge: 'rack' },
    slideLockEmpty: true,
  }, extra);
}

export function pistol() {
  const b = new ModelBuilder({ texel: 0.5 });
  const G = C.gun, D = C.gunDark;
  // frame
  b.box(0, 2.05, -3.6, 2.6, 1.5, 14.6, D, M.METAL);
  b.box(0, 1.55, -9.6, 2.5, 0.7, 2.6, D, M.METAL);
  picatinny(b, 0, 0.95, -10.6, -7.6, 1.6, D, 'down'); // accessory rail
  // trigger guard
  b.box(0, -1.15, -3.7, 1.0, 0.6, 5.4, D, M.METAL);
  b.box(0, 0.05, -6.4, 1.0, 2.7, 0.7, D, M.METAL, { r: [0.22, 0, 0] });
  b.box(-1.36, 2.55, -1.5, 0.2, 0.45, 1.4, C.gunLight, M.METAL); // slide release
  b.box(-1.36, 2.3, -5.4, 0.2, 0.45, 1.0, C.gunLight, M.METAL); // takedown
  triggerPart(b, [0, 1.3, -3.1]);
  // grip (raked)
  b.push([0, -1.3, 1.6], [-0.3, 0, 0]);
  b.box(0, -2.6, 0, 2.7, 10.0, 4.6, D, M.METAL);
  for (const s of [-1, 1]) {
    b.box(s * 1.42, -2.9, 0.1, 0.22, 7.6, 3.8, C.poly, M.RUBBER);
    b.box(s * 1.56, -0.9, 0.1, 0.08, 0.5, 0.5, C.steelDark, M.STEEL);
    b.box(s * 1.56, -5.9, 0.1, 0.08, 0.5, 0.5, C.steelDark, M.STEEL);
  }
  b.box(0, -2.6, 2.35, 2.2, 9.4, 0.25, G, M.METAL);
  b.point('handR', [0, -1.4, 0.5]);
  b.point('handL', [-4.4, -2.2, -1.4]);
  b.part('mag', { origin: b.local([0, -7.6, 0]).toArray() });
  b.box(0, -2.6, -0.2, 2.1, 9.8, 3.4, C.steelDark, M.METAL);
  b.box(0, -7.95, -0.2, 2.8, 0.7, 4.5, C.poly, M.POLY);
  b.box(0, 2.35, -0.6, 0.8, 0.5, 2.4, C.brass, M.BRASS);
  b.point('magGrab', [0, -8.4, -0.2]);
  b.part('body');
  b.pop();
  // barrel (fixed)
  b.tubeZ(0, 4.15, -8.2, 1.5, 11.6, C.steelDark, M.STEEL);
  b.box(0, 4.15, -14.03, 0.8, 0.8, 0.06, 0x060606, M.FLAT);
  b.point('muzzle', [0, 4.15, -14.4]);
  b.point('sight', [0, 6.3, 3.7]);
  b.point('eject', [1.4, 5.2, -1.4]);
  // slide
  b.part('slide', { origin: [0, 4.2, 0] });
  b.box(0, 4.15, 0.45, 2.9, 2.7, 7.9, G, M.METAL);
  b.box(0, 5.6, 0.45, 2.3, 0.25, 7.9, G, M.METAL);
  for (const s of [-1, 1]) {
    b.box(s * 1.1, 3.95, -8.55, 0.7, 2.3, 10.1, G, M.METAL);
    for (let i = 0; i < 7; i++) b.box(s * 1.47, 4.1, 1.2 + i * 0.46, 0.06, 2.0, 0.2, D, M.METAL);
    b.box(s * 1.62, 4.95, 3.1, 0.3, 0.55, 1.2, D, M.METAL); // decocker
    b.box(s * 0.62, 5.95, 3.7, 0.55, 0.7, 0.8, D, M.METAL); // rear sight posts
    b.box(s * 0.62, 6.0, 4.11, 0.22, 0.22, 0.04, 0x8f8f84, M.EMIT);
  }
  b.box(0, 3.05, -8.55, 2.9, 0.5, 10.1, G, M.METAL);
  b.box(0, 3.3, -13.3, 2.9, 1.0, 0.7, G, M.METAL);
  b.box(1.47, 4.75, -1.6, 0.05, 0.9, 2.6, 0x0a0a0a, M.FLAT); // ejection port
  b.box(0, 5.7, -12.9, 0.5, 1.2, 0.8, D, M.METAL); // front sight
  b.box(0, 6.0, -12.49, 0.22, 0.22, 0.04, 0x8f8f84, M.EMIT);
  b.point('chargeGrab', [0, 5.0, 2.6]);
  b.part('hammer', { origin: [0, 3.5, 4.3] });
  b.box(0, 4.25, 4.75, 0.9, 1.5, 0.8, D, M.METAL, { r: [0.2, 0, 0] });
  b.part('body');
  return {
    b,
    meta: pistolCommonMeta({
      channels: {
        slide: [{ part: 'slide', t: [0, 0, 2.6] }],
        hammer: [{ part: 'hammer', r: [0.8, 0, 0] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      mag: { part: 'mag', axis: [0, -0.955, 0.296], grab: 'magGrab' },
    }),
  };
}

export function pistol1911() {
  const b = new ModelBuilder({ texel: 0.5 });
  const G = C.blued, D = C.bluedDark;
  b.box(0, 2.0, -3.0, 2.4, 1.5, 12.8, D, M.METAL);
  b.box(0, -1.05, -3.7, 1.0, 0.55, 4.6, D, M.METAL);
  b.box(0, 0.15, -5.9, 1.0, 2.6, 0.6, D, M.METAL);
  b.box(-1.32, 2.65, -1.8, 0.25, 0.6, 1.8, G, M.METAL); // slide stop
  b.box(-1.32, 3.0, 2.3, 0.25, 0.5, 1.6, G, M.METAL); // thumb safety
  triggerPart(b, [0, 1.25, -3.2], C.steel, -0.05);
  b.push([0, -1.2, 1.5], [-0.3, 0, 0]);
  b.box(0, -2.6, 0, 2.5, 10.2, 4.4, D, M.METAL);
  for (const s of [-1, 1]) {
    b.box(s * 1.33, -2.8, 0.0, 0.25, 7.4, 3.6, C.walnut, M.WOOD);
    // checkering diamonds
    for (let yy = -5.6; yy < -0.4; yy += 1.1) for (let zz = -1.2; zz <= 1.2; zz += 1.2) b.box(s * 1.47, yy, zz, 0.04, 0.45, 0.45, C.woodDark, M.WOOD);
    b.box(s * 1.49, -0.7, 0.0, 0.08, 0.45, 0.45, C.steel, M.STEEL);
    b.box(s * 1.49, -5.0, 0.0, 0.08, 0.45, 0.45, C.steel, M.STEEL);
  }
  b.box(0, -2.4, 2.3, 2.1, 8.8, 0.3, G, M.METAL);
  b.box(0, 2.6, 2.6, 2.2, 0.6, 2.4, G, M.METAL, { r: [0.5, 0, 0] }); // beavertail
  b.point('handR', [0, -1.4, 0.5]);
  b.point('handL', [-4.4, -2.2, -1.4]);
  b.part('mag', { origin: b.local([0, -7.7, 0]).toArray() });
  b.box(0, -2.6, -0.2, 1.9, 9.8, 3.2, C.steel, M.STEEL);
  b.box(0, -7.95, -0.2, 2.3, 0.55, 3.8, C.steelDark, M.METAL);
  b.box(0, 2.35, -0.6, 0.9, 0.55, 2.4, C.brass, M.BRASS);
  b.point('magGrab', [0, -8.3, -0.2]);
  b.part('body');
  b.pop();
  b.tubeZ(0, 4.1, -8.0, 1.4, 11.0, C.steelDark, M.STEEL);
  b.point('muzzle', [0, 4.1, -14.4]);
  b.point('sight', [0, 6.25, 3.6]);
  b.point('eject', [1.3, 5.1, -1.2]);
  b.part('slide', { origin: [0, 4.2, 0] });
  b.box(0, 4.1, -4.6, 2.5, 2.7, 18.4, G, M.METAL);
  b.box(0, 5.55, -4.6, 1.8, 0.3, 18.4, G, M.METAL);
  b.box(0, 4.1, -13.85, 1.7, 1.7, 0.3, C.steelDark, M.STEEL); // bushing
  b.box(0, 4.1, -14.02, 0.75, 0.75, 0.06, 0x050505, M.FLAT);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) b.box(s * 1.27, 4.0, 1.0 + i * 0.42, 0.06, 2.1, 0.18, D, M.METAL);
    for (let i = 0; i < 5; i++) b.box(s * 1.27, 4.0, -12.6 + i * 0.42, 0.06, 2.1, 0.18, D, M.METAL);
    b.box(s * 0.6, 5.95, 3.6, 0.6, 0.7, 0.9, D, M.METAL);
  }
  b.box(1.27, 4.8, -1.3, 0.05, 1.0, 3.0, 0x0a0a0a, M.FLAT);
  b.box(0, 5.9, -12.4, 0.4, 0.75, 1.2, D, M.METAL);
  b.point('chargeGrab', [0, 5.0, 2.6]);
  b.part('hammer', { origin: [0, 3.6, 4.0] });
  b.box(0, 4.4, 4.45, 0.8, 1.4, 0.6, C.steelDark, M.METAL, { r: [0.35, 0, 0] });
  b.box(0, 5.0, 4.8, 0.8, 0.45, 0.8, C.steelDark, M.METAL, { r: [0.35, 0, 0] });
  b.part('body');
  return {
    b,
    meta: pistolCommonMeta({
      channels: {
        slide: [{ part: 'slide', t: [0, 0, 2.6] }],
        hammer: [{ part: 'hammer', r: [0.7, 0, 0] }],
        trigger: [{ part: 'trigger', t: [0, 0, 0.3] }],
      },
      mag: { part: 'mag', axis: [0, -0.955, 0.296], grab: 'magGrab' },
      recoil: { pitch: 0.2, back: 0.05, yaw: 0.035, roll: 0.07, up: 0.014 },
    }),
  };
}

export function revolver() {
  const b = new ModelBuilder({ texel: 0.5 });
  const S = C.stainless, SD = 0x7f858c;
  // frame
  b.box(0, 5.95, -1.7, 1.7, 0.85, 6.6, S, M.STEEL);   // top strap
  b.box(0, 2.35, -2.2, 2.2, 1.3, 7.4, S, M.STEEL);    // bottom
  b.box(0, 4.15, 1.0, 2.6, 4.4, 1.0, S, M.STEEL);     // recoil shield
  b.box(0, 4.15, -4.9, 2.2, 3.5, 1.0, S, M.STEEL);    // front of the window
  b.box(-1.2, 3.7, 0.1, 0.3, 0.7, 1.1, SD, M.METAL);  // cylinder latch
  for (const s of [-1, 1]) b.box(s * 0.45, 6.55, 0.6, 0.45, 0.45, 0.9, C.gunDark, M.METAL); // rear sight
  // barrel + full underlug + rib
  b.tubeZ(0, 4.35, -10.8, 1.75, 11.8, S, M.STEEL);
  b.box(0, 3.0, -10.3, 1.45, 1.4, 11.2, S, M.STEEL);
  b.box(0, 5.35, -10.8, 1.05, 0.4, 11.8, S, M.STEEL);
  b.box(0, 6.1, -15.9, 0.42, 1.4, 1.3, S, M.STEEL);
  b.box(0, 6.3, -15.4, 0.44, 0.5, 0.3, C.emitOrange, M.EMIT); // sight insert
  b.box(0, 4.35, -16.72, 0.8, 0.8, 0.06, 0x050505, M.FLAT);
  b.point('muzzle', [0, 4.35, -17.0]);
  b.point('sight', [0, 6.78, 0.6]);
  // trigger guard
  b.box(0, 0.25, -2.8, 1.0, 0.55, 4.4, S, M.STEEL);
  b.box(0, 1.1, -4.85, 1.0, 1.9, 0.55, S, M.STEEL, { r: [0.3, 0, 0] });
  triggerPart(b, [0, 1.9, -2.6], C.steelDark, -0.35);
  // grip
  b.push([0, 1.2, 1.8], [-0.45, 0, 0]);
  b.box(0, -2.6, 0.6, 2.4, 6.5, 2.0, S, M.STEEL);
  b.box(0, -3.0, 0.0, 3.0, 7.0, 3.8, C.rubber, M.RUBBER);
  for (let i = 0; i < 3; i++) b.box(0, -1.4 - i * 1.6, -1.95, 2.6, 0.7, 0.3, C.rubber, M.RUBBER);
  b.box(0, -6.8, 0.3, 3.0, 0.9, 3.4, C.rubber, M.RUBBER);
  b.point('handR', [0, -1.8, 0.3]);
  b.point('handL', [-4.4, -2.6, -1.3]);
  b.pop();
  // crane + cylinder (swings out to the left)
  b.part('crane', { origin: [-0.9, 2.6, -4.4] });
  b.box(-0.6, 2.75, -4.1, 0.8, 0.9, 1.0, SD, M.STEEL);
  b.box(0, 3.0, -4.4, 0.6, 0.6, 1.2, SD, M.STEEL); // ejector rod front
  b.point('chamber', [0, 4.15, 1.4]);
  b.part('cylinder', { origin: [0, 4.15, -1.65], parent: 'crane' });
  b.box(0, 4.15, -1.65, 3.9, 2.5, 4.3, S, M.STEEL);
  b.box(0, 4.15, -1.65, 2.5, 3.9, 4.3, S, M.STEEL);
  b.box(0, 4.15, -1.65, 3.4, 3.4, 4.3, S, M.STEEL, { r: [0, 0, PI / 4] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + PI / 6;
    const x = Math.cos(a) * 1.95, y = 4.15 + Math.sin(a) * 1.95;
    b.box(x, y, -2.1, 0.5, 0.5, 2.4, 0x5d6268, M.METAL, { r: [0, 0, a] }); // flutes
    const rx = Math.cos(a - PI / 6) * 1.15, ry = 4.15 + Math.sin(a - PI / 6) * 1.15;
    b.box(rx, ry, 0.5, 0.95, 0.95, 0.12, C.brass, M.BRASS);
    b.box(rx, ry, 0.56, 0.4, 0.4, 0.04, C.copper, M.BRASS);
  }
  b.box(0, 4.15, -3.9, 0.7, 0.7, 0.4, SD, M.STEEL);
  b.part('hammer', { origin: [0, 4.4, 1.6] });
  b.box(0, 5.4, 2.05, 0.8, 1.7, 0.9, SD, M.METAL, { r: [-0.25, 0, 0] });
  b.box(0, 6.2, 2.6, 0.8, 0.45, 1.3, SD, M.METAL, { r: [-0.25, 0, 0] });
  b.part('body');
  return {
    b,
    meta: pistolCommonMeta({
      weight: 0.25,
      channels: {
        hammer: [{ part: 'hammer', r: [0.75, 0, 0] }],
        cylinderOut: [{ part: 'crane', r: [0, 0, 1.25] }],
        cylinderRot: [{ part: 'cylinder', r: [0, 0, -1] }],
        trigger: [{ part: 'trigger', r: [0.4, 0, 0] }],
      },
      recoil: { pitch: 0.3, back: 0.055, yaw: 0.04, roll: 0.08, up: 0.02 },
      flash: 1.0, shell: null, ejectOnFire: false, fireAnim: 'revolver', slideLockEmpty: false,
      reload: { style: 'revolver' },
    }),
  };
}

// ----------------------------------------------------------------------------------- shotguns
function longGunMeta(extra) {
  clean(extra);
  return Object.assign({
    kind: 'gun', hold: 'rifle', weight: 0.6, scale: 1.0,
    hip: { pos: [0.14, -0.14, -0.34], rot: [0.02, 0.13, -0.06] },
    sprint: { pos: [0.05, -0.17, -0.25], rot: [-0.45, 0.85, 0.5] },
    adsDist: 0.17,
    hands: { R: 'handR', L: 'handL' },
    recoil: { pitch: 0.1, back: 0.04, yaw: 0.02, roll: 0.04, up: 0.006 },
    flash: 1.0, shell: 'brass', ejectOnFire: true, fireAnim: 'none',
    reload: { style: 'rifle', charge: 'catch' },
  }, extra);
}

function shotgunStock(b, wood, z0 = 3, butt = true) {
  b.box(0, 3.3, z0 + 4.2, 3.0, 4.2, 8.5, wood, M.WOOD, { r: [-0.2, 0, 0] });
  if (!butt) return;
  b.box(0, 0.9, z0 + 18.5, 3.4, 7.4, 22, wood, M.WOOD, { r: [-0.13, 0, 0] });
  b.box(0, 4.0, z0 + 17.5, 2.8, 1.2, 18, wood, M.WOOD, { r: [-0.13, 0, 0] });
  b.box(0, -0.4, z0 + 29.7, 3.6, 8.4, 1.4, C.rubber, M.RUBBER, { r: [-0.13, 0, 0] });
}

export function shotgunPump() {
  const b = new ModelBuilder({ texel: 0.8 });
  const G = C.blued, W = C.wood;
  b.box(0, 5.2, -6.0, 3.2, 5.6, 18, G, M.METAL);       // receiver z -15..3
  b.box(0, 7.9, -6.0, 2.4, 0.35, 18, G, M.METAL);
  b.box(1.62, 6.0, -6.6, 0.06, 2.0, 6.4, 0x0b0b0b, M.FLAT); // ejection port
  b.box(1.64, 6.0, -6.6, 0.05, 1.2, 4.6, C.steel, M.STEEL); // bolt face visible
  b.box(0, 2.38, -7.4, 1.9, 0.06, 6.4, 0x0b0b0b, M.FLAT);   // loading port
  b.box(0, 2.45, -9.0, 1.4, 0.12, 2.2, C.steelDark, M.METAL); // lifter
  b.box(1.65, 3.4, -11.5, 0.12, 0.6, 0.6, C.steelDark, M.METAL); // pins
  b.box(1.65, 3.4, -2.0, 0.12, 0.6, 0.6, C.steelDark, M.METAL);
  // trigger group
  b.box(0, 2.0, -3.5, 2.2, 1.6, 10, C.gunDark, M.METAL);
  b.box(0, -0.2, -3.8, 1.0, 0.55, 5.4, C.gunDark, M.METAL);
  b.box(0, 0.9, -6.3, 1.0, 2.3, 0.6, C.gunDark, M.METAL);
  b.box(0, 1.35, -0.9, 1.0, 0.5, 1.2, C.gunDark, M.METAL); // safety
  triggerPart(b, [0, 1.8, -3.4]);
  // barrel, rib, bead, mag tube
  b.tubeZ(0, 6.6, -45, 2.2, 60, G, M.METAL);
  b.box(0, 7.95, -45, 0.8, 0.45, 60, G, M.METAL);
  b.box(0, 8.6, -73.6, 1.0, 0.8, 1.4, G, M.METAL);
  b.box(0, 9.35, -73.6, 0.4, 0.9, 1.0, G, M.METAL);
  b.box(0, 9.72, -73.25, 0.42, 0.16, 0.12, C.emitOrange, M.EMIT);
  // ghost ring rear sight
  b.box(0, 8.25, 1.4, 2.4, 0.5, 1.6, G, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.9, 9.2, 1.4, 0.45, 1.6, 0.6, G, M.METAL);
  b.box(0, 10.25, 1.4, 2.25, 0.5, 0.6, G, M.METAL);
  b.box(0, 6.6, -75.03, 1.2, 1.2, 0.06, 0x050505, M.FLAT);
  b.tubeZ(0, 3.5, -38, 2.0, 46, G, M.METAL);
  b.box(0, 3.5, -61.6, 2.3, 2.3, 1.3, G, M.METAL);
  b.box(0, 5.0, -59.5, 1.4, 3.2, 1.2, G, M.METAL);
  b.point('muzzle', [0, 6.6, -75.4]);
  b.point('sight', [0, 9.8, 1.6]);
  b.point('eject', [1.8, 6.4, -6.6]);
  b.point('port', [0, 1.4, -7.4]);
  // stock
  shotgunStock(b, W, 3);
  b.point('handR', [0, 2.3, 6.8]);
  // pump
  b.part('pump', { origin: [0, 3.5, -31] });
  b.box(0, 3.55, -31, 4.2, 3.4, 18, W, M.WOOD);
  for (let i = 0; i < 7; i++) b.box(0, 3.55, -38 + i * 2.3, 4.32, 3.52, 0.45, C.woodDark, M.WOOD);
  for (const s of [-1, 1]) b.box(s * 1.1, 3.0, -17.5, 0.35, 0.6, 9, C.steelDark, M.METAL);
  b.point('handL', [0, 0.0, -30]);
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      hold: 'shotgun', weight: 0.75, adsDist: 0.2,
      channels: {
        pump: [{ part: 'pump', t: [0, 0, 8.5] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      recoil: { pitch: 0.24, back: 0.085, yaw: 0.04, roll: 0.08, up: 0.012 },
      flash: 1.6, shell: 'shell', ejectOnFire: false, ejectOnPump: true,
      reload: { style: 'shotgun' },
    }),
  };
}

function doubleBarrel(sawed) {
  const b = new ModelBuilder({ texel: 0.8 });
  const G = C.blued, W = C.walnut, R = 0x8d9399;
  const len = sawed ? 27 : 66;
  // action (case hardened)
  b.box(0, 4.9, -2.9, 4.4, 4.4, 8.2, R, M.METAL);
  b.box(0, 7.15, -2.4, 3.0, 0.2, 7.0, R, M.METAL);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) b.box(s * 2.22, 4.0 + i * 1.1, -2.9 + (i % 2) * 1.2, 0.04, 0.5, 2.5, 0x6d7278, M.METAL); // engraving
  }
  b.box(0, 2.4, -1.5, 2.4, 1.2, 6.0, R, M.METAL);
  b.box(0, 0.3, -1.8, 1.0, 0.55, 5.0, C.bluedDark, M.METAL);
  b.box(0, 1.2, -4.2, 1.0, 2.0, 0.6, C.bluedDark, M.METAL);
  triggerPart(b, [0, 1.9, -2.6]);
  b.box(0, 1.15, -1.0, 0.5, 1.6, 0.45, C.gunLight, M.METAL, { r: [-0.3, 0, 0] });
  if (!sawed) shotgunStock(b, W, 1.2);
  else {
    // sawn-off pistol grip
    b.box(0, 3.4, 4.0, 3.0, 4.0, 5.0, W, M.WOOD, { r: [-0.2, 0, 0] });
    b.box(0, 0.4, 6.6, 3.0, 6.4, 3.6, W, M.WOOD, { r: [-0.55, 0, 0] });
    b.box(0, -2.4, 8.4, 3.1, 1.6, 3.2, C.woodLight, M.WOOD, { r: [-0.55, 0, 0] }); // rough cut end
  }
  b.point('handR', sawed ? [0, 1.4, 6.0] : [0, 2.2, 6.0]);
  b.point('sight', [0, 7.45, 0.6]);
  b.point('eject', [0, 6.8, -6.0]);
  // lever
  b.part('lever', { origin: [0, 7.4, -1.0] });
  b.box(0.6, 7.5, -0.2, 1.6, 0.45, 2.6, R, M.METAL, { r: [0, 0.2, 0] });
  // barrels (hinge at front bottom of the action)
  b.part('barrels', { origin: [0, 3.0, -7.0] });
  const zc = -7 - len / 2;
  for (const s of [-1, 1]) {
    b.tubeZ(s * 1.15, 5.4, zc, 2.25, len, G, M.METAL);
    b.box(s * 1.15, 5.4, -7 - len - 0.03, 1.2, 1.2, 0.06, 0x050505, M.FLAT);
  }
  b.box(0, 6.65, zc, 0.9, 0.5, len, G, M.METAL);
  b.box(0, 4.2, zc, 1.4, 1.0, len, G, M.METAL);
  b.box(0, 7.15, -7 - len + 0.6, 0.45, 0.6, 0.45, C.brass, M.BRASS);
  b.box(0, 3.65, sawed ? -16 : -22, 3.8, 2.4, sawed ? 13 : 22, W, M.WOOD);
  b.box(0, 3.65, sawed ? -9.8 : -11.2, 3.9, 2.5, 0.6, C.woodDark, M.WOOD);
  b.point('handL', [0, 0.8, sawed ? -16 : -22]);
  b.point('muzzle', [0, 5.4, -7 - len - 0.4]);
  b.point('chamber', [0, 5.4, -7.6]);
  for (const s of [-1, 1]) {
    b.part(s < 0 ? 'shellL' : 'shellR', { origin: [s * 1.15, 5.4, -7.2], parent: 'barrels' });
    b.box(s * 1.15, 5.4, -7.2, 1.9, 1.9, 0.3, C.brass, M.BRASS);
    b.box(s * 1.15, 5.4, -7.0, 0.5, 0.5, 0.06, C.copper, M.BRASS);
  }
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      hold: 'shotgun', weight: sawed ? 0.45 : 0.75,
      hip: sawed ? { pos: [0.1, -0.13, -0.28], rot: [0.02, 0.06, 0] } : undefined,
      adsDist: sawed ? 0.2 : 0.2,
      channels: {
        breakOpen: [{ part: 'barrels', r: [-0.62, 0, 0] }],
        lever: [{ part: 'lever', r: [0, -0.7, 0] }],
        shellEject: [{ part: 'shellL', t: [0, 3, 9] }, { part: 'shellR', t: [0, 3, 9] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      recoil: sawed ? { pitch: 0.4, back: 0.09, yaw: 0.06, roll: 0.12, up: 0.02 } : { pitch: 0.28, back: 0.09, yaw: 0.05, roll: 0.09, up: 0.014 },
      flash: sawed ? 2.0 : 1.7, shell: 'shell', ejectOnFire: false,
      reload: { style: 'break' },
      chamberShells: ['shellL', 'shellR'],
    }),
  };
}
export const shotgunDouble = () => doubleBarrel(false);
export const shotgunSawed = () => doubleBarrel(true);

// ----------------------------------------------------------------------------------- rifles
export function rifleHunting() {
  const b = new ModelBuilder({ texel: 0.8 });
  const G = C.blued, W = C.walnut;
  // receiver
  b.tubeZ(0, 6.0, -4.0, 2.7, 18, G, M.METAL);
  b.box(1.36, 6.4, -2.0, 0.06, 1.3, 5.0, 0x0a0a0a, M.FLAT);
  // barrel (tapered)
  b.tubeZ(0, 6.1, -26.5, 1.8, 27, G, M.METAL);
  b.tubeZ(0, 6.1, -55.5, 1.45, 31, G, M.METAL);
  b.box(0, 6.1, -71.03, 0.7, 0.7, 0.06, 0x050505, M.FLAT);
  b.point('muzzle', [0, 6.1, -71.4]);
  // scope
  for (const z of [-8, 3]) {
    b.box(0, 7.7, z, 2.2, 1.0, 1.6, C.gunDark, M.METAL);
    b.box(0, 9.6, z, 3.3, 3.3, 1.2, C.gunDark, M.METAL);
  }
  b.tubeZ(0, 9.6, -3.0, 2.6, 22, C.gunDark, M.METAL);
  b.tubeZ(0, 9.6, -17.6, 4.4, 6.8, C.gunDark, M.METAL);
  b.tubeZ(0, 9.6, -14.8, 3.4, 1.4, C.gunDark, M.METAL);
  b.box(0, 9.6, -21.05, 3.6, 3.6, 0.1, C.glass, M.GLASS);
  b.tubeZ(0, 9.6, 10.6, 3.6, 5.0, C.gunDark, M.METAL);
  b.tubeZ(0, 9.6, 7.6, 3.0, 1.4, C.rubber, M.RUBBER);
  b.box(0, 9.6, 13.12, 2.9, 2.9, 0.1, C.glass, M.GLASS);
  b.box(0, 11.3, -3.0, 1.6, 1.4, 1.6, C.gunDark, M.METAL);
  b.box(0, 12.1, -3.0, 1.8, 0.4, 1.8, C.gunLight, M.METAL);
  b.box(1.75, 9.6, -3.0, 1.2, 1.6, 1.6, C.gunDark, M.METAL);
  b.point('sight', [0, 9.6, 13.0]);
  b.point('eject', [1.6, 6.6, -2.0]);
  b.point('port', [1.0, 8.0, -2.0]);
  // stock
  b.box(0, 3.8, -28, 3.4, 3.6, 30, W, M.WOOD);
  b.box(0, 3.9, -43.6, 3.4, 3.2, 1.2, 0x1e1410, M.WOOD);
  b.box(0, 3.6, -4.0, 3.6, 4.4, 18, W, M.WOOD);
  b.box(0, 2.9, 9.2, 3.2, 4.8, 8.4, W, M.WOOD, { r: [-0.16, 0, 0] });
  b.box(0, 2.3, 24.6, 3.6, 8.8, 22, W, M.WOOD, { r: [-0.06, 0, 0] });
  b.box(0, 6.1, 22.0, 3.0, 1.4, 14, W, M.WOOD, { r: [-0.04, 0, 0] });
  b.box(0, 1.9, 36.2, 3.8, 9.4, 1.5, C.rubber, M.RUBBER, { r: [-0.06, 0, 0] });
  b.box(0, -1.8, 26, 0.6, 0.5, 1.2, C.steelDark, M.METAL); // swivel
  b.box(0, 1.8, -38, 0.6, 0.5, 1.2, C.steelDark, M.METAL);
  // checkering
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) b.box(s * 1.62, 2.8 + (i % 2) * 0.8, 8 + i * 1.2, 0.04, 0.6, 0.6, C.woodDark, M.WOOD, { r: [-0.16, 0, 0] });
  b.box(0, 1.1, -4.5, 1.5, 0.6, 9, G, M.METAL);
  b.box(0, -0.4, -1.8, 1.0, 0.5, 4.4, G, M.METAL);
  b.box(0, 0.4, -4.0, 1.0, 2.0, 0.5, G, M.METAL);
  triggerPart(b, [0, 1.4, -1.8]);
  b.point('handR', [0, 1.9, 9.6]);
  b.point('handL', [0, 0.4, -26]);
  // bolt
  b.part('bolt', { origin: [0, 6.0, 3.0] });
  b.box(0, 6.0, 0.5, 1.7, 1.7, 7.0, C.steel, M.STEEL);
  b.box(0, 6.0, 5.8, 2.0, 2.0, 1.8, G, M.METAL);
  b.box(1.8, 5.55, 4.3, 2.6, 0.6, 0.6, C.steel, M.STEEL, { r: [0, 0, -0.45] });
  b.box(3.2, 4.85, 4.3, 1.3, 1.3, 1.3, G, M.METAL);
  b.point('boltGrab', [3.3, 4.4, 4.3]);
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.8, scope: true, adsDist: 0.07,
      channels: {
        boltLift: [{ part: 'bolt', r: [0, 0, 1.15] }],
        boltBack: [{ part: 'bolt', t: [0, 0, 6.5] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      recoil: { pitch: 0.2, back: 0.075, yaw: 0.03, roll: 0.06, up: 0.01 },
      flash: 1.3, shell: 'big', ejectOnFire: false, ejectOnBolt: true,
      reload: { style: 'bolt' },
    }),
  };
}

export function rifleAR() {
  const b = new ModelBuilder({ texel: 0.8 });
  const G = 0x34363b, D = 0x26282b, P = C.poly;
  // upper
  b.box(0, 6.2, -2.0, 2.8, 2.4, 18, G, M.METAL);
  picatinny(b, 0, 7.6, -11, 7, 2.2, D, 'up');
  b.box(1.42, 6.0, -2.4, 0.05, 1.4, 5.2, 0x0a0a0a, M.FLAT); // port
  b.box(1.45, 5.2, -2.4, 0.08, 0.3, 5.2, D, M.METAL); // dust cover hinge
  b.box(1.55, 6.5, 1.9, 0.5, 1.3, 1.2, G, M.METAL);  // brass deflector
  b.tubeZ(1.7, 6.7, 4.2, 1.1, 1.8, G, M.METAL);      // forward assist
  // lower
  b.box(0, 3.8, -1.0, 2.6, 2.6, 16, G, M.METAL);
  b.box(0, 1.6, -5.4, 2.9, 3.6, 4.6, G, M.METAL);
  b.box(1.35, 3.3, -4.6, 0.25, 0.8, 0.8, D, M.METAL); // mag release
  b.box(-1.35, 3.8, -1.2, 0.2, 1.2, 1.6, D, M.METAL); // bolt catch
  b.box(-1.38, 3.8, 2.6, 0.25, 0.5, 1.6, D, M.METAL); // selector
  b.box(0, 1.15, -1.3, 1.0, 0.5, 5.0, G, M.METAL);
  b.box(0, 1.9, -3.6, 1.0, 1.6, 0.5, G, M.METAL);
  triggerPart(b, [0, 2.2, -1.8]);
  // grip
  b.push([0, 1.6, 2.4], [-0.38, 0, 0]);
  b.box(0, -3.0, 0, 2.5, 6.6, 3.2, P, M.POLY);
  for (let i = 0; i < 3; i++) b.box(0, -1.6 - i * 1.6, -1.65, 2.3, 0.7, 0.2, P, M.POLY);
  b.box(0, -6.4, 0.2, 2.7, 0.5, 3.6, P, M.POLY);
  b.point('handR', [0, -2.8, 0.2]);
  b.pop();
  // buffer tube + stock
  b.tubeZ(0, 6.0, 11.5, 2.4, 10, D, M.METAL);
  b.box(0, 5.6, 19.4, 3.0, 3.8, 9.5, P, M.POLY);
  b.box(0, 2.9, 21.5, 2.8, 3.6, 4.6, P, M.POLY, { r: [-0.55, 0, 0] });
  b.box(0, 4.4, 24.4, 3.2, 7.8, 1.1, C.rubber, M.RUBBER);
  b.box(0, 3.9, 16.0, 1.6, 0.8, 2.0, P, M.POLY); // adjustment lever
  // handguard (quad rail)
  b.box(0, 6.0, -11.5, 3.9, 3.9, 1.0, D, M.METAL);
  b.box(0, 6.0, -23.5, 3.5, 3.5, 24, G, M.METAL);
  picatinny(b, 0, 7.95, -35.5, -12, 2.0, D, 'up');
  picatinny(b, 0, 4.05, -35.5, -12, 2.0, D, 'down');
  picatinny(b, 1.95, 6.0, -35.5, -12, 2.0, D, 'right');
  picatinny(b, -1.95, 6.0, -35.5, -12, 2.0, D, 'left');
  // barrel, FSB, flash hider
  b.tubeZ(0, 6.0, -44, 1.4, 16, D, M.METAL);
  b.box(0, 6.6, -40.0, 1.8, 2.0, 2.0, D, M.METAL);
  b.box(0, 4.8, -40.0, 1.2, 1.4, 1.2, D, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.65, 8.7, -40.0, 0.35, 2.4, 1.0, D, M.METAL);
  b.box(0, 8.6, -40.0, 0.3, 1.8, 0.3, D, M.METAL);
  b.tubeZ(0, 6.0, -53.3, 1.9, 3.2, D, M.METAL);
  for (let i = 0; i < 3; i++) b.box(0, 6.0, -52.4 - i * 0.9, 1.95, 0.25, 0.45, 0x0a0a0a, M.FLAT, { r: [0, 0, i * 1.05] });
  b.box(0, 6.0, -54.93, 1.0, 1.0, 0.06, 0x050505, M.FLAT);
  b.point('muzzle', [0, 6.0, -55.3]);
  // holographic sight
  b.box(0, 8.75, -1.6, 3.2, 0.7, 8.4, D, M.METAL);
  b.box(0, 9.35, 1.6, 3.0, 1.3, 2.6, D, M.METAL);
  b.box(1.0, 9.5, 2.95, 0.5, 0.5, 0.15, 0x333a33, M.RUBBER);
  b.box(-1.0, 9.5, 2.95, 0.5, 0.5, 0.15, 0x333a33, M.RUBBER);
  b.box(0, 11.85, -2.4, 3.6, 0.5, 4.4, D, M.METAL);
  for (const s of [-1, 1]) b.box(s * 1.6, 10.4, -2.4, 0.4, 2.6, 4.4, D, M.METAL);
  b.box(0, 10.35, -4.45, 2.8, 2.9, 0.06, 0x223344, M.GLASS, { skip: 'pz' });
  b.box(0, 10.35, -4.38, 0.26, 0.26, 0.04, C.emitRed, M.EMIT);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    b.box(Math.cos(a) * 0.9, 10.35 + Math.sin(a) * 0.9, -4.38, 0.18, 0.18, 0.03, C.emitRed, M.EMIT);
  }
  b.point('sight', [0, 10.35, 2.0]);
  b.point('eject', [1.6, 6.2, -2.4]);
  b.point('handL', [0, 1.6, -23]);
  b.point('chargeGrab', [-3.0, 3.6, -1.2]);
  // charging handle
  b.part('charge', { origin: [0, 7.0, 7.0] });
  b.box(0, 7.3, 7.6, 1.0, 0.5, 1.4, D, M.METAL);
  b.box(0, 7.3, 8.1, 3.4, 0.5, 0.8, D, M.METAL);
  // mag (curved STANAG)
  b.part('mag', { origin: [0, 0.0, -5.4] });
  b.push([0, 0.0, -5.4]);
  b.box(0, 0.4, 0, 2.3, 3.2, 5.9, 0x3a3b38, M.METAL);
  b.push([0, -1.2, 0], [0.09, 0, 0]);
  b.box(0, -2.0, 0, 2.3, 4.0, 5.9, 0x3a3b38, M.METAL);
  b.push([0, -4.0, 0], [0.09, 0, 0]);
  b.box(0, -2.0, 0, 2.3, 4.0, 5.9, 0x3a3b38, M.METAL);
  b.box(0, -4.3, 0.1, 2.7, 0.7, 6.3, 0x2d2e2b, M.METAL);
  b.point('magGrab', [0, -4.9, 0.3]);
  b.pop(); b.pop(); b.pop();
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.6, adsDist: 0.18,
      channels: {
        charge: [{ part: 'charge', t: [0, 0, 6.5] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      mag: { part: 'mag', axis: [0, -1, -0.08], grab: 'magGrab' },
      recoil: { pitch: 0.075, back: 0.035, yaw: 0.025, roll: 0.035, up: 0.005 },
      flash: 1.1, shell: 'big', ejectOnFire: true,
      reload: { style: 'rifle', charge: 'catch' },
    }),
  };
}

export function rifleAK() {
  const b = new ModelBuilder({ texel: 0.8 });
  const G = 0x35383d, W = C.akWood, D = 0x282a2e;
  // receiver + dust cover
  b.box(0, 4.9, -2.0, 3.0, 4.0, 22, G, M.METAL);
  b.box(0, 7.15, -1.0, 2.6, 0.7, 20, G, M.METAL);
  for (let i = 0; i < 6; i++) b.box(0, 7.52, 3 + i * 1.0, 2.0, 0.08, 0.3, D, M.METAL);
  b.box(1.52, 6.2, -4.0, 0.05, 1.3, 6.0, 0x0a0a0a, M.FLAT);
  b.box(1.55, 4.6, -1.0, 0.15, 1.2, 9.5, D, M.METAL); // safety lever
  b.box(1.55, 4.1, 3.6, 0.2, 1.8, 1.2, D, M.METAL);
  // rear sight block
  b.box(0, 7.7, -14.0, 2.0, 1.2, 4.0, G, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.55, 8.5, -13.4, 0.75, 0.4, 3.0, D, M.METAL);
  b.box(0, 8.25, -12.2, 0.4, 0.3, 0.4, D, M.METAL);
  // handguards
  b.tubeZ(0, 7.55, -27, 1.5, 20, G, M.METAL);
  b.box(0, 7.75, -23.5, 2.7, 2.1, 13, W, M.WOOD);
  b.box(0, 4.4, -23.5, 3.7, 3.7, 13, W, M.WOOD);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) b.box(s * 1.87, 4.0, -27 + i * 2.6, 0.05, 1.8, 1.2, C.woodDark, M.WOOD);
  b.box(0, 5.5, -16.6, 3.5, 4.8, 0.8, G, M.METAL);
  b.box(0, 5.6, -30.4, 3.2, 4.2, 0.8, G, M.METAL);
  // barrel, gas block, front sight, brake
  b.tubeZ(0, 5.6, -40, 1.5, 22, G, M.METAL);
  b.box(0, 6.8, -37.5, 1.8, 3.2, 2.0, G, M.METAL);
  b.box(0, 7.0, -46, 1.6, 2.2, 2.4, G, M.METAL);
  b.box(0, 8.4, -46, 0.3, 0.7, 0.3, D, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.75, 8.5, -46, 0.3, 1.6, 1.0, D, M.METAL);
  b.tubeZ(0, 5.6, -52.0, 1.9, 2.4, G, M.METAL);
  b.box(0, 6.3, -52.6, 1.95, 0.6, 1.0, D, M.METAL);
  b.box(0, 5.6, -53.23, 0.9, 0.9, 0.06, 0x050505, M.FLAT);
  b.point('muzzle', [0, 5.6, -53.6]);
  b.point('sight', [0, 8.7, -13.4]);
  b.point('eject', [1.7, 6.5, -4.0]);
  // stock
  b.box(0, 3.7, 12.2, 3.2, 4.2, 6.0, W, M.WOOD, { r: [-0.18, 0, 0] });
  b.box(0, 1.9, 24, 3.4, 7.4, 20, W, M.WOOD, { r: [-0.13, 0, 0] });
  b.box(0, 0.55, 34.0, 3.5, 8.2, 0.8, G, M.METAL, { r: [-0.13, 0, 0] });
  // grip + guard
  b.box(0, 2.6, -1.0, 1.0, 0.5, 6.0, G, M.METAL);
  b.box(0, 3.4, -3.8, 1.0, 1.6, 0.5, G, M.METAL);
  triggerPart(b, [0, 3.4, -1.6]);
  b.push([0, 2.6, 3.6], [-0.35, 0, 0]);
  b.box(0, -3.2, 0, 2.6, 6.8, 3.2, C.bakelite, M.POLY);
  b.point('handR', [0, -2.9, 0.2]);
  b.pop();
  b.point('handL', [0, 0.6, -23.5]);
  // charging handle / bolt carrier (right side)
  b.part('charge', { origin: [1.6, 6.0, 0] });
  b.point('chargeGrab', [3.9, 5.4, 2.2]);
  b.box(1.6, 6.15, -2.0, 0.2, 0.6, 7.5, C.steelDark, M.METAL);
  b.box(2.4, 6.15, 2.2, 1.5, 0.8, 0.8, C.steelDark, M.METAL);
  // curved mag
  b.part('mag', { origin: [0, 3.0, -7.6] });
  b.push([0, 3.0, -7.6]);
  const MC = C.bakelite;
  for (let i = 0; i < 5; i++) {
    b.box(0, -1.6, 0, 2.5, 3.5, 6.0 - i * 0.12, MC, M.POLY);
    b.box(0, -1.6, 2.95 - i * 0.06, 2.7, 3.3, 0.25, shadeLocal(MC), M.POLY);
    b.push([0, -3.3, 0], [0.13, 0, 0]);
  }
  b.box(0, -0.2, 0, 2.7, 0.6, 5.6, MC, M.POLY);
  b.point('magGrab', [0, -0.7, 0.2]);
  for (let i = 0; i < 6; i++) b.pop();
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.7, adsDist: 0.36,
      channels: {
        charge: [{ part: 'charge', t: [0, 0, 7.5] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      mag: { part: 'mag', axis: [0, -1, -0.1], grab: 'magGrab' },
      recoil: { pitch: 0.1, back: 0.042, yaw: 0.035, roll: 0.045, up: 0.007 },
      flash: 1.25, shell: 'big', ejectOnFire: true, fireAnim: 'carrier',
      reload: { style: 'rifle', charge: 'side' },
    }),
  };
}
function shadeLocal(hex) {
  const f = 0.8;
  return ((Math.round(((hex >> 16) & 255) * f)) << 16) | ((Math.round(((hex >> 8) & 255) * f)) << 8) | Math.round((hex & 255) * f);
}

export function rifle22() {
  const b = new ModelBuilder({ texel: 0.6 });
  const G = C.gun, W = C.birch;
  b.box(0, 5.3, -2.0, 2.5, 3.2, 12, G, M.METAL);
  b.box(0, 6.95, -2.0, 1.8, 0.3, 12, G, M.METAL);
  b.box(1.27, 5.6, -0.6, 0.05, 1.0, 2.6, 0x0a0a0a, M.FLAT);
  b.tubeZ(0, 5.4, -26, 1.55, 36, G, M.METAL);
  b.box(0, 5.4, -44.03, 0.5, 0.5, 0.06, 0x050505, M.FLAT);
  b.box(0, 6.85, -43.0, 0.35, 1.5, 0.6, G, M.METAL);
  b.box(0, 7.55, -43.0, 0.42, 0.42, 0.42, C.brass, M.BRASS);
  for (const s of [-1, 1]) b.box(s * 0.42, 7.3, -20, 0.42, 0.8, 0.5, G, M.METAL);
  b.box(0, 6.75, -20, 1.3, 0.4, 0.8, G, M.METAL);
  b.box(0, 6.4, -20, 0.8, 0.6, 0.8, G, M.METAL);
  b.point('muzzle', [0, 5.4, -44.3]);
  b.point('sight', [0, 7.72, -20]);
  b.point('eject', [1.4, 5.8, -0.6]);
  // stock
  b.box(0, 3.6, -18, 3.1, 3.0, 22, W, M.WOOD);
  b.box(0, 5.0, -25, 3.3, 3.5, 0.8, G, M.METAL);
  b.box(0, 3.2, -2.0, 3.1, 3.4, 12, W, M.WOOD);
  b.box(0, 2.7, 7.0, 2.9, 4.2, 7.0, W, M.WOOD, { r: [-0.2, 0, 0] });
  b.box(0, 1.6, 18.5, 3.2, 7.0, 17, W, M.WOOD, { r: [-0.1, 0, 0] });
  b.box(0, 1.0, 27.2, 3.3, 7.4, 0.9, C.rubber, M.RUBBER, { r: [-0.1, 0, 0] });
  b.box(0, 0.4, -1.0, 0.9, 0.45, 4.0, G, M.METAL);
  b.box(0, 1.2, -2.8, 0.9, 1.6, 0.45, G, M.METAL);
  triggerPart(b, [0, 1.6, -1.0]);
  b.point('handR', [0, 1.6, 7.2]);
  b.point('handL', [0, 0.8, -17]);
  b.part('bolt', { origin: [1.3, 4.8, 0] });
  b.point('chargeGrab', [3.4, 4.4, -1.2]);
  b.box(1.9, 4.8, -1.2, 1.3, 0.55, 0.55, C.steel, M.STEEL);
  b.box(2.6, 4.8, -1.2, 0.6, 0.8, 0.8, C.steel, M.STEEL);
  b.part('mag', { origin: [0, 2.6, -4.2] });
  b.box(0, 2.2, -4.2, 2.3, 2.6, 2.8, C.polyDark, M.POLY);
  b.box(0, 1.0, -4.2, 2.4, 0.4, 2.9, C.poly, M.POLY);
  b.point('magGrab', [0, 0.4, -4.2]);
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.35, adsDist: 0.44, scale: 1.1,
      channels: {
        charge: [{ part: 'bolt', t: [0, 0, 2.6] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      mag: { part: 'mag', axis: [0, -1, 0], grab: 'magGrab' },
      recoil: { pitch: 0.045, back: 0.02, yaw: 0.01, roll: 0.02, up: 0.003 },
      flash: 0.55, shell: 'brass', ejectOnFire: true, fireAnim: 'carrier',
      reload: { style: 'rifle', charge: 'side' },
    }),
  };
}

export function smg() {
  const b = new ModelBuilder({ texel: 0.6 });
  const G = 0x2e3033, P = C.poly;
  b.box(0, 6.1, -5.0, 2.8, 3.2, 22, G, M.METAL);
  for (let i = 0; i < 6; i++) b.box(0, 6.1, -12 + i * 2.6, 2.9, 2.0, 0.3, 0x1c1d20, M.METAL);
  b.tubeZ(0, 7.9, -20.0, 1.7, 14, G, M.METAL);
  b.box(1.42, 6.4, -6.0, 0.05, 1.2, 3.2, 0x0a0a0a, M.FLAT);
  // front sight hood
  b.box(0, 7.95, -27.0, 1.4, 0.9, 1.2, G, M.METAL);
  b.box(0, 9.95, -27.0, 2.4, 0.4, 1.0, G, M.METAL);
  for (const s of [-1, 1]) b.box(s * 1.0, 9.05, -27.0, 0.4, 2.2, 1.0, G, M.METAL);
  b.box(0, 8.6, -27.0, 0.3, 0.75, 0.3, G, M.METAL);
  // rear drum
  b.box(0, 7.9, 4.5, 1.6, 0.8, 1.6, G, M.METAL);
  // drum with a peep aperture (ring of boxes)
  b.box(0, 9.85, 4.5, 2.4, 0.5, 1.8, G, M.METAL);
  b.box(0, 8.25, 4.5, 2.4, 0.9, 1.8, G, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.85, 9.05, 4.5, 0.7, 1.1, 1.8, G, M.METAL);
  b.point('sight', [0, 9.0, 4.0]);
  // handguard
  b.box(0, 4.5, -20.0, 3.7, 3.6, 11.5, P, M.POLY);
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.box(s * 1.86, 4.3, -24 + i * 2.0, 0.05, 2.6, 0.6, C.polyDark, M.POLY);
  b.box(0, 2.6, -20.0, 3.2, 0.5, 10, P, M.POLY);
  // barrel
  b.tubeZ(0, 5.8, -29.0, 1.4, 6, G, M.METAL);
  b.tubeZ(0, 5.8, -31.3, 1.9, 1.4, G, M.METAL);
  b.box(0, 5.8, -32.03, 0.75, 0.75, 0.06, 0x050505, M.FLAT);
  b.point('muzzle', [0, 5.8, -32.3]);
  // lower
  b.box(0, 3.6, -1.5, 2.6, 2.2, 9, P, M.POLY);
  b.box(0, 3.4, -10.5, 2.7, 2.6, 3.6, G, M.METAL);
  b.box(0, 1.4, -1.6, 1.0, 0.5, 4.6, P, M.POLY);
  b.box(0, 2.2, -3.8, 1.0, 1.5, 0.5, P, M.POLY);
  b.box(-1.35, 3.9, 1.8, 0.2, 0.7, 0.7, C.white, M.PLAIN);
  triggerPart(b, [0, 2.5, -2.0]);
  b.push([0, 2.4, 1.4], [-0.25, 0, 0]);
  b.box(0, -3.2, 0, 2.6, 6.8, 3.3, P, M.POLY);
  for (let i = 0; i < 3; i++) b.box(0, -1.8 - i * 1.6, -1.7, 2.4, 0.7, 0.2, P, M.POLY);
  b.point('handR', [0, -2.9, 0.2]);
  b.pop();
  // fixed stock
  b.box(0, 5.4, 12.0, 2.8, 2.6, 12, P, M.POLY, { r: [-0.08, 0, 0] });
  b.box(0, 2.9, 13.4, 2.8, 2.2, 10.0, P, M.POLY, { r: [0.35, 0, 0] });
  b.box(0, 3.6, 18.6, 3.2, 7.6, 1.6, C.rubber, M.RUBBER);
  b.point('eject', [1.6, 6.6, -6.0]);
  b.point('handL', [0, 1.4, -19.5]);
  b.part('charge', { origin: [-0.9, 7.9, -21.5] });
  b.point('chargeGrab', [-3.4, 7.4, -22.4]);
  b.box(-1.5, 7.9, -21.8, 1.4, 0.6, 0.8, G, M.METAL);
  b.box(-2.3, 7.9, -22.4, 0.6, 0.8, 1.6, G, M.METAL);
  b.part('mag', { origin: [0, 2.0, -10.5] });
  b.push([0, 2.0, -10.5]);
  for (let i = 0; i < 4; i++) {
    b.box(0, -1.7, 0, 2.0, 3.6, 3.0, 0x2c2d2f, M.METAL);
    b.push([0, -3.4, 0], [0.16, 0, 0]);
  }
  b.box(0, -0.1, 0, 2.2, 0.5, 3.2, 0x1e1f21, M.METAL);
  b.point('magGrab', [0, -0.5, 0.0]);
  for (let i = 0; i < 5; i++) b.pop();
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.45, adsDist: 0.17,
      hip: { pos: [0.105, -0.13, -0.26], rot: [0.02, 0.05, 0.0] },
      channels: {
        charge: [{ part: 'charge', t: [0, 0, 6.0] }],
        trigger: [{ part: 'trigger', r: [0.3, 0, 0] }],
      },
      mag: { part: 'mag', axis: [0, -1, -0.15], grab: 'magGrab' },
      recoil: { pitch: 0.05, back: 0.026, yaw: 0.02, roll: 0.03, up: 0.004 },
      flash: 0.85, shell: 'brass', ejectOnFire: true,
      reload: { style: 'rifle', charge: 'front' },
    }),
  };
}

// ----------------------------------------------------------------------------------- bows
export function crossbow() {
  const b = new ModelBuilder({ texel: 0.8 });
  const P = 0x2a2c2a, W = C.wood;
  b.box(0, 5.0, -20, 2.2, 1.4, 40, P, M.POLY);
  b.box(0, 5.75, -20, 0.9, 0.12, 40, C.steelDark, M.METAL);
  b.box(0, 3.4, -12, 3.0, 2.4, 26, P, M.POLY);
  b.box(0, 3.6, 4.0, 3.2, 4.0, 10, P, M.POLY);
  b.box(0, 3.2, 14.0, 3.0, 3.0, 10, P, M.POLY);
  b.box(0, 2.6, 20.5, 3.4, 7.4, 5, P, M.POLY, { r: [-0.1, 0, 0] });
  b.box(0, 2.6, 23.2, 3.6, 7.8, 1.0, C.rubber, M.RUBBER, { r: [-0.1, 0, 0] });
  b.box(0, 1.8, -20, 2.6, 2.2, 9.0, W, M.WOOD); // foregrip
  b.box(0, 6.0, -8.0, 1.6, 0.8, 2.0, C.gunDark, M.METAL); // latch
  b.box(0, 1.2, -1.0, 1.0, 0.5, 5.0, P, M.POLY);
  triggerPart(b, [0, 2.0, -1.0]);
  b.push([0, 1.8, 3.6], [-0.3, 0, 0]);
  b.box(0, -3.0, 0, 2.6, 6.6, 3.2, P, M.POLY);
  b.point('handR', [0, -2.8, 0.2]);
  b.pop();
  // riser + stirrup + limbs
  b.box(0, 4.7, -40, 4.0, 2.4, 3.0, P, M.POLY);
  b.box(0, 2.3, -42.5, 5.0, 0.6, 0.8, C.steelDark, M.METAL);
  for (const s of [-1, 1]) b.box(s * 2.4, 3.6, -42.0, 0.6, 2.8, 0.8, C.steelDark, M.METAL);
  for (const s of [-1, 1]) {
    b.part(s < 0 ? 'limbL' : 'limbR', { origin: [s * 2, 4.8, -40] });
    b.box(s * 10.5, 4.8, -38.8, 17, 1.0, 1.7, 0x3a3d38, M.POLY, { r: [0, s * 0.17, 0] });
    b.box(s * 19.0, 4.8, -36.0, 1.2, 1.6, 1.6, C.gunDark, M.METAL);
    b.point(s < 0 ? 'tipL' : 'tipR', [s * 19.0, 5.6, -36.0]);
  }
  b.part('body');
  // red dot
  b.box(0, 6.6, -4.0, 1.4, 1.0, 3.0, C.gunDark, M.METAL);
  b.box(0, 7.9, -4.6, 2.2, 0.35, 2.0, C.gunDark, M.METAL);
  for (const s of [-1, 1]) b.box(s * 0.95, 7.4, -4.6, 0.3, 1.4, 2.0, C.gunDark, M.METAL);
  b.box(0, 7.45, -5.4, 0.22, 0.22, 0.04, C.emitRed, M.EMIT);
  b.point('sight', [0, 7.45, 0.5]);
  b.point('handL', [0, -0.6, -20]);
  b.point('nock', [0, 5.6, -8.5]);
  b.point('muzzle', [0, 6.0, -40]);
  b.point('stringGrab', [0, 3.8, -30]);
  // string (two segments, posed at runtime)
  for (const n of ['stringL', 'stringR']) {
    b.part(n, { origin: [0, 0, 0] });
    b.box(0.5, 0, 0, 1.0, 0.22, 0.22, 0xd8d4c8, M.PLAIN, { texel: 0.3 });
    b.part('body');
  }
  // bolt
  b.part('arrow', { origin: [0, 6.0, -8.5] });
  b.point('arrowGrab', [0, 6.0, -20]);
  b.box(0, 6.0, -22.5, 0.5, 0.5, 28, 0x2b2b2b, M.POLY);
  b.box(0, 6.0, -37.4, 0.8, 0.8, 2.2, C.steel, M.STEEL);
  b.box(0, 6.0, -38.8, 0.4, 0.4, 0.8, C.steel, M.STEEL);
  b.box(0, 6.6, -10.5, 0.1, 0.9, 3.0, C.emitOrange, M.PLAIN);
  for (const s of [-1, 1]) b.box(s * 0.55, 6.0, -10.5, 0.9, 0.1, 3.0, C.emitOrange, M.PLAIN);
  b.part('body');
  return {
    b,
    meta: longGunMeta({
      weight: 0.7, adsDist: 0.2,
      channels: { trigger: [{ part: 'trigger', r: [0.3, 0, 0] }] },
      recoil: { pitch: 0.05, back: 0.03, yaw: 0.01, roll: 0.02, up: 0.004 },
      flash: 0, shell: null, ejectOnFire: false, fireAnim: 'crossbow',
      reload: { style: 'crossbow' },
      string: { parts: ['stringL', 'stringR'], tips: ['tipL', 'tipR'], nock: 'nock', restZ: -35.2 },
      ammoProp: 'arrow',
    }),
  };
}

export function bow() {
  const b = new ModelBuilder({ texel: 0.8 });
  const W = 0x5a3a22, L = 0x3a2a1e;
  // riser (origin = left hand grip)
  b.box(0, 0, 0, 2.2, 10, 3.2, 0x2c2c2c, M.RUBBER);
  b.box(0, 9.0, -0.6, 2.0, 9.0, 3.0, W, M.WOOD);
  b.box(0, -9.0, -0.6, 2.0, 9.0, 3.0, W, M.WOOD);
  b.box(-1.25, 5.6, -0.8, 0.6, 0.6, 1.8, C.gunDark, M.METAL); // arrow rest
  b.box(0, 5.2, -1.2, 2.4, 0.8, 3.6, W, M.WOOD);
  b.point('handL', [0, 0, 0.4]);
  for (const s of [1, -1]) {
    const n = s > 0 ? 'limbU' : 'limbD';
    b.part(n, { origin: [0, s * 13.5, -0.6] });
    b.push([0, s * 13.5, -0.6], [s * 0.2, 0, 0]);
    b.box(0, s * 10, 0, 0.9, 20, 2.6, L, M.WOOD);
    b.push([0, s * 20, 0], [-s * 0.55, 0, 0]);
    b.box(0, s * 2.4, 0, 0.8, 5.0, 2.0, L, M.WOOD);
    b.point(s > 0 ? 'tipU' : 'tipD', [0, s * 4.6, 0.6]);
    b.pop(); b.pop();
  }
  b.part('body');
  b.point('nock', [-1.25, 6.2, 5.5]);
  b.point('muzzle', [-1.25, 6.2, -2]);
  b.point('sight', [-1.25, 8.0, 40]);
  for (const n of ['stringL', 'stringR']) {
    b.part(n, { origin: [0, 0, 0] });
    b.box(0.5, 0, 0, 1.0, 0.25, 0.25, 0xe0dccc, M.PLAIN, { texel: 0.3 });
    b.part('body');
  }
  b.part('arrow', { origin: [-1.25, 6.2, 5.5] });
  b.box(-1.25, 6.2, -27.5, 0.45, 0.45, 66, 0x6b4a2a, M.WOOD);
  b.box(-1.25, 6.2, -61.2, 0.8, 0.8, 2.0, C.steelDark, M.STEEL);
  b.box(-1.25, 6.2, -62.6, 0.45, 0.45, 1.0, C.steelDark, M.STEEL);
  b.box(-1.25, 6.9, 2.2, 0.1, 1.0, 4.0, 0xb02a20, M.PLAIN);
  for (const s of [-1, 1]) b.box(-1.25 + s * 0.6, 6.2, 2.2, 1.0, 0.1, 4.0, 0xe8e0d0, M.PLAIN);
  b.box(-1.25, 6.2, 5.4, 0.6, 0.6, 0.6, 0xb02a20, M.POLY);
  b.point('arrowGrab', [-1.25, 6.2, 5.0]);
  b.part('body');
  return {
    b,
    meta: {
      kind: 'gun', hold: 'bow', weight: 0.3, scale: 0.8,
      hip: { pos: [-0.06, -0.15, -0.44], rot: [0.05, -0.08, 0.95] },
      sprint: { pos: [-0.1, -0.26, -0.38], rot: [-0.6, -0.2, 1.2] },
      ads: { pos: [0.076, -0.088, -0.5], rot: [0.0, 0.0, 0.35] }, adsNear: 0.01,
      adsDist: 0.5,
      hands: { R: 'nock', L: 'handL', anchorRtoNock: true },
      channels: {},
      recoil: { pitch: 0.04, back: -0.02, yaw: 0.01, roll: 0.02, up: 0.004 },
      flash: 0, shell: null, ejectOnFire: false, fireAnim: 'bow',
      reload: { style: 'bow' },
      string: { parts: ['stringL', 'stringR'], tips: ['tipU', 'tipD'], nock: 'nock', restZ: 2.4, drawZ: 32, bow: true },
      ammoProp: 'arrow',
    },
  };
}
