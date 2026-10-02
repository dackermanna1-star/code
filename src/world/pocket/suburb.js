// Pocket 5: The Scaffolded Suburb. A warehouse the size of a district, dark all the way up.
// Two storey vinyl-sided houses sit on giant pallets in cargo racking four or five tiers high,
// stacked like inventory, every one of them with its lights on. Aisles are wide as streets.
// The return vestibule is disguised as a sales office standing at the crossing of two streets.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { M, env } from '../gen/common.js';
import { defineMaterial } from '../materials.js';
import { voidAll, shelledReturn, hr } from './e_util.js';
import './ei_house.js';
import { genRacks, LAT, blockX0, runZ0 } from './ei_rack.js';

const ID = 5;
const ENTRY = { level: 0, ox: 159, oz: 144 };
definePocket(ID, { name: 'suburb', zoneType: 'p_suburb', sign: 'ei_sign_inventory', entry: ENTRY });

defineMaterial('ei_deck', 'ei_deck', { s: 1.6, surf: 'wood', stain: 0.1 });

function genSuburb(zb) {
  const lev = zb.zone.level;
  if (lev !== 0) { voidAll(zb); return; }
  zb.noConnectivity = true;
  zb.ceil.fill(NaN);
  // the sales office (return vestibule) at the crossing of two streets
  const office = shelledReturn(zb, ID, ENTRY, {
    floorMat: M.sidewalk, shellMat: M.siding, height: 3.1, roofMat: M.shingles, roofOver: 0.45, roofT: 0.25,
  });
  if (office) dressOffice(zb, office);
  genRacks(zb);
  floorPaint(zb);
  // sound: a low drone from the whole place, a transformer humming somewhere in the racks
  const cx = Math.floor((zb.x0 + zb.x1) / 2) + 0.5, cz = Math.floor((zb.z0 + zb.z1) / 2) + 0.5;
  zb.emitter(cx, 3, cz, 'drone', { vol: 0.2, rad: 40 });
  if (hr(zb.x0, zb.z0, 77) < 0.7) zb.emitter(cx + 11, 2, cz - 9, 'transformer', { vol: 0.14, rad: 14 });
}

// lane paint along both faces of every rack run, oil patches on the concrete
function floorPaint(zb) {
  const { AW, BW, PX, PZ, RL, BAY, NB, RD } = LAT;
  const iLo = Math.floor((zb.x0 - (LAT.AX0 + AW / 2) - BW) / PX), iHi = Math.ceil((zb.x1 - (LAT.AX0 + AW / 2)) / PX);
  const jLo = Math.floor((zb.z0 - (LAT.ZC0 + LAT.CW / 2) - RL) / PZ), jHi = Math.ceil((zb.z1 - (LAT.ZC0 + LAT.CW / 2)) / PZ);
  for (let j = jLo; j <= jHi; j++) for (let i = iLo; i <= iHi; i++) {
    const x0 = blockX0(i), z0 = runZ0(j);
    for (let b = 0; b < NB; b++) {
      const cz = z0 + (b + 0.5) * BAY;
      for (const x of [x0 - 0.95, x0 + 2 * RD + 0.95]) {
        if (!zb.in(Math.floor(x), Math.floor(cz))) continue;
        zb.decal(x, 0, cz, 'up', 0.2, BAY - 0.5, 'ei_line', { lit: true });
      }
    }
  }
  const r = zb.rng;
  for (let n = 0; n < 14; n++) {
    const x = r.range(zb.x0 + 1, zb.x1 - 1), z = r.range(zb.z0 + 1, zb.z1 - 1);
    if (x > ENTRY.ox - 3 && x < ENTRY.ox + 7 && z > ENTRY.oz - 3 && z < ENTRY.oz + 12) continue;
    const s = r.range(1.2, 3.4);
    zb.decal(x, 0, z, 'up', s, s * r.range(0.8, 1.3), r.chance(0.55) ? 'dec_puddle' : 'dec_stain2', { rot: r.range(0, 6.28) });
  }
}

// the office is a tiny house of its own: lit windows, a lamp and a sign over each door
function dressOffice(zb, v) {
  const H = v.H;
  for (const zz of [v.oz + 1.5, v.oz + 5.5]) {
    zb.decal(v.x0, 1.55, zz, 'nx', 1.3, 1.0, 'window_lit', { lit: false, glow: 0.95 });
    zb.decal(v.x1, 1.55, zz, 'px', 1.3, 1.0, 'window_lit', { lit: false, glow: 0.95 });
  }
  zb.decal(v.ox + 2.0, 1.7, v.z1, 'pz', 1.0, 0.9, 'window_lit', { lit: false, glow: 0.95 });
  zb.decal(v.ox + 1.0, 1.7, v.z0, 'nz', 1.0, 0.9, 'window_lit', { lit: false, glow: 0.95 });
  const [sx, sz] = v.southDoor, [nx, nz] = v.northDoor;
  zb.fixture(sx, sz - 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(sx, H - 0.6, sz + 0.3, { rad: 7, int: 0.6, color: [1, 0.86, 0.6] });
  zb.fixture(nx, nz + 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(nx, H - 0.6, nz - 0.3, { rad: 7, int: 0.6, color: [1, 0.86, 0.6] });
  zb.decal(v.ox + 0.5, 2.55, v.z1, 'pz', 0.7, 0.7, 'ei_sign_office');
  zb.decal(v.ox + 2.5, 2.55, v.z0, 'nz', 0.7, 0.7, 'ei_sign_office');
  zb.prop('mailbox', v.ox + 2.9, 0, v.z1 + 0.9, Math.PI, {});
}

defineZone('p_suburb', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.siding, floorMat: M.concrete_floor, ceilMat: M.concrete_dark, ceilH: 6,
    ambient: [0.125, 0.13, 0.165],
    env: env({ fog: [0.012, 0.014, 0.024], fogNear: 4, fogFar: 52, hum: 0.1, hvac: 0.35, reverb: 'warehouse', tone: 'industrial' }),
  }),
  gen: genSuburb,
});
