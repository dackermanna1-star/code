// World generator entry point: Millbrook, Kentucky and its county, ~10 days after the outbreak.
//
//   export async function generateWorld(world, seed, onProgress)
//
// Phases: plan (roads, sites, lots: pure 2D) -> water -> terrain -> roads -> sites & houses -> vegetation ->
// street props / vehicles / decay -> zones & POIs -> sanitize registries -> heightmap.
import { makeRng } from '../../core/rng.js';
import { SURFACE, ZONES } from '../World.js';
import { B, BLOCKS, SOLID } from '../blocks.js';
import { OCC, makeRoads, makeSites } from './plan.js';
import { buildWater, distanceField } from './water.js';
import { buildTerrain } from './terrain.js';
import { reserveRoads, paintRoads, streetProps, roadZones, markRect } from './roads.js';
import { packLots, fillOcc } from './lots.js';
import { CAR_HALF, CAR_TYPES } from './util.js';
import { buildSites } from './sites.js';
import { buildLots } from './houses.js';
import { buildVegetation } from './vegetation.js';
import { buildDecor } from './decor.js';
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
    planViews: [], sectionViews: [], planLabels: [],
  };
  ctx.addPOI = (p) => {
    if (!world.pois.some((q) => q.name === p.name && q.x0 === p.x0 && q.z0 === p.z0)) world.addPOI(p);
  };
  ctx.building = (type) => { ctx.stats.buildings[type] = (ctx.stats.buildings[type] || 0) + 1; };
  ctx.addVehicle = (v) => addVehicleChecked(ctx, v);
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
  for (const s of ctx.sites) {
    if (s.island) continue;
    fillOcc(ctx, s.x0, s.z0, s.x1, s.z1, OCC.SITE, true);
  }
  reserveRoads(ctx);
  planTrails(ctx);
  packLots(ctx);

  await phase(0.08, 'Raising the hills');
  buildTerrain(ctx);

  await phase(0.2, 'Paving the roads');
  paintRoads(ctx);
  paintTrails(ctx);

  await phase(0.3, 'Building downtown Millbrook');
  await buildSites(ctx, async (f, l) => phase(0.3 + f * 0.3, l));

  await phase(0.6, 'Building the suburbs');
  buildLots(ctx);

  await phase(0.75, 'Growing the forests');
  buildVegetation(ctx);

  await phase(0.88, 'Abandoning the streets');
  streetProps(ctx);
  buildDecor(ctx);
  roadZones(ctx);

  await phase(0.96, 'Counting the dead');
  sanitize(ctx);
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
  for (const [i, m] of world.meta) {
    const d = BLOCKS[world.blocks[i]];
    if (!d.oriented && !d.door && d.name !== 'sign_letter') {
      // keep extra bits only for oriented blocks
      world.meta.delete(i);
    }
    void m;
  }
  void SURFACE; void ZONES; void markRect;
}
