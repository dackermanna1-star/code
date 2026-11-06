import * as THREE from 'three';
import { createEntityMaterial, setEntityLight } from '../src/render/materials.js';
export const CAR_TYPES = ['sedan'];
export function createCarVisual({ color = 0x888888 } = {}) {
  const mat = createEntityMaterial({ color });
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.4, 4.4), mat);
  m.position.y = 0.7;
  root.add(m);
  return { root, halfExtents: { x: 0.95, y: 0.7, z: 2.2 }, setLight: (s, b) => setEntityLight(mat, s, b), dispose: () => { m.geometry.dispose(); mat.dispose(); } };
}
