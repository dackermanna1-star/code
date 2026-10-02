// Level 23: The Endless Elevator. You are in the car of a hotel lift that has no buttons. Every
// so often it hums, chimes, and the doors open on some floor of an endless hotel: a lobby with
// no end, a lattice of corridors, a ballroom laid for a dinner. Stay inside and the doors close and it takes you
// somewhere else. Sometimes it stops at a floor that looks like a childhood home, hums, and
// does not open.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M, CF, ceilingLight } from './kit.js';
import { hookFlicker } from './g05_kit.js';

const N = 23;
const ZS = 64;
const TRANSIT_Z = -128;                 // the row of zones that hold only the sealed car
const CX = 32.5;                        // the car's centre line inside a zone
const SEAM_CH = 11;

// ------------------------------------------------------------------ textures
defineTexture('lv23_panel', (p) => {
  p.fill([92, 56, 34]);
  p.noise(3, 0.12, 3);
  for (let x = 0; x < 64; x += 3) p.rect(x, 0, 1, 64, [70, 42, 26], 0.25);
  p.rect(6, 6, 52, 52, [104, 64, 38], 0.5);
  p.frame(6, 6, 52, 52, [200, 160, 74]);
  p.frame(8, 8, 48, 48, [150, 112, 52], 0.7);
  p.grain(0.04);
}, 12);
defineTexture('lv23_door', (p) => {
  p.fill([176, 140, 74]);
  for (let y = 0; y < 64; y += 2) p.rect(0, y, 64, 1, [160, 126, 64], 0.6);
  p.noise(4, 0.05, 2);
  p.rect(63, 0, 1, 64, [60, 44, 24]); p.rect(62, 0, 1, 64, [214, 184, 110]);
  p.rect(0, 0, 64, 1, [120, 90, 44]); p.rect(0, 63, 64, 1, [120, 90, 44]);
  p.grain(0.03);
}, 10);
defineTexture('lv23_plate', (p) => {
  p.clearAlpha(0);
  p.rect(10, 6, 44, 52, [190, 154, 82]); p.rectA(10, 6, 44, 52, 255);
  p.frame(10, 6, 44, 52, [120, 92, 44]);
  for (const [x, y] of [[14, 10], [49, 10], [14, 52], [49, 52]]) { p.rect(x, y, 2, 2, [90, 70, 36]); }
  p.rect(30, 30, 4, 6, [60, 44, 24]);
  p.rect(0, 0, 0, 0, [0, 0, 0]);
}, 6);
defineTexture('lv23_indicator', (p) => {
  p.fill([22, 16, 10]);
  for (const x of [8, 26, 44]) p.rect(x, 26, 12, 6, [255, 176, 48]);
  p.frame(0, 0, 64, 64, [120, 96, 50]);
}, 6);
defineTexture('lv23_light', (p) => {
  p.fill([255, 238, 200]);
  for (let k = 0; k < 64; k += 16) { p.rect(k, 0, 1, 64, [232, 212, 168], 0.7); p.rect(0, k, 64, 1, [232, 212, 168], 0.7); }
}, 6);

defineMaterial('lv23_panel', 'lv23_panel', { su: 1.4, sv: 1.4, surf: 'wood' });
defineMaterial('lv23_door', 'lv23_door', { s: 1, surf: 'metal' });
defineMaterial('lv23_light', 'lv23_light', { s: 1, flags: VF.FULLBRIGHT, glow: 1.0 });
defineMaterial('lv23_seam', 'lv23_light', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1, chan: SEAM_CH });

// ------------------------------------------------------------------ the car
// Local frame of a zone: the car's back wall plane is z = 2.64, its door plane z = 4.5..4.62,
// interior x in [CX-1.2, CX+1.2]. The player stands at (CX, 3.5) facing +z.
function elevator(zb, open, arrival, ceilH) {
  const { x0, z0 } = zb;
  const X = x0 + CX, Z = z0;
  const H = 2.55;
  const wall = M.lv23_panel;
  cbox(zb, X - 1.5, 0, Z + 2, X - 1.2, H, Z + 4.62, wall);
  cbox(zb, X + 1.2, 0, Z + 2, X + 1.5, H, Z + 4.62, wall);
  cbox(zb, X - 1.5, 0, Z + 2, X + 1.5, H, Z + 2.64, wall);
  cbox(zb, X - 1.5, 2.4, Z + 2, X + 1.5, H, Z + 4.62, wall);
  // the front: pockets either side of the opening, a header above it
  cbox(zb, X - 1.5, 0, Z + 4.5, X - 0.6, 2.15, Z + 4.62, wall);
  cbox(zb, X + 0.6, 0, Z + 4.5, X + 1.5, 2.15, Z + 4.62, wall);
  cbox(zb, X - 1.5, 2.15, Z + 4.5, X + 1.5, H, Z + 4.62, wall);
  if (!open) {
    const L = [M.lv23_door, M.lv23_door, M.lv23_door, M.lv23_door, M.lv23_door, M.lv23_door];
    cbox(zb, X - 0.6, 0, Z + 4.5, X - 0.005, 2.15, Z + 4.62, L, { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    cbox(zb, X + 0.005, 0, Z + 4.5, X + 0.6, 2.15, Z + 4.62, L, { uv: ['world', 'world', 'world', 'world', 'world', [1, 0, 0, 1]] });
    cbox(zb, X - 0.012, 0.04, Z + 4.49, X + 0.012, 2.1, Z + 4.5, M.lv23_seam, { collide: false });
  }
  // light, handrails, mirror, a blank plate where the buttons should be, the floor display
  cbox(zb, X - 0.7, 2.36, Z + 3.0, X + 0.7, 2.4, Z + 4.1, M.lv23_light, { collide: false });
  zb.light(X, 2.0, Z + 3.5, { color: [1.0, 0.86, 0.6], rad: 4.2, int: 0.95 });
  for (const sx of [-1, 1]) cbox(zb, X + sx * 1.14 - 0.02, 0.88, Z + 2.9, X + sx * 1.14 + 0.02, 0.92, Z + 4.2, M.chrome, { collide: false });
  zb.decal(X - 1.2, 1.35, Z + 3.4, 'px', 1.2, 1.3, 'mirror');
  zb.decal(X + 1.2, 1.1, Z + 3.9, 'nx', 0.3, 0.38, 'lv23_plate');
  zb.decal(X, 2.28, Z + 4.5, 'nz', 0.5, 0.12, 'lv23_indicator', { lit: false, glow: 1.0 });
  // the back of the car has a plain door in it, in every car
  if (!arrival) zb.prop('door', X, 0, Z + 2.67, Math.PI, { tex: 'door_gray' });
  zb.emitter(X, 2.2, Z + 3.4, 'g05_car_hum', { vol: open ? 0.35 : 0.9, rad: open ? 7 : 12 });
  zb.emitter(X, 2.3, Z + 3.6, 'g05_muzak', { vol: open ? 0.3 : 0.55, rad: open ? 8 : 12 });
  // cells of the car
  for (let z = 2; z <= 4; z++) for (let x = Math.floor(CX - 1.5); x <= Math.floor(CX + 1.5 - 0.01); x++) {
    const ax = x0 + x, az = z0 + z;
    if (!zb.in(ax, az)) continue;
    const i = zb.i(ax, az);
    zb.flags[i] = 0;
    zb.floor[i] = 0;
    zb.ceil[i] = z === 4 ? ceilH : NaN;
    zb.fmat[i] = M.carpet_red;
    zb.cmat[i] = M.lv23_panel;
    zb.solid[i] = 0;
  }
}

// ------------------------------------------------------------------ floors
const variantOf = (zx, zz) => (zx === 0 && zz === 0 ? 0 : Math.floor(hr(zx, zz, 2301) * 3));

function base(zb, H, fmat, cmat, wmat) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.floor.fill(0); zb.ceil.fill(H); zb.flags.fill(0);
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    zb.fmat[i] = fmat; zb.cmat[i] = cmat; zb.wmat[i] = wmat;
    if (x === x0 || x === x1 - 1 || z === z1 - 1) zb.solid[i] = wmat;
    else if (z < z0 + 4) { zb.flags[i] = CF.VOID; zb.floor[i] = NaN; zb.ceil[i] = NaN; }
  });
  // the room's north wall sits at z0 + 4.62, with the lift's front in it
  cbox(zb, x0 + 1, 0, z0 + 4, x0 + CX - 1.5, H, z0 + 4.62, wmat);
  cbox(zb, x0 + CX + 1.5, 0, z0 + 4, x1 - 1, H, z0 + 4.62, wmat);
}

function lobby(zb, zx, zz) {
  const { x0, z0, x1, z1 } = zb, H = 6;
  base(zb, H, M.marble, M.plaster, M.wood_panel);
  elevator(zb, true, zx === 0 && zz === 0, H);
  // a long red carpet from the lift to the far wall
  zb.fill(x0 + 30, z0 + 5, x0 + 35, z1 - 1, (x, z, i) => { zb.fmat[i] = M.carpet_red; });
  // columns either side of it, and along the walls
  for (const lx of [13, 26, 39, 52]) for (const lz of [14, 26, 38, 50]) {
    cbox(zb, x0 + lx - 0.6, 0, z0 + lz - 0.6, x0 + lx + 0.6, H, z0 + lz + 0.6, M.marble, { sub: 3 });
    cbox(zb, x0 + lx - 0.8, 0, z0 + lz - 0.8, x0 + lx + 0.8, 0.4, z0 + lz + 0.8, M.marble, { sub: 3 });
  }
  // chandeliers: a glowing core, a ring of bulbs
  const chand = (cx, cz) => {
    if (!owns(zb, cx, cz)) return;
    zb.box(cx - 0.02, 4.9, cz - 0.02, cx + 0.02, 6, cz + 0.02, M.metal_dark, { collide: false });
    zb.box(cx - 0.3, 4.3, cz - 0.3, cx + 0.3, 4.9, cz + 0.3, M.glow_bulb, { collide: false });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      zb.box(cx + Math.cos(a) * 0.9 - 0.1, 4.5, cz + Math.sin(a) * 0.9 - 0.1, cx + Math.cos(a) * 0.9 + 0.1, 4.8, cz + Math.sin(a) * 0.9 + 0.1, M.glow_bulb, { collide: false });
    }
    zb.light(cx, 4.0, cz, { color: [1.0, 0.8, 0.5], rad: 10, int: 0.95 });
  };
  for (const lz of [10, 22, 34, 46, 58]) chand(x0 + CX, z0 + lz);
  for (const lx of [19.5, 45.5]) for (const lz of [20, 44]) chand(x0 + lx, z0 + lz);
  // seating groups in the corners of the hall
  for (const [lx, lz, rot] of [[8, 20, -Math.PI / 2], [57, 20, Math.PI / 2], [8, 46, -Math.PI / 2], [57, 46, Math.PI / 2]]) {
    zb.prop('sofa', x0 + lx, 0, z0 + lz, rot, {});
    zb.prop('armchair', x0 + lx, 0, z0 + lz + 3, rot - 0.4, {});
    zb.prop('coffee_table', x0 + lx + (rot > 0 ? -1.6 : 1.6), 0, z0 + lz + 1.4, 0, {});
    zb.prop('plant', x0 + lx, 0, z0 + lz - 2.4, 0, {});
    zb.prop('lamp_floor', x0 + lx, 0, z0 + lz + 5.2, 0, {});
  }
  zb.prop('reception_desk', x0 + CX, 0, z0 + 54, Math.PI, {});
  // the way out: a door at the end of the carpet and one in the east wall
  if (zb.in(x0 + 32, z1 - 2)) levelDoor(zb, x0 + CX, z1 - 1 - 0.13, 0, {});
  if (zb.in(x1 - 2, z0 + 30)) levelDoor(zb, x1 - 1 - 0.13, z0 + 30.5, -Math.PI / 2, {});
}

function corridors(zb, zx, zz) {
  const { x0, z0, x1, z1 } = zb, H = 2.7;
  base(zb, H, M.carpet_hotel, M.ceil_tile_white, M.wp_damask);
  elevator(zb, true, false, H);
  const corridorX = (lx) => { const m = ((lx % 12) + 12) % 12; return m >= 4 && m < 7; };
  const corridorZ = (lz) => { const m = (((lz - 5) % 12) + 12) % 12; return m < 3; };
  zb.fill(x0, z0, x1, z1, (x, z, i) => {
    const lx = x - x0, lz = z - z0;
    if (zb.solid[i] || lz < 4 || (lz === 4 && lx >= 31 && lx <= 33)) return;
    if (lz === 4) { zb.solid[i] = M.wp_damask; return; }
    if (!(corridorX(lx) || corridorZ(lz))) zb.solid[i] = M.wp_damask;
  });
  // lights, doors with numbers, a level door or two
  let levelDoors = 0;
  for (let m = 0; m < 5; m++) for (let k = 0; k < 5; k++) {
    const bx = x0 + 12 * k + 11.5, nz = z0 + 12 * m + 8, sz = z0 + 12 * m + 17;
    if (!zb.in(Math.floor(bx), Math.floor(nz)) || bx > x1 - 3) continue;
    for (const [fz, rot, face] of [[nz, 0, 'nz'], [sz, Math.PI, 'pz']]) {
      if (fz >= z1 - 2) continue;
      const isLevel = (hr(zx * 5 + k, zz * 5 + m, 2310 + (rot ? 1 : 0)) < 0.05 || (m === 1 && k === 3 && !rot)) && levelDoors < 3;
      if (isLevel) { levelDoor(zb, bx, fz + (rot ? 0.13 : -0.13), rot, {}); levelDoors++; }
      else {
        zb.prop('door', bx, 0, fz + (rot ? 0.03 : -0.03), rot, { tex: hr(k, m, 2311 + zx) < 0.5 ? 'door_wood' : 'door_gray' });
        if (hr(k * 7, m * 3, 2312 + zz) < 0.6) {
          const num = String(100 + Math.floor(hr(k + zx * 5, m + zz * 5, 2313 + (rot ? 1 : 0)) * 899));
          zb.decal(bx - 0.3, 2.3, fz + (rot ? 0.012 : -0.012), face, 0.22, 0.14, 'digit_' + num[0], { lit: true });
          zb.decal(bx, 2.3, fz + (rot ? 0.012 : -0.012), face, 0.22, 0.14, 'digit_' + num[1], { lit: true });
          zb.decal(bx + 0.3, 2.3, fz + (rot ? 0.012 : -0.012), face, 0.22, 0.14, 'digit_' + num[2], { lit: true });
        }
      }
    }
  }
  if (!levelDoors && zb.in(x0 + 5, z0 + 14)) levelDoor(zb, x0 + 7 - 0.13, z0 + 12.5, -Math.PI / 2, {});
  for (let lz = 6; lz < 62; lz += 6) for (let lx = 3; lx < 62; lx += 6) {
    const cx = x0 + lx + 0.5, cz = z0 + lz + 0.5;
    const on = zb.in(Math.floor(cx), Math.floor(cz)) && (corridorX(lx) || corridorZ(lz)) && !zb.isSolid(Math.floor(cx), Math.floor(cz));
    if (!on) continue;
    const u = hr(cx, cz, 2320);
    ceilingLight(zb, cx, cz, 'bulb', u < 0.06 ? 'off' : u < 0.12 ? 'flicker' : 'on', { rad: 5.2, int: 0.7, color: [1.0, 0.8, 0.52] });
  }
}

function ballroom(zb, zx, zz) {
  const { x0, z0, x1, z1 } = zb, H = 5.2;
  base(zb, H, M.wood_floor, M.plaster, M.curtain);
  elevator(zb, true, false, H);
  // a parquet floor with a stage at the far end and tables laid for a dinner nobody is at
  zb.fill(x0 + 1, z1 - 9, x1 - 1, z1 - 1, (x, z, i) => { zb.floor[i] = 0.9; zb.fmat[i] = M.wood_dark; });
  for (let lx = 11; lx < 60; lx += 9) for (let lz = 17; lz < 50; lz += 9) {
    if (lx > 28 && lx < 37) continue;
    const tx = x0 + lx + (hr(lx, lz + zx * 9, 2340) - 0.5) * 1.2, tz = z0 + lz + (hr(lz, lx + zz * 9, 2341) - 0.5) * 1.2;
    zb.prop('table_round', tx, 0, tz, 0, { r: 0.95 });
    for (let k = 0; k < 4; k++) {
      if (hr(lx + k, lz, 2342 + zx) < 0.15) continue;
      const a = (k / 4) * Math.PI * 2 + hr(lx, lz, 2343) * 0.4;
      zb.prop('chair_folding', tx + Math.sin(a) * 1.3, 0, tz - Math.cos(a) * 1.3, a + Math.PI, { seat: 'velvet_red' });
    }
  }
  for (const lz of [12, 24, 36, 48]) for (const lx of [16, 32.5, 49]) {
    const cx = x0 + lx, cz = z0 + lz;
    if (!owns(zb, cx, cz)) continue;
    zb.box(cx - 0.02, 3.9, cz - 0.02, cx + 0.02, 5.2, cz + 0.02, M.metal_dark, { collide: false });
    zb.box(cx - 0.35, 3.4, cz - 0.35, cx + 0.35, 3.9, cz + 0.35, M.glow_bulb, { collide: false });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; zb.box(cx + Math.cos(a) * 0.8 - 0.1, 3.6, cz + Math.sin(a) * 0.8 - 0.1, cx + Math.cos(a) * 0.8 + 0.1, 3.9, cz + Math.sin(a) * 0.8 + 0.1, M.glow_bulb, { collide: false }); }
    zb.light(cx, 3.1, cz, { color: [1.0, 0.76, 0.46], rad: 9, int: 0.9 });
  }
  cbox(zb, x0 + 6, 0.9, z1 - 9, x1 - 6, 5.0, z1 - 8.7, M.velvet_red, { collide: false });
  if (zb.in(x0 + 32, z1 - 2)) levelDoor(zb, x0 + CX, z1 - 1 - 0.13, 0, {});
  if (zb.in(x0 + 2, z0 + 30)) levelDoor(zb, x0 + 1 + 0.13, z0 + 30.5, Math.PI / 2, {});
}

function transit(zb) {
  const { x0, z0, x1, z1 } = zb;
  zb.noConnectivity = true;
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(CF.VOID);
  elevator(zb, false, false, 2.6);
  void x1; void z1; void z0; void x0;
}

defineZone('lv23_floor', {
  ...LEVEL_ZONE,
  doors: true,
  params: (zone) => {
    const v = variantOf(Math.floor(zone.x0 / ZS), Math.floor(zone.z0 / ZS));
    return {
      ambient: v === 0 ? [0.3, 0.24, 0.18] : v === 1 ? [0.15, 0.12, 0.09] : [0.34, 0.24, 0.18],
      env: v === 0 ? env({ fog: [0.11, 0.085, 0.06], fogNear: 4, fogFar: 60, hum: 0.05, hvac: 0.2, reverb: 'hall', tone: 'hotel' })
        : v === 1 ? env({ fog: [0.07, 0.05, 0.04], fogNear: 2, fogFar: 26, hum: 0.1, hvac: 0.3, reverb: 'corridor', tone: 'hotel' })
          : env({ fog: [0.12, 0.07, 0.05], fogNear: 4, fogFar: 50, hum: 0.05, hvac: 0.2, reverb: 'hall', tone: 'hotel' }),
    };
  },
  gen(zb) {
    const zx = Math.floor(zb.x0 / ZS), zz = Math.floor(zb.z0 / ZS);
    const v = variantOf(zx, zz);
    if (v === 0) lobby(zb, zx, zz); else if (v === 1) corridors(zb, zx, zz); else ballroom(zb, zx, zz);
  },
});
defineZone('lv23_transit', {
  ...LEVEL_ZONE,
  doors: false,
  params: () => ({
    ambient: [0.42, 0.3, 0.2],
    env: env({ fog: [0.05, 0.035, 0.025], fogNear: 1, fogFar: 9, hum: 0, hvac: 0.1, reverb: 'tiny', tone: 'hotel' }),
  }),
  gen: transit,
});

// ------------------------------------------------------------------ the ride
// Inside a car for a few seconds and the doors close; a sealed car hums for a while, chimes, and
// opens on another floor. Sometimes the floor it stops at is a home, and then it does not open.
function inCar(p) {
  const zx = Math.floor(p.x / ZS), zz = Math.floor(p.z / ZS);
  const lx = p.x - zx * ZS, lz = p.z - zz * ZS;
  return Math.abs(lx - CX) < 1.1 && lz > 2.7 && lz < 4.45 && p.y < 0.6 && p.y > -0.5;
}

function ride(ctx, dt) {
  const s = ctx.state, g = ctx.game, p = ctx.player, L = ctx.level;
  if (s.phase === undefined) { s.phase = 'floor'; s.inT = -2; s.first = true; s.seam = 0; }
  const fade = (to, rate) => { g.ui.fadeTarget = to; g.ui.fadeRate = rate; };
  const tp = (x, z) => { g.spawnAt(L.dim, x, 0, z, Math.PI); g.player.pitch = g.player.tpitch = 0; };
  s.t = (s.t || 0) + dt;
  switch (s.phase) {
    case 'floor': {
      if (inCar(p)) s.inT += dt; else s.inT = Math.min(0, s.inT);
      if (s.inT > (s.first ? 16 : 6)) {
        s.first = false; s.phase = 'closing'; s.t = 0;
        g.audioCall('play', 'g05_door_slide', undefined, undefined, undefined, { vol: 0.9 });
      }
      break;
    }
    case 'closing':
      if (s.t > 1.5) { fade(1, 2.4); }
      if (s.t > 2.6) {
        const zx = Math.floor(Math.random() * 13) - 6;
        tp(zx * ZS + CX, TRANSIT_Z + 3.5);
        s.phase = 'loading'; s.next = 'transit';
      }
      break;
    case 'loading':
      if (!g.pendingSpawn) {
        fade(0, 1.2);
        s.t = 0;
        if (s.next === 'transit') { s.phase = 'transit'; s.total = 14 + Math.random() * 16; s.home = Math.random() < 0.3; s.homeDone = false; s.seam = 0; }
        else { s.phase = 'floor'; s.inT = -3; g.audioCall('play', 'g05_door_slide', undefined, undefined, undefined, { vol: 0.9 }); }
      }
      break;
    case 'transit':
      if (s.home && !s.homeDone && s.t > s.total * 0.5) {
        s.homeDone = true; s.seam = 1; s.homeT = 0;
        g.audioCall('play', 'g05_ding', undefined, undefined, undefined, { vol: 0.7 });
        s.dingNext = 1;
        g.audioCall('play', 'g05_home', undefined, undefined, undefined, { vol: 0.55 });
        s.total += 10;
      }
      if (s.seam) { s.homeT += dt; if (s.homeT > 9) s.seam = 0; }
      if (!s.ding && s.t > s.total - 1.8) { s.ding = true; g.audioCall('play', 'g05_ding', undefined, undefined, undefined, { vol: 0.9 }); }
      if (s.t > s.total) {
        fade(1, 2.6);
        if (s.t > s.total + 1.2) {
          const zx = Math.floor(Math.random() * 13) - 6, zz = Math.floor(Math.random() * 12);
          tp(zx * ZS + CX, zz * ZS + 3.5);
          s.phase = 'loading'; s.next = 'floor'; s.ding = false;
        }
      }
      break;
    default: break;
  }
}

defineLevel(N, {
  name: 'THE ENDLESS ELEVATOR',
  zoneType: (c) => (c.z0 === TRANSIT_Z ? 'lv23_transit' : 'lv23_floor'),
  zoneSize: ZS,
  bands: [0],
  entry: { x: CX, y: 0, z: 3.5, yaw: Math.PI, pitch: 0 },
  doorDensity: 0.3,
  viewRadius: 3,
  sky: null,
  light: { phoneRadius: 3.4, phoneIntensity: 0.18 },
  script(ctx, dt) {
    ride(ctx, dt);
    hookFlicker(ctx.game, N, (v) => { v[SEAM_CH] = ctx.state.seam ? 0.9 + 0.1 * Math.sin(ctx.game.time * 7) : 0; });
  },
});
