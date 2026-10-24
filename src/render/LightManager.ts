import * as THREE from 'three';
import type { VirtualLight } from '../world/LevelBuilder';

interface Slot<T extends THREE.PointLight | THREE.SpotLight> {
  light: T;
  vl: VirtualLight | null;
  fade: number;
  target: VirtualLight | null;
}

const _v = new THREE.Vector3();

/**
 * Maps many level lights onto a fixed pool of real three.js lights so the
 * shader light count never changes (no recompiles) and fragment cost stays bounded.
 */
export class LightManager {
  private points: Slot<THREE.PointLight>[] = [];
  private spots: Slot<THREE.SpotLight>[] = [];
  private timer = 0;
  beat = 0;
  /** 0..1 how "hot" the music is (drives disco lights) */
  energy = 0.5;
  time = 0;
  lightsOff = false;
  globalMul = 1;

  constructor(
    scene: THREE.Scene,
    public virtual: VirtualLight[],
    pointCount: number,
    spotCount: number,
  ) {
    for (let i = 0; i < pointCount; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.points.push({ light: l, vl: null, fade: 0, target: null });
    }
    for (let i = 0; i < spotCount; i++) {
      const l = new THREE.SpotLight(0xffffff, 0, 10, 0.6, 0.5, 2);
      l.castShadow = false;
      scene.add(l);
      scene.add(l.target);
      this.spots.push({ light: l, vl: null, fade: 0, target: null });
    }
  }

  setBudget(points: number): void {
    for (let i = 0; i < this.points.length; i++) this.points[i].light.visible = i < points;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.15;
      this.assign(camera.position);
    }
    const t = this.time;
    for (const slots of [this.points, this.spots] as Slot<any>[][]) {
      for (const s of slots) {
        // fade toward target assignment
        if (s.target !== s.vl) {
          s.fade -= dt * 5;
          if (s.fade <= 0) {
            s.fade = 0;
            s.vl = s.target;
            if (s.vl) this.applyStatic(s);
          }
        } else if (s.vl) s.fade = Math.min(1, s.fade + dt * 4);
        const vl = s.vl;
        if (!vl) {
          s.light.intensity = 0;
          continue;
        }
        let mul = vl.on === false ? 0 : 1;
        if (vl.flicker) {
          const n = Math.sin(t * 37.0 + vl.pos.x * 3.1) * Math.sin(t * 13.3 + vl.pos.z);
          if (n > 1 - vl.flicker * 4) mul *= 0.15;
          else mul *= 0.92 + 0.08 * Math.sin(t * 60 + vl.pos.y);
        }
        if (vl.disco) {
          const e = this.energy;
          const pulse = 0.55 + 0.45 * Math.max(0, Math.cos(this.beat * Math.PI * 2));
          mul *= 0.35 + e * pulse;
          const hueShift = (t * 0.08 + vl.pos.x * 0.05) % 1;
          (s.light as THREE.Light).color.copy(vl.color).offsetHSL(hueShift * e * 0.5, 0, 0);
          if (s.light instanceof THREE.SpotLight && vl.target) {
            s.light.target.position.set(vl.target.x + Math.sin(t * 1.3 + vl.pos.x) * 1.5 * e, vl.target.y, vl.target.z + Math.cos(t * 0.9) * 1.2 * e);
          }
        }
        if (this.lightsOff && vl.zone !== 'porch') mul *= 0.05;
        s.light.intensity = vl.intensity * mul * s.fade * this.globalMul * (vl.mul ?? 1);
      }
    }
  }

  private applyStatic(s: Slot<any>): void {
    const vl = s.vl!;
    const l = s.light as THREE.PointLight | THREE.SpotLight;
    l.position.copy(vl.pos);
    l.color.copy(vl.color);
    l.distance = vl.distance;
    l.decay = vl.decay ?? 2;
    if (l instanceof THREE.SpotLight) {
      l.angle = vl.angle ?? 0.6;
      l.penumbra = vl.penumbra ?? 0.5;
      if (vl.target) l.target.position.copy(vl.target);
      l.target.updateMatrixWorld();
    }
  }

  private assign(cam: THREE.Vector3): void {
    for (const [slots, kind] of [
      [this.points, 'point'],
      [this.spots, 'spot'],
    ] as [Slot<any>[], 'point' | 'spot'][]) {
      const active = slots.filter((s) => s.light.visible !== false || kind === 'spot');
      const cands = this.virtual.filter((v) => v.kind === kind);
      // score by importance and distance (lights cover a radius; beyond it they don't matter)
      const scored = cands
        .map((v) => {
          const d = _v.subVectors(v.pos, cam).length();
          const reach = v.distance * 1.4 + 4;
          const score = d > reach ? -1 : (v.intensity * (v.priority ?? 1)) / (1 + (d * d) / (v.distance * v.distance));
          return { v, score };
        })
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, active.length);
      const want = new Set(scored.map((c) => c.v));
      // keep existing good assignments
      const free: Slot<any>[] = [];
      for (const s of active) {
        if (s.target && want.has(s.target)) want.delete(s.target);
        else free.push(s);
      }
      for (const v of want) {
        const s = free.pop();
        if (!s) break;
        s.target = v;
      }
      for (const s of free) s.target = null;
    }
  }
}
