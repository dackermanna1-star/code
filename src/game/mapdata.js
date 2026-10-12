// Map lump parsing (vanilla binary format) into runtime level structures,
// plus derived data: line/sector relations, blockmap, reject and convex
// subsector polygons for rendering flats.

import { lumpName } from '../wad/wad.js';

export const ML = {
  BLOCKING: 1, BLOCKMONSTERS: 2, TWOSIDED: 4, DONTPEGTOP: 8, DONTPEGBOTTOM: 16,
  SECRET: 32, SOUNDBLOCK: 64, DONTDRAW: 128, MAPPED: 256,
};

export const ST_HORIZONTAL = 0;
export const ST_VERTICAL = 1;
export const ST_POSITIVE = 2;
export const ST_NEGATIVE = 3;

export const MAPBLOCKSIZE = 128;
export const MAXRADIUS = 32;

function view(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function loadMapData(lumps, res) {
  const level = {};
  // Vertexes
  {
    const v = view(lumps.VERTEXES);
    const n = Math.floor(lumps.VERTEXES.length / 4);
    level.vertices = new Array(n);
    for (let i = 0; i < n; i++) level.vertices[i] = { x: v.getInt16(i * 4, true), y: v.getInt16(i * 4 + 2, true) };
  }
  // Sectors
  {
    const b = lumps.SECTORS;
    const v = view(b);
    const n = Math.floor(b.length / 26);
    level.sectors = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 26;
      const floorName = lumpName(b, o + 4);
      const ceilName = lumpName(b, o + 12);
      const sec = {
        index: i,
        floorheight: v.getInt16(o, true),
        ceilingheight: v.getInt16(o + 2, true),
        floorpic: res.flatNum(floorName),
        ceilingpic: res.flatNum(ceilName),
        lightlevel: v.getInt16(o + 20, true),
        special: v.getInt16(o + 22, true),
        tag: v.getInt16(o + 24, true),
        soundtraps: 0,
        soundtarget: null,
        validcount: 0,
        lines: [],
        things: new Set(),
        specialdata: null,
        blockbox: [0, 0, 0, 0],
        soundorg: { x: 0, y: 0, z: 0 },
        prevFloor: 0,
        prevCeil: 0,
        prevLight: 0,
      };
      sec.prevFloor = sec.floorheight;
      sec.prevCeil = sec.ceilingheight;
      sec.prevLight = sec.lightlevel;
      level.sectors[i] = sec;
    }
  }
  // Sidedefs
  {
    const b = lumps.SIDEDEFS;
    const v = view(b);
    const n = Math.floor(b.length / 30);
    level.sides = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 30;
      const sectorIndex = v.getInt16(o + 28, true);
      level.sides[i] = {
        index: i,
        textureoffset: v.getInt16(o, true),
        rowoffset: v.getInt16(o + 2, true),
        toptexture: res.textureNum(lumpName(b, o + 4)),
        bottomtexture: res.textureNum(lumpName(b, o + 12)),
        midtexture: res.textureNum(lumpName(b, o + 20)),
        sector: level.sectors[sectorIndex] || level.sectors[0],
        line: null,
      };
    }
  }
  // Linedefs
  {
    const b = lumps.LINEDEFS;
    const v = view(b);
    const n = Math.floor(b.length / 14);
    level.lines = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 14;
      const v1 = level.vertices[v.getUint16(o, true)];
      const v2 = level.vertices[v.getUint16(o + 2, true)];
      const s0 = v.getUint16(o + 10, true);
      const s1 = v.getUint16(o + 12, true);
      const line = {
        index: i,
        v1, v2,
        dx: v2.x - v1.x,
        dy: v2.y - v1.y,
        flags: v.getUint16(o + 4, true),
        special: v.getUint16(o + 6, true),
        tag: v.getUint16(o + 8, true),
        sidenum: [s0 === 0xffff ? -1 : s0, s1 === 0xffff ? -1 : s1],
        validcount: 0,
        specialdata: null,
        frontsector: null,
        backsector: null,
        front: null,
        back: null,
        bbox: [0, 0, 0, 0],
        slopetype: 0,
        length: 0,
      };
      line.length = Math.hypot(line.dx, line.dy);
      line.bbox = [Math.max(v1.y, v2.y), Math.min(v1.y, v2.y), Math.min(v1.x, v2.x), Math.max(v1.x, v2.x)];
      if (line.dx === 0) line.slopetype = ST_VERTICAL;
      else if (line.dy === 0) line.slopetype = ST_HORIZONTAL;
      else line.slopetype = (line.dy / line.dx > 0) ? ST_POSITIVE : ST_NEGATIVE;
      if (line.sidenum[0] >= 0 && level.sides[line.sidenum[0]]) {
        line.front = level.sides[line.sidenum[0]];
        line.frontsector = line.front.sector;
        line.front.line = line;
      }
      if (line.sidenum[1] >= 0 && level.sides[line.sidenum[1]]) {
        line.back = level.sides[line.sidenum[1]];
        line.backsector = line.back.sector;
        if (!line.back.line) line.back.line = line;
      }
      if (!line.frontsector) {
        // Broken map: give it the back sector so nothing crashes.
        line.frontsector = line.backsector || level.sectors[0];
      }
      level.lines[i] = line;
    }
  }
  // Segs
  {
    const b = lumps.SEGS;
    const v = view(b);
    const n = Math.floor(b.length / 12);
    level.segs = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      const line = level.lines[v.getUint16(o + 6, true)];
      const side = v.getInt16(o + 8, true);
      const seg = {
        v1: level.vertices[v.getUint16(o, true)],
        v2: level.vertices[v.getUint16(o + 2, true)],
        angle: v.getInt16(o + 4, true),
        linedef: line,
        side,
        offset: v.getInt16(o + 10, true),
        frontsector: null,
        backsector: null,
      };
      if (line) {
        const sd = side ? line.back : line.front;
        seg.frontsector = sd ? sd.sector : line.frontsector;
        seg.backsector = (line.flags & ML.TWOSIDED) ? (side ? line.frontsector : line.backsector) : null;
      }
      level.segs[i] = seg;
    }
  }
  // Subsectors
  {
    const v = view(lumps.SSECTORS);
    const n = Math.floor(lumps.SSECTORS.length / 4);
    level.subsectors = new Array(n);
    for (let i = 0; i < n; i++) {
      const numsegs = v.getUint16(i * 4, true);
      const firstseg = v.getUint16(i * 4 + 2, true);
      const seg = level.segs[firstseg];
      level.subsectors[i] = {
        index: i, numsegs, firstseg,
        sector: seg && seg.frontsector ? seg.frontsector : level.sectors[0],
        poly: null,
      };
    }
  }
  // Nodes
  {
    const v = view(lumps.NODES);
    const n = Math.floor(lumps.NODES.length / 28);
    level.nodes = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 28;
      level.nodes[i] = {
        x: v.getInt16(o, true), y: v.getInt16(o + 2, true),
        dx: v.getInt16(o + 4, true), dy: v.getInt16(o + 6, true),
        bbox: [
          [v.getInt16(o + 8, true), v.getInt16(o + 10, true), v.getInt16(o + 12, true), v.getInt16(o + 14, true)],
          [v.getInt16(o + 16, true), v.getInt16(o + 18, true), v.getInt16(o + 20, true), v.getInt16(o + 22, true)],
        ],
        children: [v.getUint16(o + 24, true), v.getUint16(o + 26, true)],
      };
    }
  }
  // Things
  {
    const v = view(lumps.THINGS);
    const n = Math.floor(lumps.THINGS.length / 10);
    level.mapthings = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 10;
      level.mapthings[i] = {
        x: v.getInt16(o, true), y: v.getInt16(o + 2, true),
        angle: v.getInt16(o + 4, true), type: v.getInt16(o + 6, true), options: v.getInt16(o + 8, true),
      };
    }
  }

  groupLines(level);
  loadBlockmap(level, lumps.BLOCKMAP);
  loadReject(level, lumps.REJECT);
  buildSubsectorPolygons(level);
  return level;
}

function groupLines(level) {
  for (const line of level.lines) {
    if (line.frontsector) line.frontsector.lines.push(line);
    if (line.backsector && line.backsector !== line.frontsector) line.backsector.lines.push(line);
  }
  for (const sec of level.sectors) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const line of sec.lines) {
      for (const p of [line.v1, line.v2]) {
        minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
        miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
      }
    }
    if (!isFinite(minx)) { minx = maxx = miny = maxy = 0; }
    sec.bbox = { minx, miny, maxx, maxy };
    sec.soundorg = { x: (minx + maxx) / 2, y: (miny + maxy) / 2, z: 0 };
  }
}

function loadBlockmap(level, bytes) {
  let ok = bytes && bytes.length >= 8;
  if (ok) {
    const v = view(bytes);
    const bm = {
      originx: v.getInt16(0, true),
      originy: v.getInt16(2, true),
      width: v.getInt16(4, true),
      height: v.getInt16(6, true),
      lists: [],
    };
    const count = bm.width * bm.height;
    if (bm.width <= 0 || bm.height <= 0 || 8 + count * 2 > bytes.length) ok = false;
    else {
      const words = bytes.length >> 1;
      for (let i = 0; i < count; i++) {
        let off = v.getUint16(8 + i * 2, true);
        const list = [];
        if (off < words) {
          off++; // skip leading 0
          while (off < words) {
            const ln = v.getUint16(off * 2, true);
            if (ln === 0xffff) break;
            if (level.lines[ln]) list.push(level.lines[ln]);
            off++;
          }
        }
        bm.lists.push(list);
      }
      level.blockmap = bm;
    }
  }
  if (!ok) level.blockmap = generateBlockmap(level);
  const bm = level.blockmap;
  bm.things = new Array(bm.width * bm.height);
  for (let i = 0; i < bm.things.length; i++) bm.things[i] = new Set();
  for (const sec of level.sectors) {
    const b = sec.bbox;
    sec.blockbox = [
      Math.min(bm.height - 1, (b.maxy - bm.originy + MAXRADIUS) >> 7),
      Math.max(0, (b.miny - bm.originy - MAXRADIUS) >> 7),
      Math.max(0, (b.minx - bm.originx - MAXRADIUS) >> 7),
      Math.min(bm.width - 1, (b.maxx - bm.originx + MAXRADIUS) >> 7),
    ];
  }
}

function generateBlockmap(level) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const v of level.vertices) {
    minx = Math.min(minx, v.x); miny = Math.min(miny, v.y);
    maxx = Math.max(maxx, v.x); maxy = Math.max(maxy, v.y);
  }
  const originx = minx - 8, originy = miny - 8;
  const width = ((maxx - originx) >> 7) + 1;
  const height = ((maxy - originy) >> 7) + 1;
  const lists = [];
  for (let i = 0; i < width * height; i++) lists.push([]);
  for (const line of level.lines) {
    const x0 = Math.floor((Math.min(line.v1.x, line.v2.x) - originx) / 128);
    const x1 = Math.floor((Math.max(line.v1.x, line.v2.x) - originx) / 128);
    const y0 = Math.floor((Math.min(line.v1.y, line.v2.y) - originy) / 128);
    const y1 = Math.floor((Math.max(line.v1.y, line.v2.y) - originy) / 128);
    for (let by = y0; by <= y1; by++) {
      for (let bx = x0; bx <= x1; bx++) {
        // Box/segment overlap test.
        const bl = originx + bx * 128, bb = originy + by * 128;
        if (lineIntersectsBox(line, bl, bb, bl + 128, bb + 128)) lists[by * width + bx].push(line);
      }
    }
  }
  return { originx, originy, width, height, lists };
}

function lineIntersectsBox(line, x0, y0, x1, y1) {
  const side = (x, y) => Math.sign(line.dy * (x - line.v1.x) - line.dx * (y - line.v1.y));
  const s = side(x0, y0) + side(x1, y0) + side(x0, y1) + side(x1, y1);
  return Math.abs(s) !== 4;
}

function loadReject(level, bytes) {
  const n = level.sectors.length;
  const needed = Math.ceil((n * n) / 8);
  const rej = new Uint8Array(needed);
  if (bytes) rej.set(bytes.subarray(0, Math.min(needed, bytes.length)));
  level.reject = rej;
}

export function pointOnNodeSide(x, y, node) {
  if (!node.dx) return x <= node.x ? (node.dy > 0 ? 1 : 0) : (node.dy < 0 ? 1 : 0);
  if (!node.dy) return y <= node.y ? (node.dx < 0 ? 1 : 0) : (node.dx > 0 ? 1 : 0);
  const left = node.dy * (x - node.x);
  const right = (y - node.y) * node.dx;
  return right < left ? 0 : 1;
}

export function pointInSubsector(level, x, y) {
  if (!level.nodes.length) return level.subsectors[0];
  let n = level.nodes.length - 1;
  while (!(n & 0x8000)) {
    const node = level.nodes[n];
    n = node.children[pointOnNodeSide(x, y, node)];
  }
  return level.subsectors[n & 0x7fff];
}

// --- Subsector polygon reconstruction ------------------------------------

function clipPoly(poly, ax, ay, dx, dy, keepFront) {
  // Keeps the part of the polygon on the right (front) side of the directed
  // line (ax,ay)+(dx,dy)*t when keepFront, else the left side.
  const out = [];
  const eps = 0.01;
  const len = Math.hypot(dx, dy) || 1;
  const f = (p) => {
    const d = (dy * (p.x - ax) - dx * (p.y - ay)) / len;
    return keepFront ? d : -d;
  };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = f(a);
    const db = f(b);
    if (da >= -eps) out.push(a);
    if ((da > eps && db < -eps) || (da < -eps && db > eps)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function buildSubsectorPolygons(level) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const v of level.vertices) {
    minx = Math.min(minx, v.x); miny = Math.min(miny, v.y);
    maxx = Math.max(maxx, v.x); maxy = Math.max(maxy, v.y);
  }
  const m = 64;
  const root = [
    { x: minx - m, y: miny - m }, { x: maxx + m, y: miny - m },
    { x: maxx + m, y: maxy + m }, { x: minx - m, y: maxy + m },
  ];
  // Our clip keeps the side where dy*(x-ax)-dx*(y-ay) >= 0, which matches
  // R_PointOnSide's front side (child 0).
  const walk = (n, poly) => {
    if (n & 0x8000) {
      finishSubsector(level, level.subsectors[n & 0x7fff], poly);
      return;
    }
    const node = level.nodes[n];
    if (!node) return;
    walk(node.children[0], clipPoly(poly, node.x, node.y, node.dx, node.dy, true));
    walk(node.children[1], clipPoly(poly, node.x, node.y, node.dx, node.dy, false));
  };
  if (level.nodes.length) walk(level.nodes.length - 1, root);
  else if (level.subsectors.length) finishSubsector(level, level.subsectors[0], root);
}

function finishSubsector(level, ss, poly) {
  if (!ss) return;
  let p = poly;
  const segPts = [];
  for (let i = 0; i < ss.numsegs; i++) {
    const seg = level.segs[ss.firstseg + i];
    if (!seg) continue;
    segPts.push(seg.v1, seg.v2);
    // Segs run with the subsector on their right (front) side.
    const clipped = clipPoly(p, seg.v1.x, seg.v1.y, seg.v2.x - seg.v1.x, seg.v2.y - seg.v1.y, true);
    if (clipped.length >= 3) p = clipped;
  }
  if (p.length < 3 || Math.abs(polyArea(p)) < 0.5) p = convexHull(segPts);
  // Remove near-duplicate points.
  const out = [];
  for (const pt of p) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - pt.x) > 0.001 || Math.abs(last.y - pt.y) > 0.001) out.push({ x: pt.x, y: pt.y });
  }
  if (out.length > 2) {
    const f = out[0], l = out[out.length - 1];
    if (Math.abs(f.x - l.x) < 0.001 && Math.abs(f.y - l.y) < 0.001) out.pop();
  }
  ss.poly = out;
}
