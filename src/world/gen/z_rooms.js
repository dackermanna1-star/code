// Machine rooms for the maintenance tunnels, also registered as room pieces (a boiler room and a
// laundry) so that other generators can drop them into rectangular rooms they carve.
import { CF, M, ceilingLight, facing, stairs } from './common.js';
import { W_BLOCKS } from '../zonebuilder.js';
import { defineRoomPiece } from '../roompieces.js';
import { pipeRun, rod, floorLine } from './a_common.js';
import { lightState } from './z_util.js';
import './z_assets.js';

// Frame of a room seen from its door: u runs along the door wall, v away from it.
//   room: { x0, z0, x1, z1 (cells, exclusive end), dx, dz (direction from the door into the room) }
export function roomFrame(room) {
  const { x0, z0, x1, z1, dx, dz } = room;
  const alongZ = dz !== 0;
  const U = alongZ ? x1 - x0 : z1 - z0, V = alongZ ? z1 - z0 : x1 - x0;
  const pt = (u, v) => (alongZ ? [x0 + u, dz > 0 ? z0 + v : z1 - v] : [dx > 0 ? x0 + v : x1 - v, z0 + u]);
  const eu = alongZ ? [1, 0] : [0, 1], ev = [dx, dz];
  const vec = (du, dv) => [eu[0] * du + ev[0] * dv, eu[1] * du + ev[1] * dv];
  const rot = (du, dv) => { const w = vec(du, dv); return facing(w[0], w[1]); };
  return { U, V, pt, rot, eu, ev, vec };
}

// Find which side of a rect has the opening(s); returns the direction pointing into the room.
export function detectDoor(zb, rect) {
  const { x0, z0, x1, z1 } = rect;
  const open = (t) => t !== -1 && !W_BLOCKS.has(t);
  const cnt = { N: 0, S: 0, W: 0, E: 0 }, at = { N: -1, S: -1, W: -1, E: -1 };
  // the zone's own west / north border walls are written after gen(): count them as walls (except at gates)
  const edge = (x, z, e) => {
    if (!zb.in(x, z)) return -1;
    if ((e === 'W' && x === zb.x0) || (e === 'N' && z === zb.z0)) {
      return zb.gates.some((g) => g.x === x && g.z === z && g.side === e) ? 0 : 1;
    }
    return zb.getWall(x, z, e);
  };
  for (let x = x0; x < x1; x++) {
    if (open(edge(x, z0, 'N'))) { cnt.N++; if (at.N < 0) at.N = x - x0; }
    if (open(edge(x, z1, 'N'))) { cnt.S++; if (at.S < 0) at.S = x - x0; }
  }
  for (let z = z0; z < z1; z++) {
    if (open(edge(x0, z, 'W'))) { cnt.W++; if (at.W < 0) at.W = z - z0; }
    if (open(edge(x1, z, 'W'))) { cnt.E++; if (at.E < 0) at.E = z - z0; }
  }
  let best = 'S', bn = -1;
  for (const s of ['N', 'S', 'W', 'E']) if (cnt[s] > bn) { bn = cnt[s]; best = s; }
  const into = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[best];
  return { dx: into[0], dz: into[1], at: Math.max(0, at[best]), side: best };
}

const faceOf = (n) => (n[0] > 0.5 ? 'px' : n[0] < -0.5 ? 'nx' : n[1] > 0.5 ? 'pz' : 'nz');
const fy = (zb, x, z) => { const f = zb.getFloor(Math.floor(x), Math.floor(z)); return Number.isNaN(f) ? 0 : f; };
const rightOf = (rot) => [Math.cos(rot), Math.sin(rot)];

// ------------------------------------------------------------------ furnishing
// ctx: { zb, r (rng), lights: {fail, flicker} }; room.floorY: floor height (default 0)
export function furnishMachineRoom(zb, room, ctx) {
  const r = ctx.r;
  const F = roomFrame(room);
  const { U, V } = F;
  const H = room.ceil;
  const lights = ctx.lights || { fail: 0.3, flicker: 0.1 };
  const floorY = room.floorY ?? 0;
  const doorU = room.doorU ?? U / 2;
  // prop at frame position (u, v) facing frame direction (du, dv)
  const place = (type, u, v, du, dv, opts, y) => {
    const [x, z] = F.pt(u, v);
    const rot = F.rot(du, dv);
    zb.prop(type, x, y ?? floorY, z, rot, opts || {});
    return { x, z, rot, right: rightOf(rot) };
  };
  // decal on a room side: 'back' | 'front' | 'left' | 'right', t = position along it, y above the floor
  const onWall = (side, t, y, w, h, tex, opts) => {
    let u, v, nu, nv;
    if (side === 'back') { u = t; v = V - 0.1; nu = 0; nv = -1; }
    else if (side === 'front') { u = t; v = 0.1; nu = 0; nv = 1; }
    else if (side === 'left') { u = 0.1; v = t; nu = 1; nv = 0; }
    else { u = U - 0.1; v = t; nu = -1; nv = 0; }
    const [x, z] = F.pt(u, v);
    return zb.decal(x, floorY + y, z, faceOf(F.vec(nu, nv)), w, h, tex, opts);
  };
  const lightRow = (kind, nu, nv, extra) => {
    for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++) {
      const [x, z] = F.pt(((a + 0.5) * U) / nu, ((b + 0.5) * V) / nv);
      ceilingLight(zb, x, z, kind, lightState(r, lights.fail, lights.flicker), { rot: F.eu[0] !== 0 ? 1 : 0, mul: 1.25, ...extra });
    }
  };
  const drain = (u, v) => { const [x, z] = F.pt(u, v); zb.decal(x, floorY, z, 'up', 0.7, 0.7, 'z_drain', { rot: r.pick([0, 1.57]) }); };
  const puddle = (u, v, s) => {
    const [x, z] = F.pt(u, v);
    zb.decal(x, floorY, z, 'up', s, s, 'dec_puddle', { rot: r.range(0, 6.28) });
    zb.setFlag(Math.floor(x), Math.floor(z), CF.WET);
  };
  // pipe in frame space between (u0,v0) and (u1,v1) at heights (absolute y)
  const pipe = (u0, v0, y0, u1, v1, y1, rad, mat) => {
    const a = F.pt(u0, v0), b = F.pt(u1, v1);
    rod(zb, a[0], y0, a[1], b[0], y1, b[1], rad, mat);
  };
  const emit = (u, v, y, snd, opts) => { const [x, z] = F.pt(u, v); zb.emitter(x, y, z, snd, opts); };
  const nLights = (n, d) => Math.max(1, Math.round(n / d));

  switch (room.type) {
    case 'boiler': {
      const n = U >= 8 ? 2 : 1;
      const R = r.pick([0.7, 0.8, 0.9]), Hh = r.pick([1.9, 2.1, 2.3]);
      for (let k = 0; k < n; k++) {
        const u = n === 1 ? r.range(U * 0.35, U * 0.65) : ((k + 0.5) * U) / n + r.range(-0.2, 0.2);
        const v = V - R - 0.5;
        const b = place('a_boiler', u, v, 0, -1, { r: R, h: Hh, flue: H - 0.02, on: r.chance(0.5) });
        // the built-in pipes leave to the boiler's right (1.75 m up) and left (0.6 m up)
        const sgn = b.right[0] * F.eu[0] + b.right[1] * F.eu[1];
        const upEnd = [b.x + b.right[0] * (R + 0.55), b.z + b.right[1] * (R + 0.55)];
        const wallR = F.pt(sgn > 0 ? U - 0.14 : 0.14, v), wallL = F.pt(sgn > 0 ? 0.14 : U - 0.14, v);
        pipeRun(zb, [[upEnd[0], floorY + 1.75, upEnd[1]], [upEnd[0], H - 0.25, upEnd[1]], [wallR[0], H - 0.25, wallR[1]]], 0.06, 'pipe');
        const dnEnd = [b.x - b.right[0] * (R + 0.5), b.z - b.right[1] * (R + 0.5)];
        pipeRun(zb, [[dnEnd[0], floorY + 0.6, dnEnd[1]], [wallL[0], floorY + 0.6, wallL[1]]], 0.05, 'pipe_red');
        puddle(u + r.range(-0.8, 0.8), v - R - 0.8, r.range(0.9, 1.5));
        if (r.chance(0.6)) zb.light(b.x - F.ev[0] * (R + 0.45), floorY + 0.5, b.z - F.ev[1] * (R + 0.45), { rad: 3.4, int: 0.3, color: [1.0, 0.45, 0.15] });
      }
      drain(U * 0.5, V * 0.45);
      for (const [side, tt] of [['left', 0.14], ['right', U - 0.14]]) {
        if (!r.chance(0.8)) continue;
        const v0 = r.range(1.5, Math.max(1.6, V - 3.5));
        const nrm = F.vec(side === 'left' ? 1 : -1, 0);
        const a = F.pt(tt, v0), b = F.pt(tt, v0 + 2.2), m = F.pt(tt, v0 + 1.1);
        const off = 0.09;
        rod(zb, a[0] + nrm[0] * off, floorY + 1.3, a[1] + nrm[1] * off, b[0] + nrm[0] * off, floorY + 1.3, b[1] + nrm[1] * off, 0.05, 'pipe');
        zb.prop('a_valve', m[0] + nrm[0] * off, floorY + 1.3, m[1] + nrm[1] * off, facing(nrm[0], nrm[1]), {});
      }
      emit(U / 2, V - 1.5, floorY + 1.0, 'machine', { vol: 0.45, rad: 10 });
      onWall('left', V * 0.55, 1.45, 0.8, 0.8, 'z_controls');
      onWall('back', U < 8 ? 0.8 : U * 0.5, 2.1, 0.8, 0.8, 'a_sign_boiler');
      onWall('front', Math.min(U - 0.8, doorU + 1.6), 1.6, 0.5, 0.65, 'a_sign_nosmoke');
      place('a_drum', U - 0.5, 1.0, 0, -1);
      place('bucket', 0.5, 1.2, 0, -1);
      if (r.chance(0.6)) place('wet_sign', U * 0.5, V * 0.5, 0, -1);
      lightRow('tube', nLights(U, 4), nLights(V, 4));
      break;
    }
    case 'pump': {
      const n = Math.max(2, Math.min(4, Math.floor((U - 1) / 1.7)));
      const u0 = (U - (n - 1) * 1.7) / 2;
      const v = V - 0.65;
      for (let k = 0; k < n; k++) place('a_pump', u0 + k * 1.7, v, 0, -1, { on: r.chance(0.5), up: 1.35 });
      pipe(0.14, v, floorY + 1.37, U - 0.14, v, floorY + 1.37, 0.07, 'pipe');
      for (let k = 0; k < n; k++) {
        place('a_gauge', u0 + k * 1.7 - 0.35, v - 0.08, 0, -1, {}, floorY + 1.4);
        if (k % 2 === 0) place('a_valve', u0 + k * 1.7 + 0.75, v - 0.08, 0, -1, {}, floorY + 1.37);
      }
      pipe(0.14, V * 0.5, H - 0.2, U - 0.14, V * 0.5, H - 0.2, 0.06, 'pipe_red');
      puddle(U * 0.5 + r.range(-1, 1), V * 0.45, r.range(1.1, 1.8));
      puddle(r.range(1, U - 1), r.range(1.2, Math.max(1.3, V - 2)), r.range(0.8, 1.3));
      drain(U * 0.35, V * 0.4);
      onWall('left', V * 0.5, 1.5, 0.8, 0.8, 'z_controls');
      onWall('front', Math.max(0.8, doorU - 1.6), 1.7, 0.5, 0.5, 'a_sign_pump');
      emit(U / 2, V - 1, floorY + 0.8, 'water', { vol: 0.45, rad: 8 });
      emit(U / 2, V - 1, floorY + 1.0, 'machine', { vol: 0.4, rad: 9 });
      lightRow('tube', nLights(U, 4), nLights(V, 5));
      break;
    }
    case 'electrical': {
      const n = Math.max(1, Math.min(3, Math.floor((U - 1) / 1.8)));
      const u0 = (U - (n - 1) * 1.8) / 2;
      for (let k = 0; k < n; k++) place('a_transformer', u0 + k * 1.8, V - 0.62, 0, -1);
      const a = F.pt(0.35, V - 2.0), b = F.pt(U - 0.35, V - 2.0);
      floorLine(zb, a[0], a[1], b[0], b[1], 0.14, 'a_dec_line', floorY);
      for (const side of ['left', 'right']) {
        const tt = V * 0.45 + r.range(-0.5, 0.5);
        const [sx, sz] = F.pt(side === 'left' ? 0.1 : U - 0.1, tt);
        const nrm = F.vec(side === 'left' ? 1 : -1, 0);
        zb.prop('panel_elec', sx, floorY, sz, facing(nrm[0], nrm[1]), {});
        const t2 = F.pt(side === 'left' ? 0.1 : U - 0.1, tt + 1.1);
        zb.decal(t2[0], floorY + 1.4, t2[1], faceOf(nrm), 0.5, 0.7, 'a_breaker');
      }
      onWall('front', Math.min(U - 0.8, doorU + 1.4), 1.7, 0.7, 0.7, 'a_sign_danger');
      for (let k = 0; k < n; k++) {
        const c = F.pt(u0 + k * 1.8, V - 0.3);
        rod(zb, c[0], floorY + 1.7, c[1], c[0], H, c[1], 0.035, 'metal_dark');
      }
      const [lx, lz] = F.pt(U / 2, V - 1.2);
      zb.light(lx, floorY + 2.0, lz, { rad: 3.5, int: 0.16, color: [1.0, 0.3, 0.25] });
      lightRow('tube', nLights(U, 4), nLights(V, 5));
      break;
    }
    case 'tank': {
      const n = U >= 8 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const u = n === 1 ? U / 2 : ((k + 0.5) * U) / n;
        const len = Math.max(1.8, Math.min(3.2, U / n - 0.9)), tr = r.pick([0.55, 0.65]);
        const t = place('a_tank', u, V - 1.1, 0, -1, { r: tr, len });
        const cx = t.x + t.right[0] * len * 0.2, cz = t.z + t.right[1] * len * 0.2;
        rod(zb, cx, floorY + 2 * tr + 0.7, cz, cx, H, cz, 0.05, 'pipe');
      }
      const ln = F.pt(U - 0.5, V * 0.45);
      zb.prop('ladder', ln[0], floorY, ln[1], F.rot(-1, 0), { h: Math.min(H - 0.2, 2.4) });
      puddle(U * 0.4, V * 0.4, 1.4);
      drain(U * 0.6, V * 0.5);
      lightRow('bulb', nLights(U, 4), nLights(V, 4));
      break;
    }
    case 'control': {
      place('desk_metal', U * 0.55, V - 0.55, 0, -1);
      place('chair_office', U * 0.55 + r.range(-0.2, 0.2), V - 1.5, 0, 1);
      const [cx, cz] = F.pt(U * 0.55, V - 0.6);
      zb.prop('crt', cx, floorY + 0.78, cz, F.rot(0, -1), { screen: r.pick(['crt_green', 'crt_off', 'crt_off', 'static']) });
      place('filing_cabinet', U - 0.45, V - 0.45, 0, -1);
      place('shelf_metal', 0.45, V * 0.5, 1, 0, { w: 1.0 });
      onWall('back', U * 0.55, 1.5, 1.4, 1.4, 'z_controls');
      onWall('left', V - 1.3, 1.5, 0.7, 0.9, 'z_schematic');
      onWall('right', V * 0.5, 1.9, 0.5, 0.5, 'clock_a');
      place('trash_can', 0.4, 0.9, 0, 1);
      lightRow('tube', 1, 1);
      break;
    }
    case 'storage': {
      const nS = Math.max(1, Math.floor((U - 1) / 1.5));
      for (let k = 0; k < nS; k++) if (r.chance(0.8)) place('a_shelf', nS === 1 ? U / 2 : 0.8 + (k * (U - 1.6)) / (nS - 1), V - 0.4, 0, -1, { w: 1.2, d: 0.5, h: 2.0, n: 4 });
      for (let k = 0; k < 3; k++) if (r.chance(0.7)) place('a_drum', r.range(0.5, U - 0.5), r.range(1.4, Math.max(1.5, V - 2)), 0, 1);
      if (r.chance(0.7)) place('pallet', 0.8, V * 0.5, 0, 1);
      if (r.chance(0.7)) place('box_stack', U - 0.6, V * 0.5, 0, -1);
      if (r.chance(0.5)) place('cart_cleaning', U * 0.5, V * 0.4, 0, 1);
      lightRow('bulb', nLights(U, 4), nLights(V, 4));
      break;
    }
    case 'sump': {
      const n = 2;
      for (let k = 0; k < n; k++) place('a_pump', ((k + 0.5) * U) / n, V - 0.65, 0, -1, { on: r.chance(0.5), up: 1.9 });
      pipe(0.14, V - 0.65, floorY + 1.95, U - 0.14, V - 0.65, floorY + 1.95, 0.08, 'pipe');
      for (let k = 0; k < n; k++) {
        const c = F.pt(((k + 0.5) * U) / n, V - 0.65);
        rod(zb, c[0], floorY + 1.95, c[1], c[0], H, c[1], 0.06, 'pipe');
      }
      for (let k = 0; k < 3; k++) puddle(r.range(1, U - 1), r.range(2.5, Math.max(2.6, V - 1.5)), r.range(1.0, 1.9));
      drain(U * 0.5, V * 0.55);
      emit(U / 2, V / 2, floorY + 0.6, 'water', { vol: 0.55, rad: 9 });
      lightRow('cage', nLights(U, 4), nLights(V, 4), { hang: 1.5, rad: 6.6, mul: 1.6 });
      break;
    }
    case 'laundry': {
      laundry(zb, room, F, r, lights);
      break;
    }
    default: break;
  }
}

// ------------------------------------------------------------------ laundry
function laundry(zb, room, F, r, lights) {
  const { U, V } = F;
  const floorY = room.floorY ?? 0;
  const place = (type, u, v, du, dv, opts) => { const [x, z] = F.pt(u, v); return zb.prop(type, x, floorY, z, F.rot(du, dv), opts || {}); };
  const nW = Math.max(2, Math.floor((U - 0.6) / 0.72));
  const u0 = (U - nW * 0.72) / 2 + 0.36;
  let running = 0;
  for (let k = 0; k < nW; k++) {
    const run = running < 1 && r.chance(0.25);
    if (run) running++;
    if (r.chance(0.9)) place('washer', u0 + k * 0.72, V - 0.35, 0, -1, { running: run });
  }
  const nD = Math.max(0, Math.floor((V - 3.2) / 0.74));
  const side = r.chance(0.5);
  for (let k = 0; k < nD; k++) if (r.chance(0.85)) place('z_dryer', side ? 0.4 : U - 0.4, 1.6 + k * 0.74, side ? 1 : -1, 0, { running: r.chance(0.1) });
  if (U >= 5 && V >= 5) {
    place('table', U / 2, V * 0.45, 0, 1, { len: 1.8, depth: 0.8, top: 'plastic_white' });
    const [tx, tz] = F.pt(U / 2 + r.range(-0.5, 0.5), V * 0.45);
    zb.prop('papers', tx, floorY + 0.76, tz, 0, { n: r.int(1, 3) });
    place('z_basket', U / 2 + 1.6, V * 0.45 + r.range(-0.3, 0.3), r.range(-1, 1), 1, { full: r.chance(0.7) });
    if (r.chance(0.7)) place('z_basket', U / 2 - 1.5, V * 0.6, r.range(-1, 1), 1, { full: r.chance(0.4) });
  }
  place('z_basket', 0.9, V - 1.3, 0.3, 1, { full: false });
  const [px, pz] = F.pt(r.range(1, U - 1), r.range(1.2, Math.max(1.3, V - 2.2)));
  zb.decal(px, floorY, pz, 'up', r.range(1, 1.6), r.range(1, 1.6), 'dec_puddle', { rot: r.range(0, 6) });
  const [dx2, dz2] = F.pt(U * 0.5, V * 0.75);
  zb.decal(dx2, floorY, dz2, 'up', 0.7, 0.7, 'z_drain', {});
  const n = Math.max(1, Math.round(U / 3));
  for (let a = 0; a < n; a++) {
    const [x, z] = F.pt(((a + 0.5) * U) / n, V * 0.5);
    ceilingLight(zb, x, z, 'panel', lightState(r, lights.fail * 0.8, lights.flicker), {});
  }
}

// ------------------------------------------------------------------ room pieces for other generators
const far = (c, d) => c.dist === undefined || c.dist > d;
function pieceCtx(zb, rect, rng, type) {
  const d = detectDoor(zb, rect);
  const c = zb.getCeil(Math.floor((rect.x0 + rect.x1) / 2), Math.floor((rect.z0 + rect.z1) / 2));
  const room = { type, x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, dx: d.dx, dz: d.dz, ceil: Number.isNaN(c) ? 2.7 : c, doorU: d.at + 0.5 };
  return { room, ctx: { zb, r: rng, lights: { fail: 0.35, flicker: 0.1 } } };
}
defineRoomPiece('z_boiler_room', {
  minW: 5, minD: 5, maxW: 14, maxD: 12,
  weight: (c) => (far(c, 90) ? 0.9 : 0),
  build(zb, rect, rng) {
    const { room, ctx } = pieceCtx(zb, rect, rng, 'boiler');
    zb.rectFloor(rect.x0, rect.z0, rect.x1, rect.z1, 0, M.a_epoxy);
    furnishMachineRoom(zb, room, ctx);
  },
});
defineRoomPiece('z_laundry', {
  minW: 4, minD: 5, maxW: 12, maxD: 12,
  weight: (c) => (far(c, 70) ? 1.1 : 0),
  build(zb, rect, rng) {
    const { room, ctx } = pieceCtx(zb, rect, rng, 'laundry');
    zb.rectFloor(rect.x0, rect.z0, rect.x1, rect.z1, 0, rng.pick([M.lino_vct, M.tile_check, M.lino_green]));
    zb.rectWallMat(rect.x0, rect.z0, rect.x1, rect.z1, rng.pick([M.paint_cream, M.tile_white, M.paint_blue]));
    furnishMachineRoom(zb, room, ctx);
  },
});

// Lower a sump room's floor and build the steel stair down from its doorway cell.
export function sinkRoom(zb, room, depth) {
  const { x0, z0, x1, z1, dx, dz, door } = room;
  zb.fill(x0, z0, x1, z1, (x, z, i) => { zb.floor[i] = -depth; zb.fmat[i] = M.concrete_wet; zb.flags[i] |= CF.WET; });
  let sx0, sz0, sx1, sz1, dir;
  const run = 3;
  if (dx !== 0) {
    sz0 = door.z; sz1 = door.z + 1;
    if (sz1 < z1) sz1++; else sz0--;
    if (dx > 0) { sx0 = x0; sx1 = x0 + run; dir = '+x'; } else { sx1 = x1; sx0 = x1 - run; dir = '-x'; }
  } else {
    sx0 = door.x; sx1 = door.x + 1;
    if (sx1 < x1) sx1++; else sx0--;
    if (dz > 0) { sz0 = z0; sz1 = z0 + run; dir = '+z'; } else { sz1 = z1; sz0 = z1 - run; dir = '-z'; }
  }
  stairs(zb, sx0, sz0, sx1, sz1, dir, 0, -depth, M.metal_plate);
  return { x0: sx0, z0: sz0, x1: sx1, z1: sz1 };
}
