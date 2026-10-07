// A whole box-shaped building from a description: storeys of rooms with
// inside walls and doorways, outside walls with windows and doors, floors
// and ceilings with holes for the stairs, the stairs, a roof - and the rooms,
// doorways and stairs written down for the way-finding. Houses, flats,
// police stations, schools, barracks and the rest are this with different
// settings (and their own furniture).
import { mat } from './kit.js';
import { S, STOREY, wall, windowIn, doorIn, slab, stairs, railing, gableRoof, hipRoof, flatRoof, shedRoof, planWalls } from './parts.js';

/**
 * spec: {
 *   w, d: outer size; floors; H storey height; base: ground floor height; t: outer wall; it: inside walls;
 *   outer: surface (or fn(floor)); plinth; band (a surface for a band between storeys);
 *   plans: [plan per floor] (rooms in local coordinates inside the walls; see parts.plan);
 *   roomMat(room, f), floorMat(room, f), ceil;
 *   doors: [{ side, a, w, h, kind, f }] outside doors (side: 'pz' front | 'nz' back | 'px' | 'nx');
 *   win: { w, h, sill, every, style } | fn(side, f) -> that; noWin(side, f, a) -> true to leave a window out;
 *   stairs: [{ f, x, z, dir, w, run }] flights from floor f to f+1 (local; x, z where the bottom step starts);
 *   roof: { kind: gable | hip | flat | shed | none, mat, rise, axis, over, parapet, wall };
 *   furnish(K, room, f, y): fill a room.
 * }
 * Returns { top, rooms: [[...per floor]], floorY(f) }.
 */
export function body(K, spec) {
  const w = spec.w, d = spec.d, F = spec.floors ?? 1, H = spec.H ?? STOREY, base = spec.base ?? 1, t = spec.t ?? 0.8, it = spec.it ?? 0.5, st = spec.slabT ?? 0.6;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const ix0 = x0 + t, ix1 = x1 - t, iz0 = z0 + t, iz1 = z1 - t;
  const floorY = (f) => base + f * H;
  const top = floorY(F);
  const outer = typeof spec.outer === 'function' ? spec.outer : () => spec.outer;
  const roomMat = spec.roomMat || (() => mat('plaster', 0xe0dccc));
  const floorMat = spec.floorMat || (() => mat('woodFloor'));
  const ceil = spec.ceil || S.ceiling;
  const rooms = [];
  // the plinth (foundations showing above the ground) and the ground floor
  const plinth = spec.plinth || S.plinth;
  K.span(x0 - 0.15, -4, z0 - 0.15, x1 + 0.15, base, z1 + 0.15, { side: plinth, top: floorMat({ x0: ix0, z0: iz0, x1: ix1, z1: iz1 }, 0), bottom: plinth }, { skip: 'ny', aoF: { py: 0.56 } });

  for (let f = 0; f < F; f++) {
    const y0 = floorY(f), y1 = y0 + H;
    const P = spec.plans[Math.min(f, spec.plans.length - 1)];
    const fr = [];
    // where the stairs come up through this floor, and go up from it
    const up = (spec.stairs || []).filter((q) => q.f === f);
    const down = (spec.stairs || []).filter((q) => q.f === f - 1);
    // floors: each room its own finish (the ground floor sits on the plinth)
    K.indoors();
    for (const R of P.rooms) {
      const holes = down.map((q) => stairHole(q, H)).filter((h) => h.x1 > R.x0 && h.x0 < R.x1 && h.z1 > R.z0 && h.z0 < R.z1);
      if (R.noFloor && f > 0) { /* the template lays this one (stairwells) */ }
      else if (f === 0) K.span(R.x0, y0 - 0.06, R.z0, R.x1, y0 + 0.02, R.z1, floorMat(R, f), { col: false, skip: 'ny', ao: 0.56 });
      else slab(K, R.x0, R.z0, R.x1, R.z1, y0, st, floorMat(R, f), ceil, holes, { ao: 0.56, aoBelow: 0.56 });
      const room = K.room(R.x0, R.z0, R.x1, R.z1, y0, H - st, R.tag || '');
      room.plan = R; R.rec = room; room.floor = f;
      fr.push(room);
    }
    rooms.push(fr);
    K.outdoors();
    // the outside walls, with windows and doors
    const holes = { pz: [], nz: [], px: [], nx: [] };
    const doorsHere = (spec.doors || []).filter((q) => (q.f ?? 0) === f);
    for (const q of doorsHere) holes[q.side].push({ a: q.a, w: q.w ?? 4.4, y: y0, h: q.h ?? 7.6, kind: 'door', spec: q });
    const ws = typeof spec.win === 'function' ? null : spec.win;
    for (const side of ['pz', 'nz', 'px', 'nx']) {
      const W = ws || spec.win(side, f);
      if (!W) continue;
      // windows: a few along each room's stretch of this wall
      for (const R of P.rooms) {
        const touches = side === 'pz' ? R.z1 >= iz1 - 0.01 : side === 'nz' ? R.z0 <= iz0 + 0.01 : side === 'px' ? R.x1 >= ix1 - 0.01 : R.x0 <= ix0 + 0.01;
        if (!touches) continue;
        const a0 = side === 'pz' || side === 'nz' ? R.x0 : R.z0, a1 = side === 'pz' || side === 'nz' ? R.x1 : R.z1;
        const L = a1 - a0;
        if (L < W.w + 2.2) continue;
        const n = Math.max(1, Math.min(W.max ?? 9, Math.floor((L - 1.5) / (W.every ?? 9))));
        for (let i = 0; i < n; i++) {
          const a = a0 + L * (i + 0.5) / n;
          if (holes[side].some((h) => Math.abs(h.a - a) < (h.w + W.w) / 2 + 1)) continue;
          if (spec.noWin && spec.noWin(side, f, a, R)) continue;
          holes[side].push({ a, w: W.w, y: y0 + (W.sill ?? 3), h: W.h, kind: 'window', style: W.style });
        }
      }
    }
    const wm = outer(f);
    // each stretch of wall inside is finished like the room behind it
    const cutsX = [...new Set(P.rooms.flatMap((R) => [R.x0, R.x1]))], cutsZ = [...new Set(P.rooms.flatMap((R) => [R.z0, R.z1]))];
    const inMat = (side) => (a) => roomMat(roomAtWall(P, side, a, ix0, ix1, iz0, iz1) || P.rooms[0], f);
    wall(K, 'x', x0, x1, z1 - t / 2, y0, y1, t, wm, inMat('pz'), holes.pz, { out: 1, cuts: cutsX });
    wall(K, 'x', x0, x1, z0 + t / 2, y0, y1, t, wm, inMat('nz'), holes.nz, { out: -1, cuts: cutsX });
    wall(K, 'z', z0 + t, z1 - t, x1 - t / 2, y0, y1, t, wm, inMat('px'), holes.px, { out: 1, cuts: cutsZ });
    wall(K, 'z', z0 + t, z1 - t, x0 + t / 2, y0, y1, t, wm, inMat('nx'), holes.nx, { out: -1, cuts: cutsZ });
    // a band at the floor line
    if (spec.band && f > 0) K.span(x0 - 0.12, y0 - st - 0.1, z0 - 0.12, x1 + 0.12, y0 + 0.2, z1 + 0.12, spec.band, { col: false, skip: 'ny py' });
    // what each room needs to know to be furnished: its height, its windows, its doors
    for (const R of P.rooms) { R.h = H - st; R.wins = []; R.doors = []; }
    for (const side of ['pz', 'nz', 'px', 'nx']) for (const h of holes[side]) {
      const R = roomAtWall(P, side, h.a, ix0, ix1, iz0, iz1);
      if (!R) continue;
      const p = side === 'pz' ? { x: h.a, z: iz1 } : side === 'nz' ? { x: h.a, z: iz0 } : side === 'px' ? { x: ix1, z: h.a } : { x: ix0, z: h.a };
      (h.kind === 'window' ? R.wins : R.doors).push({ ...p, w: h.w, sill: h.y - y0, h: h.h });
    }
    for (const wl of P.walls) if (wl.door) {
      const p = wl.axis === 'x' ? { x: wl.door.a, z: wl.at } : { x: wl.at, z: wl.door.a };
      P.rooms[wl.ra].doors?.push({ ...p, w: wl.door.w }); P.rooms[wl.rb].doors?.push({ ...p, w: wl.door.w });
    }
    for (const side of ['pz', 'nz', 'px', 'nx']) {
      const axis = side === 'pz' || side === 'nz' ? 'x' : 'z';
      const c = side === 'pz' ? z1 - t / 2 : side === 'nz' ? z0 + t / 2 : side === 'px' ? x1 - t / 2 : x0 + t / 2;
      const out = side === 'pz' || side === 'px' ? 1 : -1;
      for (const h of holes[side]) {
        if (h.kind === 'window') windowIn(K, axis, c, t, out, h, h.style || {});
        else {
          const R = roomAtWall(P, side, h.a, ix0, ix1, iz0, iz1);
          const L = K.link(R ? fr[P.rooms.indexOf(R)] : null, null, axis === 'x' ? h.a : c + out * (t / 2 + 1.5), y0, axis === 'x' ? c + out * (t / 2 + 1.5) : h.a, h.w);
          L.outside = true;
          const D = doorIn(K, axis, c, t, h, h.spec.kind === undefined ? 'wood' : h.spec.kind, { link: L, hinge: h.spec.hinge, open: h.spec.open, locked: h.spec.locked });
          void D;
          // a step up to the door
          if (f === 0 && base > 0.6) {
            const sx = axis === 'x' ? h.a : c + out * (t / 2 + 1.1), sz = axis === 'x' ? c + out * (t / 2 + 1.1) : h.a;
            K.box(sx, base / 2, sz, axis === 'x' ? h.w / 2 + 1 : 1.1, base / 2, axis === 'x' ? 1.1 : h.w / 2 + 1, S.step, { skip: 'ny' });
          }
          if (h.spec.canopy) {
            const cx = axis === 'x' ? h.a : c + out * (t / 2 + 1.8), cz = axis === 'x' ? c + out * (t / 2 + 1.8) : h.a;
            K.box(cx, y0 + h.h + 1.2, cz, axis === 'x' ? h.w / 2 + 1.5 : 1.8, 0.2, axis === 'x' ? 1.8 : h.w / 2 + 1.5, h.spec.canopy, { col: false });
          }
        }
      }
    }
    // inside walls and doorways
    K.indoors();
    planWalls(K, P, y0, y1 - st, it, (R) => roomMat(R, f), { doorKind: spec.innerDoor });
    for (const wl of P.walls) if (wl.door) {
      const a = fr[wl.ra], b = fr[wl.rb];
      const x = wl.axis === 'x' ? wl.door.a : wl.at, z = wl.axis === 'x' ? wl.at : wl.door.a;
      const L = K.link(a, b, x, y0, z, wl.door.w);
      if (wl.door.rec) { wl.door.rec.link = L; L.door = wl.door.rec; }
    }
    // keep furniture off the stairs (both ends)
    for (const q of [...up, ...down]) {
      const run = q.run ?? 13, hw = (q.w ?? 3.8) / 2 + 0.6;
      const ex = q.x + (q.dir === 'px' ? run : q.dir === 'nx' ? -run : 0), ez = q.z + (q.dir === 'pz' ? run : q.dir === 'nz' ? -run : 0);
      const box = { x0: Math.min(q.x, ex) - hw - 2.5, x1: Math.max(q.x, ex) + hw + 2.5, z0: Math.min(q.z, ez) - hw - 2.5, z1: Math.max(q.z, ez) + hw + 2.5 };
      for (const R of P.rooms) if (box.x1 > R.x0 && box.x0 < R.x1 && box.z1 > R.z0 && box.z0 < R.z1) (R.keepOut || (R.keepOut = [])).push(box);
    }
    // the stairs up from here
    for (const q of up) {
      const run = q.run ?? 13, rise = H;
      stairs(K, q.x, q.z, q.dir, q.w ?? 3.8, y0, rise, run, q.mat || S.step, { ao: 0.45 });
      const end = { x: q.x + (q.dir === 'px' ? run : q.dir === 'nx' ? -run : 0), z: q.z + (q.dir === 'pz' ? run : q.dir === 'nz' ? -run : 0) };
      const ra = roomAt(P, q.x, q.z), P2 = spec.plans[Math.min(f + 1, spec.plans.length - 1)], rb = roomAt(P2, end.x, end.z);
      q.links = q.links || [];
      q.from = { f, room: ra }; q.to = { f: f + 1, room: rb, x: end.x, z: end.z };
      q.bottom = [q.x, y0, q.z]; q.topPt = [end.x, y0 + H, end.z];
    }
    // railings round the stair holes on this floor
    for (const q of down) {
      const h = stairHole(q, H);
      if (q.rail === false) continue;
      const along = q.dir === 'px' || q.dir === 'nx';
      if (along) { railing(K, h.x0, h.z0, h.x1, h.z0, y0); railing(K, h.x0, h.z1, h.x1, h.z1, y0); }
      else { railing(K, h.x0, h.z0, h.x0, h.z1, y0); railing(K, h.x1, h.z0, h.x1, h.z1, y0); }
    }
    // the furniture
    // (a snapshot of the room: plans can be shared between floors)
    if (spec.furnish) for (const R of P.rooms) { const room = fr[P.rooms.indexOf(R)], snap = { ...R, wins: (R.wins || []).slice(), doors: (R.doors || []).slice(), keepOut: (R.keepOut || []).slice(), floor: f }; K.defer(() => spec.furnish(K, snap, f, y0, room)); }
    K.outdoors();
  }
  // join the floors' rooms by the stairs
  for (const q of spec.stairs || []) {
    if (!q.from || !q.to) continue;
    const ra = q.from.room ? rooms[q.from.f][spec.plans[Math.min(q.from.f, spec.plans.length - 1)].rooms.indexOf(q.from.room)] : null;
    const rb = q.to.room ? rooms[q.to.f]?.[spec.plans[Math.min(q.to.f, spec.plans.length - 1)].rooms.indexOf(q.to.room)] : null;
    K.stairLink(ra, rb, q.bottom[0], q.bottom[1], q.bottom[2], q.topPt[0], q.topPt[1], q.topPt[2]);
  }
  // the roof
  const R = spec.roof || { kind: 'gable' };
  if (R.kind === 'flat') flatRoof(K, x0, z0, x1, z1, top, R.mat || mat('concrete', 0x8a8680), { wall: outer(F - 1), parapet: R.parapet ?? 1.6, ceiling: ceil, holes: R.holes });
  else if (R.kind !== 'none') {
    // a ceiling under the roof space
    slab(K, ix0, iz0, ix1, iz1, top, 0.4, mat('planks', 0x9a8a78), ceil, [], { ao: 0.3, aoBelow: 0.56 });
    K.span(x0, top - 0.01, z0, x1, top + 0.4, z1, outer(F - 1), { col: false, skip: 'ny py' });
    const yr = top + 0.4;
    if (R.kind === 'gable') gableRoof(K, x0, z0, x1, z1, yr, R.rise ?? Math.min(w, d) * 0.32, R.mat, R.wall || outer(F - 1), { axis: R.axis, over: R.over });
    else if (R.kind === 'hip') hipRoof(K, x0, z0, x1, z1, yr, R.rise ?? Math.min(w, d) * 0.3, R.mat, { over: R.over });
    else if (R.kind === 'shed') shedRoof(K, x0, z0, x1, z1, yr, yr + (R.rise ?? 3), R.mat, { over: R.over, sides: true, wall: outer(F - 1) });
  }
  return { top, rooms, floorY, ix0, ix1, iz0, iz1 };
}

/** The rectangle to leave open over a flight of stairs (from 35% of the way up, so you don't bang your head). */
export function stairHole(q, H) {
  const run = q.run ?? 13, w = (q.w ?? 3.8) + 0.4, k = 0.32;
  if (q.dir === 'pz') return { x0: q.x - w / 2, x1: q.x + w / 2, z0: q.z + run * k, z1: q.z + run + 0.3 };
  if (q.dir === 'nz') return { x0: q.x - w / 2, x1: q.x + w / 2, z0: q.z - run - 0.3, z1: q.z - run * k };
  if (q.dir === 'px') return { x0: q.x + run * k, x1: q.x + run + 0.3, z0: q.z - w / 2, z1: q.z + w / 2 };
  return { x0: q.x - run - 0.3, x1: q.x - run * k, z0: q.z - w / 2, z1: q.z + w / 2 };
}

function roomAt(P, x, z) { return P.rooms.find((R) => x >= R.x0 - 0.5 && x <= R.x1 + 0.5 && z >= R.z0 - 0.5 && z <= R.z1 + 0.5) || null; }
function roomAtWall(P, side, a, ix0, ix1, iz0, iz1) {
  if (side === 'pz') return roomAt(P, a, iz1 - 1);
  if (side === 'nz') return roomAt(P, a, iz0 + 1);
  if (side === 'px') return roomAt(P, ix1 - 1, a);
  return roomAt(P, ix0 + 1, a);
}
export { wall };
