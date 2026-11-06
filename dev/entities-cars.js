// Car test scene for dev/entities-test.html (?scene=cars | cars&set=wrecked | cars&set=burned | cars&type=bus)
import * as THREE from 'three';
import { createCarVisual, CAR_TYPES } from '../src/entities/vehicles/CarModels.js';

export function setupCars({ scene, camLook, params, log, updaters, cells }) {
  const set = params.get('set') || 'normal';
  const only = params.get('type');
  const types = only ? only.split(',') : CAR_TYPES;
  const t0 = performance.now();
  const cars = [];
  const rows = set === 'all' ? ['normal', 'wrecked', 'burned'] : [set];
  if (params.get('grid')) {
    // one car per viewport cell, 3/4 front view
    const modes = set === 'all' ? ['normal', 'wrecked', 'burned'] : [set];
    let i = 0;
    for (const mode of modes) for (const type of types) {
      const c = createCarVisual({ type, seed: 11 + i * 7, wrecked: mode === 'wrecked', burned: mode === 'burned', color: params.get('color') || undefined });
      const X = (i % 6) * 22 - 40, Z = Math.floor(i / 6) * 22 - 40;
      c.root.position.set(X, 1, Z);
      c.root.rotation.y = parseFloat(params.get('yaw') || '0');
      c.setLight(1, 0);
      scene.add(c.root);
      cars.push(c);
      const he = c.halfExtents;
      const d = Math.max(he.z * 1.15, he.x * 1.8, 2.4) * 1.9 * parseFloat(params.get('dist') || '1');
      const back = params.get('back') ? -1 : 1;
      const side = params.get('side') ? 1 : 0;
      if (side) cells.push({ cam: [X + d * 1.0, 1 + he.y + d * 0.12, Z, X, 1 + he.y * 0.8, Z], label: `${type} ${mode}` });
      else cells.push({ cam: [X + d * 0.72 * back, 1 + he.y * 1.6 + d * 0.28, Z + d * 0.72 * back, X, 1 + he.y * 0.7, Z], label: `${type} ${mode}` });
      i++;
    }
    updaters.push((dt) => { for (const c of cars) c.update(dt); });
    log(`built ${cars.length} cars in ${(performance.now() - t0).toFixed(0)}ms`);
    return;
  }
  rows.forEach((mode, ri) => {
    let x = -20;
    types.forEach((type, i) => {
      const c = createCarVisual({ type, seed: 11 + i * 7 + ri * 3, wrecked: mode === 'wrecked', burned: mode === 'burned' });
      const he = c.halfExtents;
      const big = he.z > 3;
      // small cars side by side facing the camera diagonal; big ones further back
      c.root.position.set(x + he.x + 0.6, 1, ri * 14 + (big ? 6 : 0));
      c.root.rotation.y = parseFloat(params.get('yaw') || '-0.7');
      x += Math.max(he.x, he.z * 0.75) * 2 + 1.2;
      c.setLight(1, 0);
      if (params.get('siren')) { c.lights.setSiren(true); c.lights.setHeadlights(true); }
      scene.add(c.root);
      cars.push(c);
      // collision box helper
      if (params.get('boxes')) {
        const g = new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2);
        const m = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xff00ff }));
        m.position.y = he.y; c.root.add(m);
      }
    });
  });
  updaters.push((dt) => { for (const c of cars) c.update(dt); });
  log(`built ${cars.length} cars in ${(performance.now() - t0).toFixed(0)}ms`);
  if (only && types.length <= 2) camLook(6, 3.5, 8, 0, 1, 0);
  else camLook(4, 9, -16, 4, 0, 6);
}
