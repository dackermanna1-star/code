// STUB — replaced by the coach interior module.
import * as THREE from 'three';
import { COACH } from '../core/constants.js';
export async function init(app) {
  const W = COACH.innerHalfWidth * 2, L = COACH.length - 0.5;
  const mat = new THREE.MeshStandardMaterial({ color: 0xd8dcdc, roughness: 0.7, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2), mat);
  roof.position.y = COACH.ceilingY;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.9 }));
  const wall = (x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L, COACH.windowSillY + 0.1), mat);
    m.rotation.y = Math.PI / 2;
    m.position.set(x, COACH.windowSillY / 2 - 0.05, 0);
    return m;
  };
  const light = new THREE.PointLight(0xfff3e0, 3, 14, 1.5);
  light.position.set(0, 1.9, 0);
  app.cabinRoot.add(roof, floor, wall(-COACH.innerHalfWidth), wall(COACH.innerHalfWidth), light);
  app.colliders.addBox([-1.6, -0.5, -6.6], [-COACH.innerHalfWidth, 2.5, 6.6]);
  app.colliders.addBox([COACH.innerHalfWidth, -0.5, -6.6], [1.6, 2.5, 6.6]);
  return { stub: true };
}
