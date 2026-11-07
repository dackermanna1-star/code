import * as THREE from 'three';
import { AIRCRAFT } from '../core/constants.js';

// =============================================================================
// HEADROOM: how high can the eye be at a given floor position?
//
// In the aisle a standing passenger is upright (ceiling ≈ 2.16 m). Outboard,
// between the seat rows, under the bins/PSUs or next to the curved sidewall a
// real person has to stoop. We combine:
//   * an analytic limit from the circular inner hull (eye 10 cm inside the lining),
//   * a cached upward ray probe against the cabin geometry (bins, PSUs, galley
//     and lav ceilings, door headers) – only away from the aisle centre, at most
//     one ray per frame, results cached on a 5 cm grid and flushed every few
//     seconds (bins open and close).
// =============================================================================

const UP = new THREE.Vector3(0, 1, 0);

export class Headroom {
  constructor(app) {
    this.app = app;
    this.ray = new THREE.Raycaster();
    this.ray.far = 1.2;
    this._origin = new THREE.Vector3();
    this._hits = [];
    this._cands = [];
    this._near = [];
    this.cache = new Map();
    this._flushAt = 0;
    this._lastFrame = -1;
    this._last = 9;
    this.enabled = true;
  }

  _refresh() {
    const list = [];
    const root = this.app.cabinRoot;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.userData.noHeadroom || o.userData.noCollide) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!m || m.visible === false || m.depthWrite === false) return;
      if (m.transparent && m.opacity < 0.6) return;
      if (m.blending === THREE.AdditiveBlending) return;
      let bb;
      try {
        if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); bb = o.boundingBox; } else {
          if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
          bb = o.geometry.boundingBox;
        }
      } catch { return; }
      if (!bb || bb.isEmpty()) return;
      const box = bb.clone().applyMatrix4(o.matrixWorld);
      // only things that can be above a standing head
      if (box.max.y < 1.2 || box.min.y > 2.4) return;
      list.push({ o, box });
    });
    this._cands = list;
  }

  _visible(o) {
    while (o) { if (o.visible === false) return false; o = o.parent; }
    return true;
  }

  /** Top of the free space above floor point (x, z), from geometry (metres above floor). */
  _probe(x, z, time) {
    if (time >= this._flushAt) { this.cache.clear(); this._refresh(); this._flushAt = time + 6; }
    const kx = Math.round(x * 20), kz = Math.round(z * 20);
    const key = kx * 100000 + kz;
    const c = this.cache.get(key);
    if (c !== undefined) return c;
    const frame = this.app.frame;
    if (frame === this._lastFrame) return this._last;   // one ray per frame
    this._lastFrame = frame;
    const px = kx / 20, pz = kz / 20;
    const near = this._near; near.length = 0;
    for (const c2 of this._cands) {
      const b = c2.box;
      if (px < b.min.x - 0.01 || px > b.max.x + 0.01 || pz < b.min.z - 0.01 || pz > b.max.z + 0.01) continue;
      if (!this._visible(c2.o)) continue;
      near.push(c2.o);
    }
    let top = 9;
    if (near.length) {
      this._origin.set(px, 1.2, pz);   // above seatback tops
      this.ray.set(this._origin, UP);
      this._hits.length = 0;
      try {
        this.ray.intersectObjects(near, false, this._hits);
        if (this._hits.length) top = this._hits[0].point.y;
      } catch { /* ignore */ }
    }
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, top);
    this._last = top;
    return top;
  }

  /** Maximum eye height at (x, z) for a standing / walking passenger. */
  maxEye(x, z, time) {
    const f = AIRCRAFT.fuselage;
    const R = f.radiusInner - f.liningInset - 0.1;
    const ax = Math.abs(x);
    let lim = ax < R ? f.centerY + Math.sqrt(R * R - ax * ax) : 0.9;
    if (this.enabled && ax > 0.36) {
      const top = this._probe(x, z, time);
      lim = Math.min(lim, top - 0.13);
    }
    return lim;
  }

  invalidate() { this._flushAt = 0; }
}
