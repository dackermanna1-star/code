/**
 * Vehicle sandbox: http://localhost:5173/?sandbox=vehicles
 *
 *   &car=hatchback|pickup|bus|coupe|armored   which car (default hatchback)
 *   &tier=0..4                               all upgrade slots at this tier
 *   &armor=, &booster=, &fuel=, &tires=, &engine=, &weapon=  per-slot override
 *   &damage=0..1                             start damaged (visual test)
 *   &view=drive (default) | cars | tiers     drive test track, or a static showroom
 *   &cam=side|front|top|rear                 showroom camera angle
 *   &x=,&z=,&yaw=                            spawn position (drive view)
 *
 * Drive: W/S throttle/brake(reverse), A/D steer, Shift boost, Ctrl/C handbrake,
 * R reset to start, T repair. In the air W/S pitch, A/D/Q/E roll.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  HemisphericLight,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  ShadowGenerator,
  StandardMaterial,
  UniversalCamera,
  Vector3,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import type { Game } from "../core/Game";
import { Time } from "../core/Time";
import { CARS, getCar, type CarId } from "../data/cars";
import { computeStats, type Loadout, type SlotId } from "../data/parts";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { CollideWith, Layer } from "../physics/Layers";
import { buildCarModel } from "./CarModel";
import { Vehicle } from "./Vehicle";

const SLOT_IDS: SlotId[] = ["engine", "fuel", "tires", "armor", "booster", "weapon"];

function loadoutFromParams(p: URLSearchParams, tierOverride?: number): Loadout {
  const tier = tierOverride ?? clampTier(parseInt(p.get("tier") ?? "0", 10));
  const l = {} as Loadout;
  for (const s of SLOT_IDS) l[s] = p.has(s) && tierOverride === undefined ? clampTier(parseInt(p.get(s)!, 10)) : tier;
  return l;
}

function clampTier(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(4, v)) : 0;
}

function lights(scene: Scene): ShadowGenerator {
  scene.clearColor = new Color4(0.62, 0.76, 0.86, 1);
  const hemi = new HemisphericLight("hemi", new Vector3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.75;
  hemi.groundColor = Color3.FromHexString("#6b5a4a");
  const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.35), scene);
  sun.intensity = 1.0;
  sun.position = new Vector3(40, 80, -40);
  const gen = new ShadowGenerator(2048, sun);
  gen.usePercentageCloserFiltering = true;
  gen.bias = 0.002;
  Shadows.set(gen);
  return gen;
}

function gridMaterial(scene: Scene, base: string, line: string): StandardMaterial {
  const tex = new DynamicTexture("grid", { width: 256, height: 256 }, scene, true);
  const c = tex.getContext() as unknown as CanvasRenderingContext2D;
  c.fillStyle = base;
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = line;
  c.lineWidth = 6;
  c.strokeRect(0, 0, 256, 256);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(128, 0);
  c.lineTo(128, 256);
  c.moveTo(0, 128);
  c.lineTo(256, 128);
  c.stroke();
  tex.update();
  tex.uScale = tex.vScale = 50;
  const m = new StandardMaterial("groundMat", scene);
  m.diffuseTexture = tex;
  m.specularColor = Color3.Black();
  return m;
}

function staticBox(scene: Scene, name: string, size: [number, number, number], pos: [number, number, number], rotX: number, color: string): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: size[0], height: size[1], depth: size[2] }, scene);
  m.position.set(...pos);
  m.rotation.x = rotX;
  m.material = toon(scene, color);
  m.receiveShadows = true;
  const agg = new PhysicsAggregate(m, PhysicsShapeType.BOX, { mass: 0, friction: 0.8 }, scene);
  agg.shape.filterMembershipMask = Layer.WORLD;
  agg.shape.filterCollideMask = CollideWith.WORLD;
  m.freezeWorldMatrix();
  Shadows.cast(m, false);
  return m;
}

/** A wedge ramp of height h and length len, starting at z0 (rising toward +z). */
function ramp(scene: Scene, x: number, z0: number, h: number, len: number, width: number, color: string): void {
  const ang = Math.atan2(h, len);
  const slope = Math.hypot(h, len);
  const t = 0.6;
  // the ramp is a tilted slab whose top surface goes from (z0, 0) to (z0+len, h)
  const cz = z0 + len / 2 + Math.sin(ang) * (t / 2);
  const cy = h / 2 - Math.cos(ang) * (t / 2);
  staticBox(scene, "ramp", [width, t, slope], [x, cy, cz], -ang, color);
  // support block under the high end
  const bh = Math.max(0.1, h - 0.8);
  staticBox(scene, "rampBase", [width - 0.4, bh, 1.2], [x, bh / 2, z0 + len - 0.8], 0, "#7a5c45");
}

function buildTrack(scene: Scene): void {
  const ground = MeshBuilder.CreateBox("ground", { width: 600, height: 1, depth: 900 }, scene);
  ground.position.set(0, -0.5, 300);
  ground.material = gridMaterial(scene, "#c9a46c", "#b38c58");
  ground.receiveShadows = true;
  const g = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.9 }, scene);
  g.shape.filterMembershipMask = Layer.WORLD;
  g.shape.filterCollideMask = CollideWith.WORLD;

  // ramps: small / medium / big (with a landing deck) on the main straight
  ramp(scene, 0, 60, 1.2, 7, 6, "#d9822b");
  ramp(scene, 0, 140, 2.4, 11, 7, "#c0392b");
  ramp(scene, 0, 240, 4.0, 15, 8, "#8e44ad");
  // side lane: kicker for flips
  ramp(scene, 18, 70, 2.8, 6, 6, "#2e86c1");

  // bumpy section (lane x = -18)
  // rounded humps (half-buried logs) of varying size and spacing
  for (let i = 0; i < 18; i++) {
    const d = 0.7 + ((i * 37) % 7) * 0.12;
    const proud = 0.12 + ((i * 53) % 5) * 0.045;
    const m = MeshBuilder.CreateCylinder("bump", { diameter: d, height: 10, tessellation: 12 }, scene);
    m.rotation.z = Math.PI / 2;
    m.position.set(-18 + ((i % 3) - 1) * 0.6, proud - d / 2, 40 + i * 3.4);
    m.material = toon(scene, i % 2 ? "#8a6a4a" : "#6e5a48");
    m.receiveShadows = true;
    const agg = new PhysicsAggregate(m, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.8 }, scene);
    agg.shape.filterMembershipMask = Layer.WORLD;
    agg.shape.filterCollideMask = CollideWith.WORLD;
    m.freezeWorldMatrix();
  }

  // a wall of light debris boxes
  const mat = toon(scene, "#b58b52");
  const mat2 = toon(scene, "#d0a868");
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const b = MeshBuilder.CreateBox("crate", { size: 0.9 }, scene);
      b.position.set(-2.25 + c * 0.92 + (r % 2) * 0.3, 0.45 + r * 0.92, 330);
      b.material = (r + c) % 2 ? mat : mat2;
      const a = new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 25, friction: 0.7, restitution: 0.1 }, scene);
      a.shape.filterMembershipMask = Layer.DEBRIS;
      a.shape.filterCollideMask = CollideWith.DEBRIS;
      Shadows.cast(b, false);
    }
  }
  // solid concrete wall far down the track for crash tests
  staticBox(scene, "wall", [14, 3, 1.5], [0, 1.5, 420], 0, "#8d8d8d");
  // lane markers
  const lineMat = toon(scene, "#f4f1de");
  for (let z = 0; z < 450; z += 12) {
    const l = MeshBuilder.CreateBox("line", { width: 0.4, height: 0.04, depth: 3 }, scene);
    l.position.set(-9, 0.02, z);
    l.material = lineMat;
    l.freezeWorldMatrix();
  }
}

async function showroom(game: Game, p: URLSearchParams): Promise<void> {
  const scene = game.scene;
  lights(scene);
  const ground = MeshBuilder.CreateGround("ground", { width: 120, height: 120 }, scene);
  ground.material = gridMaterial(scene, "#cfb486", "#bba071");
  ground.receiveShadows = true;
  const view = p.get("view");
  const carId = (p.get("car") ?? "hatchback") as CarId;
  const items: { id: CarId; loadout: Loadout }[] =
    view === "tiers"
      ? [0, 1, 2, 3, 4].map((t) => ({ id: carId, loadout: loadoutFromParams(p, t) }))
      : CARS.map((c) => ({ id: c.id, loadout: loadoutFromParams(p) }));
  let x = 0;
  const gap = 1.2;
  const placed: { x: number; w: number }[] = [];
  for (const it of items) {
    const def = getCar(it.id);
    const m = buildCarModel(scene, def, it.loadout);
    const w = def.size.width + 1.6;
    m.root.position.set(x + w / 2, -m.geometry.groundY, 0);
    if (p.has("damage")) m.setDamage(parseFloat(p.get("damage")!));
    for (const mesh of m.meshes) Shadows.cast(mesh, false);
    placed.push({ x: x + w / 2, w });
    x += w + gap;
  }
  const mid = x / 2 - gap / 2;
  for (const pl of placed) pl.x -= mid;
  scene.transformNodes.filter((t) => t.name.startsWith("car_")).forEach((t, i) => (t.position.x = placed[i].x));
  const cam = new ArcRotateCamera("cam", 0, 0, 10, new Vector3(0, 1, 0), scene);
  const angle = p.get("cam") ?? "front";
  const span = Math.max(8, x * 0.62) * parseFloat(p.get("zoom") ?? "1");
  if (p.has("az")) {
    // explicit orbit: az/el in degrees, dist in meters (az 0 = looking at the front)
    const az = (parseFloat(p.get("az")!) * Math.PI) / 180;
    const el = (parseFloat(p.get("el") ?? "20") * Math.PI) / 180;
    const d = parseFloat(p.get("dist") ?? "8");
    const tx = view === "tiers" ? placed[parseInt(p.get("focus") ?? "0", 10)]?.x ?? 0 : 0;
    cam.target.set(tx, 0.9, 0);
    cam.setPosition(new Vector3(tx + Math.sin(az) * Math.cos(el) * d, 0.9 + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d));
  } else if (angle === "side") cam.setPosition(new Vector3(span * 0.15, 3, -span * 0.95));
  else if (angle === "rear") cam.setPosition(new Vector3(span * 0.25, 4.5, -span * 0.8));
  else if (angle === "top") cam.setPosition(new Vector3(0.01, span * 1.1, -2));
  else cam.setPosition(new Vector3(-span * 0.35, 4.2, span * 0.85));
  cam.fov = 0.6;
  cam.attachControl(game.canvas, true);
  scene.activeCamera = cam;
}

/**
 * The engine's render loop dies if a frame throws, and frames can run with the
 * camera-less boot scene while this module is still loading ("No camera
 * defined"). Restart the loop once our scene has a camera.
 */
function reviveRenderLoop(game: Game): void {
  const engine = game.engine;
  engine.stopRenderLoop();
  engine.runRenderLoop(() => (game as unknown as { frame(): void }).frame());
}

export async function sandbox(game: Game): Promise<void> {
  await setup(game);
  reviveRenderLoop(game);
}

async function setup(game: Game): Promise<void> {
  const p = new URLSearchParams(location.search);
  game.resetScene();
  const view = p.get("view") ?? "drive";
  if (view === "cars" || view === "tiers") return showroom(game, p);

  const scene = game.scene;
  lights(scene);
  buildTrack(scene);

  const carId = (p.get("car") ?? "hatchback") as CarId;
  const def = getCar(carId);
  const loadout = loadoutFromParams(p);
  const stats = computeStats(def, loadout);
  if (stats.boostCapacity === 0) {
    // the sandbox always gets a little boost to test with
    stats.boostCapacity = 3;
    stats.boostForce = def.boostForce * 0.8;
  }
  const spawnPos = new Vector3(parseFloat(p.get("x") ?? "0"), 0.5, parseFloat(p.get("z") ?? "0"));
  const yaw = parseFloat(p.get("yaw") ?? "0");
  const ctx = game.ctx;
  game.input.enabled = true;
  let vehicle = new Vehicle(ctx, def, loadout, stats, { position: spawnPos, yaw });
  if (p.has("damage")) vehicle.damage(parseFloat(p.get("damage")!) * stats.health);
  game.debug.run = { vehicle };
  (window as any).vehicle = vehicle;

  scene.onBeforePhysicsObservable.add(() => vehicle.update(Time.dt));

  // event log for headless tests
  const ev = game.events;
  const log = (s: string) => console.log(`[veh] ${s}`);
  ev.on("airborne", (e) => log(`airborne at z=${e.position.z.toFixed(1)}`));
  ev.on("landed", (e) => log(`landed airTime=${e.airTime.toFixed(2)} flips=${e.flips} clean=${e.clean}`));
  ev.on("carImpact", (e) => log(`impact ${e.force.toFixed(1)} m/s hp=${vehicle.health.toFixed(0)}`));

  // simple chase camera
  const cam = new UniversalCamera("chase", new Vector3(0, 4, -10), scene);
  cam.fov = 0.9;
  cam.minZ = 0.1;
  scene.activeCamera = cam;
  const camPos = vehicle.position.add(new Vector3(0, 3, -9));
  const look = new Vector3();
  const flatFwd = new Vector3(0, 0, 1);
  const camMode = p.get("cam") ?? "chase";
  scene.onBeforeRenderObservable.add(() => {
    const v = vehicle;
    const dt = Math.min(0.05, Time.realDt || 0.016);
    const f = v.velocity.lengthSquared() > 4 ? v.velocity : v.forward;
    flatFwd.set(f.x, 0, f.z);
    if (flatFwd.lengthSquared() < 1e-4) flatFwd.set(0, 0, 1);
    flatFwd.normalize();
    const size = v.def.size.length;
    const dist = 5 + size * 1.0;
    const target =
      camMode === "side"
        ? v.position.add(new Vector3(dist * 1.3, 1.5, 0))
        : v.position.add(flatFwd.scale(-dist)).addInPlace(new Vector3(0, 1.8 + size * 0.28, 0));
    camPos.addInPlace(target.subtract(camPos).scaleInPlace(Math.min(1, dt * 6)));
    cam.position.copyFrom(camPos);
    look.copyFrom(v.position).addInPlace(flatFwd.scale(camMode === "side" ? 0 : 3)).addInPlace(new Vector3(0, 0.6, 0));
    cam.setTarget(look);
  });

  // HUD
  const hud = document.createElement("div");
  hud.style.cssText = "position:absolute;left:12px;top:12px;font:14px/1.4 monospace;color:#fff;background:rgba(0,0,0,.45);padding:8px 12px;border-radius:6px;pointer-events:none;white-space:pre";
  game.uiRoot.appendChild(hud);
  scene.onAfterRenderObservable.add(() => {
    const v = vehicle;
    hud.textContent =
      `${v.def.name} [${v.def.id}]  tiers ${SLOT_IDS.map((s) => loadout[s]).join("")}\n` +
      `${(v.forwardSpeed * 3.6).toFixed(0)} km/h  gear ${v.gear}  rpm ${v.rpm.toFixed(2)}\n` +
      `hp ${v.health.toFixed(0)}  fuel ${v.fuel.toFixed(1)}  boost ${v.boost.toFixed(1)}${v.boosting ? " BOOST" : ""}\n` +
      `${v.airborne ? `AIR ${v.airTime.toFixed(1)}s` : `wheels ${v.groundedCount}`}${v.wrecked ? "  WRECKED" : ""}\n` +
      `WASD drive · Shift boost · C handbrake · R reset · T repair`;
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR") vehicle.teleport(new Vector3(spawnPos.x, 2, spawnPos.z), yaw);
    if (e.code === "KeyT") vehicle.repair();
    if (e.code === "KeyN") {
      // next car
      const i = (CARS.findIndex((c) => c.id === vehicle.def.id) + 1) % CARS.length;
      const pos = vehicle.position.clone();
      vehicle.dispose();
      const d2 = CARS[i];
      const st2 = computeStats(d2, loadout);
      st2.boostCapacity = Math.max(3, st2.boostCapacity);
      st2.boostForce = Math.max(d2.boostForce * 0.8, st2.boostForce);
      vehicle = new Vehicle(ctx, d2, loadout, st2, { position: pos.add(new Vector3(0, 2, 0)), yaw: 0 });
      game.debug.run = { vehicle };
    }
  });
}
