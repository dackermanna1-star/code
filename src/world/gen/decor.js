// Street-level decay: parked and crashed cars, police roadblocks, survivor barricades, burning wrecks,
// litter, flyers on the ground, overgrown lawns and street trees.
import { B, BLOCKS, SOLID } from '../blocks.js';
import { SURFACE } from '../World.js';
import { makeRng, hash01 } from '../../core/rng.js';
import { RM } from './roads.js';
import { CAR_COLORS } from './util.js';
import { OCC } from './plan.js';
import { tree } from './vegetation.js';

const Y0 = SURFACE, Y = Y0 + 1;
const CARS = [['sedan', 30], ['suv', 22], ['pickup', 16], ['hatchback', 14], ['van', 8], ['police', 1.2]];

function carOpts(rng, type, o = {}) {
  const burned = o.burned ?? rng.chance(0.06);
  return {
    color: type === 'police' ? 0x1a1a2a : rng.pick(CAR_COLORS), wrecked: burned || rng.chance(o.wreck ?? 0.12), burned,
    alarm: !burned && rng.chance(0.1), loot: type === 'police' ? 'police_car_trunk' : type === 'pickup' ? 'pickup_bed' : 'car_trunk', gloveLoot: 'car_glovebox',
  };
}

export function buildDecor(ctx) {
  const { world, roads, SX } = ctx;
  const rng = makeRng(ctx.seed ^ 0xdec0);
  let parked = 0, crashes = 0;
  // ---------------------------------------------------------------- parked / abandoned cars
  for (const r of roads) {
    if (r.kind === 'dirt' || r.industrial) continue;
    const dens = r.kind === 'main' ? 0.2 : r.kind === 'street' ? 0.04 : 0.01;
    const off = r.kind === 'main' ? r.hw - 0.6 : r.hw - 1.2;
    for (let a = r.a0 + 6; a <= r.a1 - 6; a += r.kind === 'main' ? 6 : 7) {
      for (const side of [-1, 1]) {
        if (!rng.chance(dens)) continue;
        const type = rng.weighted(CARS);
        let x, z, yaw;
        if (r.axis === 'x') { x = a + rng.range(-1, 1); z = r.c + side * off + 0.5; yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
        else { x = r.c + side * off + 0.5; z = a + rng.range(-1, 1); yaw = side < 0 ? 0 : Math.PI; }
        const k = Math.floor(z) * SX + Math.floor(x);
        if (ctx.roadMask[k] !== RM.ROAD) continue;
        yaw += rng.range(-0.08, 0.08);
        if (r.kind === 'county' && rng.chance(0.5)) yaw += rng.range(-0.6, 0.6); // ran off / swerved
        if (ctx.addVehicle({ type, x, y: Y, z, yaw, ...carOpts(rng, type, { wreck: r.kind === 'county' ? 0.35 : 0.1 }) })) parked++;
      }
    }
  }
  // ---------------------------------------------------------------- crash scenes at intersections
  const xs = roads.filter((r) => r.axis === 'x' && r.kind !== 'dirt'), zs = roads.filter((r) => r.axis === 'z' && r.kind !== 'dirt');
  const junctions = [];
  for (const rx of xs) for (const rz of zs) if (rz.c >= rx.a0 && rz.c <= rx.a1 && rx.c >= rz.a0 && rx.c <= rz.a1) junctions.push([rz.c, rx.c, rx.kind === 'main' || rz.kind === 'main']);
  rng.shuffle(junctions);
  for (const [cx, cz, dt] of junctions.slice(0, 14)) {
    const t1 = rng.weighted(CARS), t2 = rng.weighted(CARS);
    if (rng.chance(0.4)) for (let k = 0; k < 3; k++) { const tx = cx + rng.int(-4, 4), tz = cz + rng.int(-4, 4); if (world.get(tx, Y, tz) === 0 && SOLID[world.get(tx, Y0, tz)]) world.set(tx, Y, tz, B.traffic_cone); }
    const a = rng.range(0, Math.PI * 2);
    const ok1 = ctx.addVehicle({ type: t1, x: cx + 0.5 + Math.cos(a) * 1.5, y: Y, z: cz + 0.5 + Math.sin(a) * 1.5, yaw: a + rng.range(-0.5, 0.5), ...carOpts(rng, t1, { wreck: 0.9 }) });
    const ok2 = ctx.addVehicle({ type: t2, x: cx + 0.5 - Math.cos(a) * 2.8, y: Y, z: cz + 0.5 - Math.sin(a) * 2.8, yaw: a + Math.PI / 2 + rng.range(-0.4, 0.4), ...carOpts(rng, t2, { wreck: 0.9, burned: rng.chance(0.25) }) });
    if (ok1 || ok2) crashes++;
    if (rng.chance(0.6)) ctx.addCorpse({ x: cx + rng.range(-4, 4), y: Y, z: cz + rng.range(-4, 4), yaw: rng.range(0, 6.28), outfit: rng.pick(['civilian', 'civilian_f']), loot: 'corpse_civilian' });
    if (rng.chance(0.5)) ctx.addZombies({ x: cx + rng.range(-5, 5), y: Y, z: cz + rng.range(-5, 5), count: rng.int(2, dt ? 5 : 3), radius: 6 });
    if (rng.chance(0.3)) { const fx = cx + rng.int(-3, 3), fz = cz + rng.int(-3, 3); if (world.get(fx, Y, fz) === 0 && SOLID[world.get(fx, Y0, fz)]) world.set(fx, Y, fz, B.fire); }
  }
  ctx.stats.parkedCars = parked; ctx.stats.crashScenes = crashes;
  // ---------------------------------------------------------------- police roadblocks
  roadblock(ctx, rng, 'z', 512, 248, 3, 'Route 9 Roadblock');
  roadblock(ctx, rng, 'x', 512, 214, 3, 'Mill Creek Bridge Roadblock');
  roadblock(ctx, rng, 'z', 512, 786, 3, null);
  // ---------------------------------------------------------------- survivor barricade on Lincoln Ave (north of Church St)
  survivorBarricade(ctx, rng, 512, 440);
  survivorBarricade(ctx, rng, 330, 520);
  // ---------------------------------------------------------------- litter, flyers, loot, weeds, street trees
  const flyers = ['flyer_quarantine', 'newspaper', 'evac_flyer', 'flyer_quarantine'];
  let nFly = 0;
  for (let z = 2; z < ctx.SZ - 2; z++) for (let x = 2; x < SX - 2; x++) {
    const k = z * SX + x;
    const m = ctx.roadMask[k];
    const h = hash01(ctx.seed, x, z, 911);
    if (m === RM.WALK) {
      if (world.get(x, Y, z) !== 0) continue;
      if (h < 0.004) world.set(x, Y, z, B.trash_bags);
      else if (h < 0.0055) world.set(x, Y, z, B.rubble);
      else if (h < 0.0065) { world.addNote(x + 0.5, Y, z + 0.5, flyers[nFly++ % flyers.length]); }
      else if (h < 0.009) world.addFloorLoot(x + 0.5, Y, z + 0.5, 'floor_street', 0.6);
      else if (h < 0.02) world.set(x, Y, z, B.tall_grass);
    } else if (m === RM.ROAD || m === RM.JUNCTION) {
      if (world.get(x, Y, z) !== 0) continue;
      if (h < 0.0012) world.addFloorLoot(x + 0.5, Y, z + 0.5, 'floor_street', 0.5);
      else if (h < 0.0016) world.set(x, Y, z, B.trash_bags);
    } else if (ctx.occ[k] === OCC.LOT && world.get(x, Y0, z) === B.grass && world.get(x, Y, z) === 0) {
      // overgrown lawns after two weeks without mowing
      if (h < 0.12) world.set(x, Y, z, B.tall_grass);
      else if (h < 0.125) world.set(x, Y, z, B.flower_yellow);
      else if (h < 0.128) world.set(x, Y, z, B.dead_bush);
    } else if (m === 0 && ctx.occ[k] === OCC.ROAD && world.get(x, Y0, z) === B.grass && world.get(x, Y, z) === 0) {
      // grass strips between sidewalk and lots: occasional street trees
      const nearWalk = ctx.roadMask[k - 1] === RM.WALK || ctx.roadMask[k + 1] === RM.WALK || ctx.roadMask[k - SX] === RM.WALK || ctx.roadMask[k + SX] === RM.WALK;
      if (nearWalk && h < 0.03 && clearAround(world, x, z)) tree(world, x, Y, z, h < 0.02 ? 'oak' : 'birch', h * 30, ctx.seed);
      else if (h > 0.85) world.set(x, Y, z, B.tall_grass);
    }
  }
  for (const id of flyers) ctx.usedNotes.add(id);
  ctx.stats.flyers = nFly;
}

function clearAround(world, x, z) {
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let y = Y; y <= Y + 7; y++) {
    const id = world.get(x + dx, y, z + dz);
    if (id !== 0 && BLOCKS[id].render !== 'cross') return false;
  }
  return true;
}

function roadblock(ctx, rng, axis, c, a, hw, name) {
  const { world } = ctx;
  // jersey barriers across the road with a gap, cones, police cars angled
  for (let o = -hw - 1; o <= hw + 1; o++) {
    const [x, z] = axis === 'z' ? [c + o, a] : [a, c + o];
    if (o === 0) continue;
    if (world.get(x, Y, z) === 0) world.place(x, Y, z, 'jersey_barrier', axis === 'z' ? 0 : 1);
    const [x2, z2] = axis === 'z' ? [c + o, a + 3] : [a + 3, c + o];
    if (rng.chance(0.5) && world.get(x2, Y, z2) === 0) world.set(x2, Y, z2, B.traffic_cone);
  }
  const vx = axis === 'z' ? c - 1.5 : a - 5, vz = axis === 'z' ? a - 5 : c - 1.5;
  ctx.addVehicle({ type: 'police', x: vx, y: Y, z: vz, yaw: axis === 'z' ? 1.2 : 0.4, color: 0x1a1a2a, loot: 'police_car_trunk', gloveLoot: 'car_glovebox', alarm: true });
  ctx.addVehicle({ type: 'police', x: axis === 'z' ? c + 2 : a - 9, y: Y, z: axis === 'z' ? a - 9 : c + 2, yaw: axis === 'z' ? -1.0 : 1.9, color: 0x1a1a2a, loot: 'police_car_trunk', gloveLoot: 'car_glovebox', wrecked: true });
  ctx.addCorpse({ x: vx + 2, y: Y, z: vz + 2, yaw: rng.range(0, 6), outfit: 'police', loot: 'corpse_police' });
  ctx.addZombies({ x: vx, y: Y, z: vz - 4, count: rng.int(2, 3), radius: 5, outfit: 'police' });
  if (name) ctx.addPOI({ name, type: 'roadblock', x0: (axis === 'z' ? c : a) - 8, z0: (axis === 'z' ? a : c) - 8, x1: (axis === 'z' ? c : a) + 8, z1: (axis === 'z' ? a : c) + 8 });
}

function survivorBarricade(ctx, rng, cx, cz) {
  const { world } = ctx;
  // cars pushed across the road + barricade blocks + sandbags + burning barrels
  for (let o = -6; o <= 6; o++) {
    const x = cx + o, z = cz;
    if (world.get(x, Y, z) !== 0) continue;
    const r = rng.next();
    world.set(x, Y, z, r < 0.45 ? B.barricade : r < 0.7 ? B.sandbags : r < 0.8 ? B.pallet : 0);
    if (r < 0.3 && world.get(x, Y + 1, z) === 0) world.set(x, Y + 1, z, B.barricade);
  }
  for (const o of [-8, 8]) if (world.get(cx + o, Y, cz + 2) === 0) world.set(cx + o, Y, cz + 2, B.barrel_burning);
  ctx.addVehicle({ type: 'pickup', x: cx - 3, y: Y, z: cz - 3, yaw: Math.PI / 2 + 0.2, color: rng.pick(CAR_COLORS), loot: 'pickup_bed', wrecked: true });
  ctx.addVehicle({ type: 'sedan', x: cx + 4, y: Y, z: cz - 3.5, yaw: Math.PI / 2 - 0.3, color: rng.pick(CAR_COLORS), loot: 'car_trunk', wrecked: true });
  for (let k = 0; k < 4; k++) ctx.addCorpse({ x: cx + rng.range(-6, 6), y: Y, z: cz + rng.range(1, 6), yaw: rng.range(0, 6), outfit: rng.pick(['survivor', 'civilian']), loot: 'corpse_survivor' });
  ctx.addLoot(cx, Y, cz - 2, 'floor_camp', 0.8);
  ctx.addZombies({ x: cx, y: Y, z: cz + 6, count: rng.int(3, 5), radius: 6 });
}
