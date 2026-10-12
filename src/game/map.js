// Port of p_map.c: movement clipping, sliding, hitscan, use lines, radius
// damage and sector height changes. Hitscan is extended for free 3D aim
// (floors and ceilings stop shots) and reports rich hit info for effects.

import { MF, MAXRADIUS, USERANGE, aproxDistance, pointToAngle } from './defs.js';
import { MT, S } from './tables.js';
import { ML } from './mapdata.js';
import {
  pointOnLineSide, boxOnLineSide, lineOpening, opening, setThingPosition, unsetThingPosition,
  blockLinesIterator, blockThingsIterator, pathTraverse, PT_ADDLINES, PT_ADDTHINGS,
} from './maputl.js';

// Shared "tm" state like the original globals.
export const mapState = {
  thing: null,
  flags: 0,
  x: 0,
  y: 0,
  bbox: [0, 0, 0, 0],
  floorz: 0,
  ceilingz: 0,
  dropoffz: 0,
  ceilingline: null,
  blockline: null,
  blockthing: null,
  spechit: [],
  floatok: false,
  linetarget: null,
};

let w = null; // current world during a check

function pitCheckLine(ld) {
  const tm = mapState;
  const b = tm.bbox;
  if (b[3] <= ld.bbox[2] || b[2] >= ld.bbox[3] || b[0] <= ld.bbox[1] || b[1] >= ld.bbox[0]) return true;
  if (boxOnLineSide(b, ld) !== -1) return true;
  if (!ld.backsector) { tm.blockline = ld; return false; }
  if (!(tm.thing.flags & MF.MISSILE)) {
    if (ld.flags & ML.BLOCKING) { tm.blockline = ld; return false; }
    if (!tm.thing.player && (ld.flags & ML.BLOCKMONSTERS)) { tm.blockline = ld; return false; }
  }
  lineOpening(ld);
  if (opening.top < tm.ceilingz) { tm.ceilingz = opening.top; tm.ceilingline = ld; }
  if (opening.bottom > tm.floorz) { tm.floorz = opening.bottom; tm.floorline = ld; }
  if (opening.lowfloor < tm.dropoffz) tm.dropoffz = opening.lowfloor;
  if (ld.special) tm.spechit.push(ld);
  return true;
}

function pitCheckThing(thing) {
  const tm = mapState;
  const tmthing = tm.thing;
  if (!(thing.flags & (MF.SOLID | MF.SPECIAL | MF.SHOOTABLE))) return true;
  const blockdist = thing.radius + tmthing.radius;
  if (Math.abs(thing.x - tm.x) >= blockdist || Math.abs(thing.y - tm.y) >= blockdist) return true;
  if (thing === tmthing) return true;
  if (tmthing.flags & MF.SKULLFLY) {
    const damage = ((w.rng.P() % 8) + 1) * tmthing.info.damage;
    w.damageMobj(thing, tmthing, tmthing, damage);
    tmthing.flags &= ~MF.SKULLFLY;
    tmthing.momx = tmthing.momy = tmthing.momz = 0;
    w.setMobjState(tmthing, tmthing.info.spawnstate);
    tm.blockthing = thing;
    return false;
  }
  if (tmthing.flags & MF.MISSILE) {
    if (tmthing.z > thing.z + thing.height) return true;
    if (tmthing.z + tmthing.height < thing.z) return true;
    const src = tmthing.target;
    if (src && (src.type === thing.type
      || (src.type === MT.KNIGHT && thing.type === MT.BRUISER)
      || (src.type === MT.BRUISER && thing.type === MT.KNIGHT))) {
      if (thing === src) return true;
      if (thing.type !== MT.PLAYER) { tm.blockthing = thing; return false; }
    }
    if (!(thing.flags & MF.SHOOTABLE)) return !(thing.flags & MF.SOLID);
    const damage = ((w.rng.P() % 8) + 1) * tmthing.info.damage;
    tm.blockthing = thing;
    if (w.fx) w.fx.missileHitThing(tmthing, thing, damage);
    w.damageMobj(thing, tmthing, tmthing.target, damage);
    return false;
  }
  if (thing.flags & MF.SPECIAL) {
    const solid = thing.flags & MF.SOLID;
    if (tm.flags & MF.PICKUP) w.touchSpecialThing(thing, tmthing);
    return !solid;
  }
  if (thing.flags & MF.SOLID) { tm.blockthing = thing; return false; }
  return true;
}

export function checkPosition(world, thing, x, y) {
  w = world;
  const tm = mapState;
  tm.thing = thing;
  tm.flags = thing.flags;
  tm.x = x;
  tm.y = y;
  tm.bbox[0] = y + thing.radius;
  tm.bbox[1] = y - thing.radius;
  tm.bbox[2] = x - thing.radius;
  tm.bbox[3] = x + thing.radius;
  const ss = world.pointInSubsector(x, y);
  tm.ceilingline = null;
  tm.floorline = null;
  tm.blockline = null;
  tm.blockthing = null;
  tm.floorz = tm.dropoffz = ss.sector.floorheight;
  tm.ceilingz = ss.sector.ceilingheight;
  tm.sector = ss.sector;
  world.validcount++;
  tm.spechit.length = 0;
  if (tm.flags & MF.NOCLIP) return true;
  const bm = world.level.blockmap;
  let xl = Math.floor((tm.bbox[2] - bm.originx - MAXRADIUS) / 128);
  let xh = Math.floor((tm.bbox[3] - bm.originx + MAXRADIUS) / 128);
  let yl = Math.floor((tm.bbox[1] - bm.originy - MAXRADIUS) / 128);
  let yh = Math.floor((tm.bbox[0] - bm.originy + MAXRADIUS) / 128);
  for (let bx = xl; bx <= xh; bx++) {
    for (let by = yl; by <= yh; by++) {
      if (!blockThingsIterator(world, bx, by, pitCheckThing)) return false;
    }
  }
  xl = Math.floor((tm.bbox[2] - bm.originx) / 128);
  xh = Math.floor((tm.bbox[3] - bm.originx) / 128);
  yl = Math.floor((tm.bbox[1] - bm.originy) / 128);
  yh = Math.floor((tm.bbox[0] - bm.originy) / 128);
  for (let bx = xl; bx <= xh; bx++) {
    for (let by = yl; by <= yh; by++) {
      if (!blockLinesIterator(world, bx, by, pitCheckLine)) return false;
    }
  }
  return true;
}

export const STEPHEIGHT = 24;

export function tryMove(world, thing, x, y) {
  const tm = mapState;
  tm.floatok = false;
  if (!checkPosition(world, thing, x, y)) return false;
  if (!(thing.flags & MF.NOCLIP)) {
    if (tm.ceilingz - tm.floorz < thing.height) return false;
    tm.floatok = true;
    if (!(thing.flags & MF.TELEPORT) && tm.ceilingz - thing.z < thing.height) return false;
    const step = thing.stepHeight != null ? thing.stepHeight : STEPHEIGHT;
    if (!(thing.flags & MF.TELEPORT) && tm.floorz - thing.z > step) return false;
    if (!(thing.flags & (MF.DROPOFF | MF.FLOAT)) && tm.floorz - tm.dropoffz > STEPHEIGHT) return false;
  }
  const spechit = tm.spechit.slice();
  const floorz = tm.floorz, ceilingz = tm.ceilingz;
  unsetThingPosition(world, thing);
  const oldx = thing.x, oldy = thing.y;
  thing.floorz = floorz;
  thing.ceilingz = ceilingz;
  thing.x = x;
  thing.y = y;
  setThingPosition(world, thing);
  if (!(thing.flags & (MF.TELEPORT | MF.NOCLIP))) {
    for (let i = spechit.length - 1; i >= 0; i--) {
      const ld = spechit[i];
      const side = pointOnLineSide(thing.x, thing.y, ld);
      const oldside = pointOnLineSide(oldx, oldy, ld);
      if (side !== oldside && ld.special) world.crossSpecialLine(ld, oldside, thing);
    }
  }
  return true;
}

export function thingHeightClip(world, thing) {
  const onfloor = thing.z === thing.floorz;
  checkPosition(world, thing, thing.x, thing.y);
  thing.floorz = mapState.floorz;
  thing.ceilingz = mapState.ceilingz;
  if (onfloor) {
    // Lifts carry things smoothly; keep interpolation in step.
    const dz = thing.floorz - thing.z;
    thing.z = thing.floorz;
    if (!thing.player && Math.abs(dz) < 32) thing.pz += dz;
  } else if (thing.z + thing.height > thing.ceilingz) {
    thing.z = thing.ceilingz - thing.height;
  }
  return thing.ceilingz - thing.floorz >= thing.height;
}

// --- Sliding ----------------------------------------------------------------

export function slideMove(world, mo) {
  let hitcount = 0;
  const stairstep = () => {
    if (!tryMove(world, mo, mo.x, mo.y + mo.momy)) tryMove(world, mo, mo.x + mo.momx, mo.y);
  };
  for (;;) {
    if (++hitcount === 3) { stairstep(); return; }
    let leadx, leady, trailx, traily;
    if (mo.momx > 0) { leadx = mo.x + mo.radius; trailx = mo.x - mo.radius; } else { leadx = mo.x - mo.radius; trailx = mo.x + mo.radius; }
    if (mo.momy > 0) { leady = mo.y + mo.radius; traily = mo.y - mo.radius; } else { leady = mo.y - mo.radius; traily = mo.y + mo.radius; }
    let bestslidefrac = 1.0001;
    let bestslideline = null;
    const trav = (ic) => {
      const li = ic.line;
      let blocking = false;
      if (!(li.flags & ML.TWOSIDED) || !li.backsector) {
        if (pointOnLineSide(mo.x, mo.y, li)) return true;
        blocking = true;
      } else {
        lineOpening(li);
        if (opening.range < mo.height) blocking = true;
        else if (opening.top - mo.z < mo.height) blocking = true;
        else if (opening.bottom - mo.z > (mo.stepHeight != null ? mo.stepHeight : STEPHEIGHT)) blocking = true;
        else if ((li.flags & ML.BLOCKING)) blocking = true;
      }
      if (!blocking) return true;
      if (ic.frac < bestslidefrac) { bestslidefrac = ic.frac; bestslideline = li; }
      return false;
    };
    pathTraverse(world, leadx, leady, leadx + mo.momx, leady + mo.momy, PT_ADDLINES, trav);
    pathTraverse(world, trailx, leady, trailx + mo.momx, leady + mo.momy, PT_ADDLINES, trav);
    pathTraverse(world, leadx, traily, leadx + mo.momx, traily + mo.momy, PT_ADDLINES, trav);
    if (bestslidefrac > 1) { stairstep(); return; }
    bestslidefrac -= 0.03125;
    if (bestslidefrac > 0) {
      const nx = mo.momx * bestslidefrac, ny = mo.momy * bestslidefrac;
      if (!tryMove(world, mo, mo.x + nx, mo.y + ny)) { stairstep(); return; }
    }
    bestslidefrac = 1 - (bestslidefrac + 0.03125);
    if (bestslidefrac > 1) bestslidefrac = 1;
    if (bestslidefrac <= 0) return;
    let tmx = mo.momx * bestslidefrac;
    let tmy = mo.momy * bestslidefrac;
    // Project the remaining move onto the wall direction.
    const len = bestslideline.length || 1;
    const lx = bestslideline.dx / len, ly = bestslideline.dy / len;
    const d = tmx * lx + tmy * ly;
    tmx = lx * d;
    tmy = ly * d;
    mo.momx = tmx;
    mo.momy = tmy;
    if (tryMove(world, mo, mo.x + tmx, mo.y + tmy)) return;
  }
}

// --- Aiming & shooting ------------------------------------------------------

export function aimLineAttack(world, t1, angle, distance, fromZ = null) {
  const x2 = t1.x + distance * Math.cos(angle);
  const y2 = t1.y + distance * Math.sin(angle);
  const shootz = fromZ != null ? fromZ : t1.z + t1.height / 2 + 8;
  let topslope = 100 / 160;
  let bottomslope = -100 / 160;
  let aimslope = 0;
  mapState.linetarget = null;
  pathTraverse(world, t1.x, t1.y, x2, y2, PT_ADDLINES | PT_ADDTHINGS, (ic) => {
    const dist = distance * ic.frac;
    if (ic.isLine) {
      const li = ic.line;
      if (!(li.flags & ML.TWOSIDED) || !li.backsector) return false;
      lineOpening(li);
      if (opening.bottom >= opening.top) return false;
      if (dist <= 0) return true;
      if (li.frontsector.floorheight !== li.backsector.floorheight) {
        const slope = (opening.bottom - shootz) / dist;
        if (slope > bottomslope) bottomslope = slope;
      }
      if (li.frontsector.ceilingheight !== li.backsector.ceilingheight) {
        const slope = (opening.top - shootz) / dist;
        if (slope < topslope) topslope = slope;
      }
      return topslope > bottomslope;
    }
    const th = ic.thing;
    if (th === t1) return true;
    if (!(th.flags & MF.SHOOTABLE)) return true;
    if (dist <= 0) return true;
    let thingtopslope = (th.z + th.height - shootz) / dist;
    if (thingtopslope < bottomslope) return true;
    let thingbottomslope = (th.z - shootz) / dist;
    if (thingbottomslope > topslope) return true;
    if (thingtopslope > topslope) thingtopslope = topslope;
    if (thingbottomslope < bottomslope) thingbottomslope = bottomslope;
    aimslope = (thingtopslope + thingbottomslope) / 2;
    mapState.linetarget = th;
    return false;
  });
  return mapState.linetarget ? aimslope : 0;
}

// Hitscan with planes. Returns hit info:
// {kind:'thing'|'wall'|'floor'|'ceiling'|'sky'|'none', x,y,z, thing, line, side, sector, part}
export function lineAttack(world, t1, angle, distance, slope, damage, opts = {}) {
  const x2 = t1.x + distance * Math.cos(angle);
  const y2 = t1.y + distance * Math.sin(angle);
  const shootz = opts.fromZ != null ? opts.fromZ : t1.z + t1.height / 2 + 8;
  const sx = t1.x, sy = t1.y;
  let result = { kind: 'none', x: x2, y: y2, z: shootz + slope * distance };
  let sector = t1.subsector.sector;
  let lastDist = 0;
  const posAt = (dist) => {
    const f = dist / distance;
    return [sx + (x2 - sx) * f, sy + (y2 - sy) * f, shootz + slope * dist];
  };
  // Does the shot leave the current sector through its floor/ceiling before dist?
  const planeCheck = (dist) => {
    const z = shootz + slope * dist;
    if (z < sector.floorheight && slope < 0) {
      const d = (sector.floorheight - shootz) / slope;
      const [x, y] = posAt(Math.max(lastDist, d - 2));
      result = { kind: world.isSkyFlat(sector.floorpic) ? 'sky' : 'floor', x, y, z: sector.floorheight, sector, dist: d };
      return true;
    }
    if (z > sector.ceilingheight && slope > 0) {
      const d = (sector.ceilingheight - shootz) / slope;
      const [x, y] = posAt(Math.max(lastDist, d - 2));
      result = { kind: world.isSkyFlat(sector.ceilingpic) ? 'sky' : 'ceiling', x, y, z: sector.ceilingheight, sector, dist: d };
      return true;
    }
    return false;
  };
  pathTraverse(world, t1.x, t1.y, x2, y2, PT_ADDLINES | PT_ADDTHINGS, (ic) => {
    const dist = distance * ic.frac;
    if (planeCheck(dist)) return false;
    if (ic.isLine) {
      const li = ic.line;
      if (li.special && !opts.noSpecials) world.shootSpecialLine(t1, li);
      let hit = false;
      let part = 'mid';
      if (!(li.flags & ML.TWOSIDED) || !li.backsector) {
        hit = true;
      } else {
        lineOpening(li);
        const z = shootz + slope * dist;
        if (z < opening.bottom) { hit = true; part = 'lower'; } else if (z > opening.top) { hit = true; part = 'upper'; }
      }
      if (!hit) {
        lastDist = dist;
        const side = pointOnLineSide(sx, sy, li);
        sector = side === 0 ? (li.backsector || sector) : li.frontsector;
        return true;
      }
      const d = Math.max(0, dist - 4);
      const [x, y, z] = posAt(d);
      const side = pointOnLineSide(sx, sy, li);
      const facing = side === 0 ? li.frontsector : li.backsector;
      if (facing && world.isSkyFlat(facing.ceilingpic)) {
        if (z > facing.ceilingheight) { result = { kind: 'sky', x, y, z }; return false; }
        if (li.backsector && world.isSkyFlat(li.backsector.ceilingpic) && world.isSkyFlat(li.frontsector.ceilingpic) && part === 'upper') {
          result = { kind: 'sky', x, y, z };
          return false;
        }
      }
      result = { kind: 'wall', x, y, z, line: li, side, part, sector: facing, dist: d };
      if (!opts.noPuff) world.spawnPuff(x, y, z, distance <= 64);
      return false;
    }
    const th = ic.thing;
    if (th === t1) return true;
    if (!(th.flags & MF.SHOOTABLE)) {
      if (opts.hitCorpses && (th.flags & MF.CORPSE) && th.ext && th.ext.shootable) {
        const zz = shootz + slope * dist;
        if (zz >= th.z - 2 && zz <= th.z + Math.max(16, th.height)) opts.hitCorpses(th, dist, angle);
      }
      return true;
    }
    if (dist <= 0) return true;
    const thingtopslope = (th.z + th.height - shootz) / dist;
    if (thingtopslope < slope) return true;
    const thingbottomslope = (th.z - shootz) / dist;
    if (thingbottomslope > slope) return true;
    const d = Math.max(0, dist - 10);
    const [x, y, z] = posAt(d);
    const zHit = shootz + slope * dist;
    result = { kind: 'thing', x, y, z, thing: th, dist, hitHeight: (zHit - th.z) / th.height, angle };
    if (opts.onThingHit) opts.onThingHit(result);
    if (!opts.noPuff) {
      if (th.flags & MF.NOBLOOD) world.spawnPuff(x, y, z, distance <= 64);
      else world.spawnBlood(x, y, z, damage, th);
    }
    if (damage) world.damageMobj(th, t1, t1, result.damageOverride != null ? result.damageOverride : damage, result);
    return false;
  });
  if (result.kind === 'none') planeCheck(distance);
  if ((result.kind === 'floor' || result.kind === 'ceiling') && !opts.noPuff) {
    world.spawnPuff(result.x, result.y, result.z + (result.kind === 'floor' ? 1 : -1), false);
  }
  return result;
}

// --- Use ------------------------------------------------------------------

export function useLines(world, player) {
  const mo = player.mo;
  const angle = mo.angle;
  const x1 = mo.x, y1 = mo.y;
  const x2 = x1 + USERANGE * Math.cos(angle);
  const y2 = y1 + USERANGE * Math.sin(angle);
  pathTraverse(world, x1, y1, x2, y2, PT_ADDLINES, (ic) => {
    const li = ic.line;
    if (!li.special) {
      lineOpening(li);
      if (opening.range <= 0) {
        world.sound(mo, 'noway');
        return false;
      }
      return true;
    }
    const side = pointOnLineSide(mo.x, mo.y, li) === 1 ? 1 : 0;
    world.useSpecialLine(mo, li, side);
    return false;
  });
}

// --- Radius attack ----------------------------------------------------------

export function radiusAttack(world, spot, source, damage) {
  const dist = damage + MAXRADIUS;
  const bm = world.level.blockmap;
  const yh = Math.floor((spot.y + dist - bm.originy) / 128);
  const yl = Math.floor((spot.y - dist - bm.originy) / 128);
  const xh = Math.floor((spot.x + dist - bm.originx) / 128);
  const xl = Math.floor((spot.x - dist - bm.originx) / 128);
  for (let y = yl; y <= yh; y++) {
    for (let x = xl; x <= xh; x++) {
      blockThingsIterator(world, x, y, (thing) => {
        if (!(thing.flags & MF.SHOOTABLE)) {
          if (world.fx && world.fx.blastCorpse) world.fx.blastCorpse(thing, spot, damage);
          return true;
        }
        if (thing.type === MT.CYBORG || thing.type === MT.SPIDER) return true;
        const dx = Math.abs(thing.x - spot.x);
        const dy = Math.abs(thing.y - spot.y);
        let d = Math.max(dx, dy) - thing.radius;
        if (d < 0) d = 0;
        if (d >= damage) return true;
        if (world.checkSight(thing, spot)) {
          world.damageMobj(thing, spot, source, Math.floor(damage - d), { radius: true, spot });
        }
        return true;
      });
    }
  }
}

// --- Sector change ----------------------------------------------------------

export function changeSector(world, sector, crunch) {
  let nofit = false;
  const bb = sector.blockbox;
  for (let x = bb[2]; x <= bb[3]; x++) {
    for (let y = bb[1]; y <= bb[0]; y++) {
      blockThingsIterator(world, x, y, (thing) => {
        if (thingHeightClip(world, thing)) return true;
        if (thing.health <= 0) {
          if (world.fx && world.fx.crushCorpse) world.fx.crushCorpse(thing);
          world.setMobjState(thing, S.S_GIBS);
          thing.flags &= ~MF.SOLID;
          thing.height = 0;
          thing.radius = 0;
          return true;
        }
        if (thing.flags & MF.DROPPED) { world.removeMobj(thing); return true; }
        if (!(thing.flags & MF.SHOOTABLE)) return true;
        nofit = true;
        if (crunch && !(world.leveltime & 3)) {
          world.damageMobj(thing, null, null, 10, { crush: true });
          const mo = world.spawnMobj(thing.x, thing.y, thing.z + thing.height / 2, MT.BLOOD);
          mo.momx = world.rng.sub() / 16;
          mo.momy = world.rng.sub() / 16;
          if (world.fx && world.fx.crushBleed) world.fx.crushBleed(thing);
        }
        return true;
      });
    }
  }
  return nofit;
}

// --- Teleport ---------------------------------------------------------------

export function teleportMove(world, thing, x, y) {
  const tm = mapState;
  tm.thing = thing;
  tm.flags = thing.flags;
  tm.x = x;
  tm.y = y;
  tm.bbox[0] = y + thing.radius;
  tm.bbox[1] = y - thing.radius;
  tm.bbox[2] = x - thing.radius;
  tm.bbox[3] = x + thing.radius;
  const ss = world.pointInSubsector(x, y);
  tm.ceilingline = null;
  tm.floorz = tm.dropoffz = ss.sector.floorheight;
  tm.ceilingz = ss.sector.ceilingheight;
  world.validcount++;
  tm.spechit.length = 0;
  const bm = world.level.blockmap;
  const xl = Math.floor((tm.bbox[2] - bm.originx - MAXRADIUS) / 128);
  const xh = Math.floor((tm.bbox[3] - bm.originx + MAXRADIUS) / 128);
  const yl = Math.floor((tm.bbox[1] - bm.originy - MAXRADIUS) / 128);
  const yh = Math.floor((tm.bbox[0] - bm.originy + MAXRADIUS) / 128);
  for (let bx = xl; bx <= xh; bx++) {
    for (let by = yl; by <= yh; by++) {
      const ok = blockThingsIterator(world, bx, by, (th) => {
        if (!(th.flags & MF.SHOOTABLE)) return true;
        const blockdist = th.radius + thing.radius;
        if (Math.abs(th.x - x) >= blockdist || Math.abs(th.y - y) >= blockdist) return true;
        if (th === thing) return true;
        if (!thing.player && world.mapName !== 'MAP30') return false;
        world.damageMobj(th, thing, thing, 10000);
        return true;
      });
      if (!ok) return false;
    }
  }
  const floorz = tm.floorz, ceilingz = tm.ceilingz;
  unsetThingPosition(world, thing);
  thing.floorz = floorz;
  thing.ceilingz = ceilingz;
  thing.x = x;
  thing.y = y;
  setThingPosition(world, thing);
  return true;
}

export { aproxDistance, pointToAngle };
