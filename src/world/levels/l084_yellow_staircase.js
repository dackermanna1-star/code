// Level 84: THE YELLOW STAIRCASE. A tower of square shafts, 16 m on a side, each with a yellow
// staircase spiralling round a deep well, and under it the same stair going down. At the corner
// landings four shafts meet through arches, so every story you can step across into the next
// stair. Every hundred steps (three stories) the walls change colour, and the light with them.
import { defineTexture } from '../../gfx/textures.js';
import { defineMaterial, VF } from '../materials.js';
import { defineProp, propMat as S, propTex as T } from '../props.js';
import { defineZone } from '../zonetypes.js';
import { LEVEL_ZONE, defineLevel, hr, levelDoor, env, M, W, CF } from './kit.js';

const N = 84;
const Z = 16;
const R = 3;               // ring width: corner landings are 3 x 3, flights 3 wide and 10 long
const STEPS = 33;          // steps per story: 3 stories are 99 steps

// ---------------------------------------------------------------- palettes: one per hundred steps
const PAL = [
  { name: 'butter', wall: [226, 200, 108], light: [1.0, 0.9, 0.58] },
  { name: 'orange', wall: [214, 124, 46], light: [1.0, 0.72, 0.42] },
  { name: 'red', wall: [176, 58, 50], light: [1.0, 0.58, 0.48] },
  { name: 'rose', wall: [190, 74, 124], light: [1.0, 0.64, 0.78] },
  { name: 'violet', wall: [118, 78, 174], light: [0.82, 0.66, 1.0] },
  { name: 'blue', wall: [58, 98, 184], light: [0.68, 0.8, 1.0] },
  { name: 'teal', wall: [42, 152, 158], light: [0.62, 0.95, 0.95] },
  { name: 'green', wall: [68, 158, 86], light: [0.72, 1.0, 0.72] },
  { name: 'lime', wall: [170, 188, 58], light: [0.95, 1.0, 0.62] },
  { name: 'cream', wall: [224, 214, 178], light: [1.0, 0.96, 0.84] },
  { name: 'grey', wall: [134, 136, 142], light: [0.9, 0.92, 1.0] },
  { name: 'black', wall: [46, 44, 52], light: [1.0, 0.9, 0.62] },
];
for (const c of PAL) c.fog = c.name === 'black' ? [0.03, 0.03, 0.04] : c.wall.map((v) => (v / 255) * 0.5);
const palOf = (story) => (((Math.floor(story / 3)) % PAL.length) + PAL.length) % PAL.length;

PAL.forEach((c, k) => {
  defineTexture('lv84_wall' + k, (p, r) => {
    p.fill(c.wall);
    p.noise(4, 0.07, 3);
    // wainscot: a darker band low on the wall with a thin rail above it
    p.map((x, y, col) => (y > 40 ? [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8] : col));
    p.rect(0, 39, 64, 2, [c.wall[0] * 1.12, c.wall[1] * 1.12, c.wall[2] * 1.12]);
    for (let i = 0; i < 4; i++) p.drip(r.int(0, 63), 0, r.int(12, 40), [c.wall[0] * 0.7, c.wall[1] * 0.7, c.wall[2] * 0.7], 0.25, 2);
    p.speckle(40, [c.wall[0] * 1.2, c.wall[1] * 1.2, c.wall[2] * 1.2], 0.2, 0.5);
    p.grain(0.025);
  }, 10);
  defineMaterial('lv84_wall' + k, 'lv84_wall' + k, { su: 4, sv: 6, surf: 'drywall' });
});
defineTexture('lv84_step', (p, r) => {
  p.fill([228, 190, 42]);
  p.noise(5, 0.08, 2);
  p.rect(0, 0, 64, 6, [250, 214, 70]);                       // worn leading edge
  p.rect(0, 6, 64, 1, [150, 112, 20]);
  for (let i = 0; i < 20; i++) p.rect(r.int(0, 62), r.int(7, 62), r.int(2, 8), 1, [196, 156, 28], 0.8);
  p.speckle(40, [120, 90, 20], 0.3, 0.6);
}, 10);
defineTexture('lv84_floor', (p, r) => {
  p.fill([206, 170, 38]);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) p.shade(tx * 32, ty * 32, 32, 32, r.range(-0.08, 0.05));
  p.rect(0, 31, 64, 2, [140, 104, 20]); p.rect(31, 0, 2, 64, [140, 104, 20]);
  p.noise(5, 0.08, 2);
  p.speckle(60, [120, 90, 20], 0.3, 0.6);
}, 10);
defineTexture('lv84_rail', (p) => { p.fill([236, 200, 52]); p.noise(3, 0.1, 2); p.rect(0, 0, 64, 8, [255, 226, 96]); }, 6);
defineTexture('lv84_bulb', (p) => { p.fill([255, 244, 200]); p.disc(32, 32, 28, [255, 255, 240]); }, 4);
defineTexture('lv84_cord', (p) => { p.fill([40, 34, 28]); }, 2);
defineMaterial('lv84_step', 'lv84_step', { s: 1.5, surf: 'concrete' });
defineMaterial('lv84_floor', 'lv84_floor', { s: 3, surf: 'concrete' });
defineMaterial('lv84_rail', 'lv84_rail', { s: 1, surf: 'metal' });
defineMaterial('lv84_bulb', 'lv84_bulb', { s: 1, flags: VF.FULLBRIGHT, glow: 1.15 });
defineMaterial('lv84_cord', 'lv84_cord', { s: 1, surf: 'metal' });

// painted numerals on the wall: white with a dark edge
for (const ch of '0123456789-') {
  defineTexture('lv84_n' + (ch === '-' ? 'm' : ch), (p) => {
    p.fill([250, 244, 228]);
    p.clearAlpha(0);
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) { p.text(ch, 14 + dx, 10 + dy, [30, 24, 20], 6); p.textA(ch, 14 + dx, 10 + dy, 255, 6); }
    p.text(ch, 14, 10, [250, 244, 228], 6); p.textA(ch, 14, 10, 255, 6);
  }, 4);
}
// handrail of a flight: a sloped rod on balusters, one at every third tread
defineProp('lv84_rail', {
  build(mb, p) {
    const L = p.opts.len, rise = p.opts.rise, n = p.opts.n, rail = S('lv84_rail');
    const yAt = (x) => 0.95 + (rise * x) / L;
    mb.rod(-0.05, yAt(-0.05), 0, L + 0.05, yAt(L + 0.05), 0, 0.04, 5, rail, true);
    for (let k = 1; k < n; k += 3) {
      const x = ((k + 0.5) * L) / n, top = (rise * (k + 1)) / n;
      mb.rod(x, top, 0, x, yAt(x), 0, 0.018, 4, rail);
    }
    mb.rod(0.04, 0, 0, 0.04, yAt(0.04), 0, 0.045, 5, rail, true);
    mb.rod(L - 0.04, rise, 0, L - 0.04, yAt(L - 0.04), 0, 0.045, 5, rail, true);
  },
});

// ---------------------------------------------------------------- layout
// per story the stair starts in one corner: NW, NE, SE, SW (clockwise) and runs to the next one.
// Neighbouring shafts are mirrored (chessboard), so at the corner where four shafts meet all four
// landings are on the same story: that is where the arches are.
const FLIGHT = [
  { land: [0, 0, R, R], run: [R, 0, Z - R, R], dir: '+x', rail: ['N', R, 0, R] },
  { land: [Z - R, 0, Z, R], run: [Z - R, R, Z, Z - R], dir: '+z', rail: ['W', Z - R, 0, R] },
  { land: [Z - R, Z - R, Z, Z], run: [R, Z - R, Z - R, Z], dir: '-x', rail: ['N', Z - R, Z - R, Z] },
  { land: [0, Z - R, R, Z], run: [0, R, R, Z - R], dir: '-z', rail: ['W', R, Z - R, Z] },
];
// does the shared wall between the landings north/south of each other have an arch (or a door)?
const nsArch = (i, j, s) => (i === 0 && j === 0 && s === 0) ? true : hr(i * 5 + j, s, 901) < 0.5;
const doorHere = (i, j, s, k) => hr(i * 3 + k, j * 7 + s, 902) < 0.34;

function gen(zb) {
  const s = zb.zone.level;
  const bi = Math.floor(zb.x0 / Z), bj = Math.floor(zb.z0 / Z);
  const mx = (bi & 1) === 1, mz = (bj & 1) === 1;
  const sig = (((s % 4) + 4) % 4);
  const F = FLIGHT[sig];
  const pal = palOf(s), wallM = M['lv84_wall' + pal], P = PAL[pal];
  zb.noConnectivity = true;
  zb.floor.fill(NaN); zb.ceil.fill(NaN); zb.flags.fill(0);
  const mapX = (u) => zb.x0 + (mx ? Z - u : u), mapZ = (v) => zb.z0 + (mz ? Z - v : v);
  const rect = (r) => { const a = mapX(r[0]), b = mapX(r[2]), c = mapZ(r[1]), d = mapZ(r[3]); return [Math.min(a, b), Math.min(c, d), Math.max(a, b), Math.max(c, d)]; };

  // the starting landing
  const [lx0, lz0, lx1, lz1] = rect(F.land);
  zb.rectFloor(lx0, lz0, lx1, lz1, 0, M.lv84_floor);
  zb.rectWallMat(lx0, lz0, lx1, lz1, wallM);

  // the flight
  const [fx0, fz0, fx1, fz1] = rect(F.run);
  let dir = F.dir;
  if (mx && (dir === '+x' || dir === '-x')) dir = dir === '+x' ? '-x' : '+x';
  if (mz && (dir === '+z' || dir === '-z')) dir = dir === '+z' ? '-z' : '+z';
  zb.fill(fx0, fz0, fx1, fz1, (x, z, i) => { zb.flags[i] |= CF.STAIRS; zb.floor[i] = 0; zb.solid[i] = 0; });
  zb.rectWallMat(fx0, fz0, fx1, fz1, wallM);
  const alongX = dir === '+x' || dir === '-x';
  const wellSide = alongX ? ((fz0 + fz1) / 2 < zb.z0 + Z / 2 ? 'S' : 'N') : ((fx0 + fx1) / 2 < zb.x0 + Z / 2 ? 'E' : 'W');
  const n = STEPS, run = alongX ? fx1 - fx0 : fz1 - fz0, tread = run / n;
  const up = dir === '+x' || dir === '+z';
  const at = (k) => (up ? k * tread : run - (k + 1) * tread);
  for (let k = 0; k < n; k++) {
    const a = at(k), top = (6 * (k + 1)) / n;
    // each step is a slab a little thicker than the rise: the underside shows as a saw tooth
    if (alongX) zb.box(fx0 + a, top - 0.22, fz0, fx0 + a + tread, top, fz1, M.lv84_step, { sub: 8 });
    else zb.box(fx0, top - 0.22, fz0 + a, fx1, top, fz0 + a + tread, M.lv84_step, { sub: 8 });
    // an invisible solid keeps people from slipping off the open side; every third step gets a baluster and a piece of handrail
    let bx0, bx1, bz0, bz1;
    if (alongX) { bx0 = fx0 + a; bx1 = fx0 + a + tread; bz0 = wellSide === 'S' ? fz1 - 0.09 : fz0; bz1 = wellSide === 'S' ? fz1 : fz0 + 0.09; }
    else { bz0 = fz0 + a; bz1 = fz0 + a + tread; bx0 = wellSide === 'E' ? fx1 - 0.09 : fx0; bx1 = wellSide === 'E' ? fx1 : fx0 + 0.09; }
    zb.box(bx0, top, bz0, bx1, top + 0.95, bz1, M.lv84_rail, { render: false });
  }
  // the handrail: one sloped prop along the open side
  {
    const rot = { '+x': 0, '+z': Math.PI / 2, '-x': Math.PI, '-z': -Math.PI / 2 }[dir];
    let rx, rz;
    if (alongX) { rz = wellSide === 'S' ? fz1 - 0.06 : fz0 + 0.06; rx = dir === '+x' ? fx0 : fx1; }
    else { rx = wellSide === 'E' ? fx1 - 0.06 : fx0 + 0.06; rz = dir === '+z' ? fz0 : fz1; }
    zb.prop('lv84_rail', rx, 0, rz, rot, { len: run, rise: 6, n, collide: false });
  }

  // rail on the landing's open side toward the well (the edge is given in unmirrored cell space)
  {
    const [kind, line, a0, a1] = F.rail;
    if (kind === 'N') {
      const ln = mapZ(line), xa = Math.min(mapX(a0), mapX(a1)), xb = Math.max(mapX(a0), mapX(a1));
      for (let x = xa; x < xb; x++) zb.setWall(x, ln, 'N', W.RAIL, M.lv84_rail, M.lv84_rail);
    } else {
      const ln = mapX(line), za = Math.min(mapZ(a0), mapZ(a1)), zbb = Math.max(mapZ(a0), mapZ(a1));
      for (let z = za; z < zbb; z++) zb.setWall(ln, z, 'W', W.RAIL, M.lv84_rail, M.lv84_rail);
    }
  }

  // outer walls on this zone's west and north lines; arches where the landing touches them
  const landW = lx0 === zb.x0, landN = lz0 === zb.z0;
  const archNS = landN ? nsArch(bi, bj, s) : false;
  for (let z = zb.z0; z < zb.z1; z++) {
    const arch = landW && z >= lz0 && z < lz1;
    zb.setWall(zb.x0, z, 'W', arch ? W.ARCH : W.WALL, wallM, wallM);
  }
  for (let x = zb.x0; x < zb.x1; x++) {
    const arch = archNS && x >= lx0 && x < lx1;
    zb.setWall(x, zb.z0, 'N', arch ? W.ARCH : W.WALL, wallM, wallM);
  }
  // keep the arch cells' floors continuous with the neighbour's landing (the landing floor is at 0 on both sides)

  // at the first story of a colour the number of steps climbed so far is painted on the wall of the flight
  if (((s % 3) + 3) % 3 === 0) {
    const label = String(Math.floor(s / 3) * 100), wx = (fx0 + fx1) / 2, wz = (fz0 + fz1) / 2;
    const dw = 1.15, total = label.length * dw;
    for (let q = 0; q < label.length; q++) {
      const off = -total / 2 + dw * (q + 0.5), tex = 'lv84_n' + (label[q] === '-' ? 'm' : label[q]);
      let x, z, face;
      if (alongX) { const north = wellSide === 'S'; face = north ? 'pz' : 'nz'; z = north ? zb.z0 + 0.12 : zb.z1 - 0.12; x = north ? wx + off : wx - off; }
      else { const west = wellSide === 'E'; face = west ? 'px' : 'nx'; x = west ? zb.x0 + 0.12 : zb.x1 - 0.12; z = west ? wz - off : wz + off; }
      zb.decal(x, 5.0, z, face, 1.0, 1.7, tex);
    }
    void wx; void wz;
  }

  // a bare bulb on a cord in the middle of the well, tinted by the colour of this stretch
  const cx = zb.x0 + Z / 2, cz = zb.z0 + Z / 2;
  zb.box(cx - 0.01, 3.4, cz - 0.01, cx + 0.01, 6.0, cz + 0.01, M.lv84_cord, { collide: false, skip: 12 });
  zb.box(cx - 0.12, 3.1, cz - 0.12, cx + 0.12, 3.4, cz + 0.12, M.lv84_bulb, { collide: false });
  zb.light(cx, 3.0, cz, { color: P.light, rad: 12, int: 1.15 });
  zb.light(cx, 0.8, cz, { color: P.light, rad: 9, int: 0.6 });

  // a door on a landing whose north/south wall has no arch
  const landS = lz1 === zb.z1;
  const cxL = (lx0 + lx1) / 2, first = bi === 0 && bj === 0 && s === 0;
  if (landN && !archNS && !first && doorHere(bi, bj, s, 0)) levelDoor(zb, cxL, zb.z0 + 0.75, Math.PI, { y: 0 });
  else if (landS && !nsArch(bi, bj + 1, s) && doorHere(bi, bj, s, 1)) levelDoor(zb, cxL, zb.z1 - 0.75, 0, { y: 0 });
  zb.emitter(cx, 3.2, cz, 'lv84_bulb', { vol: 0.5, rad: 13 });
}

defineZone('lv84_shaft', {
  ...LEVEL_ZONE,
  params: (zone) => {
    const P = PAL[palOf(zone.level)];
    return {
      ambient: [0.34 + P.fog[0] * 0.3, 0.33 + P.fog[1] * 0.3, 0.32 + P.fog[2] * 0.3],
      wallMat: M['lv84_wall' + palOf(zone.level)],
      env: env({ fog: P.fog, fogNear: 4, fogFar: 32, hum: 0.12, hvac: 0.0, reverb: 'stairwell', tone: 'lv84' }),
    };
  },
  gen,
});

// the arrival: on the north-west landing, looking along the first flight at the spiral above it
export const ENTRY = { x: 1.5, y: 0, z: 1.5, yaw: Math.PI / 2 + 0.55, pitch: 0.18 };

defineLevel(N, {
  name: 'THE YELLOW STAIRCASE',
  zoneType: 'lv84_shaft',
  zoneSize: Z,
  bands: 'all',
  entry: ENTRY,
  doorDensity: 0,
  viewRadius: 2,
  sky: null,
  light: { phoneRadius: 3.4, phoneIntensity: 0.2 },
});
void CF;
