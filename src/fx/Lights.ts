import * as THREE from 'three';

interface Slot {
  light: THREE.PointLight;
  t: number;
  dur: number;
  peak: number;
  flicker: number;
  busy: boolean;
}

/** Fixed pool of point lights (constant count avoids shader recompiles). */
export class LightPool {
  private slots: Slot[] = [];
  readonly muzzle: THREE.PointLight;
  private muzzleT = 0;
  private muzzlePeak = 0;

  constructor(scene: THREE.Scene, count = 5) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 12, 1.6);
      l.layers.enableAll();
      scene.add(l);
      this.slots.push({ light: l, t: 0, dur: 1, peak: 0, flicker: 0, busy: false });
    }
    this.muzzle = new THREE.PointLight(0xffc070, 0, 14, 1.5);
    this.muzzle.layers.enableAll();
    scene.add(this.muzzle);
  }

  /** A transient flash (explosion, turret muzzle). */
  flash(x: number, y: number, z: number, color: number, intensity: number, distance: number, dur: number, flicker = 0) {
    let best = this.slots[0];
    let bestScore = Infinity;
    for (const s of this.slots) {
      const cur = s.busy ? s.peak * (1 - s.t / s.dur) : 0;
      if (cur < bestScore) {
        bestScore = cur;
        best = s;
      }
    }
    if (bestScore > intensity) return;
    best.busy = true;
    best.t = 0;
    best.dur = dur;
    best.peak = intensity;
    best.flicker = flicker;
    best.light.color.setHex(color);
    best.light.distance = distance;
    best.light.position.set(x, y, z);
    best.light.intensity = intensity;
  }

  muzzleFlash(pos: THREE.Vector3, intensity = 18, color = 0xffc070) {
    this.muzzle.position.copy(pos);
    this.muzzle.color.setHex(color);
    this.muzzlePeak = intensity;
    this.muzzleT = 0;
    this.muzzle.intensity = intensity;
  }

  update(dt: number) {
    for (const s of this.slots) {
      if (!s.busy) continue;
      s.t += dt;
      if (s.t >= s.dur) {
        s.busy = false;
        s.light.intensity = 0;
        continue;
      }
      const k = 1 - s.t / s.dur;
      const f = s.flicker > 0 ? 1 - s.flicker * Math.random() : 1;
      s.light.intensity = s.peak * k * k * f;
    }
    this.muzzleT += dt;
    this.muzzle.intensity = this.muzzleT < 0.06 ? this.muzzlePeak * (1 - this.muzzleT / 0.06) : 0;
  }
}
