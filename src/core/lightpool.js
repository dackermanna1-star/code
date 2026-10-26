// Item lights (lamps, candles, neon, screens) are "virtual": each frame the
// pool hands a fixed number of real PointLights to the strongest, closest
// ones. The scene's light count never changes, so buying a lamp never
// recompiles every shader, and a room full of candles stays cheap to render.
import * as THREE from 'three';

const _p = new THREE.Vector3();

export class VirtualLight extends THREE.Object3D {
  constructor(color = '#ffffff', intensity = 1, distance = 5, decay = 2) {
    super();
    this.isVirtualLight = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    LightPool.all.add(this);
  }
  dispose() { LightPool.all.delete(this); }
}

export const LightPool = {
  all: new Set(),
  slots: [],
  init(scene, count) {
    this.scene = scene;
    while (this.slots.length > count) { const l = this.slots.pop(); scene.remove(l); l.dispose(); }
    while (this.slots.length < count) {
      const l = new THREE.PointLight('#ffffff', 0, 1, 2);
      l.layers.enableAll();
      scene.add(l);
      this.slots.push(l);
    }
  },
  // walks up to the scene: detached or hidden lights don't count
  _live(v) {
    let o = v;
    while (o) {
      if (!o.visible) return false;
      if (o === this.scene) return true;
      o = o.parent;
    }
    return false;
  },
  update(camera) {
    if (!this.slots.length) return;
    const cam = camera.getWorldPosition(_p).clone();
    const cand = [];
    for (const v of this.all) {
      if (!v.parent) { this.all.delete(v); continue; }
      if (v.intensity <= 0.01 || !this._live(v)) continue;
      v.getWorldPosition(_p);
      const d = _p.distanceTo(cam);
      v._wp = (v._wp || new THREE.Vector3()).copy(_p);
      // stickiness keeps the assignment from flickering between equals
      v._score = (v.intensity * v.distance) / (1 + d * d) * (v._slot != null ? 1.25 : 1);
      cand.push(v);
    }
    cand.sort((a, b) => b._score - a._score);
    for (const v of this.all) v._slot = null;
    this.slots.forEach((l, i) => {
      const v = cand[i];
      if (!v) { l.intensity = 0; return; }
      v._slot = i;
      l.position.copy(v._wp);
      l.color.copy(v.color);
      l.intensity = v.intensity;
      l.distance = v.distance;
      l.decay = v.decay;
    });
  },
};
