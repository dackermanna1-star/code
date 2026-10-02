// Corridor networks: hallways with no destination. Hotel floors, institutional wings and office
// spines carved out of a solid mass: long straights, L / T / four-way junctions, a stretch that
// suddenly widens, a passage that narrows down to a crawl hole, dead ends with a single door.
import { defineZone } from '../zonetypes.js';
import { W, CF, M, ceilingLight, facing, env, floorDecal } from './common.js';
import { tryRoomPiece } from '../roompieces.js';
import './b_assets.js';
import { clamp, lightState, gateSet, faceAt, faceKey, trimRuns, doorOnFace } from './b_util.js';

// cell kinds
const K = { SOLID: 0, CORR: 1, NODE: 2, WIDE: 3, NARROW: 4, ROOM: 5, VEST: 6, ALCOVE: 7, POCKET: 8, LINK: 9 };
const CORRK = (k) => k === K.CORR || k === K.WIDE || k === K.LINK;

function corridorParams(zone, rng, ctx) {
  const variant = rng.weighted([['hotel', 4], ['institutional', 3], ['office', 2.6]]);
  const far = clamp((ctx.dist - 60) / 1400, 0, 1);
  const dark = rng.chance(0.05 + far * 0.12);
  const p = { variant, dark };
  if (variant === 'hotel') {
    p.wallMat = rng.weighted([[M.b_wp_hotel, 4], [M.b_wp_damask, 2.2], [M.wp_damask, 0.6], [M.paint_cream, 0.7]]);
    p.floorMat = rng.weighted([[M.carpet_hotel, 3], [M.b_carpet_hall, 3], [M.carpet_red, 0.9], [M.carpet_brown, 0.7], [M.carpet_teal, 0.6]]);
    p.ceilMat = rng.weighted([[M.plaster, 3], [M.ceil_tile, 0.8], [M.ceil_tile_old, 0.4]]);
    p.ceilH = rng.pick([2.4, 2.45, 2.5, 2.55, 2.6]);
    p.wainscot = rng.chance(0.65);
    p.lowerMat = p.wallMat === M.b_wp_damask ? rng.pick([M.wood_panel, M.paint_beige]) : rng.weighted([[M.wood_panel, 2], [M.b_wp_damask, 1.2], [M.paint_beige, 0.8]]);
    p.roomWall = rng.pick([M.paint_cream, M.plaster, M.paint_beige, M.wp_plain]);
    p.roomFloor = rng.pick([M.carpet_brown, M.carpet_teal, M.carpet_gray, p.floorMat]);
    p.doorTex = 'b_door_hotel';
    p.doorTint = rng.pick([null, null, [1.25, 1.15, 1.05], [0.75, 0.72, 0.7]]);
    p.frame = rng.pick(['wood_dark', 'wood_dark', 'plaster']);
    p.spacing = rng.pick([[12, 18], [14, 22], [11, 16]]);
    p.widths = [[1, 0.8], [2, 6], [3, 1.4]];
    p.light = 'sconce';
    p.fail = dark ? 0.8 : rng.range(0.04, 0.12) + far * 0.2;
    p.flicker = rng.range(0.03, 0.08);
    p.ambient = dark ? [0.07, 0.055, 0.045] : [0.2, 0.165, 0.125];
    p.env = env({ fog: dark ? [0.05, 0.04, 0.03] : [0.17, 0.12, 0.08], fogNear: dark ? 2 : 3, fogFar: dark ? 20 : 28, hum: 0.12, hvac: 0.55, reverb: 'corridor', tone: 'hotel' });
  } else if (variant === 'institutional') {
    p.wallMat = rng.weighted([[M.paint_green, 3], [M.paint_cream, 3], [M.cmu, 2], [M.cmu_green, 1.4], [M.paint_blue, 1], [M.paint_wall, 1.4]]);
    p.floorMat = rng.weighted([[M.lino_vct, 4], [M.tile_check, 1.6], [M.lino_green, 1.4], [M.b_terrazzo, 1]]);
    p.ceilMat = rng.weighted([[M.ceil_tile_white, 3], [M.ceil_tile, 1.4], [M.ceil_tile_old, 0.6]]);
    p.ceilH = rng.pick([2.6, 2.7, 2.8, 2.9]);
    p.roomWall = p.wallMat;
    p.roomFloor = p.floorMat;
    p.doorTex = 'b_door_inst';
    p.doorTint = rng.pick([[0.62, 0.78, 1.0], [0.7, 0.92, 0.72], [1.1, 1.0, 0.8], [1.0, 0.62, 0.55], [1, 1, 1]]);
    p.frame = 'metal';
    p.spacing = rng.pick([[10, 16], [12, 18], [9, 14]]);
    p.widths = [[1, 0.5], [2, 4], [3, 3]];
    p.light = rng.chance(0.6) ? 'tube' : 'troffer';
    p.fail = dark ? 0.85 : rng.range(0.04, 0.14) + far * 0.2;
    p.flicker = rng.range(0.04, 0.1);
    p.ambient = dark ? [0.06, 0.065, 0.065] : [0.21, 0.22, 0.21];
    p.env = env({ fog: dark ? [0.04, 0.045, 0.045] : [0.26, 0.28, 0.27], fogNear: dark ? 2 : 4, fogFar: dark ? 20 : 34, hum: 0.75, hvac: 0.5, reverb: 'corridor', tone: 'office' });
  } else {
    p.wallMat = rng.weighted([[M.paint_wall, 4], [M.paint_beige, 3], [M.paint_cream, 2], [M.wp_plain, 0.8]]);
    p.floorMat = rng.weighted([[M.carpet_office, 4], [M.carpet_gray, 3], [M.carpet_blue, 1.4], [M.carpet_green, 0.8]]);
    p.ceilMat = rng.weighted([[M.ceil_tile_white, 4], [M.ceil_tile, 2], [M.ceil_tile_old, 0.6]]);
    p.ceilH = rng.pick([2.6, 2.7, 2.7, 2.8]);
    p.roomWall = p.wallMat;
    p.roomFloor = p.floorMat;
    p.doorTex = rng.chance(0.5) ? 'door_wood' : 'b_door_inst';
    p.doorTint = p.doorTex === 'door_wood' ? null : rng.pick([[1.05, 1.0, 0.9], [0.8, 0.82, 0.88]]);
    p.frame = rng.pick(['metal', 'plastic_gray']);
    p.spacing = rng.pick([[9, 14], [11, 16], [13, 20]]);
    p.widths = [[1, 0.6], [2, 6], [3, 1.2]];
    p.light = 'troffer';
    p.fail = dark ? 0.85 : rng.range(0.03, 0.12) + far * 0.2;
    p.flicker = rng.range(0.02, 0.07);
    p.ambient = dark ? [0.06, 0.06, 0.06] : [0.22, 0.22, 0.215];
    p.env = env({ fog: dark ? [0.04, 0.04, 0.04] : [0.32, 0.31, 0.28], fogNear: dark ? 2 : 4, fogFar: dark ? 20 : 32, hum: 0.6, hvac: 0.65, reverb: 'corridor', tone: 'office' });
  }
  p.gapMin = variant === 'hotel' ? 6 : 5;
  p.loop = rng.range(0.12, 0.42);
  p.stub = rng.range(0.15, 0.4);
  p.partial = rng.range(0.15, 0.4);
  // strange things get more common further out: every door with the same number
  p.sameNumber = rng.chance(Math.min(0.25, far * 0.4));
  p.numBase = (Math.abs(ctx.level) % 9 + 1) * 100 + rng.int(0, 3) * 20;
  return p;
}

// ------------------------------------------------------------------ line lattice
function pickLines(lo, hi, req, r, p) {
  const [spMin, spMax] = p.spacing;
  const gapMin = p.gapMin;
  const width = () => r.weighted(p.widths);
  const groups = [];
  const rs = [...new Set(req)].sort((a, b) => a - b);
  for (let gi = 0; gi < rs.length;) {
    let ge = gi;
    while (ge + 1 < rs.length && rs[ge + 1] - rs[gi] <= 2) ge++;
    const a0 = rs[gi], a1 = rs[ge];
    const need = a1 - a0 + 1;
    const w = Math.max(need, width());
    const a = clamp(a0 - r.int(0, w - need), lo, hi - w);
    groups.push({ a, w, req: true });
    gi = ge + 1;
  }
  const kept = [];
  for (const L of groups) {
    const prev = kept[kept.length - 1];
    if (prev && L.a - (prev.a + prev.w) < gapMin) continue;
    kept.push(L);
  }
  const out = [];
  let pos = lo + r.int(1, Math.max(2, Math.floor(spMax * 0.55)));
  let prevEnd = -1e9;
  const anchors = [...kept, { a: hi + gapMin, w: 0, sentinel: true }];
  for (const an of anchors) {
    for (let guard = 0; guard < 40; guard++) {
      const w = width();
      if (pos < prevEnd + gapMin) pos = prevEnd + gapMin;
      if (pos + w + gapMin > an.a) break;
      if (!an.sentinel && an.a - pos < spMin) break;
      if (pos + w > hi) break;
      out.push({ a: pos, w });
      prevEnd = pos + w;
      pos += r.int(spMin, spMax);
    }
    if (!an.sentinel) {
      out.push(an);
      prevEnd = an.a + an.w;
      pos = an.a + r.int(spMin, spMax);
    }
  }
  if (!out.length) {
    const w = 2;
    out.push({ a: Math.floor((lo + hi) / 2) - 1, w });
  }
  out.sort((m, n) => m.a - n.a);
  return out;
}

// ------------------------------------------------------------------ generator
function genCorridors(zb) {
  const p = zb.params, r = zb.rng;
  const { x0, z0, x1, z1 } = zb;
  const wm = p.wallMat;
  zb.rectSolid(x0, z0, x1, z1, wm);
  const kind = new Uint8Array(zb.w * zb.d);
  const kAt = (x, z) => (zb.in(x, z) ? kind[zb.i(x, z)] : K.SOLID);
  const gates = gateSet(zb);
  const carve = (x, z, k, ch) => {
    if (!zb.in(x, z)) return;
    const i = zb.i(x, z);
    zb.solid[i] = 0; zb.floor[i] = 0;
    zb.ceil[i] = ch ?? p.ceilH;
    if (!kind[i] || k === K.NARROW || k === K.WIDE) kind[i] = k;
  };

  // lattice lines through the gates
  const reqZ = zb.gates.filter((g) => g.dx !== 0).map((g) => g.z);
  const reqX = zb.gates.filter((g) => g.dz !== 0).map((g) => g.x);
  const H = pickLines(z0, z1, reqZ, r.fork('h'), p);
  const V = pickLines(x0, x1, reqX, r.fork('v'), p);
  for (const L of [...H, ...V]) {
    L.ch = clamp(p.ceilH + r.pick([0, 0, 0, -0.1, 0.1, 0.2]), 2.4, 2.9);
    L.doors = r.weighted([[0, 1.1], [1, 1.6], [2, 3.2], [3, 1.2]]);
    L.phase = r.int(0, 5);
  }
  const nH = H.length, nV = V.length;
  const nodeRect = (i, j) => ({ x0: V[j].a, x1: V[j].a + V[j].w, z0: H[i].a, z1: H[i].a + H[i].w });

  // edges
  const edges = [];
  for (let i = 0; i < nH; i++) {
    for (let j = -1; j < nV; j++) {
      const xa = j < 0 ? x0 : V[j].a + V[j].w, xb = j + 1 >= nV ? x1 : V[j + 1].a;
      if (xb <= xa) continue;
      edges.push({ dir: 'h', line: i, L: H[i], n0: j >= 0 ? [i, j] : null, n1: j + 1 < nV ? [i, j + 1] : null, x0: xa, x1: xb, z0: H[i].a, z1: H[i].a + H[i].w });
    }
  }
  for (let j = 0; j < nV; j++) {
    for (let i = -1; i < nH; i++) {
      const za = i < 0 ? z0 : H[i].a + H[i].w, zb2 = i + 1 >= nH ? z1 : H[i + 1].a;
      if (zb2 <= za) continue;
      edges.push({ dir: 'v', line: j, L: V[j], n0: i >= 0 ? [i, j] : null, n1: i + 1 < nH ? [i + 1, j] : null, x0: V[j].a, x1: V[j].a + V[j].w, z0: za, z1: zb2 });
    }
  }
  const len = (e) => (e.dir === 'h' ? e.x1 - e.x0 : e.z1 - e.z0);
  // spanning tree over nodes, trunk lines first
  const parent = new Int32Array(nH * nV).map((_, k) => k);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const nid = (n) => n[0] * nV + n[1];
  const trunkH = r.chance(0.85) ? r.int(0, nH - 1) : -1;
  const trunkV = r.chance(0.55) ? r.int(0, nV - 1) : -1;
  const isTrunk = (e) => (e.dir === 'h' && e.line === trunkH) || (e.dir === 'v' && e.line === trunkV);
  const internal = edges.filter((e) => e.n0 && e.n1);
  const order = internal.map((e) => [e, isTrunk(e) ? -1 + r.next() * 0.1 : r.next()]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  for (const e of order) {
    const a = find(nid(e.n0)), b = find(nid(e.n1));
    if (a !== b) { parent[a] = b; e.on = true; e.tree = true; }
    else if (isTrunk(e) || r.chance(p.loop)) e.on = true;
  }
  // border edges: gates, trunks running out to the zone edge, dead-end stubs
  const gateOnBorderEdge = (e) => zb.gates.some((g) => {
    if (e.dir === 'h') return g.dx !== 0 && g.z >= e.z0 && g.z < e.z1 && g.x >= e.x0 && g.x < e.x1;
    return g.dz !== 0 && g.x >= e.x0 && g.x < e.x1 && g.z >= e.z0 && g.z < e.z1;
  });
  for (const e of edges) {
    if (e.n0 && e.n1) continue;
    e.border = true;
    if (gateOnBorderEdge(e)) { e.on = true; e.gate = true; }
    else if (isTrunk(e) ? r.chance(0.7) : r.chance(p.stub)) e.on = true;
  }
  // partial stubs into blocks from absent internal edges (dead ends)
  for (const e of internal) {
    if (e.on || len(e) < 7 || !r.chance(p.partial)) continue;
    e.stub = r.int(2, Math.min(6, len(e) - 4));
    e.stubFrom = r.chance(0.5) ? 0 : 1;
    e.on = true;
  }
  // node degrees
  const deg = new Int32Array(nH * nV);
  const nodeEdges = Array.from({ length: nH * nV }, () => []);
  for (const e of edges) {
    if (!e.on) continue;
    if (e.stub) { const n = e.stubFrom === 0 ? e.n0 : e.n1; deg[nid(n)]++; nodeEdges[nid(n)].push(e); continue; }
    if (e.n0) { deg[nid(e.n0)]++; nodeEdges[nid(e.n0)].push(e); }
    if (e.n1) { deg[nid(e.n1)]++; nodeEdges[nid(e.n1)].push(e); }
  }

  // features: one narrowing passage, one sudden widening
  const cand = edges.filter((e) => e.on && !e.stub && !e.gate && e.n0 && e.n1 && len(e) >= 8);
  const narrowE = pickBest(cand.filter((e) => !e.tree), r) || (r.chance(0.5) ? pickBest(cand, r) : null);
  if (narrowE) narrowE.narrow = true;
  const wideCand = edges.filter((e) => e.on && !e.stub && !e.narrow && len(e) >= 12);
  const wideE = wideCand.length && r.chance(0.85) ? r.pick(wideCand) : null;

  // ---- carve nodes and edges
  for (let i = 0; i < nH; i++) for (let j = 0; j < nV; j++) {
    if (!deg[i * nV + j]) continue;
    const n = nodeRect(i, j);
    const ch = Math.max(H[i].ch, V[j].ch);
    zb.fill(n.x0, n.z0, n.x1, n.z1, (x, z) => carve(x, z, K.NODE, ch));
  }
  for (const e of edges) {
    if (!e.on) continue;
    if (e.narrow) { carveNarrow(zb, e, carve, r, wm); continue; }
    let { x0: ex0, x1: ex1, z0: ez0, z1: ez1 } = e;
    if (e.stub) {
      if (e.dir === 'h') { if (e.stubFrom === 0) ex1 = ex0 + e.stub; else ex0 = ex1 - e.stub; }
      else if (e.stubFrom === 0) ez1 = ez0 + e.stub; else ez0 = ez1 - e.stub;
      e.sx0 = ex0; e.sx1 = ex1; e.sz0 = ez0; e.sz1 = ez1;
    }
    zb.fill(ex0, ez0, ex1, ez1, (x, z) => carve(x, z, K.CORR, e.L.ch));
  }
  // gates that are not on a line get a straight connector
  for (const g of zb.gates) {
    if (kAt(g.x, g.z)) continue;
    connectGate(zb, g, kind, carve, kAt);
  }
  // straight runs of those connectors behave like corridor edges (lights, doors, dressing)
  for (const e of linkRuns(zb, kind, p, r)) edges.push(e);
  // sudden widening
  if (wideE) widen(zb, wideE, kind, carve, kAt, r);

  // ---- rooms behind a few open doors, ice machine alcove
  const used = new Set();      // faceKeys taken by doors / fixtures
  const blockedTrim = new Set();
  const rooms = [];
  const wantRooms = Math.round((zb.w * zb.d) / (p.variant === 'office' ? 700 : 1100) + r.next() * 1.5);
  for (let k = 0; k < wantRooms * 6 && rooms.length < wantRooms; k++) {
    const e = r.pick(edges);
    if (!e.on || e.narrow || e.stub || len(e) < 5) continue;
    const rm = tryRoom(zb, e, kind, carve, kAt, r, p);
    if (rm) { rooms.push(rm); used.add(rm.doorKey); }
  }
  let alcove = null;
  if (p.variant === 'hotel' ? r.chance(0.8) : r.chance(0.35)) {
    for (let k = 0; k < 30 && !alcove; k++) {
      const e = r.pick(edges);
      if (!e.on || e.narrow || e.stub || len(e) < 6) continue;
      alcove = tryAlcove(zb, e, kind, carve, kAt, r, p, used);
    }
  }

  // ---- doors along corridors
  let num = p.numBase + 1;
  const doors = [];
  const doorOpts = () => ({
    tex: p.doorTex, tint: p.doorTint, frame: p.frame, lock: p.variant === 'hotel',
    plate: p.variant === 'hotel' ? (r.chance(0.7) ? 'door' : 'wall') : 'wall',
    plateMat: 'plastic_black', plateTint: p.variant === 'hotel' ? undefined : [0.5, 0.5, 0.52],
    digitTint: p.variant === 'hotel' ? undefined : [1.1, 1.1, 1.05],
    brass: p.variant === 'hotel',
  });
  for (const e of edges) {
    if (!e.on || e.narrow) continue;
    const dens = e.L.doors;
    if (!dens) continue;
    const step = dens === 3 ? 2 : dens === 2 ? r.int(3, 4) : r.int(5, 8);
    const ax0 = e.stub ? (e.dir === 'h' ? e.sx0 : e.sz0) : e.dir === 'h' ? e.x0 : e.z0;
    const ax1 = e.stub ? (e.dir === 'h' ? e.sx1 : e.sz1) : e.dir === 'h' ? e.x1 : e.z1;
    for (const side of [-1, 1]) {
      let t = ax0 + 1 + ((e.L.phase + (side > 0 ? Math.floor(step / 2) : 0)) % step);
      for (; t < ax1 - 1; t += step) {
        const cx = e.dir === 'h' ? t : side < 0 ? e.x0 : e.x1 - 1;
        const cz = e.dir === 'h' ? (side < 0 ? e.z0 : e.z1 - 1) : t;
        const dx = e.dir === 'h' ? 0 : side, dz = e.dir === 'h' ? side : 0;
        if (!CORRK(kAt(cx, cz))) continue;
        const key = faceKey(cx, cz, dx, dz);
        if (used.has(key)) continue;
        const f = faceAt(zb, cx, cz, dx, dz, gates);
        if (!f || !deepSolid(zb, kAt, cx, cz, dx, dz, 2)) continue;
        const o = doorOpts();
        o.num = String(p.sameNumber ? p.numBase + 13 : num++);
        if (p.variant === 'hotel' && r.chance(0.09)) o.dnd = true;
        doors.push(doorOnFace(zb, f, o));
        used.add(key); blockedTrim.add(key);
        if (p.variant === 'hotel' && r.chance(0.035)) {
          const ax = f.dz !== 0 ? 0.62 : 0, az = f.dx !== 0 ? 0.62 : 0;
          zb.prop('b_tray', f.x - f.dx * 0.3 + ax, 0, f.z - f.dz * 0.3 + az, r.range(0, 6.28), { cloche: r.chance(0.7) });
        }
      }
    }
  }
  // dead ends: a single door in the end wall
  const deadEnds = [];
  for (let i = 0; i < nH; i++) for (let j = 0; j < nV; j++) {
    const id = i * nV + j;
    if (deg[id] !== 1) continue;
    const e = nodeEdges[id][0];
    const n = nodeRect(i, j);
    // direction from the edge into the node, continued to the end wall
    let dx = 0, dz = 0;
    if (e.dir === 'h') dx = e.x0 >= n.x1 || (e.stub && e.sx0 >= n.x1) ? -1 : 1;
    else dz = e.z0 >= n.z1 || (e.stub && e.sz0 >= n.z1) ? -1 : 1;
    deadEnds.push({ x0: n.x0, x1: n.x1, z0: n.z0, z1: n.z1, dx, dz });
  }
  for (const e of edges) {
    if (!e.on) continue;
    if (e.stub) {
      const dx = e.dir === 'h' ? (e.stubFrom === 0 ? 1 : -1) : 0, dz = e.dir === 'v' ? (e.stubFrom === 0 ? 1 : -1) : 0;
      deadEnds.push({ x0: e.sx0, x1: e.sx1, z0: e.sz0, z1: e.sz1, dx, dz });
    } else if (e.border && !e.gate) {
      const dx = e.dir === 'h' ? (e.n0 ? 1 : -1) : 0, dz = e.dir === 'v' ? (e.n0 ? 1 : -1) : 0;
      deadEnds.push({ x0: e.x0, x1: e.x1, z0: e.z0, z1: e.z1, dx, dz });
    }
  }
  for (const de of deadEnds) {
    // end wall cells
    const cells = [];
    if (de.dx) { const x = de.dx > 0 ? de.x1 - 1 : de.x0; for (let z = de.z0; z < de.z1; z++) cells.push([x, z]); }
    else { const z = de.dz > 0 ? de.z1 - 1 : de.z0; for (let x = de.x0; x < de.x1; x++) cells.push([x, z]); }
    const fs = cells.map(([x, z]) => faceAt(zb, x, z, de.dx, de.dz, gates)).filter((f) => f && !used.has(faceKey(f.cx, f.cz, f.dx, f.dz)));
    if (fs.length !== cells.length || !fs.length) continue;
    de.lit = r.chance(0.75);
    if (!r.chance(0.85)) continue;
    const mid = fs.length % 2 ? fs[(fs.length - 1) / 2] : fs[fs.length / 2 - 1];
    const along = fs.length % 2 ? 0 : 0.5;
    const o = doorOpts();
    o.num = p.variant === 'hotel' ? String(r.chance(0.5) ? p.numBase + 99 : num++) : r.chance(0.5) ? String(num++) : null;
    if (o.num === null) delete o.num;
    // the far end of a corridor may be a stair / service door instead
    if (p.variant !== 'hotel' && r.chance(0.5)) { o.tex = 'b_door_inst'; o.tint = [0.85, 0.85, 0.8]; delete o.num; }
    doors.push(doorOnFace(zb, mid, o, along));
    for (const f of fs) { used.add(faceKey(f.cx, f.cz, f.dx, f.dz)); blockedTrim.add(faceKey(f.cx, f.cz, f.dx, f.dz)); }
    if (r.chance(0.3)) {
      const c = zb.getCeil(Math.floor(mid.x - mid.dx * 0.5), Math.floor(mid.z - mid.dz * 0.5));
      zb.prop('exit_sign', mid.x - mid.dx * 0.12 + (mid.dz !== 0 ? along : 0), c, mid.z - mid.dz * 0.12 + (mid.dx !== 0 ? along : 0), facing(-mid.dx, -mid.dz), { green: r.chance(0.3) });
    } else if (r.chance(0.25)) {
      zb.decal(mid.x + (mid.dz !== 0 ? along + 0.75 : 0), 1.55, mid.z + (mid.dx !== 0 ? along + 0.75 : 0), mid.face, 0.32, 0.32, 'sign_noexit');
    }
  }

  // ---- lights
  const lit = new Set();
  lightCorridors(zb, edges, H, V, deg, nV, nodeRect, kAt, used, gates, r, p, lit);
  for (const de of deadEnds) {
    if (!de.lit) continue;
    const cx = (de.x0 + de.x1) / 2 - de.dx * ((de.x1 - de.x0) / 2 - 0.5), cz = (de.z0 + de.z1) / 2 - de.dz * ((de.z1 - de.z0) / 2 - 0.5);
    const kx = Math.floor(cx), kz = Math.floor(cz);
    if (lit.has(kx + ',' + kz)) continue;
    const st = r.chance(0.35) ? (r.chance(0.5) ? 'dying' : 'flicker') : lightState(r, p.fail, p.flicker);
    ceilingLight(zb, de.dx ? cx : (de.x0 + de.x1) / 2, de.dz ? cz : (de.z0 + de.z1) / 2, p.variant === 'hotel' ? 'panel' : p.light, st, { w: 0.4, l: 0.4, rot: de.dx ? 1 : 0, color: p.variant === 'hotel' ? [1.0, 0.8, 0.55] : undefined });
  }
  for (const rm of rooms) furnishRoom(zb, rm, r, p);
  if (alcove) dressAlcove(zb, alcove, r, p);

  // ---- dressing along the walls
  dressWalls(zb, edges, kAt, used, gates, r, p, deadEnds);
  // trims
  const trimCells = (x, z) => { const k = kAt(x, z); return k === K.CORR || k === K.NODE || k === K.WIDE || k === K.NARROW || k === K.LINK; };
  const specs = [];
  if (p.variant === 'hotel') {
    specs.push({ y0: 0, y1: 0.13, t: 0.03, mat: M.wood_dark });
    if (p.wainscot) { specs.push({ y0: 0.13, y1: 0.9, t: 0.015, mat: p.lowerMat }); specs.push({ y0: 0.9, y1: 0.96, t: 0.035, mat: M.wood_dark }); }
  } else if (p.variant === 'institutional') {
    specs.push({ y0: 0, y1: 0.1, t: 0.015, mat: M.rubber });
    if (r.chance(0.35)) specs.push({ y0: 0.82, y1: 0.92, t: 0.025, mat: M.plastic_gray });
  } else specs.push({ y0: 0, y1: 0.1, t: 0.015, mat: r.chance(0.5) ? M.plastic_gray : M.rubber });
  trimRuns(zb, trimCells, blockedTrim, specs, gates);
  // feature summary (debug / tools only)
  zb.bInfo = {
    wide: edges.filter((e) => e.wide).map((e) => e.wide),
    narrow: edges.filter((e) => e.narrow).map((e) => ({ x0: e.x0, z0: e.z0, x1: e.x1, z1: e.z1, dir: e.dir, toward: e.narrowInfo.towardEnd })),
    deadEnds: deadEnds.length, rooms: rooms.map((m) => [m.x0, m.z0, m.x1, m.z1]), alcove: alcove && alcove.cells,
  };
  // floor wear
  for (let k = 0; k < (zb.w * zb.d) / 160; k++) {
    const x = r.int(x0, x1 - 1), z = r.int(z0, z1 - 1);
    const kk = kAt(x, z);
    if (kk !== K.CORR && kk !== K.NODE) continue;
    floorDecal(zb, x + r.next(), z + r.next(), r.pick(['dec_stain', 'dec_stain', 'dec_scuff', p.variant === 'hotel' ? 'dec_stain2' : 'dec_paper']), r.range(0.5, 1.3), r);
  }
}

function pickBest(list, r) { return list.length ? r.pick(list) : null; }

// solid for `depth` cells behind the face (or outside the zone)
function deepSolid(zb, kAt, x, z, dx, dz, depth) {
  for (let k = 1; k <= depth; k++) {
    const nx = x + dx * k, nz = z + dz * k;
    if (!zb.in(nx, nz)) return k > 1;
    if (kAt(nx, nz) !== 0) return false;
  }
  return true;
}

// A passage that loses one cell of width at a time (3 -> 2 -> 1) and ends in a crawl hole.
function carveNarrow(zb, e, carve, r, wm) {
  const alongX = e.dir === 'h';
  const a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
  const c0 = alongX ? e.z0 : e.x0, w = e.L.w;
  const L = a1 - a0;
  // the final 1 m row must line up with the node at the narrow end
  const f = c0 + (w === 1 ? 0 : w === 2 ? r.int(0, 1) : 1);
  const rows = [[f - 1, f + 2], r.chance(0.5) ? [f - 1, f + 1] : [f, f + 2], [f, f + 1]];
  const segLen = Math.max(2, Math.floor(L / 3));
  const towardEnd = r.chance(0.5); // narrow end at a1 (true) or at a0
  e.narrowInfo = { segLen, steps: [3, 2, 1], towardEnd };
  for (let t = 0; t < L; t++) {
    const s = Math.min(2, Math.floor(t / segLen));
    const [ra, rb] = rows[s];
    const along = towardEnd ? a0 + t : a1 - 1 - t;
    const ch = clamp(e.L.ch - s * 0.17, 2.1, 3);
    for (let c = ra; c < rb; c++) carve(alongX ? along : c, alongX ? c : along, K.NARROW, ch);
  }
  // crawl hole into the node at the narrow end
  const xe = towardEnd ? a1 : a0;
  if (alongX) zb.setWall(xe, f, 'W', W.LOW, wm, wm);
  else zb.setWall(f, xe, 'N', W.LOW, wm, wm);
}

function connectGate(zb, g, kind, carve, kAt) {
  // walk straight in until something carved is adjacent, then bend toward the nearest corridor
  let x = g.x, z = g.z;
  for (let k = 0; k < 200; k++) {
    carve(x, z, K.LINK);
    const nb = [[g.dx, g.dz], [g.dz, g.dx], [-g.dz, -g.dx]];
    if (nb.some(([dx, dz]) => kAt(x + dx, z + dz) && kAt(x + dx, z + dz) !== K.LINK)) return;
    const nx = x + g.dx, nz = z + g.dz;
    if (!zb.in(nx, nz)) break;
    x = nx; z = nz;
    if (k > 3 && nearestDir(zb, kAt, x, z, 3)) break;
  }
  // BFS to the nearest carved cell
  const n = zb.w * zb.d;
  const prev = new Int32Array(n).fill(-2);
  const q = new Int32Array(n);
  let qh = 0, qt = 0;
  const s = zb.i(x, z);
  prev[s] = -1; q[qt++] = s;
  let found = -1;
  while (qh < qt && found < 0) {
    const c = q[qh++];
    const cx = zb.x0 + (c % zb.w), cz = zb.z0 + Math.floor(c / zb.w);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (!zb.in(nx, nz)) continue;
      const ni = zb.i(nx, nz);
      if (prev[ni] !== -2) continue;
      prev[ni] = c;
      if (kind[ni] && kind[ni] !== K.LINK) { found = c; break; }
      q[qt++] = ni;
    }
  }
  for (let c = found; c >= 0; c = prev[c]) carve(zb.x0 + (c % zb.w), zb.z0 + Math.floor(c / zb.w), K.LINK);
}

// Straight runs (>= 3 cells) of gate-connector cells as pseudo edges.
function linkRuns(zb, kind, p, r) {
  const out = [];
  const isL = (x, z) => zb.in(x, z) && kind[zb.i(x, z)] === K.LINK;
  const mk = (dir, x0, z0, x1, z1) => ({
    dir, x0, z0, x1, z1, on: true, link: true, n0: null, n1: null,
    L: { w: 1, ch: p.ceilH, doors: r.weighted([[0, 1], [1, 1.5], [2, 1.5]]), phase: r.int(0, 5) },
  });
  for (let z = zb.z0; z < zb.z1; z++) {
    for (let x = zb.x0; x < zb.x1;) {
      if (!isL(x, z) || isL(x, z - 1) || isL(x, z + 1)) { x++; continue; }
      let e = x;
      while (e < zb.x1 && isL(e, z) && !isL(e, z - 1) && !isL(e, z + 1)) e++;
      if (e - x >= 3) out.push(mk('h', x, z, e, z + 1));
      x = e;
    }
  }
  for (let x = zb.x0; x < zb.x1; x++) {
    for (let z = zb.z0; z < zb.z1;) {
      if (!isL(x, z) || isL(x - 1, z) || isL(x + 1, z)) { z++; continue; }
      let e = z;
      while (e < zb.z1 && isL(x, e) && !isL(x - 1, e) && !isL(x + 1, e)) e++;
      if (e - z >= 3) out.push(mk('v', x, z, x + 1, e));
      z = e;
    }
  }
  return out;
}

function nearestDir(zb, kAt, x, z, R) {
  for (let d = 1; d <= R; d++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = kAt(x + dx * d, z + dz * d); if (k && k !== K.LINK) return true; }
  return false;
}

// Widen the middle of an edge to 4-6 m for a stretch.
function widen(zb, e, kind, carve, kAt, r) {
  const alongX = e.dir === 'h';
  const a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
  const c0 = alongX ? e.z0 : e.x0, c1 = alongX ? e.z1 : e.x1;
  const L = a1 - a0;
  const Ls = clamp(r.int(6, 14), 4, L - 4);
  const s0 = a0 + r.int(2, L - Ls - 2);
  for (let Wt = r.int(4, 6); Wt > c1 - c0; Wt--) {
    const extra = Wt - (c1 - c0);
    const top = r.int(0, extra), bot = extra - top;
    const ca = c0 - top, cb = c1 + bot;
    // clearance: one solid cell around the widened block
    let ok = true;
    for (let t = s0 - 1; t <= s0 + Ls && ok; t++) for (let c = ca - 1; c <= cb && ok; c++) {
      if (c >= c0 && c < c1) continue;
      const x = alongX ? t : c, z = alongX ? c : t;
      const inBlock = t >= s0 && t < s0 + Ls && c >= ca && c < cb;
      if (inBlock && !zb.in(x, z)) ok = false;
      else if (kAt(x, z)) ok = false;
    }
    if (!ok) continue;
    const ch = clamp(e.L.ch + r.pick([0, 0.2, 0.35]), 2.4, 3.2);
    for (let t = s0; t < s0 + Ls; t++) for (let c = ca; c < cb; c++) carve(alongX ? t : c, alongX ? c : t, K.WIDE, ch);
    e.wide = { s0, s1: s0 + Ls, ca, cb, alongX };
    return;
  }
}

// Small room behind a vestibule, off a corridor edge.
function tryRoom(zb, e, kind, carve, kAt, r, p) {
  const alongX = e.dir === 'h';
  const a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
  const side = r.sign();
  const t = r.int(a0 + 1, a1 - 2);
  const vd = p.variant === 'hotel' ? 2 : 1;
  const rw = r.int(3, 5), rd = r.int(3, p.variant === 'office' ? 5 : 4);
  // wall cell coordinate on the cross axis
  const cw = alongX ? (side < 0 ? e.z0 - 1 : e.z1) : (side < 0 ? e.x0 - 1 : e.x1);
  const vCells = [];
  for (let k = 0; k < vd; k++) vCells.push(cw + side * k);
  const rc0 = side < 0 ? cw - vd - rd + 1 : cw + vd, rc1 = rc0 + rd;
  const off = r.int(0, rw - 1);
  const ra0 = t - off, ra1 = ra0 + rw;
  const cellXZ = (a, c) => (alongX ? [a, c] : [c, a]);
  // corridor cell in front must be plain corridor
  const [fx, fz] = cellXZ(t, side < 0 ? cw + 1 : cw - 1);
  if (!CORRK(kAt(fx, fz)) || kAt(fx, fz) === K.WIDE) return null;
  // clearance: room block + ring must be solid & inside, except the ring cells on the corridor side
  for (let a = ra0 - 1; a <= ra1; a++) for (let c = rc0 - 1; c <= rc1; c++) {
    const [x, z] = cellXZ(a, c);
    const inner = a >= ra0 && a < ra1 && c >= rc0 && c < rc1;
    if (!zb.in(x, z)) { if (inner) return null; continue; }
    if (kAt(x, z)) return null;
  }
  for (const c of vCells) {
    const [x, z] = cellXZ(t, c);
    if (!zb.in(x, z) || kAt(x, z)) return null;
    for (const d of [-1, 1]) { const [sx, sz] = cellXZ(t + d, c); if (kAt(sx, sz)) return null; }
  }
  const rch = p.variant === 'hotel' ? clamp(p.ceilH + 0.05, 2.4, 2.7) : p.ceilH;
  for (const c of vCells) { const [x, z] = cellXZ(t, c); carve(x, z, K.VEST, Math.min(rch, 2.4)); zb.fmat[zb.i(x, z)] = p.roomFloor; }
  for (let a = ra0; a < ra1; a++) for (let c = rc0; c < rc1; c++) {
    const [x, z] = cellXZ(a, c);
    carve(x, z, K.ROOM, rch);
    const i = zb.i(x, z);
    zb.fmat[i] = p.roomFloor;
    if (p.variant === 'hotel') zb.cmat[i] = M.plaster;
  }
  // room walls in their own finish where they do not face the corridor
  for (let a = ra0 - 1; a <= ra1; a++) for (let c = rc0 - 1; c <= rc1; c++) {
    const [x, z] = cellXZ(a, c);
    if (!zb.in(x, z) || kAt(x, z)) continue;
    let nearCorr = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = kAt(x + dx, z + dz); if (k === K.CORR || k === K.NODE || k === K.WIDE) nearCorr = true; }
    if (!nearCorr) zb.solid[zb.i(x, z)] = p.roomWall;
  }
  // door in the corridor wall
  const dx = alongX ? 0 : side, dz = alongX ? side : 0;
  const [vx, vz] = cellXZ(t, vCells[0]);
  if (alongX) zb.setWall(vx, side < 0 ? vz + 1 : vz, 'N', W.DOOR, side < 0 ? p.roomWall : p.wallMat, side < 0 ? p.wallMat : p.roomWall);
  else zb.setWall(side < 0 ? vx + 1 : vx, vz, 'W', W.DOOR, side < 0 ? p.roomWall : p.wallMat, side < 0 ? p.wallMat : p.roomWall);
  const ex = alongX ? vx + 0.5 : side < 0 ? vx + 1 : vx, ez = alongX ? (side < 0 ? vz + 1 : vz) : vz + 0.5;
  zb.prop('door', ex, 0, ez, facing(dx, dz), { open: r.range(1.0, 1.9), tex: p.doorTex === 'b_door_inst' ? 'door_gray' : p.doorTex });
  const [rx0, rz0] = cellXZ(ra0, rc0), [rx1, rz1] = cellXZ(ra1 - 1, rc1 - 1);
  return {
    x0: Math.min(rx0, rx1), z0: Math.min(rz0, rz1), x1: Math.max(rx0, rx1) + 1, z1: Math.max(rz0, rz1) + 1,
    door: { x: vx, z: vz, dx, dz }, doorKey: faceKey(fx, fz, dx, dz), vest: vCells.map((c) => cellXZ(t, c)),
  };
}

function furnishRoom(zb, rm, r, p) {
  const { x0, z0, x1, z1 } = rm;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const w = x1 - x0, d = z1 - z0;
  rm.doors = [{ x: rm.door.x, z: rm.door.z }];
  if (w >= 4 && d >= 4 && tryRoomPiece(zb, rm, r, 0.05)) return;
  const gates = null;
  // far wall = the wall opposite the door
  const ddx = rm.door.dx, ddz = rm.door.dz;
  const farCells = [];
  if (ddz) { const z = ddz > 0 ? z1 - 1 : z0; for (let x = x0; x < x1; x++) farCells.push([x, z]); }
  else { const x = ddx > 0 ? x1 - 1 : x0; for (let z = z0; z < z1; z++) farCells.push([x, z]); }
  const farF = farCells.map(([x, z]) => faceAt(zb, x, z, ddx, ddz, gates)).filter(Boolean);
  let midF = farF[Math.floor(farF.length / 2)];
  // centre of the far wall
  if (midF) midF = { ...midF, x: ddz ? cx : midF.x, z: ddx ? cz : midF.z };
  const roomLight = r.chance(p.dark ? 0.2 : 0.62) ? (r.chance(0.3) ? 'flicker' : 'on') : 'off';
  // a little of the corridor's light always spills in through the door
  const v0 = rm.vest[rm.vest.length - 1];
  if (v0) zb.light(v0[0] + 0.5 + ddx * 0.6, 1.6, v0[1] + 0.5 + ddz * 0.6, { rad: 3.6, int: 0.22, color: p.variant === 'hotel' ? [1.0, 0.8, 0.55] : [0.9, 0.92, 0.95] });
  if (p.variant === 'hotel') {
    const u = r.next();
    if (midF && farF.length === farCells.length) zb.decal(midF.x, 1.27, midF.z, midF.face, Math.min(2.4, farF.length - 0.5), 2.2, 'curtain');
    if (u < 0.45) {
      // a bare mattress, pulled off a bed that is not there
      const rot = (ddz ? 0 : Math.PI / 2) + r.range(-0.25, 0.25);
      zb.prop('mattress', cx + r.range(-0.3, 0.3), 0, cz + r.range(-0.3, 0.3), rot);
    } else if (u < 0.6) {
      const back = (ddz ? d : w) / 2 - 0.6;
      zb.prop('tv', cx + ddx * back, 0, cz + ddz * back, facing(-ddx, -ddz), { screen: r.chance(0.7) ? 'static' : 'off', stand: r.chance(0.5) });
    } else if (u < 0.75) {
      zb.prop(r.chance(0.5) ? 'armchair' : 'chair_folding', cx, 0, cz, facing(ddx, ddz) + r.range(-0.3, 0.3), { fabric: 'fabric_floral' });
    }
    if (r.chance(0.35)) zb.prop('lamp_floor', x0 + 0.4, 0, z0 + 0.4, 0, { on: roomLight !== 'off' });
    else ceilingLight(zb, cx, cz, 'bulb', roomLight, { hang: 0.25 });
    floorDecal(zb, cx + r.range(-1, 1), cz + r.range(-1, 1), 'dec_stain', r.range(0.7, 1.4), r);
    // bathroom door in the entry
    const v = rm.vest[rm.vest.length - 1];
    if (v && r.chance(0.6)) {
      const sd = r.sign();
      const fdx = ddz ? sd : 0, fdz = ddx ? sd : 0;
      const f = faceAt(zb, v[0], v[1], fdx, fdz, gates);
      if (f && f.off === 0) doorOnFace(zb, f, { tex: 'b_door_hotel', tint: [1.3, 1.25, 1.2], frame: 'plaster', plate: false });
    }
  } else if (p.variant === 'institutional') {
    const u = r.next();
    if (u < 0.35) {
      zb.prop('stack_chairs', x0 + 0.5, 0, z0 + 0.5, r.range(0, 0.3), { n: r.int(6, 18) });
      if (r.chance(0.6)) zb.prop('stack_chairs', x0 + 1.05, 0, z0 + 0.5, r.range(0, 0.3), { n: r.int(4, 14) });
    } else if (u < 0.6) {
      zb.prop('desk_metal', cx, 0, cz, facing(-ddx, -ddz));
      zb.prop('chair_folding', cx - ddx * 0.7, 0, cz - ddz * 0.7, facing(ddx, ddz) + r.range(-0.3, 0.3));
    } else if (u < 0.75 && midF) {
      zb.decal(midF.x, 1.5, midF.z, midF.face, 1.6, 1.0, 'chalkboard');
    }
    ceilingLight(zb, cx, cz, 'troffer', roomLight, { rot: w >= d ? 1 : 0 });
  } else {
    const u = r.next();
    if (u < 0.5) {
      zb.prop('desk', cx, 0, cz, facing(-ddx, -ddz), {});
      zb.prop('chair_office', cx - ddx * 0.75, 0, cz - ddz * 0.75, facing(ddx, ddz) + r.range(-0.6, 0.6));
      if (r.chance(0.6)) zb.prop('crt', cx, 0.75, cz, facing(ddx, ddz), { screen: r.chance(0.15) ? 'crt_blue' : 'crt_off' });
    } else if (u < 0.75) {
      for (let k = 0; k < r.int(2, 5); k++) zb.prop('box_stack', x0 + 0.4 + r.next() * (w - 0.8), 0, z0 + 0.4 + r.next() * (d - 0.8), r.range(0, 0.4));
    }
    if (midF && r.chance(0.5)) zb.prop('filing_cabinet', midF.x - midF.dx * 0.36, 0, midF.z - midF.dz * 0.36, facing(-midF.dx, -midF.dz));
    ceilingLight(zb, cx, cz, 'troffer', roomLight, { rot: w >= d ? 1 : 0 });
  }
}

// Ice machine alcove (or a vending niche) recessed one cell into the corridor wall.
function tryAlcove(zb, e, kind, carve, kAt, r, p, used) {
  const alongX = e.dir === 'h';
  const a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
  const side = r.sign();
  const t = r.int(a0 + 2, a1 - 3);
  const cw = alongX ? (side < 0 ? e.z0 - 1 : e.z1) : (side < 0 ? e.x0 - 1 : e.x1);
  const cellXZ = (a, c) => (alongX ? [a, c] : [c, a]);
  for (let a = t - 1; a <= t + 2; a++) for (let c = cw - (side < 0 ? 1 : 0); c <= cw + (side > 0 ? 1 : 0); c++) {
    const [x, z] = cellXZ(a, c);
    if (!zb.in(x, z) || kAt(x, z)) return null;
  }
  for (const a of [t, t + 1]) { const [fx, fz] = cellXZ(a, side < 0 ? cw + 1 : cw - 1); if (kAt(fx, fz) !== K.CORR && kAt(fx, fz) !== K.LINK) return null; }
  const cells = [cellXZ(t, cw), cellXZ(t + 1, cw)];
  for (const [x, z] of cells) carve(x, z, K.ALCOVE, 2.3);
  const dx = alongX ? 0 : side, dz = alongX ? side : 0;
  for (const a of [t, t + 1]) { const [fx, fz] = cellXZ(a, side < 0 ? cw + 1 : cw - 1); used.add(faceKey(fx, fz, dx, dz)); }
  return { cells, dx, dz };
}

function dressAlcove(zb, al, r, p) {
  const [a, b] = al.cells;
  const fa = faceAt(zb, a[0], a[1], al.dx, al.dz, null), fb = faceAt(zb, b[0], b[1], al.dx, al.dz, null);
  if (p.variant === 'hotel') {
    if (fa) zb.prop('b_ice_machine', fa.x - fa.dx * 0.38, 0, fa.z - fa.dz * 0.38, facing(-fa.dx, -fa.dz));
    if (fb) zb.prop(r.chance(0.85) ? 'vending' : 'b_ice_machine', fb.x - fb.dx * (0.44), 0, fb.z - fb.dz * 0.44, facing(-fb.dx, -fb.dz), { ch: r.chance(0.2) ? 2 : 0 });
  } else {
    if (fa) zb.prop('vending', fa.x - fa.dx * 0.44, 0, fa.z - fa.dz * 0.44, facing(-fa.dx, -fa.dz));
    if (fb) zb.prop(r.chance(0.5) ? 'vending' : 'water_cooler', fb.x - fb.dx * 0.44, 0, fb.z - fb.dz * 0.44, facing(-fb.dx, -fb.dz));
  }
  const mx = (a[0] + b[0]) / 2 + 0.5, mz = (a[1] + b[1]) / 2 + 0.5;
  ceilingLight(zb, mx, mz, 'tube', r.chance(0.8) ? 'on' : 'flicker', { rot: al.dz ? 1 : 0, l: 1.4, mul: 0.8, color: [0.85, 0.95, 1.0] });
  zb.emitter(mx, 1.0, mz, 'hum_strip', { vol: 0.25, rad: 6 });
}

// ------------------------------------------------------------------ lighting
function lightCorridors(zb, edges, H, V, deg, nV, nodeRect, kAt, used, gates, r, p, lit) {
  const state = () => lightState(r, p.fail, p.flicker);
  const warm = [1.0, 0.8, 0.55];
  // node lights
  for (let i = 0; i < H.length; i++) for (let j = 0; j < V.length; j++) {
    if (!deg[i * nV + j]) continue;
    const n = nodeRect(i, j);
    const cx = (n.x0 + n.x1) / 2, cz = (n.z0 + n.z1) / 2;
    if (p.variant === 'hotel') ceilingLight(zb, cx, cz, 'panel', state(), { w: 0.42, l: 0.42, color: warm, mul: 0.85 });
    else ceilingLight(zb, cx, cz, p.light, state(), { rot: r.chance(0.5) ? 1 : 0 });
    lit.add(Math.floor(cx) + ',' + Math.floor(cz));
  }
  for (const e of edges) {
    if (!e.on) continue;
    const alongX = e.dir === 'h';
    let a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
    if (e.stub) { a0 = alongX ? e.sx0 : e.sz0; a1 = alongX ? e.sx1 : e.sz1; }
    const c0 = alongX ? e.z0 : e.x0, c1 = alongX ? e.z1 : e.x1;
    const cm = (c0 + c1) / 2;
    if (e.narrow) {
      const ni = e.narrowInfo;
      const t = ni.towardEnd ? a0 + 1 : a1 - 2;
      ceilingLight(zb, alongX ? t + 0.5 : cm, alongX ? cm : t + 0.5, p.variant === 'hotel' ? 'panel' : p.light, state(), { w: 0.4, l: 0.4, rot: alongX ? 1 : 0, color: p.variant === 'hotel' ? warm : undefined });
      const t2 = ni.towardEnd ? a0 + ni.segLen * (ni.steps.length - 1) + 1 : a1 - 2 - ni.segLen * (ni.steps.length - 1);
      if (r.chance(0.6)) {
        const cx = alongX ? t2 + 0.5 : cm, cz = alongX ? cm : t2 + 0.5;
        const kx = Math.floor(cx), kz = Math.floor(cz);
        if (kAt(kx, kz)) ceilingLight(zb, kx + 0.5, kz + 0.5, 'bulb', r.chance(0.6) ? 'dying' : 'flicker', { hang: 0.2 });
      }
      continue;
    }
    if (p.variant === 'hotel') {
      // sconces on alternating walls
      const step = r.int(4, 5);
      let side = r.sign();
      for (let t = a0 + 1 + (e.L.phase % step); t < a1 - 1; t += step) {
        side = -side;
        for (const sd of [side, -side]) {
          const cx = alongX ? t : sd < 0 ? e.x0 : e.x1 - 1, cz = alongX ? (sd < 0 ? e.z0 : e.z1 - 1) : t;
          const dx = alongX ? 0 : sd, dz = alongX ? sd : 0;
          const k = kAt(cx, cz);
          if (!CORRK(k)) continue;
          // next to doors is fine, on them is not: shift along if taken
          let f = null;
          for (const sh of [0, 1, -1]) {
            const ax = alongX ? cx + sh : cx, az = alongX ? cz : cz + sh;
            if (used.has(faceKey(ax, az, dx, dz))) continue;
            if (!CORRK(kAt(ax, az))) continue;
            f = faceAt(zb, ax, az, dx, dz, gates);
            if (f) { used.add(faceKey(ax, az, dx, dz)); break; }
          }
          if (!f) continue;
          const st = state();
          const ch = st === 'flicker' || st === 'dying' ? (st === 'dying' ? r.int(5, 8) : r.int(1, 4)) : 0;
          zb.prop('b_sconce', f.x, 1.62, f.z, facing(-f.dx, -f.dz), { on: st !== 'off', ch });
          break;
        }
      }
      // widened stretch: a pair of ceiling lights
      if (e.wide) {
        const w = e.wide;
        const mid = (w.s0 + w.s1) / 2, cc = (w.ca + w.cb) / 2;
        for (const o of [-1.5, 1.5]) ceilingLight(zb, alongX ? mid + o : cc, alongX ? cc : mid + o, 'panel', state(), { w: 0.5, l: 0.5, color: warm, mul: 0.8 });
      }
      continue;
    }
    // institutional / office: fixtures down the centre line
    const step = p.light === 'tube' ? 3 : r.int(3, 4);
    for (let t = a0 + 1 + (e.L.phase % step); t < a1; t += step) {
      const cx = alongX ? t + 0.5 : cm, cz = alongX ? cm : t + 0.5;
      const kx = Math.floor(cx), kz = Math.floor(cz);
      if (!kAt(kx, kz) || kAt(kx, kz) === K.NODE) continue;
      const wideHere = e.wide && t >= e.wide.s0 && t < e.wide.s1;
      if (wideHere) {
        const cc = (e.wide.ca + e.wide.cb) / 2;
        for (const o of [-1, 1]) ceilingLight(zb, alongX ? t + 0.5 : cc + o, alongX ? cc + o : t + 0.5, p.light, state(), { rot: alongX ? 1 : 0 });
      } else ceilingLight(zb, cx, cz, p.light, state(), { rot: alongX ? 1 : 0 });
      lit.add(kx + ',' + kz);
    }
  }
}

// ------------------------------------------------------------------ wall dressing
function dressWalls(zb, edges, kAt, used, gates, r, p, deadEnds) {
  const slots = [];
  for (const e of edges) {
    if (!e.on || e.narrow) continue;
    const alongX = e.dir === 'h';
    let a0 = alongX ? e.x0 : e.z0, a1 = alongX ? e.x1 : e.z1;
    if (e.stub) { a0 = alongX ? e.sx0 : e.sz0; a1 = alongX ? e.sx1 : e.sz1; }
    for (let t = a0 + 1; t < a1 - 1; t++) {
      for (const sd of [-1, 1]) {
        const cx = alongX ? t : sd < 0 ? e.x0 : e.x1 - 1, cz = alongX ? (sd < 0 ? e.z0 : e.z1 - 1) : t;
        const dx = alongX ? 0 : sd, dz = alongX ? sd : 0;
        const k = kAt(cx, cz);
        if (k !== K.CORR && k !== K.LINK) continue;
        if (used.has(faceKey(cx, cz, dx, dz))) continue;
        // keep a gap next to doors
        const nb1 = alongX ? faceKey(cx - 1, cz, dx, dz) : faceKey(cx, cz - 1, dx, dz);
        const nb2 = alongX ? faceKey(cx + 1, cz, dx, dz) : faceKey(cx, cz + 1, dx, dz);
        const f = faceAt(zb, cx, cz, dx, dz, gates);
        if (!f) continue;
        slots.push({ f, nearDoor: used.has(nb1) || used.has(nb2), e });
      }
    }
  }
  let phone = r.chance(p.variant === 'hotel' ? 0.4 : 0.3);
  let cart = p.variant === 'hotel' && r.chance(0.35);
  for (const s of slots) {
    const f = s.f;
    const key = faceKey(f.cx, f.cz, f.dx, f.dz);
    if (used.has(key)) continue;
    const u = r.next();
    if (p.variant === 'hotel') {
      if (!s.nearDoor && u < 0.16) { zb.decal(f.x, 1.58, f.z, f.face, 0.62, 0.5, r.weighted([['b_paint_sea', 3], ['painting_land', 2], ['frame_empty', 0.6]])); used.add(key); }
      else if (u < 0.175) { zb.decal(f.x, 1.5, f.z, f.face, 0.3, 0.3, 'b_sign_rooms'); used.add(key); }
      else if (u < 0.185) { zb.prop('extinguisher', f.x, 0, f.z, facing(-f.dx, -f.dz)); used.add(key); }
      else if (phone && !s.nearDoor && u < 0.21) {
        zb.prop('table', f.x - f.dx * 0.25, 0, f.z - f.dz * 0.25, facing(-f.dx, -f.dz), { len: 0.8, depth: 0.4, top: 'wood_dark' });
        zb.prop('phone', f.x - f.dx * 0.25, 0.75, f.z - f.dz * 0.25, facing(-f.dx, -f.dz) + r.range(-0.3, 0.3), { useY: 0.1 });
        if (r.chance(0.5)) zb.prop('lamp_desk', f.x - f.dx * 0.22 + (f.dz ? 0.28 : 0), 0.75, f.z - f.dz * 0.22 + (f.dx ? 0.28 : 0), facing(-f.dx, -f.dz), { on: r.chance(0.6) });
        phone = false; used.add(key);
      } else if (cart && u < 0.23) {
        zb.prop('b_luggage', f.x - f.dx * 0.5, 0, f.z - f.dz * 0.5, facing(f.dz, -f.dx) + r.range(-0.2, 0.2), { bags: r.chance(0.6) });
        cart = false; used.add(key);
      } else if (u < 0.24) zb.decal(f.x, r.range(0.5, 1.8), f.z, f.face, r.range(0.6, 1.2), r.range(0.6, 1.4), 'dec_stain2');
    } else if (p.variant === 'institutional') {
      if (!s.nearDoor && u < 0.07) { zb.decal(f.x, 1.5, f.z, f.face, 1.3, 0.9, 'cork'); used.add(key); }
      else if (u < 0.1) { zb.prop('bench', f.x - f.dx * 0.25, 0, f.z - f.dz * 0.25, facing(-f.dx, -f.dz), { len: 1.4 }); used.add(key); }
      else if (u < 0.115) { zb.prop('b_fountain', f.x, 0, f.z, facing(-f.dx, -f.dz), { mat: r.chance(0.5) ? 'chrome' : 'porcelain' }); used.add(key); }
      else if (u < 0.13) { zb.prop('b_clock', f.x, 2.15, f.z, facing(-f.dx, -f.dz), { face: r.pick(['clock_a', 'clock_b', 'clock_c']) }); used.add(key); }
      else if (u < 0.17) { zb.decal(f.x, 1.55, f.z, f.face, 0.5, 0.65, r.pick(['poster_notice', 'poster_safety', 'poster_map', 'poster_wash'])); used.add(key); }
      else if (u < 0.18) { zb.prop('extinguisher', f.x, 0, f.z, facing(-f.dx, -f.dz)); used.add(key); }
      else if (u < 0.19) { zb.prop('trash_can', f.x - f.dx * 0.2, 0, f.z - f.dz * 0.2, 0); used.add(key); }
      else if (phone && u < 0.2) { zb.prop('payphone', f.x, 0, f.z, facing(-f.dx, -f.dz)); phone = false; used.add(key); }
      else if (u < 0.21) zb.decal(f.x, 2.0, f.z, f.face, 0.3, 0.3, r.pick(['sign_restroom', 'sign_staff', 'sign_noexit']));
    } else {
      if (u < 0.03) { zb.prop('water_cooler', f.x - f.dx * 0.2, 0, f.z - f.dz * 0.2, facing(-f.dx, -f.dz)); used.add(key); }
      else if (u < 0.06) { zb.prop('plant', f.x - f.dx * 0.25, 0, f.z - f.dz * 0.25, 0); used.add(key); }
      else if (!s.nearDoor && u < 0.11) { zb.decal(f.x, 1.55, f.z, f.face, 0.55, 0.7, r.pick(['poster_safety', 'poster_map', 'poster_notice', 'poster_employee', 'poster_motiv'])); used.add(key); }
      else if (u < 0.12) { zb.prop('extinguisher', f.x, 0, f.z, facing(-f.dx, -f.dz)); used.add(key); }
      else if (phone && u < 0.135) { zb.prop('payphone', f.x, 0, f.z, facing(-f.dx, -f.dz)); phone = false; used.add(key); }
      else if (u < 0.15) zb.decal(f.x, 1.3, f.z, f.face, 0.14, 0.22, 'dec_switch');
    }
  }
  // widened stretches get furniture
  for (const e of edges) {
    if (!e.wide) continue;
    const w = e.wide;
    const mid = (w.s0 + w.s1) / 2, cc = (w.ca + w.cb) / 2;
    const X = (a, c) => (w.alongX ? [a, c] : [c, a]);
    const sideC = r.chance(0.5) ? w.ca + 0.6 : w.cb - 0.6;
    const toward = sideC < cc ? 1 : -1;
    const oppC = sideC < cc ? w.cb - 0.45 : w.ca + 0.45;
    const dirToCentre = w.alongX ? [0, toward] : [toward, 0];
    if (p.variant === 'hotel') {
      const [ax, az] = X(mid - 0.9, sideC), [bx, bz] = X(mid + 0.9, sideC);
      zb.prop('armchair', ax, 0, az, facing(dirToCentre[0], dirToCentre[1]) + r.range(-0.3, 0.3), { fabric: r.pick(['fabric_floral', 'velvet_red', 'fabric_brown']) });
      zb.prop('armchair', bx, 0, bz, facing(dirToCentre[0], dirToCentre[1]) + r.range(-0.3, 0.3), { fabric: r.pick(['fabric_floral', 'velvet_red', 'fabric_brown']) });
      const [tx, tz] = X(mid, sideC);
      zb.prop('table_round', tx, 0, tz, 0, { r: 0.3, top: 'wood_dark' });
      if (r.chance(0.6)) zb.prop('lamp_desk', tx, 0.75, tz, r.range(0, 6), { on: r.chance(0.5) });
      const [px, pz] = X(w.s0 + 0.5, sideC);
      zb.prop('plant', px, 0, pz, 0);
    } else if (p.variant === 'institutional') {
      const [ax, az] = X(mid, sideC);
      zb.prop('bench', ax, 0, az, facing(dirToCentre[0], dirToCentre[1]), { len: Math.min(2.4, w.s1 - w.s0 - 1) });
      const [vx, vz] = X(w.s1 - 0.6, oppC);
      if (r.chance(0.6)) zb.prop('vending', vx, 0, vz, facing(-dirToCentre[0], -dirToCentre[1]));
    } else {
      const [ax, az] = X(mid - 0.7, sideC), [bx, bz] = X(mid + 0.7, sideC);
      zb.prop('chair_plastic', ax, 0, az, facing(dirToCentre[0], dirToCentre[1]) + r.range(-0.4, 0.4));
      zb.prop('chair_plastic', bx, 0, bz, facing(dirToCentre[0], dirToCentre[1]) + r.range(-0.4, 0.4));
      const [cx2, cz2] = X(mid, oppC);
      if (r.chance(0.6)) zb.prop('copier', cx2, 0, cz2, facing(-dirToCentre[0], -dirToCentre[1]));
    }
  }
  void deadEnds; void CF;
}

defineZone('corridors', {
  border: 'wall',
  gate: 'door',
  minW: 16, minD: 16,
  weight: (c) => {
    if (c.dim !== 0 || c.dist <= 60) return 0;
    if (c.level === 0 && c.flatDist < 95) return 0;
    return 1.3 + c.office * 0.9;
  },
  params: corridorParams,
  gen: genCorridors,
});
