// Level 72: The Empty Hospital Wing. A modern, pale-blue, brightly lit and perfectly clean wing:
// straight corridors with a navy stripe, and on both sides hundreds of identical patient rooms,
// every door locked, every door with a small window onto the same empty room. The intercom
// chimes now and then. Nothing answers.
// Layout (absolute coordinates): east-west corridors 3 m wide every 13 m (rooms 5 m deep on both
// sides), a north-south corridor every 63 m, rooms 4 m wide (15 per block).
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, levelDoor, ceilingLight } from './kit.js';
import { pmod, voidCells, floorSlab, ceilSlab } from './g08_kit.js';

const N = 72;
const CH = 2.38;           // under 2.4 m a wall is one row of polygons
const PZ = 13, PX = 63;

// ------------------------------------------------------------------ textures & materials
defineTexture('lv72_wall_c', (p) => {
  // corridor wall: white above, a handrail at 0.95 m, pale blue wainscot (bottom of the image = floor)
  p.fill([232, 238, 240]);
  p.noise(3, 0.02, 2);
  p.rect(0, 40, 64, 3, [206, 214, 218]);                          // rail
  p.rect(0, 40, 64, 1, [248, 250, 250]);
  p.rect(0, 43, 64, 21, [176, 206, 226]);
  p.rect(0, 43, 64, 1, [140, 176, 204]);
  p.rect(0, 59, 64, 5, [120, 154, 182]);                          // kick plate
  p.speckle(40, [196, 206, 212], 0.2, 0.4);
}, 8);
defineTexture('lv72_wall_r', (p) => {
  p.fill([238, 242, 242]);
  p.noise(3, 0.02, 2);
  p.rect(0, 48, 64, 16, [200, 218, 230]);
  p.rect(0, 48, 64, 1, [170, 194, 212]);
  p.rect(0, 60, 64, 4, [150, 176, 196]);
  p.speckle(30, [210, 216, 220], 0.2, 0.4);
}, 8);
defineTexture('lv72_floor', (p) => {
  p.fill([172, 196, 212]);
  p.grain(0.025);
  p.noise(4, 0.03, 2);
  p.speckle(120, [196, 214, 226], 0.3, 0.6);
  p.speckle(60, [146, 172, 192], 0.3, 0.5);
}, 8);
defineTexture('lv72_floor_r', (p) => {
  p.fill([206, 220, 228]);
  p.grain(0.02);
  p.noise(4, 0.03, 2);
  p.speckle(80, [188, 204, 216], 0.3, 0.5);
}, 8);
defineTexture('lv72_stripe', (p) => { p.fill([40, 74, 130]); p.noise(2, 0.05, 2); }, 4);
defineTexture('lv72_ceil', (p) => {
  p.fill([228, 234, 238]);
  p.noise(3, 0.02, 2);
  for (let k = 0; k < 64; k += 32) for (let i = 0; i < 64; i++) { p.set(i, k, [196, 204, 210]); p.set(k, i, [196, 204, 210]); }
  for (let y = 4; y < 64; y += 8) for (let x = 4; x < 64; x += 8) p.set(x, y, [200, 208, 214]);
}, 6);
defineTexture('lv72_door', (p) => {
  p.fill([150, 186, 214]);
  p.noise(3, 0.03, 2);
  p.rect(6, 6, 52, 52, [160, 196, 222]);
  p.frame(6, 6, 52, 52, [112, 148, 180]);
  p.rect(26, 52, 12, 3, [236, 240, 242]);                         // kick strip
  p.rect(44, 30, 8, 3, [210, 214, 216]);                          // handle
  p.rect(22, 8, 20, 9, [240, 242, 242]); p.frame(22, 8, 20, 9, [140, 160, 176]);
  p.text('72', 28, 9, [60, 90, 140], 1);
}, 8);
defineTexture('lv72_window', (p) => {
  // a lightbox standing in for a window: pale sky, white frame
  p.fill([206, 228, 248]);
  p.rect(0, 0, 64, 32, [222, 238, 252]);
  p.rect(0, 28, 64, 4, [190, 214, 236]);
  p.rect(30, 0, 4, 64, [244, 248, 250]);
  p.frame(0, 0, 64, 64, [238, 244, 248]);
}, 8);
defineTexture('lv72_sheet', (p) => { p.fill([236, 240, 244]); p.noise(3, 0.04, 2); for (let y = 8; y < 64; y += 16) p.rect(0, y, 64, 1, [208, 218, 228]); }, 6);
defineTexture('lv72_blanket', (p) => { p.fill([128, 168, 200]); p.noise(3, 0.05, 2); p.rect(0, 28, 64, 3, [236, 240, 244]); }, 6);
defineTexture('lv72_metal', (p) => { p.fill([196, 204, 210]); p.noise(2, 0.04, 2); p.rect(0, 0, 64, 2, [226, 232, 236]); }, 4);
defineTexture('lv72_intercom', (p) => {
  p.fill([214, 220, 224]);
  for (let y = 10; y < 46; y += 4) p.rect(10, y, 44, 1, [90, 100, 110]);
  p.rect(26, 50, 12, 6, [60, 70, 80]);
  p.frame(0, 0, 64, 64, [150, 160, 168]);
}, 6);
defineTexture('lv72_led', (p) => { p.fill([90, 255, 150]); }, 2);
defineTexture('lv72_sign', (p) => {
  p.fill([40, 86, 150]);
  p.frame(0, 0, 64, 64, [220, 232, 244]);
  p.text('WING', 17, 10, [240, 246, 252], 1);
  p.text('72', 22, 24, [240, 246, 252], 2);
  p.rect(10, 46, 44, 2, [240, 246, 252]);
  p.text('>>>', 22, 52, [240, 246, 252], 1);
}, 8);

defineMaterial('lv72_wall_c', 'lv72_wall_c', { su: 2, sv: CH, surf: 'drywall', stain: 0.03 });
defineMaterial('lv72_wall_r', 'lv72_wall_r', { su: 2, sv: CH, surf: 'drywall', stain: 0.03 });
defineMaterial('lv72_floor', 'lv72_floor', { s: 1.6, surf: 'lino' });
defineMaterial('lv72_floor_r', 'lv72_floor_r', { s: 1.6, surf: 'lino' });
defineMaterial('lv72_stripe', 'lv72_stripe', { s: 1, surf: 'lino' });
defineMaterial('lv72_ceil', 'lv72_ceil', { s: 1.2, surf: 'drywall' });
defineMaterial('lv72_metal', 'lv72_metal', { s: 1, surf: 'metal' });
defineMaterial('lv72_led', 'lv72_led', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2 });

// ------------------------------------------------------------------ props
defineProp('lv72_door', {
  // a locked patient-room door with a small window (a real opening, 0.3 x 0.5 at 1.2 m): it fills a
  // 1 m doorway, front toward -z
  build(mb) {
    const dt = T('lv72_door'), ed = S('lv72_stripe');
    //   faces: +x -x +y -y +z -z
    mb.box(-0.47, 0.0, -0.03, 0.47, 1.2, 0.03, [null, null, ed, null, dt, dt], { uv: ['world', 'world', 'world', 'world', [0, 0.45, 1, 1], [0, 0.45, 1, 1]] });
    mb.box(-0.47, 1.7, -0.03, 0.47, 2.08, 0.03, [null, null, null, ed, dt, dt], { uv: ['world', 'world', 'world', 'world', [0, 0, 1, 0.3], [0, 0, 1, 0.3]] });
    mb.box(0.15, 1.2, -0.03, 0.47, 1.7, 0.03, [null, ed, null, null, dt, dt], { uv: ['world', 'world', 'world', 'world', [0, 0.3, 0.3, 0.45], [0, 0.3, 0.3, 0.45]] });
    mb.box(-0.47, 1.2, -0.03, -0.15, 1.7, 0.03, [ed, null, null, null, dt, dt], { uv: ['world', 'world', 'world', 'world', [0.7, 0.3, 1, 0.45], [0.7, 0.3, 1, 0.45]] });
  },
  boxes: [[-0.5, 0, -0.08, 0.5, 2.1, 0.08]],
  use: 'locked',
});
defineProp('lv72_room', {
  // the room's only furniture: a bed with raised head against the back wall (head toward -z) and a
  // bedside cabinet with a dark monitor. The room is seen through the door's small window.
  build(mb) {
    const sh = T('lv72_sheet'), bl = T('lv72_blanket'), mt = S('lv72_metal'), wh = S('plastic_white');
    mb.box(-0.5, 0.28, -1.1, 0.5, 0.62, 1.0, [bl, bl, bl, null, bl, bl]);
    mb.box(-0.5, 0.62, -1.05, 0.5, 0.72, -0.4, [sh, sh, sh, null, sh, sh]);
    mb.box(-0.52, 0.3, -1.12, 0.52, 1.1, -1.08, mt, { skip: 2 | 1 | 8 });
    mb.box(0.62, 0, -0.95, 1.02, 0.75, -0.5, wh, { skip: 8 });
    mb.box(0.68, 0.75, -0.9, 0.96, 1.0, -0.62, S('plastic_black'), { skip: 8 });
  },
  boxes: [[-0.5, 0, -1.12, 0.52, 0.7, 1.0], [0.6, 0, -0.95, 1.02, 0.75, -0.5]],
});
defineProp('lv72_intercom', {
  // a wall speaker on the corridor wall with a small green lamp (front toward -z)
  build(mb) {
    const st = T('lv72_intercom');
    mb.box(-0.1, 0, -0.025, 0.1, 0.26, 0.0, [st, st, st, st, st, st], { uv: ['world', 'world', 'world', 'world', 'world', [0, 0, 1, 1]] });
    mb.box(0.06, 0.2, -0.032, 0.085, 0.225, -0.026, S('lv72_led'));
  },
});

// ------------------------------------------------------------------ layout
const isEW = (z) => { const k = pmod(z, PZ); return k >= 5 && k < 8; };
const isNS = (x) => { const u = pmod(x, PX); return u >= 28 && u < 31; };
const corridor = (x, z) => isEW(z) || isNS(x);
function roomId(x, z) {
  const u = pmod(x, PX), bx = Math.floor(x / PX);
  const rx = bx * 15 + (u < 28 ? Math.floor(u / 4) : 7 + Math.floor((u - 31) / 4));
  const k = pmod(z, PZ), bz = Math.floor(z / PZ);
  const row = bz * 2 + (k < 5 ? 0 : 1);
  return (rx + 20000) * 40000 + (row + 20000) + 1;
}
// the arrival block: x 0..16, z 0..18 is one plain mass (no rooms, no doors) so the first chunk is cheap
const BLOCK = -777;
const inBlock = (x, z) => x >= 0 && x < 16 && z >= 0 && z < 18;
const kind = (x, z) => (corridor(x, z) ? 0 : inBlock(x, z) ? BLOCK : roomId(x, z));
const roomOff = (x) => { const u = pmod(x, PX); return u < 28 ? u % 4 : (u - 31) % 4; };
// the first corridor is closed at x = 0: the arrival door stands in that wall
const ENTRY_Z = 6;
const closedAt = (x, z) => x === 0 && z >= 5 && z < 8;

function gen(zb) {
  zb.noConnectivity = true;
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv72_floor_r);
  zb.cmat.fill(M.lv72_ceil);
  zb.wmat.fill(M.lv72_wall_r);
  voidCells(zb);
  const wc = M.lv72_wall_c, wr = M.lv72_wall_r;
  // floors: rooms first, then the corridors a hair higher, the stripe on top
  floorSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv72_floor_r, 0);
  ceilSlab(zb, zb.x0, zb.z0, zb.x1, zb.z1, M.lv72_ceil, CH);
  const j0 = Math.floor((zb.z0 - 5) / PZ), j1 = Math.floor((zb.z1 - 5) / PZ);
  for (let j = j0; j <= j1; j++) {
    const za = j * PZ + 5, zbb = za + 3;
    if (zbb <= zb.z0 || za >= zb.z1) continue;
    floorSlab(zb, zb.x0, za, zb.x1, zbb, M.lv72_floor, 0.02);
    floorSlab(zb, zb.x0, za + 1.35, zb.x1, za + 1.65, M.lv72_stripe, 0.035, 8);
  }
  const i0 = Math.floor((zb.x0 - 28) / PX), i1 = Math.floor((zb.x1 - 28) / PX);
  for (let i = i0; i <= i1; i++) {
    const xa = i * PX + 28, xb = xa + 3;
    if (xb <= zb.x0 || xa >= zb.x1) continue;
    floorSlab(zb, xa, zb.z0, xb, zb.z1, M.lv72_floor, 0.02);
  }
  // walls and doorways
  for (let z = zb.z0; z < zb.z1; z++) {
    for (let x = zb.x0; x < zb.x1; x++) {
      let a = kind(x - 1, z), b = kind(x, z);
      if (a !== b || closedAt(x, z)) {
        if (closedAt(x, z)) { a = -1; b = 0; }
        if (closedAt(x, z) && z === ENTRY_Z) zb.setWall(x, z, 'W', W.DOOR, wc, wc);
        else zb.setWall(x, z, 'W', W.WALL, a === 0 || a === -1 ? wc : wr, b === 0 ? wc : wr);
      }
      a = kind(x, z - 1); b = kind(x, z);
      if (a !== b) {
        const door = (a === 0 || b === 0) && roomOff(x) === 1 && a !== BLOCK && b !== BLOCK;
        zb.setWall(x, z, 'N', door ? W.DOOR : W.WALL, a === 0 ? wc : wr, b === 0 ? wc : wr);
        if (door) {
          const rot = a === 0 ? 0 : Math.PI;
          if (hr(x, z, 17) < 0.016) levelDoor(zb, x + 0.5, z, rot);
          else zb.prop('lv72_door', x + 0.5, 0, z, rot, { useY: 1.0, useR: 0.9 });
        }
      }
    }
  }
  // the rooms: a bed under the window, the window's light, once per room (anchored at its middle)
  for (let z = zb.z0; z < zb.z1; z++) {
    const k = pmod(z, PZ);
    if (k !== 2 && k !== 10) continue;
    for (let x = zb.x0; x < zb.x1; x++) {
      if (roomOff(x) !== 2 || corridor(x, z) || isNS(x) || inBlock(x, z)) continue;
      const north = k === 2;
      const back = north ? z - 2 : z + 3;                     // z of the back wall line
      zb.prop('lv72_room', x - 0.3, 0, north ? back + 1.27 : back - 1.27, north ? 0 : Math.PI, {});
      zb.decal(x, 1.45, north ? back + 0.12 : back - 0.12, north ? 'pz' : 'nz', 1.7, 1.3, 'lv72_window', { lit: false, glow: 1.0 });
    }
  }
  // corridor lights every 3 m, an intercom every 16 m on the north wall, signs at the crossings
  for (let z = zb.z0; z < zb.z1; z++) {
    if (pmod(z, PZ) !== 6) continue;
    for (let x = zb.x0; x < zb.x1; x++) {
      if (pmod(x, 4) === 1) ceilingLight(zb, x + 0.5, z + 0.5, 'troffer', 'on', { rot: 1, color: [0.96, 1.0, 1.08], mul: 0.8, rad: 7.5 });
      if (pmod(x, 16) === 8) zb.prop('lv72_intercom', x + 0.5, 1.75, z - 0.9, Math.PI, {});
      if (pmod(x, PX) === 27) zb.decal(x + 0.5, 2.25, z - 0.9, 'pz', 0.9, 0.9, 'lv72_sign');
    }
  }
  for (let x = zb.x0; x < zb.x1; x++) {
    if (pmod(x, PX) !== 29) continue;
    for (let z = zb.z0; z < zb.z1; z++) if (!isEW(z) && pmod(z, 4) === 1) ceilingLight(zb, x + 0.5, z + 0.5, 'troffer', 'on', { rot: 0, color: [0.96, 1.0, 1.08], mul: 0.8, rad: 7.5 });
  }
}

defineZone('lv72_wing', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.5, 0.56, 0.62],
    env: env({ fog: [0.8, 0.88, 0.95], fogNear: 8, fogFar: 62, hum: 0.55, hvac: 0.6, reverb: 'corridor', tone: 'lv72_wing' }),
  }),
  gen,
});

defineLevel(N, {
  name: 'THE EMPTY HOSPITAL WING',
  zoneType: 'lv72_wing',
  zoneSize: 64,
  entry: { x: 0.75, y: 0.02, z: 6.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 4,
  grade: { sat: 0.92, tint: [0.97, 1.0, 1.05] },
  light: { phoneRadius: 3.6, phoneIntensity: 0.12 },
  // the intercom chimes now and then somewhere along the corridor; no voice follows
  script(ctx, dt) {
    const s = ctx.state;
    if (!s.warm) { s.warm = 1; ctx.game.audioCall('play', 'lv72_chime', undefined, undefined, undefined, { vol: 0 }); }
    if (s.t === undefined || s.t > 110) s.t = 25 + Math.random() * 30;
    s.t -= dt;
    if (s.t > 0) return;
    s.t = 35 + Math.random() * 60;
    const p = ctx.player, d = (14 + Math.random() * 26) * (Math.random() < 0.5 ? -1 : 1);
    const zc = Math.floor(p.z / PZ) * PZ + 6.5;
    ctx.game.audioCall('play', 'lv72_chime', p.x + d, p.y + 2.2, zc, { vol: 1 });
  },
});
