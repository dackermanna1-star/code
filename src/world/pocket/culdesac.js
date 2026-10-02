// Pocket 4: The Infinite Cul-de-Sac. A wide road that curves away forever (a ring 140 m in radius,
// so a lap is nearly a kilometre) bordered on both sides by identical two-storey brick houses
// with no windows, only a garage standing open on a concrete wall one metre inside. Sodium lamps
// stand on the pavements, the sky is a dusk that never gets any darker. The return vestibule is
// a brick pump house standing in the middle of the road at the ring's west point.
// Everything is a function of the coordinates, so each zone computes its own slice of the ring.
import { defineZone } from '../zonetypes.js';
import { definePocket } from '../pockets.js';
import { M, env } from '../gen/common.js';
import { defineTexture } from '../../gfx/textures.js';
import { voidAll, shelledReturn, owns, hr } from './e_util.js';
import './eh_common.js';
import { HWID, HDEP, GAR, ALC } from './eh_brick.js';

const ID = 4;
const ENTRY = { level: 0, ox: 158, oz: 150 };
const R = 140;                                    // radius of the road's centre line
const CX = ENTRY.ox + 1.5 + R, CZ = ENTRY.oz + 3.5; // ring centre: the shed sits on the west point
const GROUND = 0.15;                              // pavement and lawn level (road is 0)
// radial layout (distance from the centre line)
const ROAD = 8, WALK = 10.5, LAWN = 32, WALL = 34;
const FACADE = 17;                                // facades stand 17 m from the centre line
const N_OUT = 72, N_IN = 53;                      // houses on the outer / inner side
const NL_OUT = 42, NL_IN = 37;                    // streetlamps
const TAU = Math.PI * 2;

definePocket(ID, { name: 'culdesac', zoneType: 'p_culdesac', sign: 'eh_sign_culdesac', entry: ENTRY });
// a street-name style sign: white frame on green, NO big, OUTLET beneath
defineTexture('eh_sign_culdesac', (p) => {
  const fg = [238, 236, 222];
  p.fill([28, 82, 50]);
  p.frame(2, 2, 60, 60, fg);
  p.frame(3, 3, 58, 58, fg);
  p.text('NO', 15, 11, fg, 3);
  p.text('OUTLET', 14, 40, fg, 1);
}, 8);

// ------------------------------------------------------------------ layout
const rot2f = (fx, fz) => Math.atan2(fx, -fz);

// house k on a side (0 outer, 1 inner): anchor at the middle of the facade, facing the road
function house(side, k) {
  const sgn = side === 0 ? 1 : -1, N = side === 0 ? N_OUT : N_IN;
  const th = (k + (side ? 0.5 : 0)) * (TAU / N);
  const ux = Math.cos(th), uz = Math.sin(th);
  const ax = CX + (R + sgn * FACADE) * ux, az = CZ + (R + sgn * FACADE) * uz;
  const fx = -sgn * ux, fz = -sgn * uz;
  const rot = rot2f(fx, fz);
  return { side, k, th, ax, az, fx, fz, rot, tx: Math.cos(rot), tz: Math.sin(rot), cx: ax - fx * HDEP / 2, cz: az - fz * HDEP / 2 };
}

// distance from point to an axis aligned rect (0 inside)
const rectDist = (x, z, x0, z0, x1, z1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));

// Invisible collision for a rotated house: z-strips of the footprint polygon with the garage
// opening carved out, clipped to the zone.
function houseCollision(zb, h) {
  // local (x across the facade, z into the house) -> world
  const loc = (xl, zl) => [h.ax + xl * h.tx - zl * h.fx, h.az + xl * h.tz - zl * h.fz];
  const body = [loc(-HWID, 0), loc(HWID, 0), loc(HWID, HDEP), loc(-HWID, HDEP)];
  const alc = [loc(-GAR, -1), loc(GAR, -1), loc(GAR, ALC), loc(-GAR, ALC)];
  const span = (poly, zc) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 4; i++) {
      const P = poly[i], Q = poly[(i + 1) % 4];
      if ((P[1] - zc) * (Q[1] - zc) > 0 || P[1] === Q[1]) continue;
      const x = P[0] + ((zc - P[1]) / (Q[1] - P[1])) * (Q[0] - P[0]);
      if (x < lo) lo = x; if (x > hi) hi = x;
    }
    return hi > lo ? [lo, hi] : null;
  };
  let zmin = Infinity, zmax = -Infinity;
  for (const p of body) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const Z0 = Math.max(zmin, zb.z0), Z1 = Math.min(zmax, zb.z1);
  for (let za = Math.floor(Z0 * 2) / 2; za < Z1; za += 0.5) {
    const zc = za + 0.25;
    const s = span(body, zc);
    if (!s) continue;
    const a = span(alc, zc);
    const pieces = [];
    if (a && a[1] > s[0] && a[0] < s[1]) {
      if (a[0] - s[0] > 0.05) pieces.push([s[0], a[0]]);
      if (s[1] - a[1] > 0.05) pieces.push([a[1], s[1]]);
    } else pieces.push(s);
    for (const [xa, xb] of pieces) {
      const x0 = Math.max(xa, zb.x0), x1 = Math.min(xb, zb.x1), z0 = Math.max(za, zb.z0), z1 = Math.min(za + 0.5, zb.z1);
      if (x1 - x0 > 0.02 && z1 - z0 > 0.02) zb.box(x0, GROUND - 0.2, z0, x1, 9, z1, M.eh_brick, { render: false });
    }
  }
}

// ------------------------------------------------------------------ the zone
function genCuldesac(zb) {
  const lev = zb.zone.level;
  voidAll(zb);
  if (lev !== 0) return;
  // nothing to do for zones that never touch the ring's band
  const dmin = rectDist(CX, CZ, zb.x0, zb.z0, zb.x1, zb.z1);
  const dmax = Math.max(Math.hypot(zb.x0 - CX, zb.z0 - CZ), Math.hypot(zb.x1 - CX, zb.z0 - CZ), Math.hypot(zb.x0 - CX, zb.z1 - CZ), Math.hypot(zb.x1 - CX, zb.z1 - CZ));
  if (dmax < R - WALL - 1 || dmin > R + WALL + 1) return;

  // ---- ground: road, pavements, lawns, and the high wall that ends the back yards
  for (let z = zb.z0; z < zb.z1; z++) {
    for (let x = zb.x0; x < zb.x1; x++) {
      const a = Math.abs(Math.hypot(x + 0.5 - CX, z + 0.5 - CZ) - R);
      if (a > WALL) continue;
      const i = zb.i(x, z);
      zb.flags[i] = 0; zb.ceil[i] = NaN;
      if (a <= ROAD) { zb.floor[i] = 0; zb.fmat[i] = M.eh_asphalt; zb.wmat[i] = M.eh_asphalt; }
      else if (a <= WALK) { zb.floor[i] = GROUND; zb.fmat[i] = M.sidewalk; zb.wmat[i] = M.sidewalk; }
      else if (a <= LAWN) { zb.floor[i] = GROUND; zb.fmat[i] = M.grass_dead; zb.wmat[i] = M.sidewalk; }
      else { zb.floor[i] = GROUND; zb.fmat[i] = M.grass_dead; zb.solid[i] = M.concrete_dark; zb.wmat[i] = M.concrete_dark; }
    }
  }

  // ---- the pump house in the middle of the road
  if (zb.in(ENTRY.ox, ENTRY.oz)) {
    const shed = shelledReturn(zb, ID, ENTRY, { floorMat: M.concrete_floor, shellMat: M.eh_brick, height: 3.3, roofMat: M.concrete_dark, roofOver: 0.35, roofT: 0.25 });
    if (shed) dressShed(zb, shed);
  }

  // ---- houses
  for (let side = 0; side < 2; side++) {
    const N = side === 0 ? N_OUT : N_IN;
    for (let k = 0; k < N; k++) {
      const h = house(side, k);
      if (rectDist(h.cx, h.cz, zb.x0, zb.z0, zb.x1, zb.z1) > 8.5) continue;
      houseCollision(zb, h);
      if (!owns(zb, h.ax, h.az)) continue;
      const shade = 0.9 + hr(side, k, 5) * 0.2;
      zb.prop('eh_brickhouse', h.ax, GROUND, h.az, h.rot, { shade, hum: (k & 1) === 0, collide: false, drive: FACADE - ROAD });
      // a lamp over the back yard on every other house
      if (k & 1) zb.light(h.ax - h.fx * (HDEP + 0.6), GROUND + 4.4, h.az - h.fz * (HDEP + 0.6), { rad: 8, int: 0.8, color: [1.0, 0.8, 0.52] });
    }
  }

  // ---- streetlamps on the pavements, the two sides staggered
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1, N = side === 0 ? NL_OUT : NL_IN;
    for (let j = 0; j < N; j++) {
      const th = (j + (side ? 0.75 : 0.25)) * (TAU / N);
      const ux = Math.cos(th), uz = Math.sin(th);
      const x = CX + (R + sgn * 9.8) * ux, z = CZ + (R + sgn * 9.8) * uz;
      if (!owns(zb, x, z)) continue;
      const rot = rot2f(-sgn * ux, -sgn * uz);
      // most lamps burn steadily; a few stutter, a few have gone out
      const u = hr(side + 7, j, 11);
      const dead = u < 0.06;
      const ch = dead ? 0 : u < 0.13 ? 5 + (j & 3) : u < 0.2 ? 1 + (j & 3) : 0;
      zb.prop('eh_streetlamp', x, GROUND, z, rot, { hum: j % 3 === 0, dead, ch });
      // a second, lower light under the lamp head widens the pool of light on the road
      const fx = -sgn * ux, fz = -sgn * uz;
      if (!dead) zb.light(x + fx * 2.1, GROUND + 2.4, z + fz * 2.1, { rad: 8, int: 1.5, color: [1.0, 0.74, 0.42], ch });
    }
  }

  // ---- NO OUTLET signs: one either side of the pump house, then every 36 degrees round the ring
  const signs = [[Math.PI + 0.085, 1], [Math.PI - 0.085, -1]];
  for (let k = 1; k < 10; k++) signs.push([Math.PI + 0.085 + k * (TAU / 10), k & 1 ? -1 : 1]);
  for (const [th, sgn] of signs) {
    const ux = Math.cos(th), uz = Math.sin(th);
    const x = CX + (R + sgn * 9.2) * ux, z = CZ + (R + sgn * 9.2) * uz;
    if (owns(zb, x, z)) zb.prop('eh_roadsign', x, GROUND, z, rot2f(-sgn * ux, -sgn * uz), {});
  }

  // ---- lantern posts in the back yards, so that the far wall shows as a faint warm glow
  for (let side = 0; side < 2; side++) {
    const sgn = side === 0 ? 1 : -1, N = side === 0 ? 40 : 26;
    for (let j = 0; j < N; j++) {
      const th = (j + 0.5) * (TAU / N) + (side ? 0.1 : 0);
      const x = CX + (R + sgn * 28.2) * Math.cos(th), z = CZ + (R + sgn * 28.2) * Math.sin(th);
      if (owns(zb, x, z)) zb.prop('eh_gardenlamp', x, GROUND, z, 0, {});
    }
  }

  // ---- road paint: double yellow centre line, white edge lines. Long decals z-fight with the
  // 1 m ground quads near the camera (their snapped vertices disagree about depth), so each
  // 4.2 m stretch is laid as three short pieces.
  const NS = Math.round((TAU * R) / 4.2), PIECES = 3;
  for (let m = 0; m < NS * PIECES; m++) {
    const th = (m + 0.5) * (TAU / (NS * PIECES));
    const ux = Math.cos(th), uz = Math.sin(th), rot = th + Math.PI;
    const px = CX + R * ux, pz = CZ + R * uz;
    if (!owns(zb, px, pz)) continue;
    const nearShed = Math.hypot(px - (ENTRY.ox + 1.5), pz - (ENTRY.oz + 3.5)) < 8.5;
    const len = (4.2 / PIECES) * 1.04;
    if (!nearShed) for (const d of [-0.16, 0.16]) zb.decal(CX + (R + d) * ux, 0, CZ + (R + d) * uz, 'up', 0.12, len, 'eh_paint_y', { rot });
    for (const d of [-7.35, 7.35]) zb.decal(CX + (R + d) * ux, 0, CZ + (R + d) * uz, 'up', 0.12, len, 'eh_paint_w', { rot });
  }

  // ---- ambience: the low note of a transformer somewhere
  const mx = (zb.x0 + zb.x1) / 2, mz = (zb.z0 + zb.z1) / 2;
  if (Math.abs(Math.hypot(mx - CX, mz - CZ) - R) < 40) zb.emitter(mx, 3, mz, 'drone', { vol: 0.16, rad: 40 });
}

// the pump house: a cage lamp over each door, a vent in the brick
function dressShed(zb, v) {
  const H = v.H;
  const [sx, sz] = v.southDoor, [nx, nz] = v.northDoor;
  zb.fixture(sx, sz - 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(sx, H - 0.6, sz, { rad: 7, int: 0.7, color: [0.95, 0.9, 0.75] });
  zb.fixture(nx, nz + 0.2, 'cage', true, { y: H, hang: 0.3 });
  zb.light(nx, H - 0.6, nz, { rad: 7, int: 0.7, color: [0.95, 0.9, 0.75] });
  zb.decal(v.x0, 2.3, v.oz + 3.5, 'nx', 0.9, 0.6, 'dec_vent');
  zb.decal(v.x1, 2.3, v.oz + 3.5, 'px', 0.9, 0.6, 'dec_vent');
}

defineZone('p_culdesac', {
  border: 'open', gate: 'open', dims: [ID],
  allowStairs: false, allowPortals: false,
  weight: () => 0,
  params: () => ({
    wallMat: M.eh_brick, floorMat: M.eh_asphalt, ceilMat: M.concrete_dark, ceilH: 3,
    ambient: [0.17, 0.17, 0.27],
    env: env({ fog: [0.12, 0.125, 0.22], fogNear: 8, fogFar: 56, hum: 0.0, hvac: 0.0, reverb: 'outdoor', tone: 'dark' }),
  }),
  gen: genCuldesac,
});
