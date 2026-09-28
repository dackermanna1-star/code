// Dead Air shared building blocks (used by the da*_ chapter builders).
// Convention: only ADD exports here (several chapters import from this file);
// never change the behaviour/signature of an existing export.
import * as THREE from 'three';
import { boxMesh } from './ch4_parts.js';

// Collects visual-only boxes (no collision, stays out of the nav bounds) and
// emits one mesh per material, instead of the level's 28 m sector buckets
// (far fewer draw calls for skylines). Same box() signature as Level.
export class VisualBatch {
  constructor(L) { this.L = L; this.list = []; }
  box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    this.list.push([x0, y0, z0, x1, y1, z1, mat, o.tint, o.ao ?? 0.72]);
  }
  build(L = this.L, o = {}) {
    const g = boxMesh(this.list);
    g.userData.noCull = true;
    g.traverse((m) => { if (m.isMesh) { m.castShadow = !!o.shadows; m.matrixAutoUpdate = false; m.updateMatrix(); } });
    L.addObject(g);
    return g;
  }
}
