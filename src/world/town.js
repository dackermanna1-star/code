// A town laid out like a real one. Around a market square (town hall,
// church, fountain) lies an old town of crooked lanes lined with terraced
// houses and shops, closed in by a ring road. Beyond it the districts each
// get their own street grid at their own angle: an industrial zone, a
// housing estate of apartment slabs with parking and a hospital, and
// suburbs of detached houses with gardens, a school with its pitch, a park,
// a cemetery and a supermarket. Two avenues cross at the square and leave
// town to join the country roads. Streets have pavements, lamps, parked
// cars and avenue trees.

import { MAT } from './terrain.js';

// Plaster and paint for the old town, newer suburbs and concrete blocks.
export const OLD = [0xd8c9a3, 0xe3d6b8, 0xcfb58c, 0xd9b9a0, 0xc9cfc6, 0xe6dcc6, 0xbfa57e, 0xd4c08f, 0xc7b0a0, 0xddd0b0, 0xb79c86, 0xcdc4b4];
export const NEW = [0xd9d4c8, 0xc8c2b4, 0xbdb5a2, 0xe0dccf, 0xb9b1a3, 0xcfc6b0, 0xa8a090, 0xd6cdbb];
const PANEL = [0xb5b1a6, 0xa9a69c, 0xc4bfb2, 0x9fa09a, 0xbcb3a0];
export const TILES = [0x8a4430, 0x7d3a2b, 0x9a5236, 0x6b3326, 0x7a5040, 0x8f5b3e, 0x6e4a3a];
export const SLATE = [0x55534f, 0x494846, 0x5f5c57, 0x3f3f3e];

export function buildTown(ctx, cx, cz, R, yaw, { industrialSide = -1 } = {}) {
  const rng = ctx.rng;
  const roadStart = ctx.roads.length;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const toW = (u, v) => [cx + u * c + v * s, cz - u * s + v * c];
  const W = (p) => toW(p[0], p[1]);
  const sites = {};

  const baseH = ctx.flattenCircle(cx, cz, R * 0.95, 150, null, 0.85);
  ctx.flattenCircle(cx, cz, R * 0.5, 80, baseH, 0.6);
  ctx.paintCircle(cx, cz, R * 1.02, MAT.GRASS, 0.1);

  // ------------------------------------------------------------ old town grid
  const G = 46;
  const Rold = R * 0.37;
  const K = Math.ceil(Rold / G) + 2;
  const U = {};
  const V = {};
  U[0] = 0;
  U[1] = 62;
  V[0] = -31;
  V[1] = 31;
  for (let i = 2; i <= K + 1; i++) U[i] = U[i - 1] + G + rng.range(-5, 5);
  for (let i = -1; i >= -K; i--) U[i] = U[i + 1] - G + rng.range(-5, 5);
  for (let j = 2; j <= K + 1; j++) V[j] = V[j - 1] + G + rng.range(-5, 5);
  for (let j = -1; j >= -K; j--) V[j] = V[j + 1] - G + rng.range(-5, 5);
  // Crooked lanes: every crossing nudged, except along the two main streets
  // and around the square.
  const vert = (i, j) => {
    let u = U[i];
    let v = V[j];
    const nearSquare = (i === 0 || i === 1) && (j === 0 || j === 1);
    if (i !== 0 && !nearSquare) u += ctx.noise.noise(i * 1.7 + 3, j * 1.3 - 5) * 9;
    if (j !== 0 && !nearSquare) v += ctx.noise2.noise(i * 1.3 - 7, j * 1.9 + 2) * 9;
    return [u, v];
  };
  const isOld = (i, j) => {
    const [u0, v0] = vert(i, j);
    const [u1, v1] = vert(i + 1, j + 1);
    const mu = (u0 + u1) / 2;
    const mv = (v0 + v1) / 2;
    return Math.hypot(mu, mv) < Rold * (1 + 0.14 * ctx.noise.noise(mu / 90 + 4, mv / 90));
  };
  const old = new Set();
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) if (isOld(i, j)) old.add(`${i},${j}`);
  const has = (i, j) => old.has(`${i},${j}`);

  // ------------------------------------------------------------ main roads
  // The main street (u = 0) and the cross avenue (v = V[0]) run through the
  // whole town and out the far side, bending a little beyond the old town.
  const ends = {};
  const avenue = (axis) => {
    const pts = [];
    const L = R * 1.1;
    for (let t = -L; t <= L + 0.1; t += 8) {
      const bend = Math.max(0, Math.abs(t) - Rold * 1.1) / (R - Rold);
      const off = ctx.noise.noise(t / 260 + (axis ? 11 : 3), axis ? 4 : 9) * 26 * bend * bend;
      pts.push(axis === 0 ? [off, t] : [t, V[0] + off]);
    }
    ctx.road(pts.map(W), 12, { main: true, sidewalk: 2.6 });
    return pts;
  };
  const mainN = avenue(0);
  const mainE = avenue(1);
  ends.north = W(mainN[0]);
  ends.south = W(mainN[mainN.length - 1]);
  ends.west = W(mainE[0]);
  ends.east = W(mainE[mainE.length - 1]);

  // Old town lanes along the grid lines (the main lines are already laid).
  const lanes = [];
  for (let i = -K; i <= K + 1; i++) {
    if (i === 0) continue;
    let run = [];
    for (let j = -K; j <= K + 1; j++) {
      const use = has(i - 1, j) || has(i, j);
      if (use) {
        if (!run.length) run.push(vert(i, j));
        run.push(vert(i, j + 1));
      } else if (run.length) {
        lanes.push(run);
        run = [];
      }
    }
    if (run.length) lanes.push(run);
  }
  for (let j = -K; j <= K + 1; j++) {
    if (j === 0) continue;
    let run = [];
    for (let i = -K; i <= K + 1; i++) {
      const use = has(i, j - 1) || has(i, j);
      if (use) {
        if (!run.length) run.push(vert(i, j));
        run.push(vert(i + 1, j));
      } else if (run.length) {
        lanes.push(run);
        run = [];
      }
    }
    if (run.length) lanes.push(run);
  }
  for (const run of lanes) {
    if (run.length < 2) continue;
    const wide = run.some(([u, v]) => Math.hypot(u - 31, v) < 50);
    ctx.road(run.map(W), wide ? 9 : 7.5, { sidewalk: 2.2 });
  }

  // Ring road around the old town.
  const Rring = Rold + G * 0.62;
  const ringR = (a) => Rring * (1 + 0.06 * ctx.noise2.noise(Math.cos(a) * 1.5 + 20, Math.sin(a) * 1.5));
  const ring = [];
  for (let k = 0; k <= 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    const r = ringR(a);
    ring.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  ctx.road(ring.map(W), 10, { sidewalk: 2.4 });

  // ------------------------------------------------------------ districts
  // Quadrants between the main roads; each gets a street grid.
  const vE = V[0];
  const margin = 11;
  const outerR = (u, v) => R * (0.95 + 0.07 * ctx.noise.noise(u / 160 - 3, v / 160 + 8));
  const quadOf = (u, v) => (u < 0 ? (v < vE ? 'NW' : 'SW') : v < vE ? 'NE' : 'SE');
  const inQuad = (q, u, v, pad = 0) => {
    if (Math.abs(u) < margin + pad || Math.abs(v - vE) < margin + pad) return false;
    if (quadOf(u, v) !== q) return false;
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    return r > ringR(a) + 11 + pad && r < outerR(u, v) - pad;
  };
  const indQ = industrialSide < 0 ? 'NW' : 'NE';
  const estQ = industrialSide < 0 ? 'NE' : 'NW';
  const plan = { [indQ]: 'industrial', [estQ]: 'estate', SW: 'suburb', SE: 'suburb' };
  const districts = {};
  for (const q of ['NW', 'NE', 'SW', 'SE']) {
    const kind = plan[q];
    const qu = q[1] === 'W' ? -1 : 1;
    const qv = q[0] === 'N' ? -1 : 1;
    const bis = Math.atan2(qv, qu);
    const ang = (kind === 'suburb' ? rng.pick([0, Math.PI / 4]) : rng.pick([0, 0.12])) + rng.range(-0.12, 0.12) + (kind === 'suburb' ? bis : 0);
    const [sa, sb, width] = kind === 'industrial' ? [100, 120, 10] : kind === 'estate' ? [96, 124, 9] : [66, 112, 8];
    districts[q] = gridDistrict(ctx, W, (u, v, pad) => inQuad(q, u, v, pad), ang, sa, sb, width, kind === 'industrial' ? 0 : kind === 'estate' ? 2.2 : 1.6, R);
    districts[q].kind = kind;
  }

  // ------------------------------------------------------------ the square
  const cellCorners = (i, j) => [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)];
  {
    const [a, , b] = cellCorners(0, 0);
    const mu = (a[0] + b[0]) / 2;
    const mv = (a[1] + b[1]) / 2;
    const [px, pz] = toW(mu, mv);
    ctx.paintRect(px, pz, (b[0] - a[0]) / 2 + 3, (b[1] - a[1]) / 2 + 3, yaw, MAT.CONCRETE);
    sites.square = [px, pz];
    // Town hall on the east side, facing the square, with its clock tower.
    const [hx, hz] = toW(b[0] - 7 - 3, mv);
    ctx.building('townhall', hx, hz, 34, 15, yaw - Math.PI / 2, { floors: 3, roof: 'hip', roofH: 4.6, color: 0xe2d6b8, roofColor: 0x4f5652 });
    const [tx, tz] = toW(b[0] - 9, mv);
    ctx.building('tower', tx, tz, 6, 6, yaw, { floors: 1, h: 22, roof: 'spire', roofH: 7, color: 0xe2d6b8, roofColor: 0x3f4a42 });
    // Fountain, trees, lamps, benches, market stalls.
    const [fx, fz] = toW(mu - 4, mv);
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2;
      const a1 = ((k + 1) / 8) * Math.PI * 2;
      ctx.wall('stone_wall', fx + Math.cos(a0) * 4.5, fz + Math.sin(a0) * 4.5, fx + Math.cos(a1) * 4.5, fz + Math.sin(a1) * 4.5, 0.75, 0.5, { color: 0xb8b0a0 });
    }
    for (const [du, dv] of [[-22, -22], [-22, 22], [6, -22], [6, 22]]) {
      const [x, z] = toW(mu + du, mv + dv);
      ctx.tree(x, z, 1, rng.range(0.8, 1.0), { force: true });
    }
    for (let k = 0; k < 4; k++) {
      const [x, z] = toW(mu - 12 + k * 7, mv + rng.pick([-14, 14]));
      ctx.decoration('bench', x, z, yaw + (rng.chance(0.5) ? 0 : Math.PI));
    }
    for (let k = 0; k < 5; k++) {
      const [x, z] = toW(mu - 20 + rng.range(-4, 4), mv - 18 + k * 9);
      ctx.prop('crates', x, z, yaw + rng.range(-0.3, 0.3));
    }
  }
  // Church facing the square across the avenue, in its churchyard.
  {
    const [a, , b] = cellCorners(0, -1);
    const mu = (a[0] + b[0]) / 2;
    const mv = (a[1] + b[1]) / 2;
    const [px, pz] = toW(mu, mv);
    ctx.paintRect(px, pz, (b[0] - a[0]) / 2 - 2, (b[1] - a[1]) / 2 - 2, yaw, MAT.GRASS);
    ctx.building('church', px, pz - 2, 14, 28, yaw, { floors: 1, h: 11, roof: 'gable', roofH: 6.5, color: 0xd2c9b4, roofColor: 0x4a4a46 });
    const [tx, tz] = toW(mu, mv + 17);
    ctx.building('tower', tx, tz, 7, 7, yaw, { floors: 1, h: 26, roof: 'spire', roofH: 10, color: 0xd2c9b4, roofColor: 0x3a453e });
    for (let k = 0; k < 8; k++) {
      const [gx, gz] = toW(mu + rng.pick([-1, 1]) * rng.range(10, 17), mv + rng.range(-16, 16));
      ctx.tree(gx, gz, rng.chance(0.4) ? 0 : 1, rng.range(0.7, 0.95), { force: true });
    }
    for (let k = 0; k < 14; k++) {
      const [gx, gz] = toW(mu + rng.pick([-1, 1]) * rng.range(11, 16), mv + rng.range(-14, 10));
      ctx.decoration('gravestone', gx, gz, yaw + rng.range(-0.1, 0.1));
    }
    ctx.wallLine('stone_wall', ...toW(a[0] + 3, b[1] - 3), ...toW(b[0] - 3, b[1] - 3), 1.1, 0.5, 6, 0.15);
    sites.church = [px, pz];
  }

  // ------------------------------------------------------------ old town blocks
  for (let i = -K; i <= K; i++) {
    for (let j = -K; j <= K; j++) {
      if (!has(i, j) || (i === 0 && (j === 0 || j === -1))) continue;
      const P = cellCorners(i, j).map(W);
      const mid = [(P[0][0] + P[2][0]) / 2, (P[0][1] + P[2][1]) / 2];
      const ru = Math.hypot(...cellCorners(i, j)[0]) / Rold;
      const main = (e) => (e === 3 && i === 0) || (e === 1 && i === -1) || (e === 0 && j === 0) || (e === 2 && j === -1);
      const lane = (e) => (main(e) ? 6 + 2.6 : 3.75 + 2.2);
      const outer = ru > 0.8;
      for (let e = 0; e < 4; e++) {
        const A = P[e];
        const B = P[(e + 1) % 4];
        // Pave from the road to the house fronts.
        {
          const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
          const ux = (B[0] - A[0]) / L;
          const uz = (B[1] - A[1]) / L;
          let nx = -uz;
          let nz = ux;
          if ((mid[0] - A[0]) * nx + (mid[1] - A[1]) * nz < 0) {
            nx = -nx;
            nz = -nz;
          }
          const w = lane(e) + 1;
          ctx.paintRect((A[0] + B[0]) / 2 + nx * w * 0.5, (A[1] + B[1]) / 2 + nz * w * 0.5, w * 0.5, L / 2, Math.atan2(ux, uz), MAT.CONCRETE, (m) => m !== MAT.ROAD);
        }
        const shop = main(e) || rng.chance(0.18);
        frontage(ctx, A, B, mid, {
          off: lane(e) + 0.3,
          corner: lane(e) - 1,
          width: shop ? [9, 15] : [6.5, 11],
          depth: [10, 13.5],
          gap: [0.25, 0.6],
          type: () => (shop ? 'shop' : outer && rng.chance(0.25) ? 'apartment' : 'rowhouse'),
          floors: shop ? [3, 4] : [2, 4],
          roof: () => (outer && rng.chance(0.2) ? 'flat' : rng.chance(0.82) ? 'gable' : 'hip'),
          colors: OLD,
          roofColors: TILES,
          skip: 0.04,
        });
      }
      // Courtyard: a tree, a shed, a car, bins.
      for (let k = 0; k < 3; k++) {
        const x = mid[0] + rng.range(-9, 9);
        const z = mid[1] + rng.range(-9, 9);
        const r = rng.next();
        if (r < 0.4) ctx.tree(x, z, 1, rng.range(0.6, 0.85), { force: true });
        else if (r < 0.6) ctx.tryBuilding('shed', x, z, rng.range(3, 4.5), rng.range(3, 4), yaw + rng.range(-0.2, 0.2), { floors: 1, h: 2.6, roof: 'flat', color: 0x8a7a64, pad: 0.6 });
        else if (r < 0.8) ctx.prop('car', x, z, rng.range(0, 6.28));
        else ctx.prop('dumpster', x, z, rng.range(0, 6.28));
      }
    }
  }

  // ------------------------------------------------------------ districts
  for (const [q, d] of Object.entries(districts)) {
    const cells = d.cells.slice().sort((a, b) => a.r - b.r);
    if (d.kind === 'industrial') {
      cells.forEach((cell) => industrialLot(ctx, cell, sites));
    } else if (d.kind === 'estate') {
      cells.forEach((cell, k) => {
        if (k === 0) hospital(ctx, cell, sites);
        else if (k === 1) cemetery(ctx, cell);
        else estateBlock(ctx, cell, k === 2 ? sites : null);
      });
    } else {
      cells.forEach((cell, k) => {
        if (k === 0 && q === 'SE') school(ctx, cell);
        else if (k === 0) park(ctx, cell);
        else if (k === cells.length - 1 && q === 'SE') supermarket(ctx, cell, sites);
        else suburbBlock(ctx, cell);
      });
    }
  }

  // ------------------------------------------------------------ boulevards
  // Buildings line both sides of the ring road and the avenues out of town:
  // shops, offices and flats nearer the centre, houses further out.
  const side = (A, B, sd) => {
    const dx = B[0] - A[0];
    const dz = B[1] - A[1];
    const l = Math.hypot(dx, dz) || 1;
    return [(A[0] + B[0]) / 2 - (dz / l) * 12 * sd, (A[1] + B[1]) / 2 + (dx / l) * 12 * sd];
  };
  const urban = (off) => ({
    off,
    corner: 6,
    width: [12, 24],
    depth: [11, 15],
    gap: [0.4, 3],
    type: () => rng.pick(['apartment', 'office', 'shop', 'apartment']),
    floors: [3, 6],
    roof: () => (rng.chance(0.7) ? 'flat' : 'hip'),
    colors: NEW.concat(PANEL),
    roofColors: SLATE,
    skip: 0.06,
    pad: 0.4,
  });
  for (const [A, B] of chunks(ring.map(W), 30)) {
    for (const sd of [-1, 1]) frontage(ctx, A, B, side(A, B, sd), urban(5 + 2.4 + 0.3));
  }
  for (const pts of [mainN, mainE]) {
    for (const [A, B] of chunks(pts.map(W), 30)) {
      const r = Math.hypot((A[0] + B[0]) / 2 - cx, (A[1] + B[1]) / 2 - cz);
      if (r < Rring - 6 || r > R * 0.97) continue;
      const near = r < R * 0.66;
      for (const sd of [-1, 1]) {
        frontage(ctx, A, B, side(A, B, sd), near ? urban(6 + 2.6 + 0.3) : {
          off: 6 + 2.6 + 0.5,
          setback: [3, 6],
          corner: 4,
          width: [8, 12],
          depth: [8, 10.5],
          gap: [4, 9],
          type: () => (rng.chance(0.25) ? 'shop' : 'house'),
          floors: [1, 2],
          roof: () => (rng.chance(0.7) ? 'gable' : 'hip'),
          colors: NEW,
          roofColors: TILES,
          skip: 0.1,
          pad: 1.2,
          after: (st, p) => garden(ctx, p),
        });
      }
    }
  }

  // ------------------------------------------------------------ street life
  const townRoads = ctx.roads.slice(roadStart);
  for (const r of townRoads) streetFurniture(ctx, r, (x, z) => Math.hypot(x - cx, z - cz) < R * 1.02, Rold, cx, cz);
  // Gas station where the main street leaves town toward the attackers.
  {
    const [gx, gz] = toW(18, R * 0.99);
    if (ctx.tryBuilding('gas_station', gx, gz, 12, 8, yaw - Math.PI / 2, { floors: 1, h: 3.6, roof: 'flat', color: 0xd8d6cf, pad: 1 })) {
      const [px, pz] = toW(30, R * 0.99);
      ctx.paintRect(px, pz, 10, 14, yaw, MAT.CONCRETE);
      for (let k = 0; k < 3; k++) {
        const [x, z] = toW(30 + rng.range(-5, 5), R * 0.99 + rng.range(-10, 10));
        ctx.prop(k === 0 ? 'fuel_drums' : 'car', x, z, yaw + rng.range(-0.3, 0.3));
      }
      sites.gas = [gx, gz];
    }
  }
  ctx.noTree.push({ x: cx, z: cz, r: R * 1.02 });
  return { toW, baseH, sites, ends, R };
}

// A polyline cut into straight pieces about `len` long (for frontage).
export function chunks(pts, len) {
  const out = [];
  let a = pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc >= len || i === pts.length - 1) {
      out.push([a, pts[i]]);
      a = pts[i];
      acc = 0;
    }
  }
  return out;
}

// Buildings along one side of a street edge A->B, facing the street.
// `inner` is a point on the side the buildings stand.
export function frontage(ctx, A, B, inner, o) {
  const rng = ctx.rng;
  const dx = B[0] - A[0];
  const dz = B[1] - A[1];
  const L = Math.hypot(dx, dz);
  if (L < 8) return;
  const ux = dx / L;
  const uz = dz / L;
  let nx = -uz;
  let nz = ux;
  if ((inner[0] - A[0]) * nx + (inner[1] - A[1]) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const yaw = Math.atan2(-nx, -nz);
  let pos = o.corner ?? 2;
  const end = L - (o.corner ?? 2);
  let tries = 0;
  while (pos < end - 4) {
    let w = rng.range(o.width[0], o.width[1]);
    if (pos + w > end) {
      w = end - pos;
      if (w < o.width[0] * 0.7) break;
    }
    const D = rng.range(o.depth[0], o.depth[1]);
    const back = o.off + (o.setback ? rng.range(o.setback[0], o.setback[1]) : 0);
    const px = A[0] + ux * (pos + w / 2) + nx * (back + D / 2);
    const pz = A[1] + uz * (pos + w / 2) + nz * (back + D / 2);
    if (o.skip && rng.chance(o.skip)) {
      pos += w + rng.range(o.gap[0], o.gap[1]);
      continue;
    }
    const type = typeof o.type === 'function' ? o.type() : o.type;
    const roof = o.roof();
    const tall = rng.int(o.floors[0], o.floors[1]);
    const st = ctx.tryBuilding(type, px, pz, w, D, yaw, {
      floors: tall,
      roof,
      roofH: roof === 'gable' || roof === 'hip' ? Math.min(4.2, rng.range(0.22, 0.32) * D) : 0,
      color: rng.pick(o.colors),
      roofColor: rng.pick(o.roofColors),
      pad: o.pad ?? 0.12,
    });
    if (!st) {
      // Blocked (a corner building, a cross street): slide along and retry.
      if (tries++ < 8) {
        pos += 2;
        continue;
      }
    } else if (o.after) o.after(st, { px, pz, w, D, yaw, nx, nz, ux, uz, back });
    tries = 0;
    pos += w + rng.range(o.gap[0], o.gap[1]);
  }
}

// Streets on a grid at angle `ang` over a region; returns the block cells
// (corners in world space) whose centres lie inside it.
function gridDistrict(ctx, W, inside, ang, sa, sb, width, sidewalk, R) {
  const ea = [Math.cos(ang), Math.sin(ang)];
  const eb = [-Math.sin(ang), Math.cos(ang)];
  const o = [ctx.rng.range(0, sa), ctx.rng.range(0, sb)];
  const at = (a, b) => [o[0] + ea[0] * a + eb[0] * b, o[1] + ea[1] * a + eb[1] * b];
  const L = R * 1.2;
  const na = Math.ceil(L / sa);
  const nb = Math.ceil(L / sb);
  const lay = (fixed, alongA) => {
    let run = [];
    const flush = () => {
      if (run.length >= 5) ctx.road(run.map(W), width, sidewalk ? { sidewalk } : {});
      run = [];
    };
    for (let t = -L; t <= L; t += 6) {
      const p = alongA ? at(t, fixed) : at(fixed, t);
      if (inside(p[0], p[1], -4)) run.push(p);
      else flush();
    }
    flush();
  };
  for (let k = -na; k <= na; k++) lay(k * sa, false);
  for (let k = -nb; k <= nb; k++) lay(k * sb, true);
  const cells = [];
  for (let i = -na; i < na; i++) {
    for (let j = -nb; j < nb; j++) {
      const corners = [at(i * sa, j * sb), at((i + 1) * sa, j * sb), at((i + 1) * sa, (j + 1) * sb), at(i * sa, (j + 1) * sb)];
      const m = at((i + 0.5) * sa, (j + 0.5) * sb);
      if (!inside(m[0], m[1], -6)) continue;
      const okCorners = corners.filter((p) => inside(p[0], p[1], -24)).length;
      if (okCorners < 2) continue;
      cells.push({ P: corners.map(W), mid: W(m), r: Math.hypot(m[0], m[1]), yaw: ang, half: width / 2 + sidewalk, sa, sb });
    }
  }
  return { cells };
}

// Paint a rectangle with half extents ha along (ux, uz) and hb across it.
const rectU = (ctx, m, ha, hb, ux, uz, mat) => ctx.paintRect(m[0], m[1], hb, ha, Math.atan2(ux, uz), mat);

const edgesOf = (cell) => [0, 1, 2, 3].map((e) => [cell.P[e], cell.P[(e + 1) % 4]]);

// Detached houses with front gardens, hedges, sheds, cars and trees.
function suburbBlock(ctx, cell) {
  const rng = ctx.rng;
  for (const [A, B] of edgesOf(cell)) {
    frontage(ctx, A, B, cell.mid, {
      off: cell.half + 0.5,
      setback: [3, 6.5],
      corner: cell.half + 4,
      width: [8, 12.5],
      depth: [8, 10.5],
      gap: [5, 11],
      type: () => (rng.chance(0.12) ? 'rowhouse' : 'house'),
      floors: [1, 2],
      roof: () => (rng.chance(0.68) ? 'gable' : rng.chance(0.8) ? 'hip' : 'flat'),
      colors: NEW,
      roofColors: rng.chance(0.5) ? TILES : SLATE,
      skip: 0.07,
      pad: 1.2,
      after: (st, p) => garden(ctx, p),
    });
  }
}

// A house plot: hedge or fence at the front, a tree or shed behind, maybe
// a bush and a car on the drive. p is the frontage placement.
export function garden(ctx, p) {
  const rng = ctx.rng;
  const fx = p.px - p.nx * (p.D / 2 + 1.6);
  const fz = p.pz - p.nz * (p.D / 2 + 1.6);
  if (rng.chance(0.45)) {
    const half = p.w / 2 + 2;
    const hedge = rng.chance(0.6);
    ctx.wall(hedge ? 'hedge' : 'fence', fx - p.ux * half, fz - p.uz * half, fx + p.ux * half, fz + p.uz * half, rng.range(0.9, 1.4), hedge ? 0.9 : 0.15);
  }
  const bx = p.px + p.nx * (p.D / 2 + rng.range(5, 10));
  const bz = p.pz + p.nz * (p.D / 2 + rng.range(5, 10));
  const r = rng.next();
  if (r < 0.55) ctx.tree(bx + p.ux * rng.range(-3, 3), bz + p.uz * rng.range(-3, 3), rng.chance(0.85) ? 1 : 0, rng.range(0.6, 0.95), { force: true });
  else if (r < 0.75) ctx.tryBuilding('shed', bx, bz, rng.range(2.5, 4), rng.range(2.5, 3.5), p.yaw, { floors: 1, h: 2.4, roof: 'gable', roofH: 0.9, color: 0x8c7258, roofColor: 0x4f4c48, pad: 0.4 });
  if (rng.chance(0.18)) ctx.tree(bx - p.ux * 4, bz - p.uz * 4, 3, rng.range(0.8, 1.2), { force: true });
  if (rng.chance(0.35)) {
    const side = rng.pick([-1, 1]);
    const dx = p.px + p.ux * side * (p.w / 2 + 2) - p.nx * (p.D / 2 - 2);
    const dz = p.pz + p.uz * side * (p.w / 2 + 2) - p.nz * (p.D / 2 - 2);
    ctx.prop('car', dx, dz, p.yaw + (rng.chance(0.5) ? 0 : Math.PI));
  }
}

// Apartment slabs in rows with parking and a playground.
function estateBlock(ctx, cell, sites) {
  const rng = ctx.rng;
  const [A, B, C, D] = cell.P;
  const mid = cell.mid;
  // Long axis of the block.
  const lenAB = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const lenAD = Math.hypot(D[0] - A[0], D[1] - A[1]);
  const along = lenAB > lenAD ? [B[0] - A[0], B[1] - A[1]] : [D[0] - A[0], D[1] - A[1]];
  const la = Math.hypot(along[0], along[1]);
  const ux = along[0] / la;
  const uz = along[1] / la;
  const nx = -uz;
  const nz = ux;
  const across = Math.min(lenAB, lenAD);
  const slabL = Math.min(78, la - 2 * cell.half - 16);
  const yaw = Math.atan2(nx, nz);
  const rows = across > 110 ? 3 : 2;
  for (let k = 0; k < rows; k++) {
    const t = rows === 2 ? (k === 0 ? -0.27 : 0.27) : (k - 1) * 0.31;
    const x = mid[0] + nx * t * across;
    const z = mid[1] + nz * t * across;
    const tall = rng.chance(0.35);
    ctx.tryBuilding('apartment', x, z, slabL * rng.range(0.8, 1), 13, yaw, { floors: tall ? rng.int(9, 11) : rng.int(5, 7), roof: 'flat', color: rng.pick(PANEL), pad: 1 });
  }
  // Parking between the slabs, a playground and trees.
  ctx.paintRect(mid[0], mid[1], 9, slabL * 0.4, Math.atan2(ux, uz), MAT.CONCRETE);
  for (let k = 0; k < 9; k++) {
    if (!rng.chance(0.7)) continue;
    const t = (k - 4) * 3.2;
    ctx.prop('car', mid[0] + ux * t + nx * rng.pick([-3.5, 3.5]), mid[1] + uz * t + nz * rng.pick([-3.5, 3.5]), Math.atan2(nx, nz) + (rng.chance(0.5) ? 0 : Math.PI) + rng.range(-0.08, 0.08));
  }
  const px = mid[0] + ux * slabL * 0.42;
  const pz = mid[1] + uz * slabL * 0.42;
  ctx.paintCircle(px, pz, 7, MAT.SAND, 0.1);
  ctx.decoration('bench', px + 6, pz, yaw);
  for (let k = 0; k < 7; k++) ctx.tree(mid[0] + ux * rng.range(-slabL / 2, slabL / 2) + nx * rng.range(-6, 6), mid[1] + uz * rng.range(-slabL / 2, slabL / 2) + nz * rng.range(-6, 6), 1, rng.range(0.7, 1), { force: true });
  for (let k = 0; k < 2; k++) ctx.prop('dumpster', mid[0] - ux * (slabL * 0.45) + nx * (k ? 5 : -5), mid[1] - uz * (slabL * 0.45) + nz * (k ? 5 : -5), yaw);
  if (sites) sites.estate = mid;
}

function hospital(ctx, cell, sites) {
  const rng = ctx.rng;
  const [A, B] = cell.P;
  const ux = (B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  const uz = (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  const nx = -uz;
  const nz = ux;
  const m = cell.mid;
  const yaw = Math.atan2(nx, nz);
  rectU(ctx, m, cell.sa / 2 - cell.half - 2, cell.sb / 2 - cell.half - 2, ux, uz, MAT.CONCRETE);
  ctx.tryBuilding('hospital', m[0] - nx * 8, m[1] - nz * 8, 62, 17, yaw, { floors: 5, roof: 'flat', color: 0xe4e2da, pad: 1 });
  ctx.tryBuilding('hospital', m[0] + ux * 22 + nx * 14, m[1] + uz * 22 + nz * 14, 18, 26, yaw, { floors: 3, roof: 'flat', color: 0xd9d6cc, pad: 0.5 });
  ctx.paintCircle(m[0] - ux * 20 + nx * 18, m[1] - uz * 20 + nz * 18, 8, MAT.ROAD);
  for (let k = 0; k < 8; k++) ctx.prop('car', m[0] + ux * (k * 4 - 30) + nx * 26, m[1] + uz * (k * 4 - 30) + nz * 26, yaw + Math.PI / 2 + rng.range(-0.1, 0.1));
  sites.hospital = m;
}

function cemetery(ctx, cell) {
  const rng = ctx.rng;
  const [A, B, , D] = cell.P;
  const ux = (B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  const uz = (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1]);
  const vx = (D[0] - A[0]) / Math.hypot(D[0] - A[0], D[1] - A[1]);
  const vz = (D[1] - A[1]) / Math.hypot(D[0] - A[0], D[1] - A[1]);
  const m = cell.mid;
  const ha = cell.sa / 2 - cell.half - 3;
  const hb = cell.sb / 2 - cell.half - 3;
  const yaw = Math.atan2(vx, vz);
  ctx.tryBuilding('chapel', m[0], m[1], 8, 13, yaw, { floors: 1, h: 6.5, roof: 'gable', roofH: 4, color: 0xd6cfbe, roofColor: 0x4a4a46, pad: 1 });
  for (let a = -ha + 4; a < ha - 3; a += 3.2) {
    for (let b = -hb + 4; b < hb - 3; b += 2.6) {
      if (Math.abs(a) < 9 && Math.abs(b) < 11) continue;
      if (rng.chance(0.15)) continue;
      ctx.decoration('gravestone', m[0] + ux * a + vx * b, m[1] + uz * a + vz * b, yaw + rng.range(-0.08, 0.08));
    }
  }
  for (let k = 0; k < 10; k++) ctx.tree(m[0] + ux * rng.range(-ha, ha) + vx * rng.pick([-hb + 1.5, hb - 1.5]), m[1] + uz * rng.range(-ha, ha) + vz * rng.pick([-hb + 1.5, hb - 1.5]), 0, rng.range(0.6, 0.85), { force: true });
  for (let e = 0; e < 4; e++) {
    const [a0, b0] = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]][e];
    const [a1, b1] = [[-ha, -hb], [ha, -hb], [ha, hb], [-ha, hb]][(e + 1) % 4];
    ctx.wallLine('stone_wall', m[0] + ux * a0 + vx * b0, m[1] + uz * a0 + vz * b0, m[0] + ux * a1 + vx * b1, m[1] + uz * a1 + vz * b1, 1.3, 0.5, 6, 0.06);
  }
}

function industrialLot(ctx, cell, sites) {
  const rng = ctx.rng;
  const [A, B, , D] = cell.P;
  const lab = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const lad = Math.hypot(D[0] - A[0], D[1] - A[1]);
  const ux = (B[0] - A[0]) / lab;
  const uz = (B[1] - A[1]) / lab;
  const vx = (D[0] - A[0]) / lad;
  const vz = (D[1] - A[1]) / lad;
  const m = cell.mid;
  const ha = lab / 2 - cell.half - 3;
  const hb = lad / 2 - cell.half - 3;
  const yaw = Math.atan2(vx, vz);
  rectU(ctx, m, ha + 2, hb + 2, ux, uz, MAT.CONCRETE);
  const big = rng.chance(0.55);
  if (big) {
    const f = ctx.tryBuilding('factory', m[0] - vx * 6, m[1] - vz * 6, Math.min(62, ha * 1.6), Math.min(36, hb * 1.2), yaw, { floors: 3, h: rng.range(9, 13), roof: rng.chance(0.4) ? 'gable' : 'flat', roofH: 2.4, color: rng.pick([0x9e9a90, 0xa39b8a, 0x8d8a82, 0x8f7a6a]), roofColor: 0x6a6f6d, pad: 1 });
    if (f && sites && !sites.factory) sites.factory = [f.x, f.z];
    if (rng.chance(0.6)) ctx.tryBuilding('chimney', m[0] + ux * (ha - 6) + vx * (hb - 6), m[1] + uz * (ha - 6) + vz * (hb - 6), 3.2, 3.2, yaw, { floors: 1, h: rng.range(24, 34), roof: 'flat', color: 0x8c4f3a, pad: 0.5 });
  } else {
    for (let k = -1; k <= 1; k += 2) {
      ctx.tryBuilding('warehouse', m[0] + vx * k * hb * 0.45, m[1] + vz * k * hb * 0.45, Math.min(48, ha * 1.5), Math.min(18, hb * 0.7), yaw, { floors: 2, h: 8, roof: rng.chance(0.6) ? 'gable' : 'arch', roofH: 2.6, color: rng.pick([0x8c8f88, 0x9aa09a, 0x7f857e, 0x8a8478]), roofColor: 0x6a6f6d, pad: 1 });
    }
  }
  // Offices by the street, a workshop, container rows, loading-yard clutter.
  ctx.tryBuilding('office', m[0] + ux * (ha - 12) - vx * (hb - 7), m[1] + uz * (ha - 12) - vz * (hb - 7), 22, 11, yaw + Math.PI, { floors: rng.int(2, 3), roof: 'flat', color: rng.pick([0xc9c4b6, 0xb9b5aa, 0xd2c8b0]), pad: 0.8 });
  ctx.tryBuilding('garage', m[0] - ux * (ha - 9) - vx * (hb - 8), m[1] - uz * (ha - 9) - vz * (hb - 8), 14, 10, yaw, { floors: 1, h: 5, roof: 'flat', color: 0x9a948a, pad: 0.8 });
  const rowA = rng.range(-ha * 0.5, ha * 0.5);
  for (let k = 0; k < rng.int(3, 7); k++) ctx.prop('container', m[0] + ux * (rowA + k * 2.8) + vx * (hb - 5), m[1] + uz * (rowA + k * 2.8) + vz * (hb - 5), yaw + rng.range(-0.03, 0.03));
  for (let k = 0; k < 10; k++) {
    const x = m[0] + ux * rng.range(-ha, ha) + vx * rng.range(-hb, hb);
    const z = m[1] + uz * rng.range(-ha, ha) + vz * rng.range(-hb, hb);
    ctx.prop(rng.pick(['crates', 'fuel_drums', 'dumpster', 'crates', 'car', 'container']), x, z, yaw + rng.pick([0, Math.PI / 2]) + rng.range(-0.1, 0.1));
  }
  if (rng.chance(0.5)) ctx.prop('fuel_tank', m[0] - ux * (ha - 6) + vx * (hb - 4), m[1] - uz * (ha - 6) + vz * (hb - 4), yaw);
  // Perimeter fence with a gate.
  const kind = rng.chance(0.5) ? 'concrete_wall' : 'fence';
  const C = [[-ha - 1, -hb - 1], [ha + 1, -hb - 1], [ha + 1, hb + 1], [-ha - 1, hb + 1]];
  for (let e = 0; e < 4; e++) {
    if (rng.chance(0.25)) continue;
    const [a0, b0] = C[e];
    const [a1, b1] = C[(e + 1) % 4];
    ctx.wallLine(kind, m[0] + ux * a0 + vx * b0, m[1] + uz * a0 + vz * b0, m[0] + ux * a1 + vx * b1, m[1] + uz * a1 + vz * b1, kind === 'fence' ? 1.8 : 2.3, kind === 'fence' ? 0.15 : 0.35, 6, 0.12);
  }
}

function school(ctx, cell) {
  const rng = ctx.rng;
  const [A, B, , D] = cell.P;
  const lab = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const lad = Math.hypot(D[0] - A[0], D[1] - A[1]);
  const ux = (B[0] - A[0]) / lab;
  const uz = (B[1] - A[1]) / lab;
  const vx = (D[0] - A[0]) / lad;
  const vz = (D[1] - A[1]) / lad;
  const m = cell.mid;
  const yaw = Math.atan2(vx, vz);
  const ha = lab / 2 - cell.half - 3;
  const hb = lad / 2 - cell.half - 3;
  ctx.tryBuilding('school', m[0] - vx * (hb - 9), m[1] - vz * (hb - 9), Math.min(56, ha * 1.8), 13, yaw, { floors: 3, roof: 'flat', color: 0xd7c6a0, pad: 1 });
  ctx.tryBuilding('school', m[0] - ux * (ha - 8) - vx * (hb * 0.2), m[1] - uz * (ha - 8) - vz * (hb * 0.2), 12, 30, yaw, { floors: 2, roof: 'flat', color: 0xd2c19c, pad: 0.5 });
  // Sports pitch.
  const px = m[0] + ux * 6 + vx * hb * 0.25;
  const pz = m[1] + uz * 6 + vz * hb * 0.25;
  rectU(ctx, [px, pz], Math.min(30, ha - 4), Math.min(19, hb * 0.55), ux, uz, MAT.DRYGRASS);
  ctx.wallLine('fence', px - ux * 30 - vx * 20, pz - uz * 30 - vz * 20, px + ux * 30 - vx * 20, pz + uz * 30 - vz * 20, 2.2, 0.12, 6, 0.1);
  for (let k = 0; k < 5; k++) ctx.tree(m[0] + ux * rng.range(-ha, ha) - vx * (hb - 2), m[1] + uz * rng.range(-ha, ha) - vz * (hb - 2), 1, rng.range(0.7, 0.95), { force: true });
}

function park(ctx, cell) {
  const rng = ctx.rng;
  const m = cell.mid;
  const [A, B] = cell.P;
  const yaw = Math.atan2(B[0] - A[0], B[1] - A[1]);
  const r = Math.min(cell.sa, cell.sb) / 2 - cell.half - 2;
  ctx.paintCircle(m[0], m[1], r, MAT.GRASS, 0.05);
  ctx.paintRect(m[0], m[1], 1.4, r, yaw, MAT.DIRT);
  ctx.paintRect(m[0], m[1], r, 1.4, yaw, MAT.DIRT);
  for (let k = 0; k < 22; k++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(6, r - 2);
    ctx.tree(m[0] + Math.cos(a) * d, m[1] + Math.sin(a) * d, rng.chance(0.2) ? 0 : 1, rng.range(0.75, 1.15), { force: true });
  }
  for (let k = 0; k < 6; k++) ctx.tree(m[0] + rng.range(-r, r), m[1] + rng.range(-r, r), 3, rng.range(0.8, 1.3), { force: true });
  for (let k = 0; k < 4; k++) ctx.decoration('bench', m[0] + Math.cos(k * 1.57) * 5, m[1] + Math.sin(k * 1.57) * 5, yaw + k * 1.57);
  ctx.building('tower', m[0], m[1], 2.4, 2.4, yaw, { floors: 1, h: 4.5, roof: 'flat', color: 0xb5ab98 });
}

function supermarket(ctx, cell, sites) {
  const rng = ctx.rng;
  const [A, B, , D] = cell.P;
  const lab = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const lad = Math.hypot(D[0] - A[0], D[1] - A[1]);
  const ux = (B[0] - A[0]) / lab;
  const uz = (B[1] - A[1]) / lab;
  const vx = (D[0] - A[0]) / lad;
  const vz = (D[1] - A[1]) / lad;
  const m = cell.mid;
  const ha = lab / 2 - cell.half - 2;
  const hb = lad / 2 - cell.half - 2;
  const yaw = Math.atan2(vx, vz);
  rectU(ctx, m, ha, hb, ux, uz, MAT.CONCRETE);
  const st = ctx.tryBuilding('supermarket', m[0] - vx * (hb - 16), m[1] - vz * (hb - 16), Math.min(52, ha * 1.6), 28, yaw, { floors: 1, h: 6.5, roof: 'flat', color: 0xcdc8bc, pad: 1 });
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 8; k++) {
      if (!rng.chance(0.55)) continue;
      const a = (k - 3.5) * 3;
      const b = hb * 0.15 + i * 6.5;
      ctx.prop('car', m[0] + ux * a + vx * b, m[1] + uz * a + vz * b, yaw + (i % 2 ? Math.PI : 0) + rng.range(-0.1, 0.1));
    }
  }
  if (st) sites.market = [st.x, st.z];
}

// Lamps, parked cars, avenue trees and bus stops along a town street.
function streetFurniture(ctx, road, inTown, Rold, cx, cz) {
  const rng = ctx.rng;
  const pts = road.points;
  const half = road.width / 2;
  let acc = 0;
  let side = 1;
  for (let k = 1; k < pts.length - 2; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const ly = Math.atan2(dx, dz);
    if (!inTown(ax, az)) continue;
    acc += l;
    const oldTown = Math.hypot(ax - cx, az - cz) < Rold;
    if (acc >= 24) {
      acc = 0;
      side = -side;
      ctx.decoration('street_lamp', ax + nx * (half + 1.2) * side, az + nz * (half + 1.2) * side, ly + (side > 0 ? Math.PI / 2 : -Math.PI / 2));
      if (road.main && !oldTown && rng.chance(0.9)) {
        for (const sd of [-1, 1]) ctx.tree(ax + nx * (half + 1.7) * sd, az + nz * (half + 1.7) * sd, 1, rng.range(0.65, 0.85), { force: true });
      }
      if (road.main && rng.chance(0.1)) ctx.decoration('bus_stop', ax - nx * (half + 1.6) * side, az - nz * (half + 1.6) * side, ly + (side > 0 ? -Math.PI / 2 : Math.PI / 2));
    }
    if (k > 2 && k < pts.length - 4 && rng.chance(oldTown ? 0.1 : 0.07)) {
      const sd = rng.pick([-1, 1]);
      ctx.prop(rng.chance(0.08) ? 'car_wreck' : 'car', ax + nx * (half - 1.25) * sd, az + nz * (half - 1.25) * sd, ly + (sd > 0 ? 0 : Math.PI), { check: false });
    }
  }
}
