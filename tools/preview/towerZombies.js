// Debug helper for the world preview: real engine bodies (HumanMesh + the zombie skin shader)
// standing in the valley, and a stand-in viewmodel drawn with RetroRenderer.renderOverlay, to
// check that the world's lights, fog and retro pass suit them.
import * as THREE from 'three';
import { World } from '../../src/physics/world.js';
import { Vec3 } from '../../src/physics/math.js';
import { Ragdoll } from '../../src/human/ragdoll.js';
import { BodyShape } from '../../src/human/bodyShape.js';
import { buildBodyMesh } from '../../src/human/bodyMesh.js';
import { HumanMesh } from '../../src/render/humanMesh.js';

const LOOKS = [
  { shirt: [0.42, 0.36, 0.3], pants: [0.2, 0.22, 0.28], shoes: [0.08, 0.07, 0.06], seed: 1, sleeves: 1, rot: 0.6, gore: 0.6 },
  { shirt: [0.55, 0.12, 0.1], pants: [0.25, 0.24, 0.2], shoes: [0.1, 0.08, 0.06], seed: 2, sleeves: 0.3, rot: 0.8, gore: 0.4 },
  { shirt: [0.3, 0.36, 0.42], pants: [0.12, 0.12, 0.14], shoes: [0.05, 0.05, 0.05], seed: 3, sleeves: 1, rot: 0.5, gore: 0.8 },
];

/** Stand bodies at [[x, z], ...] facing the tower. Returns the HumanMesh list. */
export function addZombies(scene, spots) {
  const world = new World();
  let data = null, shape = null;
  const out = [];
  spots.forEach(([x, z], i) => {
    const rd = new Ragdoll(world, { position: new Vec3(x, 0, z), yaw: Math.atan2(-x, -z) });
    if (!shape) {
      shape = new BodyShape(rd.segList.map((s) => s.name));
      data = buildBodyMesh(shape);
    }
    const hm = new HumanMesh(data, rd, shape, { zombie: LOOKS[i % LOOKS.length] });
    scene.add(hm.mesh);
    hm.update(1);
    out.push(hm);
  });
  return out;
}

/** A stand-in rifle for the overlay pass: a dark box with a barrel, low right of the view. */
export function overlayScene() {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.01, 10);
  const m = new THREE.MeshLambertMaterial({ color: 0x2c2620 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.5), m);
  stock.position.set(0.14, -0.13, -0.35);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), new THREE.MeshLambertMaterial({ color: 0x1a1a1c }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.14, -0.1, -0.75);
  scene.add(stock, barrel, new THREE.HemisphereLight(0xb0a0c0, 0x403020, 1.2));
  return { scene, cam };
}
