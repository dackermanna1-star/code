// =============================================================================
// PORT SOLANO — the arrival coastal city (arrival-region local coordinates:
// x east, z south, origin = arrival airport reference point).
//
// Layout (see geo.js): the sea is to the west (shore ~6.6-7.2 km west of the
// airport), the city zone ARR_CITY lies north of the airport. The street grid
// follows the terrain's 128 m urban lattice (world multiples of 128 m) so the
// buildings sit in the lots the terrain paints.
//
//   * downtown towers around ARR_DOWNTOWN, mid-rise ring, waterfront condos
//   * dense low-rise suburbs (instanced houses, pools, yard trees), parks, stadium
//   * container port + marina + pier + beach promenade with palms
//   * highways: coastal H1 (N-S), H2 along the south edge with the airport spur,
//     H3 crosstown; diamond interchanges with flyovers; arterial grid
//   * night: lit windows, sodium / LED street lights, car light streams,
//     aircraft warning lights
//
// Written as a generator (yields between chunks) so it can be built over
// several frames without a hitch.
// =============================================================================
import * as THREE from 'three';
import { ARR_CITY, ARR_DOWNTOWN, ARR_PORT } from '../geo.js';
import { GeoBuilder, ST, rng, lin, scalec, mixc, chaikin, resample, sstep, clamp, hash2 } from './util.js';
import { InstanceSet, HOUSE_LAYOUT, TREE_LAYOUT, pushHouse, pushTree } from './shapes.js';
import { RoadNet, ROAD, LightSet, lightsAlong, LAMP } from './roads.js';
import { Traffic } from './traffic.js';
import { tower, midrise, lowCommercial, STUCCO, ROOF_FLAT } from './buildings.js';
import { buildPort, buildMarina, buildPier, buildStadium, buildBeach } from './landmarks.js';

const BLK = 128;

export const ROOF_TILE = [lin('#9a4a2c'), lin('#a55634'), lin('#8a3f26'), lin('#b0603a'), lin('#7f4a35'), lin('#93533a')];
export const ROOF_SHINGLE = [lin('#4a4846'), lin('#5b5651'), lin('#3c3d40'), lin('#6b6158'), lin('#56493f'), lin('#71706b')];
export const TREE_COLS = [lin('#3d5a26'), lin('#4a6a2c'), lin('#35502a'), lin('#56702f'), lin('#2f4a24'), lin('#5d6b33'), lin('#47602f')];

export function* buildArrival(ctx) {
  const { land, detail } = ctx;
  const r = rng(4721 + ((land.ax | 0) & 0xffff));
  const D = clamp(detail, 0, 3);
  const budget = {
    houses: [7000, 14000, 24000, 34000][D],
    trees: [6000, 12000, 22000, 32000][D],
    lampSpacing: [56, 46, 38, 34][D],
    plant: [0.4, 0.7, 1, 1.2][D],
  };
  const B = new GeoBuilder(1 << 17);
  const houses = new InstanceSet(HOUSE_LAYOUT, 8192);
  const hips = new InstanceSet(HOUSE_LAYOUT, 4096);
  const trees = new InstanceSet(TREE_LAYOUT, 8192);
  const palms = new InstanceSet(TREE_LAYOUT, 1024);
  const lights = new LightSet();
  const roads = new RoadNet(land);
  const traffic = new Traffic('arrival');

  // ------------------------------------------------------------------ geometry anchors
  const shoreAt = (z) => land.shoreX(z);
  const smoothShore = (z) => { let s = 0; for (let k = -4; k <= 4; k++) s += shoreAt(z + k * 320); return s / 9; };
  const lx0 = (((-land.ax) % BLK) + BLK) % BLK, lz0 = (((-land.az) % BLK) + BLK) % BLK;
  const DT = ARR_DOWNTOWN;
  // port: quay line along the shore around ARR_PORT
  const portZ0 = ARR_PORT.z + 900, portZ1 = ARR_PORT.z - 1100;      // south / north ends (z decreasing = north)
  let quayX = Infinity;
  for (let z = portZ1; z <= portZ0; z += 50) quayX = Math.min(quayX, shoreAt(z));
  quayX = Math.round(quayX - 25);
  const port = { x0: quayX, x1: quayX + 640, z0: portZ1, z1: portZ0 };

  // ------------------------------------------------------------------ highways
  const H1x = (z) => smoothShore(z) + 1000;
  const h1pts = [];
  for (let z = 16000; z >= -26000; z -= 400) {
    let x = H1x(z);
    if (z < port.z1 + 300 && z > port.z0 - 300) x = Math.max(x, port.x1 + 120);
    h1pts.push([x, z]);
  }
  const H1 = chaikin(h1pts, 2);
  const h1At = (z) => {     // x of H1 at z (polyline is monotonic in z)
    for (let i = 1; i < H1.length; i++) {
      const a = H1[i - 1], b = H1[i];
      if ((z <= a[1] && z >= b[1])) { const t = (z - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t; }
    }
    return H1x(z);
  };
  const zH2 = -2100, zH3 = -6050;
  const xc2 = h1At(zH2), xc3 = h1At(zH3);
  const bridge = (xc, ramp = 300, flat = 70, hgt = 8.5) => (x) => hgt * sstep(0, 1, 1 - (Math.abs(x - xc) - flat) / ramp);
  const br2 = bridge(xc2), br3 = bridge(xc3);
  // dense highway sample points for block exclusion
  const hwyPts = [];
  const addHwyPts = (line, rad) => { for (const p of line) hwyPts.push([p.x, p.z, rad]); };
  const HWY = { type: ROAD.HIGHWAY, lanes: 3, med: 1.6, step: 15, infra: B };
  const h1Line = roads.add(H1, { ...HWY });
  addHwyPts(h1Line, 70);
  const h2Line = roads.add([[xc2 - 520, zH2], [xc2, zH2], [14000, zH2]], { ...HWY, elev: (s) => br2(xc2 - 520 + s) });
  addHwyPts(h2Line, 70);
  const h3Line = roads.add([[xc3 - 420, zH3], [xc3, zH3], [14500, zH3 + 300]], { ...HWY, elev: (s) => br3(xc3 - 420 + s) });
  addHwyPts(h3Line, 70);
  yield;
  // airport spur (fork from H2 to the terminal access roads) — 2 lanes each way
  const spurA = roads.add(chaikin([[300, zH2 + 20], [-200, zH2 + 60], [-520, -1700], [-570, -1400], [-570, -960]], 3), { type: ROAD.HIGHWAY, lanes: 2, med: 1.0, step: 12 });
  const spurB = roads.add(chaikin([[-1500, zH2 + 20], [-900, zH2 + 80], [-620, -1700], [-575, -1450]], 3), { type: ROAD.HIGHWAY, lanes: 1, med: 0.2, step: 12 });
  addHwyPts(spurA, 40); addHwyPts(spurB, 30);
  // diamond interchange ramps at H1 x H2 and H1 x H3
  const ramps = [];
  for (const [xc, zc] of [[xc2, zH2], [xc3, zH3]]) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pts = chaikin([[xc + sx * 22, zc + sz * 520], [xc + sx * 48, zc + sz * 300], [xc + sx * 70, zc + sz * 110], [xc + sx * 160, zc + sz * 40], [xc + sx * 380, zc + sz * 22]], 3);
        const line = roads.add(pts, { type: ROAD.HIGHWAY, lanes: 1, med: 0.0, hw: 5.5, step: 10, infra: B,
          elev: (s, L) => 6.5 * sstep(0.35, 0.8, s / L) * (1 - sstep(0.9, 1.0, s / L)) });
        ramps.push({ line, dir: (sx * sz > 0) ? 1 : -1 });
        addHwyPts(line, 30);
      }
    }
  }
  yield;
  // spatial hash for highway clearance
  const HG = 200, hgrid = new Map();
  for (const p of hwyPts) {
    const k = `${Math.floor(p[0] / HG)},${Math.floor(p[1] / HG)}`;
    if (!hgrid.has(k)) hgrid.set(k, []);
    hgrid.get(k).push(p);
  }
  const nearHighway = (x, z, extra = 0) => {
    const gx = Math.floor(x / HG), gz = Math.floor(z / HG);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const L = hgrid.get(`${gx + i},${gz + j}`);
      if (!L) continue;
      for (const p of L) if (Math.abs(p[0] - x) < p[2] + extra && Math.abs(p[1] - z) < p[2] + extra) return true;
    }
    return false;
  };

  // ------------------------------------------------------------------ zones
  const park = { x0: -1700, x1: -700, z0: -10900, z1: -9300 };
  const stadium = { x: -700, z: -7350 };
  const zoneOf = (cx, cz) => {
    const dxs = cx < DT.x ? (cx - DT.x) * 0.72 : (cx - DT.x);
    const dDT = Math.hypot(dxs, (cz - DT.z) * 0.9);
    const shoreD = cx - shoreAt(cz);
    if (cx > park.x0 && cx < park.x1 && cz > park.z0 && cz < park.z1) return 'park';
    if (Math.hypot(cx - stadium.x, cz - stadium.z) < 230) return 'stadium';
    if (dDT < 1150) return 'tower';
    if (cz > -3600 && cx < -1200) return 'industrial';
    if (cz > port.z1 - 900 && shoreD < 1500) return 'industrial';
    if (shoreD < 950 && cz < port.z1 - 900) return 'waterfront';
    if (dDT < 2300) return 'mid';
    if (dDT < 3300) return r() < 0.55 ? 'midlow' : 'suburb';
    return 'suburb';
  };

  // ------------------------------------------------------------------ block scan
  const blocks = [];
  const iMin = Math.floor((ARR_CITY.xMin - 1500 - lx0) / BLK), iMax = Math.floor((ARR_CITY.xMax - lx0) / BLK);
  const jMin = Math.floor((ARR_CITY.zMin + 300 - lz0) / BLK), jMax = Math.floor((-2180 - lz0) / BLK);
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const x0 = lx0 + i * BLK, z0 = lz0 + j * BLK, cx = x0 + BLK / 2, cz = z0 + BLK / 2;
      // ragged outer edge
      const edgeN = hash2(i * 3 + 7, j * 5 + 1);
      if (cx > ARR_CITY.xMax - 700 * edgeN) continue;
      if (cz < ARR_CITY.zMin + 500 + 900 * hash2(i, j + 99)) continue;
      if (cx - shoreAt(cz) < 230 || cx - shoreAt(z0) < 200 || cx - shoreAt(z0 + BLK) < 200) continue;
      if (land.water(cx, cz) > 0.001 || land.water(x0, z0) > 0.001 || land.water(x0 + BLK, z0 + BLK) > 0.001) continue;
      if (land.airportDist(cx, cz) < 650) continue;
      if (cx > port.x0 - 100 && cx < port.x1 + 40 && cz > port.z0 - 60 && cz < port.z1 + 60) continue;
      if (nearHighway(cx, cz, 30)) continue;
      blocks.push({ i, j, x0, z0, cx, cz, zone: zoneOf(cx, cz), art: (i % 6 === 0) || (i % 6 === 5) || (j % 6 === 0) || (j % 6 === 5) });
    }
  }
  yield;

  // arterials on every 6th lattice line (clipped to built land)
  const blockSet = new Set(blocks.map((b) => `${b.i},${b.j}`));
  const has = (i, j) => blockSet.has(`${i},${j}`);
  const arterials = [];
  for (let i = iMin; i <= iMax + 1; i++) {
    if (((i % 6) + 6) % 6 !== 0) continue;
    let run = null;
    const x = lx0 + i * BLK;
    for (let j = jMin; j <= jMax + 1; j++) {
      const ok = has(i - 1, j) || has(i, j);
      if (ok) { if (!run) run = [[x, lz0 + j * BLK]]; run[1] = [x, lz0 + (j + 1) * BLK]; }
      else if (run) { arterials.push(run); run = null; }
    }
    if (run) arterials.push(run);
  }
  for (let j = jMin; j <= jMax + 1; j++) {
    if (((j % 6) + 6) % 6 !== 0) continue;
    let run = null;
    const z = lz0 + j * BLK;
    for (let i = iMin; i <= iMax + 1; i++) {
      const ok = has(i, j - 1) || has(i, j);
      if (ok) { if (!run) run = [[lx0 + i * BLK, z]]; run[1] = [lx0 + (i + 1) * BLK, z]; }
      else if (run) { arterials.push(run); run = null; }
    }
    if (run) arterials.push(run);
  }
  const artLines = [];
  for (const a of arterials) {
    if (Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) < 380) continue;
    const line = roads.add(a, { type: ROAD.ARTERIAL, lanes: 2, med: 1.8, step: 16 });
    artLines.push(line);
    const L = line[line.length - 1]?.s || 0;
    // downtown arterials get white LED, the rest high-pressure sodium
    const mid = line[Math.floor(line.length / 2)];
    const led = Math.hypot(mid.x - DT.x, mid.z - DT.z) < 2600 || hash2(Math.round(mid.x), Math.round(mid.z)) < 0.3;
    lightsAlong(lights, line, { spacing: 34, offset: 10.5, both: true, height: 10, color: led ? LAMP.led : LAMP.sodium, E: led ? 34 : 40, size: 1.3 });
    if (L > 600) {
      const row = traffic.addPath(line);
      traffic.populate(row, [
        { lateral: 1.8 + 1.8, dir: 1, speed: 14, spacing: 95 }, { lateral: 1.8 + 5.4, dir: 1, speed: 12, spacing: 140 },
        { lateral: 1.8 + 1.8, dir: -1, speed: 14, spacing: 95 }, { lateral: 1.8 + 5.4, dir: -1, speed: 12, spacing: 140 },
      ], r, { truckShare: 0.05, busShare: 0.05 });
    }
  }
  yield;

  // highway lights + traffic
  for (const line of [h1Line, h2Line, h3Line]) {
    lightsAlong(lights, line, { spacing: 48, median: true, height: 13, color: LAMP.led, E: 46, size: 1.6 });
    const row = traffic.addPath(line);
    const lanes = [];
    for (let k = 0; k < 3; k++) for (const dir of [1, -1]) lanes.push({ lateral: 1.6 + 1.8 + 3.6 * k, dir, speed: 31 - k * 3.5, spacing: 46 + k * 18 });
    traffic.populate(row, lanes, r, { truckShare: 0.16, busShare: 0.01 });
  }
  for (const line of [spurA]) {
    lightsAlong(lights, line, { spacing: 44, median: true, height: 12, color: LAMP.led, E: 40, size: 1.4 });
    const row = traffic.addPath(line);
    traffic.populate(row, [{ lateral: 2.8, dir: 1, speed: 20, spacing: 70 }, { lateral: 6.4, dir: 1, speed: 18, spacing: 110 }, { lateral: 2.8, dir: -1, speed: 20, spacing: 70 }, { lateral: 6.4, dir: -1, speed: 18, spacing: 110 }], r, { truckShare: 0.03, busShare: 0.08 });
  }
  for (const { line, dir } of ramps) {
    const row = traffic.addPath(line);
    traffic.populate(row, [{ lateral: 0, dir, speed: 16, spacing: 120 }], r, { truckShare: 0.1 });
    lightsAlong(lights, line, { spacing: 50, offset: 6, height: 10, color: LAMP.led, E: 34 });
  }
  yield;

  // ------------------------------------------------------------------ blocks -> buildings
  // importance (for the house budget): close to the airport / approach and to downtown
  const imp = (b) => Math.min(Math.hypot(b.cx + 1800, b.cz + 1800) * 0.8, Math.hypot(b.cx - DT.x, b.cz - DT.z) * 1.1, Math.hypot(b.cx - shoreAt(b.cz), 0) * 2.0 + 1500);
  const sub = blocks.filter((b) => b.zone === 'suburb' || b.zone === 'midlow');
  sub.sort((a, b) => imp(a) - imp(b));
  let housesLeft = budget.houses;
  const subRank = new Map();
  sub.forEach((b, k) => subRank.set(b, k));
  const nSub = sub.filter((b) => b.zone === 'suburb').length;
  const perBlockFull = 12;
  // full density for the most important blocks, sparse beyond
  const fullBlocks = Math.min(nSub, Math.floor(budget.houses * 0.75 / perBlockFull));
  const sparseHouses = Math.max(2, Math.floor((budget.houses * 0.25) / Math.max(1, nSub - fullBlocks)));
  let treesLeft = budget.trees;
  let towers = 0;
  const streetEdges = new Map();
  const addEdge = (key, x0, z0, x1, z1, led) => { if (!streetEdges.has(key)) streetEdges.set(key, [x0, z0, x1, z1, led]); };

  let k = 0;
  for (const b of blocks) {
    if (++k % 120 === 0) yield;
    const { x0, z0, cx, cz } = b;
    const inset = 10;               // street half width + sidewalk
    const ix0 = x0 + inset, iz0 = z0 + inset, ix1 = x0 + BLK - inset, iz1 = z0 + BLK - inset;
    const W = ix1 - ix0;
    const hb = hash2(b.i * 31 + 5, b.j * 17 + 3);
    const ground = (x, z) => land.h(x, z);
    const ledBlock = b.zone === 'tower' || b.zone === 'mid';
    // street edges (for street lights)
    addEdge(`x${b.i},${b.j}`, x0, z0, x0 + BLK, z0, ledBlock);
    addEdge(`x${b.i},${b.j + 1}`, x0, z0 + BLK, x0 + BLK, z0 + BLK, ledBlock);
    addEdge(`z${b.i},${b.j}`, x0, z0, x0, z0 + BLK, ledBlock);
    addEdge(`z${b.i + 1},${b.j}`, x0 + BLK, z0, x0 + BLK, z0 + BLK, ledBlock);

    if (b.zone === 'park' || (b.zone === 'suburb' && hb < 0.045)) {
      // lawn + dense trees + paths
      const y = ground(cx, cz);
      B.setStyle(ST.GRASS, hb * 100, 3, 3).setColor(lin('#4f6b33'));
      lawn(B, land, ix0 - 4, iz0 - 4, ix1 + 4, iz1 + 4);
      const nT = Math.min(treesLeft, b.zone === 'park' ? 34 : 22);
      for (let t = 0; t < nT; t++) {
        const tx = ix0 + r() * W, tz = iz0 + r() * W;
        if (r() < 0.3 && Math.abs(tx - cx) < 6) continue;
        pushTree(trees, tx, ground(tx, tz) - 0.3, tz, 8 + r() * 9, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.8 + r() * 0.5);
        treesLeft--;
      }
      void y;
      continue;
    }
    if (b.zone === 'stadium') continue;

    if (b.zone === 'tower') {
      const dxs = cx < DT.x ? (cx - DT.x) * 0.72 : (cx - DT.x);
      const d = Math.hypot(dxs, (cz - DT.z) * 0.9) / 1150;
      // two-by-two lots
      for (let q = 0; q < 4; q++) {
        const qx = ix0 + (q & 1) * W / 2 + W / 4, qz = iz0 + (q >> 1) * W / 2 + W / 4;
        const y0 = land.hMin(qx, qz, W / 4, W / 4);
        const pTower = 0.62 * (1 - d) + 0.12;
        if (towers < 58 && r() < pTower) {
          towers++;
          const H = 60 + 225 * Math.pow(Math.max(0, 1 - d), 1.35) * (0.5 + 0.5 * r()) + (r() < 0.08 ? 50 : 0);
          const fw = 12 + r() * 9 + H * 0.025, fd = 12 + r() * 9 + H * 0.025;
          tower(B, lights, r, { x: qx, z: qz, y0, hw: Math.min(fw, W / 4 - 1), hd: Math.min(fd, W / 4 - 1), H, rot: 0, kind: r() < 0.7 ? 'office' : 'resid', podHW: W / 4 - 1, podHD: W / 4 - 1 });
        } else {
          midrise(B, r, { x: qx, z: qz, y0, hw: W / 4 - 1 - r() * 3, hd: W / 4 - 1 - r() * 3, floors: 6 + Math.floor(r() * 14 * (1 - d * 0.5)), kind: r() < 0.3 ? 'resid' : 'office' });
        }
      }
      continue;
    }
    if (b.zone === 'mid' || b.zone === 'waterfront') {
      const wf = b.zone === 'waterfront';
      const n = r() < 0.5 ? 2 : 4;
      for (let q = 0; q < n; q++) {
        let qx, qz, hw, hd;
        if (n === 2) {
          const alongX = r() < 0.5;
          qx = alongX ? ix0 + (q + 0.5) * W / 2 : cx; qz = alongX ? cz : iz0 + (q + 0.5) * W / 2;
          hw = alongX ? W / 4 - 3 : W / 2 - 4; hd = alongX ? W / 2 - 4 : W / 4 - 3;
          if (alongX) hd *= 0.55 + r() * 0.4; else hw *= 0.55 + r() * 0.4;
        } else {
          qx = ix0 + (q & 1) * W / 2 + W / 4; qz = iz0 + (q >> 1) * W / 2 + W / 4;
          hw = W / 4 - 2 - r() * 6; hd = W / 4 - 2 - r() * 6;
        }
        const y0 = land.hMin(qx, qz, hw, hd);
        const dd = Math.hypot(cx - DT.x, cz - DT.z);
        const floors = wf ? 4 + Math.floor(r() * (r() < 0.2 ? 18 : 8)) : Math.max(3, Math.round(4 + r() * 9 * clamp(1.6 - dd / 2400, 0.3, 1.2)));
        if (wf && r() < 0.06 && towers < 64) {
          towers++;
          tower(B, lights, r, { x: qx, z: qz, y0, hw: Math.min(hw, 18), hd: Math.min(hd, 18), H: 70 + r() * 70, kind: 'resid', podHW: hw, podHD: hd });
        } else midrise(B, r, { x: qx, z: qz, y0, hw, hd, floors, kind: wf || r() < 0.4 ? 'resid' : 'office' });
      }
      if (wf) {
        for (let t = 0; t < 6; t++) {
          const tx = ix0 + r() * W, tz = (r() < 0.5 ? iz0 + 2 : iz1 - 2);
          pushTree(palms, tx, ground(tx, tz) - 0.2, tz, 11 + r() * 7, mixc(lin('#4f6a2b'), lin('#6c7a35'), r()), 1);
        }
      }
      continue;
    }
    if (b.zone === 'industrial') {
      const n = r() < 0.5 ? 1 : 2;
      for (let q = 0; q < n; q++) {
        const alongX = r() < 0.5;
        const qx = n === 1 ? cx : (alongX ? ix0 + (q + 0.5) * W / 2 : cx), qz = n === 1 ? cz : (alongX ? cz : iz0 + (q + 0.5) * W / 2);
        const hw = (n === 1 || !alongX ? W / 2 - 6 : W / 4 - 4) * (0.7 + r() * 0.3), hd = (n === 1 || alongX ? W / 2 - 6 : W / 4 - 4) * (0.6 + r() * 0.35);
        lowCommercial(B, r, { x: qx, z: qz, y0: land.hMin(qx, qz, hw, hd), hw, hd, industrial: true });
      }
      // trucks parked / loading docks implied; a few trees at the edges
      continue;
    }
    // ---- suburbs (and mid-low mixed): houses, pools, yard trees
    if (b.zone === 'midlow' && r() < 0.6) {
      for (let q = 0; q < 4; q++) {
        const qx = ix0 + (q & 1) * W / 2 + W / 4, qz = iz0 + (q >> 1) * W / 2 + W / 4;
        const hw = W / 4 - 3 - r() * 8, hd = W / 4 - 3 - r() * 8;
        if (r() < 0.25) lowCommercial(B, r, { x: qx, z: qz, y0: land.hMin(qx, qz, hw, hd), hw, hd });
        else midrise(B, r, { x: qx, z: qz, y0: land.hMin(qx, qz, hw, hd), hw, hd, floors: 3 + Math.floor(r() * 4), kind: 'resid' });
      }
      continue;
    }
    // commercial strip along arterials
    if (b.art && r() < 0.5) {
      const n = 2 + Math.floor(r() * 2);
      for (let q = 0; q < n; q++) {
        const qx = ix0 + (q + 0.5) * W / n, qz = cz + (r() - 0.5) * 20;
        const hw = W / n / 2 - 3, hd = 18 + r() * 22;
        lowCommercial(B, r, { x: qx, z: qz, y0: land.hMin(qx, qz, hw, hd), hw, hd });
      }
      continue;
    }
    const rank = subRank.get(b) ?? 1e9;
    let target = rank < fullBlocks ? perBlockFull : sparseHouses;
    target = Math.min(target, housesLeft);
    if (target <= 0) continue;
    const rowsAlongX = (hb < 0.5);
    const lotsPerRow = Math.max(1, Math.round(target / 2));
    const lotW = W / lotsPerRow;
    const styleSeed = hash2(b.i, b.j * 3 + 1);
    const tileRoofs = styleSeed < 0.68;                         // Spanish tile neighbourhoods vs. shingles
    for (let side = 0; side < 2; side++) {
      for (let l = 0; l < lotsPerRow; l++) {
        if (housesLeft <= 0) break;
        if (r() < 0.06) continue;                            // empty lot
        const along = (rowsAlongX ? ix0 : iz0) + (l + 0.5) * lotW;   // along the row
        const a0 = rowsAlongX ? iz0 : ix0, a1 = rowsAlongX ? iz1 : ix1;  // across the row
        const setback = 7 + r() * 4;
        const w = Math.min(lotW - 3.5, 9.5 + r() * 6), d = 9 + r() * 4;
        const across = side === 0 ? a0 + setback + d / 2 : a1 - setback - d / 2;
        const jitter = (r() - 0.5) * 1.5;
        const hx = rowsAlongX ? along + jitter : across, hz = rowsAlongX ? across : along + jitter;
        const floors = r() < 0.45 ? 2 : 1;
        const wallH = floors === 2 ? 5.6 + r() * 0.5 : 3.0 + r() * 0.3;
        const ridgeAlong = r() < 0.7;
        const rot = (rowsAlongX ? 0 : Math.PI / 2) + (ridgeAlong ? 0 : Math.PI / 2) + (r() - 0.5) * 0.03;
        const hw = ridgeAlong ? w : d, hd = ridgeAlong ? d : w;
        const rise = (tileRoofs ? 0.28 : 0.42) * hd * 0.5 * (0.85 + r() * 0.3);
        const y = land.hMin(hx, hz, hw / 2, hd / 2) - 0.6;
        const wall = STUCCO[Math.floor(r() * STUCCO.length)];
        const roof = tileRoofs ? ROOF_TILE[Math.floor(r() * ROOF_TILE.length)] : ROOF_SHINGLE[Math.floor(r() * ROOF_SHINGLE.length)];
        const set = r() < 0.32 ? hips : houses;
        pushHouse(set, hx, y, hz, hw, wallH + 0.6, hd, r() < 0.06 ? 0.05 : rise, rot, wall, scalec(roof, 0.9 + r() * 0.2), r() * 1000, ST.RESID, ST.PITCHED);
        housesLeft--;
        // attached garage (flat roof) beside the house, along the row
        if (lotW > w + 8 && r() < 0.5) {
          const off = (w / 2 + 3.3) * (r() < 0.5 ? -1 : 1);
          const gx = rowsAlongX ? hx + off : hx, gz = rowsAlongX ? hz : hz + off;
          pushHouse(houses, gx, y, gz, 6, 3.4, 6.5, 0.05, rowsAlongX ? 0 : Math.PI / 2, wall, ROOF_FLAT[Math.floor(r() * 3)], r() * 1000, ST.PLAIN, ST.ROOF);
        }
        // back-yard pool (coastal suburbs)
        const backDir = side === 0 ? 1 : -1;
        const byx = rowsAlongX ? hx + (r() - 0.5) * 4 : hx + backDir * (d / 2 + 6), byz = rowsAlongX ? hz + backDir * (d / 2 + 6) : hz + (r() - 0.5) * 4;
        if (r() < (tileRoofs ? 0.42 : 0.18)) {
          const py = land.h(byx, byz) + 0.12;
          const pw = 2 + r() * 1.5, pd = 4 + r() * 2.5;
          B.setStyle(ST.POOL, r() * 100, 3, 3).setColor(lin('#2a9fb5'));
          B.box(byx, byz, py - 0.1, py, rowsAlongX ? pd : pw, rowsAlongX ? pw : pd, 0, { roofStyle: ST.POOL, walls: false });
          B.setStyle(ST.PLAIN, 1, 3, 3).setColor(lin('#d8d2c4'));
          B.box(byx, byz, py - 0.2, py - 0.05, (rowsAlongX ? pd : pw) + 1.2, (rowsAlongX ? pw : pd) + 1.2, 0, { roofStyle: ST.PLAIN, walls: false });
        } else if (treesLeft > 0 && r() < 0.8) {
          pushTree(trees, byx, land.h(byx, byz) - 0.3, byz, 6 + r() * 8, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.8 + r() * 0.5);
          treesLeft--;
        }
      }
    }
    // street trees on two edges
    if (treesLeft > 0) {
      const nt = r() < 0.5 ? 4 : 2;
      for (let t = 0; t < nt; t++) {
        const e = r();
        const tx = rowsAlongX ? ix0 + e * W : (t & 1 ? ix0 - 3 : ix1 + 3), tz = rowsAlongX ? (t & 1 ? iz0 - 3 : iz1 + 3) : iz0 + e * W;
        pushTree(trees, tx, land.h(tx, tz) - 0.3, tz, 7 + r() * 6, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.9 + r() * 0.3);
        treesLeft--;
      }
    }
  }
  yield;

  // ------------------------------------------------------------------ street lights on the local grid
  const sp = budget.lampSpacing;
  let flip = 0;
  for (const [, e] of streetEdges) {
    const [x0, z0, x1, z1, led] = e;
    const L = Math.hypot(x1 - x0, z1 - z0);
    const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const nx = -dz, nz = dx;
    const n = Math.max(1, Math.round(L / sp));
    flip++;
    for (let q = 0; q < n; q++) {
      const s = (q + 0.5) * L / n;
      const side = ((q + flip) & 1) ? 1 : -1;
      const x = x0 + dx * s + nx * 6.5 * side, z = z0 + dz * s + nz * 6.5 * side;
      if (land.water(x, z) > 0.001) continue;
      const y = land.h(x, z) + 8;
      const col = led ? LAMP.led : (hash2(Math.round(x0), Math.round(z0)) < 0.18 ? LAMP.mercury : LAMP.sodium);
      lights.add(x, y, z, scalec(col, led ? 26 : 30), 1.0, 0);
    }
  }
  yield;

  // ------------------------------------------------------------------ waterfront promenade, beach, pier, marina, port, stadium
  const promPts = [];
  for (let z = port.z1 - 300; z >= -15200; z -= 250) promPts.push([smoothShore(z) + 210, z]);
  const prom = roads.add(chaikin(promPts, 2), { type: ROAD.ARTERIAL, lanes: 1, med: 2.5, step: 14 });
  lightsAlong(lights, prom, { spacing: 30, offset: 9, both: true, height: 7, color: [1.0, 0.82, 0.6], E: 34, size: 1.0 });
  {
    const row = traffic.addPath(prom);
    traffic.populate(row, [{ lateral: 4.3, dir: 1, speed: 10, spacing: 90 }, { lateral: 4.3, dir: -1, speed: 10, spacing: 90 }], r, { truckShare: 0.0, busShare: 0.04 });
  }
  // palms along the promenade (both sides)
  for (let i = 0; i < prom.length; i += 2) {
    const p = prom[i];
    for (const side of [-1, 1]) {
      const x = p.x - p.tz * 12 * side, z = p.z + p.tx * 12 * side;
      if (land.water(x, z) > 0.001) continue;
      pushTree(palms, x, land.h(x, z) - 0.2, z, 12 + r() * 6, mixc(lin('#4f6a2b'), lin('#6c7a35'), r()), 1);
    }
  }
  yield;
  buildBeach(B, land, r, lights, palms, { z0: port.z1 - 500, z1: -14500, shoreAt, detail: D });
  buildPier(B, roads, lights, land, r, { z: -8350, shoreAt });
  yield;
  buildMarina(B, houses, lights, land, r, { z0: -9750, z1: -10650, shoreAt });
  yield;
  buildPort(B, houses, lights, land, r, { ...port, detail: D, traffic, roads });
  yield;
  buildStadium(B, lights, land, r, stadium);
  yield;

  // ------------------------------------------------------------------ meshes
  const M = ctx.mats;
  const out = [];
  const push = (m) => { if (m) out.push(m); };
  push(roads.build(M.road, 'arrival.roads'));
  push(Object.assign(new THREE.Mesh(B.build(), M.bld), { name: 'arrival.buildings', matrixAutoUpdate: false }));
  push(houses.build(ctx.unit.gable, M.inst, 'arrival.houses'));
  push(hips.build(ctx.unit.hip, M.inst, 'arrival.housesHip'));
  push(trees.build(ctx.unit.broadleaf, M.tree, 'arrival.trees'));
  push(palms.build(ctx.unit.palm, M.tree, 'arrival.palms'));
  push(lights.build(M.points, 'arrival.lights'));
  const tr = traffic.build();
  if (tr) { push(tr.bodies); push(tr.lights); }
  return {
    objects: out, traffic,
    stats: { blocks: blocks.length, towers, houses: houses.count + hips.count, trees: trees.count + palms.count, lights: lights.count, vehicles: tr?.count || 0, verts: B.vertexCount },
  };
}

/** Lawn patch conforming to the terrain (4x4 grid). */
export function lawn(B, land, x0, z0, x1, z1, lift = 0.15) {
  const n = 4;
  const P = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * j / n;
    P.push([x, land.h(x, z) + lift, z]);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = P[j * (n + 1) + i], b = P[j * (n + 1) + i + 1], c = P[(j + 1) * (n + 1) + i + 1], d = P[(j + 1) * (n + 1) + i];
    B.quad(d, c, b, a, [d[0], d[2], c[0], c[2], b[0], b[2], a[0], a[2]]);
  }
}
export { resample };
