// Road network painting: streets, county roads, I-65, ramps, rail line, bridges, intersections and street props.
import { SURFACE, ZONES } from '../World.js';
import { B } from '../blocks.js';
import { HWY_X, RAIL_Z } from './plan.js';
import { h01 } from './util.js';

const Y = SURFACE;
// roadMask values
export const RM = { NONE: 0, ROAD: 1, WALK: 2, JUNCTION: 3, SHOULDER: 4, HWY: 5, RAIL: 6, DIRT: 7, MEDIAN: 8 };

export function roadRect(r, withWalk = true) {
  const e = r.hw + (withWalk ? r.sw : 0);
  if (r.axis === 'x') return { x0: r.a0, x1: r.a1, z0: r.c - e, z1: r.c + e };
  return { x0: r.c - e, x1: r.c + e, z0: r.a0, z1: r.a1 };
}

/** Mark occupancy + flat for roads (plan phase). */
export function reserveRoads(ctx) {
  const { SX } = ctx;
  for (const r of ctx.roads) {
    const rr = roadRect(r, true);
    markRect(ctx, rr.x0 - 1, rr.z0 - 1, rr.x1 + 1, rr.z1 + 1, 1, 2);
    if (r.axis === 'x') markRect(ctx, rr.x0, rr.z0 - 2, rr.x1, rr.z1 + 2, 0, 1);
    else markRect(ctx, rr.x0 - 2, rr.z0, rr.x1 + 2, rr.z1, 0, 1);
  }
  // highway + ramps + rail
  markRect(ctx, HWY_X - 18, 0, HWY_X + 18, ctx.SZ - 1, 1, 1);
  markRect(ctx, 890, 424, 903, 606, 1, 1);
  markRect(ctx, 0, RAIL_Z - 4, ctx.SX - 1, RAIL_Z + 4, 1, 1);
  void SX;
}

export function markRect(ctx, x0, z0, x1, z1, occVal, flatVal) {
  const { SX, SZ } = ctx;
  x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(SX - 1, x1); z1 = Math.min(SZ - 1, z1);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const k = z * SX + x;
      if (occVal && !ctx.occ[k]) ctx.occ[k] = occVal;
      if (flatVal) ctx.flat[k] = 1;
    }
  }
}

function put(ctx, x, z, id, mask) {
  if (x < 0 || z < 0 || x >= ctx.SX || z >= ctx.SZ) return;
  ctx.world.set(x, Y, z, id);
  if (mask !== undefined) ctx.roadMask[z * ctx.SX + x] = mask;
}

/** Bridge supports + deck underside where a painted road cell is above water. */
function bridgeCell(ctx, x, z) {
  const k = z * ctx.SX + x;
  if (!ctx.water[k]) return;
  ctx.world.set(x, Y - 1, z, B.concrete);
  ctx.bridgeCells.push(k);
}

export function paintRoads(ctx) {
  const { world, SX, SZ, roads, seed } = ctx;
  ctx.roadMask = new Uint8Array(SX * SZ);
  ctx.bridgeCells = [];
  const RMk = ctx.roadMask;

  // 1. sidewalks
  for (const r of roads) {
    if (!r.sw) continue;
    const e0 = r.hw + 1, e1 = r.hw + r.sw;
    for (let a = r.a0; a <= r.a1; a++) {
      for (let o = e0; o <= e1; o++) {
        for (const s of [-1, 1]) {
          const p = r.c + s * o;
          const [x, z] = r.axis === 'x' ? [a, p] : [p, a];
          if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
          const k = z * SX + x;
          if (RMk[k] === RM.ROAD || RMk[k] === RM.JUNCTION) continue;
          put(ctx, x, z, B.sidewalk, RM.WALK);
          bridgeCell(ctx, x, z);
        }
      }
    }
  }
  // 2. roadways
  for (const r of roads) {
    const dirt = r.kind === 'dirt';
    for (let a = r.a0; a <= r.a1; a++) {
      for (let o = -r.hw; o <= r.hw; o++) {
        const p = r.c + o;
        const [x, z] = r.axis === 'x' ? [a, p] : [p, a];
        if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
        const k = z * SX + x;
        const was = RMk[k];
        let id = dirt ? B.dirt_path : B.asphalt;
        put(ctx, x, z, id, was === RM.ROAD || was === RM.JUNCTION ? RM.JUNCTION : (dirt ? RM.DIRT : RM.ROAD));
        bridgeCell(ctx, x, z);
      }
      // gravel shoulders on county roads
      if (r.kind === 'county') {
        for (const s of [-1, 1]) {
          const p = r.c + s * (r.hw + 1);
          const [x, z] = r.axis === 'x' ? [a, p] : [p, a];
          if (x < 0 || z < 0 || x >= SX || z >= SZ) continue;
          const k = z * SX + x;
          if (RMk[k]) continue;
          put(ctx, x, z, ctx.water[k] ? B.concrete : B.gravel, RM.SHOULDER);
          bridgeCell(ctx, x, z);
        }
      }
    }
  }
  // 3. junctions: any road cell covered by two different roads
  const cover = new Uint8Array(SX * SZ);
  for (const r of roads) {
    const rr = roadRect(r, false);
    for (let z = Math.max(0, rr.z0); z <= Math.min(SZ - 1, rr.z1); z++) {
      for (let x = Math.max(0, rr.x0); x <= Math.min(SX - 1, rr.x1); x++) {
        const k = z * SX + x;
        if (cover[k] && cover[k] !== (r.axis === 'x' ? 1 : 2)) RMk[k] = RM.JUNCTION;
        cover[k] |= r.axis === 'x' ? 1 : 2;
      }
    }
  }
  for (let k = 0; k < cover.length; k++) if (cover[k] === 3) RMk[k] = RM.JUNCTION;

  // 4. lane markings
  for (const r of roads) {
    if (r.kind === 'dirt') continue;
    const yel = r.axis === 'x' ? B.road_yellow_x : B.road_yellow_z;
    const wht = r.axis === 'x' ? B.road_white_x : B.road_white_z;
    for (let a = r.a0; a <= r.a1; a++) {
      const mark = (o, id, dashed) => {
        const p = r.c + o;
        const [x, z] = r.axis === 'x' ? [a, p] : [p, a];
        if (x < 0 || z < 0 || x >= SX || z >= SZ) return;
        const k = z * SX + x;
        if (RMk[k] !== RM.ROAD) return;
        if (dashed && (a % 6) >= 3) return;
        if (h01(seed, x, z, 77) < 0.08) return; // faded paint
        world.set(x, Y, z, id);
      };
      if (r.kind === 'main') { mark(0, yel, false); mark(-3, wht, true); mark(3, wht, true); }
      else if (r.kind === 'county') { mark(0, yel, false); }
      else if (!r.industrial) mark(0, yel, true);
    }
  }
  // 5. crosswalks downtown
  for (const r of roads) {
    if (r.kind !== 'main' && !(r.kind === 'street' && inDowntown(r))) continue;
    for (let a = r.a0; a <= r.a1; a++) {
      for (let o = -r.hw; o <= r.hw; o++) {
        const p = r.c + o;
        const [x, z] = r.axis === 'x' ? [a, p] : [p, a];
        if (x < 1 || z < 1 || x >= SX - 1 || z >= SZ - 1) continue;
        const k = z * SX + x;
        if (RMk[k] !== RM.ROAD) continue;
        // within 2 cells of a junction along the road axis?
        const step = r.axis === 'x' ? 1 : SX;
        let near = false;
        for (let s = 1; s <= 3 && !near; s++) {
          if (RMk[k + step * s] === RM.JUNCTION || RMk[k - step * s] === RM.JUNCTION) near = s >= 2;
        }
        if (near) world.set(x, Y, z, r.axis === 'x' ? B.crosswalk_x : B.crosswalk_z);
      }
    }
  }

  paintHighway(ctx);
  paintRail(ctx);
  // bridge railings + pillars
  finishBridges(ctx);
  // 6. decay: cracks, manholes, weeds
  for (let z = 1; z < SZ - 1; z++) {
    for (let x = 1; x < SX - 1; x++) {
      const k = z * SX + x;
      const m = RMk[k];
      if (m !== RM.ROAD && m !== RM.JUNCTION && m !== RM.HWY) continue;
      const id = world.get(x, Y, z);
      if (id !== B.asphalt) continue;
      const r = h01(seed, x, z, 5);
      if (r < 0.13) {
        world.set(x, Y, z, B.asphalt_cracked);
        if (r < 0.012 && !ctx.water[k]) world.set(x, Y + 1, z, h01(seed, x, z, 6) < 0.5 ? B.tall_grass : B.dead_bush);
      } else if (r > 0.9985 && m !== RM.HWY) world.set(x, Y, z, B.manhole);
    }
  }
}

function inDowntown(r) {
  return r.axis === 'x' ? (r.c >= 440 && r.c <= 590) : (r.c >= 400 && r.c <= 620 && r.a0 >= 400);
}

function paintHighway(ctx) {
  const { world, SZ, SX, seed } = ctx;
  const RMk = ctx.roadMask;
  const X = HWY_X;
  for (let z = 0; z < SZ; z++) {
    for (let o = -16; o <= 16; o++) {
      const x = X + o, k = z * SX + x;
      let id = B.asphalt;
      const ao = Math.abs(o);
      if (ao <= 2) id = B.concrete;
      else if (ao === 4 || ao === 14) id = B.road_yellow_z;
      if (ao === 14) id = B.road_white_z;
      if (ao === 9 && (z % 8) < 4) id = B.road_white_z;
      if (ao === 16) id = B.gravel;
      if (id === B.road_white_z && h01(seed, x, z, 78) < 0.07) id = B.asphalt;
      world.set(x, Y, z, id);
      RMk[k] = ao <= 2 ? RM.MEDIAN : ao === 16 ? RM.SHOULDER : RM.HWY;
      bridgeCell(ctx, x, z);
    }
    // median jersey barrier (gap at the crossover near Main Street)
    if (!(z >= 503 && z <= 521)) world.place(X, Y + 1, z, 'jersey_barrier', 1);
    // outer guardrails (gaps at ramps)
    const rampGap = (z >= 424 && z <= 446) || (z >= 584 && z <= 606);
    if (!rampGap) world.place(X - 17, Y + 1, z, 'guardrail', 1);
    world.place(X + 17, Y + 1, z, 'guardrail', 3);
  }
  // ramps between the frontage road and the southbound carriageway
  for (let z = 424; z <= 606; z++) {
    for (let x = 893; x <= 899; x++) {
      world.set(x, Y, z, x === 896 && z % 6 < 3 ? B.road_white_z : B.asphalt);
      RMk[z * SX + x] = RM.ROAD;
    }
    // taper into the highway at both ends
    if (z <= 446 || z >= 584) {
      for (let x = 900; x <= X - 15; x++) { world.set(x, Y, z, B.asphalt); RMk[z * SX + x] = RM.ROAD; }
    }
  }
  // Main Street connector across the frontage road to the ramp
  for (let z = 508; z <= 516; z++) for (let x = 884; x <= 899; x++) {
    if (RMk[z * SX + x] !== RM.ROAD) { world.set(x, Y, z, B.asphalt); RMk[z * SX + x] = RM.JUNCTION; }
    else RMk[z * SX + x] = RM.JUNCTION;
  }
  for (let x = 890; x <= 892; x++) for (let z = 424; z <= 606; z++) {
    if (RMk[z * SX + x] === 0) world.set(x, Y, z, B.grass);
  }
}

function paintRail(ctx) {
  const { world, SX } = ctx;
  const RMk = ctx.roadMask;
  for (let x = 0; x < SX; x++) {
    for (let dz = -3; dz <= 3; dz++) {
      const z = RAIL_Z + dz, k = z * SX + x;
      const onRoad = RMk[k] === RM.ROAD || RMk[k] === RM.JUNCTION || RMk[k] === RM.HWY || RMk[k] === RM.MEDIAN || RMk[k] === RM.SHOULDER || RMk[k] === RM.WALK;
      if (onRoad) {
        if (dz === -1 || dz === 1) world.set(x, Y, z, B.metal_wall);
        // the median barrier and guardrails get a gap at the crossing
        const above = world.get(x, Y + 1, z);
        if (above === B.jersey_barrier || above === B.guardrail) world.set(x, Y + 1, z, 0);
        continue;
      }
      let id = B.gravel;
      if (Math.abs(dz) <= 2 && (x & 1) === 0) id = B.planks_dark;
      if (dz === -1 || dz === 1) id = B.metal_wall;
      world.set(x, Y, z, id);
      RMk[k] = RM.RAIL;
      bridgeCell(ctx, x, z);
    }
  }
}

function finishBridges(ctx) {
  const { world, SX, water } = ctx;
  const RMk = ctx.roadMask;
  const isDeck = (x, z) => x >= 0 && z >= 0 && x < SX && z < ctx.SZ && RMk[z * SX + x] !== 0;
  for (const k of ctx.bridgeCells) {
    const x = k % SX, z = (k - x) / SX;
    // pillars on a sparse grid
    if (((x * 7 + z * 13) % 9) === 0) {
      for (let y = Y - 2; y >= 1; y--) {
        const id = world.get(x, y, z);
        if (id !== B.water && id !== 0) break;
        world.set(x, y, z, B.concrete);
      }
    }
    // railing on deck edges (non-deck neighbour over water/air)
    for (const [dx, dz, f] of [[1, 0, 3], [-1, 0, 1], [0, 1, 0], [0, -1, 2]]) {
      const nx = x + dx, nz = z + dz;
      if (isDeck(nx, nz)) continue;
      if (nx < 0 || nz < 0 || nx >= SX || nz >= ctx.SZ) continue;
      const nk = nz * SX + nx;
      if (!water[nk] && ctx.dWater[nk] > 1.5) continue;
      const m = RMk[k];
      if (m === RM.RAIL) continue;
      if (world.get(x, Y + 1, z) === 0) world.place(x, Y + 1, z, 'guardrail', dx !== 0 ? 1 : 0);
      void f;
    }
  }
}

/** Street furniture: lamps, utility poles, hydrants, traffic lights, stop signs, trash cans, benches. */
export function streetProps(ctx) {
  const { world, SX, SZ, roads, seed } = ctx;
  const RMk = ctx.roadMask;
  const free = (x, z) => x > 0 && z > 0 && x < SX - 1 && z < SZ - 1 && world.get(x, Y + 1, z) === 0 && world.get(x, Y + 2, z) === 0;
  for (const r of roads) {
    if (r.kind === 'dirt') continue;
    const along = (a, off) => (r.axis === 'x' ? [a, r.c + off] : [r.c + off, a]);
    const town = r.kind === 'main' || r.kind === 'street';
    for (let a = r.a0 + 3; a <= r.a1 - 3; a++) {
      if (town && r.sw > 0) {
        const e = r.hw + r.sw;
        // lamps every 18 on alternating sides
        if (a % 18 === 0) {
          const s = (Math.floor(a / 18) & 1) ? 1 : -1;
          const [x, z] = along(a, s * (r.hw + 1));
          if (RMk[z * SX + x] === RM.WALK && free(x, z)) {
            for (let y = Y + 1; y <= Y + 4; y++) world.set(x, y, z, B.street_pole);
            world.set(x, Y + 5, z, B.street_lamp);
          }
        }
        // hydrants
        if (a % 47 === 11) {
          const [x, z] = along(a, -(r.hw + 1));
          if (RMk[z * SX + x] === RM.WALK && free(x, z)) world.set(x, Y + 1, z, B.fire_hydrant);
        }
        // downtown trash cans + benches
        if (r.kind === 'main' && a % 23 === 7) {
          const [x, z] = along(a, e);
          if (RMk[z * SX + x] === RM.WALK && free(x, z)) world.set(x, Y + 1, z, B.trash_can);
        }
        if (r.kind === 'main' && a % 41 === 20) {
          const [x, z] = along(a, -e);
          const f = r.axis === 'x' ? 0 : 3;
          if (RMk[z * SX + x] === RM.WALK && free(x, z)) world.place(x, Y + 1, z, 'bench', f);
        }
      } else if (r.kind === 'county') {
        // utility poles along one side
        if (a % 22 === 0) {
          const [x, z] = along(a, r.hw + 3);
          if (x > 0 && z > 0 && x < SX && z < SZ && !ctx.water[z * SX + x] && RMk[z * SX + x] === 0 && ctx.occ[z * SX + x] <= 1) {
            const gy = ctx.ground[z * SX + x];
            if (gy <= Y + 1 && world.get(x, gy + 1, z) === 0) {
              const lean = h01(seed, x, z, 3) < 0.08;
              for (let y = gy + 1; y <= gy + 7; y++) world.set(x, y, z, B.utility_pole);
              if (lean) world.set(x, gy + 7, z, 0);
            }
          }
        }
      }
    }
  }
  // highway lamps on the median
  for (let z = 10; z < SZ - 10; z += 40) {
    if (world.get(HWY_X, Y + 1, z) === B.jersey_barrier) {
      world.set(HWY_X, Y + 2, z, B.street_pole);
      for (let y = Y + 3; y <= Y + 6; y++) world.set(HWY_X, y, z, B.street_pole);
      world.set(HWY_X, Y + 7, z, B.street_lamp);
    }
  }
  // intersections: traffic lights downtown, stop signs elsewhere
  const xs = roads.filter((r) => r.axis === 'x' && r.kind !== 'dirt');
  const zs = roads.filter((r) => r.axis === 'z' && r.kind !== 'dirt');
  for (const rx of xs) for (const rz of zs) {
    if (rz.c < rx.a0 || rz.c > rx.a1 || rx.c < rz.a0 || rx.c > rz.a1) continue;
    const downtown = (rx.kind === 'main' || rz.kind === 'main');
    const cx = rz.c, cz = rx.c;
    const ex = rz.hw + 1, ez = rx.hw + 1;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    corners.forEach(([sx, sz], i) => {
      const x = cx + sx * ex, z = cz + sz * ez;
      if (!free(x, z)) return;
      const m = RMk[z * SX + x];
      if (m === RM.ROAD || m === RM.JUNCTION) return;
      if (downtown) {
        for (let y = Y + 1; y <= Y + 3; y++) world.set(x, y, z, B.street_pole);
        // light faces traffic coming along the x road
        world.place(x, Y + 4, z, 'traffic_light', sx < 0 ? 1 : 3);
      } else if (i % 2 === 0 && h01(seed, x, z, 9) < 0.85) {
        // stop signs facing the minor road approach
        const minorIsX = rx.kind !== 'county' && (rz.kind === 'county' || rx.hw <= rz.hw);
        world.place(x, Y + 1, z, 'street_pole');
        world.place(x, Y + 2, z, 'stop_sign', minorIsX ? (sx < 0 ? 1 : 3) : (sz < 0 ? 2 : 0));
      }
    });
  }
}

/** Zones for roads: county roads ROAD, highway HIGHWAY. */
export function roadZones(ctx) {
  const { world, SX, SZ } = ctx;
  const RMk = ctx.roadMask;
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const m = RMk[z * SX + x];
      if (m === RM.HWY || m === RM.MEDIAN || (m === RM.SHOULDER && Math.abs(x - HWY_X) <= 16)) world.zone[z * SX + x] = ZONES.HIGHWAY;
      else if ((m === RM.ROAD || m === RM.SHOULDER || m === RM.JUNCTION || m === RM.DIRT) && world.zone[z * SX + x] <= ZONES.FOREST) world.zone[z * SX + x] = ZONES.ROAD;
    }
  }
}
