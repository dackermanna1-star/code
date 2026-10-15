// STUB — replaced by the World agent. Flat ground so other systems can run.
import * as THREE from 'three';
import type { GameContext } from '../core/GameContext';
import type { IEnvironment, IWorld, MapLocation } from '../core/contracts';
import { RAPIER, Layer } from '../core/Physics';

export async function installWorld(ctx: GameContext): Promise<void> {
  const size = 3072;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).translate(size / 2, 0, size / 2),
    new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 1 }),
  );
  ground.receiveShadow = true;
  ctx.scene.add(ground);
  ctx.physics.addStatic(
    RAPIER.ColliderDesc.cuboid(size / 2, 1, size / 2).setTranslation(size / 2, -1, size / 2),
    { kind: 'terrain', surface: 'grass' },
    Layer.Terrain,
  );
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(size / 2 + 100, 200, size / 2 + 50);
  sun.target.position.set(size / 2, 0, size / 2);
  ctx.scene.add(sun, sun.target, new THREE.HemisphereLight(0xbfd8ff, 0x445533, 1.2));
  ctx.scene.background = new THREE.Color(0x9cc4e8);
  const locations: MapLocation[] = [{ name: 'Center', kind: 'town', x: size / 2, z: size / 2, radius: 100, lootTier: 0.5 }];
  const world: IWorld = {
    size,
    seaLevel: -10,
    locations,
    lots: [],
    props: [],
    roads: [],
    vehicleSpawns: [],
    getHeight: () => 0,
    getNormal: (_x, _z, out) => out.set(0, 1, 0),
    getSurface: () => 'grass',
    getWaterHeight: () => null,
    isLand: (x, z) => x > 0 && z > 0 && x < size && z < size,
    getGroundCover: () => 0.3,
    nearestLocation: () => locations[0],
    getMapImage: () => null,
  };
  const env: IEnvironment = {
    timeOfDay: 12,
    weather: 'clear',
    sunDirection: sun.position.clone().sub(sun.target.position).normalize(),
    visibility: 1,
    fogDistance: 3000,
    setTimeOfDay(h) { this.timeOfDay = h; },
    setWeather(w) { this.weather = w; },
  };
  ctx.world = world;
  ctx.environment = env;
}
