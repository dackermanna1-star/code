// Level 53: The Blue Hallway. Everything is painted blue: the walls, the floor, the ceiling, the
// doors that line both sides of the hall. They never open. Every few minutes one of them is not
// there any more: the wall where it stood is bare, the same blue as the rest.
//
// Layout: every 64 m zone has one wide east-west hall through its middle; north-south halls of
// the same kind join neighbouring halls here and there (decided by coordinates, so both zones
// agree). Doors are dynamics (cheap to hide at runtime); the zone's mutation counter says how
// many of its doors have already vanished, so a rebuilt chunk shows the same bare wall.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineZone } from '../zonetypes.js';
import { defineProp, propMat as S, propWithXf as withXf } from '../props.js';
import { xfRotY } from '../../core/math.js';
import { LEVEL_ZONE, defineLevel, cbox, owns, hr, levelDoor, env, M } from './kit.js';
import { solidAll, carve, wall, epochOf, inView } from './g09_kit.js';

const N = 53;
const Z = 64;            // zone size
const H = 3.8;           // hall height
const HALL = [30, 34];   // hall cells inside a zone (4 wide)

// ---- textures
defineTexture('lv53_wall', (p) => {
  p.fill([62, 96, 196]);
  p.noise(5, 0.07, 3);
  p.noise(16, 0.05, 2);
  p.rect(0, 52, 64, 12, [46, 74, 164]);            // dado
  p.rect(0, 51, 64, 1, [36, 60, 140]);             // rail
  p.rect(0, 62, 64, 2, [30, 48, 120]);             // skirting
  p.speckle(30, [44, 70, 150], 0.3, 0.6);
  p.speckle(14, [140, 176, 245], 0.2, 0.45);
}, 10);
defineTexture('lv53_floor', (p) => {
  p.fill([28, 42, 112]);
  p.rect(0, 0, 32, 32, [36, 54, 134]); p.rect(32, 32, 32, 32, [36, 54, 134]);
  p.rect(0, 0, 64, 1, [60, 84, 170]); p.rect(0, 32, 64, 1, [60, 84, 170]);
  p.rect(0, 0, 1, 64, [60, 84, 170]); p.rect(32, 0, 1, 64, [60, 84, 170]);
  p.noise(8, 0.08, 2);
  p.speckle(30, [110, 140, 220], 0.2, 0.5);
}, 8);
defineTexture('lv53_ceil', (p) => {
  p.fill([150, 178, 236]);
  p.noise(8, 0.06, 2);
  p.rect(0, 0, 64, 2, [96, 126, 200]); p.rect(0, 0, 2, 64, [96, 126, 200]);
  p.rect(0, 32, 64, 1, [116, 146, 214]); p.rect(32, 0, 1, 64, [116, 146, 214]);
  p.speckle(40, [120, 150, 214], 0.3, 0.6);
}, 8);
defineTexture('lv53_door', (p) => {
  p.fill([44, 76, 186]);
  p.noise(6, 0.06, 2);
  p.bevel(0, 0, 64, 64, 0.1, 0.25);
  p.bevel(8, 6, 48, 22, 0.18, -0.2);
  p.bevel(8, 34, 48, 24, 0.18, -0.2);
  p.rect(48, 30, 6, 3, [150, 176, 240]);           // a pale blue handle
  p.speckle(20, [30, 54, 140], 0.3, 0.6);
}, 10);
defineTexture('lv53_frame', (p) => {
  p.fill([30, 52, 140]);
  p.noise(4, 0.07, 2);
}, 6);
defineTexture('lv53_tube', (p) => {
  p.fill([214, 232, 255]);
  p.rect(0, 0, 64, 6, [150, 186, 240]); p.rect(0, 58, 64, 6, [150, 186, 240]);
  p.rect(0, 28, 64, 8, [246, 250, 255]);
}, 6);

defineMaterial('lv53_wall', 'lv53_wall', { su: 3.0, sv: 3.8, surf: 'drywall', stain: 0.06 });
defineMaterial('lv53_floor', 'lv53_floor', { s: 2, surf: 'tile', stain: 0.05 });
defineMaterial('lv53_ceil', 'lv53_ceil', { s: 2, surf: 'drywall' });
defineMaterial('lv53_door', 'lv53_door', { s: 1, surf: 'wood' });
defineMaterial('lv53_frame', 'lv53_frame', { s: 1, surf: 'wood' });
defineMaterial('lv53_tube', 'lv53_tube', { s: 1, flags: VF.FULLBRIGHT, glow: 1.1 });

// ---- the door prop: a blue door on a blue frame, standing against a wall. opts.face is the wall
// it is mounted on (N: its back is to the north, so it faces south...). No collision.
const FACE_ANG = { N: Math.PI, S: 0, W: Math.PI / 2, E: -Math.PI / 2 };
defineProp('lv53_door', {
  build(mb, p) {
    const d = S('lv53_door'), f = S('lv53_frame');
    withXf(mb, xfRotY(FACE_ANG[p.opts.face || 'S']), () => {
      // local: the wall is at z = 0, the door stands out toward -z
      mb.box(-0.58, 0, -0.1, -0.46, 2.22, 0, f);
      mb.box(0.46, 0, -0.1, 0.58, 2.22, 0, f);
      mb.box(-0.58, 2.1, -0.1, 0.58, 2.24, 0, f);
      mb.box(-0.46, 0.02, -0.06, 0.46, 2.1, -0.01, [d, d, d, d, d, d], { uv: ['world', 'world', 'world', 'world', [1, 0, 0, 1], [0, 0, 1, 1]] });
    });
  },
});

// ---- layout
const connSouth = (i, j) => (i === 0 && j === 0) || hr(i, j, 5301) < 0.5;   // hall from row j down to row j+1 at column i

// door slots of a zone (zone origin zx, zz): [{ x, z, face, key }], in a fixed order
function slotsOf(zx, zz) {
  const a = zx / Z, b = zz / Z, out = [];
  const north = connSouth(a, b - 1), south = connSouth(a, b);
  const zc = zz + 32;                  // the hall's centre line (a cell boundary)
  for (let k = 0; k < 8; k++) out.push({ x: zx + 4 + 8 * k, z: zc - 2, face: 'N' });
  for (let k = 0; k < 8; k++) if (k !== 3) out.push({ x: zx + 8 + 8 * k, z: zc + 2, face: 'S' });
  if (north) for (let k = 0; k < 5; k++) { out.push({ x: zx + 30, z: zz + 4 + 6 * k, face: 'W' }); if (k < 4) out.push({ x: zx + 34, z: zz + 7 + 6 * k, face: 'E' }); }
  if (south) for (let k = 0; k < 5; k++) { out.push({ x: zx + 30, z: zz + 36 + 6 * k, face: 'W' }); if (k < 4) out.push({ x: zx + 34, z: zz + 39 + 6 * k, face: 'E' }); }
  out.forEach((s, n) => { s.key = n; s.rank = hr(a * 31 + n, b * 17 + 3, 5302); });
  return out;
}
// level door slot of a zone (or null): one of the zone's slots is a real door
function levelSlot(zx, zz) {
  const a = zx / Z, b = zz / Z;
  if (hr(a, b, 5304) > 0.8 || (a === 0 && b === 0)) return null;
  const s = slotsOf(zx, zz);
  return s[Math.floor(hr(a, b, 5305) * 15)];
}
const vanishOrder = (zx, zz) => {
  const lv = levelSlot(zx, zz);
  return slotsOf(zx, zz).filter((s) => s !== lv && !(lv && s.key === lv.key)).sort((p, q) => p.rank - q.rank);
};

function tubeAt(zb, x, z, alongX, flick) {
  if (!owns(zb, x, z)) return;
  if (alongX) zb.box(x - 1.2, H - 0.1, z - 0.18, x + 1.2, H, z + 0.18, M.lv53_tube, { collide: false });
  else zb.box(x - 0.18, H - 0.1, z - 1.2, x + 0.18, H, z + 1.2, M.lv53_tube, { collide: false });
  zb.light(x, H - 0.45, z, { color: [0.72, 0.86, 1.0], rad: 9, int: 0.9, ch: flick ? 2 : 0 });
}

function gen(zb, world) {
  solidAll(zb, M.lv53_wall);
  const zx = zb.x0, zz = zb.z0, a = zx / Z, b = zz / Z;
  const zc = zz + 32, xc = zx + 32;
  const north = connSouth(a, b - 1), south = connSouth(a, b);
  const epoch = epochOf(world, zb.zone);
  carve(zb, zx, zz + HALL[0], zx + Z, zz + HALL[1], 0, H, M.lv53_floor, M.lv53_ceil, M.lv53_wall);
  if (north) carve(zb, xc - 2, zz, xc + 2, zz + HALL[0], 0, H, M.lv53_floor, M.lv53_ceil, M.lv53_wall);
  if (south) carve(zb, xc - 2, zz + HALL[1], xc + 2, zz + Z, 0, H, M.lv53_floor, M.lv53_ceil, M.lv53_wall);
  // the dead end behind the arrival door
  if (a === 0 && b === 0) {
    wall(zb, zx, zz + HALL[0], 11, zz + HALL[1], M.lv53_wall);
    cbox(zb, 11, 0, zz + HALL[0], 11.45, H, zz + HALL[1], M.lv53_wall);
  }
  // lights: one tube every 8 m down the middle of every hall
  for (let k = 0; k < 8; k++) tubeAt(zb, zx + 4 + 8 * k, zc, true, hr(a * 9 + k, b, 5310) < 0.07);
  if (north) for (let k = 0; k < 4; k++) tubeAt(zb, xc, zz + 4 + 8 * k, false, hr(a, b * 9 + k, 5311) < 0.07);
  if (south) for (let k = 0; k < 4; k++) tubeAt(zb, xc, zz + 38 + 8 * k, false, hr(a, b * 9 + k, 5312) < 0.07);
  if (north || south) tubeAt(zb, xc, zc, true, false);
  // doors: all blue except the one real door of the zone; the vanished ones are not built
  const lv = levelSlot(zx, zz);
  const gone = new Set(vanishOrder(zx, zz).slice(0, epoch).map((s) => s.key));
  for (const s of slotsOf(zx, zz)) {
    if (lv && s.key === lv.key) {
      const nx = s.face === 'N' ? 0.12 : s.face === 'S' ? -0.12 : s.face === 'W' ? 0.12 : -0.12;
      const hx = s.face === 'W' || s.face === 'E' ? s.x + nx : s.x, hz = s.face === 'N' || s.face === 'S' ? s.z + nx : s.z;
      levelDoor(zb, hx, hz, FACE_ANG[s.face]);
      continue;
    }
    if (gone.has(s.key)) continue;
    const wx = s.face === 'W' ? s.x : s.face === 'E' ? s.x : s.x;
    const wz = s.z;
    zb.dynamic('lv53_door', wx, 0, wz, 0, { face: s.face }, {});
  }
}

defineZone('lv53_blue', {
  ...LEVEL_ZONE,
  params: () => ({
    ambient: [0.2, 0.26, 0.46],
    env: env({ fog: [0.1, 0.17, 0.4], fogNear: 4, fogFar: 62, hum: 0.8, hvac: 0.2, reverb: 'hall', tone: 'lv53' }),
  }),
  gen,
});

// ---- the vanishing
// Pick a door of a zone near the player that nobody is looking at, hide it where it stands and
// remember it in the zone's counter so a rebuilt chunk agrees.
function vanishOne(ctx) {
  const g = ctx.game, p = ctx.player, w = g.world;
  const cands = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const zx = Math.floor(p.x / Z) * Z + dx * Z, zz = Math.floor(p.z / Z) * Z + dz * Z;
    const zone = w.zoneAt(p.dim, 0, zx + 1, zz + 1);
    if (!zone || zone.type !== 'lv53_blue') continue;
    const epoch = epochOf(w, zone);
    const next = vanishOrder(zx, zz)[epoch];
    if (!next) continue;
    const d = Math.hypot(next.x - p.x, next.z - p.z);
    if (d < 6 || d > 75) continue;
    if (inView(g, next.x, 1.2, next.z, 0.9, 90)) continue;
    cands.push({ zone, next, d });
  }
  if (!cands.length) return false;
  cands.sort((q, r) => q.d - r.d);
  const { zone, next } = cands[Math.min(cands.length - 1, Math.floor(Math.random() * 3))];
  // hide the live dynamic
  for (const ch of w.chunksNear(p.dim, next.x, next.z, 2)) {
    for (const dy of ch.dyn || []) if (Math.abs(dy.x - next.x) < 0.2 && Math.abs(dy.z - next.z) < 0.2) dy.anim.showFar = 1e9;
  }
  // and remember it, without disturbing the chunks that are loaded
  const n = (w.mutation.get(zone.key) || 0) + 1;
  w.mutation.set(zone.key, n);
  if (w.worker) w.worker.postMessage({ type: 'mutate', key: zone.key, count: n });
  g.nav.timer = 0;
  g.audioCall('play', 'lv53_vanish', next.x, 1.4, next.z, { distant: true, vol: 0.9 });
  return true;
}

defineLevel(N, {
  name: 'THE BLUE HALLWAY',
  zoneType: 'lv53_blue',
  zoneSize: Z,
  entry: { x: 12.5, y: 0, z: 32, yaw: Math.PI / 2 },
  doorDensity: 0,
  viewRadius: 4,
  light: { phoneRadius: 4.2, phoneIntensity: 0.22, phoneColor: [0.7, 0.85, 1.0] },
  script(ctx, dt) {
    const s = ctx.state;
    s.t = (s.t ?? 100 + Math.random() * 60) - dt;
    if (s.t > 0) return;
    s.t = vanishOne(ctx) ? 130 + Math.random() * 110 : 12;
  },
});
