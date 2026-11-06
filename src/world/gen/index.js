// World generator entry point: Millbrook, Kentucky and its county, ~10 days after the outbreak.
//
//   export async function generateWorld(world, seed, onProgress, opts?) -> ctx
//     seed: number (or string -> seedFromString). onProgress(fraction01, label) is awaited between phases.
//     opts.debug: record floor-plan labels / reachability checks for dev/worldgen-run.mjs (never changes the world).
//     Returns the generation context (stats in ctx.stats, also stored on world.genStats); safe to discard.
//
// Phases: plan (roads, sites, lots: pure 2D) -> water -> terrain -> roads -> sites & houses -> vegetation ->
// street props / vehicles / decay -> zones & POIs -> sanitize registries -> heightmap.
// Everything is deterministic from the seed (makeRng / hash / noise from core/rng.js only).
import { makeRng, seedFromString } from '../../core/rng.js';
import { WATER_LEVEL } from '../World.js';
import { B, BLOCKS, SOLID } from '../blocks.js';
import { OCC, makeRoads, makeSites } from './plan.js';
import { buildWater, distanceField } from './water.js';
import { buildTerrain } from './terrain.js';
import { reserveRoads, paintRoads, streetProps, roadZones } from './roads.js';
import { packLots, fillOcc } from './lots.js';
import { CAR_HALF, CAR_TYPES } from './util.js';
import { buildSites } from './sites.js';
import { buildLots } from './houses.js';
import { buildVegetation } from './vegetation.js';
import { buildDecor } from './decor.js';
import { buildHighwayJam } from './military.js';
import { roofClutter } from './building.js';
import { planTrails, paintTrails } from './trails.js';

export { NOTES, RADIO_BROADCASTS } from './lore.js';

export function createContext(world, seed) {
  const SX = world.SX, SZ = world.SZ;
  const ctx = {
    world, seed: seed >>> 0, SX, SZ,
    rng: makeRng(seed ^ 0x6a09e667),
    stats: { buildings: {} },
    openings: new Set(),
    usedNotes: new Set(),
    occ: new Uint8Array(SX * SZ),
    flat: new Uint8Array(SX * SZ),
    roads: [], sites: [], lots: [],
    vehicleIndex: [],
    timings: {},
    planViews: [], sectionViews: [], planLabels: [], reachChecks: [],
  };
  ctx.addPOI = (p) => {
    if (!world.pois.some((q) => q.name === p.name && q.x0 === p.x0 && q.z0 === p.z0)) world.addPOI(p);
  };
  ctx.building = (type) => { ctx.stats.buildings[type] = (ctx.stats.buildings[type] || 0) + 1; };
  ctx.addVehicle = (v) => addVehicleChecked(ctx, v);
  // world-coordinate helpers that snap to the nearest standable cell
  ctx.freeAt = (x, y, z, r = 4) => {
    const ok = (bx, bz) => !SOLID[world.get(bx, y, bz)] && !SOLID[world.get(bx, y + 1, bz)] && SOLID[world.get(bx, y - 1, bz)] && !BLOCKS[world.get(bx, y, bz)].damage;
    const x0 = Math.floor(x), z0 = Math.floor(z);
    if (ok(x0, z0)) return [x, z];
    for (let rr = 1; rr <= r; rr++) for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== rr) continue;
      if (ok(x0 + dx, z0 + dz)) return [x0 + dx + 0.5, z0 + dz + 0.5];
    }
    return null;
  };
  ctx.addZombies = (zs) => { const p = ctx.freeAt(zs.x, zs.y, zs.z, 6); if (p) world.addZombieSpawn({ ...zs, x: p[0], z: p[1] }); };
  ctx.addCorpse = (c) => { const p = ctx.freeAt(c.x, c.y, c.z, 4); if (p) world.addCorpse({ ...c, x: p[0], z: p[1] }); };
  ctx.addLoot = (x, y, z, t, ch) => { const p = ctx.freeAt(x, y, z, 3); if (p) world.addFloorLoot(p[0], y, p[1], t, ch); };
  ctx.label = (fr, r, text) => {
    if (!ctx.debugLabels) return;
    const wr = fr.worldRect(r.x0, r.z0, r.x1, r.z1);
    ctx.planLabels.push({ x: Math.floor((wr.x0 + wr.x1) / 2), z: wr.z0, y: r.y + 1, text });
  };

  return ctx;
}

/** Vehicle placement with a footprint test against solid blocks and other vehicles. */
function addVehicleChecked(ctx, v) {
  const { world } = ctx;
  if (!CAR_TYPES.includes(v.type)) throw new Error('bad vehicle type ' + v.type);
  const [hx, hz] = CAR_HALF[v.type] || [1, 2.4];
  const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
  const y0 = Math.floor(v.y);
  // sample the footprint
  for (let a = -hz + 0.25; a <= hz - 0.25 + 1e-6; a += 0.5) {
    for (let b = -hx + 0.2; b <= hx - 0.2 + 1e-6; b += 0.5) {
      const x = v.x + s * a + c * b, z = v.z + c * a - s * b;
      const bx = Math.floor(x), bz = Math.floor(z);
      if (bx < 1 || bz < 1 || bx >= world.SX - 1 || bz >= world.SZ - 1) return false;
      for (let y = y0; y <= y0 + 1; y++) if (SOLID[world.get(bx, y, bz)]) return false;
      if (!SOLID[world.get(bx, y0 - 1, bz)] && world.get(bx, y0 - 1, bz) !== B.water) return false;
    }
  }
  const r = Math.max(hx, hz);
  for (const o of ctx.vehicleIndex) {
    const dx = o.x - v.x, dz = o.z - v.z;
    const rr = (o.r + r) * 0.72;
    if (Math.abs(o.y - v.y) < 2 && dx * dx + dz * dz < rr * rr) {
      // finer test: oriented rectangle overlap via separating axis
      if (obbOverlap(o, { x: v.x, z: v.z, yaw: v.yaw, hx, hz })) return false;
    }
  }
  ctx.vehicleIndex.push({ x: v.x, y: v.y, z: v.z, yaw: v.yaw, hx, hz, r });
  if (v.color === undefined) v.color = 0x777777;
  world.addVehicle(v);
  ctx.stats.vehicles = (ctx.stats.vehicles || 0) + 1;
  return true;
}

function obbOverlap(a, b) {
  const axes = [];
  for (const o of [a, b]) {
    const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
    axes.push([s, c], [c, -s]);
  }
  for (const [ax, az] of axes) {
    const proj = (o) => {
      const s = Math.sin(o.yaw), c = Math.cos(o.yaw);
      const ctr = o.x * ax + o.z * az;
      const ext = Math.abs((s * ax + c * az) * o.hz) + Math.abs((c * ax - s * az) * o.hx);
      return [ctr - ext, ctr + ext];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 < b0 - 0.3 || b1 < a0 - 0.3) return false;
  }
  return true;
}

export async function generateWorld(world, seed, onProgress = async () => {}, opts = {}) {
  if (typeof seed === 'string') seed = /^\d+$/.test(seed) ? Number(seed) : seedFromString(seed);
  seed = (Number(seed) || 0) >>> 0;
  const T0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const now = () => (typeof performance !== 'undefined' ? performance : Date).now();
  world.seed = seed >>> 0;
  const ctx = createContext(world, seed);
  ctx.debugLabels = !!opts.debug;
  let tPhase = now();
  const phase = async (frac, label) => {
    const t = now();
    ctx.timings[ctx._lastLabel || 'start'] = Math.round(t - tPhase);
    tPhase = t;
    ctx._lastLabel = label;
    await onProgress(frac, label);
  };

  await phase(0.0, 'Surveying Millbrook County');
  // ---------------------------------------------------------------- plan
  ctx.roads = makeRoads();
  ctx.sites = makeSites();
  buildWater(ctx);
  const dW = distanceField(ctx.water, ctx.SX, ctx.SZ, 16);
  for (let k = 0; k < dW.length; k++) {
    if (ctx.water[k]) ctx.occ[k] = OCC.WATER;
    else if (dW[k] <= 5) ctx.occ[k] = OCC.MARGIN;
  }
  for (const s of ctx.sites) fillOcc(ctx, s.x0, s.z0, s.x1, s.z1, OCC.SITE, !s.island);
  reserveRoads(ctx);
  planTrails(ctx);
  packLots(ctx);

  await phase(0.08, 'Raising the hills');
  await buildTerrain(ctx, (f) => onProgress(0.08 + f * 0.1, 'Raising the hills'));

  await phase(0.2, 'Paving the roads');
  paintRoads(ctx);
  paintTrails(ctx);

  await phase(0.3, 'Building downtown Millbrook');
  await buildSites(ctx, async (f, l) => phase(0.3 + f * 0.3, l));

  await phase(0.6, 'Building the suburbs');
  buildLots(ctx);

  roofClutter(ctx);
  await phase(0.75, 'Growing the forests');
  buildVegetation(ctx);

  await phase(0.88, 'Abandoning the streets');
  streetProps(ctx);
  buildHighwayJam(ctx);
  buildDecor(ctx);
  roadZones(ctx);

  ctx.addPOI({ name: 'Downtown Millbrook', type: 'town', x0: 380, z0: 447, x1: 613, z1: 577 });
  ctx.addPOI({ name: 'Lake Millbrook', type: 'water', x0: 113, z0: 126, x1: 297, z1: 250 });
  ctx.addPOI({ name: 'Mill Creek', type: 'water', x0: 150, z0: 260, x1: 200, z1: 640 });
  await phase(0.96, 'Counting the dead');
  sanitize(ctx);
  ctx.stats.shoreSteps = shoreSteps(world);
  world.computeHeightmap();
  world.genStats = ctx.stats;
  world.genStats.timings = ctx.timings;
  await phase(1.0, 'Done');
  ctx.stats.totalMs = Math.round(now() - T0);
  return ctx;
}

/** Remove stale registry entries / meta for overwritten blocks. */
function sanitize(ctx) {
  const { world } = ctx;
  for (const [i, c] of world.containers) {
    const d = BLOCKS[world.blocks[i]];
    if (!d.container) world.containers.delete(i);
  }
  for (const [i, d] of world.doors) {
    if (!BLOCKS[world.blocks[i]].door) world.doors.delete(i);
  }
  // meta is only meaningful for oriented blocks, doors and sign letters
  for (const i of world.meta.keys()) {
    const d = BLOCKS[world.blocks[i]];
    if (!d.oriented && !d.door && d.name !== 'sign_letter') world.meta.delete(i);
  }
  // A new character must not wake up next to a pack: street scenes (crashes, roadblocks) are decorated after
  // the spawn houses were chosen, so drop start points with a static zombie group right outside the door
  // (or inside the same house). Keep a healthy pool of starts either way.
  const crowded = (sp) => world.zombieSpawns.some((s) => {
    const d = Math.hypot(s.x - sp.x, s.z - sp.z);
    return Math.abs(s.y - sp.y) < 4 && (s.indoor ? d < 8 : d < 18);
  });
  const safe = world.spawnPoints.filter((sp) => !crowded(sp));
  if (safe.length >= Math.min(8, world.spawnPoints.length)) world.spawnPoints = safe;
}

// Lower natural ground by one block right at the water's edge where the bank is 2 blocks high, so a swimmer can
// always step out (water surface y=WATER_LEVEL, town ground top y=SURFACE=WATER_LEVEL+2).
function shoreSteps(world) {
  const { SX, SZ } = world;
  const WL = WATER_LEVEL;
  const NATURAL = new Set([B.grass, B.dirt, B.dry_grass, B.forest_floor, B.sand, B.gravel, B.mud]);
  const PLANTS = new Set([B.tall_grass, B.fern, B.flower_red, B.flower_yellow, B.flower_white, B.dead_bush, B.reeds, B.bush]);
  let n = 0;
  for (let z = 1; z < SZ - 1; z++) {
    for (let x = 1; x < SX - 1; x++) {
      if (world.get(x, WL, z) !== B.water || world.get(x, WL + 1, z) !== 0) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        const top = world.get(nx, WL + 2, nz);
        if (!NATURAL.has(top)) continue;
        if (world.get(nx, WL + 1, nz) === 0 || world.get(nx, WL + 1, nz) === B.water) continue;
        const above = world.get(nx, WL + 3, nz);
        if (above !== 0 && !PLANTS.has(above)) continue;
        if (above) world.set(nx, WL + 3, nz, 0);
        world.set(nx, WL + 2, nz, 0);
        world.set(nx, WL + 1, nz, top === B.grass || top === B.forest_floor || top === B.dry_grass ? top : B.sand);
        n++;
      }
    }
  }
  return n;
}
