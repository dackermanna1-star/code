// Level 89: The Telephone Hall. Dark green halls, five metres wide, in a grid thirty-two metres
// apart, mahogany shelves along every wall and a black telephone every metre and a quarter. Most
// of them are ringing, none in step. Answer one and the line connects somewhere else (each phone
// to its own level); some just stop ringing. Now and then every phone falls silent at once.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, env, M, W, hr, cbox, owns, levelDoor, ceilingLight } from './kit.js';
import { pmod, voidCells, floorSlab, ceilSlab } from './g08_kit.js';

const N = 89;
const HP = 32, HW = 5, H0 = 14;       // hall pitch, hall width, offset of the first hall
const CH = 3.6;                       // ceiling height
const RINGS = ['lv89_ring_a', 'lv89_ring_b', 'lv89_ring_c'];

// ------------------------------------------------------------------ textures & materials
defineTexture('lv89_paper', (p) => {
  // dark green flock wallpaper above mahogany wainscot and a brass rail (bottom of the image = floor)
  p.fill([44, 80, 58]);
  p.noise(3, 0.05, 2);
  for (let y = 4; y < 34; y += 10) for (let x = 4; x < 64; x += 10) {
    const ox = (y / 10) % 2 ? 5 : 0;
    p.disc(x + ox, y, 2, [50, 88, 62], 0.9); p.set(x + ox, y, [92, 128, 84]);
  }
  p.rect(0, 38, 64, 2, [186, 150, 70]);
  p.rect(0, 40, 64, 24, [92, 40, 30]);
  for (let x = 0; x < 64; x += 16) { p.frame(x + 2, 43, 12, 17, [64, 26, 20]); p.rect(x + 3, 44, 10, 15, [104, 48, 36]); }
  p.rect(0, 60, 64, 4, [54, 24, 18]);
  p.grain(0.03);
}, 12);
defineTexture('lv89_floor', (p) => {
  // herringbone parquet
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 16) {
    const c = [84 + ((x + y) % 5) * 5, 44 + ((x * 3 + y) % 4) * 4, 28];
    if ((y / 8) % 2) p.rect(x, y, 16, 8, c); else p.rect(x + 8, y, 16, 8, c);
    p.rect(x, y, 16, 1, [40, 20, 14], 0.8);
  }
  p.noise(3, 0.06, 2);
  p.grain(0.04);
}, 10);
defineTexture('lv89_ceil', (p) => {
  p.fill([62, 40, 30]);
  p.noise(3, 0.05, 2);
  p.frame(2, 2, 60, 60, [92, 62, 44]); p.frame(6, 6, 52, 52, [44, 28, 20]);
  p.rect(30, 6, 4, 52, [50, 32, 24]); p.rect(6, 30, 52, 4, [50, 32, 24]);
}, 8);
defineTexture('lv89_wood', (p) => {
  p.fill([104, 50, 34]);
  p.map((x, y, c) => { const g = 0.86 + 0.14 * Math.sin(y * 0.7 + Math.sin(x * 0.15) * 2.5); return [c[0] * g, c[1] * g, c[2] * g]; });
  p.rect(0, 0, 64, 3, [150, 84, 56]);
  p.grain(0.04);
}, 8);
defineTexture('lv89_brass', (p) => { p.fill([190, 150, 70]); p.rect(0, 0, 64, 8, [230, 196, 110]); p.noise(3, 0.1, 2); }, 6);
defineTexture('lv89_bulb', (p) => { p.fill([255, 200, 110]); p.disc(32, 32, 22, [255, 240, 200]); }, 4);
defineTexture('lv89_dial', (p) => {
  p.fill([22, 20, 20]);
  p.disc(32, 32, 26, [206, 198, 176]);
  for (let k = 0; k < 10; k++) { const a = 0.6 + k * 0.55; p.disc(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17, 3, [34, 30, 30]); }
  p.disc(32, 32, 6, [34, 30, 30]);
}, 6);

defineMaterial('lv89_paper', 'lv89_paper', { su: 2, sv: CH, surf: 'wood', stain: 0.06 });
defineMaterial('lv89_floor', 'lv89_floor', { s: 2, surf: 'wood' });
defineMaterial('lv89_ceil', 'lv89_ceil', { s: 2, surf: 'wood' });
defineMaterial('lv89_wood', 'lv89_wood', { s: 1.2, surf: 'wood' });
defineMaterial('lv89_brass', 'lv89_brass', { s: 1, surf: 'metal' });
defineMaterial('lv89_bulb', 'lv89_bulb', { s: 1, flags: VF.FULLBRIGHT, glow: 1.2 });

// ------------------------------------------------------------------ props
defineTexture('lv89_pbody', (p) => { p.fill([214, 214, 214]); p.noise(3, 0.06, 2); p.rect(0, 0, 64, 6, [250, 250, 250]); }, 6);
const BODY = [['lv89_p0', [0.2, 0.19, 0.19]], ['lv89_p0', [0.2, 0.19, 0.19]], ['lv89_p1', [1.05, 1.0, 0.85]], ['lv89_p2', [0.92, 0.16, 0.14]], ['lv89_p3', [0.3, 0.52, 0.3]]];
for (const [m, t] of BODY) defineMaterial(m, 'lv89_pbody', { s: 0.5, surf: 'plastic', tint: t });
defineProp('lv89_phone', {
  // a big old desk telephone: base, body with its dial on top, black handset (front toward -z)
  build(mb, p) {
    const c = S(BODY[(p.opts.col || 0) % 5][0]), blk = S('lv89_p0');
    const dial = T('lv89_dial');
    mb.box(-0.16, 0, -0.14, 0.16, 0.1, 0.14, c, { skip: 8 });
    mb.box(-0.1, 0.1, -0.1, 0.1, 0.17, 0.1, [c, c, dial, c, c, c], { skip: 8, uv: ['world', 'world', [0, 0, 1, 1], 'world', 'world', 'world'] });
    mb.box(-0.19, 0.17, -0.045, 0.19, 0.225, 0.045, blk, { skip: 8 });
  },
});
defineProp('lv89_sconce', {
  // a brass wall lamp with a lit shade (front toward -z)
  build(mb) {
    const br = S('lv89_brass');
    mb.box(-0.06, 1.7, 0.0, 0.06, 1.94, 0.02, br, { skip: 1 | 2 | 8 });
    mb.box(-0.05, 1.8, -0.1, 0.05, 1.84, 0.0, br, { skip: 8 });
    mb.box(-0.08, 1.84, -0.14, 0.08, 2.04, -0.04, S('lv89_bulb'), { skip: 8 });
  },
  light: { y: 1.95, z: -0.35, color: [1.0, 0.7, 0.36], rad: 5.5, int: 0.55 },
});

// ------------------------------------------------------------------ layout
const inEW = (z) => pmod(z - H0, HP) < HW;
const inNS = (x) => pmod(x - H0, HP) < HW;
const hall = (x, z) => inEW(z) || inNS(x);
const ENTRY_Z = 16;
const closedAt = (x, z) => x === 0 && z >= H0 && z < H0 + HW;

// the position of the level door of the hall segment (row k east of intersection i): x, side
function segDoor(i, k, ns) {
  if (hr(i, k, ns ? 201 : 200) > 0.55) return null;
  const a = 4 + Math.floor(hr(i, k, 202) * 18);
  return { a, side: hr(i, k, 203) < 0.5 ? 0 : 1 };
}

function gen(zb) {
  zb.noConnectivity = true;
  zb.floor.fill(0);
  zb.ceil.fill(CH);
  zb.fmat.fill(M.lv89_floor);
  zb.cmat.fill(M.lv89_ceil);
  zb.wmat.fill(M.lv89_paper);
  voidCells(zb);
  const wp = M.lv89_paper;
  // floors and ceilings: east-west halls in full, north-south halls between them
  const k0 = Math.floor((zb.z0 - H0) / HP), k1 = Math.floor((zb.z1 - 1 - H0) / HP);
  const i0 = Math.floor((zb.x0 - H0) / HP), i1 = Math.floor((zb.x1 - 1 - H0) / HP);
  for (let k = k0; k <= k1; k++) {
    const za = H0 + k * HP, zbb = za + HW;
    floorSlab(zb, zb.x0, za, zb.x1, zbb, M.lv89_floor, 0, 2);
    ceilSlab(zb, zb.x0, za, zb.x1, zbb, M.lv89_ceil, CH, 2);
  }
  for (let i = i0; i <= i1; i++) {
    const xa = H0 + i * HP, xb = xa + HW;
    for (let k = k0 - 1; k <= k1; k++) {
      const za = H0 + k * HP + HW, zbb = H0 + (k + 1) * HP;
      if (zbb <= zb.z0 || za >= zb.z1) continue;
      floorSlab(zb, xa, Math.max(za, zb.z0), xb, Math.min(zbb, zb.z1), M.lv89_floor, 0, 2);
      ceilSlab(zb, xa, Math.max(za, zb.z0), xb, Math.min(zbb, zb.z1), M.lv89_ceil, CH, 2);
    }
  }
  // walls
  for (let z = zb.z0; z < zb.z1; z++) {
    for (let x = zb.x0; x < zb.x1; x++) {
      if (hall(x - 1, z) !== hall(x, z) || closedAt(x, z)) {
        zb.setWall(x, z, 'W', closedAt(x, z) && z === ENTRY_Z ? W.DOOR : W.WALL, wp, wp);
      }
      if (hall(x, z - 1) !== hall(x, z)) zb.setWall(x, z, 'N', W.WALL, wp, wp);
    }
  }
  // shelves and phones along the walls, sconces and hanging bulbs along the halls
  for (let k = k0; k <= k1; k++) {
    const zn = H0 + k * HP, zs = zn + HW;            // wall lines
    for (let i = i0 - 1; i <= i1; i++) {
      const xa = H0 + i * HP + HW, xb = H0 + (i + 1) * HP;      // the stretch between two crossings
      if (xb <= zb.x0 || xa >= zb.x1) continue;
      const door = segDoor(i, k, false);
      for (let side = 0; side < 2; side++) {
        const zl = side ? zs : zn, face = side ? -1 : 1;           // shelf stands off the wall toward the hall
        let gap = null;
        if (door && door.side === side) { const gx = xa + door.a; gap = [gx - 1.5, gx + 1.5]; }
        const pieces = gap ? [[xa, gap[0]], [gap[1], xb]] : [[xa, xb]];
        for (const [a, b] of pieces) {
          if (b <= a) continue;
          cbox(zb, a, 0, side ? zl - 0.1 - 0.5 : zl + 0.1, b, 0.8, side ? zl - 0.1 : zl + 0.1 + 0.5, M.lv89_wood, { skip: 8 });
          for (let x = Math.ceil((a + 0.6) / 1.25) * 1.25; x < b - 0.4; x += 1.25) {
            if (!owns(zb, x, zl)) continue;
            const idx = Math.round(x / 1.25);
            const px = x, pz = zl + face * (0.1 + 0.27);
            const col = hr(idx, zl, 211) < 0.45 ? 0 : [2, 3, 4][Math.floor(hr(idx, zl, 212) * 3)];
            const rot = side ? 0 : Math.PI;
            const ringing = hr(idx, zl, 213) < 0.62;
            zb.prop('lv89_phone', px, 0.8, pz, rot, ringing ? { col, use: 'level', label: 'ANSWER', useY: 1.0, useR: 0.8 } : { col });
            if (ringing) {
              const v = Math.floor(hr(idx, zl, 214) * 3);
              zb.emitter(px, 1.0, pz, RINGS[v], { vol: 0.34 + hr(idx, zl, 215) * 0.2, rad: 15 });
            }
          }
        }
        // the level door of the segment, in the gap
        if (door && door.side === side && gap) {
          const gx = (gap[0] + gap[1]) / 2, cx = Math.floor(gx);
          if (owns(zb, gx, zl)) {
            zb.setWall(cx, side ? zl : zl, 'N', W.DOOR, wp, wp);
            levelDoor(zb, cx + 0.5, zl, side ? 0 : Math.PI);
          }
        }
      }
      for (let x = Math.ceil(xa / 8) * 8 + 2; x < xb; x += 8) {
        if (owns(zb, x, zn + 2.5)) ceilingLight(zb, x + 0.5, zn + 2.5, 'bulb', hr(x, zn, 221) < 0.06 ? 'flicker' : 'on', { color: [1.0, 0.72, 0.36], mul: 0.9, rad: 7.5, hang: 1.3 });
        if (owns(zb, x + 4, zn)) zb.prop('lv89_sconce', x + 4.5, 0, zn + 0.1, Math.PI, {});
        if (owns(zb, x + 4, zs)) zb.prop('lv89_sconce', x + 4.5, 0, zs - 0.1, 0, {});
      }
    }
  }
}

function genNSLights(zb) {
  const i0 = Math.floor((zb.x0 - H0) / HP), i1 = Math.floor((zb.x1 - 1 - H0) / HP);
  // a brighter lamp over every crossing: a glow to walk toward down the long halls
  const k0 = Math.floor((zb.z0 - H0) / HP), k1 = Math.floor((zb.z1 - 1 - H0) / HP);
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const cx = H0 + i * HP + 2.5, cz = H0 + k * HP + 2.5;
    if (owns(zb, cx, cz)) ceilingLight(zb, cx, cz, 'bulb', 'on', { color: [1.0, 0.8, 0.5], mul: 1.4, rad: 8, hang: 0.8 });
  }
  for (let i = i0; i <= i1; i++) {
    const cx = H0 + i * HP + 2.5;
    for (let z = Math.ceil(zb.z0 / 8) * 8; z < zb.z1; z += 8) {
      if (inEW(z + 0.5) || inEW(z + 2)) continue;
      if (owns(zb, cx, z + 0.5)) ceilingLight(zb, cx, z + 0.5, 'bulb', 'on', { color: [1.0, 0.72, 0.36], mul: 0.9, rad: 7.5, hang: 1.3 });
    }
  }
}

defineZone('lv89_halls', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.27, 0.2, 0.16],
    env: env({ fog: [0.07, 0.045, 0.035], fogNear: 6, fogFar: 54, hum: 0.3, hvac: 0.2, reverb: 'hall', tone: 'lv89_hall' }),
  }),
  gen(zb) { gen(zb); genNSLights(zb); },
});

// ------------------------------------------------------------------ the level
const keyOf = (x, z) => Math.round(x * 4) + ',' + Math.round(z * 4);

defineLevel(N, {
  name: 'THE TELEPHONE HALL',
  zoneType: 'lv89_halls',
  zoneSize: 64,
  entry: { x: 0.75, y: 0, z: ENTRY_Z + 0.5, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 4,
  grade: { sat: 0.95, tint: [1.03, 0.98, 0.93] },
  light: { phoneRadius: 3.2, phoneIntensity: 0.18 },
  script(ctx, dt) {
    const s = ctx.state;
    if (!s.silent) s.silent = {};
    if (s.hush === undefined) { s.hush = 0; s.nextHush = 60 + Math.random() * 40; }
    // now and then every phone stops at once, for a few seconds
    s.nextHush -= dt;
    if (s.nextHush <= 0) { s.hush = 4 + Math.random() * 3; s.nextHush = 80 + Math.random() * 90; }
    if (s.hush > 0) s.hush -= dt;
    // a connected call: a moment after the handset comes up, the line takes you elsewhere
    if (s.go) {
      s.go.t -= dt;
      if (s.go.t <= 0) { const n = s.go.n; s.go = null; ctx.game.enterLevel(n, null); }
    }
    // silence the phones that were answered (or all, during a hush) in the loaded chunks
    s.scan = (s.scan || 0) - dt;
    if (s.scan > 0) return;
    s.scan = 0.25;
    const p = ctx.player;
    try {
      for (const ch of ctx.game.world.chunksNear(p.dim, p.x, p.z, 30)) {
        for (const e of ch.data.emitters) {
          if (typeof e.snd !== 'string' || e.snd.indexOf('lv89_ring') !== 0) continue;
          if (e.base === undefined) e.base = e.vol;
          e.vol = s.hush > 0 || s.silent[keyOf(e.x, e.z)] ? 0 : e.base;
        }
      }
    } catch (err) { /* chunks not ready yet */ }
  },
  // answering a ringing phone: most of them connect (each phone to its own level), some just go quiet
  onUse(ctx, item) {
    const s = ctx.state;
    if (!s.silent) s.silent = {};
    if (s.go) return;
    const key = keyOf(item.x, item.z);
    if (s.silent[key]) { ctx.game.ui.say('The line is quiet.', 2); return; }
    ctx.game.audioCall('play', 'phone_pickup', item.x, item.y, item.z, {});
    const h = hr(Math.floor(item.x * 2), Math.floor(item.z * 2), 233);
    const n = ctx.game.pickNewLevel ? ctx.game.pickNewLevel() : null;   // never a level already found
    if (h < 0.72 && n !== null) {
      ctx.game.ui.say('The line connects.', 2);
      s.go = { n, t: 1.6 };
    } else {
      s.silent[key] = 1;
      ctx.game.ui.say('Nothing on the line. The ringing stops.', 3);
    }
  },
});
