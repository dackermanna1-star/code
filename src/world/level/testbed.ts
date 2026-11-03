import * as THREE from 'three';
import type { Arena } from '../arena';
import type { BloodAtlas } from '../bloodAtlas';
import type { MapParts } from '../mapKit';
import { LevelKit } from './kit';
import { Materials } from './materials';
import { skyTexture } from '../city';
import { lampPost, container, chainFence, crateStack } from './blocks';

/**
 * A yard for trying the levels' moves: a loading dock with stairs, containers to climb, a low wall
 * to vault, a fence, a high wall, a building with a ladder to its roof (?map=testbed).
 */
export function buildTestbed(a: Arena, blood: BloodAtlas, pointLights: number, shadowMapSize: number): MapParts {
  const k = new LevelKit(a, blood, pointLights, shadowMapSize, { bounds: { minX: -32, maxX: 32, minZ: -16, maxZ: 16 } });
  a.propSpots = { drums: [], crates: [] };
  a.drains = [];
  const M = new Materials(blood, true);
  a.fog = { color: 0x0c0e14, density: 0.022 };
  a.background = skyTexture(5);
  a.farPlane = 160;
  a.camBounds = { out: 0, maxY: 30, walls: true };
  a.wet = true;
  // ground
  k.floor(-32, 32, -16, 16, M.asphalt(), { tile: 4, dense: true });
  // the loading dock, stairs up its west end
  k.deck(6, 18, -14, -6, 1.2, M.concreteFloor(), M.concrete(), { name: 'dock' });
  k.stairs(2.2, 6, -10, -8.4, 'x', 0, 1.2, M.concrete(0x8a8884));
  // containers: one to climb (a crate stack beside it), one stacked on another
  container(k, M, -18, -9, 0, 'blue');
  crateStack(k, M, -14.6, -9, 1);
  container(k, M, -18, 2, Math.PI / 2, 'red');
  container(k, M, -18, 2, Math.PI / 2, 'orange', 2.6);
  // a low wall to vault, a fence, a high wall to climb
  k.solid([-6, -2, 0, 0.95, 4, 4.32], M.block(), { kind: 'wall', name: 'low wall' });
  chainFence(k, M, -12, 8, -2, 8, 1.15);
  k.solid([4, 10, 0, 2.1, 6, 8], M.brick('brown'), { kind: 'wall', name: 'high block', walk: true });
  // a building with a ladder up the west side to its roof
  k.solid([20, 28, 0, 5.5, 2, 12], M.brick('red'), { kind: 'wall', name: 'building', walk: true, tile: 2 });
  k.floor(20, 28, 2, 12, M.roofFloor(), { y: 5.5 });
  k.ladder(20, 6, Math.PI / 2, 0, 5.5, M.iron());
  // two roofs with a gap between (a running jump), crates up onto the first
  k.deck(-29, -24, 11.5, 15.5, 2.0, M.roofFloor(), M.brick('yellow'), { name: 'roof A' });
  k.deck(-21.8, -16, 11.5, 15.5, 2.0, M.roofFloor(), M.brick('yellow'), { name: 'roof B' });
  crateStack(k, M, -26.5, 10.6, 1);
  // a half-open shutter to crawl under (a beam 1.2 m up)
  k.solid([-14, -10, 1.2, 3.2, -15.5, -15.2], M.shutter(3), { kind: 'wall', name: 'shutter' });
  k.solid([-14.3, -14, 0, 3.2, -15.5, -12], M.block(), { kind: 'wall' });
  k.solid([-10, -9.7, 0, 3.2, -15.5, -12], M.block(), { kind: 'wall' });
  k.solid([-14.3, -9.7, 3.2, 3.5, -15.5, -12], M.block(), { kind: 'wall' });
  // lamps
  for (const [x, z] of [[-24, -4], [-6, -12], [10, 0], [0, 12], [24, -8], [-24, 12]] as [number, number][]) lampPost(k, M, x, z);
  const hemi = new THREE.HemisphereLight(0x5e6a88, 0x3c3228, 1.7);
  k.g.add(hemi);
  k.keyLight(0x9ab0e0, 1.3, new THREE.Vector3(-0.4, 1, 0.3));
  return k.finish({ hemi, probe: new THREE.Vector3(0, 2, 0) });
}
