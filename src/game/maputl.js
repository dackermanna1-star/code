// Port of p_maputl.c: geometry predicates, line openings, blockmap
// iteration and intercept-based path traversal.

import { ST_HORIZONTAL, ST_VERTICAL, ST_POSITIVE, pointInSubsector } from './mapdata.js';
import { MF } from './defs.js';

export function pointOnLineSide(x, y, line) {
  if (!line.dx) {
    if (x <= line.v1.x) return line.dy > 0 ? 1 : 0;
    return line.dy < 0 ? 1 : 0;
  }
  if (!line.dy) {
    if (y <= line.v1.y) return line.dx < 0 ? 1 : 0;
    return line.dx > 0 ? 1 : 0;
  }
  const left = line.dy * (x - line.v1.x);
  const right = (y - line.v1.y) * line.dx;
  return right < left ? 0 : 1;
}

// tmbox: [top, bottom, left, right]
export function boxOnLineSide(box, ld) {
  let p1, p2;
  switch (ld.slopetype) {
    case ST_HORIZONTAL:
      p1 = box[0] > ld.v1.y ? 1 : 0;
      p2 = box[1] > ld.v1.y ? 1 : 0;
      if (ld.dx < 0) { p1 ^= 1; p2 ^= 1; }
      break;
    case ST_VERTICAL:
      p1 = box[3] < ld.v1.x ? 1 : 0;
      p2 = box[2] < ld.v1.x ? 1 : 0;
      if (ld.dy < 0) { p1 ^= 1; p2 ^= 1; }
      break;
    case ST_POSITIVE:
      p1 = pointOnLineSide(box[2], box[0], ld);
      p2 = pointOnLineSide(box[3], box[1], ld);
      break;
    default:
      p1 = pointOnLineSide(box[3], box[0], ld);
      p2 = pointOnLineSide(box[2], box[1], ld);
      break;
  }
  return p1 === p2 ? p1 : -1;
}

export function pointOnDivlineSide(x, y, dl) {
  if (!dl.dx) {
    if (x <= dl.x) return dl.dy > 0 ? 1 : 0;
    return dl.dy < 0 ? 1 : 0;
  }
  if (!dl.dy) {
    if (y <= dl.y) return dl.dx < 0 ? 1 : 0;
    return dl.dx > 0 ? 1 : 0;
  }
  const left = dl.dy * (x - dl.x);
  const right = (y - dl.y) * dl.dx;
  return right < left ? 0 : 1;
}

// Fraction along v2 where it crosses v1.
export function interceptVector(v2, v1) {
  const den = v1.dy * v2.dx - v1.dx * v2.dy;
  if (den === 0) return 0;
  const num = (v1.x - v2.x) * v1.dy + (v2.y - v1.y) * v1.dx;
  return num / den;
}

export const opening = { top: 0, bottom: 0, range: 0, lowfloor: 0 };

export function lineOpening(line) {
  if (!line.backsector) {
    opening.range = 0;
    return opening;
  }
  const front = line.frontsector;
  const back = line.backsector;
  opening.top = Math.min(front.ceilingheight, back.ceilingheight);
  if (front.floorheight > back.floorheight) {
    opening.bottom = front.floorheight;
    opening.lowfloor = back.floorheight;
  } else {
    opening.bottom = back.floorheight;
    opening.lowfloor = front.floorheight;
  }
  opening.range = opening.top - opening.bottom;
  return opening;
}

// --- Thing links ------------------------------------------------------------

export function unsetThingPosition(w, thing) {
  if (!(thing.flags & MF.NOSECTOR) && thing.sectorLink) {
    thing.sectorLink.things.delete(thing);
    thing.sectorLink = null;
  }
  if (!(thing.flags & MF.NOBLOCKMAP) && thing.blockLink) {
    thing.blockLink.delete(thing);
    thing.blockLink = null;
  }
}

export function setThingPosition(w, thing) {
  const ss = pointInSubsector(w.level, thing.x, thing.y);
  thing.subsector = ss;
  if (!(thing.flags & MF.NOSECTOR)) {
    ss.sector.things.add(thing);
    thing.sectorLink = ss.sector;
  }
  if (!(thing.flags & MF.NOBLOCKMAP)) {
    const bm = w.level.blockmap;
    const bx = Math.floor((thing.x - bm.originx) / 128);
    const by = Math.floor((thing.y - bm.originy) / 128);
    if (bx >= 0 && by >= 0 && bx < bm.width && by < bm.height) {
      const set = bm.things[by * bm.width + bx];
      set.add(thing);
      thing.blockLink = set;
    } else {
      thing.blockLink = null;
    }
  }
}

// --- Block iteration ------------------------------------------------------

export function blockLinesIterator(w, x, y, fn) {
  const bm = w.level.blockmap;
  if (x < 0 || y < 0 || x >= bm.width || y >= bm.height) return true;
  const list = bm.lists[y * bm.width + x];
  for (let i = 0; i < list.length; i++) {
    const ld = list[i];
    if (ld.validcount === w.validcount) continue;
    ld.validcount = w.validcount;
    if (!fn(ld)) return false;
  }
  return true;
}

export function blockThingsIterator(w, x, y, fn) {
  const bm = w.level.blockmap;
  if (x < 0 || y < 0 || x >= bm.width || y >= bm.height) return true;
  const set = bm.things[y * bm.width + x];
  if (!set.size) return true;
  for (const mo of Array.from(set)) {
    if (!fn(mo)) return false;
  }
  return true;
}

export function blockCoords(w, x, y) {
  const bm = w.level.blockmap;
  return [Math.floor((x - bm.originx) / 128), Math.floor((y - bm.originy) / 128)];
}

// --- Path traversal -------------------------------------------------------

export const PT_ADDLINES = 1;
export const PT_ADDTHINGS = 2;
export const PT_EARLYOUT = 4;

// Traces from (x1,y1) to (x2,y2) calling trav(intercept) in order of
// distance. intercept: {frac, isLine, line?, thing?}. Returns false if
// trav stopped early.
export function pathTraverse(w, x1, y1, x2, y2, flags, trav) {
  const bm = w.level.blockmap;
  w.validcount++;
  const intercepts = [];
  // Nudge off exact block boundaries like the original.
  if (((x1 - bm.originx) % 128) === 0) x1 += 1;
  if (((y1 - bm.originy) % 128) === 0) y1 += 1;
  const trace = { x: x1, y: y1, dx: x2 - x1, dy: y2 - y1 };
  const earlyout = flags & PT_EARLYOUT;

  const addLine = (ld) => {
    let s1, s2;
    if (Math.abs(trace.dx) > 16 || Math.abs(trace.dy) > 16) {
      s1 = pointOnDivlineSide(ld.v1.x, ld.v1.y, trace);
      s2 = pointOnDivlineSide(ld.v2.x, ld.v2.y, trace);
    } else {
      s1 = pointOnLineSide(trace.x, trace.y, ld);
      s2 = pointOnLineSide(trace.x + trace.dx, trace.y + trace.dy, ld);
    }
    if (s1 === s2) return true;
    const dl = { x: ld.v1.x, y: ld.v1.y, dx: ld.dx, dy: ld.dy };
    const frac = interceptVector(trace, dl);
    if (frac < 0) return true;
    if (earlyout && frac < 1 && !ld.backsector) return false;
    intercepts.push({ frac, isLine: true, line: ld });
    return true;
  };

  const addThing = (thing) => {
    const tracepositive = (trace.dx > 0) === (trace.dy > 0);
    let x1t, y1t, x2t, y2t;
    if (tracepositive) {
      x1t = thing.x - thing.radius; y1t = thing.y + thing.radius;
      x2t = thing.x + thing.radius; y2t = thing.y - thing.radius;
    } else {
      x1t = thing.x - thing.radius; y1t = thing.y - thing.radius;
      x2t = thing.x + thing.radius; y2t = thing.y + thing.radius;
    }
    const s1 = pointOnDivlineSide(x1t, y1t, trace);
    const s2 = pointOnDivlineSide(x2t, y2t, trace);
    if (s1 === s2) return true;
    const dl = { x: x1t, y: y1t, dx: x2t - x1t, dy: y2t - y1t };
    const frac = interceptVector(trace, dl);
    if (frac < 0) return true;
    intercepts.push({ frac, isLine: false, thing });
    return true;
  };

  const lx1 = x1 - bm.originx, ly1 = y1 - bm.originy;
  const lx2 = x2 - bm.originx, ly2 = y2 - bm.originy;
  let xt1 = Math.floor(lx1 / 128), yt1 = Math.floor(ly1 / 128);
  const xt2 = Math.floor(lx2 / 128), yt2 = Math.floor(ly2 / 128);
  let mapxstep, mapystep, partial, xstep, ystep;
  let xintercept, yintercept;
  if (xt2 > xt1) {
    mapxstep = 1;
    partial = 1 - ((lx1 / 128) - xt1);
    ystep = (ly2 - ly1) / Math.abs(lx2 - lx1);
  } else if (xt2 < xt1) {
    mapxstep = -1;
    partial = (lx1 / 128) - xt1;
    ystep = (ly2 - ly1) / Math.abs(lx2 - lx1);
  } else {
    mapxstep = 0;
    partial = 1;
    ystep = 256;
  }
  yintercept = ly1 / 128 + partial * ystep;
  if (yt2 > yt1) {
    mapystep = 1;
    partial = 1 - ((ly1 / 128) - yt1);
    xstep = (lx2 - lx1) / Math.abs(ly2 - ly1);
  } else if (yt2 < yt1) {
    mapystep = -1;
    partial = (ly1 / 128) - yt1;
    xstep = (lx2 - lx1) / Math.abs(ly2 - ly1);
  } else {
    mapystep = 0;
    partial = 1;
    xstep = 256;
  }
  xintercept = lx1 / 128 + partial * xstep;

  let mapx = xt1, mapy = yt1;
  for (let count = 0; count < 128; count++) {
    if (flags & PT_ADDLINES) {
      if (!blockLinesIterator(w, mapx, mapy, addLine)) return false;
    }
    if (flags & PT_ADDTHINGS) {
      if (!blockThingsIterator(w, mapx, mapy, addThing)) return false;
    }
    if (mapx === xt2 && mapy === yt2) break;
    if (Math.floor(yintercept) === mapy) {
      yintercept += ystep;
      mapx += mapxstep;
    } else if (Math.floor(xintercept) === mapx) {
      xintercept += xstep;
      mapy += mapystep;
    } else {
      // Diagonal corner: visit both neighbours to be safe.
      if (flags & PT_ADDLINES) {
        blockLinesIterator(w, mapx + mapxstep, mapy, addLine);
        blockLinesIterator(w, mapx, mapy + mapystep, addLine);
      }
      if (flags & PT_ADDTHINGS) {
        blockThingsIterator(w, mapx + mapxstep, mapy, addThing);
        blockThingsIterator(w, mapx, mapy + mapystep, addThing);
      }
      mapx += mapxstep;
      mapy += mapystep;
      yintercept += ystep;
      xintercept += xstep;
    }
  }
  intercepts.sort((a, b) => a.frac - b.frac);
  for (const ic of intercepts) {
    if (ic.frac > 1) break;
    if (!trav(ic, trace)) return false;
  }
  return true;
}
