// Vice City International: two parallel north-south runways (36L/18R and
// 36R/18L) with threshold bars, numbers, centrelines, aiming points and
// touchdown zones, edge lights (green/red at the ends) and approach light
// bars; a parallel taxiway with yellow centrelines, holding points and blue
// edge lights; the west apron with airliners parked at the gates and cargo
// jets further south, ground vehicles, floodlight masts, windsocks and the
// perimeter fence. The terminal, tower and hangars are the city's.
import { L, tint, cyl, cylAB, rnd, faceUp, GROUND } from './kit.js';
import { airliner, LIVERIES } from './planes.js';
import { fence } from './port.js';
import { frame } from './beach.js';

const Y = GROUND + 0.08;                   // the pavement
const AX = -3600, AZ = -2400;              // all the airport's flat things go in one chunk (one draw call per material)
export const RUNWAYS = [
  { x: -3960, z0: -3960, z1: -1010, w: 92, names: ['36L', '18R'] },
  { x: -3670, z0: -3720, z1: -1290, w: 82, names: ['36R', '18L'] },
];
const TWY = { x: -3500, z0: -3890, z1: -1060, w: 34 };
const CONNECT = [[-3890, -3960], [-3620, -3670], [-3020, -3960], [-2420, -3670], [-1900, -3960], [-1320, -3670], [-1060, -3960]];
const APRON = { x0: -3486, x1: -3268, z0: -2440, z1: -1100 };
const GATES = [
  { z: -2340, type: 'narrow' }, { z: -2185, type: 'narrow' }, { z: -2005, type: 'wide' }, { z: -1820, type: 'narrow' }, { z: -1675, type: 'narrow' },
  { z: -1495, type: 'jumbo', cargo: true }, { z: -1250, type: 'wide', cargo: true },
];
const WHITE = [1.22, 1.22, 1.2], YELLOW = tint(0xf2c200, 1.25);

// a 3 x 5 cell font for runway designators
const GLYPH = {
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '001', '001', '001'],
  8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'], L: ['100', '100', '100', '100', '111'], R: ['110', '101', '110', '101', '101'],
};

export function buildAirport(P) {
  const gf = P.C.get('flat', AX, AZ), gp = P.C.get('paint', AX, AZ), gl = P.C.get('surf', AX, AZ);
  // a rectangle on the ground: centre line a->b (x, z), half width hw
  const rect = (g, ax, az, bx, bz, hw, o, y = Y) => {
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.01) return;
    const nx = -dz / l * hw, nz = dx / l * hw;
    g.quad([ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], [ax - nx, y, az - nz], { normal: [0, 1, 0], ...o });
    faceUp(g);
  };
  const asphalt = { lay: L.asphalt, tint: [0.78, 0.78, 0.8], scale: 30, rough: 0.9 };
  const shoulder = { lay: L.asphaltWorn, tint: [0.75, 0.73, 0.7], scale: 26 };
  const paintW = { lay: L.stucco, tint: WHITE, scale: 8, rough: 0.6 }, paintY = { lay: L.stucco, tint: YELLOW, scale: 8, rough: 0.6 };
  const light = (x, z, col, h = 0.5) => { gl.box(x, Y + h + 0.45, z, 0.7, 0.45, 0.7, 0, { lay: L.whiteTiles, tint: col, glow: 1, rough: 0.2 }); gl.box(x, Y + h / 2, z, 0.14, h / 2, 0.14, 0, { lay: L.concrete, tint: [0.9, 0.9, 0.85] }); };
  // ---- runways ----
  for (const R of RUNWAYS) {
    const len = R.z1 - R.z0, hw = R.w / 2;
    for (let z = R.z0; z < R.z1; z += 300) {
      const z2 = Math.min(R.z1, z + 300);
      rect(gf, R.x, z, R.x, z2, hw, asphalt);
      rect(gf, R.x - hw - 7, z, R.x - hw - 7, z2, 7, shoulder);
      rect(gf, R.x + hw + 7, z, R.x + hw + 7, z2, 7, shoulder);
    }
    // overrun areas with yellow chevrons beyond each end
    for (const [zEnd, dir] of [[R.z0, -1], [R.z1, 1]]) {
      rect(gf, R.x, zEnd, R.x, zEnd + dir * 60, hw, shoulder);
      for (let k = 0; k < 3; k++) {
        const zc = zEnd + dir * (14 + k * 16);
        for (const s of [-1, 1]) rect(gp, R.x, zc, R.x + s * (hw - 4), zc + dir * 14, 1.4, paintY);
      }
    }
    // edge lines and the centreline
    for (const s of [-1, 1]) rect(gp, R.x + s * (hw - 2), R.z0, R.x + s * (hw - 2), R.z1, 0.7, paintW);
    for (let d = 160; d < len - 160; d += 60) rect(gp, R.x, R.z0 + d, R.x, R.z0 + d + 34, 0.75, paintW);
    // each end: threshold bars, the designator, aiming points, touchdown zones, lights
    R.names.forEach((name, end) => {
      const z0 = end ? R.z0 : R.z1;           // '36' is at the south end (z1), landing north; at(d) is d into the runway
      const at = (d) => z0 + (end ? d : -d);
      // threshold bars
      for (let k = 0; k < 6; k++) for (const s of [-1, 1]) {
        const bx = R.x + s * (5.5 + k * 6.2);
        rect(gp, bx, at(8), bx, at(53), 1.7, paintW);
      }
      // the number and letter, read by a pilot landing from this end
      const up = end ? [0, 1] : [0, -1];
      writeText(gp, name.slice(0, 2), R.x, at(124), up, 4.4, 7.4, paintW);
      writeText(gp, name.slice(2), R.x, at(78), up, 4.4, 7.4, paintW);
      // aiming points and touchdown zones
      for (const s of [-1, 1]) {
        rect(gp, R.x + s * 14, at(300), R.x + s * 14, at(345), 4.2, paintW);
        for (const [d, n] of [[180, 3], [450, 2], [560, 2], [680, 1]]) for (let k = 0; k < n; k++) { const bx = R.x + s * (8 + k * 3.8); rect(gp, bx, at(d), bx, at(d + 22), 0.9, paintW); }
      }
      // threshold lights across the end: green facing in, red facing out (one light, two colours)
      for (let u = -hw + 3; u <= hw - 3; u += 6) light(R.x + u, at(-1.5), [0.25, 1, 0.4]);
      for (let u = -hw + 3; u <= hw - 3; u += 9) light(R.x + u, at(-58), [1, 0.18, 0.12]);
      // approach light bars out beyond the end, with a crossbar
      for (let d = 70; d <= 330; d += 30) {
        const z = at(-d);
        if (Math.abs(z) > 4080) break;
        const wide = d === 190, half = wide ? 26 : 6;
        gl.box(R.x, Y + 1.2, z, half + 0.5, 0.15, 0.25, 0, { lay: L.concrete, tint: [0.85, 0.85, 0.82] });
        for (let u = -half; u <= half; u += 3) light(R.x + u, z, [1, 0.96, 0.86], 1.6);
      }
    });
    // edge lights
    for (let z = R.z0 + 30; z < R.z1 - 20; z += 60) for (const s of [-1, 1]) light(R.x + s * (hw + 2.5), z, (z - R.z0 < 600 || R.z1 - z < 600) ? [1, 0.75, 0.25] : [1, 0.96, 0.86]);
    // collision-free: aircraft and cars drive on it; nothing to add
  }
  // ---- the taxiway and its connectors ----
  const twy = (ax, az, bx, bz) => {
    rect(gf, ax, az, bx, bz, TWY.w / 2, { ...asphalt, tint: [0.72, 0.72, 0.74] });
    rect(gp, ax, az, bx, bz, 0.55, paintY);
    for (const s of [-1, 1]) {
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      rect(gp, ax + nx * s * (TWY.w / 2 - 1), az + nz * s * (TWY.w / 2 - 1), bx + nx * s * (TWY.w / 2 - 1), bz + nz * s * (TWY.w / 2 - 1), 0.35, paintY);
      for (let d = 20; d < l - 10; d += 46) light(ax + dx / l * d + nx * s * (TWY.w / 2 + 2), az + dz / l * d + nz * s * (TWY.w / 2 + 2), [0.25, 0.45, 1.0], 0.4);
    }
  };
  twy(TWY.x, TWY.z0, TWY.x, TWY.z1);
  for (const [z, xr] of CONNECT) {
    twy(xr, z, TWY.x - TWY.w / 2, z);
    // holding points short of each runway the connector meets
    for (const R of RUNWAYS) {
      if (xr > R.x || z < R.z0 - 40 || z > R.z1 + 40) continue;
      const hx = R.x + R.w / 2 + 26;
      if (hx > TWY.x - TWY.w / 2) continue;
      for (const [off, dash] of [[0, false], [1.2, false], [2.8, true], [4.0, true]]) {
        for (let u = -TWY.w / 2 + 1; u < TWY.w / 2 - 1; u += dash ? 3 : TWY.w) {
          const u1 = dash ? u + 1.8 : TWY.w / 2 - 1;
          gp.quad([hx + off - 0.3, Y, z + u], [hx + off - 0.3, Y, z + u1], [hx + off + 0.3, Y, z + u1], [hx + off + 0.3, Y, z + u], { ...paintY, normal: [0, 1, 0] }); faceUp(gp);
        }
      }
    }
  }
  // ---- the apron: concrete slabs, lead-in lines, the parked aircraft ----
  for (let z = APRON.z0; z < APRON.z1; z += 220) {
    const z2 = Math.min(APRON.z1, z + 220);
    gf.quad([APRON.x0, Y + 0.02, z], [APRON.x0, Y + 0.02, z2], [APRON.x1, Y + 0.02, z2], [APRON.x1, Y + 0.02, z], { lay: L.concrete, tint: [0.95, 0.94, 0.9], scale: 22, normal: [0, 1, 0] }); faceUp(gf);
  }
  const r = rnd(737);
  const gs = P.C.get('surf', AX, AZ), gw = P.C.get('win', AX, AZ), gd = P.C.get('detail', -3380, -1900);
  let li = 0;
  for (const G of GATES) {
    const noseX = APRON.x1 - 18;
    rect(gp, TWY.x, G.z, noseX, G.z, 0.5, paintY);
    rect(gp, noseX + 2, G.z - 6, noseX + 2, G.z + 6, 0.6, paintY);
    const liv = G.cargo ? LIVERIES[5] : LIVERIES[li++ % 5];
    const len = G.type === 'narrow' ? 122 : G.type === 'wide' ? 188 : 210;
    const cx = noseX - len * 0.48;
    const pl = airliner(gs, gw, cx, GROUND, G.z, Math.PI / 2, G.type, liv);
    // collision: the fuselage, the wings and the engines
    P.box(cx - len * 0.02, GROUND + pl.cy, G.z, len / 2, pl.R, pl.R, Math.PI / 2, 'metal', { plane: true, shootable: true });
    P.box(cx + len * 0.05, GROUND + pl.cy - pl.R * 0.4, G.z, len * 0.1, 1.2, pl.span / 2, 0, 'metal', { plane: true, noStand: true });
    // ground vehicles: a stairs truck at the front door, a baggage tug and carts, a fuel truck under the wing
    const F = frame(gd, cx, GROUND, G.z, Math.PI / 2);
    // (the passenger doors are on the left: local +x for a plane facing +z)
    vehicle(F, pl.R + 0.6, len * 0.36, 'stairs', r, pl.cy - pl.R * 0.35);
    vehicle(F, -pl.R - 9, len * 0.15, 'tug', r);
    for (let k = 0; k < 3; k++) vehicle(F, -pl.R - 9, len * 0.15 - 10 - k * 8, 'cart', r);
    if (r() < 0.6) vehicle(F, -pl.R - 26, len * 0.02, 'fuel', r);
  }
  // floodlight masts along the back of the apron
  for (let z = APRON.z0 + 120; z < APRON.z1; z += 330) mast(P, APRON.x1 - 6, z);
  // ---- windsocks ----
  for (const [x, z] of [[-3815, -3400], [-3815, -1600], [-3560, -2700]]) windsock(gs, x, z);
  // ---- the perimeter fence ----
  const fy = 10;
  fence(P, -4086, -4086, -2432, -4086, fy);
  fence(P, -2432, -4086, -2432, -792, fy);
  fence(P, -2432, -792, -4086, -792, fy);
  fence(P, -4086, -792, -4086, -4086, fy);
}

/** Glyphs centred at (cx, cz), their 'up' along `up` [x, z]; cell size cw (across) x ch (along). */
function writeText(g, str, cx, cz, up, cw, ch, o) {
  const rx = -up[1], rz = up[0]; // right of the reader
  const gap = cw, W = str.length * 3 * cw + (str.length - 1) * gap;
  for (let i = 0; i < str.length; i++) {
    const rows = GLYPH[str[i]]; if (!rows) continue;
    const left = -W / 2 + i * (3 * cw + gap);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (rows[row][col] !== '1') continue;
      const u0 = left + col * cw, u1 = u0 + cw, v1 = (2.5 - row) * ch, v0 = v1 - ch;
      const P = (u, v) => [cx + rx * u + up[0] * v, Y, cz + rz * u + up[1] * v];
      g.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), { ...o, normal: [0, 1, 0] });
      faceUp(g);
    }
  }
}

function vehicle(F, lx, lz, kind, r, door = 11) {
  const o = (t) => ({ lay: L.stucco, tint: t, scale: 4 });
  const dark = [0.12, 0.12, 0.13];
  if (kind === 'stairs') {
    // lx is the door's side of the fuselage: the truck stands off it with its stairs up to the door
    F.box(lx + 9, 2.2, lz, 6.5, 1.6, 2.8, o(tint(0xfbfbf8, 1.1)));
    F.box(lx + 14, 4.4, lz, 2.0, 1.4, 2.6, o(tint(0xfbfbf8, 1.1)));
    F.quad([lx + 13, 3.8, lz + 1.8], [lx + 13, 3.8, lz - 1.8], [lx + 0.5, door, lz - 1.8], [lx + 0.5, door, lz + 1.8], o([0.62, 0.64, 0.67]));
    F.quad([lx + 13, 3.6, lz - 1.8], [lx + 13, 3.6, lz + 1.8], [lx + 0.5, door - 0.2, lz + 1.8], [lx + 0.5, door - 0.2, lz - 1.8], o([0.4, 0.42, 0.45]));
    for (const sz of [-1.8, 1.8]) F.tube([lx + 13, 7, lz + sz], [lx + 0.8, door + 3, lz + sz], 0.12, 0.12, 4, o([0.85, 0.85, 0.85]));
  } else if (kind === 'tug') {
    F.box(lx, 1.5, lz, 2.6, 1.0, 4, o(tint(0xffc21a, 1.1)));
    F.box(lx, 3.4, lz - 1, 2.2, 1.0, 1.6, o(dark));
  } else if (kind === 'cart') {
    F.box(lx, 1.4, lz, 2.2, 0.3, 3.2, o([0.5, 0.52, 0.55]));
    F.box(lx, 2.9, lz, 2.0, 1.3, 2.9, o(r() < 0.5 ? tint(0x3a86ff, 1.1) : tint(0x6c757d, 1.1)));
  } else if (kind === 'fuel') {
    F.box(lx, 2.6, lz + 6, 3.2, 2.2, 3, o(tint(0xfbfbf8, 1.1)));
    F.tube([lx, 3.8, lz + 2], [lx, 3.8, lz - 12], 3.2, 3.2, 10, o(tint(0xd9d9d6, 1.1)));
    F.box(lx, 1.0, lz - 4, 3.0, 0.6, 9, o(dark));
  }
}

function mast(P, x, z) {
  const g = P.C.get('surf', x, z);
  cyl(g, x, GROUND, z, 1.1, 80, 8, { lay: L.concrete, tint: [0.78, 0.79, 0.8], scale: 10 });
  g.box(x, GROUND + 80, z, 4.5, 0.5, 2, 0, { lay: L.concrete, tint: [0.3, 0.31, 0.33] });
  for (const u of [-3, -1, 1, 3]) g.box(x - 1.2, GROUND + 82, z + u, 0.6, 1.4, 0.9, 0, { lay: L.whiteTiles, tint: [1, 0.95, 0.85], glow: 1 });
  P.box(x, GROUND + 40, z, 1.2, 40, 1.2, 0, 'metal', { pole: true });
}

function windsock(g, x, z) {
  cylAB(g, [x, GROUND, z], [x, GROUND + 22, z], 0.3, 0.2, 5, { lay: L.concrete, tint: [0.9, 0.9, 0.88] });
  // the sock streams downwind (the trade winds blow from the east-southeast)
  const dx = -0.93, dz = 0.36, n = 5, len = 12;
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const a = [x + dx * len * t0, GROUND + 21 - t0 * 2.4, z + dz * len * t0], b = [x + dx * len * t1, GROUND + 21 - t1 * 2.4, z + dz * len * t1];
    cylAB(g, a, b, 1.6 - t0 * 0.8, 1.6 - t1 * 0.8, 8, { lay: L.stucco, tint: k % 2 ? [1.2, 1.2, 1.2] : tint(0xff6a00, 1.25) });
  }
}
