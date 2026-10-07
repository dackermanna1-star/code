// Things you can use: doors, hiding places, items, notes, switches. Each has
// a position and a reach; the one you're looking at (closest to the middle
// of the screen, in reach, not behind a wall) gets the prompt.
import * as THREE from 'three';
import { GROUP } from '../../engine/Part.js';

const _d = new THREE.Vector3();

export class Interact {
  constructor(world) {
    this.world = world;
    this.items = [];
    this.current = null;
  }
  /** o: {pos, r (reach), label (string|fn), verb (string|fn), can() (shown at all), act(), hold (seconds to hold E), cone} */
  add(o) {
    const it = { r: 4, enabled: true, ...o };
    this.items.push(it);
    return it;
  }
  remove(it) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); if (this.current === it) this.current = null; }

  /** Pick what the eye (looking along dir) would use. */
  pick(eye, dir) {
    const cand = [];
    for (const it of this.items) {
      if (!it.enabled || (it.can && !it.can())) continue;
      _d.copy(it.pos).sub(eye);
      const d = _d.length();
      if (d > it.r || d < 0.01) continue;
      const cos = _d.dot(dir) / d;
      // the closer it is, the wider the cone that catches it
      const cone = Math.max(it.cone ?? 0.3, Math.atan2(it.size ?? 0.9, d));
      const ang = Math.acos(Math.min(1, cos));
      if (ang > cone) continue;
      cand.push([ang / cone + d * 0.03, it, d]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, it, d] of cand.slice(0, 4)) {
      if (it.noRay) return (this.current = it);
      const hit = this.world.raycast(eye, it.pos, { mask: GROUP.WORLD });
      if (!hit || hit.distance > d - (it.slack ?? 0.7)) return (this.current = it);
    }
    return (this.current = null);
  }
}
