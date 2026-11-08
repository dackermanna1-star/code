// =============================================================================
// CEDAR BAY — the departure region (departure-local coordinates = world, the
// departure airport is the world origin; x east, z south).
//
//   * farmsteads exactly where the terrain shader paints farm yards (port of its
//     section hash): farmhouse, barns, machine shed, silos / grain bins, yard
//     light, shelter-belt conifers
//   * the small town of Cedar Bay at DEP_TOWN: brick main street, church spire,
//     water tower, grain elevator by the railway, school, leafy residential grid
//   * highway south of the airport (diamond interchange), county / airport
//     roads, railway with a freight train, all with moving traffic
//   * 220 kV power line on lattice pylons, wind farm on the northern hills
//     (rotating rotors, synchronised red obstruction lights), lake cabins at
//     the Cedar Bay reservoir (DEP_LAKE)
// =============================================================================
import * as THREE from 'three';
import { DEP_TOWN, DEP_LAKE, AIRPORT_FLAT } from '../geo.js';
import { GeoBuilder, ST, NO_SHADOW, ticker, rng, lin, scalec, mixc, chaikin, hash2, hash12, clamp, sstep } from './util.js';
import { InstanceSet, HOUSE_LAYOUT, TREE_LAYOUT, pushHouse, pushTree } from './shapes.js';
import { RoadNet, ROAD, LightSet, lightsAlong, LAMP } from './roads.js';
import { Traffic, CAR_COLORS } from './traffic.js';
import { BRICK, ROOF_FLAT, roofPlant, lowCommercial } from './buildings.js';
import { lawn, TREE_COLS } from './arrival.js';
import { CITY_U, CURVE_GLSL } from './materials.js';
import { shadowMesh } from './shadows.js';

const BLK = 128;
const SIDING = [lin('#ecebe4', 0.68), lin('#e9e2cf', 0.68), lin('#d9d4c4', 0.68), lin('#c9d0cf', 0.68), lin('#b9c2b0', 0.68), lin('#e8dcb5', 0.68), lin('#cfd6dc', 0.68), lin('#a9a39a', 0.68), lin('#f2efe6', 0.68)];
const SHINGLE = [lin('#3b3b3d'), lin('#4c4743'), lin('#5d5650'), lin('#2e2f33'), lin('#6a5f55'), lin('#545a5e')];
const BARN_RED = [lin('#7d2a1f'), lin('#8f3324'), lin('#6e2a22')];
const CONIFER_COLS = [lin('#2a3d22'), lin('#24361f'), lin('#30452a'), lin('#283a26')];

export function* buildDeparture(ctx) {
  const { land, detail } = ctx;
  const D = clamp(detail, 0, 3);
  const r = rng(1187);
  const tick = ticker();
  const B = new GeoBuilder(1 << 16);
  const houses = new InstanceSet(HOUSE_LAYOUT, 4096);
  const hips = new InstanceSet(HOUSE_LAYOUT, 1024);
  const trees = new InstanceSet(TREE_LAYOUT, 8192);
  const conifers = new InstanceSet(TREE_LAYOUT, 2048);
  const lights = new LightSet();
  const roads = new RoadNet(land);
  const traffic = new Traffic('departure');
  const wires = [];
  const T = DEP_TOWN;
  const lx0 = (((-land.ax) % BLK) + BLK) % BLK, lz0 = (((-land.az) % BLK) + BLK) % BLK;
  const zMain = lz0 + Math.round((T.z - lz0) / BLK) * BLK;          // main street on a lattice line
  const railZ = zMain - 3 * BLK - 30;                                // railway north of main street (smaller z)
  const zHwy = 2300;
  const lakeR = (x, z) => Math.hypot((x - DEP_LAKE.x) / DEP_LAKE.rx, (z - DEP_LAKE.z) / DEP_LAKE.rz);

  // ------------------------------------------------------------------ roads
  // highway south of the airport (4 lanes, divided), diamond interchange with the county road
  const xCounty = 3328;
  const hwy = roads.add([[-34000, zHwy + 900], [-12000, zHwy + 200], [-3000, zHwy], [12000, zHwy], [34000, zHwy - 700]].map(([x, z]) => [x, z]), { type: ROAD.HIGHWAY, lanes: 2, med: 6, step: 20 });
  const hwyRow = traffic.addPath(hwy);
  traffic.populate(hwyRow, [
    { lateral: 6 + 1.8, dir: 1, speed: 30, spacing: 140 / [0.6, 0.8, 1, 1.1][D] }, { lateral: 6 + 5.4, dir: 1, speed: 26, spacing: 260 / [0.6, 0.8, 1, 1.1][D] },
    { lateral: 6 + 1.8, dir: -1, speed: 30, spacing: 140 / [0.6, 0.8, 1, 1.1][D] }, { lateral: 6 + 5.4, dir: -1, speed: 26, spacing: 260 / [0.6, 0.8, 1, 1.1][D] },
  ], r, { truckShare: 0.28, busShare: 0.01 });
  // county road: from the highway north through the town to the wind farm hills
  const county = roads.add(chaikin([[xCounty, 9000], [xCounty, zHwy + 400], [xCounty, zHwy - 400], [xCounty, -2400], [xCounty + 60, zMain + 300], [xCounty, zMain], [xCounty, -8000], [xCounty - 300, -9800], [xCounty - 1200, -12500], [xCounty - 1600, -20000]], 2), { type: ROAD.RURAL, lanes: 1, hw: 4.6, step: 12, infra: B,
    elev: (s) => 7.5 * sstep(0, 1, 1 - (Math.abs(s - (9000 - zHwy)) - 45) / 240) });
  // airport road: from the terminal access road to town
  const aptRoad = roads.add(chaikin([[670, -905], [670, -1500], [1100, -2300], [2300, -3600], [xCounty - 80, zMain + 700], [xCounty, zMain + 380]], 3), { type: ROAD.ARTERIAL, lanes: 1, med: 1.2, step: 14 });
  // main street (through town, continues as a rural road both ways)
  const main = roads.add([[-24000, zMain + 600], [-6000, zMain + 200], [T.x - 1600, zMain], [T.x + 1700, zMain], [12000, zMain - 300], [26000, zMain - 900]], { type: ROAD.ARTERIAL, lanes: 1, med: 0.6, step: 16 });
  // diamond ramps at the interchange
  const ramps = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pts = chaikin([[xCounty + sx * 420, zHwy + sz * 16], [xCounty + sx * 230, zHwy + sz * 30], [xCounty + sx * 70, zHwy + sz * 120], [xCounty + sx * 14, zHwy + sz * 330]], 3);
    ramps.push(roads.add(pts, { type: ROAD.RURAL, lanes: 1, hw: 4.5, step: 10 }));
  }
  for (const [line, lanes, sp] of [[county, [{ lateral: 1.8, dir: 1, speed: 22, spacing: 420 }, { lateral: 1.8, dir: -1, speed: 22, spacing: 420 }], 0], [aptRoad, [{ lateral: 3.0, dir: 1, speed: 18, spacing: 160 }, { lateral: 3.0, dir: -1, speed: 18, spacing: 160 }], 0], [main, [{ lateral: 2.4, dir: 1, speed: 16, spacing: 300 }, { lateral: 2.4, dir: -1, speed: 16, spacing: 300 }], 0]]) {
    traffic.populate(traffic.addPath(line), lanes, r, { truckShare: 0.15, busShare: 0.0 });
    void sp;
  }
  for (const ln of ramps) traffic.populate(traffic.addPath(ln), [{ lateral: 0, dir: 1, speed: 15, spacing: 360 }], r, { truckShare: 0.2 });
  lightsAlong(lights, aptRoad, { spacing: 40, offset: 7, height: 10, color: LAMP.led, E: 34 });
  // interchange lighting only (rural highway is unlit)
  for (const ln of ramps) lightsAlong(lights, ln, { spacing: 60, offset: 6, height: 11, color: LAMP.sodium, E: 40 });
  yield;

  // railway (east-west, north of main street) with a freight train
  const rail = roads.add([[-36000, railZ + 1500], [-12000, railZ + 400], [T.x - 2500, railZ], [T.x + 2500, railZ], [14000, railZ - 500], [36000, railZ - 1800]], { type: ROAD.RAIL, step: 20 });
  const railRow = traffic.addPath(rail);
  traffic.addTrain(railRow, 30000, 21, [26, 34, 40, 48][D], r, 0);
  traffic.addTrain(railRow, 52000, -19, [20, 26, 32, 40][D], r, 0);
  yield;

  // ------------------------------------------------------------------ town
  const nearRoad = (x, z, pad) => Math.abs(z - zMain) < pad || Math.abs(x - xCounty) < pad || Math.abs(z - railZ) < pad + 10;
  const iMin = Math.floor((T.x - T.radius - lx0) / BLK), iMax = Math.floor((T.x + T.radius - lx0) / BLK);
  const jMin = Math.floor((T.z - T.radius - lz0) / BLK), jMax = Math.floor((T.z + T.radius - lz0) / BLK);
  const edges = new Map();
  for (let i = iMin; i <= iMax; i++) {
    if (tick()) yield;
    for (let j = jMin; j <= jMax; j++) {
      const x0 = lx0 + i * BLK, z0 = lz0 + j * BLK, cx = x0 + BLK / 2, cz = z0 + BLK / 2;
      const d = Math.hypot(cx - T.x, (cz - T.z) * 1.15) / T.radius;
      const hb = hash2(i * 13 + 2, j * 7 + 9);
      if (d > 0.72 + 0.18 * hb) continue;
      if (!land.dry(cx, cz, 90)) continue;
      if (cz > railZ - 20 && cz < railZ + 20 + BLK) { /* blocks touching the railway */ }
      const ix0 = x0 + 9, iz0 = z0 + 9, ix1 = x0 + BLK - 9, iz1 = z0 + BLK - 9, W = ix1 - ix0;
      // street lights on the block edges
      for (const [k, a, b2, c2, e] of [[`x${i},${j}`, x0, z0, x0 + BLK, z0], [`x${i},${j + 1}`, x0, z0 + BLK, x0 + BLK, z0 + BLK], [`z${i},${j}`, x0, z0, x0, z0 + BLK], [`z${i + 1},${j}`, x0 + BLK, z0, x0 + BLK, z0 + BLK]]) if (!edges.has(k)) edges.set(k, [a, b2, c2, e]);
      const onMain = Math.abs(z0 + BLK - zMain) < 1 || Math.abs(z0 - zMain) < 1;
      const core = onMain && Math.abs(cx - T.x) < 700;
      // railway corridor: grain elevator / depot / empty
      if (Math.abs(cz - railZ) < BLK * 0.75) continue;
      if (core) {
        // continuous row of 1-3 storey brick commercial buildings facing main street
        const front = Math.abs(z0 + BLK - zMain) < 1 ? z0 + BLK - 9 : z0 + 9;
        const dir = Math.abs(z0 + BLK - zMain) < 1 ? -1 : 1;
        let x = ix0;
        while (x < ix1 - 6) {
          const w = Math.min(ix1 - x, 8 + r() * 10), dd = 16 + r() * 12;
          const floors = r() < 0.55 ? 2 : (r() < 0.6 ? 1 : 3);
          const H = floors * 4.2 + 0.8;
          const bz = front + dir * dd / 2;
          const col = r() < 0.75 ? BRICK[Math.floor(r() * BRICK.length)] : SIDING[Math.floor(r() * 4)];
          B.setColor(col).setStyle(ST.PUNCHED, 600 + r() * 300, 4.2, 2.6);
          const y0 = land.hMin(x + w / 2, bz, w / 2, dd / 2);
          B.box(x + w / 2, bz, y0 - 1, y0 + H, w / 2 - 0.15, dd / 2, 0, { roofStyle: ST.ROOF, roofColor: ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)], vBase: y0 });
          // parapet / cornice
          B.setColor(scalec(col, 0.85)).setStyle(ST.PLAIN, 1, 3, 3);
          B.box(x + w / 2, front + dir * 0.4, y0 + H, y0 + H + 0.9, w / 2 - 0.15, 0.4, 0, { roofStyle: ST.PLAIN });
          x += w;
        }
        // street trees + angled parking implied by cars? (lights instead)
        continue;
      }
      // church, school, water tower on reserved blocks
      if (i === Math.floor((T.x + 160 - lx0) / BLK) && j === Math.floor((zMain + 200 - lz0) / BLK)) { church(B, lights, land, cx, cz, r); continue; }
      if (i === Math.floor((T.x + 700 - lx0) / BLK) && j === Math.floor((zMain - 400 - lz0) / BLK)) { waterTower(B, lights, land, cx, cz, r); continue; }
      if (i === Math.floor((T.x - 500 - lx0) / BLK) && j === Math.floor((zMain + 700 - lz0) / BLK)) {
        // school + playing field
        B.setStyle(ST.GRASS, 3, 3, 3).setColor([0.05, 0.085, 0.03]);
        lawn(B, land, ix0, iz0, ix1, iz1, 0.15, 2);
        lowCommercial(B, r, { x: cx - 25, z: cz - 30, y0: land.h(cx - 25, cz - 30), hw: 32, hd: 12 });
        continue;
      }
      // residential: rows of houses with big yard trees
      const rowsAlongX = hb < 0.6;
      const n = d < 0.45 ? 5 : (d < 0.6 ? 4 : 3);
      B.setStyle(ST.GRASS, hb * 40, 3, 3).setColor(mixc([0.05, 0.078, 0.03], [0.066, 0.08, 0.038], hb));
      lawn(B, land, ix0, iz0, ix1, iz1, 0.12, 2);
      for (let side = 0; side < 2; side++) {
        const lotW = W / n;
        for (let l = 0; l < n; l++) {
          if (r() < 0.08) continue;
          const along = (rowsAlongX ? ix0 : iz0) + (l + 0.5) * lotW;
          const a0 = rowsAlongX ? iz0 : ix0, a1 = rowsAlongX ? iz1 : ix1;
          const w = Math.min(lotW - 4, 8 + r() * 5), dd = 8 + r() * 4;
          const setback = 7 + r() * 5;
          const across = side === 0 ? a0 + setback + dd / 2 : a1 - setback - dd / 2;
          const hx = rowsAlongX ? along : across, hz = rowsAlongX ? across : along;
          if (nearRoad(hx, hz, 14)) continue;
          const floors = r() < 0.5 ? 2 : 1;
          const ridgeAlong = r() < 0.6;
          const rot = (rowsAlongX ? 0 : Math.PI / 2) + (ridgeAlong ? 0 : Math.PI / 2);
          const hw = ridgeAlong ? w : dd, hd = ridgeAlong ? dd : w;
          const y = land.hMin(hx, hz, hw / 2, hd / 2) - 0.6;
          const wall = r() < 0.12 ? BRICK[Math.floor(r() * BRICK.length)] : SIDING[Math.floor(r() * SIDING.length)];
          pushHouse(r() < 0.25 ? hips : houses, hx, y, hz, hw, (floors === 2 ? 5.8 : 3.2) + 0.6, hd, hd * 0.5 * (0.5 + r() * 0.25), rot, wall, SHINGLE[Math.floor(r() * SHINGLE.length)], r() * 1000, ST.RESID, ST.PITCHED);
          // detached garage / shed at the back
          if (r() < 0.5) {
            const bd = side === 0 ? 1 : -1;
            const gx = rowsAlongX ? hx + (r() - 0.5) * 4 : hx + bd * (dd / 2 + 9), gz = rowsAlongX ? hz + bd * (dd / 2 + 9) : hz + (r() - 0.5) * 4;
            pushHouse(houses, gx, land.h(gx, gz) - 0.5, gz, 6, 3, 6.5, 1.4, rot, wall, SHINGLE[Math.floor(r() * SHINGLE.length)], r() * 100, ST.PLAIN, ST.PITCHED);
          }
          // big shade trees (old towns are leafy)
          for (let t = 0; t < 2; t++) {
            if (r() < 0.25) continue;
            const off = (side === 0 ? 1 : -1) * (setback + dd + 3 + r() * 10);
            const tx = rowsAlongX ? along + (r() - 0.5) * lotW : a0 * (side === 0 ? 1 : 0) + a1 * (side === 0 ? 0 : 1) + off;
            const tz = rowsAlongX ? (side === 0 ? a0 : a1) + off : along + (r() - 0.5) * lotW;
            pushTree(trees, tx, land.h(tx, tz) - 0.3, tz, 10 + r() * 9, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.85 + r() * 0.3);
          }
          // street tree in front
          if (r() < 0.5) {
            const sx = rowsAlongX ? along + lotW * 0.45 : (side === 0 ? a0 - 3 : a1 + 3), sz = rowsAlongX ? (side === 0 ? a0 - 3 : a1 + 3) : along + lotW * 0.45;
            pushTree(trees, sx, land.h(sx, sz) - 0.3, sz, 11 + r() * 7, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.9);
          }
        }
      }
    }
  }
  // town street lights (sodium) on the local grid
  for (const [, [x0, z0, x1, z1]] of edges) {
    const L = Math.hypot(x1 - x0, z1 - z0), dx = (x1 - x0) / L, dz = (z1 - z0) / L;
    const n = Math.max(1, Math.round(L / [70, 55, 45, 42][D]));
    for (let q = 0; q < n; q++) {
      const s = (q + 0.5) * L / n, side = q & 1 ? 1 : -1;
      const x = x0 + dx * s - dz * 6 * side, z = z0 + dz * s + dx * 6 * side;
      lights.add(x, land.h(x, z) + 8, z, scalec(LAMP.sodium, 30), 1.0, 0);
    }
  }
  // main street: brighter decorative lamps
  lightsAlong(lights, main.filter((p) => Math.abs(p.x - T.x) < 800), { spacing: 26, offset: 8, both: true, height: 6, color: [1.0, 0.75, 0.45], E: 30, size: 0.9 });
  yield;
  // grain elevator by the railway + station + depot
  grainElevator(B, lights, land, T.x - 420, railZ + 34, r);
  B.setColor(lin('#8a4b38')).setStyle(ST.PUNCHED, 51, 4, 3);
  { const sx = T.x + 60, sz = railZ + 22, y = land.h(sx, sz); B.box(sx, sz, y - 1, y + 5, 22, 7, 0, { roofStyle: null }); B.setColor(lin('#3d4448')).setStyle(ST.PITCHED, 2, 3, 3); B.gable(sx, sz, y + 5, 3, 22, 7, 0, 1.2, lin('#8a4b38')); }
  // gas station + big-box store towards the airport road
  lowCommercial(B, r, { x: xCounty + 220, z: zMain + 520, y0: land.h(xCounty + 220, zMain + 520), hw: 60, hd: 40 });
  lowCommercial(B, r, { x: xCounty - 160, z: zMain + 900, y0: land.h(xCounty - 160, zMain + 900), hw: 14, hd: 10 });
  yield;

  // ------------------------------------------------------------------ farmsteads (where the terrain paints yards)
  const secR = [9, 11, 13, 15][D];
  let farms = 0;
  for (let si = -secR; si <= secR; si++) {
    if (tick()) yield;
    for (let sj = -secR; sj <= secR; sj++) {
      const wsx = Math.floor((land.ax) / 1024) + si, wsz = Math.floor((land.az) / 1024) + sj;
      if (hash12(wsx + 23, wsz + 23) >= 0.45) continue;
      const yx = (wsx + 0.05 + 0.12 * hash12(wsx + 21, wsz + 21)) * 1024 + 8 - land.ax;
      const yz = (wsz + 0.05 + 0.12 * hash12(wsx + 22, wsz + 22)) * 1024 + 6 - land.az;
      if (Math.hypot(yx, yz) > 16000) continue;
      if (land.airportDist(yx, yz) < 500) continue;
      if (Math.hypot(yx - T.x, yz - T.z) < T.radius * 0.95) continue;
      if (lakeR(yx, yz) < 1.25) continue;
      if (Math.abs(yz - zHwy) < 120 || Math.abs(yz - railZ) < 80) continue;
      if (!land.dry(yx, yz, 60)) continue;
      if (land.h(yx, yz) > 400) continue;
      farmstead(B, houses, trees, conifers, lights, land, yx, yz, r, D);
      farms++;
    }
  }
  yield;

  // ------------------------------------------------------------------ lake cabins with docks
  let cabins = 0;
  for (let a = 0; a < Math.PI * 2; a += 0.055 + r() * 0.05) {
    if (tick()) yield;
    let k = 1.0;
    let x = 0, z = 0;
    for (; k < 1.4; k += 0.01) {
      x = DEP_LAKE.x + Math.cos(a) * DEP_LAKE.rx * k; z = DEP_LAKE.z + Math.sin(a) * DEP_LAKE.rz * k;
      if (land.dry(x, z, 18)) break;
    }
    if (k >= 1.4 || r() < 0.25) continue;
    const ox = x + Math.cos(a) * 30, oz = z + Math.sin(a) * 30;
    if (Math.abs(oz - zHwy) < 100 || land.airportDist(ox, oz) < 400) continue;
    const rot = -a + Math.PI / 2;
    const y = land.h(ox, oz);
    pushHouse(r() < 0.3 ? hips : houses, ox, y - 0.6, oz, 9 + r() * 5, 4 + r() * 2, 8 + r() * 3, 2.8 + r(), rot, r() < 0.5 ? lin('#6b4a32') : SIDING[Math.floor(r() * SIDING.length)], SHINGLE[Math.floor(r() * SHINGLE.length)], r() * 1000, ST.RESID, ST.PITCHED);
    // dock into the lake
    const dx = -Math.cos(a), dz = -Math.sin(a);
    const L = 30 + r() * 15;
    B.setColor(lin('#6a5640')).setStyle(ST.PLAIN, 3, 3, 3);
    B.box(x + dx * (L / 2 - 8), z + dz * (L / 2 - 8), 0.1, 0.9, 1.2, L / 2, Math.atan2(dx, dz), { roofStyle: ST.PLAIN });
    if (r() < 0.5) pushHouse(houses, x + dx * (L - 10) + dz * 3.5, -0.3, z + dz * (L - 10) - dx * 3.5, 2.6, 1.1, 7, 0.4, Math.atan2(dx, dz) + Math.PI / 2, lin('#f0efe9'), lin('#d9d6cf'), r() * 100, ST.PLAIN, ST.PLAIN);
    for (let t = 0; t < 4; t++) {
      const tx = ox + (r() - 0.5) * 50 + Math.cos(a) * 20, tz = oz + (r() - 0.5) * 50 + Math.sin(a) * 20;
      if (!land.dry(tx, tz)) continue;
      pushTree(r() < 0.6 ? conifers : trees, tx, land.h(tx, tz) - 0.3, tz, 12 + r() * 10, r() < 0.6 ? CONIFER_COLS[Math.floor(r() * 4)] : TREE_COLS[Math.floor(r() * TREE_COLS.length)], 1);
    }
    if (r() < 0.6) lights.add(ox, y + 3, oz, scalec([1.0, 0.7, 0.4], 18), 0.7, 0);
    cabins++;
  }
  yield;

  // ------------------------------------------------------------------ power line + wind farm
  const sub1 = [xCounty - 700, zMain - 1200];
  const farmZ = -11200;
  const turbines = [];
  for (let k = 0; k < [10, 14, 18, 20][D]; k++) {
    const row = k % 2;
    const x = -5200 + Math.floor(k / 2) * 1100 * (20 / [10, 14, 18, 20][D]) * 0.55 + row * 450;
    const z = farmZ - row * 900 + 180 * Math.sin(x / 1300);
    if (!land.dry(x, z, 50)) continue;
    turbines.push([x, z]);
  }
  const line1 = [[turbines[0]?.[0] ?? 0, farmZ + 400], [sub1[0], sub1[1] - 1500], sub1, [sub1[0] - 3000, sub1[1] - 300], [-30000, sub1[1] - 600]];
  const line2 = [sub1, [sub1[0] + 5000, sub1[1] + 900], [30000, sub1[1] + 1600]];
  for (const pl of [line1, line2]) powerLine(B, land, wires, pl, 380, r);
  // substation
  B.setColor(lin('#9a9a96')).setStyle(ST.METAL, 7, 3, 3);
  for (let q = 0; q < 6; q++) B.box(sub1[0] + (q % 3) * 12 - 12, sub1[1] + Math.floor(q / 3) * 14 - 7, land.h(...sub1), land.h(...sub1) + 5, 2.5, 2.5, 0, { roofStyle: ST.METAL });
  lights.add(sub1[0], land.h(...sub1) + 10, sub1[1], scalec(LAMP.mercury, 40), 1.2, 0);
  yield;
  const rotorGeo = turbineGeometry(B, lights, land, turbines, r);
  yield;

  // ------------------------------------------------------------------ meshes
  const M = ctx.mats;
  const out = [];
  const push = (m) => { if (m) out.push(m); };
  push(roads.build(M.road, 'departure.roads'));
  const bm = Object.assign(new THREE.Mesh(B.build(), M.bld), { name: 'departure.buildings', matrixAutoUpdate: false });
  push(bm);
  const hm = houses.build(ctx.unit.gable, M.inst, 'departure.houses'), hh = hips.build(ctx.unit.hip, M.inst, 'departure.housesHip');
  push(hm); push(hh);
  const tm = trees.build(ctx.unit.broadleaf, M.tree, 'departure.trees'), cm = conifers.build(ctx.unit.conifer, M.tree, 'departure.conifers');
  push(tm); push(cm);
  if (D >= 1 && M.shadow) {
    push(shadowMesh(bm, M.shadow.merged, 'departure.shadow.buildings'));
    push(shadowMesh(hm, M.shadow.houses, 'departure.shadow.houses'));
    push(shadowMesh(hh, M.shadow.houses, 'departure.shadow.housesHip'));
    if (D >= 3) { push(shadowMesh(tm, M.shadow.trees, 'departure.shadow.trees')); push(shadowMesh(cm, M.shadow.trees, 'departure.shadow.conifers')); }
  }
  push(lights.build(M.points, 'departure.lights'));
  const tr = traffic.build();
  if (tr) { push(tr.bodies); push(tr.lights); }
  push(buildWires(wires));
  // rotating rotors
  let rotors = null;
  if (turbines.length && rotorGeo) {
    rotors = new THREE.InstancedMesh(rotorGeo.geo, M.bld, turbines.length);
    rotors.name = 'departure.rotors';
    rotors.frustumCulled = false;
    push(rotors);
  }
  const m4 = new THREE.Matrix4(), qY = new THREE.Quaternion(), qR = new THREE.Quaternion(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const ax = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const phase = turbines.map(() => r() * Math.PI * 2);
  const omega = turbines.map(() => 1.45 + r() * 0.25);       // ~14 rpm
  const yaw = (250 - 180) * Math.PI / 180;                       // rotors face the prevailing WSW wind
  let ang = 0;
  const update = (dt) => {
    if (!rotors) return;
    ang += dt;
    qY.setFromAxisAngle(up, -yaw);
    ax.set(0, 0, 1).applyQuaternion(qY);
    for (let i = 0; i < turbines.length; i++) {
      qR.setFromAxisAngle(ax, phase[i] + ang * omega[i]);
      qR.multiply(qY);
      const t = rotorGeo.hubs[i];
      pos.set(t[0], t[1], t[2]);
      m4.compose(pos, qR, one);
      rotors.setMatrixAt(i, m4);
    }
    rotors.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return {
    objects: out, traffic, update,
    stats: { farms, cabins, turbines: turbines.length, houses: houses.count + hips.count, trees: trees.count + conifers.count, lights: lights.count, vehicles: tr?.count || 0, verts: B.vertexCount },
  };
}

// ----------------------------------------------------------------------------- pieces
function farmstead(B, houses, trees, conifers, lights, land, x, z, r, D) {
  const rot = (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.08;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (a, b) => [x + a * c + b * s, z - a * s + b * c];
  // farmhouse
  const [hx, hz] = P(-18 + r() * 6, 14);
  pushHouse(houses, hx, land.h(hx, hz) - 0.6, hz, 12 + r() * 4, 6.2, 9 + r() * 2, 3.4, rot, SIDING[Math.floor(r() * SIDING.length)], SHINGLE[Math.floor(r() * SHINGLE.length)], r() * 1000, ST.RESID, ST.PITCHED);
  // barns (red / grey / white), machine shed
  const nb = 1 + Math.floor(r() * 2.5);
  for (let b = 0; b < nb; b++) {
    const [bx, bz] = P(8 + b * 26 + r() * 6, -8 - r() * 14);
    const red = r() < 0.55;
    const w = 18 + r() * 14, d = 12 + r() * 6;
    pushHouse(houses, bx, land.h(bx, bz) - 0.6, bz, w, 5.5 + r() * 3, d, d * 0.42, rot + (b % 2) * Math.PI / 2, red ? BARN_RED[Math.floor(r() * 3)] : (r() < 0.5 ? lin('#9ea2a3') : lin('#d9d6cc')), red ? lin('#55585a') : lin('#7d8183'), r() * 1000, ST.INDUSTRIAL, ST.PITCHED);
  }
  if (r() < 0.7) {
    const [mx, mz] = P(-6, -34 - r() * 10);
    pushHouse(houses, mx, land.h(mx, mz) - 0.6, mz, 34 + r() * 16, 5.5, 16, 2.2, rot, lin('#a3a7a8'), lin('#8e9294'), r() * 1000, ST.INDUSTRIAL, ST.PITCHED);
  }
  // silos / grain bins
  const kind = r();
  const [sx, sz] = P(30 + r() * 10, 12);
  const y0 = land.h(sx, sz);
  if (kind < 0.45) {
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const bxp = sx + i * 11 * c, bzp = sz - i * 11 * s, rr = 4.5 + r() * 1.5, h = 8 + r() * 4;
      B.setColor(lin('#b8bcbd')).setStyle(ST.METAL, 1, 3, 3);
      B.cylinder(bxp, bzp, y0 - 0.5, y0 + h, rr, rr, 12, { cap: false });
      B.cylinder(bxp, bzp, y0 + h, y0 + h + rr * 0.6, rr, 0.6, 12);
    }
  } else {
    const n = 1 + Math.floor(r() * 2.4);
    for (let i = 0; i < n; i++) {
      const blue = r() < 0.3;
      const bxp = sx + i * 8 * c, bzp = sz - i * 8 * s, h = 18 + r() * 8;
      B.setColor(blue ? lin('#28406a') : lin('#c9c5ba')).setStyle(blue ? ST.METAL : ST.PLAIN, 1, 3, 3);
      B.cylinder(bxp, bzp, y0 - 0.5, y0 + h, 3.2, 3.2, 10, { cap: false });
      B.setColor(blue ? lin('#28406a') : lin('#8e9294'));
      B.cylinder(bxp, bzp, y0 + h, y0 + h + 2.4, 3.2, 0.4, 10);
    }
  }
  // shelter belt (conifers to the west / north-west) + yard trees
  const nC = [6, 9, 12, 14][D];
  for (let t = 0; t < nC; t++) {
    const tx = x - 38 + (r() - 0.5) * 10, tz = z - 55 + t * (110 / nC) + (r() - 0.5) * 4;
    pushTree(conifers, tx, land.h(tx, tz) - 0.3, tz, 11 + r() * 8, CONIFER_COLS[Math.floor(r() * 4)], 1);
  }
  const nT = [3, 5, 7, 8][D];
  for (let t = 0; t < nT; t++) {
    const tx = hx + (r() - 0.5) * 50, tz = hz + 10 + (r() - 0.3) * 40;
    pushTree(trees, tx, land.h(tx, tz) - 0.3, tz, 9 + r() * 9, TREE_COLS[Math.floor(r() * TREE_COLS.length)], 0.9 + r() * 0.3);
  }
  // yard light (mercury vapour, blue-white) — the classic rural night dot
  lights.add(x + 4, land.h(x, z) + 9, z + 2, scalec(r() < 0.6 ? LAMP.mercury : LAMP.sodium, 34), 1.0, 0);
}

function church(B, lights, land, x, z, r) {
  const y = land.hMin(x, z, 20, 12) - 0.5;
  B.gy = y + 0.5;
  const white = lin('#eeece6');
  B.setColor(white).setStyle(ST.PUNCHED, 61, 7, 4.5);
  B.box(x, z, y, y + 9, 9, 18, 0, { roofStyle: null });
  B.setColor(lin('#3f4245')).setStyle(ST.PITCHED, 62, 3, 3);
  B.gable(x, z, y + 9, 7, 18, 9, Math.PI / 2, 0.6, white);
  // tower + spire at the front (south)
  B.setColor(white).setStyle(ST.PLAIN, 63, 3, 3);
  B.box(x, z + 20, y, y + 22, 3.5, 3.5, 0, { roofStyle: ST.PLAIN });
  B.setColor(lin('#2f3236')).setStyle(ST.METAL, 64, 3, 3);
  const top = y + 22, apex = y + 42;
  const pts = [[x - 3.5, top, z + 23.5], [x + 3.5, top, z + 23.5], [x + 3.5, top, z + 16.5], [x - 3.5, top, z + 16.5]];
  for (let i = 0; i < 4; i++) B.tri(pts[i], pts[(i + 1) % 4], [x, apex, z + 20]);
  lights.add(x, y + 10, z + 24, scalec([1.0, 0.85, 0.6], 20), 1.0, 0);
  B.gy = NO_SHADOW;
  void r;
}

function waterTower(B, lights, land, x, z, r) {
  const y = land.h(x, z) - 0.5;
  B.setColor(lin('#c9d3d8')).setStyle(ST.METAL, 71, 3, 3);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    B.beam([x + Math.cos(a) * 9, y, z + Math.sin(a) * 9], [x + Math.cos(a) * 5, y + 34, z + Math.sin(a) * 5], 0.45);
  }
  B.cylinder(x, z, y, y + 34, 1.4, 1.4, 8, { cap: false });
  // tank: two cones + cylinder
  B.cylinder(x, z, y + 31, y + 36, 2, 9, 16, { cap: false });
  B.cylinder(x, z, y + 36, y + 42, 9, 9, 16, { cap: false });
  B.cylinder(x, z, y + 42, y + 45, 9, 1, 16);
  lights.add(x, y + 45.6, z, [120, 4, 2], 1.2, 2, 0, 0);
  void r;
}

function grainElevator(B, lights, land, x, z, r) {
  const y = land.hMin(x, z, 40, 10) - 0.5;
  const conc = lin('#c9c4b6');
  B.setColor(conc).setStyle(ST.PLAIN, 81, 3, 3);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) B.cylinder(x - 30 + i * 10.4, z + j * 10.4 - 5.2, y, y + 34, 5.2, 5.2, 12, { capStyle: ST.ROOF });
  // headhouse
  B.setStyle(ST.PUNCHED, 82, 4, 3);
  B.box(x + 34, z, y, y + 50, 7, 9, 0, { roofStyle: ST.ROOF, roofColor: lin('#8a877f') });
  B.box(x, z, y + 34, y + 38, 33, 4, 0, { roofStyle: ST.ROOF, roofColor: lin('#8a877f') });
  lights.add(x + 34, y + 51, z, [110, 4, 2], 1.1, 2, 0, 0);
  lights.add(x, y + 8, z + 14, scalec(LAMP.sodium, 50), 1.3, 0);
  void r;
}

function powerLine(B, land, wires, pts, span, r) {
  // resample along the polyline every `span` metres; pylons + 4 wires per span
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / span));
    for (let k = 0; k < n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  P.push(pts[pts.length - 1]);
  const steel = lin('#8b8f90');
  let prev = null;
  for (let i = 0; i < P.length; i++) {
    const [x, z] = P[i];
    if (land.water(x, z) > 0.001 || land.airportDist(x, z) < 300) { prev = null; continue; }
    const q = P[Math.min(i + 1, P.length - 1)], p = P[Math.max(i - 1, 0)];
    const dir = Math.atan2(q[0] - p[0], q[1] - p[1]);            // heading of the line
    const y = land.h(x, z);
    B.gy = y;
    const H = 38, armY = [26, 32], armW = [9, 7];
    const ca = Math.cos(dir), sa = Math.sin(dir);
    const across = [ca, -sa];                                     // perpendicular to the line
    const along = [sa, ca];
    B.setColor(steel).setStyle(ST.METAL, 91, 3, 3);
    const leg = (u, v, hh) => { const w = 4.2 * (1 - hh / H * 0.75); return [x + across[0] * u * w + along[0] * v * w, y + hh, z + across[1] * u * w + along[1] * v * w]; };
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    for (const [u, v] of corners) B.beam(leg(u, v, -0.5), leg(u, v, H - 4), 0.22);
    for (let f = 0; f < 4; f++) {
      const [u0, v0] = corners[f], [u1, v1] = corners[(f + 1) % 4];
      for (const [h0, h1] of [[0, 12], [12, 24]]) { B.beam(leg(u0, v0, h0), leg(u1, v1, h1), 0.12); B.beam(leg(u1, v1, h0), leg(u0, v0, h1), 0.12); }
    }
    for (let k = 0; k < 2; k++) B.beam([x - across[0] * armW[k], y + armY[k], z - across[1] * armW[k]], [x + across[0] * armW[k], y + armY[k], z + across[1] * armW[k]], 0.3);
    B.beam(leg(0, 0, H - 4), [x, y + H, z], 0.25);
    const att = [[-armW[0] + 0.6, armY[0] - 2.5], [armW[0] - 0.6, armY[0] - 2.5], [-armW[1] + 0.6, armY[1] - 2.5], [armW[1] - 0.6, armY[1] - 2.5], [0, H]];
    const pts3 = att.map(([u, hh]) => [x + across[0] * u, y + hh, z + across[1] * u]);
    if (prev) for (let k = 0; k < pts3.length; k++) wires.push([prev[k], pts3[k], k === 4 ? 0.6 : 1]);
    prev = pts3;
  }
  B.gy = NO_SHADOW;
  void r;
}

function buildWires(wires) {
  if (!wires.length) return null;
  const P = [];
  for (const [a, b, sagK] of wires) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const sag = L * L / (8 * 1400) * sagK;
    const n = 10;
    for (let i = 0; i < n; i++) {
      for (const t of [i / n, (i + 1) / n]) {
        P.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - 4 * sag * t * (1 - t), a[2] + (b[2] - a[2]) * t);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    name: 'city.wires',
    uniforms: CITY_U,
    vertexShader: `${CURVE_GLSL}
varying float vA;
void main() {
  vec4 wp = cityCurve(modelMatrix * vec4(position, 1.0));
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vA = clamp(250.0 / max(d, 1.0), 0.0, 0.85);
}`,
    fragmentShader: `varying float vA;
void main() { gl_FragColor = vec4(vec3(0.03), vA); }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.LineSegments(g, mat);
  m.name = 'departure.wires';
  m.matrixAutoUpdate = false;
  return m;
}

/** Turbine towers + nacelles into B; returns the rotor geometry (one instance per turbine) and hub positions. */
function turbineGeometry(B, lights, land, turbines, r) {
  const hubs = [];
  const H = 92, white = lin('#e7e8e6');
  const yaw = (250 - 180) * Math.PI / 180;
  for (const [x, z] of turbines) {
    const y = land.h(x, z) - 1;
    B.setColor(white).setStyle(ST.PLAIN, 101, 3, 3);
    B.cylinder(x, z, y, y + H, 2.4, 1.4, 12, { cap: false });
    // nacelle: box oriented along the rotor axis
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    B.box(x - s * 2, z - c * 2, y + H - 1, y + H + 3.4, 1.9, 6, -yaw, { roofStyle: ST.PLAIN });
    // hub in front of the nacelle (towards the wind)
    hubs.push([x + s * 4.6, y + H + 1.2, z + c * 4.6]);
    lights.add(x - s * 2, y + H + 3.8, z - c * 2, [140, 5, 2], 1.6, 2, 2.0, 0.0);
  }
  // rotor geometry: 3 tapered, slightly twisted blades + hub, in the rotor plane (x-y), axis +z
  const R = new GeoBuilder(512);
  R.setColor(white).setStyle(ST.PLAIN, 102, 3, 3);
  const L = 56;
  for (let b = 0; b < 3; b++) {
    const a = b * Math.PI * 2 / 3;
    const ca = Math.cos(a), sa = Math.sin(a);
    const pt = (rr, w, t) => [ca * rr - sa * w, sa * rr + ca * w, t];
    const root = 2.0, tip = L;
    // flat blade: front and back faces (chord tapers from 3.6 m to 0.6 m)
    const q0 = pt(root, -1.8, 0.3), q1 = pt(root, 1.8, -0.3), q2 = pt(tip, 0.3, 0.1), q3 = pt(tip, -0.3, -0.1);
    R.quadOut(q0, q1, q2, q3, [0, 0, 1]);
    R.quadOut(q0, q1, q2, q3, [0, 0, -1]);
  }
  R.cylinder(0, 0, -1.6, 1.6, 1.8, 1.8, 8);
  const g = R.build();
  // rotate the cylinder hub axis (y) to z: swap in place for the hub vertices only — simpler: leave (hub reads as a short drum)
  void r;
  return { geo: g, hubs };
}

void AIRPORT_FLAT; void CAR_COLORS; void roofPlant;
