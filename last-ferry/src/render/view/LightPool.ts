// A fixed set of point lights shared by every effect (muzzle flashes, flares,
// deck fires, burning zombies, explosions, the Bosun's lantern glow).
//
// three.js recompiles every lit material when the number of lights changes,
// so the pool keeps a constant count and hands the real lights to the
// brightest requests each frame ("virtual lights"). Effects either request a
// light for this frame (add) or start a decaying flash (flash).
import * as THREE from 'three';
import { REFLECT_LAYER } from '../Stage';

interface Req {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  intensity: number;
  distance: number;
  /** Sort key (intensity weighted by priority). */
  key: number;
}

interface Flash {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  peak: number;
  life: number;
  max: number;
  distance: number;
  /** Already as bright as it should be at night (skip the night boost). */
  flat: boolean;
}

const MAX_REQ = 96;
const _c = new THREE.Color();

export class LightPool {
  private lights: THREE.PointLight[] = [];
  private reqs: Req[] = [];
  private n = 0;
  private flashes: Flash[] = [];
  private order: number[] = [];
  /** Night boost: effect lights read stronger in the dark (set from env darkness each frame). */
  boost = 1;

  constructor(scene: THREE.Scene, count: number) {
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      l.castShadow = false;
      l.layers.enable(REFLECT_LAYER);
      l.name = `fxLight${i}`;
      scene.add(l);
      this.lights.push(l);
    }
    for (let i = 0; i < MAX_REQ; i++) this.reqs.push({ x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, intensity: 0, distance: 1, key: 0 });
  }

  get size(): number {
    return this.lights.length;
  }

  /** Request a light for this frame only. `priority` scales its claim on a real light. */
  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, priority = 1): void {
    if (intensity <= 0.01 || this.n >= MAX_REQ) return;
    const q = this.reqs[this.n++];
    _c.set(color);
    q.x = x;
    q.y = y;
    q.z = z;
    q.r = _c.r;
    q.g = _c.g;
    q.b = _c.b;
    q.intensity = intensity;
    q.distance = distance;
    q.key = intensity * distance * priority;
  }

  /**
   * A short flash that decays quadratically over `life` seconds. `flat`: no
   * night boost (big blasts would otherwise light the whole pier like day).
   */
  flash(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, life: number, distance = 9, flat = false): void {
    if (this.flashes.length > 24) this.flashes.shift();
    this.flashes.push({ x, y, z, color: new THREE.Color(color), peak: intensity, life, max: life, distance, flat });
  }

  /** Assign the real lights (call once per frame after every system has made its requests). */
  commit(dt: number): void {
    let w = 0;
    for (const f of this.flashes) {
      f.life -= dt;
      if (f.life <= 0) continue;
      const t = f.life / f.max;
      this.add(f.x, f.y, f.z, f.color, (f.peak * t * t) / (f.flat ? this.boost : 1), f.distance, 2.5);
      this.flashes[w++] = f;
    }
    this.flashes.length = w;
    const n = this.n;
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => this.reqs[b].key - this.reqs[a].key);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (i < n) {
        const q = this.reqs[order[i]];
        l.position.set(q.x, q.y, q.z);
        l.color.setRGB(q.r, q.g, q.b);
        l.intensity = q.intensity * this.boost;
        l.distance = q.distance;
        l.visible = true;
      } else {
        l.intensity = 0;
      }
    }
    this.n = 0;
  }

  clear(): void {
    this.flashes.length = 0;
    this.n = 0;
    for (const l of this.lights) l.intensity = 0;
  }
}
