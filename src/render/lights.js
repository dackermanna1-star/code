// Dynamic light manager. Levels can register hundreds of "virtual" lights; each
// frame the most relevant ones are mapped onto a small fixed pool of real
// PointLights so the shader light count never changes (no recompiles) and
// forward-rendering cost stays bounded.
import * as THREE from 'three';

export class LightManager {
  constructor(scene, poolSize = 8) {
    this.scene = scene;
    this.pool = [];
    this.virtual = [];
    this.temp = []; // transient lights (muzzle flashes, explosions) {x,y,z,color,intensity,range,life,max}
    this.setPoolSize(poolSize);
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Sphere();
    this.time = 0;
  }
  setPoolSize(n) {
    for (const p of this.pool) this.scene.remove(p);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 1.3);
      L.castShadow = false;
      L.layers.enable(1);
      L.userData.assigned = null;
      this.scene.add(L);
      this.pool.push(L);
    }
  }
  setVirtual(list) {
    this.virtual = list;
  }
  flash(x, y, z, color, intensity, range, life) {
    // Reuse an existing temp slot if too many
    if (this.temp.length > 12) this.temp.shift();
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.temp.push({ x, y, z, color: c, intensity, range, life, max: life, temp: true });
  }
  update(dt, camera) {
    this.time += dt;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const cand = this._cand || (this._cand = []);
    cand.length = 0;
    const t = this.time;
    for (const L of this.virtual) {
      if (!L.on) { L.cur = 0; continue; }
      const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L.range + 45) continue;
      this._s.center.set(L.x, L.y, L.z);
      this._s.radius = L.range;
      const vis = this.frustum.intersectsSphere(this._s);
      if (!vis && d > L.range * 1.1) continue;
      // flicker
      let k = 1;
      if (L.flicker > 0) {
        const n = Math.sin(t * 13.1 + L.phase) * Math.sin(t * 7.3 + L.phase * 2.1) + Math.sin(t * 29.7 + L.phase);
        k = n > 1.2 - L.flicker * 1.6 ? 1 : 0.15 + 0.2 * Math.random() * (1 - L.flicker);
        if (L.flicker > 0.9 && Math.random() < 0.02) k = 0;
      }
      if (L.buzz) k *= 0.92 + 0.08 * Math.sin(t * 120 + L.phase);
      L.cur = k;
      const score = (L.intensity * (L.range + 4)) / (1 + d * d * 0.06) * (vis ? 1 : 0.35) + (L.priority || 0) * 100;
      cand.push({ L, score, k });
    }
    for (let i = this.temp.length - 1; i >= 0; i--) {
      const L = this.temp[i];
      L.life -= dt;
      if (L.life <= 0) { this.temp.splice(i, 1); continue; }
      const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (L.range + 30) ** 2) continue;
      const k = L.life / L.max;
      cand.push({ L, score: 1e6 - d2, k: L.fade === false ? 1 : k });
    }
    cand.sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.pool.length; i++) {
      const P = this.pool[i];
      const c = cand[i];
      if (!c) {
        P.intensity = 0;
        // keep visible (light count must stay constant to avoid shader recompiles)
        continue;
      }

      const L = c.L;
      P.position.set(L.x, L.y, L.z);
      P.color.copy(L.color);
      P.distance = L.range;
      P.decay = L.decay ?? 1.3;
      // Smooth reassignment to avoid pops when a slot changes owner.
      const target = L.intensity * c.k;
      if (P.userData.assigned !== L) {
        P.userData.assigned = L;
        P.intensity = L.temp ? target : target * 0.35;
      } else {
        P.intensity += (target - P.intensity) * Math.min(1, dt * (L.temp ? 60 : 14));
      }
    }
  }
}
