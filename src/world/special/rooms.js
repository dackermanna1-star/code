// Room set-pieces: strange rooms that ordinary generators hand over through tryRoomPiece().
// Walls and doors already exist when build() runs; every piece adds its own lights.
import { defineRoomPiece } from '../roompieces.js';
import { CF, M, ceilingLight, facing } from '../gen/common.js';
import { key, clearMask, sideIsWall, solidAt, paintSide, paintRoom, SIDE_DIR, SIDE_FACE, onSide, sideLen, openingsOn } from './util.js';

const TAU = Math.PI * 2;
const far = (c, d) => c.dist === undefined || c.dist > d;
const floorAt = (zb, x, z) => { const f = zb.getFloor(Math.floor(x), Math.floor(z)); return Number.isNaN(f) ? 0 : f; };
const ceilAt = (zb, x, z) => { const c = zb.getCeil(Math.floor(x), Math.floor(z)); return Number.isNaN(c) ? 2.7 : c; };
// tryRoomPiece() currently passes only the zone ctx to weight(), which says nothing about the zone
// type; these also accept the zone builder / room as extra arguments, should they ever be passed.
const isSchool = (c, zb, rect) => (zb && zb.zone && zb.zone.type === 'school') || (rect && rect.type === 'classroom') || c.type === 'school' || c.zoneType === 'school';

// Sides of a room ranked for "a wall to face": no openings first, then walls we own, then longest.
function rankSides(zb, rect, only) {
  return (only || ['N', 'S', 'W', 'E'])
    .map((s) => ({ s, open: openingsOn(zb, rect, s), own: sideIsWall(zb, rect, s) ? 1 : 0, len: sideLen(rect, s) }))
    .sort((a, b) => a.open - b.open || b.own - a.own || b.len - a.len);
}
// interior cell next to a point on a side
function cellOnSide(rect, side, t) {
  const p = onSide(rect, side, t);
  const [dx, dz] = SIDE_DIR[side];
  return [Math.floor(p.x - dx * 0.5), Math.floor(p.z - dz * 0.5)];
}
// is there real wall behind this point of a side (no door / opening), and is the cell in front free?
function wallAt(zb, rect, side, t) {
  const [cx, cz] = cellOnSide(rect, side, t);
  if (!zb.in(cx, cz) || zb.solid[zb.i(cx, cz)]) return false;
  return solidAt(zb, rect, side, t);
}

// Longest stretch [t0, t1] of a side that is solid wall (cells sampled at their centres).
function longestRun(zb, rect, side) {
  const L = sideLen(rect, side);
  let best = [0, 0], start = -1;
  for (let k = 0; k <= L; k++) {
    const ok = k < L && wallAt(zb, rect, side, k + 0.5);
    if (ok && start < 0) start = k;
    if (!ok && start >= 0) { if (k - start > best[1] - best[0]) best = [start, k]; start = -1; }
  }
  return best;
}
// a span of wall [t - hw, t + hw] free of openings?
const spanFree = (zb, rect, side, t, hw) => wallAt(zb, rect, side, t) && wallAt(zb, rect, side, Math.max(0.01, t - hw)) && wallAt(zb, rect, side, Math.min(sideLen(rect, side) - 0.01, t + hw));

// ------------------------------------------------------------------ The Orientation Circle
// Twelve folding chairs in a tight ring around a warm floor duct, all facing it. One light.
defineRoomPiece('orientation_circle', {
  minW: 5, minD: 5, maxW: 10, maxD: 10,
  weight: (c) => (far(c, 140) ? 1 : 0),
  build(zb, rect, rng) {
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    const y = floorAt(zb, cx, cz);
    zb.decal(cx, y, cz, 'up', 0.62, 0.62, 'dec_vent_floor', { rot: rng.pick([0, Math.PI / 2]) });
    zb.emitter(cx, y + 0.2, cz, 'vent', { vol: 0.6, rad: 7 });
    // the air coming out of it is warm: a faint amber glow on the seats nearest to it
    zb.light(cx, y + 0.3, cz, { rad: 2.6, int: 0.22, color: [1.0, 0.7, 0.45] });
    const R = rng.range(1.12, 1.28), a0 = rng.range(0, TAU);
    for (let k = 0; k < 12; k++) {
      const a = a0 + (k / 12) * TAU + rng.range(-0.03, 0.03);
      const x = cx + Math.sin(a) * R, z = cz - Math.cos(a) * R;
      zb.prop('chair_folding', x, floorAt(zb, x, z), z, facing(cx - x, cz - z) + rng.range(-0.07, 0.07), { dent: true });
    }
    ceilingLight(zb, cx, cz, rng.chance(0.6) ? 'bulb' : 'panel', 'on', { color: [1.0, 0.9, 0.76], rad: 5.5 });
  },
});

// ------------------------------------------------------------------ The Blind Vigil
// A row of padded executive chairs pushed against one long, seamless, windowless wall, all
// facing it. The wall beats, slowly; the lights pulse with it.
defineRoomPiece('blind_vigil', {
  minW: 9, minD: 3, maxW: 40, maxD: 9,
  weight: (c) => (far(c, 160) ? 0.9 : 0),
  build(zb, rect, rng) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const side = rankSides(zb, rect, w >= d ? ['N', 'S'] : ['W', 'E'])[0].s;
    paintSide(zb, rect, side, M.plaster, { noWindows: true });
    const keep = clearMask(zb, rect, 1);
    const L = sideLen(rect, side);
    const [ox, oz] = SIDE_DIR[side];
    // walls meeting this one from the far side leave a post in someone else's paint: plaster over it
    for (let t = 1; t < L; t++) {
      const vx = side === 'N' || side === 'S' ? rect.x0 + t : side === 'W' ? rect.x0 : rect.x1;
      const vz = side === 'W' || side === 'E' ? rect.z0 + t : side === 'N' ? rect.z0 : rect.z1;
      const outer = side === 'N' ? zb.getWall(vx, vz - 1, 'W') : side === 'S' ? zb.getWall(vx, vz, 'W') : side === 'W' ? zb.getWall(vx - 1, vz, 'N') : zb.getWall(vx, vz, 'N');
      if (outer > 0) {
        const p = onSide(rect, side, t);
        zb.decal(p.x, ceilAt(zb, p.x - ox * 0.5, p.z - oz * 0.5) / 2, p.z, SIDE_FACE[side], 0.34, ceilAt(zb, p.x - ox * 0.5, p.z - oz * 0.5), 'plaster');
      }
    }
    const fab = rng.pick(['fabric_brown', 'fabric_brown', 'fabric_gray', 'plastic_black']);
    const pitch = rng.range(0.76, 0.86);
    const n = Math.floor((L - 0.4) / pitch);
    const start = (L - n * pitch) / 2 + pitch / 2;
    for (let k = 0; k < n; k++) {
      const pt = onSide(rect, side, start + k * pitch);
      const x = pt.x - ox * 0.34, z = pt.z - oz * 0.34;
      if (keep.has(key(Math.floor(x), Math.floor(z)))) continue;
      if (!wallAt(zb, rect, side, start + k * pitch)) continue;
      zb.prop('chair_exec', x, floorAt(zb, x, z), z, facing(ox, oz) + rng.range(-0.02, 0.02), { fabric: fab });
    }
    for (let t = 1.4; t < L - 0.5; t += 3.2) {
      const pt = onSide(rect, side, t);
      zb.emitter(pt.x, 1.3, pt.z, 'heartbeat', { vol: 0.24, rad: 6.5 });
    }
    // lights on the heartbeat channel, hung a little way out from the wall
    const out = Math.min(1.4, (side === 'N' || side === 'S' ? d : w) / 2);
    for (let t = 2; t < L - 1; t += 4) {
      const pt = onSide(rect, side, t);
      const x = pt.x - ox * out, z = pt.z - oz * out;
      const c = ceilAt(zb, x, z);
      zb.fixture(x, z, 'panel', true, { ch: 15 });
      zb.light(x, c - 0.55, z, { rad: 5.8, int: 0.62, ch: 15, color: [1.0, 0.92, 0.84] });
    }
  },
});

// ------------------------------------------------------------------ The Submerged Classroom
// A 1990s elementary classroom whose linoleum has melted into thick pale blue gel; the desks have
// sunk into it in their neat rows.
defineRoomPiece('submerged_classroom', {
  minW: 7, minD: 7, maxW: 14, maxD: 14,
  weight: (c, zb, rect) => (isSchool(c, zb, rect) ? 8 : far(c, 140) ? 0.7 : 0),
  build(zb, rect, rng) {
    const { x0, z0, x1, z1 } = rect;
    const gel = -0.1;
    zb.rectFloor(x0, z0, x1, z1, gel, M.gel_blue);
    const front = rankSides(zb, rect)[0].s;
    const [ox, oz] = SIDE_DIR[front];
    const L = sideLen(rect, front);
    const depth = front === 'N' || front === 'S' ? z1 - z0 : x1 - x0;
    const keep = clearMask(zb, rect, 1);
    const at = (t, inward) => { const p = onSide(rect, front, t); return [p.x - ox * inward, p.z - oz * inward]; };
    // chalkboard and clock on the longest solid stretch of the front wall
    const run = longestRun(zb, rect, front);
    const mid = onSide(rect, front, (run[0] + run[1]) / 2);
    const bw = Math.min(3.4, run[1] - run[0] - 0.5);
    if (bw > 0.8) zb.decal(mid.x, 1.45, mid.z, SIDE_FACE[front], bw, 1.15, 'chalkboard');
    if (run[1] - run[0] >= 1) zb.prop('c_clock', mid.x, 2.3, mid.z, mid.rot, { h: rng.int(1, 12), m: rng.int(0, 59), rim: 'plastic_white' });
    // teacher's desk, sunk at an angle
    const tt = rng.chance(0.5) ? L * 0.22 + 0.4 : L * 0.78 - 0.4;
    const [tx, tz] = at(tt, 1.35);
    zb.prop('teacher_desk', tx, gel - rng.range(0.3, 0.42), tz, facing(-ox, -oz) + rng.range(-0.15, 0.15), { tilt: rng.range(-0.1, 0.1), roll: rng.range(-0.12, 0.12) });
    zb.decal(tx, gel, tz, 'up', 2.1, 1.3, 'dec_shadow', { rot: facing(-ox, -oz) });
    zb.prop('chair_school', tx + ox * 0.75, gel - rng.range(0.25, 0.38), tz + oz * 0.75, facing(-ox, -oz) + rng.range(-0.4, 0.4), { tilt: rng.range(-0.2, 0.2) });
    // student desks in neat rows facing the board
    const colPitch = 1.24, rowPitch = 1.42;
    const cols = Math.max(2, Math.floor((L - 1.4) / colPitch));
    const c0 = (L - (cols - 1) * colPitch) / 2;
    for (let row = 0; ; row++) {
      const inward = 2.75 + row * rowPitch;
      if (inward > depth - 0.9) break;
      for (let c = 0; c < cols; c++) {
        const [x, z] = at(c0 + c * colPitch + rng.range(-0.05, 0.05), inward + rng.range(-0.05, 0.05));
        if (keep.has(key(Math.floor(x), Math.floor(z)))) continue;
        if (rng.chance(0.06)) continue;
        const rot = facing(ox, oz) + rng.range(-0.06, 0.06);
        const sink = rng.chance(0.15) ? rng.range(0.42, 0.55) : rng.range(0.22, 0.36);
        zb.prop('school_desk', x, gel - sink, z, rot, { tilt: rng.range(-0.1, 0.1), roll: rng.range(-0.1, 0.1) });
        // the gel sags around whatever sinks into it
        zb.decal(x, gel, z, 'up', 1.05, 0.95, 'dec_shadow', { rot: rot + rng.range(-0.3, 0.3) });
        const cx = x - ox * 0.52, cz = z - oz * 0.52;
        if (!keep.has(key(Math.floor(cx), Math.floor(cz)))) {
          zb.prop('chair_school', cx, gel - rng.range(0.18, 0.36), cz, rot + rng.range(-0.15, 0.15), { tilt: rng.range(-0.14, 0.14), roll: rng.range(-0.14, 0.14) });
          zb.decal(cx, gel, cz, 'up', 0.7, 0.7, 'dec_shadow', { rot: rng.range(0, TAU) });
        }
      }
    }
    // a few sheets of paper resting on the surface
    for (let k = 0; k < rng.int(1, 3); k++) {
      const x = rng.range(x0 + 1, x1 - 1), z = rng.range(z0 + 1, z1 - 1);
      zb.prop('papers', x, gel + 0.012, z, 0, { n: rng.int(1, 3) });
    }
    // posters on the side walls, above the gel
    const sides = front === 'N' || front === 'S' ? ['W', 'E'] : ['N', 'S'];
    const posters = rng.shuffle(['c_poster_abc', 'c_poster_read', 'poster_wash', 'calendar', 'poster_motiv']);
    let pi = 0;
    for (const s of sides) {
      const sl = sideLen(rect, s);
      for (let t = 1.2; t < sl - 0.8 && pi < posters.length; t += rng.range(1.6, 2.4)) {
        if (!spanFree(zb, rect, s, t, 0.35)) continue;
        const p = onSide(rect, s, t);
        zb.decal(p.x, rng.range(1.45, 1.7), p.z, SIDE_FACE[s], 0.62, 0.62, posters[pi++]);
      }
    }
    // fluorescent troffers
    for (let a = 1.6; a < L - 0.8; a += 3) {
      for (let b = 1.8; b < depth - 0.8; b += 3) {
        const [x, z] = at(a, b);
        const u = rng.next();
        ceilingLight(zb, x, z, 'troffer', u < 0.12 ? 'off' : u < 0.22 ? 'flicker' : 'on', { rot: front === 'N' || front === 'S' ? 1 : 0 });
      }
    }
  },
});

// ------------------------------------------------------------------ The Reversed Living Room
// A 1970s den bolted to the ceiling: floral sofa, armchair, coffee table, floor lamp and a CRT,
// all hanging upside down from the shag carpet overhead. The floor below is bare and polished,
// and the ceiling light is set into it, still on.
defineRoomPiece('reversed_living_room', {
  minW: 5, minD: 5, maxW: 9, maxD: 9,
  weight: (c) => (far(c, 170) ? 0.8 : 0),
  build(zb, rect, rng) {
    const { x0, z0, x1, z1 } = rect;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const H = Math.min(3.4, Math.max(3.1, ceilAt(zb, cx, cz) + 0.4));
    zb.rectCeil(x0, z0, x1, z1, H, M.shag);
    zb.rectFloor(x0, z0, x1, z1, 0, rng.chance(0.5) ? M.concrete_floor : M.wood_floor);
    paintRoom(zb, rect, M.wood_panel);
    const ranked = rankSides(zb, rect);
    const back = ranked[0].s;                              // the sofa wall
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' }[back];  // the television wall
    const [ox, oz] = SIDE_DIR[back];
    const L = sideLen(rect, back), depth = sideLen(rect, back === 'N' || back === 'S' ? 'W' : 'N');
    const at = (side, t, inward) => { const p = onSide(rect, side, t); const [dx, dz] = SIDE_DIR[side]; return [p.x - dx * inward, p.z - dz * inward]; };
    // flipped props face away from their rotation, so hang them with the outward direction
    const hang = (type, x, z, outX, outZ, opts = {}) => zb.prop(type, x, H, z, facing(outX, outZ), { flip: true, ...opts });
    const sofaLen = Math.min(2.2, L - 1.6);
    const [sx, sz] = at(back, L / 2, 0.5);
    hang('sofa', sx, sz, ox, oz, { len: sofaLen });
    const [tx, tz] = at(back, L / 2, 1.75);
    hang('coffee_table', tx, tz, ox, oz);
    // armchair beside the coffee table, turned toward it
    const side = rng.sign();
    const ax = tx + (oz !== 0 ? side * (sofaLen / 2 + 0.55) : 0) - ox * 0.35, az = tz + (ox !== 0 ? side * (sofaLen / 2 + 0.55) : 0) - oz * 0.35;
    hang('armchair', ax, az, -(tx - ax), -(tz - az));
    // a second, shorter sofa along a side wall when there is room for it
    if (depth >= 7) {
      const ss = back === 'N' || back === 'S' ? (side > 0 ? 'E' : 'W') : side > 0 ? 'S' : 'N';
      const sl = sideLen(rect, ss);
      const [qdx, qdz] = SIDE_DIR[ss];
      const sp = onSide(rect, ss, Math.min(sl - 1.2, 2.4 + 0.9));
      hang('sofa', sp.x - qdx * 0.48, sp.z - qdz * 0.48, qdx, qdz, { len: 1.4 });
    }
    // floor lamp in the corner next to the sofa, still lit
    const [lx, lz] = at(back, L / 2 - side * (sofaLen / 2 + 0.45), 0.4);
    hang('lamp_floor', lx, lz, ox, oz, { on: true });
    // the television on the opposite wall, looking at the sofa
    const [vx, vz] = at(opp, sideLen(rect, opp) / 2, 0.45);
    if (depth >= 5) hang('tv', vx, vz, -ox, -oz, { screen: rng.chance(0.7) ? 'static' : 'off' });
    // a picture hung near the top of a side wall, upside down
    const pside = back === 'N' || back === 'S' ? (rng.chance(0.5) ? 'W' : 'E') : rng.chance(0.5) ? 'N' : 'S';
    const pt = onSide(rect, pside, sideLen(rect, pside) / 2);
    const [pdx, pdz] = SIDE_DIR[pside];
    if (wallAt(zb, rect, pside, sideLen(rect, pside) / 2)) zb.prop('c_picture', pt.x, H - 0.3, pt.z, facing(pdx, pdz), { flip: true, w: 0.7, h: 0.5 });
    // the ceiling light, now in the floor
    zb.decal(cx, 0, cz, 'up', 0.62, 0.62, 'light_panel', { lit: false, glow: 1.05 });
    zb.light(cx, 0.45, cz, { rad: 5.2, int: 0.62, color: [1.0, 0.96, 0.86] });
  },
});

// ------------------------------------------------------------------ The Reading Room
// Dim and brown. One weak bulb, books all over the floor, an empty frame, a radiator, a wall
// speaker, a ball.
defineRoomPiece('reading_room', {
  minW: 3, minD: 3, maxW: 8, maxD: 8,
  weight: (c) => (far(c, 120) ? 1 : 0),
  build(zb, rect, rng) {
    const { x0, z0, x1, z1 } = rect;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    paintRoom(zb, rect, M.c_wp_brown);
    zb.rectFloor(x0, z0, x1, z1, 0, rng.chance(0.6) ? M.carpet_brown : M.wood_floor);
    zb.rectCeil(x0, z0, x1, z1, ceilAt(zb, cx, cz), M.ceil_tile_old);
    for (let k = 0; k < rng.int(0, 2); k++) zb.setFlag(rng.int(x0, x1 - 1), rng.int(z0, z1 - 1), CF.HOLE_CEIL);
    const keep = clearMask(zb, rect, 1);
    ceilingLight(zb, cx + rng.range(-0.3, 0.3), cz + rng.range(-0.3, 0.3), 'bulb', 'on', { int: 0.42, rad: 4.4, color: [1.0, 0.74, 0.46], hang: 0.5 });
    const ranked = rankSides(zb, rect);
    const s0 = ranked[0].s, s1 = ranked[1].s, s2 = ranked[2].s;
    // radiator under where a window would be
    const r0 = onSide(rect, s0, sideLen(rect, s0) / 2 + rng.range(-0.6, 0.6));
    const [d0x, d0z] = SIDE_DIR[s0];
    zb.prop('radiator', r0.x - d0x * 0.1, 0, r0.z - d0z * 0.1, r0.rot);
    // empty picture frame and the speaker
    const t1 = sideLen(rect, s1) / 2;
    if (wallAt(zb, rect, s1, t1)) { const p = onSide(rect, s1, t1); zb.decal(p.x, 1.55, p.z, SIDE_FACE[s1], 0.62, 0.74, 'frame_empty'); }
    const t2 = rng.range(0.6, sideLen(rect, s2) - 0.6);
    if (wallAt(zb, rect, s2, t2)) { const p = onSide(rect, s2, t2); zb.decal(p.x, Math.min(2.25, ceilAt(zb, p.x, p.z) - 0.35), p.z, SIDE_FACE[s2], 0.32, 0.32, 'dec_speaker'); }
    // an empty bookcase, and its books everywhere
    const t3 = sideLen(rect, s1) / 2 + (sideLen(rect, s1) > 3 ? rng.sign() * 1.1 : 0);
    if (wallAt(zb, rect, s1, t3)) { const p = onSide(rect, s1, t3); const [dx, dz] = SIDE_DIR[s1]; zb.prop('bookshelf', p.x - dx * 0.17, 0, p.z - dz * 0.17, p.rot, { books: false, w: 0.9, h: 1.8 }); }
    const n = Math.round((x1 - x0) * (z1 - z0) * rng.range(1.0, 1.6));
    for (let k = 0; k < n; k++) {
      // books drift toward one side of the room, as if they slid there
      const x = x0 + 0.3 + (x1 - x0 - 0.6) * Math.pow(rng.next(), 0.8), z = z0 + 0.3 + (z1 - z0 - 0.6) * rng.next();
      if (keep.has(key(Math.floor(x), Math.floor(z))) && rng.chance(0.7)) continue;
      zb.prop('book', x, 0, z, rng.range(0, TAU), { open: rng.chance(0.3) });
    }
    zb.prop('ball', cx + rng.range(-1, 1), 0, cz + rng.range(-1, 1), 0);
  },
});

// ------------------------------------------------------------------ The Clock Corridor
// Long narrow room lined with wall clocks, every one stopped at a different time, all ticking.
defineRoomPiece('clock_corridor', {
  minW: 6, minD: 2, maxW: 40, maxD: 4,
  weight: (c) => (far(c, 150) ? 0.8 : 0),
  build(zb, rect, rng) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const sides = w >= d ? ['N', 'S'] : ['W', 'E'];
    const used = new Set();
    const rims = ['plastic_black', 'plastic_black', 'plastic_white', 'wood_dark', 'metal', 'wood'];
    for (const s of sides) {
      const L = sideLen(rect, s);
      for (let t = 0.5 + rng.range(0, 0.4); t < L - 0.4; t += rng.range(0.75, 1.25)) {
        if (!wallAt(zb, rect, s, t)) continue;
        let h, m, tries = 0;
        do { h = rng.int(1, 12); m = rng.int(0, 59); } while (used.has(h * 60 + m) && tries++ < 20);
        used.add(h * 60 + m);
        const p = onSide(rect, s, t);
        const R = rng.range(0.12, 0.22);
        zb.prop('c_clock', p.x, rng.range(1.45, 2.25), p.z, p.rot, { h, m, r: R, rim: rng.pick(rims), sec: rng.chance(0.3) ? rng.int(0, 59) : undefined });
      }
    }
    const L = Math.max(w, d);
    for (let t = 1.5; t < L - 0.5; t += 3) {
      const x = w >= d ? rect.x0 + t : (rect.x0 + rect.x1) / 2, z = w >= d ? (rect.z0 + rect.z1) / 2 : rect.z0 + t;
      const u = rng.next();
      ceilingLight(zb, x, z, 'troffer', u < 0.15 ? 'off' : u < 0.25 ? 'flicker' : 'on', { rot: w >= d ? 1 : 0 });
    }
  },
});

// ------------------------------------------------------------------ The Telephone Room
// Dozens of desk telephones on the floor, their cords all running to one hole in the wall.
defineRoomPiece('telephone_room', {
  minW: 4, minD: 4, maxW: 12, maxD: 12,
  weight: (c) => (far(c, 140) ? 0.8 : 0),
  build(zb, rect, rng) {
    const { x0, z0, x1, z1 } = rect;
    const side = rankSides(zb, rect)[0].s;
    const L = sideLen(rect, side);
    let ht = L / 2 + rng.range(-L / 4, L / 4);
    if (!wallAt(zb, rect, side, ht)) ht = L / 2;
    const hp = onSide(rect, side, ht);
    const [ox, oz] = SIDE_DIR[side];
    const hx = hp.x + ox * 0.02, hz = hp.z + oz * 0.02;
    zb.decal(hp.x, 0.17, hp.z, SIDE_FACE[side], 0.36, 0.32, 'c_wallhole');
    const keep = clearMask(zb, rect, 1);
    const area = (x1 - x0) * (z1 - z0);
    const n = Math.max(18, Math.min(46, Math.round(area * rng.range(0.9, 1.3))));
    const placed = [];
    for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
      const x = rng.range(x0 + 0.3, x1 - 0.3), z = rng.range(z0 + 0.3, z1 - 0.3);
      if (Math.hypot(x - hx, z - hz) < 0.9) continue;
      if (keep.has(key(Math.floor(x), Math.floor(z))) && rng.chance(0.85)) continue;
      if (placed.some(([a, b]) => Math.hypot(a - x, b - z) < 0.4)) continue;
      placed.push([x, z]);
      k++;
      const y = floorAt(zb, x, z);
      zb.prop('phone', x, y, z, rng.range(0, TAU), { useY: 0.1 });
      const len = Math.hypot(hx - x, hz - z);
      zb.prop('c_cord', x, y + (k % 7) * 0.0012, z, facing(hx - x, hz - z), { len, endY: 0.15 });
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    ceilingLight(zb, cx, cz, 'panel', rng.chance(0.3) ? 'flicker' : 'on', { int: 0.6 });
    if (area > 40) ceilingLight(zb, cx + (x1 - x0) / 4, cz, 'panel', rng.chance(0.5) ? 'off' : 'on');
  },
});

// ------------------------------------------------------------------ The Television Hall
// CRT televisions on rolling carts, all showing static, all facing the same blank wall.
defineRoomPiece('television_hall', {
  minW: 6, minD: 6, maxW: 20, maxD: 20,
  weight: (c) => (far(c, 160) ? 0.8 : 0),
  build(zb, rect, rng) {
    const front = rankSides(zb, rect)[0].s;
    const [ox, oz] = SIDE_DIR[front];
    const L = sideLen(rect, front);
    const depth = front === 'N' || front === 'S' ? rect.z1 - rect.z0 : rect.x1 - rect.x0;
    const keep = clearMask(zb, rect, 2);
    const cols = Math.max(2, Math.floor((L - 1) / 1.35));
    const c0 = (L - (cols - 1) * 1.35) / 2;
    let count = 0;
    for (let row = 0; count < 34; row++) {
      const inward = 1.4 + row * 1.7;
      if (inward > depth - 1.8) break;
      for (let c = 0; c < cols && count < 34; c++) {
        const p = onSide(rect, front, c0 + c * 1.35 + rng.range(-0.1, 0.1));
        const x = p.x - ox * (inward + rng.range(-0.1, 0.1)), z = p.z - oz * (inward + rng.range(-0.1, 0.1));
        if (keep.has(key(Math.floor(x), Math.floor(z)))) continue;
        zb.prop('c_tv_cart', x, floorAt(zb, x, z), z, facing(ox, oz) + rng.range(-0.08, 0.08), { screen: 'static', quiet: count % 3 !== 0, ch: rng.chance(0.6) ? rng.int(1, 4) : 0 });
        count++;
      }
    }
    // the room's own lights are dead
    const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
    ceilingLight(zb, cx, cz, 'troffer', 'off');
    if (depth > 8) ceilingLight(zb, cx - ox * 3, cz - oz * 3, 'troffer', 'off');
  },
});

// ------------------------------------------------------------------ The Vending Gallery
// Vending machines shoulder to shoulder along both walls, humming; only one is still lit.
defineRoomPiece('vending_gallery', {
  minW: 7, minD: 3, maxW: 30, maxD: 6,
  weight: (c) => (far(c, 140) ? 0.8 : 0),
  build(zb, rect, rng) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const sides = w >= d ? ['N', 'S'] : ['W', 'E'];
    const keep = clearMask(zb, rect, 1);
    const slots = [];
    for (const s of sides) {
      const L = sideLen(rect, s);
      const [dx, dz] = SIDE_DIR[s];
      for (let t = 0.6; t < L - 0.45; t += 0.96) {
        if (!wallAt(zb, rect, s, t) || !wallAt(zb, rect, s, Math.min(L - 0.01, t + 0.4)) || !wallAt(zb, rect, s, Math.max(0.01, t - 0.4))) continue;
        const p = onSide(rect, s, t);
        const x = p.x - dx * 0.46, z = p.z - dz * 0.46;
        if (keep.has(key(Math.floor(x), Math.floor(z)))) continue;
        slots.push([x, z, p.rot]);
      }
    }
    const lit = slots.length ? rng.int(0, slots.length - 1) : -1;
    slots.forEach(([x, z, rot], k) => zb.prop(k === lit ? 'vending' : 'c_vending_off', x, floorAt(zb, x, z), z, rot + rng.range(-0.02, 0.02)));
    const L = Math.max(w, d);
    for (let t = 2; t < L - 1; t += 5) {
      const x = w >= d ? rect.x0 + t : (rect.x0 + rect.x1) / 2, z = w >= d ? (rect.z0 + rect.z1) / 2 : rect.z0 + t;
      ceilingLight(zb, x, z, 'troffer', rng.chance(0.65) ? 'off' : 'dying', { rot: w >= d ? 1 : 0, mul: 0.7 });
    }
  },
});

// ------------------------------------------------------------------ The Door Gallery
// Free-standing door frames with their doors, scattered through an open room. Some stand open.
defineRoomPiece('door_gallery', {
  minW: 8, minD: 8, maxW: 24, maxD: 24,
  weight: (c) => (far(c, 160) ? 0.7 : 0),
  build(zb, rect, rng) {
    const { x0, z0, x1, z1 } = rect;
    const keep = clearMask(zb, rect, 2);
    const S = rng.range(2.3, 2.8);
    const tex = rng.pick(['door_wood', 'door_wood', 'door_gray', 'door_metal']);
    for (let z = z0 + 1.6; z < z1 - 1.2; z += S) {
      for (let x = x0 + 1.6; x < x1 - 1.2; x += S) {
        if (rng.chance(0.15)) continue;
        const px = x + rng.range(-0.4, 0.4), pz = z + rng.range(-0.4, 0.4);
        if (keep.has(key(Math.floor(px), Math.floor(pz)))) continue;
        const rot = rng.chance(0.6) ? rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) + rng.range(-0.06, 0.06) : rng.range(0, TAU);
        const y = floorAt(zb, px, pz);
        zb.prop('c_doorframe', px, y, pz, rot);
        const open = rng.chance(0.45) ? 0 : rng.range(0.3, 1.7);
        zb.prop('door', px, y, pz, rot, { open, tex });
      }
    }
    for (let z = z0 + 1.5; z < z1 - 0.5; z += 3) for (let x = x0 + 1.5; x < x1 - 0.5; x += 3) {
      const u = rng.next();
      ceilingLight(zb, x + 0.5, z + 0.5, 'troffer', u < 0.12 ? 'off' : u < 0.2 ? 'flicker' : 'on');
    }
  },
});
