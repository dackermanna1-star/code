import * as THREE from 'three';

/**
 * Short-lived visual effects: bullet tracers, impact dust and sparks, debris (glass shards, melon
 * chunks, splinters) with simple ballistic motion and floor bounces, and the muzzle-flash light.
 */

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.shardFactory = opts.shardFactory || null; // (kind) => Object3D
    this.tracers = [];
    this.debris = [];
    this.flashes = [];
    // tracer material: thin additive streak
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracerGeo = new THREE.CylinderGeometry(0.0012, 0.0012, 1, 5, 1, true);
    this.tracerGeo.translate(0, 0.5, 0);
    this.tracerGeo.rotateX(Math.PI / 2); // along +Z
    this.dustMat = new THREE.PointsMaterial({ color: 0xb5b0a8, size: 0.03, transparent: true, opacity: 0.8, depthWrite: false });
    this.sparkMat = new THREE.PointsMaterial({ color: 0xffc070, size: 0.012, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.light = new THREE.PointLight(0xffc68a, 0, 8, 2);
    scene.add(this.light);
    this.lightT = 0;
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 0.05) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(1, 1, len);
    m.renderOrder = 5;
    this.scene.add(m);
    this.tracers.push({ m, t: 0, life: 0.06 });
  }

  muzzleLight(pos, strength = 1) {
    this.light.position.copy(pos);
    this.light.intensity = 30 * strength;
    this.lightT = 0.05;
  }

  puff(pos, normal, color, count = 14, speed = 1.2, life = 0.5, spark = false) {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    const v = [];
    for (let i = 0; i < count; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.9).add(normal).normalize();
      v.push(d.multiplyScalar(speed * (0.3 + Math.random())));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = (spark ? this.sparkMat : this.dustMat).clone();
    if (color !== undefined && !spark) mat.color.set(color);
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.flashes.push({ pts, v, t: 0, life, spark });
  }

  /** Debris pieces thrown out of a breaking object. kind: 'glass' | 'melon' | 'wood'. */
  burst(kind, pos, vel, count, speed, rng = Math.random) {
    if (!this.shardFactory) return;
    for (let i = 0; i < count; i++) {
      const m = this.shardFactory(kind);
      if (!m) return;
      m.position.copy(pos).add(new THREE.Vector3((rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.08));
      const s = 0.6 + rng() * 0.9;
      m.scale.multiplyScalar(s);
      m.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      const v = new THREE.Vector3(rng() - 0.5, rng() * 0.8, rng() - 0.5).normalize().multiplyScalar(speed * (0.3 + rng())).addScaledVector(vel, 0.35);
      const w = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(30);
      this.scene.add(m);
      this.debris.push({ m, v, w, t: 0, life: kind === 'glass' ? 30 : 25, rest: false, r: 0.008 * s });
      if (this.debris.length > 260) {
        const old = this.debris.shift();
        this.scene.remove(old.m);
      }
    }
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += dt;
      t.m.material.opacity = 0.55 * (1 - t.t / t.life);
      if (t.t >= t.life) {
        this.scene.remove(t.m);
        t.m.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t += dt;
      const arr = f.pts.geometry.attributes.position.array;
      for (let k = 0; k < f.v.length; k++) {
        const v = f.v[k];
        if (!f.spark) v.multiplyScalar(Math.exp(-dt * 4));
        v.y -= (f.spark ? 9.81 : 0.4) * dt;
        arr[k * 3] += v.x * dt;
        arr[k * 3 + 1] = Math.max(0.002, arr[k * 3 + 1] + v.y * dt);
        arr[k * 3 + 2] += v.z * dt;
      }
      f.pts.geometry.attributes.position.needsUpdate = true;
      f.pts.material.opacity = (f.spark ? 1 : 0.8) * (1 - f.t / f.life);
      if (f.t >= f.life) {
        this.scene.remove(f.pts);
        f.pts.geometry.dispose();
        f.pts.material.dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (!d.rest) {
        d.v.y -= 9.81 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.w.x * dt;
        d.m.rotation.y += d.w.y * dt;
        d.m.rotation.z += d.w.z * dt;
        if (d.m.position.y < d.r) {
          d.m.position.y = d.r;
          d.v.y = -d.v.y * 0.25;
          d.v.x *= 0.55;
          d.v.z *= 0.55;
          d.w.multiplyScalar(0.5);
          if (Math.abs(d.v.y) < 0.25 && Math.hypot(d.v.x, d.v.z) < 0.15) {
            d.rest = true;
            d.m.rotation.x = Math.round(d.m.rotation.x / Math.PI) * Math.PI + 0.1 * (Math.random() - 0.5);
            d.m.rotation.z = Math.round(d.m.rotation.z / Math.PI) * Math.PI + 0.1 * (Math.random() - 0.5);
          }
        }
      }
      if (d.t > d.life) {
        this.scene.remove(d.m);
        this.debris.splice(i, 1);
      }
    }
    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) this.light.intensity = 0;
      else this.light.intensity *= 0.5;
    }
  }

  clearDebris() {
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris.length = 0;
  }
}
