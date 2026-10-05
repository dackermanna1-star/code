// Free models from the catalog (Public Domain), used for catalog thumbnails
// and for the Insert menu in your own place.
import * as THREE from 'three';
import { Part } from '../engine/Part.js';

// Each model is a list of bricks: [size, position, color, extra]
export const MODELS = {
  House: [
    [[16, 1.2, 16], [0, 0.6, 0], 194],
    [[16, 8, 1], [0, 5.2, -7.5], 5], [[16, 8, 1], [0, 5.2, 7.5], 5], [[1, 8, 14], [-7.5, 5.2, 0], 5], [[1, 8, 14], [7.5, 5.2, 0], 5],
    [[4, 5, 1.2], [0, 3.7, -7.6], 192],
    [[18, 1, 9], [0, 10.5, -4], 21, { rot: [25, 0, 0] }], [[18, 1, 9], [0, 10.5, 4], 21, { rot: [-25, 0, 0] }],
  ],
  Car: [
    [[6, 1.2, 10], [0, 1.6, 0], 21], [[5, 2, 5], [0, 3.2, 0.5], 21], [[4.6, 1.6, 0.4], [0, 3.4, -2.1], 45, { t: 0.4 }],
    [[1, 2, 2], [-3.2, 1, -3], 26, { shape: 'Cylinder' }], [[1, 2, 2], [3.2, 1, -3], 26, { shape: 'Cylinder' }],
    [[1, 2, 2], [-3.2, 1, 3], 26, { shape: 'Cylinder' }], [[1, 2, 2], [3.2, 1, 3], 26, { shape: 'Cylinder' }],
  ],
  Tree: [
    [[2, 8, 2], [0, 4, 0], 192], [[8, 4, 8], [0, 9, 0], 37], [[6, 2, 6], [0, 12, 0], 37], [[3, 1.2, 3], [0, 13.6, 0], 28],
  ],
  Tower: [
    [[10, 1.2, 10], [0, 0.6, 0], 199], [[8, 16, 8], [0, 9.2, 0], 194], [[10, 1.2, 10], [0, 17.8, 0], 199],
    [[2, 2, 2], [-4, 19.4, -4], 199], [[2, 2, 2], [4, 19.4, -4], 199], [[2, 2, 2], [-4, 19.4, 4], 199], [[2, 2, 2], [4, 19.4, 4], 199],
    [[6, 1.2, 6], [0, 18.4, 0], 23, { shape: 'Spawn' }],
  ],
  Sword: [[[1, 0.8, 4], [0, 0.4, 0], 199]],
  RocketLauncher: [[[4, 0.8, 1], [0, 0.4, 0], 141]],
};

export function modelBricks(name) { return MODELS[name] || []; }

/** A THREE.Group preview (no physics) of a model. */
export function buildModelPreview(name) {
  const g = new THREE.Group();
  const fakeWorld = { defaultPhysMaterial: null, kinematicParts: new Set(), touchParts: new Set() };
  for (const [size, pos, color, extra = {}] of modelBricks(name)) {
    const p = new Part(fakeWorld, { size, position: pos, color, rotation: extra.rot, shape: extra.shape === 'Spawn' ? 'Block' : extra.shape, transparency: extra.t, noPhysics: true });
    g.add(p.mesh);
  }
  return g;
}
