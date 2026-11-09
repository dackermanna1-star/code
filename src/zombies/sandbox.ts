/**
 * Zombie sandbox: ?sandbox=zombies — a lineup of every type, then a fake car
 * blasts through them so ragdolls/severing can be inspected.
 * &mode=pose to only show the animated lineup.
 */
import { ArcRotateCamera, HemisphericLight, DirectionalLight, MeshBuilder, PhysicsAggregate, PhysicsShapeType, Vector3, ShadowGenerator } from "@babylonjs/core";
import type { Game } from "../core/Game";
import { getCar } from "../data/cars";
import { computeStats, EMPTY_LOADOUT } from "../data/parts";
import { LEVELS } from "../data/levels";
import { toon } from "../fx/Materials";
import { Shadows } from "../fx/Shadows";
import { Layer, CollideWith } from "../physics/Layers";
import { ZombieManager } from "./ZombieManager";
import type { ILevel, IVehicle } from "../core/types";

export async function sandbox(game: Game): Promise<void> {
  const scene = game.resetScene();
  const mode = new URLSearchParams(location.search).get("mode") ?? "smash";
  new HemisphericLight("h", new Vector3(0, 1, 0), scene).intensity = 0.7;
  const sun = new DirectionalLight("s", new Vector3(-0.4, -1, 0.6), scene);
  sun.position.set(20, 40, -20);
  const sg = new ShadowGenerator(1024, sun);
  Shadows.set(sg);
  const ground = MeshBuilder.CreateBox("g", { width: 80, height: 1, depth: 200 }, scene);
  ground.position.set(0, -0.5, 50);
  ground.material = toon(scene, "#e0a15c");
  ground.receiveShadows = true;
  const agg = new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);
  agg.shape.filterMembershipMask = Layer.WORLD;
  agg.shape.filterCollideMask = CollideWith.WORLD;

  const level: ILevel = {
    def: { ...LEVELS[0], zombieDensity: 0, zombieDensityEnd: 0 },
    spawn: { position: Vector3.Zero(), yaw: 0 },
    heightAt: () => 0, roadHalfWidth: () => 30, roadCenterX: () => 0, update: () => {}, dispose: () => {},
  };
  const car = getCar("pickup");
  const fakeCar = MeshBuilder.CreateBox("car", { width: car.size.width, height: car.size.height, depth: car.size.length }, scene);
  fakeCar.material = toon(scene, car.colors.body);
  fakeCar.position.set(0, 1.2, -30);
  const vel = new Vector3(0, 0, mode === "pose" ? 0 : 24);
  const vehicle = {
    def: car, stats: computeStats(car, EMPTY_LOADOUT), chassis: fakeCar, get position() { return fakeCar.position; }, velocity: vel,
    forwardSpeed: vel.z, forward: new Vector3(0, 0, 1), up: new Vector3(0, 1, 0), airborne: false, fuel: 1, boost: 0, health: 100, wrecked: false,
    damageLevel: 0, anchors: null as any, wheels: [], throttle: 1, boosting: false, rpm: 0.5,
    update() {}, damage() {}, applyDrag() {}, applyImpulse() {}, attach(n: any) { n.parent = fakeCar; }, dispose() {},
  } as unknown as IVehicle;
  const zm = new ZombieManager(game.ctx, level, vehicle);
  const types = ["shambler", "runner", "bloater", "brute", "climber"] as const;
  types.forEach((t, i) => {
    for (let k = 0; k < 3; k++) (zm as any).spawn(t, (i - 2) * 1.6 + (k - 1) * 0.3, 2 + k * 2.5);
  });
  for (const z of (zm as any).zombies) { z.state = "idle"; z.yaw = Math.PI; }

  const cam = new ArcRotateCamera("c", -Math.PI / 2 - 0.5, 1.2, 14, new Vector3(0, 1, 4), scene);
  scene.activeCamera = cam;
  game.debug.zombies = zm;
  game.register("run", {
    enter() {},
    update(dt) {
      fakeCar.position.addInPlace(vel.scale(dt));
      zm.update(dt);
      if (mode !== "pose") cam.target.z = Math.min(20, Math.max(4, fakeCar.position.z));
    },
    exit() {},
  });
  await game.setState("run");
}
