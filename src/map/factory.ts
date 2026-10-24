// "Brennwerk Industrial Works" — the factory level. 256 x 256 m site, 10 cm voxels.
//
// Layout (voxel coordinates, x east, z south; north is -z):
//   silos (NW) | main production hall (center N) | boiler house + chimneys (NE)
//   warehouse (W) | apron + east-west road | tank farm (E)
//   water tower, container yard, rail spur, construction site with tower crane (SW/center)
//   substation + pylon (SW) | office block + parking (SE) | scrap yard (E) | gate + guard house (S)

import { World } from '../world/world';
import { Ground } from '../world/terrain';
import { Builder } from './builder';
import { Ctx, LampDef, PropPlacement, EmitterDef } from './parts';
import { fbm2, hash2, Rng } from '../engine/math';
import { buildMainHall, buildWarehouse, buildOffice, buildBoilerHouse, buildGuardHouse, buildConstruction } from './buildings';
import { buildTankFarm, buildSilos, buildWaterTower, buildSubstation, buildContainerYard, buildRail, buildFence, buildStreetLights, buildTrees, buildScrapYard, buildPowerLines, buildYardProps } from './industrial';

export const MAP = { sx: 2560, sy: 640, sz: 2560, G: 48 };

export interface MapResult { props: PropPlacement[]; lamps: LampDef[]; emitters: EmitterDef[]; spawn: { x: number; y: number; z: number; yaw: number } }

export function generateFactory(world: World, onStep?: (name: string) => void): MapResult {
  const G = MAP.G;
  terrain(world, G);
  world.initTerrain();
  world.bulk = true;
  const c: Ctx = { b: new Builder(world, 4711), G, lamps: [], props: [], emitters: [] };
  buildMainHall(c); onStep?.('buildMainHall');
  buildWarehouse(c); onStep?.('buildWarehouse');
  buildOffice(c); onStep?.('buildOffice');
  buildBoilerHouse(c); onStep?.('buildBoilerHouse');
  buildGuardHouse(c); onStep?.('buildGuardHouse');
  buildConstruction(c); onStep?.('buildConstruction');
  buildTankFarm(c); onStep?.('buildTankFarm');
  buildSilos(c); onStep?.('buildSilos');
  buildWaterTower(c); onStep?.('buildWaterTower');
  buildSubstation(c); onStep?.('buildSubstation');
  buildContainerYard(c); onStep?.('buildContainerYard');
  buildRail(c); onStep?.('buildRail');
  buildScrapYard(c); onStep?.('buildScrapYard');
  buildFence(c); onStep?.('buildFence');
  buildStreetLights(c); onStep?.('buildStreetLights');
  buildPowerLines(c); onStep?.('buildPowerLines');
  buildTrees(c); onStep?.('buildTrees');
  buildYardProps(c); onStep?.('buildYardProps');
  world.bulk = false;
  return { props: c.props, lamps: c.lamps, emitters: c.emitters, spawn: { x: 129.0, y: G / 10 + 0.05, z: 233.0, yaw: 0 } };
}

// ---------------------------------------------------------------------------- terrain
function terrain(w: World, G: number): void {
  const t = w.terrain;
  const sx = w.sx, sz = w.sz;
  const set = (x: number, z: number, h: number, g: Ground) => { const i = x + z * sx; t.height[i] = h; t.ground[i] = g; };
  const rect = (x0: number, z0: number, x1: number, z1: number, g: Ground, h?: number) => {
    for (let z = Math.max(0, z0); z < Math.min(sz, z1); z++) for (let x = Math.max(0, x0); x < Math.min(sx, x1); x++) {
      const i = x + z * sx;
      t.ground[i] = g;
      if (h !== undefined) t.height[i] = h;
    }
  };
  // base: grass outside the fence with gentle bumps, old concrete yard inside
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const inside = x >= 80 && x < 2480 && z >= 80 && z < 2480;
    if (inside) { set(x, z, G, Ground.ConcreteOld); continue; }
    const n = fbm2(x * 0.006, z * 0.006, 4, 11);
    let h = G + Math.round((n - 0.45) * 10);
    // north embankment
    if (z < 80) h += Math.round((1 - z / 80) * 25 * (0.6 + 0.4 * fbm2(x * 0.01, 3, 2, 5)));
    const dry = fbm2(x * 0.02, z * 0.02, 3, 77) > 0.62;
    set(x, z, Math.max(G - 4, h), dry ? Ground.GrassDry : Ground.Grass);
  }
  // patches inside the yard: newer concrete slabs, gravel, dirt
  for (let z = 80; z < 2480; z++) for (let x = 80; x < 2480; x++) {
    const n = fbm2(x * 0.004, z * 0.004, 3, 21);
    const i = x + z * sx;
    if (n > 0.62) t.ground[i] = Ground.Concrete;
    else if (n < 0.3) t.ground[i] = Ground.Gravel;
    // concrete expansion joints (dark seams every 4 m)
    if (t.ground[i] === Ground.Concrete && ((x % 40) === 0 || (z % 40) === 0)) t.ground[i] = Ground.ConcreteOld;
  }
  // drainage ditch west of the fence
  for (let z = 0; z < sz; z++) for (let x = 20; x < 64; x++) {
    const d = Math.abs(x - 42) / 22;
    const depth = Math.round((1 - d * d) * 14);
    const i = x + z * sx;
    t.height[i] = G - depth;
    t.ground[i] = depth > 9 ? Ground.Mud : depth > 4 ? Ground.Dirt : Ground.Grass;
  }
  // building floors
  rect(780, 480, 1780, 920, Ground.Epoxy, G);        // main hall
  rect(800, 690, 1760, 700, Ground.EpoxyLine);        // walkway lines
  rect(800, 760, 1760, 770, Ground.EpoxyLine);
  rect(180, 480, 620, 980, Ground.FactoryFloor, G);   // warehouse
  for (let x = 220; x < 600; x += 100) rect(x, 500, x + 3, 960, Ground.EpoxyLine);
  rect(1480, 1900, 1830, 2200, Ground.Tiles, G);       // office
  rect(1900, 300, 2250, 620, Ground.FactoryFloor, G); // boiler house
  rect(1960, 760, 2440, 1420, Ground.Gravel, G);      // tank farm
  rect(180, 1800, 560, 2250, Ground.Gravel, G);       // substation
  rect(2000, 1500, 2440, 2000, Ground.Dirt, G);       // scrap yard
  rect(700, 1800, 1050, 2200, Ground.Dirt, G);        // construction site
  // roads
  const road = (x0: number, z0: number, x1: number, z1: number, alongX: boolean) => {
    rect(x0, z0, x1, z1, Ground.Asphalt, G);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = x + z * sx;
      const a = alongX ? x : z, across = alongX ? z - z0 : x - x0, wd = alongX ? z1 - z0 : x1 - x0;
      if (across === 3 || across === wd - 4) t.ground[i] = Ground.LineWhite;
      if (Math.abs(across - wd / 2) < 1 && (a % 60) < 30) t.ground[i] = Ground.LineYellow;
      // patched asphalt
      if (t.ground[i] === Ground.Asphalt && fbm2(x * 0.03, z * 0.03, 2, 99) > 0.68) t.ground[i] = Ground.AsphaltPatch;
    }
  };
  road(1240, 1080, 1340, 2560, false);  // main avenue to the gate
  road(100, 1000, 2450, 1080, true);    // east-west road
  road(620, 480, 700, 1000, false);     // warehouse dock road
  road(1340, 1080, 1900, 1150, true);   // to the east yard
  road(1820, 300, 1900, 1000, false);   // service road north-east
  // parking lot
  rect(1450, 2240, 1900, 2420, Ground.Asphalt, G);
  for (let x = 1470; x < 1890; x += 26) rect(x, 2250, x + 2, 2320, Ground.LineWhite);
  for (let x = 1470; x < 1890; x += 26) rect(x, 2340, x + 2, 2410, Ground.LineWhite);
  // hall apron and loading area
  rect(780, 920, 1780, 1000, Ground.Concrete, G);
  rect(700, 480, 780, 1000, Ground.Concrete, G);
  // rail ballast bed
  rect(0, 1096, 1960, 1140, Ground.Ballast, G + 1);
  // coal pile next to the boiler house
  mound(t, sx, 1920, 690, 75, 26, Ground.Coal, G);
  // gravel and sand piles at the construction site
  mound(t, sx, 760, 2140, 45, 14, Ground.Gravel, G);
  mound(t, sx, 860, 2160, 35, 10, Ground.Sand, G);
  // dirt mound in the scrap yard
  mound(t, sx, 2350, 1900, 55, 12, Ground.Dirt, G);
  // rain puddles on roads and yards (flat ground only, never on building floors)
  const prng = new Rng(4711);
  const wet = new Set<number>([Ground.Asphalt, Ground.AsphaltPatch, Ground.LineWhite, Ground.LineYellow, Ground.Concrete, Ground.ConcreteOld, Ground.Gravel, Ground.Dirt]);
  for (let k = 0; k < 90; k++) {
    const cx = prng.int(100, 2460), cz = prng.int(100, 2460);
    if (!wet.has(t.ground[cx + cz * sx]) || t.height[cx + cz * sx] !== G) continue;
    const R = prng.range(5, 26), seed = prng.int(0, 9999);
    for (let z = Math.floor(cz - R * 1.4); z <= cz + R * 1.4; z++) for (let x = Math.floor(cx - R * 1.4); x <= cx + R * 1.4; x++) {
      if (x < 0 || z < 0 || x >= sx || z >= sz) continue;
      const i = x + z * sx;
      if (!wet.has(t.ground[i]) || t.height[i] !== G) continue;
      const d = Math.hypot(x - cx, (z - cz) * 1.3) / R + (fbm2(x * 0.08, z * 0.08, 2, seed) - 0.5) * 0.9;
      if (d < 1) t.ground[i] = Ground.Puddle;
    }
  }
  void hash2;
}

function mound(t: World['terrain'], sx: number, cx: number, cz: number, r: number, h: number, g: Ground, G: number): void {
  for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d >= 1) continue;
    const n = fbm2(x * 0.05, z * 0.05, 2, 3);
    const hh = Math.round(h * (1 - d * d) * (0.8 + 0.4 * n));
    const i = x + z * sx;
    if (hh <= 0) continue;
    t.height[i] = Math.max(t.height[i], G + hh);
    t.ground[i] = g;
  }
}
