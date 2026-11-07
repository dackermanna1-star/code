import * as THREE from 'three';

// =============================================================================
// Collision world for the walking player (aircraft-local / cabin space).
// Everything is axis-aligned boxes; the player is a vertical cylinder that
// slides along them in the XZ plane. Boxes only block the player if they
// overlap the vertical band [0.05 m, 1.7 m] above the floor (so a box that
// is entirely above head height, like an overhead bin, never blocks).
//
//   const id = app.colliders.addBox(min: Vector3|[x,y,z], max, { tag: 'lav-door' })
//   app.colliders.setEnabled(id, false)       // e.g. open door
//   app.colliders.remove(id)
//   app.colliders.resolve(pos: Vector3, radius) // pushes pos out of boxes (mutates, returns pos)
//
// The cabin module adds the sidewalls / bulkheads, the seats module adds the
// seat blocks, the galley module adds galley/lav walls and doors.
// =============================================================================
export class Colliders {
  constructor() {
    this.boxes = new Map();
    this._next = 1;
    this.debugGroup = null;
  }

  addBox(min, max, opts = {}) {
    const a = Array.isArray(min) ? new THREE.Vector3(...min) : min.clone();
    const b = Array.isArray(max) ? new THREE.Vector3(...max) : max.clone();
    const box = { id: this._next++, min: new THREE.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)), max: new THREE.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)), enabled: true, tag: opts.tag || '' };
    this.boxes.set(box.id, box);
    return box.id;
  }
  /** Convenience: box given by centre and size. */
  addBoxCentered(center, size, opts) {
    const c = Array.isArray(center) ? new THREE.Vector3(...center) : center;
    const s = Array.isArray(size) ? new THREE.Vector3(...size) : size;
    return this.addBox(c.clone().addScaledVector(s, -0.5), c.clone().addScaledVector(s, 0.5), opts);
  }
  setEnabled(id, on) { const b = this.boxes.get(id); if (b) b.enabled = on; }
  remove(id) { this.boxes.delete(id); }
  removeByTag(tag) { for (const [id, b] of this.boxes) if (b.tag === tag) this.boxes.delete(id); }

  /** Push a cylinder at pos (x,z; pos.y = feet height) out of all blocking boxes. */
  resolve(pos, radius = 0.2, height = 1.7) {
    const yMin = pos.y + 0.05, yMax = pos.y + height;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.boxes.values()) {
        if (!b.enabled) continue;
        if (b.max.y < yMin || b.min.y > yMax) continue;
        // closest point on box (XZ) to the circle centre
        const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
        const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = radius - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // centre inside the box: push out along the shallowest axis
          const left = pos.x - b.min.x, right = b.max.x - pos.x, back = pos.z - b.min.z, front = b.max.z - pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) pos.x = b.min.x - radius; else if (m === right) pos.x = b.max.x + radius;
          else if (m === back) pos.z = b.min.z - radius; else pos.z = b.max.z + radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return pos;
  }

  /** True if a cylinder at pos would overlap any enabled box. */
  blocked(pos, radius = 0.2, height = 1.7) {
    const yMin = pos.y + 0.05, yMax = pos.y + height;
    for (const b of this.boxes.values()) {
      if (!b.enabled || b.max.y < yMin || b.min.y > yMax) continue;
      const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
      const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
      const dx = pos.x - cx, dz = pos.z - cz;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  /** Debug wireframes (toggle with ?colliders=1). */
  buildDebug(scene) {
    if (this.debugGroup) scene.remove(this.debugGroup);
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0xff3366, depthTest: false, transparent: true, opacity: 0.6 });
    for (const b of this.boxes.values()) {
      const box = new THREE.Box3(b.min, b.max);
      const h = new THREE.Box3Helper(box, 0xff3366);
      h.material = mat;
      g.add(h);
    }
    g.renderOrder = 999;
    this.debugGroup = g;
    scene.add(g);
  }
}
