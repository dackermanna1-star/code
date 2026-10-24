// Headless vehicle physics harness: node scripts/simtest.ts [vehicleId] [scenario]
import { World } from '../src/sim/world.ts';
import { Heightfield } from '../src/sim/terrain.ts';
import { Surface } from '../src/sim/surfaces.ts';
import { Collider } from '../src/sim/colliders.ts';
import { Vehicle } from '../src/sim/vehicle/vehicle.ts';
import { getVehicleDef } from '../src/sim/vehicle/defs.ts';

const id = process.argv[2] ?? 'meridian';
const scenario = process.argv[3] ?? 'all';

function makeWorld(): World {
  const w = new World();
  const t = new Heightfield(513, 513, 4, -1024, -1024, 4);
  t.materials.fill(Surface.ASPHALT);
  w.terrain = t;
  return w;
}

function run(w: World, v: Vehicle, seconds: number, each?: (t: number) => void) {
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    v.frameUpdate(1 / 60);
    w.frameIndex++;
    for (let s = 0; s < 33; s++) w.substep();
    each?.(f / 60);
  }
  v.frameUpdate(0);
}

const def = getVehicleDef(id);
console.log(`== ${def.name}`);

if (scenario === 'all' || scenario === 'settle') {
  const w = makeWorld();
  const v = new Vehicle(def, w);
  w.addBody(v.body);
  w.addController(v);
  console.log(`nodes ${v.body.n} beams ${v.body.m} tris ${v.body.t} mass ${v.body.totalMass.toFixed(0)}`);
  v.spawn(0, 0, 0, 0);
  const t0 = performance.now();
  run(w, v, 3);
  const t1 = performance.now();
  console.log(`settle: pos y=${v.position[1].toFixed(3)} speed=${v.speed.toFixed(3)} unstable=${v.body.unstable} compression=${v.wheels.map(x=>x.compression.toFixed(3)).join(',')} loads=${v.wheels.map(x=>x.load.toFixed(0)).join(',')}`);
  console.log(`  sim cost: ${((t1 - t0) / 180).toFixed(2)} ms per frame (33 substeps)`);
  let maxStrain = 0;
  for (let b = 0; b < v.body.m; b++) maxStrain = Math.max(maxStrain, v.body.beamStrain(b));
  console.log(`  max plastic strain after settle: ${maxStrain.toFixed(4)}  rpm=${v.drivetrain.rpm.toFixed(0)} gear=${v.drivetrain.gear}`);
}

if (scenario === 'all' || scenario === 'accel') {
  const w = makeWorld();
  const v = new Vehicle(def, w);
  w.addBody(v.body);
  w.addController(v);
  v.spawn(0, 0, -200, 0);
  run(w, v, 1.5);
  v.input.throttle = 1;
  let t100 = -1;
  run(w, v, 30, (t) => {
    if (t100 < 0 && v.speed > 100 / 3.6) t100 = t;
  });
  console.log(`accel: 0-100 ${t100.toFixed(2)}s, speed after 30s ${(v.speed * 3.6).toFixed(1)} km/h gear ${v.drivetrain.gear} rpm ${v.drivetrain.rpm.toFixed(0)} pos z ${v.position[2].toFixed(0)} y ${v.position[1].toFixed(2)}`);
  // brake
  v.input.throttle = 0;
  v.input.brake = 1;
  const z0 = v.position[2];
  const s0 = v.speed;
  let tStop = -1;
  run(w, v, 8, (t) => { if (tStop < 0 && v.speed < 0.3) tStop = t; });
  console.log(`brake from ${(s0 * 3.6).toFixed(0)} km/h: ${(v.position[2] - z0).toFixed(1)} m in ${tStop.toFixed(2)} s, speed ${v.speed.toFixed(2)}`);
}

if (scenario === 'all' || scenario === 'turn') {
  const w = makeWorld();
  const v = new Vehicle(def, w);
  w.addBody(v.body);
  w.addController(v);
  v.spawn(0, 0, -150, 0, 15);
  run(w, v, 1);
  v.input.throttle = 0.35;
  v.input.steer = 0.5;
  let minR = 0;
  run(w, v, 6);
  const sp = Math.hypot(v.velocity[0], v.velocity[2]);
  console.log(`turn: speed ${(sp * 3.6).toFixed(1)} km/h, pos ${v.position[0].toFixed(1)},${v.position[2].toFixed(1)} up.y ${v.upDir[1].toFixed(3)} unstable ${v.body.unstable}`);
  void minR;
}

if (scenario === 'all' || scenario === 'crash') {
  for (const kmh of [30, 50, 80]) {
    const w = makeWorld();
    const wall = Collider.box(3, 1.5, 0.5).setPosition(0, 1.5, 12);
    w.addStatic(wall);
    const v = new Vehicle(def, w);
    w.addBody(v.body);
    w.addController(v);
    v.spawn(0, 0, 0, 0, kmh / 3.6);
    run(w, v, 0.1);
    const len0 = v.body.max[2] - v.body.min[2];
    // measure front crush: distance from cabin ref to front-most body node along z
    run(w, v, 2.5);
    v.body.computeBounds();
    let maxStrain = 0, broken = 0;
    for (let b = 0; b < v.body.m; b++) { maxStrain = Math.max(maxStrain, v.body.beamStrain(b)); if (v.body.isBroken(b)) broken++; }
    const len1 = v.body.max[2] - v.body.min[2];
    const det = v.body.parts.filter(p => p.detached).map(p => p.name);
    console.log(`crash ${kmh} km/h: length ${len0.toFixed(2)} -> ${len1.toFixed(2)} (crush ${(len0 - len1).toFixed(2)} m), broken beams ${broken}, detached [${det.join(',')}], engine dmg ${v.damage.engine.toFixed(2)}, unstable ${v.body.unstable}, speed ${v.speed.toFixed(2)}, windows ${Array.from(v.windowState).join('')}`);
  }
}
