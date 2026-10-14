// Minimal vanilla (no GL, no minisegs) Doom node builder.
// Input geometry: { verts: [[x,y]...], lines: [{v1,v2,f,b}...] (b === 0xffff for none), sides: [{s}] }
// Output: { verts, segs, ssectors, nodes } plus encodeNodeLumps() -> { VERTEXES, SEGS, SSECTORS, NODES }.

const EPS = 1 / 512;        // perpendicular distance treated as "on the line"
const SNAP = 0.75;          // don't split closer than this (map units, along the seg) to an endpoint
const SPLIT_COST = 8, DIAG_COST = 2;

function bam(dx, dy) {
  let a = Math.round((Math.atan2(dy, dx) / (2 * Math.PI)) * 65536);
  return ((a % 65536) + 65536) % 65536;
}

// Classification results
const FRONT = 0, BACK = 1, SPLIT = 2, ON_SAME = 3, ON_OPP = 4;

export function buildNodes(g) {
  const lineSide = (li, side) => {
    const L = g.lines[li];
    const a = g.verts[side ? L.v2 : L.v1], b = g.verts[side ? L.v1 : L.v2];
    return { ox: a[0], oy: a[1], dx: b[0] - a[0], dy: b[1] - a[1] };
  };
  // Initial segs. Each carries its partition line (exact integers from its linedef).
  let segs = [];
  g.lines.forEach((L, li) => {
    const a = g.verts[L.v1], b = g.verts[L.v2];
    if (a[0] === b[0] && a[1] === b[1]) return; // zero-length line: no segs
    for (const side of [0, 1]) {
      const sd = side ? L.b : L.f;
      if (sd === 0xffff || sd === undefined || sd === -1) continue;
      const pl = lineSide(li, side);
      segs.push({
        x1: pl.ox, y1: pl.oy, x2: pl.ox + pl.dx, y2: pl.oy + pl.dy,
        line: li, side, sector: g.sides[sd].s,
        pl, plen: Math.hypot(pl.dx, pl.dy), angle: bam(pl.dx, pl.dy),
        key: li * 2 + side,
      });
    }
  });

  // Signed perpendicular distance of (x,y) from partition line p; > 0 = right/front side,
  // matching R_PointOnSide (front iff dy*(x-px) > dx*(y-py)).
  const dist = (p, plen, x, y) => (p.dy * (x - p.ox) - p.dx * (y - p.oy)) / plen;

  function classify(s, p, plen) {
    let d1 = dist(p, plen, s.x1, s.y1), d2 = dist(p, plen, s.x2, s.y2);
    if (Math.abs(d1) < EPS) d1 = 0;
    if (Math.abs(d2) < EPS) d2 = 0;
    if (d1 === 0 && d2 === 0) return (s.pl.dx * p.dx + s.pl.dy * p.dy) > 0 ? { c: ON_SAME } : { c: ON_OPP };
    if (d1 >= 0 && d2 >= 0) return { c: FRONT };
    if (d1 <= 0 && d2 <= 0) return { c: BACK };
    // Crosses: find intersection, snap to an endpoint if very close.
    const t = d1 / (d1 - d2);
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (t * len < SNAP) return { c: d2 > 0 ? FRONT : BACK };
    if ((1 - t) * len < SNAP) return { c: d1 > 0 ? FRONT : BACK };
    return { c: SPLIT, t, d1 };
  }

  function splitSeg(s, t) {
    const ix = s.x1 + (s.x2 - s.x1) * t, iy = s.y1 + (s.y2 - s.y1) * t;
    const a = { ...s, x2: ix, y2: iy };
    const b = { ...s, x1: ix, y1: iy };
    return [a, b];
  }

  const isConvex = (set) => {
    const sec = set[0].sector;
    for (const s of set) if (s.sector !== sec) return false;
    for (const a of set) {
      for (const b of set) {
        if (a === b) continue;
        const c = classify(b, a.pl, a.plen).c;
        if (c !== FRONT && c !== ON_SAME) return false;
      }
    }
    return true;
  };

  function choosePartition(set) {
    let best = null, bestCost = Infinity;
    const seen = new Set();
    // Candidate partitions: one per distinct (linedef, side); sample if huge.
    let cands = set.filter((s) => { if (seen.has(s.key)) return false; seen.add(s.key); return true; });
    if (cands.length > 128) { const step = cands.length / 128; cands = Array.from({ length: 128 }, (_, i) => cands[Math.floor(i * step)]); }
    for (const c of cands) {
      let front = 0, back = 0, splits = 0;
      for (const s of set) {
        const r = classify(s, c.pl, c.plen).c;
        if (r === FRONT || r === ON_SAME) front++;
        else if (r === BACK || r === ON_OPP) back++;
        else { splits++; front++; back++; }
      }
      if (front === 0 || back === 0) continue; // no progress: everything on one side
      let cost = splits * SPLIT_COST + Math.abs(front - back);
      if (c.pl.dx !== 0 && c.pl.dy !== 0) cost += DIAG_COST;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    return best;
  }

  // Output
  const outVerts = g.verts.map((v) => [v[0], v[1]]);
  const vkey = new Map(outVerts.map((v, i) => [v[0] + ',' + v[1], i]));
  const vertexIndex = (x, y) => {
    const rx = Math.round(x), ry = Math.round(y);
    const k = rx + ',' + ry;
    if (!vkey.has(k)) { vkey.set(k, outVerts.length); outVerts.push([rx, ry]); }
    return vkey.get(k);
  };
  const outSegs = [], ssectors = [], nodes = [];

  function makeLeaf(set) {
    const first = outSegs.length;
    for (const s of set) {
      const v1 = vertexIndex(s.x1, s.y1), v2 = vertexIndex(s.x2, s.y2);
      const offset = Math.round(Math.hypot(s.x1 - s.pl.ox, s.y1 - s.pl.oy));
      outSegs.push({ v1, v2, angle: s.angle, line: s.line, side: s.side, offset });
    }
    ssectors.push({ numsegs: set.length, firstseg: first });
    return 0x8000 | (ssectors.length - 1);
  }
  const bboxOf = (set) => {
    let t = -Infinity, b = Infinity, l = Infinity, r = -Infinity;
    for (const s of set) for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const rx = Math.round(x), ry = Math.round(y);
      t = Math.max(t, ry); b = Math.min(b, ry); l = Math.min(l, rx); r = Math.max(r, rx);
    }
    return [t, b, l, r];
  };

  let depthMax = 0;
  function build(set, depth) {
    depthMax = Math.max(depthMax, depth);
    if (isConvex(set)) return makeLeaf(set);
    const p = choosePartition(set);
    if (!p) { console.warn(`bsp: no partition for ${set.length} segs (sector mix?) — forcing leaf`); return makeLeaf(set); }
    const front = [], back = [];
    for (const s of set) {
      const r = classify(s, p.pl, p.plen);
      if (r.c === FRONT || r.c === ON_SAME) front.push(s);
      else if (r.c === BACK || r.c === ON_OPP) back.push(s);
      else {
        const [a, b] = splitSeg(s, r.t);
        if (r.d1 > 0) { front.push(a); back.push(b); } else { back.push(a); front.push(b); }
      }
    }
    const bbF = bboxOf(front), bbB = bboxOf(back);
    const c0 = build(front, depth + 1);
    const c1 = build(back, depth + 1);
    nodes.push({ x: p.pl.ox, y: p.pl.oy, dx: p.pl.dx, dy: p.pl.dy, bbox: [bbF, bbB], children: [c0, c1] });
    return nodes.length - 1;
  }
  if (segs.length) build(segs, 0);
  return { verts: outVerts, segs: outSegs, ssectors, nodes, depth: depthMax };
}

export function encodeNodeLumps(r) {
  const VX = Buffer.alloc(r.verts.length * 4);
  r.verts.forEach((v, i) => { VX.writeInt16LE(v[0], i * 4); VX.writeInt16LE(v[1], i * 4 + 2); });
  const SG = Buffer.alloc(r.segs.length * 12);
  r.segs.forEach((s, i) => { const o = i * 12; SG.writeUInt16LE(s.v1, o); SG.writeUInt16LE(s.v2, o + 2); SG.writeUInt16LE(s.angle, o + 4); SG.writeUInt16LE(s.line, o + 6); SG.writeUInt16LE(s.side, o + 8); SG.writeInt16LE(s.offset, o + 10); });
  const SS = Buffer.alloc(r.ssectors.length * 4);
  r.ssectors.forEach((s, i) => { SS.writeUInt16LE(s.numsegs, i * 4); SS.writeUInt16LE(s.firstseg, i * 4 + 2); });
  const ND = Buffer.alloc(r.nodes.length * 28);
  r.nodes.forEach((n, i) => {
    const o = i * 28;
    ND.writeInt16LE(n.x, o); ND.writeInt16LE(n.y, o + 2); ND.writeInt16LE(n.dx, o + 4); ND.writeInt16LE(n.dy, o + 6);
    n.bbox[0].forEach((v, j) => ND.writeInt16LE(v, o + 8 + j * 2));
    n.bbox[1].forEach((v, j) => ND.writeInt16LE(v, o + 16 + j * 2));
    ND.writeUInt16LE(n.children[0], o + 24); ND.writeUInt16LE(n.children[1], o + 26);
  });
  return { VERTEXES: VX, SEGS: SG, SSECTORS: SS, NODES: ND };
}

// Vanilla BLOCKMAP (128x128 cells) using the same line/box test as the engine's generateBlockmap.
export function buildBlockmap(verts, lines) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of verts) { minx = Math.min(minx, x); miny = Math.min(miny, y); maxx = Math.max(maxx, x); maxy = Math.max(maxy, y); }
  const ox = minx - 8, oy = miny - 8;
  const w = ((maxx - ox) >> 7) + 1, h = ((maxy - oy) >> 7) + 1;
  const lists = Array.from({ length: w * h }, () => []);
  lines.forEach((L, li) => {
    const [x1, y1] = verts[L.v1], [x2, y2] = verts[L.v2];
    const dx = x2 - x1, dy = y2 - y1;
    const side = (x, y) => Math.sign(dy * (x - x1) - dx * (y - y1));
    for (let by = Math.floor((Math.min(y1, y2) - oy) / 128); by <= Math.floor((Math.max(y1, y2) - oy) / 128); by++) {
      for (let bx = Math.floor((Math.min(x1, x2) - ox) / 128); bx <= Math.floor((Math.max(x1, x2) - ox) / 128); bx++) {
        const l = ox + bx * 128, b = oy + by * 128;
        if (Math.abs(side(l, b) + side(l + 128, b) + side(l, b + 128) + side(l + 128, b + 128)) !== 4) lists[by * w + bx].push(li);
      }
    }
  });
  const words = [ox, oy, w, h]; const offs = []; const body = [];
  let pos = 4 + w * h;
  for (const list of lists) { offs.push(pos); body.push(0, ...list, 0xffff); pos += list.length + 2; }
  if (pos > 0xffff) throw new Error('BLOCKMAP too large for 16-bit offsets');
  const buf = Buffer.alloc(pos * 2);
  [...words, ...offs, ...body].forEach((v, i) => (i < 4 ? buf.writeInt16LE(v, i * 2) : buf.writeUInt16LE(v, i * 2)));
  return buf;
}

// All-zero REJECT (nothing rejected), ceil(sectors^2 / 8) bytes.
export const zeroReject = (numSectors) => Buffer.alloc(Math.ceil((numSectors * numSectors) / 8));
