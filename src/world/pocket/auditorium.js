// Pocket 2: The Fogged Auditorium. A concrete chamber spanning several football fields, where
// endless gridlines of theater seats with rotted red velvet fade out into cold, clinging mist
// before reaching a single wall. The return vestibule is disguised as the sound booth standing
// in one of the aisles near the north end.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { M, env, pmod, facing } from '../gen/common.js';
import { defineProp, propMat as S, propTex as T, propWithXf as withXf } from '../props.js';
import { xfMul, xfTranslate, xfRotX } from '../../core/math.js';
import { defineTexture, signTex } from '../../gfx/textures.js';
import { pfbm } from '../../gfx/texgen.js';
import { voidAll, cbox, owns, kRange, hr, shelledReturn, only, FACE } from './e_util.js';

const ID = 2;
const ENTRY = { level: 0, ox: 159, oz: 144 };
// chamber interior (400 x 300 m); the booth stands 40 m from the north wall
const AX0 = -40, AX1 = 360, AZ0 = 104, AZ1 = 404;
const CEIL = 15;
// seating grid
const P = 0.6, NS = 15, BW = NS * P, AISLE = 2.4, PER = BW + AISLE;
const BX0 = -32.1;              // west edge of block 0 (puts an aisle right on the booth)
const ROW = 1.1, RZ0 = AZ0 + 7; // row k at z = RZ0 + k * ROW
const ROWS_PER = 21, CROSS = 3;  // every 21 rows, 3 are left out: a cross aisle
const BOOTH = { x0: ENTRY.ox - 1.8, x1: ENTRY.ox + 4.8, z0: ENTRY.oz - 2.8, z1: ENTRY.oz + 9.8 };

definePocket(ID, { name: 'auditorium', zoneType: 'p_auditorium', sign: 'e_sign_auditorium', entry: ENTRY });

// ------------------------------------------------------------------ assets
defineTexture('e_sign_auditorium', signTex(['MAIN', 'AUDITORIUM'], [70, 22, 26], [236, 214, 170], 1), 8);
// upholstered seat back: velvet panel with dark piping, a few with mould and worn bare patches
function seatBack(p, r, rotten) {
  p.fill([136, 26, 32]);
  p.grain(0.1);
  p.map((x, y, c) => {
    const s = 1 + 0.07 * Math.sin((x / 64) * Math.PI * 6) - 0.1 * (y / 64);
    let col = [c[0] * s, c[1] * s, c[2] * s];
    if (rotten) {
      const n = pfbm(x, y, 4, 3, p.seed + 5), m = pfbm(x, y, 8, 2, p.seed + 9);
      if (n > 0.6) col = [col[0] * 0.5 + 34, col[1] * 0.6 + 30, col[2] * 0.6 + 24];   // mould
      else if (m < 0.32) col = [col[0] * 0.55 + 74, col[1] * 0.6 + 54, col[2] * 0.6 + 50]; // worn bare
    }
    return col;
  });
  if (rotten) for (let i = 0; i < 7; i++) p.disc(r.int(8, 56), r.int(8, 56), r.range(0.8, 2.2), [24, 8, 8]);
  p.frame(0, 0, 64, 64, [34, 6, 8]); p.frame(1, 1, 62, 62, [44, 8, 10]); p.frame(2, 2, 60, 60, [44, 8, 10]);
  p.frame(3, 3, 58, 58, [70, 14, 18]);
  p.rect(4, 4, 56, 2, [176, 56, 60]);
  for (const x of [21, 42]) p.rect(x, 8, 1, 52, [96, 18, 22], 0.7);
}
defineTexture('e_seatback', (p, r) => seatBack(p, r, false), 16);
defineTexture('e_seatback_rot', (p, r) => seatBack(p, r, true), 16);
// amber aisle step light
defineTexture('e_aisle_led', (p) => {
  p.fill([46, 26, 12]);
  p.disc(32, 32, 22, [255, 176, 70]);
  p.disc(32, 32, 12, [255, 226, 160]);
}, 8);

// A row of n folding theater seats sharing their standards (about 24 triangles per seat, a
// third of n chair_theater props). Front faces local -z.
const FIT = [0, 0, 1, 1];
const UV_BACK = ['world', 'world', 'world', 'world', FIT, FIT];
defineProp('e_seat_row', {
  build(mb, p, r) {
    const n = p.opts.n || NS, W = n * P, x0 = -W / 2;
    const fr = S('metal_dark'), arm = S('wood_dark');
    for (let j = 0; j <= n; j++) {
      const x = x0 + j * P;
      mb.box(x - 0.03, 0, -0.17, x + 0.03, 0.63, 0.18, [fr, fr, arm, null, null, null]);
    }
    for (let j = 0; j < n; j++) {
      const cx = x0 + (j + 0.5) * P;
      const u = r.next();
      if (u < 0.035) continue; // seat long gone
      const t = 0.6 + r.next() * 0.45;
      const tint = r.next() < 0.2 ? [t * 0.92, t * 0.84, t * 0.82] : [t, t, t];
      const panel = T(r.next() < 0.55 ? 'e_seatback_rot' : 'e_seatback', { tint });
      const vel = S('velvet_red', { tint: [t * 0.8, t * 0.8, t * 0.8] });
      const top = r.next() < 0.05 ? 0.62 + r.next() * 0.2 : 0.98; // a few torn backs
      const lean = 0.1 + (r.next() < 0.06 ? r.range(-0.25, 0.3) : 0);
      withXf(mb, xfMul(xfTranslate(cx, 0.16, 0.12), xfRotX(lean)), () => {
        mb.box(-0.235, 0, -0.06, 0.235, top - 0.16, 0.06, [vel, vel, vel, null, panel, panel], { uv: UV_BACK });
      });
      if (u > 0.9) mb.box(cx - 0.23, 0.4, -0.44, cx + 0.23, 0.47, 0.04, [vel, vel, panel, null, null, vel], { uv: ['world', 'world', FIT, 'world', 'world', 'world'] }); // left down
      else mb.box(cx - 0.23, 0.3, -0.07, cx + 0.23, 0.72, 0.04, [null, null, vel, null, null, panel], { uv: UV_BACK });
    }
  },
  boxes: (p) => { const h = (p.opts.n || NS) * P / 2; return [[-h, 0, -0.17, h, 1.0, 0.24]]; },
});

// ------------------------------------------------------------------ layout helpers
const rowExists = (k) => k >= 0 && pmod(k, ROWS_PER) < ROWS_PER - CROSS && RZ0 + k * ROW < AZ1 - 12;
const blockX = (b) => BX0 + b * PER;
const nBlocks = Math.floor((AX1 - 6 - BX0 + AISLE) / PER);
const inChamber = (x, z) => x >= AX0 && x < AX1 && z >= AZ0 && z < AZ1;

// seat runs of a row k in block b, cut around the booth: [[x0, n], ...]
function rowRuns(b, z) {
  const x0 = blockX(b);
  if (z + 0.25 < BOOTH.z0 || z - 0.25 > BOOTH.z1 || x0 + BW < BOOTH.x0 || x0 > BOOTH.x1) return [[x0, NS]];
  const out = [];
  const nl = Math.max(0, Math.min(NS, Math.floor((BOOTH.x0 - x0) / P)));
  if (nl > 0) out.push([x0, nl]);
  const kr = Math.max(0, Math.min(NS, Math.ceil((BOOTH.x1 - x0) / P)));
  if (kr < NS) out.push([x0 + kr * P, NS - kr]);
  return out;
}

function genAuditorium(zb) {
  const lev = zb.zone.level;
  voidAll(zb);
  if (lev !== 0) return;
  const conc = M.concrete, cdark = M.concrete_dark;
  // cells: concrete floor inside the chamber
  zb.fill(Math.max(zb.x0, AX0), Math.max(zb.z0, AZ0), Math.min(zb.x1, AX1), Math.min(zb.z1, AZ1), (x, z, i) => {
    zb.floor[i] = 0; zb.ceil[i] = NaN; zb.flags[i] = 0;
    zb.fmat[i] = M.concrete_floor; zb.cmat[i] = cdark; zb.wmat[i] = conc;
  });
  const booth = shelledReturn(zb, ID, ENTRY, { floorMat: M.concrete_floor, shellMat: M.concrete, height: 3.3, roofMat: cdark, roofOver: 0.25 });
  if (booth) dressBooth(zb, booth);
  if (zb.x1 <= AX0 - 2 || zb.x0 >= AX1 + 2 || zb.z1 <= AZ0 - 2 || zb.z0 >= AZ1 + 2) return;

  // ---- enclosing walls, pilasters, exits
  cbox(zb, AX0 - 1, -0.5, AZ0 - 1, AX1 + 1, CEIL + 0.5, AZ0, conc, { sub: 2 });
  cbox(zb, AX0 - 1, -0.5, AZ1, AX1 + 1, CEIL + 0.5, AZ1 + 1, conc, { sub: 2 });
  cbox(zb, AX0 - 1, -0.5, AZ0, AX0, CEIL + 0.5, AZ1, conc, { sub: 2 });
  cbox(zb, AX1, -0.5, AZ0, AX1 + 1, CEIL + 0.5, AZ1, conc, { sub: 2 });
  for (let x = AX0 + 6; x < AX1 - 2; x += 12) {
    cbox(zb, x - 0.45, 0, AZ0, x + 0.45, CEIL, AZ0 + 0.55, conc, { sub: 2 });
    cbox(zb, x - 0.45, 0, AZ1 - 0.55, x + 0.45, CEIL, AZ1, conc, { sub: 2 });
  }
  for (let z = AZ0 + 6; z < AZ1 - 2; z += 12) {
    cbox(zb, AX0, 0, z - 0.45, AX0 + 0.55, CEIL, z + 0.45, conc, { sub: 2 });
    cbox(zb, AX1 - 0.55, 0, z - 0.45, AX1, CEIL, z + 0.45, conc, { sub: 2 });
  }
  // exits that are always locked
  for (let x = AX0 + 36; x < AX1 - 10; x += 48) {
    exitDoors(zb, x, AZ0, 0, 1);
    exitDoors(zb, x + 12, AZ1, 0, -1);
  }
  for (let z = AZ0 + 36; z < AZ1 - 10; z += 48) {
    exitDoors(zb, AX0, z, 1, 0);
    exitDoors(zb, AX1, z + 12, -1, 0);
  }
  // ---- overhead: beams fading into the mist, a few massive columns
  for (let z = AZ0 + 12; z < AZ1; z += 24) cbox(zb, AX0, CEIL - 5.2, z - 0.4, AX1, CEIL, z + 0.4, cdark, { skip: FACE.PY, sub: 2 });
  for (let b = 3; b < nBlocks; b += 4) {
    const cx = blockX(b) + BW + AISLE / 2;
    for (let kc = 2; kc * ROWS_PER < 300; kc += 2) {
      const cz = RZ0 + (kc * ROWS_PER - CROSS / 2 - 0.5) * ROW;
      if (cz > AZ1 - 14) break;
      cbox(zb, cx - 0.6, 0, cz - 0.6, cx + 0.6, CEIL, cz + 0.6, conc, { skip: FACE.PY | FACE.NY, sub: 2 });
    }
  }

  // ---- seats
  const r = zb.rng;
  const [k0, k1] = kRange(RZ0, ROW, zb.z0, zb.z1);
  for (let k = Math.max(0, k0); k <= k1; k++) {
    if (!rowExists(k)) continue;
    const z = RZ0 + k * ROW;
    for (let b = 0; b < nBlocks; b++) {
      const bx = blockX(b);
      if (bx > zb.x1 || bx + BW < zb.x0) continue;
      for (const [x0, n] of rowRuns(b, z)) {
        const cx = x0 + n * P / 2;
        if (!owns(zb, cx, z)) continue;
        zb.prop('e_seat_row', cx, 0, z, Math.PI, { n });
        // aisle step lights on the end standards, every other row
        if (k % 2 === 0) {
          if (x0 === bx) zb.decal(x0 - 0.035, 0.22, z, 'nx', 0.1, 0.06, 'e_aisle_led', { lit: false, glow: 0.95 });
          if (x0 + n * P >= bx + BW - 0.01) zb.decal(x0 + n * P + 0.035, 0.22, z, 'px', 0.1, 0.06, 'e_aisle_led', { lit: false, glow: 0.95 });
        }
      }
    }
  }

  // ---- floor: damp patches, dropped programmes, stains
  for (let n = 0; n < 26; n++) {
    const x = r.range(zb.x0, zb.x1), z = r.range(zb.z0, zb.z1);
    if (!inChamber(x, z) || (x > BOOTH.x0 - 1 && x < BOOTH.x1 + 1 && z > BOOTH.z0 - 1 && z < BOOTH.z1 + 1)) continue;
    const u = r.next();
    if (u < 0.45) zb.decal(x, 0, z, 'up', r.range(1.2, 3.2), r.range(1.2, 3.2), 'dec_puddle', { rot: r.range(0, 6.28) });
    else if (u < 0.75) zb.decal(x, 0, z, 'up', r.range(0.8, 2), r.range(0.8, 2), 'dec_stain2', { rot: r.range(0, 6.28) });
    else zb.decal(x, 0, z, 'up', 0.32, 0.32, 'dec_paper', { rot: r.range(0, 6.28) });
  }

  // ---- sparse cold lights hanging out of the mist, low over the aisles
  const LX = PER * 2, LZ = ROWS_PER * ROW;
  const [i0, i1] = kRange(BX0 + BW + AISLE / 2, LX, zb.x0, zb.x1);
  const [j0, j1] = kRange(RZ0 + 9 * ROW, LZ, zb.z0, zb.z1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = BX0 + BW + AISLE / 2 + i * LX, z = RZ0 + 9 * ROW + j * LZ + (hr(i, j, 3) - 0.5) * 8;
    if (!inChamber(x, z) || !owns(zb, x, z)) continue;
    const u = hr(i, j, 7);
    if (u < 0.22) continue;
    const ch = u > 0.9 ? 5 + Math.floor(hr(i, j, 9) * 3) : 0;
    zb.fixture(x, z, 'bulb', true, { y: CEIL, hang: CEIL - 4.4, ch });
    zb.light(x, 4.0, z, { rad: 8.5, int: 0.62, color: [0.74, 0.84, 1.0], ch });
    if (u > 0.6) zb.emitter(x, 4, z, 'hum_strip', { vol: 0.12, rad: 7 });
  }
  if (owns(zb, (zb.x0 + zb.x1) / 2, (zb.z0 + zb.z1) / 2) && r.chance(0.5)) zb.emitter((zb.x0 + zb.x1) / 2, 3, (zb.z0 + zb.z1) / 2, 'drone', { vol: 0.18, rad: 24 });
}

// closed double doors with a lit EXIT sign; (dx, dz) points into the chamber
function exitDoors(zb, x, z, dx, dz) {
  const px = x + dx * 0.04, pz = z + dz * 0.04;
  if (!owns(zb, px, pz)) return;
  const rot = facing(dx, dz);
  const tx = -dz, tz = dx; // along the wall
  for (const s of [-1, 1]) zb.prop('door', px + tx * 0.43 * s, 0, pz + tz * 0.43 * s, rot, { tex: 'door_metal' });
  zb.prop('exit_sign', x + dx * 0.06, 2.55, z + dz * 0.06, rot, {});
}

function dressBooth(zb, v) {
  // dark control-room windows and a lamp over each door
  const H = v.H;
  zb.decal(v.ox + 2.0, 1.75, v.z1, 'pz', 1.6, 0.7, 'window_dark');
  zb.decal(v.ox + 1.0, 1.75, v.z0, 'nz', 1.6, 0.7, 'window_dark');
  for (const zz of [v.oz + 1.5, v.oz + 5.5]) {
    zb.decal(v.x0, 1.75, zz, 'nx', 2.2, 0.7, 'window_dark');
    zb.decal(v.x1, 1.75, zz, 'px', 2.2, 0.7, 'window_dark');
  }
  const [sx, sz] = v.southDoor, [nx, nz] = v.northDoor;
  zb.fixture(sx, sz - 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(sx, H - 0.6, sz + 0.2, { rad: 6, int: 0.55, color: [0.8, 0.88, 1.0] });
  zb.fixture(nx, nz + 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(nx, H - 0.6, nz - 0.2, { rad: 6, int: 0.55, color: [0.8, 0.88, 1.0] });
  zb.decal(v.ox + 1.6, 2.5, v.z1, 'pz', 0.5, 0.5, 'sign_staff');
}

defineZone('p_auditorium', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.concrete, floorMat: M.concrete_floor, ceilMat: M.concrete_dark, ceilH: CEIL,
    ambient: [0.19, 0.2, 0.235],
    env: env({ fog: [0.6, 0.625, 0.655], fogNear: 1.5, fogFar: 16, hum: 0.0, hvac: 0.15, reverb: 'auditorium', tone: 'void' }),
  }),
  gen: genAuditorium,
});
