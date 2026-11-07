// STUB — replaced by the cabin structure module.
import * as THREE from 'three';
import { AIRCRAFT } from '../../core/constants.js';
export async function init(app) {
  const f = AIRCRAFT.fuselage;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(f.radiusInner, f.radiusInner, 30, 32, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, side: THREE.BackSide, roughness: 0.7 }));
  shell.position.set(0, f.centerY, -1);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.95 }));
  floor.position.set(0, 0, -1);
  const light = new THREE.PointLight(0xfff1dd, 6, 30, 1.5);
  light.position.set(0, 2.0, -1);
  app.cabinRoot.add(shell, floor, light);
  app.colliders.addBox([-2.2, 0, -16], [-1.62, 2.4, 14]);
  app.colliders.addBox([1.62, 0, -16], [2.2, 2.4, 14]);
  return { stub: true };
}
