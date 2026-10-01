// The classic yellow rooms: endless mono-yellow wallpaper, damp carpet, buzzing panels.
import { defineZone } from '../zonetypes.js';
import { W, CF, M, pmod, ceilingLight, lightLattice, openCell, freeCell, findWallSpots, scatter, floorDecal, facing, env, propOnWall, wallFace } from './common.js';

export const SPAWN = [14, 30];

export function yellowParams(zone, rng, ctx) {
  const start = ctx.level === 0 && ctx.dim === 0 && zone.x0 === 0 && zone.z0 === 0;
  const near = ctx.dim === 0 && ctx.level === 0 && ctx.flatDist < 110;
  const variant = start ? 'pillars' : rng.weighted([
    ['pillars', 3], ['maze', 2.6], ['rooms', 2.4], ['open', near ? 0.6 : 1.3], ['classic', 3.2], ['corridors', 1.5], ['halls', 1.2],
  ]);
  const dark = !near && rng.chance(0.1);
  const p = {
    variant,
    wallMat: start ? M.wp_plain : rng.weighted([[M.wp_stripe, 4], [M.wp_stripe2, 2], [M.wp_plain, 3], [M.wp_damask, 1.4], [M.wp_stained, 1], [M.wp_old, 0.6]]),
    floorMat: rng.weighted([[M.carpet_y, 6], [M.carpet_y2, 2], [M.carpet_wet, near ? 0 : 0.6]]),
    ceilMat: rng.weighted([[M.ceil_tile, 5], [M.ceil_tile_old, 1.4], [M.ceil_tile_stain, 0.7]]),
    ceilH: start ? 3.0 : rng.weighted([[3.0, 4], [2.8, 3], [3.3, 2], [2.55, 1], [3.7, 0.6]]),
    lightKind: start ? 'panel' : rng.weighted([['panel', 6], ['troffer', 2], ['tube', 0.7]]),
    lsx: start ? 3 : rng.pick([2, 3, 3, 3, 4]),
    lsz: start ? 3 : rng.pick([2, 3, 3, 4]),
    fail: dark ? 0.86 : start ? 0.02 : rng.range(0.02, 0.14),
    flicker: dark ? 0.05 : rng.range(0.01, 0.07),
    dark,
    ambient: dark ? [0.08, 0.072, 0.05] : [0.27, 0.25, 0.17],
    start,
    // some stretches quietly rearrange themselves once you have left them
    mutable: !start && ctx.dist > 150 && ['maze', 'rooms', 'classic', 'corridors'].includes(variant) && rng.chance(0.18),
  };
  p.env = env({ fog: dark ? [0.08, 0.07, 0.035] : [0.42, 0.38, 0.2], fogNear: dark ? 2 : 5, fogFar: dark ? 22 : 34, hum: dark ? 0.25 : 0.7, hvac: 0.5, reverb: variant === 'open' || variant === 'halls' ? 'hall' : 'room' });
  return p;
}

function genYellow(zb) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  const wm = p.wallMat;
  switch (p.variant) {
    case 'pillars': pillars(zb, r, wm); break;
    case 'maze': maze(zb, r, wm); break;
    case 'rooms': rooms(zb, r, wm); break;
    case 'open': openHall(zb, r, wm); break;
    case 'classic': classic(zb, r, wm); break;
    case 'corridors': corridors(zb, r, wm); break;
    case 'halls': halls(zb, r, wm); break;
    default: pillars(zb, r, wm);
  }
  // soffits / dropped bulkheads
  if (r.chance(0.35)) {
    for (let k = 0; k < r.int(1, 3); k++) {
      const horiz = r.chance(0.5), wdt = r.int(1, 2);
      const drop = r.range(0.35, 0.7);
      if (horiz) { const z = r.int(z0, z1 - wdt); zb.rectCeil(x0, z, x1, z + wdt, p.ceilH - drop); }
      else { const x = r.int(x0, x1 - wdt); zb.rectCeil(x, z0, x + wdt, z1, p.ceilH - drop); }
    }
  }
  // sunken / raised areas
  if (!p.start && r.chance(0.14)) sunken(zb, r, wm);
  // missing ceiling tiles
  if (r.chance(p.start ? 0.6 : 0.4)) {
    for (let k = 0; k < r.int(1, 5); k++) {
      const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
      if (freeCell(zb, x, z)) {
        zb.setFlag(x, z, CF.HOLE_CEIL);
        if (r.chance(0.5)) zb.prop('tile_fallen', x + 0.5 + r.range(-0.3, 0.3), zb.getFloor(x, z), z + 0.5 + r.range(-0.3, 0.3), r.range(0, 3));
      }
    }
  }
  // lights
  lightLattice(zb, x0, z0, x1, z1, p.lsx, p.lsz, p.lightKind, { fail: p.fail, flicker: p.flicker, rot: r.chance(0.5) ? 1 : 0, ox: p.start ? 1 : r.int(0, 3), oz: p.start ? 1 : r.int(0, 3) });
  if (p.dark) {
    // a couple of survivors in the dark
    for (let k = 0; k < r.int(1, 3); k++) {
      const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
      if (freeCell(zb, x, z)) ceilingLight(zb, x + 0.5, z + 0.5, p.lightKind, r.chance(0.5) ? 'on' : 'flicker');
    }
  }
  dressing(zb, r);
}

// ------------------------------------------------------------------ layouts
function pillars(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const P = zb.params.start ? 5 : r.pick([4, 5, 5, 6, 7]);
  const s = zb.params.start ? 1 : r.chance(0.3) ? 2 : 1;
  const ox = r.int(0, P - 1), oz = r.int(0, P - 1);
  const keepClear = (x, z) => zb.params.start && Math.abs(x - SPAWN[0]) < 3 && Math.abs(z - SPAWN[1]) < 3;
  for (let z = z0 + pmod(oz - z0, P); z < z1; z += P) {
    for (let x = x0 + pmod(ox - x0, P); x < x1; x += P) {
      if (keepClear(x, z)) continue;
      if (r.chance(0.8)) zb.rectSolid(x, z, x + s, z + s, wm);
      // thick connecting walls between pillars
      if (r.chance(0.13)) zb.rectSolid(x, z, x + P + s, z + s, wm);
      else if (r.chance(0.13)) zb.rectSolid(x, z, x + s, z + P + s, wm);
      else if (r.chance(0.08)) zb.hLine(z, x + s, x + P, W.WALL, wm, wm);
      else if (r.chance(0.08)) zb.vLine(x, z + s, z + P, W.WALL, wm, wm);
    }
  }
  // a few long walls for distant structure
  for (let k = 0; k < Math.floor((zb.w * zb.d) / 900); k++) {
    if (r.chance(0.5)) { const z = r.int(z0 + 2, z1 - 2), a = r.int(x0, x1 - 6); zb.hLine(z, a, Math.min(x1, a + r.int(5, 14)), W.WALL, wm, wm); }
    else { const x = r.int(x0 + 2, x1 - 2), a = r.int(z0, z1 - 6); zb.vLine(x, a, Math.min(z1, a + r.int(5, 14)), W.WALL, wm, wm); }
  }
}

function maze(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const S = r.pick([3, 4, 4, 5]);
  const pw = r.range(0.32, 0.5);
  const ox = r.int(0, S - 1), oz = r.int(0, S - 1);
  for (let z = z0 + pmod(oz - z0, S); z < z1; z += S) {
    for (let x = x0 + pmod(ox - x0, S); x < x1; x += S) {
      if (r.chance(pw)) {
        if (r.chance(0.15)) zb.rectSolid(x, z, Math.min(x1, x + S), z + 1, wm);
        else {
          const gap = r.chance(0.3) ? r.int(0, S - 1) : -1;
          for (let k = 0; k < S; k++) if (k !== gap) zb.setWall(x + k, z, 'N', W.WALL, wm, wm);
        }
      }
      if (r.chance(pw)) {
        if (r.chance(0.15)) zb.rectSolid(x, z, x + 1, Math.min(z1, z + S), wm);
        else {
          const gap = r.chance(0.3) ? r.int(0, S - 1) : -1;
          for (let k = 0; k < S; k++) if (k !== gap) zb.setWall(x, z + k, 'W', W.WALL, wm, wm);
        }
      }
      if (r.chance(0.12)) zb.setSolid(x, z, wm);
    }
  }
}

function rooms(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const S = r.pick([6, 7, 8, 9, 10]);
  const ox = r.int(0, S - 1), oz = r.int(0, S - 1);
  const seg = (horiz, line, a, b) => {
    if (r.chance(0.22)) return;
    const len = b - a;
    const openings = [];
    const n = r.chance(0.3) ? 2 : 1;
    for (let k = 0; k < n; k++) { const w = r.weighted([[1, 3], [2, 2], [3, 1]]); openings.push([r.int(a, Math.max(a, b - w)), w]); }
    const type = r.chance(0.15) ? W.HALF : W.WALL;
    for (let t = a; t < b; t++) {
      const isOpen = openings.some(([o, w]) => t >= o && t < o + w);
      if (isOpen) {
        if (type === W.WALL) {
          const u = r.next();
          // doorways that are too small, or far too tall
          const dt = u < 0.22 ? W.DOOR : u < 0.27 ? W.LOW : u < 0.33 ? W.ARCH : 0;
          if (dt) horiz ? zb.setWall(t, line, 'N', dt, wm, wm) : zb.setWall(line, t, 'W', dt, wm, wm);
        }
        continue;
      }
      horiz ? zb.setWall(t, line, 'N', type, wm, wm) : zb.setWall(line, t, 'W', type, wm, wm);
    }
    void len;
  };
  for (let z = z0 + pmod(oz - z0, S); z < z1; z += S) for (let x = x0 + pmod(ox - x0, S); x < x1; x += S) {
    seg(true, z, x, Math.min(x1, x + S));
    seg(false, x, z, Math.min(z1, z + S));
  }
  // thick pillars at some intersections
  for (let z = z0 + pmod(oz - z0, S); z < z1; z += S) for (let x = x0 + pmod(ox - x0, S); x < x1; x += S) if (r.chance(0.25)) zb.setSolid(x, z, wm);
}

function openHall(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const P = r.pick([8, 10, 12]);
  const ox = r.int(0, P - 1), oz = r.int(0, P - 1);
  for (let z = z0 + pmod(oz - z0, P); z < z1 - 1; z += P) for (let x = x0 + pmod(ox - x0, P); x < x1 - 1; x += P) {
    if (r.chance(0.45)) zb.rectSolid(x, z, x + 2, z + 2, wm);
  }
  for (let k = 0; k < r.int(0, 3); k++) {
    const x = r.int(x0, x1 - 4), z = r.int(z0, z1 - 4);
    zb.rectSolid(x, z, x + r.int(1, 4), z + 1, wm);
  }
}

function classic(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const area = zb.w * zb.d;
  for (let k = 0; k < area / 55; k++) {
    const horiz = r.chance(0.5);
    const a = r.int(1, 2), b = r.int(2, 7);
    const w = horiz ? b : a, d = horiz ? a : b;
    const x = r.int(x0, x1 - w), z = r.int(z0, z1 - d);
    zb.rectSolid(x, z, x + w, z + d, wm);
  }
  for (let k = 0; k < area / 110; k++) {
    const len = r.int(3, 8);
    if (r.chance(0.5)) { const z = r.int(z0 + 1, z1 - 1), x = r.int(x0, x1 - len); zb.hLine(z, x, x + len, W.HALF, wm, wm); }
    else { const x = r.int(x0 + 1, x1 - 1), z = r.int(z0, z1 - len); zb.vLine(x, z, z + len, W.HALF, wm, wm); }
  }
  for (let k = 0; k < area / 85; k++) {
    const len = r.int(3, 10);
    if (r.chance(0.5)) { const z = r.int(z0 + 1, z1 - 1), x = r.int(x0, x1 - len); zb.hLine(z, x, x + len, W.WALL, wm, wm); }
    else { const x = r.int(x0 + 1, x1 - 1), z = r.int(z0, z1 - len); zb.vLine(x, z, z + len, W.WALL, wm, wm); }
  }
}

function corridors(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const horiz = r.chance(0.5);
  const S = r.pick([3, 3, 4]);
  if (horiz) {
    for (let z = z0 + r.int(1, S); z < z1 - 1; z += S) {
      let x = x0;
      while (x < x1) {
        const len = r.int(5, 16), gap = r.int(1, 2);
        zb.hLine(z, x, Math.min(x1, x + len), W.WALL, wm, wm);
        x += len + gap;
      }
    }
  } else {
    for (let x = x0 + r.int(1, S); x < x1 - 1; x += S) {
      let z = z0;
      while (z < z1) {
        const len = r.int(5, 16), gap = r.int(1, 2);
        zb.vLine(x, z, Math.min(z1, z + len), W.WALL, wm, wm);
        z += len + gap;
      }
    }
  }
}

function halls(zb, r, wm) {
  // big rooms joined by narrow passages
  const { x0, z0, x1, z1 } = zb;
  const S = r.pick([12, 14, 16]);
  for (let z = z0 + S; z < z1; z += S) {
    for (let x = x0; x < x1; x++) zb.setSolid(x, z, wm);
    for (let x = x0 + r.int(1, 5); x < x1 - 1; x += r.int(5, 12)) zb.clearSolid(x, z);
  }
  for (let x = x0 + S; x < x1; x += S) {
    for (let z = z0; z < z1; z++) zb.setSolid(x, z, wm);
    for (let z = z0 + r.int(1, 5); z < z1 - 1; z += r.int(5, 12)) zb.clearSolid(x, z);
  }
  if (r.chance(0.5)) {
    for (let k = 0; k < zb.w * zb.d / 120; k++) { const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1); zb.setSolid(x, z, wm); }
  }
}

function sunken(zb, r, wm) {
  const { x0, z0, x1, z1 } = zb;
  const w = r.int(5, 10), d = r.int(5, 10);
  if (zb.w < w + 4 || zb.d < d + 4) return;
  const x = r.int(x0 + 2, x1 - w - 2), z = r.int(z0 + 2, z1 - d - 2);
  const down = r.chance(0.65);
  const s1 = down ? -0.2 : 0.2;
  zb.fill(x, z, x + w, z + d, (cx, cz, i) => { zb.solid[i] = 0; zb.floor[i] = s1; });
  zb.fill(x + 1, z + 1, x + w - 1, z + d - 1, (cx, cz, i) => { zb.floor[i] = s1 * 2; });
  if (down && r.chance(0.5)) zb.fill(x + 2, z + 2, x + w - 2, z + d - 2, (cx, cz, i) => { zb.floor[i] = s1 * 3; });
  void wm;
}

// ------------------------------------------------------------------ props & decals
function dressing(zb, r) {
  const { x0, z0, x1, z1 } = zb;
  const area = zb.w * zb.d;
  // wall stains, outlets, vents
  for (const f of findWallSpots(zb, x0, z0, x1, z1, Math.floor(area / 70), r)) {
    const u = r.next();
    if (u < 0.35) zb.decal(f.x, r.range(0.6, 2.0), f.z, f.face, r.range(0.8, 1.6), r.range(0.8, 1.8), r.chance(0.5) ? 'dec_stain' : 'dec_stain2');
    else if (u < 0.6) zb.decal(f.x, 0.3, f.z, f.face, 0.14, 0.2, 'dec_outlet');
    else if (u < 0.72) zb.decal(f.x, 2.4, f.z, f.face, 0.5, 0.3, 'dec_vent');
    else if (u < 0.78) zb.decal(f.x, r.range(1.0, 1.6), f.z, f.face, 0.9, 0.5, r.chance(0.5) ? 'dec_scuff' : 'dec_mold');
    else if (u < 0.8 && zb.params.dark) zb.decal(f.x, 1.3, f.z, f.face, 0.7, 0.4, 'dec_tally');
    else if (u < 0.815) zb.decal(f.x, 1.2, f.z, f.face, 0.6, 0.45, 'dec_arrow');
  }
  // carpet stains
  for (let k = 0; k < area / 90; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    if (freeCell(zb, x, z)) floorDecal(zb, x + r.next(), z + r.next(), r.chance(0.6) ? 'dec_stain' : 'dec_puddle', r.range(0.8, 2.2), r);
  }
  // sparse abandoned objects
  const n = r.chance(0.55) ? r.int(1, 4) : 0;
  scatter(zb, x0, z0, x1, z1, n * 3, r, (x, z) => {
    const u = r.next();
    const px = x + 0.5 + r.range(-0.2, 0.2), pz = z + 0.5 + r.range(-0.2, 0.2), y = zb.getFloor(x, z);
    if (u < 0.22) zb.prop('chair_office', px, y, pz, r.range(0, 6.28));
    else if (u < 0.38) zb.prop('box', px, y, pz, r.range(0, 6.28));
    else if (u < 0.48) zb.prop('papers', px, y, pz, 0);
    else if (u < 0.56) zb.prop('trash_can', px, y, pz, 0);
    else if (u < 0.62) zb.prop('chair_folding', px, y, pz, r.range(0, 6.28));
    else if (u < 0.66) zb.prop('plant', px, y, pz, 0);
    else if (u < 0.7) zb.prop('wet_sign', px, y, pz, r.range(0, 6.28));
    else if (u < 0.74) zb.prop('note', px, y, pz, r.range(0, 6.28), { text: r.int(0, 999) });
  });
  // telephones on the floor (save points)
  if (r.chance(zb.params.start ? 1 : 0.14)) {
    for (let k = 0; k < 30; k++) {
      const x = zb.params.start ? SPAWN[0] + r.int(-9, 9) : r.int(x0, x1 - 1), z = zb.params.start ? SPAWN[1] + r.int(-12, 3) : r.int(z0, z1 - 1);
      const f = wallFace(zb, x, z, ...r.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]));
      if (!f) continue;
      const y = zb.getFloor(x, z);
      if (r.chance(0.6)) {
        zb.prop('phone', f.x - f.dx * 0.25, y, f.z - f.dz * 0.25, facing(-f.dx, -f.dz) + r.range(-0.4, 0.4), { useY: 0.1 });
      } else {
        propOnWall(zb, f, 'payphone', y, {}, 0.0);
      }
      break;
    }
  }
  // rooms inside rooms
  if (!zb.params.start && zb.w >= 24 && zb.d >= 24 && r.chance(0.07)) nestedRooms(zb, r);
  // a lit hallway behind a doorway that is only there from a distance
  if (!zb.params.start && zb.zone.ctx && zb.zone.ctx.dist > 120 && r.chance(0.09)) mirageDoor(zb, r);
  // rare landmark: a car where no car could have come from
  if (!zb.params.start && (zb.params.variant === 'open' || zb.params.variant === 'pillars' || zb.params.variant === 'halls') && r.chance(0.05)) crashedCar(zb, r);
}

function nestedRooms(zb, r) {
  const S = r.pick([13, 15]);
  const wm = zb.params.wallMat;
  const gate = new Set(zb.gates.map((g) => g.x + ',' + g.z));
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = r.int(zb.x0 + 3, zb.x1 - S - 3), z = r.int(zb.z0 + 3, zb.z1 - S - 3);
    let bad = false;
    for (let zz = z - 1; zz <= z + S && !bad; zz++) for (let xx = x - 1; xx <= x + S; xx++) if (gate.has(xx + ',' + zz)) { bad = true; break; }
    if (bad) continue;
    zb.clearEntities(x - 1, z - 1, x + S + 1, z + S + 1);
    zb.fill(x - 1, z - 1, x + S + 1, z + S + 1, (cx, cz, i) => {
      zb.solid[i] = 0; zb.floor[i] = 0; zb.ceil[i] = zb.params.ceilH;
      zb.flags[i] &= ~(CF.HOLE_CEIL); zb.flags[i] |= CF.NOPROPS;
      if (cx > x - 1) zb.wallW[i] = 0;
      if (cz > z - 1) zb.wallN[i] = 0;
    });
    const sides = r.shuffle([0, 1, 2, 3]);
    for (let k = 0; k < 3; k++) {
      const n = S - 4 * k, x0 = x + 2 * k, z0 = z + 2 * k;
      if (n < 3) break;
      zb.roomWalls(x0, z0, x0 + n, z0 + n, W.WALL, wm, wm);
      const mid = Math.floor(n / 2), side = sides[k];
      if (side === 0) zb.setWall(x0 + mid, z0, 'N', W.DOOR, wm, wm);
      else if (side === 1) zb.setWall(x0 + mid, z0 + n, 'N', W.DOOR, wm, wm);
      else if (side === 2) zb.setWall(x0, z0 + mid, 'W', W.DOOR, wm, wm);
      else zb.setWall(x0 + n, z0 + mid, 'W', W.DOOR, wm, wm);
      ceilingLight(zb, x0 + 0.5 + (k === 2 ? mid : 0), z0 + 0.5 + (k === 2 ? mid : 0), zb.params.lightKind, r.chance(0.8) ? 'on' : 'flicker');
    }
    const c = x + S / 2, cz2 = z + S / 2;
    const u = r.next();
    if (u < 0.4) zb.prop('chair_folding', c, 0, cz2, r.range(0, 6.28), { dent: true });
    else if (u < 0.7) zb.prop('phone', c, 0, cz2, r.range(0, 6.28), { useY: 0.1 });
    else zb.prop('note', c, 0, cz2, r.range(0, 6.28), { text: r.int(0, 999) });
    return;
  }
}

function mirageDoor(zb, r) {
  const wm = zb.params.wallMat;
  const L = r.int(9, 14);
  const gate = new Set(zb.gates.map((g) => g.x + ',' + g.z));
  for (let attempt = 0; attempt < 16; attempt++) {
    const [dx, dz] = r.pick([[0, 1], [0, -1], [1, 0], [-1, 0]]);
    // niche cell and the block behind it (3 wide, L+1 deep, away from dir)
    const nx = r.int(zb.x0 + L + 3, zb.x1 - L - 4), nz = r.int(zb.z0 + L + 3, zb.z1 - L - 4);
    if (nx < zb.x0 + 3 || nz < zb.z0 + 3) continue;
    const px = -dz, pz = dx; // perpendicular
    const cells = [];
    for (let k = 0; k <= L + 1; k++) for (let s2 = -1; s2 <= 1; s2++) cells.push([nx - dx * k + px * s2, nz - dz * k + pz * s2]);
    if (cells.some(([x, z]) => !zb.in(x, z) || gate.has(x + ',' + z) || x < zb.x0 + 2 || z < zb.z0 + 2 || x > zb.x1 - 3 || z > zb.z1 - 3)) continue;
    // the approach in front of the niche must be open floor
    const fx = nx + dx, fz = nz + dz;
    if (!zb.in(fx, fz) || zb.isSolid(fx, fz)) continue;
    let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
    for (const [x, z] of cells) { minx = Math.min(minx, x); minz = Math.min(minz, z); maxx = Math.max(maxx, x); maxz = Math.max(maxz, z); }
    zb.clearEntities(minx, minz, maxx + 1, maxz + 1);
    for (const [x, z] of cells) {
      const i = zb.i(x, z);
      zb.solid[i] = wm; zb.flags[i] |= CF.KEEP | CF.NOPROPS;
      zb.wallW[i] = 0; zb.wallN[i] = 0;
      zb.floor[i] = 0; zb.ceil[i] = zb.params.ceilH;
    }
    // the niche (open) and the hidden hallway cells (void) behind it
    const ni = zb.i(nx, nz);
    zb.solid[ni] = 0; zb.ceil[ni] = Math.min(2.5, zb.params.ceilH);
    for (let k = 1; k <= L; k++) {
      const i = zb.i(nx - dx * k, nz - dz * k);
      zb.solid[i] = 0; zb.flags[i] |= CF.VOID; zb.floor[i] = NaN; zb.ceil[i] = NaN;
    }
    // back of the niche: collision always, wall drawn only up close, hallway only from afar
    const bx = nx + 0.5 - dx * 0.5, bz = nz + 0.5 - dz * 0.5;
    const rot = facing(dx, dz);
    zb.box(bx - Math.abs(pz) * 0.5 - (dx ? 0.02 : 0), 0, bz - Math.abs(px) * 0.5 - (dz ? 0.02 : 0), bx + Math.abs(pz) * 0.5 + (dx ? 0.02 : 0), 2.5, bz + Math.abs(px) * 0.5 + (dz ? 0.02 : 0), wm, { render: false });
    zb.dynamic('mirage_hall', bx, 0, bz, rot, { len: L, wall: matName(wm), floor: matName(zb.params.floorMat) }, { showFar: 6.5 });
    zb.dynamic('mirage_wall', bx, 0, bz, rot, { wall: matName(wm) }, { showNear: 6.5 });
    zb.light(nx + 0.5 - dx * (L / 2), 2.2, nz + 0.5 - dz * (L / 2), { rad: 5, int: 0.6 });
    return;
  }
}

function matName(id) {
  for (const k in M) if (M[k] === id) return k;
  return 'wp_stripe';
}

function crashedCar(zb, r) {
  const { x0, z0, x1, z1 } = zb;
  for (let k = 0; k < 60; k++) {
    const x = r.int(x0 + 2, x1 - 3), z = r.int(z0 + 6, z1 - 4);
    // need a wall in front (north) and open cells behind
    let ok = true;
    for (let dz = 0; dz < 5 && ok; dz++) for (let dx = -1; dx <= 1 && ok; dx++) if (!openCell(zb, x + dx, z + dz)) ok = false;
    if (!ok) continue;
    if (!zb.isSolid(x, z - 1) && zb.getWall(x, z, 'N') !== W.WALL) continue;
    const wallZ = zb.isSolid(x, z - 1) ? z : z + 0.1;
    const cz = wallZ + 1.78;
    zb.prop('car', x + 0.5, 0, cz, 0, { crushed: true });
    zb.decal(x + 0.5, 1.4, wallZ, 'pz', 3.2, 3.0, 'dec_soot');
    zb.decal(x + 0.5, 0, wallZ + 1.4, 'up', 3.5, 3.5, 'dec_soot', { rot: r.next() * 6 });
    zb.decal(x + 0.8, 0, wallZ + 3.6, 'up', 2.2, 2.2, 'dec_scuff', { rot: r.next() * 6 });
    zb.emitter(x + 0.5, 0.5, cz, 'tick', { vol: 0.3, rad: 5 });
    return;
  }
}

defineZone('yellow', {
  border: 'open',
  gate: 'open',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0) return 0;
    if (c.level === 0 && c.flatDist < 95) return 1000;
    let w = 6 * (1.25 - c.office * 0.7);
    if (c.level === 0) w *= 1.4;
    if (c.flatDist < 220 && c.level === 0) w *= 1.6;
    return w;
  },
  params: yellowParams,
  gen: genYellow,
});
