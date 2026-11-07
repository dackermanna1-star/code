// STUB — replaced by the environment module (sky, sun, terrain, water, city).
import * as THREE from 'three';
export async function init(app) {
  app.scenes.outside.background = new THREE.Color(0x8fb6e6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f7a46, roughness: 1 }));
  ground.position.y = -0.05;
  app.worldRoot.add(ground);
  app.sun.direction.set(-0.4, 0.55, 0.35).normalize();
  return { stub: true };
}
