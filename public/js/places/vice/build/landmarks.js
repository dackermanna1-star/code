// The landmarks: the safehouse, the hospitals, the police stations, the gun shops, the Pay 'n' Spray,
// the marina, Vice Arena, the ballpark, Liberty Tower, the Government Center, the port's sheds and
// cruise terminal, the airport, the Watson Island heliport and Star Island's mansions. Each claims its
// ground (C.reserve) before the blocks are filled, and records where it is and where its door is
// (city.places[id] = {x, z, door: {x, z, heading}, kind, name}; heading points out of the door).
import { PLACES } from '../world/layout.js';
import { M, WIN, GF, MID, NEAR, BASE, paint, flat, neon, fabric, glassOf, metalOf, pick, rr, ri, parapet, roofKit, awning, canopy, cafe, pool, parkingLot, lowWall, fence, door, tube, roundRect, NEON, mat } from './parts.js';
import { decoHotel } from './deco.js';
import { tower, offsetPoly } from './towers.js';
import { MURALS } from './materials.js';

const PL = Object.fromEntries(PLACES.map((p) => [p.id, p]));

/** The block containing (x, z), or the nearest one. */
function blockAt(C, x, z) {
  let best = null, bd = Infinity;
  for (const b of C.plan.blocks) {
    const d = Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
/** A lot record for a landmark: a world rectangle and the direction its front faces. */
function lotRect(x0, z0, x1, z1, yaw, seed, extra = {}) {
  const ns = Math.abs(Math.sin(yaw)) < 0.5;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: ns ? x1 - x0 : z1 - z0, d: ns ? z1 - z0 : x1 - x0, yaw, x0, z0, x1, z1, seed, street: { cls: 'ave', name: '' }, cornerL: false, cornerR: false, ...extra };
}
/** The world point in front of a lot's front face (on the sidewalk) and the heading out of it. */
function frontDoor(lot, out = 4, along = 0) {
  const fx = Math.sin(lot.yaw), fz = Math.cos(lot.yaw), rx = Math.cos(lot.yaw), rz = -Math.sin(lot.yaw);
  return { x: lot.x + fx * (lot.d / 2 + out) + rx * along, z: lot.z + fz * (lot.d / 2 + out) + rz * along, heading: lot.yaw };
}
const E = Math.PI / 2, W = -Math.PI / 2, N = Math.PI, S = 0;

export function buildLandmarks(C) {
  const jobs = [viceTower, atlantis, brickellKey, safehouse, hospitalBeach, hospitalJackson, policeHQ, policeBeach, gunshops, sprayShop, marina, arena, ballpark, libertyTower, govCenter, port, airport, heliport, starIsland];
  for (const f of jobs) { try { f(C); } catch (e) { console.warn('city: landmark failed', f.name, e); } }
}

// ---- Vice Tower: a downtown office tower crowned by three stepped arcs that light up at night ----------------------
function viceTower(C) {
  const b = blockAt(C, -37, -860);
  const z0 = b.z0, z1 = Math.min(b.z1, b.z0 + 190);
  C.reserve(b.x0, z0, b.x1, z1);
  const K = C.K, r = C.rng(8701);
  const lot = lotRect(b.x0, z0, b.x1, z1, S, 8701);
  K.begin(lot.x, C.GROUND, lot.z, S, 8701, { kind: 'vicetower' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 2;
  // a podium of shops and the lobby
  K.facade({ kind: WIN.office, fh: 11, bw: 10, v0: 16, gk: GF.lobby, occ: 0.5 });
  K.box(0, 14, 0, hw, 14, hd, mat('cladding', 0xd8d4cc), { top: M.membrane });
  // the shaft: blue glass, its corners notched
  const sw = 34, sd = 26, H = 430;
  K.facade({ kind: WIN.curtain, fh: 12, bw: 6, v0: 28, occ: 0.5 });
  K.prism([[-sw, sd - 6], [-sw + 6, sd], [sw - 6, sd], [sw, sd - 6], [sw, -sd + 6], [sw - 6, -sd], [-sw + 6, -sd], [-sw, -sd + 6]], 28, H, mat('whiteTiles', 0x4a7898, { p: 5, r: 0.25 }), { col: 'box', top: M.membrane, fit: 'wall' });
  K.facade(null);
  canopy(K, 0, 13, hd, 30, 8, metalOf(0x3a3e44), { glow: 0xfff0d8, t: 0.8 });
  door(K, 0, 0, hd, 10, 10, glassOf(0x24323c), M.steel);
  // the crown: three half-discs stepping down towards the front, each edged in light
  const cols = [0xff3aa0, 0x3ad8ff, 0xffffff];
  for (let i = 0; i < 3; i++) {
    const R = sw - i * 5, zc = -sd + 10 + i * 16, y0 = H + 2 - i * 22, n = 14;
    const m = mat('whiteTiles', 0xe8eef2, { p: 5, r: 0.3 });
    K.at(BASE, () => {
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n;
        const p0 = [Math.cos(a0) * R, y0 + Math.sin(a0) * R], p1 = [Math.cos(a1) * R, y0 + Math.sin(a1) * R];
        // the curved top, the front and the back
        K.quad([p0[0], p0[1], zc + 7], [p0[0], p0[1], zc - 7], [p1[0], p1[1], zc - 7], [p1[0], p1[1], zc + 7], m);
        K.tri([0, y0, zc + 7], [p0[0], p0[1], zc + 7], [p1[0], p1[1], zc + 7], m);
        K.tri([0, y0, zc - 7], [p1[0], p1[1], zc - 7], [p0[0], p0[1], zc - 7], m);
      }
    });
    K.at(MID, () => {
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n;
        tube(K, [Math.cos(a0) * (R + 0.3), y0 + Math.sin(a0) * (R + 0.3), zc + 7.2], [Math.cos(a1) * (R + 0.3), y0 + Math.sin(a1) * (R + 0.3), zc + 7.2], cols[i], 0.5);
      }
    });
  }
  K.at(MID, () => K.cyl(0, -sd + 10, 0.6, H + 2 + sw, H + 2 + sw + 40, M.steel, { seg: 6, win: false }));
  K.sign(0, 22, hd + 0.2, 30, 3, 'VICE TOWER', 'letters', { color: 0xe8e4dc, tier: MID });
  for (let i = 0; i < 6; i++) { const q = K.world(rr(r, -hw, hw), 0, hd + 8); C.ped(q[0], q[2]); }
  K.end();
  C.place('vicetower', { x: lot.x, z: lot.z, kind: 'landmark', name: 'Vice Tower', door: { x: lot.x, z: lot.z1 + 6, heading: S } });
}

// ---- Atlantis: a Brickell condo slab with a square hole through it, a palm and a red spiral stair in the hole -----
function atlantis(C) {
  const b = blockAt(C, 382, 1150);
  const K = C.K;
  C.reserve(b.x0, b.z0, b.x1, b.z1);
  const lot = lotRect(b.x0, b.z0, b.x1, b.z1, E, 8801);
  K.begin(lot.x, C.GROUND, lot.z, E, 8801, { kind: 'atlantis' });
  const hw = Math.min(lot.w / 2 - 6, 60), hd = 14, H = 220, h1 = 120, h2 = 160, hole = 22;
  const glass = mat('whiteTiles', 0x3a78b0, { p: 5, r: 0.2 }), wall = paint(0xf6f6f2, 0.3, 0.1);
  K.facade({ kind: WIN.curtain, fh: 10, bw: 7, v0: 12, gk: GF.lobby, occ: 0.5 });
  K.box(0, h1 / 2, 0, hw, h1 / 2, hd, glass, { top: M.membrane });
  K.box(0, (h2 + H) / 2, 0, hw, (H - h2) / 2, hd, glass, { top: M.membrane, bottom: true });
  K.box(-(hw + hole) / 2, (h1 + h2) / 2, 0, (hw - hole) / 2, (h2 - h1) / 2, hd, glass, { top: false, skip: 'py' });
  K.box((hw + hole) / 2, (h1 + h2) / 2, 0, (hw - hole) / 2, (h2 - h1) / 2, hd, glass, { top: false, skip: 'py' });
  K.facade(null);
  // the hole's floor, the red spiral stair, yellow balconies down one side, a red triangle on the roof
  K.at(MID, () => {
    K.box(0, h1 + 0.4, 0, hole, 0.4, hd, M.tiles, { col: false, win: false });
    for (let i = 0; i < 28; i++) { const a = i * 0.45, y = h1 + 1 + i * 1.35; K.box(Math.cos(a) * 4, y, Math.sin(a) * 4, 2.4, 0.2, 0.9, flat(0xd8282a), { col: false, win: false, yaw: -a }); }
    K.cyl(0, 0, 0.6, h1, h2, flat(0xd8282a), { seg: 8, win: false });
    for (let i = 1; i < 20; i++) K.box(hw - 10, i * 10.5 + 1, hd + 2, 9, 0.35, 2, flat(0xf2c81a), { col: false, win: false });
  });
  K.at(BASE, () => {
    const t = H + 30, f = hd - 2;
    for (const z of [f, -f]) K.tri([-hw * 0.5, H, z], [hw * 0.5, H, z], [0, t, z], flat(0xd8282a), { both: true });
    K.quad([-hw * 0.5, H, f], [0, t, f], [0, t, -f], [-hw * 0.5, H, -f], flat(0xd8282a), { both: true });
    K.quad([0, t, f], [hw * 0.5, H, f], [hw * 0.5, H, -f], [0, t, -f], flat(0xd8282a), { both: true });
  });
  const q = K.world(0, 0, 0); V_palm(C, q[0], C.GROUND + h1 + 0.8, q[2] + 8, 1.3);
  K.sign(0, 9, hd + 0.2, 24, 2.6, 'THE ATLANTIS', 'letters', { color: 0x1d4e89, tier: MID });
  K.end();
  C.place('atlantis', { x: lot.x, z: lot.z, kind: 'landmark', name: 'The Atlantis', door: { x: lot.x1 + 6, z: lot.z, heading: E } });
}
function V_palm(C, x, y, z, s) { C.palmAt?.(x, y, z, s); }

// ---- Brickell Key: a cluster of condo towers on the island ----------------------------------------------------------
function brickellKey(C) {
  const cands = [];
  for (let x = 700; x <= 900; x += 10) for (let z = 110; z <= 330; z += 10) cands.push([x, z]);
  const r = C.rng(8601);
  let n = 0;
  // the biggest footprints first, nearest the island's middle
  cands.sort((a, b) => Math.hypot(a[0] - 800, a[1] - 220) - Math.hypot(b[0] - 800, b[1] - 220));
  for (const half of [30, 26, 22, 20]) for (const [x, z] of cands) {
    if (n >= 4) break;
    if (!C.clear(x - half - 4, z - half - 4, x + half + 4, z + half + 4)) continue;
    const yaw = Math.atan2(800 - x, 220 - z) + Math.PI; // its back to the middle of the island
    const lot = lotRect(x - half, z - half, x + half, z + half, Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2), 8601 + n);
    C.reserve(x - half - 6, z - half - 6, x + half + 6, z + half + 6);
    tower(C, lot, r, { H: rr(r, 220, 400), type: n % 2 ? 'resi' : 'glass', shape: pick(r, ['round', 'cyl', 'chamfer']), podium: 0 });
    n++;
  }
  C.place('brickellkey', { x: 800, z: 220, kind: 'island', name: 'Brickell Key', door: { x: 790, z: 240, heading: S } });
}

// ---- the safehouse: a deco hotel on Washington Ave with a pool court behind ----------------------------------------
function safehouse(C) {
  const p = PL.safehouse, b = blockAt(C, p.x, p.z);
  const z0 = p.z - 42, z1 = p.z + 42;
  const lot = lotRect(b.x0, z0, b.x0 + 38, z1, W, 4242, { street: { cls: 'ave', name: 'Washington Ave' }, cornerL: false, cornerR: false });
  C.reserve(b.x0, z0 - 2, b.x1, z1 + 2);
  const r = C.rng(4242);
  decoHotel(C, lot, r, { name: 'Hotel Marisol', short: 'MARISOL', wall: 0x9fe8dc, accent: 0xe8507a, neon: 0xff3aa0, floors: 3, crown: 'fin', main: true, setback: 2, win: WIN.punched });
  // the pool court behind (where you start)
  const K = C.K;
  K.begin((b.x0 + 38 + b.x1) / 2, C.GROUND, p.z, 0, 4243, { kind: 'court' });
  const hx = (b.x1 - b.x0 - 38) / 2 - 1, hz = 40;
  K.at(MID, () => K.box(0, 0.2, 0, hx, 0.2, hz, M.herring, { col: false, win: false }));
  pool(K, hx * 0.2, 22, Math.min(hx * 0.6, 11), 9, 0.4);
  lowWall(K, -hx, -hz, hx, -hz, 0, 7, 1, paint(0x9fe8dc, 0.4));
  lowWall(K, -hx, hz, hx, hz, 0, 7, 1, paint(0x9fe8dc, 0.4));
  lowWall(K, hx, -hz, hx, -8, 0, 7, 1, paint(0x9fe8dc, 0.4));
  lowWall(K, hx, 8, hx, hz, 0, 7, 1, paint(0x9fe8dc, 0.4));
  cafe(K, C.rng(9), -hx + 2, -hz + 4, hx - 4, -6, 0.4, [0xff7aa8, 0xffffff, 0x2bb5b0]);
  for (const [x, z] of [[-hx + 4, 34], [hx - 4, 34], [hx - 4, -34]]) { const q = K.world(x, 0, z); C.palm(q[0], q[2], 1.1, 0.06); }
  // a gate out to Collins
  K.sign(hx + 0.6, 9, 0, 10, 2, 'MARISOL', 'neonDeco', { color: 0xff3aa0, yaw: E });
  K.end();
  C.place('safehouse', { x: p.x, z: p.z, kind: 'safehouse', name: 'Hotel Marisol', door: { x: b.x0 - 4, z: p.z, heading: W }, court: { x: (b.x0 + 38 + b.x1) / 2, z: p.z } });
}

// ---- hospitals -------------------------------------------------------------------------------------------------------
function hospital(C, lot, name, seed, o = {}) {
  const K = C.K, r = C.rng(seed);
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, seed, { kind: 'hospital' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 2;
  const white = paint(0xf6f6f2, 0.3, 0.2), blue = glassOf(0x5a8ab0);
  const floors = o.floors ?? 9, fh = 11, g = 15, H = g + (floors - 1) * fh;
  // the main slab and a low wing
  const sw = hw * 0.85, sd = Math.min(hd * 0.42, 34), sz = hd - sd - 22;
  K.facade({ kind: WIN.ribbon, fh, bw: 10, v0: g, gk: GF.lobby, occ: 0.85, variant: 2 });
  K.prism(roundRect(-sw, sz - sd, sw, sz + sd, [12, 12, 0, 0], 4), 0, H, white, { col: true, top: M.membrane, fit: 'wall' });
  K.facade({ kind: WIN.office, fh: 11, bw: 9, v0: g, gk: GF.lobby, occ: 0.7, variant: 4 });
  K.box(0, (g + 11) / 2, hd - 11, hw, (g + 11) / 2, 11, white, { top: M.membrane });
  K.facade(null);
  // blue glass bands up the slab, a helipad on top
  K.at(MID, () => {
    for (const s of [-1, 1]) K.box(s * sw * 0.5, (g + H) / 2, sz + sd + 0.4, 5, (H - g) / 2, 0.5, blue, { col: false, win: false });
    parapet(K, -sw, sz - sd, sw, sz + sd, H, 2, 0.5, white, null);
  });
  K.at(BASE, () => K.cyl(sw * 0.4, sz, 16, H + 3, H + 4.5, mat('concrete', 0x5a5e62, { p: 5 }), { seg: 16, win: false }));
  K.at(MID, () => {
    const m = flat(0xffffff);
    K.box(sw * 0.4 - 4, H + 4.55, sz, 0.9, 0.05, 6, m, { col: false, win: false }); K.box(sw * 0.4 + 4, H + 4.55, sz, 0.9, 0.05, 6, m, { col: false, win: false }); K.box(sw * 0.4, H + 4.55, sz, 4, 0.05, 0.9, m, { col: false, win: false });
    K.prism(roundRect(sw * 0.4 - 15, sz - 15, sw * 0.4 + 15, sz + 15, [15, 15, 15, 15], 4), H + 4.5, H + 4.7, neon(0xff3030, 0.5), { win: false, top: false });
  });
  // the emergency entrance: a canopy with a red sign
  canopy(K, hw * 0.55, g - 2.5, hd, 26, 14, M.white, { glow: 0xfff6e8, cols: true, t: 1 });
  K.sign(hw * 0.55, g + 0.5, hd + 14.2, 20, 2.6, 'EMERGENCY', 'hospital', { tier: MID });
  K.sign(-hw * 0.3, g + 6, hd + 0.15, Math.min(hw * 1.2, name.length * 1.9), 3.4, name.toUpperCase(), 'hospital', { tier: MID });
  K.sign(0, H - 6, sz + sd + 0.15, 9, 9, '+', 'hospital', { tier: MID, font: 'block' });
  door(K, -hw * 0.3, 0, hd, 10, 10, glassOf(0x2a3a44), M.steel);
  const amb = K.world(hw * 0.55, 0, hd + 6);
  C.city.spawnPoints.ambulance = C.city.spawnPoints.ambulance || [];
  C.city.spawnPoints.ambulance.push({ x: amb[0], z: amb[2], heading: lot.yaw + Math.PI / 2 });
  parkingLot(C, K, -hw, hd - 20 + 0, hw * 0.2, hd + 0, 0);
  K.end();
  return { door: frontDoor(lot, 4, -lot.w / 2 * 0.3 * (1 / 1)) };
}
function hospitalBeach(C) {
  const p = PL.hospital, b = blockAt(C, 1990, p.z);
  // the dry part of the bay-front block west of Alton Road
  let x0 = b.x1 - 10;
  while (x0 > b.x0 && C.landOK(x0 - 10, b.z0 + 4, x0, b.z1 - 4, 4)) x0 -= 10;
  const lot = lotRect(x0 + 4, b.z0, b.x1, b.z1, E, 7101);
  C.reserve(lot.x0, lot.z0, lot.x1, lot.z1);
  const r = hospital(C, lot, 'Mount Sinai Medical', 7101, { floors: 8 });
  C.place('hospital', { x: p.x, z: p.z, kind: 'hospital', name: p.name, door: { x: lot.x1 + 4, z: lot.z + lot.w * 0.3 * 0, heading: E } });
  void r;
}
function hospitalJackson(C) {
  const p = PL.hospital2, b = blockAt(C, p.x, p.z);
  const lot = lotRect(b.x0, b.z0, b.x1, b.z0 + 220, E, 7202);
  C.reserve(lot.x0, lot.z0, lot.x1, lot.z1);
  hospital(C, lot, 'Jackson Memorial', 7202, { floors: 12 });
  // a parking garage on the rest of the block
  const K = C.K;
  const gz0 = b.z0 + 230, gz1 = b.z1;
  if (gz1 - gz0 > 60) {
    C.reserve(b.x0, gz0, b.x1, gz1);
    K.begin((b.x0 + b.x1) / 2, C.GROUND, (gz0 + gz1) / 2, E, 7203, { kind: 'garage' });
    garage(C, K, (gz1 - gz0) / 2 - 2, (b.x1 - b.x0) / 2 - 2, 5);
    K.end();
  }
  C.place('hospital2', { x: p.x, z: p.z, kind: 'hospital', name: p.name, door: { x: b.x1 + 4, z: lot.z, heading: E } });
}
/** A parking garage in the current frame: half sizes hw (along the front) and hd, n decks. */
function garage(C, K, hw, hd, n) {
  const fh = 10, H = n * fh, m = mat('concrete', 0xdcd6cc, { grime: 0.6 });
  for (let i = 0; i <= n; i++) K.box(0, i * fh + 0.5, 0, hw, 0.5, hd, m, { col: i > 0, win: false });
  K.at(MID, () => { for (let i = 1; i <= n; i++) { const y = i * fh - fh + 1; K.box(0, y + 1.7, hd - 0.3, hw, 1.7, 0.3, m, { col: false, win: false }); K.box(0, y + 1.7, -hd + 0.3, hw, 1.7, 0.3, m, { col: false, win: false }); K.box(hw - 0.3, y + 1.7, 0, 0.3, 1.7, hd, m, { col: false, win: false }); K.box(-hw + 0.3, y + 1.7, 0, 0.3, 1.7, hd, m, { col: false, win: false }); } });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box(x * (hw - 1.5), H / 2, z * (hd - 1.5), 1.2, H / 2, 1.2, m, { col: true, win: false });
  K.box(0, H / 2 + 2, 0, 8, H / 2 + 2, 8, m, { col: true, win: false });
  K.sign(0, fh * 1.5, hd + 0.4, 18, 3.2, 'PARKING', 'box', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
  for (let x = -hw + 12; x < hw - 10; x += 12) { const p = K.world(x, 0, hd - 10); C.park(p[0], p[2], K.w.yaw); }
}

// ---- police stations -----------------------------------------------------------------------------------------------------
function station(C, lot, seed, o) {
  const K = C.K, r = C.rng(seed);
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, seed, { kind: 'police' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 2, floors = o.floors, fh = 11, g = 14, H = g + (floors - 1) * fh;
  const wall = o.deco ? paint(0xf2f4f6, 0.45, 0.15) : mat('cladding', 0xd8dce0);
  const bd = Math.min(hd * 2, o.depth ?? 50);
  K.facade({ kind: o.deco ? WIN.punched : WIN.office, fh, bw: 9, v0: g, gk: GF.lobby, occ: 0.75, variant: 5 });
  K.prism(roundRect(-hw, hd - bd, hw, hd, o.deco ? [9, 9, 0, 0] : [0, 0, 0, 0], 4), 0, H, wall, { col: true, top: M.membrane, fit: 'wall' });
  K.facade(null);
  const blue = flat(0x14306e);
  K.at(MID, () => {
    parapet(K, -hw, hd - bd, hw, hd, H, 2.2, 0.5, wall, M.trim);
    K.box(0, g - 0.8, hd + 0.25, hw + 0.25, 0.8, 0.3, blue, { col: false, win: false });
    if (o.deco) { K.box(0, H + 5, hd - 1, 10, 5, 1, wall, { col: false, win: false }); tube(K, [-hw + 9, H + 2.6, hd + 0.2], [hw - 9, H + 2.6, hd + 0.2], 0x3a8aff, 0.2); }
  });
  canopy(K, 0, g - 2.2, hd, 22, 8, blue, { glow: 0xe8f0ff, cols: true, t: 0.8 });
  door(K, 0, 0, hd, 9, 9.5, glassOf(0x24323c), M.steel);
  K.sign(0, o.deco ? H + 5 : g + 3.2, hd + (o.deco ? -0.0 : 0.3), Math.min(hw * 1.6, 44), o.deco ? 3.6 : 3.2, o.name, 'police', { tier: MID });
  K.sign(0, H - 4, hd + 0.2, 14, 3, 'VCPD', 'police', { tier: MID });
  // a flagpole and the blue lights by the door
  K.at(MID, () => { K.cyl(hw - 6, hd + 10, 0.3, 0, 36, M.steel, { seg: 6, win: false }); K.box(hw - 6 + 3, 33, hd + 10, 3, 1.8, 0.05, flat(0xf4f4f4), { col: false, win: false }); });
  for (const s of [-1, 1]) K.at(MID, () => K.box(s * 5.5, 9, hd + 8.2, 0.4, 0.4, 0.4, neon(0x3a6aff), { col: false, win: false }));
  // the car park, with police cars waiting
  C.city.spawnPoints.police = C.city.spawnPoints.police || [];
  const lot0 = o.parkZ0 ?? -hd, lot1 = hd - bd - 6;
  if (lot1 - lot0 > 30) {
    parkingLot(C, K, -hw, lot0, hw, lot1, 0);
    for (let x = -hw + 8; x < hw - 8; x += 14) { const q = K.world(x, 0, (lot0 + lot1) / 2); C.city.spawnPoints.police.push({ x: q[0], z: q[2], heading: lot.yaw }); }
    fence(K, -hw, lot0, hw, lot0, 0, 7);
  }
  for (let i = 0; i < 4; i++) { const q = K.world(rr(r, -hw + 4, hw - 4), 0, hd + 6); C.ped(q[0], q[2]); }
  K.end();
}
function policeHQ(C) {
  const p = PL.police, b = blockAt(C, p.x, p.z);
  const lot = lotRect(b.x0, b.z0, b.x1, b.z1, S, 7301);
  C.reserve(b.x0, b.z0, b.x1, b.z1);
  station(C, lot, 7301, { floors: 7, name: 'VICE CITY POLICE DEPARTMENT', depth: 90 });
  C.place('police', { x: p.x, z: p.z, kind: 'police', name: p.name, door: { x: lot.x, z: b.z1 + 4, heading: S } });
}
function policeBeach(C) {
  const p = PL.police2, b = blockAt(C, p.x, p.z);
  const lot = lotRect(b.x0, b.z0, b.x1, b.z1, E, 7302);
  C.reserve(b.x0, b.z0, b.x1, b.z1);
  station(C, lot, 7302, { floors: 2, name: 'VCPD BEACH PATROL', deco: true, depth: 44 });
  C.place('police2', { x: p.x, z: p.z, kind: 'police', name: p.name, door: { x: b.x1 + 4, z: lot.z, heading: E } });
}

// ---- Ammu-Vice and Pay 'n' Spray ----------------------------------------------------------------------------------------
function gunshops(C) {
  for (const id of ['gunshop', 'gunshop2']) {
    const p = PL[id], b = blockAt(C, p.x, p.z);
    // face the nearest side's street
    const ds = { n: p.z - b.z0, s: b.z1 - p.z, e: b.x1 - p.x, w: p.x - b.x0 };
    const side = Object.keys(ds).sort((a, c) => ds[a] - ds[c])[0];
    const yaw = { n: N, s: S, e: E, w: W }[side];
    const wdt = 46, dep = 40;
    let x0, z0, x1, z1;
    if (side === 'n' || side === 's') { x0 = Math.max(b.x0, Math.min(b.x1 - wdt, p.x - wdt / 2)); x1 = x0 + wdt; z0 = side === 'n' ? b.z0 : b.z1 - dep; z1 = z0 + dep; }
    else { z0 = Math.max(b.z0, Math.min(b.z1 - wdt, p.z - wdt / 2)); z1 = z0 + wdt; x0 = side === 'w' ? b.x0 : b.x1 - dep; x1 = x0 + dep; }
    const lot = lotRect(x0, z0, x1, z1, yaw, id === 'gunshop' ? 7401 : 7402);
    C.reserve(x0, z0, x1, z1);
    const K = C.K;
    K.begin(lot.x, C.GROUND, lot.z, yaw, lot.seed, { kind: 'gunshop' });
    const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1, H = 17;
    const wall = mat('blockWall', 0x8a8e92, { p: 4, grime: 0.6 });
    K.facade({ kind: WIN.none, fh: 11, bw: 12, v0: 14, gk: GF.shop, occ: 0.9 });
    K.box(0, H / 2, 0, hw, H / 2, hd, wall, { top: M.roof });
    K.facade(null);
    K.at(MID, () => {
      parapet(K, -hw, -hd, hw, hd, H, 1.8, 0.5, wall, null);
      K.box(0, 15, hd + 0.4, hw + 0.4, 2.6, 0.5, flat(0x141414), { col: false, win: false });
      // bars over the windows
      for (let x = -hw + 2; x < hw - 1; x += 1.6) K.box(x, 6.5, hd + 0.35, 0.09, 5, 0.09, M.metalDark, { col: false, win: false });
    });
    K.sign(0, 15, hd + 0.95, Math.min(hw * 1.8, 30), 4, 'AMMU-VICE', 'ammu', { tier: MID });
    K.sign(-hw + 6, 8, hd + 0.5, 8, 2, 'GUNS', 'neonDeco', { color: 0xff2a2a, tier: NEAR });
    door(K, hw * 0.5, 0, hd, 5, 8.5, mat('metalSheet', 0x2a2a2a, { p: 9 }), M.metalDark);
    K.end();
    const dr = frontDoor(lot, 4, (lot.w / 2 - 1) * 0.5);
    C.place(id, { x: p.x, z: p.z, kind: 'gunshop', name: 'Ammu-Vice', door: dr });
  }
}
function sprayShop(C) {
  const p = PL.sprayshop, b = blockAt(C, p.x, p.z);
  const lot = lotRect(b.x0 + 30, b.z1 - 70, b.x1 - 30, b.z1, S, 7501);
  C.reserve(b.x0 + 26, b.z1 - 74, b.x1 - 26, b.z1);
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, S, 7501, { kind: 'spray' });
  const hw = lot.w / 2 - 1, hd = lot.d / 2 - 1, H = 24, bay = 30, bh = 17;
  const wall = mat('metalSheet', 0xd8dce0, { p: 9, r: 0.5, grime: 0.5 }), blue = flat(0x2a7fd4);
  // a shed open at the front: walls round three sides, a roof, the bay in the middle
  K.box(0, H / 2, -hd + 0.6, hw, H / 2, 0.6, wall, { win: false });
  K.box(-hw + 0.6, H / 2, 0, 0.6, H / 2, hd, wall, { win: false });
  K.box(hw - 0.6, H / 2, 0, 0.6, H / 2, hd, wall, { win: false });
  K.box(-(hw + bay / 2) / 2, H / 2, hd - 0.6, (hw - bay / 2) / 2, H / 2, 0.6, wall, { win: false });
  K.box((hw + bay / 2) / 2, H / 2, hd - 0.6, (hw - bay / 2) / 2, H / 2, 0.6, wall, { win: false });
  K.box(0, (bh + H) / 2, hd - 0.6, bay / 2, (H - bh) / 2, 0.6, wall, { win: false });
  K.box(0, H + 0.4, 0, hw + 0.5, 0.4, hd + 0.5, M.metal, { win: false, bottom: true });
  K.at(MID, () => {
    K.box(0, 0.06, 0, hw - 1, 0.06, hd - 1, mat('concrete', 0x6a6e72), { col: false, win: false });
    K.box(0, H - 3, hd + 0.1, hw, 3, 0.2, blue, { col: false, win: false });
    // the spray rig: lamps and pipes inside
    for (const x of [-10, 10]) { K.box(x, bh - 1, 0, 0.4, 0.4, hd - 4, M.steel, { col: false, win: false }); K.box(x, bh - 1.6, 0, 1.2, 0.2, hd - 6, neon(0xfff4d8, 0.8), { col: false, win: false }); }
    for (const s of [-1, 1]) K.box(s * (bay / 2 + 0.4), bh / 2, hd + 0.1, 0.4, bh / 2, 0.4, flat(0xffd23a), { col: false, win: false });
  });
  K.sign(0, H - 3, hd + 0.35, 34, 5, "PAY 'N' SPRAY", 'spray', { tier: MID });
  K.end();
  C.place('sprayshop', { x: lot.x, z: lot.z, kind: 'spray', name: "Pay 'n' Spray", door: { x: lot.x, z: lot.z1 + 6, heading: S }, bay: { x: lot.x, z: lot.z, heading: N } });
}

// ---- the marina ---------------------------------------------------------------------------------------------------------
function marina(C) {
  const p = PL.marina, b = blockAt(C, p.x, p.z);
  const K = C.K;
  const z0 = b.z0, z1 = Math.min(b.z0 + 60, b.z1);
  let x0 = b.x0, x1 = b.x1;
  while (x1 - x0 > 40 && !C.landOK(x0, z0, x1, z1, 2)) { x0 += 6; x1 -= 2; }
  const lot = lotRect(x0, z0, x1, z1, N, 7601);
  C.reserve(x0, z0, x1, z1);
  K.begin(lot.x, C.GROUND, lot.z, N, 7601, { kind: 'marina' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 2, g = 13, H = g + 11;
  const wall = paint(0xf8f8f4, 0.4, 0.15), blue = flat(0x1d5e9a);
  K.facade({ kind: WIN.ribbon, fh: 11, bw: 10, v0: g, gk: GF.lobby, occ: 0.7 });
  K.prism(roundRect(-hw, -hd + 8, hw, hd - 6, [10, 10, 10, 10], 4), 0, H, wall, { col: true, top: M.membrane });
  K.facade(null);
  K.at(MID, () => {
    // a wraparound deck upstairs and a curved roof canopy like a sail
    K.prism(offsetPoly(roundRect(-hw, -hd + 8, hw, hd - 6, [10, 10, 10, 10], 4), 4), g - 0.6, g + 0.4, M.deck, { win: false, bottom: true });
    K.prism(offsetPoly(roundRect(-hw, -hd + 8, hw, hd - 6, [10, 10, 10, 10], 4), 3.8), g + 0.4, g + 3.6, M.glass, { win: false, top: false });
    K.prism(offsetPoly(roundRect(-hw, -hd + 8, hw, hd - 6, [10, 10, 10, 10], 4), 5), H + 0.2, H + 1.2, blue, { win: false, bottom: true });
  });
  K.sign(0, H - 4, hd - 5.8, Math.min(hw * 1.7, 34), 3.6, 'SOUTH POINTE MARINA', 'neonDeco', { color: 0x40c8ff, tier: MID });
  cafe(K, C.rng(77), -hw, hd - 4, hw, hd + 2, 0, [0xffffff, 0x1d5e9a]);
  K.end();
  const d = frontDoor(lot, 4);
  C.place('marina', { x: p.x, z: p.z, kind: 'marina', name: p.name, door: d });
}

// ---- Vice Arena ---------------------------------------------------------------------------------------------------------------
function arena(C) {
  const p = PL.arena, b = blockAt(C, p.x, p.z);
  C.reserve(b.x0, b.z0, b.x1, b.z1);
  const K = C.K;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, hx = (b.x1 - b.x0) / 2 - 4, hz = (b.z1 - b.z0) / 2 - 30;
  K.begin(cx, C.GROUND, cz, 0, 7701, { kind: 'arena' });
  // the drum: an oval of glass and white panels
  const oval = (rx, rz, n = 32) => { const o = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; o.push([Math.cos(a) * rx, -Math.sin(a) * rz]); } return o; };
  const H = 62;
  K.facade({ kind: WIN.curtain, fh: 14, bw: 6, v0: 0, occ: 0.7 });
  K.prism(oval(hx, hz), 0, 24, mat('whiteTiles', 0x5a88a8, { p: 5 }), { smooth: 1, top: false });
  K.facade(null);
  K.prism(oval(hx - 2, hz - 2), 24, 30, paint(0xf2f2ee, 0.3), { smooth: 1, top: false, win: false });
  // the roof: rising in steps to a white dome, ribs round it
  K.prism(oval(hx + 2, hz + 2), 30, 34, M.white, { smooth: 1, win: false, bottom: true, top: false });
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([1 - t * t * 0.92, 34 + Math.sin(t * Math.PI / 2) * (H - 34)]); }
  // a stretched dome: rings of the oval, scaled
  K.at(BASE, () => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [s0, y0] = prof[i], [s1, y1] = prof[i + 1];
      const a = oval((hx + 2) * s0, (hz + 2) * s0, 32), c = oval((hx + 2) * s1, (hz + 2) * s1, 32);
      for (let k = 0; k < 32; k++) { const k2 = (k + 1) % 32; K.quad([a[k][0], y0, a[k][1]], [a[k2][0], y0, a[k2][1]], [c[k2][0], y1, c[k2][1]], [c[k][0], y1, c[k][1]], M.white); }
    }
  });
  // LED bands round the drum, the name in lights, big screens over the entrances
  K.at(MID, () => {
    K.prism(oval(hx + 0.4, hz + 0.4), 23.4, 24.2, neon(0xff3aa0), { smooth: 1, win: false, top: false });
    K.prism(oval(hx + 2.4, hz + 2.4), 33.6, 34.3, neon(0x3ad8ff), { smooth: 1, win: false, top: false });
    for (const s of [-1, 1]) K.box(0, 18, s * (hz + 1), 18, 6, 0.6, flat(0x101418), { col: false, win: false });
  });
  for (const s of [-1, 1]) K.sign(0, 18, s * (hz + 1.7), 34, 10, 'VICE ARENA', 'arena', { color: s > 0 ? 0xff3aa0 : 0x3ad8ff, yaw: s > 0 ? 0 : Math.PI, tier: MID });
  K.sign(hx + 0.6, 27, 0, 40, 5, 'VICE ARENA', 'neonDeco', { color: 0xffffff, yaw: E, tier: MID });
  for (let i = 0; i < 6; i++) K.solid(0, 30, -hz + hz * 2 * (i + 0.5) / 6, hx * Math.sqrt(Math.max(0.1, 1 - Math.pow((-1 + 2 * (i + 0.5) / 6), 2))) * 0.95, 30, hz / 6);
  // the plaza round it
  K.at(MID, () => K.box(0, 0.15, 0, (b.x1 - b.x0) / 2, 0.15, (b.z1 - b.z0) / 2, M.herring, { col: false, win: false }));
  for (let i = 0; i < 10; i++) { const q = K.world(rr(C.rng(i), -hx, hx), 0, (i % 2 ? 1 : -1) * (hz + rr(C.rng(i + 9), 8, 24))); C.ped(q[0], q[2]); }
  for (const s of [-1, 1]) for (const x of [-hx + 8, hx - 8]) { const q = K.world(x, 0, s * (hz + 16)); C.palm(q[0], q[2], 1.1, 0); }
  K.end();
  C.place('arena', { x: p.x, z: p.z, kind: 'arena', name: p.name, door: { x: cx, z: cz + hz + 8, heading: S } });
}

// ---- the ballpark -----------------------------------------------------------------------------------------------------------
function ballpark(C) {
  const R = [-1830, 560, -1270, 960];
  const x0 = R[0] + 30, z0 = R[1] + 30, x1 = R[2] - 30, z1 = R[3] - 30;
  C.reserve(R[0], R[1], R[2], R[3]);
  const K = C.K;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - 4, hz = (z1 - z0) / 2 - 4;
  K.begin(cx, C.GROUND, cz, 0, 7801, { kind: 'ballpark' });
  const out = roundRect(-hx, -hz, hx, hz, [hz * 0.9, hz * 0.9, hz * 0.6, hz * 0.6], 6);
  const H = 70;
  // the outer wall: white panels and a glass band
  K.facade({ kind: WIN.curtain, fh: 12, bw: 7, v0: 0, occ: 0.7 });
  K.prism(out, 0, 14, mat('whiteTiles', 0x6a98b8, { p: 5 }), { smooth: 0.6, top: false });
  K.facade(null);
  K.prism(out, 14, H, paint(0xf4f4f0, 0.25, 0.15), { smooth: 0.6, top: false, win: false });
  K.prism(offsetPoly(out, -3), 14, H, mat('concrete', 0xd8d4cc), { smooth: 0.6, top: false, win: false, closed: true });
  // the stands: a sloping ring of seats from the field up to the wall
  const inner = offsetPoly(out, -46);
  const seat = mat('concrete', 0x2a6ac8, { p: 5, r: 0.6 });
  for (let k = 0; k < out.length; k++) {
    const k2 = (k + 1) % out.length, a = inner[k], b = inner[k2], c = offsetPoly(out, -3)[k2], d = offsetPoly(out, -3)[k];
    K.quad([b[0], 6, b[1]], [a[0], 6, a[1]], [d[0], H - 8, d[1]], [c[0], H - 8, c[1]], seat);
  }
  K.prism(inner, 0, 6, paint(0x1d4e89), { smooth: 0.6, top: false, win: false });
  // the field: grass and a diamond of clay
  K.at(MID, () => {
    K.cap(inner, 0.2, mat('lawn', 0x7ac85a, { r: 0.9 }));
    K.push(0, 0, hz * 0.35, Math.PI / 4);
    K.box(0, 0.3, 0, 26, 0.08, 26, mat('sand', 0xc87a4a, { p: 5 }), { col: false, win: false });
    K.box(0, 0.36, 0, 20, 0.06, 20, mat('lawn', 0x7ac85a), { col: false, win: false });
    K.pop();
  });
  // the roof: three big arched panels, as if they slide open
  const span = hz * 2 + 20, pw = (hx * 2) / 3.2;
  for (let i = 0; i < 3; i++) {
    // retracted: stacked at the east end, the field open to the sky
    const px = hx - pw * 0.55 - i * pw * 0.3, ry = H + 8 + i * 4;
    K.at(BASE, () => {
      const n = 8;
      for (let k = 0; k < n; k++) {
        const a0 = Math.PI * (k / n), a1 = Math.PI * ((k + 1) / n);
        const z0 = -Math.cos(a0) * span / 2, z1 = -Math.cos(a1) * span / 2, y0 = ry + Math.sin(a0) * 26, y1 = ry + Math.sin(a1) * 26;
        K.quad([px - pw / 2, y0, z0], [px - pw / 2, y1, z1], [px + pw / 2, y1, z1], [px + pw / 2, y0, z0], mat('metalSheet', 0xe8ecf0, { p: 9, r: 0.35 }), { both: true });
      }
      for (const s of [-1, 1]) K.box(px, (ry) / 2, s * (span / 2 - 2), pw / 2, ry / 2, 2, M.white, { col: true, win: false });
    });
    K.at(MID, () => tube(K, [px - pw / 2, ry + 26.5, 0], [px + pw / 2, ry + 26.5, 0], 0xffffff, 0.4));
  }
  // light masts round the rim, a scoreboard over the outfield
  for (const [mx, mz] of [[-hx * 0.7, -hz * 0.85], [-hx * 0.7, hz * 0.85], [-hx * 0.15, -hz * 0.95], [-hx * 0.15, hz * 0.95]]) {
    K.at(BASE, () => K.box(mx, (H + 40) / 2, mz, 1.2, (H + 40) / 2, 1.2, M.steel, { col: false, win: false }));
    K.at(MID, () => { K.box(mx, H + 42, mz, 9, 4, 0.8, M.metalDark, { col: false, win: false }); K.box(mx, H + 42, mz - Math.sign(mz) * 0.85, 8.2, 3.4, 0.1, neon(0xfff8e8, 0.9), { col: false, win: false }); });
  }
  K.at(BASE, () => K.box(-hx + 30, H - 6, 0, 3, 18, 40, M.metalDark, { col: false, win: false }));
  K.at(MID, () => K.box(-hx + 33.2, H - 4, 0, 0.1, 14, 36, neon(0x60b0ff, 0.5), { col: false, win: false }));
  // the name
  K.sign(0, 40, hz + 0.5, 70, 10, 'VICE CITY BALLPARK', 'neonDeco', { color: 0xff7a2a, tier: MID });
  K.sign(0, 40, -hz - 0.5, 70, 10, 'VICE CITY BALLPARK', 'neonDeco', { color: 0xff7a2a, tier: MID, yaw: Math.PI });
  for (let i = 0; i < 8; i++) K.solid(-hx + (2 * hx) * (i + 0.5) / 8, H / 2, 0, hx / 8, H / 2, hz * 0.96);
  K.end();
  C.place('ballpark', { x: cx, z: cz, kind: 'stadium', name: 'Vice City Ballpark', door: { x: cx, z: z1 + 26, heading: S } });
}

// ---- Liberty Tower ---------------------------------------------------------------------------------------------------
function libertyTower(C) {
  const b = blockAt(C, 382, -1338);
  C.reserve(b.x0, b.z0, b.x1, b.z1);
  const K = C.K;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  K.begin(cx, C.GROUND, cz, E, 7901, { kind: 'liberty' });
  const cream = paint(0xf2e6c8, 0.7, 0.2), trim = paint(0xfaf4e4, 0.6, 0.1), roof = M.roofTilesDark;
  const hw = (b.z1 - b.z0) / 2 - 3, hd = (b.x1 - b.x0) / 2 - 3;
  // the base: three floors with an arcade, red tile roof
  const g = 16;
  K.facade({ kind: WIN.punched, fh: 11, bw: 9, v0: g, gk: GF.arcade, occ: 0.6, variant: 9 });
  K.box(0, 19, 0, hw, 19, hd, cream, { top: M.roof });
  K.facade(null);
  K.hipRoof(0, 38, 0, hw, hd, 8, roof, { ov: 1.5 });
  K.at(MID, () => { for (let x = -hw + 3; x <= hw - 3; x += 9) K.box(x, g / 2, hd + 1, 1, g / 2, 1, trim, { col: false, win: false }); K.box(0, g, hd + 1, hw, 0.8, 1.2, trim, { col: false, win: false }); });
  // the tower: shafts stepping in, arched windows, a cupola and a lantern
  const T = [[22, 38, 150], [17, 150, 196], [12, 196, 222]];
  for (const [s, y0, y1] of T) {
    K.facade({ kind: WIN.punched, fh: 11, bw: 7, v0: y0, gk: 0, occ: 0.55, variant: 12 });
    K.box(0, (y0 + y1) / 2, 0, s, (y1 - y0) / 2, s, cream, { top: M.roof });
    K.facade(null);
    K.at(MID, () => {
      K.box(0, y1 + 0.6, 0, s + 1, 0.6, s + 1, trim, { col: false, win: false });
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box(a * (s - 1), (y0 + y1) / 2, c * (s - 1), 1.6, (y1 - y0) / 2, 1.6, trim, { col: false, win: false });
      // small urns on the corners of each stage
      for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.lathe(a * s, y1 + 1.2, c * s, [[0.01, 0], [1.2, 0.6], [0.8, 2.2], [1.3, 3], [0.01, 3.6]], trim, { seg: 8 });
    });
  }
  K.lathe(0, 222, 0, [[10, 0], [10, 4], [9.5, 8], [7, 14], [3, 18.5], [0.01, 19]], mat('roofTiles', 0xd8a050), { seg: 16 });
  K.at(MID, () => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; K.box(Math.cos(a) * 10.2, 224, -Math.sin(a) * 10.2, 0.6, 2, 0.6, trim, { col: false, win: false }); }
    K.lathe(0, 241, 0, [[2.4, 0], [2.4, 5], [1.2, 7], [0.01, 9]], trim, { seg: 8 });
    K.cyl(0, 0, 0.3, 250, 262, metalOf(0xd8b050), { seg: 6, win: false });
    K.prism([[-10.5, 10.5], [10.5, 10.5], [10.5, -10.5], [-10.5, -10.5]].map((p) => p), 221, 221.6, neon(0xffd890, 0.9), { win: false, top: false });
  });
  K.solid(0, 130, 0, 22, 92, 22);
  K.sign(0, 30, hd + 0.3, 40, 4, 'LIBERTY TOWER', 'letters', { color: 0x8a6a3a, tier: MID });
  K.end();
  C.place('liberty', { x: cx, z: cz, kind: 'landmark', name: 'Liberty Tower', door: { x: b.x1 + 4, z: cz, heading: E } });
}

// ---- the Government Center -------------------------------------------------------------------------------------------
function govCenter(C) {
  const R = [-470, -1520, -250, -1300], x0 = R[0] + 30, z0 = R[1] + 30, x1 = R[2] - 30, z1 = R[3] - 30;
  C.reserve(R[0], R[1], R[2], R[3]);
  const K = C.K;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  K.begin(cx, C.GROUND, cz, S, 8001, { kind: 'gov' });
  // a plaza with a fountain, and a dark office tower on the north half
  K.at(MID, () => K.box(0, 0.2, 0, hw, 0.2, hd, M.pavers, { col: false, win: false }));
  const tw = 30, td = 22, H = 300, tz = -hd + td + 4;
  K.facade({ kind: WIN.curtain, fh: 12, bw: 5.5, v0: 18, gk: GF.lobby, occ: 0.6 });
  K.box(0, H / 2, tz, tw, H / 2, td, mat('whiteTiles', 0x3e5868, { p: 5 }), { top: M.membrane });
  K.facade(null);
  K.at(MID, () => { for (const s of [-1, 1]) K.box(s * (tw + 0.8), H / 2, tz, 0.8, H / 2 + 4, td + 0.8, M.concrete, { col: false, win: false }); K.box(0, H + 5, tz, tw + 1.6, 1.2, td + 1.6, M.concrete, { col: false, win: false }); });
  K.sign(0, 13, tz + td + 0.2, 50, 3, 'VICE-DADE GOVERNMENT CENTER', 'letters', { color: 0xd8d4cc, tier: MID });
  // the fountain
  K.at(MID, () => {
    K.cyl(0, hd * 0.45, 18, 0, 1.8, M.white, { seg: 20, win: false });
    K.cyl(0, hd * 0.45, 16.5, 1.8, 1.9, M.pool, { seg: 20, win: false });
    K.lathe(0, 1.8, hd * 0.45, [[3, 0], [1, 4], [4, 6], [0.5, 9], [0.01, 9.5]], M.white, { seg: 12 });
  });
  K.solid(0, 1, hd * 0.45, 17, 1, 17);
  for (let i = 0; i < 14; i++) { const r = C.rng(80 + i); const q = K.world(rr(r, -hw + 6, hw - 6), 0, rr(r, 0, hd - 4)); C.ped(q[0], q[2]); }
  for (const [x, z] of [[-hw + 6, hd - 6], [hw - 6, hd - 6], [-hw + 6, 4], [hw - 6, 4]]) { const q = K.world(x, 0, z); C.palm(q[0], q[2], 1.1, 0); }
  K.end();
  C.place('govcenter', { x: cx, z: cz, kind: 'plaza', name: 'Government Center', door: { x: cx, z: z1 + 6, heading: S } });
}

// ---- the port: sheds along the edges of its blocks, the cruise terminal, offices -------------------------------------------
function port(C) {
  const K = C.K;
  const blocks = C.plan.blocks.filter((b) => b.district === 'port');
  let i = 0;
  for (const b of blocks) {
    C.reserve(b.x0, b.z0, b.x1, b.z1);
    const r = C.rng(8100 + b.id);
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    // the cruise terminal on the south-most row (towards the channel), a shed on the others
    const south = b.z1 > -470;
    if (south && i++ < 2 && w > 150) { cruiseTerminal(C, b, r); continue; }
    const sd = Math.min(d * 0.32, 46);
    // the shed along the block's north edge, the rest left open for the container yards
    let z0 = b.z0, z1 = b.z0 + sd;
    if (!C.landOK(b.x0 + 4, z0 + 2, b.x1 - 4, z1 - 2)) { z1 = b.z1; z0 = b.z1 - sd; if (!C.landOK(b.x0 + 4, z0 + 2, b.x1 - 4, z1 - 2)) continue; }
    K.begin((b.x0 + b.x1) / 2, C.GROUND, (z0 + z1) / 2, S, 8100 + b.id, { kind: 'shed' });
    const hw = w / 2 - 6, hd = sd / 2 - 2, H = rr(r, 24, 34);
    const wall = mat('metalSheet', pick(r, [0xc8ccd0, 0x8aa0b0, 0xd8d0c0, 0x6a8a9a]), { p: 9, r: 0.55, grime: 0.6 });
    K.facade({ kind: WIN.high, fh: H - 1, bw: 14, v0: 0, gk: GF.garage, occ: 0.3 });
    K.box(0, H / 2, 0, hw, H / 2, hd, wall, { top: M.roof });
    K.facade(null);
    K.gableRoof(0, H, 0, hw, hd, 5, mat('metalSheet', 0xa8acb0, { p: 9, grime: 0.6 }), wall, { ov: 0.8 });
    K.sign(-hw + 18, H - 5, hd + 0.2, 26, 4, `SHED ${b.id % 9 + 1}`, 'paint', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
    K.end();
  }
  // the port offices by the bridge
  const ob = blocks.slice().sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - 960, (a.z0 + a.z1) / 2 + 560) - Math.hypot((b.x0 + b.x1) / 2 - 960, (b.z0 + b.z1) / 2 + 560))[0];
  if (ob) {
    const lot = lotRect(ob.x0, ob.z1 - 50, ob.x0 + 60, ob.z1, S, 8190);
    if (C.landOK(lot.x0, lot.z0, lot.x1, lot.z1)) tower(C, lot, C.rng(8190), { H: 90, type: 'office', shape: 'box', crown: 'mech', name: 'PORT OF VICE CITY', podium: 0 });
  }
  C.place('port', { x: 1240, z: -720, kind: 'port', name: 'Port of Vice City', door: { x: 980, z: -560, heading: W } });
}
function cruiseTerminal(C, b, r) {
  const K = C.K;
  const hw = (b.x1 - b.x0) / 2 - 8, sd = Math.min((b.z1 - b.z0) * 0.5, 60);
  const z1 = b.z1 - 4, z0 = z1 - sd;
  K.begin((b.x0 + b.x1) / 2, C.GROUND, (z0 + z1) / 2, S, 8150 + b.id, { kind: 'cruise' });
  const hd = sd / 2, H = 30;
  K.facade({ kind: WIN.curtain, fh: 15, bw: 6, v0: 0, occ: 0.6 });
  K.box(0, H / 2, 0, hw, H / 2, hd, mat('whiteTiles', 0x6aa0c8, { p: 5 }), { top: M.membrane });
  K.facade(null);
  // a wavy white roof
  K.at(BASE, () => {
    const n = 10;
    for (let k = 0; k < n; k++) {
      const xa = -hw - 4 + ((2 * hw + 8) * k) / n, xb = -hw - 4 + ((2 * hw + 8) * (k + 1)) / n;
      const ya = H + 4 + Math.sin(k * 0.9) * 4, yb = H + 4 + Math.sin((k + 1) * 0.9) * 4;
      K.quad([xa, ya, hd + 8], [xb, yb, hd + 8], [xb, yb, -hd - 4], [xa, ya, -hd - 4], M.white, { both: true });
    }
  });
  for (let x = -hw; x <= hw; x += 24) K.box(x, (H + 4) / 2, hd + 6, 0.8, (H + 4) / 2, 0.8, M.white, { col: true, win: false });
  K.sign(0, H - 4, hd + 0.3, 50, 5, 'CRUISE TERMINAL', 'letters', { color: 0x1d4e89, tier: MID });
  K.end();
  void r;
}

// ---- the airport ------------------------------------------------------------------------------------------------------------
function airport(C) {
  const K = C.K;
  // the terminal: north of the loop, facing it; its gates face the apron
  const tx0 = -3300, tx1 = -2620, tz0 = -2470, tz1 = -2352;
  C.reserve(tx0, tz0, tx1, tz1);
  K.begin((tx0 + tx1) / 2, C.GROUND, (tz0 + tz1) / 2, S, 8201, { kind: 'terminal' });
  const hw = (tx1 - tx0) / 2, hd = (tz1 - tz0) / 2, H = 38;
  K.facade({ kind: WIN.curtain, fh: 13, bw: 7, v0: 0, occ: 0.8 });
  K.box(0, H / 2, 0, hw - 10, H / 2, hd - 14, mat('whiteTiles', 0x7aa6c4, { p: 5 }), { top: M.membrane });
  K.facade(null);
  // the roof: a long white wave on columns, over the kerb
  K.at(BASE, () => {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const xa = -hw + (2 * hw * k) / n, xb = -hw + (2 * hw * (k + 1)) / n;
      const ya = H + 6 + Math.sin(k * 0.45) * 5, yb = H + 6 + Math.sin((k + 1) * 0.45) * 5;
      K.quad([xa, ya - 6, hd + 10], [xb, yb - 6, hd + 10], [xb, yb, -hd], [xa, ya, -hd], M.white, { both: true });
    }
  });
  for (let x = -hw + 20; x < hw; x += 40) K.box(x, (H) / 2, hd + 6, 1, H / 2, 1, M.white, { col: true, win: false });
  // the departures kerb canopy and signs
  canopy(K, 0, 14, hd - 14, hw * 2 - 40, 14, M.white, { glow: 0xfff4e0, t: 0.8 });
  K.sign(0, H - 6, hd - 13.6, 80, 6, 'VICE CITY INTERNATIONAL', 'letters', { color: 0x1d4e89, tier: MID });
  K.sign(-hw * 0.5, 18, hd + 0.5, 30, 3, 'DEPARTURES', 'box', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
  K.sign(hw * 0.5, 18, hd + 0.5, 30, 3, 'ARRIVALS', 'box', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
  // jet bridges toward the apron
  K.at(MID, () => { for (let x = -hw + 60; x < hw - 40; x += 90) { K.box(x, 16, -hd - 16, 3.5, 3.5, 16, mat('metalSheet', 0xd8dce0, { p: 9 }), { col: false, win: false }); K.box(x, 6, -hd - 28, 1, 6, 1, M.steel, { col: false, win: false }); } });
  for (let i = 0; i < 20; i++) { const q = K.world(-hw + 30 + i * (2 * hw - 60) / 20, 0, hd + 2); C.ped(q[0], q[2]); }
  K.end();
  C.place('airport', { x: (tx0 + tx1) / 2, z: tz1, kind: 'airport', name: 'Vice City International', door: { x: (tx0 + tx1) / 2 + 20, z: tz1 + 18, heading: S } });
  // the control tower
  C.reserve(-2600, -2300, -2540, -2240);
  K.begin(-2570, C.GROUND, -2270, S, 8202, { kind: 'tower' });
  K.cyl(0, 0, 9, 0, 150, M.white, { seg: 12, win: false, col: true });
  K.at(BASE, () => {
    K.cyl(0, 0, 17, 150, 156, M.white, { seg: 12, win: false });
    K.facade({ kind: WIN.curtain, fh: 12, bw: 4, v0: 156, occ: 1 });
    K.cyl(0, 0, 18, 156, 166, mat('whiteTiles', 0x2a4a5a, { p: 5 }), { seg: 12 });
    K.facade(null);
    K.cyl(0, 0, 19, 166, 168, M.white, { seg: 12, win: false });
    K.cyl(0, 0, 0.6, 168, 186, M.steel, { seg: 6, win: false });
  });
  K.at(MID, () => K.box(0, 186.6, 0, 0.7, 0.7, 0.7, neon(0xff2020), { col: false, win: false }));
  K.end();
  // the parking garage inside the loop
  C.reserve(-3160, -2240, -2760, -1760);
  K.begin(-2960, C.GROUND, -2000, S, 8203, { kind: 'garage' });
  garage(C, K, 120, 100, 4);
  K.end();
  // hangars along the west side
  for (let i = 0; i < 3; i++) {
    const hx = -3900 + i * 150, hz = -2050;
    C.reserve(hx - 65, hz - 60, hx + 65, hz + 60);
    K.begin(hx, C.GROUND, hz, N, 8210 + i, { kind: 'hangar' });
    const hw2 = 60, hd2 = 55, h = 34;
    const wall = mat('metalSheet', pick(C.rng(i), [0xd8dce0, 0xb8c4cc, 0xe8e4dc]), { p: 9, r: 0.5, grime: 0.5 });
    K.box(0, h / 2, -hd2 + 1, hw2, h / 2, 1, wall, { win: false });
    for (const s of [-1, 1]) K.box(s * (hw2 - 1), h / 2, 0, 1, h / 2, hd2, wall, { win: false });
    // barrel roof
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a0 = Math.PI * k / n, a1 = Math.PI * (k + 1) / n;
      K.quad([-Math.cos(a0) * hw2, h + Math.sin(a0) * 18, hd2], [-Math.cos(a1) * hw2, h + Math.sin(a1) * 18, hd2], [-Math.cos(a1) * hw2, h + Math.sin(a1) * 18, -hd2], [-Math.cos(a0) * hw2, h + Math.sin(a0) * 18, -hd2], wall, { both: true });
    }
    // the gable over the door, and the doors half open
    K.box(0, h + 9, hd2 - 0.5, hw2, 9, 0.5, wall, { win: false, col: false });
    K.at(MID, () => { K.box(-hw2 + 18, h / 2, hd2 - 1.5, 17, h / 2, 0.6, mat('metalSheet', 0x9aa4ac, { p: 9 }), { col: true, win: false }); });
    K.sign(0, h + 8, hd2 + 0.1, 40, 5, `HANGAR ${i + 1}`, 'paint', { tier: MID, bg: '#1d4e89', fg: '#ffffff' });
    K.end();
  }
}

// ---- Watson Island heliport ----------------------------------------------------------------------------------------------------
function heliport(C) {
  const p = PL.helipad;
  const K = C.K;
  const x0 = 1032, x1 = 1110, z0 = p.z - 26, z1 = p.z + 22;
  C.reserve(x0, z0, x1, z1);
  K.begin((x0 + x1) / 2, C.GROUND, (z0 + z1) / 2, W, 8301, { kind: 'heliport' });
  const hw = (z1 - z0) / 2 - 1, hd = (x1 - x0) / 2 - 2, H = 15;
  K.facade({ kind: WIN.curtain, fh: 14, bw: 6, v0: 0, occ: 0.8 });
  K.prism(roundRect(-hw, -hd + 10, hw, hd, [8, 8, 8, 8], 4), 0, H, mat('whiteTiles', 0x5a98b8, { p: 5 }), { col: true, top: M.membrane });
  K.facade(null);
  K.at(MID, () => K.prism(offsetPoly(roundRect(-hw, -hd + 10, hw, hd, [8, 8, 8, 8], 4), 4), H, H + 1.2, M.white, { win: false, bottom: true }));
  K.sign(0, H - 3, hd + 0.2, 34, 3, 'VICE CITY HELITOURS', 'neonDeco', { color: 0x40d8ff, tier: MID });
  K.end();
  C.place('helipad', { x: p.x, z: p.z, kind: 'helipad', name: p.name, door: { x: x0 - 4, z: p.z, heading: W } });
}

// ---- Star Island ------------------------------------------------------------------------------------------------------------
function starIsland(C) {
  // mansions wherever the island has room off its drive: biggest first
  const [cx, cz, rx, rz] = [1400, -1530, 200, 95];
  let n = 0;
  for (const [hw, hd] of [[34, 26], [30, 22], [26, 20], [22, 18]]) {
    for (let x = cx - rx; x <= cx + rx; x += 6) for (let z = cz - rz; z <= cz + rz; z += 6) {
      if (n >= 7) break;
      if (!C.clear(x - hw - 3, z - hd - 3, x + hw + 3, z + hd + 3)) continue;
      // face the drive: towards the island's long axis
      const yaw = z < cz ? S : N;
      const lot = lotRect(x - hw, z - hd, x + hw, z + hd, yaw, 8400 + n);
      C.reserve(x - hw - 4, z - hd - 4, x + hw + 4, z + hd + 4);
      mansion(C, lot, C.rng(8400 + n));
      n++;
    }
  }
  C.place('star', { x: 1400, z: -1560, kind: 'island', name: 'Star Island', door: { x: 1400, z: -1500, heading: S } });
}
/** A big modern mansion (white boxes, walls of glass, cantilevered roofs) with a pool deck and a dock; or a Mediterranean one. */
export function mansion(C, lot, r) {
  const K = C.K;
  K.begin(lot.x, C.GROUND, lot.z, lot.yaw, lot.seed, { kind: 'mansion' });
  const hw = lot.w / 2 - 2, hd = lot.d / 2 - 2;
  const modern = r() < 0.6;
  const g = 13, H = g + 12;
  const wall = modern ? paint(0xfbfbf8, 0.5, 0.05) : paint(pick(r, [0xf3e3c3, 0xf5dcc8, 0xf8efe0]), 0.4, 0.15);
  const mw = hw * 0.85, md = hd * 0.42, mz = hd * 0.18;
  if (modern) {
    // ground floor: glass all round; first floor: a white box slid sideways, with a terrace on the other side
    K.facade({ kind: WIN.resi, fh: 12, bw: 9, v0: 0, occ: 0.8, variant: 6 });
    K.box(-mw * 0.1, g / 2, mz, mw * 0.85, g / 2, md, wall, { top: M.roof });
    K.facade({ kind: WIN.ribbon, fh: 12, bw: 10, v0: g, occ: 0.7 });
    K.box(mw * 0.25, (g + H) / 2, mz + 2, mw * 0.7, (H - g) / 2, md + 2, wall, { top: M.membrane });
    K.facade(null);
    K.at(MID, () => {
      K.box(mw * 0.25, H + 0.5, mz + 2, mw * 0.7 + 4, 0.5, md + 6, M.white, { col: false, win: false });
      K.box(-mw * 0.1, g + 0.4, mz, mw * 0.85 + 3, 0.4, md + 3, M.white, { col: false, win: false });
      // glass rail round the terrace
      K.box(-mw * 0.62, g + 2.4, mz, 0.08, 1.8, md + 2.8, M.glass, { col: false, win: false });
      K.box(-mw * 0.25, g + 2.4, mz + md + 2.8, mw * 0.4, 1.8, 0.08, M.glass, { col: false, win: false });
      // a wooden screen and a stone wall
      K.box(mw * 0.86, g / 2, mz, 0.6, g / 2, md * 0.8, mat('deck', 0x8a5a3a), { col: false, win: false });
    });
  } else {
    K.facade({ kind: WIN.shutters, fh: 12, bw: 11, v0: g, occ: 0.7, variant: 6 });
    K.box(0, H / 2, mz, mw, H / 2, md, wall, { top: M.roof });
    K.hipRoof(0, H, mz, mw, md, 8, M.roofTiles, { ov: 2 });
    for (const s of [-1, 1]) { K.box(s * (mw - 6), (H + 10) / 2, mz + md - 4, 7, (H + 10) / 2, 7, wall, { top: M.roof }); K.hipRoof(s * (mw - 6), H + 10, mz + md - 4, 7, 7, 6, M.roofTiles, { ov: 1.2 }); }
    K.facade(null);
    K.at(MID, () => { for (let x = -mw + 16; x <= mw - 16; x += 7) K.box(x, 5, mz + md + 4, 0.7, 5, 0.7, M.trim, { col: true, win: false }); K.box(0, 10.4, mz + md + 2, mw - 14, 0.4, 3, M.roofTiles, { col: false, win: false }); });
  }
  // the pool deck towards the water (behind), loungers, palms
  const pz = -hd * 0.55;
  K.at(MID, () => K.box(0, 0.25, pz, mw, 0.25, hd * 0.38, M.marble, { col: false, win: false }));
  pool(K, -mw * 0.15, pz, mw * 0.5, hd * 0.16, 0.5);
  K.at(NEAR, () => { for (let i = 0; i < 4; i++) { const x = mw * 0.5 + (i % 2) * 5, z = pz - 6 + Math.floor(i / 2) * 8; K.box(x, 1.2, z, 1.4, 0.3, 3.4, M.white, { col: false, win: false }); K.box(x, 1.9, z - 2.6, 1.4, 0.7, 0.3, M.white, { col: false, win: false, yaw: 0 }); } });
  for (let k = 0; k < 6; k++) { const q = K.world(rr(r, -hw, hw), 0, k < 3 ? rr(r, -hd, pz - 6) : rr(r, hd * 0.65, hd)); C.palm(q[0], q[2], rr(r, 1, 1.4), rr(r, -0.12, 0.12)); }
  lowWall(K, -hw, hd + 1, -7, hd + 1, 0, 6, 1, wall);
  lowWall(K, 7, hd + 1, hw, hd + 1, 0, 6, 1, wall);
  K.at(MID, () => K.quad([-5, 0.12, hd + 2], [5, 0.12, hd + 2], [5, 0.12, mz + md + 2], [-5, 0.12, mz + md + 2], M.pavers));
  const q = K.world(0, 0, hd - 4); C.park(q[0], q[2], lot.yaw + Math.PI / 2);
  // a dock on the water behind
  const bp = K.world(0, 0, -hd - 10);
  if (!C.plan.isLand(bp[0], bp[2])) {
    K.at(MID, () => { K.box(0, 2.6, -hd - 9, 4, 0.4, 9, M.deck, { col: true, win: false }); for (const z of [-hd - 2, -hd - 16]) for (const x of [-3.5, 3.5]) K.box(x, 0, z, 0.5, 3, 0.5, M.wood, { col: false, win: false }); });
    const dp = K.world(10, 0, -hd - 12); (C.city.docks = C.city.docks || []).push({ x: dp[0], z: dp[2], heading: lot.yaw + Math.PI / 2 });
  }
  K.end();
}
export { MURALS, fabric, awning, NEON, NEAR, ri, roofKit };
