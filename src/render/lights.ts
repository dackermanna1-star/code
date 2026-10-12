// Dynamic light gathering: spells, explosions, fires, glowing materials (per-chunk emitter clusters).
// The nearest/brightest lights are uploaded to the voxel shader each frame (unshadowed, like Noita's glow).
import * as THREE from 'three';
import { Emitter } from './chunkMesher';
import { MAX_LIGHTS, SharedUniforms } from './voxelMaterial';

export interface DynLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  intensity: number;
}

export class LightManager {
  private lights: DynLight[] = [];
  private pool: DynLight[] = [];
  private scored: { l: DynLight; s: number }[] = [];
  count = 0;

  /** Add a light for this frame only. */
  add(x: number, y: number, z: number, color: THREE.Color | [number, number, number], radius: number, intensity = 1): void {
    const l = this.pool.pop() ?? { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, radius: 0, intensity: 0 };
    l.x = x;
    l.y = y;
    l.z = z;
    if (Array.isArray(color)) {
      l.r = color[0];
      l.g = color[1];
      l.b = color[2];
    } else {
      l.r = color.r;
      l.g = color.g;
      l.b = color.b;
    }
    l.radius = radius;
    l.intensity = intensity;
    this.lights.push(l);
  }

  addEmitters(emitters: Iterable<Emitter>, cam: THREE.Vector3, maxDist: number): void {
    for (const e of emitters) {
      const dx = e.x - cam.x, dy = e.y - cam.y, dz = e.z - cam.z;
      if (dx * dx + dy * dy + dz * dz > maxDist * maxDist) continue;
      const s = Math.min(1.6, 0.25 + Math.sqrt(e.strength) * 0.12);
      const radius = Math.min(46, 14 + Math.sqrt(e.strength) * 3.2);
      this.add(e.x, e.y, e.z, [e.r, e.g, e.b], radius, s);
    }
  }

  upload(u: SharedUniforms, cam: THREE.Vector3): void {
    const sc = this.scored;
    sc.length = 0;
    for (const l of this.lights) {
      const d = Math.hypot(l.x - cam.x, l.y - cam.y, l.z - cam.z);
      const s = (l.intensity * l.radius) / (d + 8);
      if (d - l.radius > 140) continue;
      sc.push({ l, s });
    }
    sc.sort((a, b) => b.s - a.s);
    const n = Math.min(MAX_LIGHTS, sc.length);
    for (let i = 0; i < n; i++) {
      const l = sc[i].l;
      u.uLightPos.value[i].set(l.x, l.y, l.z, l.radius);
      u.uLightCol.value[i].set(l.r * l.intensity, l.g * l.intensity, l.b * l.intensity, 0);
    }
    u.uLightCount.value = n;
    this.count = n;
    // recycle
    for (const l of this.lights) this.pool.push(l);
    this.lights.length = 0;
  }
}
