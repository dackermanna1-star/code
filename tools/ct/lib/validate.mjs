// Validates a built map WAD against the repo's real loader (read-only import).
// Usage: node validate.mjs file.wad [MAP01]
import fs from 'node:fs';
import { Wad, WadStack } from '../../../src/wad/wad.js';
import { loadMapData, pointInSubsector, ML } from '../../../src/game/mapdata.js';

export function validate(buf, mapName = 'MAP01', { quiet = false } = {}) {
  const errs = []; const warn = [];
  const stack = new WadStack();
  stack.add(new Wad(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'test'));
  const wad = stack.wads[0];
  const idx = wad.lumps.findIndex((l) => l.name === mapName);
  const lumpList = wad.lumps.slice(idx, idx + 14).map((l) => `${l.name}:${l.size}`).join(' ');
  const lumps = stack.mapLumps(mapName);
  for (const n of ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS']) {
    if (!lumps[n] || !lumps[n].length) errs.push(`missing/empty lump ${n}`);
  }
  if (errs.length) return { errs, warn, lumpList };
  const res = { flatNum: () => 0, textureNum: () => 0 };
  const level = loadMapData(lumps, res);
  const { segs, subsectors, nodes, lines, sectors, vertices } = level;
  const stats = { verts: vertices.length, segs: segs.length, ssectors: subsectors.length, nodes: nodes.length, lines: lines.length, blockmap: !!(lumps.BLOCKMAP && lumps.BLOCKMAP.length), reject: lumps.REJECT ? lumps.REJECT.length : 0 };

  // 1. Seg sanity: on its linedef, offset/angle right, coverage complete.
  const cover = new Map();
  segs.forEach((s, i) => {
    const l = s.linedef;
    if (!l) { errs.push(`seg ${i} bad linedef`); return; }
    const a = s.side ? l.v2 : l.v1; const dirx = s.side ? -l.dx : l.dx; const diry = s.side ? -l.dy : l.dy;
    const len = l.length;
    const cross = (p) => (dirx * (p.y - a.y) - diry * (p.x - a.x)) / len;
    if (Math.abs(cross(s.v1)) > 1.5 || Math.abs(cross(s.v2)) > 1.5) errs.push(`seg ${i} not on linedef ${l.index} (dist ${cross(s.v1).toFixed(2)},${cross(s.v2).toFixed(2)})`);
    const t1 = ((s.v1.x - a.x) * dirx + (s.v1.y - a.y) * diry) / len;
    const t2 = ((s.v2.x - a.x) * dirx + (s.v2.y - a.y) * diry) / len;
    if (!(t2 > t1)) errs.push(`seg ${i} runs backwards along its linedef side`);
    if (Math.abs(t1 - s.offset) > 1.5) errs.push(`seg ${i} offset ${s.offset} expected ~${t1.toFixed(2)}`);
    const ang = Math.atan2(diry, dirx); // vanilla: seg angle = linedef angle (+180 for back side)
    let bam = Math.round((ang / (2 * Math.PI)) * 65536) & 0xffff; if (bam >= 32768) bam -= 65536;
    let d = Math.abs(bam - s.angle); d = Math.min(d, 65536 - d);
    if (d > 2) errs.push(`seg ${i} angle ${s.angle} expected ~${bam}`);
    const sd = s.side ? l.back : l.front;
    if (!sd) errs.push(`seg ${i} on missing side ${s.side} of line ${l.index}`);
    const k = l.index + ':' + s.side;
    cover.set(k, (cover.get(k) || 0) + Math.hypot(s.v2.x - s.v1.x, s.v2.y - s.v1.y));
  });
  for (const l of lines) {
    for (const side of [0, 1]) {
      const has = side ? l.back : l.front;
      if (!has) continue;
      const c = cover.get(l.index + ':' + side) || 0;
      if (Math.abs(c - l.length) > 2) errs.push(`line ${l.index} side ${side} seg coverage ${c.toFixed(1)} vs length ${l.length.toFixed(1)}`);
    }
  }
  // 2. Subsectors: segs contiguous range, single sector.
  subsectors.forEach((ss, i) => {
    if (ss.numsegs < 1 || ss.firstseg + ss.numsegs > segs.length) errs.push(`ssector ${i} bad range`);
    const secs = new Set();
    for (let j = 0; j < ss.numsegs; j++) { const s = segs[ss.firstseg + j]; if (s) secs.add(s.frontsector.index); }
    if (secs.size > 1) errs.push(`ssector ${i} mixes sectors ${[...secs]}`);
  });
  // 3. Node children / bboxes contain subtree segs.
  const subtreeBox = (child) => {
    if (child & 0x8000) {
      const ss = subsectors[child & 0x7fff];
      if (!ss) { errs.push(`child ${child} -> missing ssector`); return null; }
      let b = [-Infinity, Infinity, Infinity, -Infinity];
      for (let j = 0; j < ss.numsegs; j++) { const s = segs[ss.firstseg + j]; for (const p of [s.v1, s.v2]) { b = [Math.max(b[0], p.y), Math.min(b[1], p.y), Math.min(b[2], p.x), Math.max(b[3], p.x)]; } }
      return b;
    }
    const n = nodes[child];
    if (!n) { errs.push(`child ${child} -> missing node`); return null; }
    const out = [-Infinity, Infinity, Infinity, -Infinity];
    for (const side of [0, 1]) {
      const b = subtreeBox(n.children[side]);
      if (!b) continue;
      const nb = n.bbox[side]; // [top,bottom,left,right]
      if (b[0] > nb[0] + 1 || b[1] < nb[1] - 1 || b[2] < nb[2] - 1 || b[3] > nb[3] + 1) errs.push(`node ${child} side ${side} bbox ${nb} does not contain subtree ${b}`);
      out[0] = Math.max(out[0], b[0]); out[1] = Math.min(out[1], b[1]); out[2] = Math.min(out[2], b[2]); out[3] = Math.max(out[3], b[3]);
    }
    return out;
  };
  const seen = new Set();
  const walkCount = (c) => { if (c & 0x8000) { seen.add(c & 0x7fff); return; } const n = nodes[c]; if (!n) return; walkCount(n.children[0]); walkCount(n.children[1]); };
  if (nodes.length) { subtreeBox(nodes.length - 1); walkCount(nodes.length - 1); if (seen.size !== subsectors.length) errs.push(`tree reaches ${seen.size}/${subsectors.length} ssectors`); }

  // 4. Point queries vs. true sector (even-odd over sector boundary lines).
  const trueSector = (x, y) => {
    let found = null;
    for (const sec of sectors) {
      let inside = false;
      for (const l of sec.lines) {
        if (l.frontsector === l.backsector) continue;
        const a = l.v1, b = l.v2;
        if ((a.y > y) !== (b.y > y)) { const xi = a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y); if (xi > x) inside = !inside; }
      }
      if (inside) { if (found) return 'ambiguous'; found = sec; }
    }
    return found;
  };
  // innermost: a point inside the pool is also inside B's outer ring under even-odd? No: B's lines include the pool ring, so even-odd excludes it.
  const nearLine = (x, y) => lines.some((l) => { const t = Math.max(0, Math.min(1, ((x - l.v1.x) * l.dx + (y - l.v1.y) * l.dy) / (l.length * l.length))); return Math.hypot(l.v1.x + t * l.dx - x, l.v1.y + t * l.dy - y) < 2; });
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const v of vertices) { minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y); }
  let checked = 0, bad = 0, holes = 0; const holePts = []; const polySign = 0;
  const polyOrient = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i].x * q.y - q.x * P[i].y; } return Math.sign(a); };
  const K = Math.max(1, Math.sqrt(((maxx - minx) * (maxy - miny)) / (7.73 * 7.91) / 150000));
  for (let y = miny + 3.37; y < maxy; y += 7.91 * K) {
    for (let x = minx + 2.13; x < maxx; x += 7.73 * K) {
      const ts = trueSector(x, y);
      if (!ts || ts === 'ambiguous' || nearLine(x, y)) continue;
      checked++;
      const ss = pointInSubsector(level, x, y);
      const P = ss.poly || []; let inPoly = P.length >= 3;
      for (let i = 0; i < P.length && inPoly; i++) { const a = P[i], q = P[(i + 1) % P.length]; const cr = (q.x - a.x) * (y - a.y) - (q.y - a.y) * (x - a.x); if (polySign === 0) {} if (cr * polyOrient(P) < -1e-6) inPoly = false; }
      if (!inPoly) { holes++; if (holes <= 3) holePts.push(`(${x.toFixed(0)},${y.toFixed(0)}) ss ${ss.index}`); }
      if (ss.sector !== ts) { bad++; if (bad < 5) errs.push(`point (${x.toFixed(1)},${y.toFixed(1)}) BSP sector ${ss.sector.index} true ${ts.index}`); }
    }
  }
  if (bad) errs.push(`${bad}/${checked} sample points resolve to wrong sector`);
  stats.samples = checked; stats.flatHoles = holes;
  if (holes) errs.push(`${holes}/${checked} sample points not covered by their leaf's flat polygon e.g. ${holePts.join(' ')}`);
  // 5. Flat polygon areas per sector vs true area.
  const secArea = new Map();
  for (const ss of subsectors) {
    const p = ss.poly || []; let a = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
    secArea.set(ss.sector.index, (secArea.get(ss.sector.index) || 0) + Math.abs(a / 2));
  }
  for (const sec of sectors) {
    // true area: sum over boundary lines of signed area with this sector on the right
    let a = 0;
    for (const l of sec.lines) {
      if (l.frontsector === l.backsector) continue;
      const sgn = l.frontsector === sec ? 1 : -1;
      a += sgn * (l.v1.x * l.v2.y - l.v2.x * l.v1.y);
    }
    const ta = Math.abs(a / 2); const got = secArea.get(sec.index) || 0;
    if (Math.abs(ta - got) > Math.max(16, ta * 0.002)) errs.push(`sector ${sec.index} flat area ${got.toFixed(0)} vs true ${ta.toFixed(0)}`);
  }
  if (!quiet) console.log(stats);
  return { errs, warn, stats, lumpList };
}

if (process.argv[1] && process.argv[1].endsWith('validate.mjs')) {
  const r = validate(fs.readFileSync(process.argv[2]), process.argv[3] || 'MAP01');
  console.log('lumps:', r.lumpList);
  if (r.errs.length) { console.log(`FAIL (${r.errs.length})`); for (const e of r.errs.slice(0, 30)) console.log('  ' + e); process.exit(1); }
  console.log('PASS');
}
