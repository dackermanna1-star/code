// Gibs: severed limbs, heads and meat chunks as cheap instanced rigid bodies
// with bounce, friction, blood trails and splat decals on impact.
import * as THREE from 'three';
import { buildPartGeometries } from '../entities/partgeo.js';
import { DF } from '../render/decals.js';

const TYPES = ['head', 'uarm', 'farm', 'thigh', 'shin', 'chunk', 'chunk2', 'bone'];

export class Gibs {
  constructor(game, cap = 48) {
    this.game = game;
    this.cap = cap;
    const geos = buildPartGeometries({ segs: 7 });
    // limb geometries are unit length along Y; bake typical lengths
    const bake = (g, len) => { const c = g.clone(); c.scale(1, len, 1); c.translate(0, -len / 2, 0); return c; };
    const chunk = (r, seed) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      let s = seed;
      for (let i = 0; i < p.count; i++) {
        s = (s * 16807) % 2147483647;
        const k = 0.7 + (s / 2147483647) * 0.6;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      return g;
    };
    const bone = new THREE.CylinderGeometry(0.015, 0.02, 0.28, 5);
    const geoFor = {
      head: geos.head, uarm: bake(geos.uarm, 0.29), farm: bake(geos.farm, 0.3), thigh: bake(geos.thigh, 0.45), shin: bake(geos.shin, 0.47),
      chunk: chunk(0.07, 7), chunk2: chunk(0.05, 13), bone,
    };
    const flesh = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 });
    const meat = new THREE.MeshStandardMaterial({ color: 0x5a0a08, roughness: 0.3, metalness: 0 });
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.5 });
    this.meshes = {};
    for (const t of TYPES) {
      const mat = t === 'bone' ? boneMat : t.startsWith('chunk') ? meat : flesh;
      const m = new THREE.InstancedMesh(geoFor[t], mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.count = 0;
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.meshes[t] = { mesh: m, items: [] };
      game.scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._tmp = { x: 0, y: 0, z: 0 };
    this._contact = { nx: 0, ny: 0, nz: 0 };
  }
  clear() {
    for (const t of TYPES) { this.meshes[t].items = []; this.meshes[t].mesh.count = 0; }
  }
  spawn(type, x, y, z, vx, vy, vz, color = [0.5, 0.45, 0.4], scale = 1, quat = null) {
    const M = this.meshes[type];
    if (!M) return;
    if (M.items.length >= this.cap) M.items.shift();
    const q = quat ? quat.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    const r = type === 'head' ? 0.11 : type.startsWith('chunk') ? 0.06 : type === 'bone' ? 0.03 : 0.07;
    M.items.push({
      x, y, z, vx, vy, vz, q, av: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
      r: r * scale, scale, color, life: 30, bleed: 1.2, rest: false, hits: 0,
    });
  }
  // Burst a body into chunks (explosions).
  burst(x, y, z, look, power = 8, n = 10) {
    const skin = look?.skin || [0.5, 0.45, 0.4];
    const cloth = look?.cloth || [0.3, 0.3, 0.3];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2;
      const s = power * (0.4 + Math.random() * 0.8);
      const t = i % 4 === 0 ? 'chunk2' : 'chunk';
      this.spawn(t, x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 0.4, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s, [1, 1, 1]);
    }
    for (let i = 0; i < 2; i++) this.spawn('bone', x, y + 0.5, z, (Math.random() - 0.5) * power, power * 0.6, (Math.random() - 0.5) * power);
    this.game.fx.blood(x, y + 0.8, z, 0, 1, 0, 3);
    this.game.fx.blood(x, y + 0.8, z, 0, 0.2, 0, 3);
  }
  update(dt) {
    const g = this.game;
    const col = g.level?.col;
    const m = this._m, p = this._p, s = this._s, c = this._c;
    const dq = new THREE.Quaternion();
    for (const t of TYPES) {
      const M = this.meshes[t];
      const items = M.items;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.life -= dt;
        if (it.life <= 0) continue;
        if (!it.rest) {
          it.vy -= 16 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          // rotation
          const w = it.av.length();
          if (w > 0.001) {
            dq.setFromAxisAngle(this._s.copy(it.av).divideScalar(w), w * dt);
            it.q.premultiply(dq);
          }
          if (col) {
            const tp = this._tmp;
            tp.x = it.x; tp.y = it.y; tp.z = it.z;
            if (col.collideSphere(tp, it.r, this._contact)) {
              it.x = tp.x; it.y = tp.y; it.z = tp.z;
              const cn = this._contact;
              const nl = Math.hypot(cn.nx, cn.ny, cn.nz) || 1;
              const nx = cn.nx / nl, ny = cn.ny / nl, nz = cn.nz / nl;
              const vn = it.vx * nx + it.vy * ny + it.vz * nz;
              if (vn < 0) {
                it.vx -= 1.4 * vn * nx; it.vy -= 1.4 * vn * ny; it.vz -= 1.4 * vn * nz;
                it.vx *= 0.6; it.vz *= 0.6;
                it.av.multiplyScalar(0.6);
                if (it.hits < 2 && Math.abs(vn) > 2) {
                  it.hits++;
                  g.decals.add(it.x - nx * it.r, it.y - ny * it.r, it.z - nz * it.r, nx, ny, nz, 0.3 + Math.random() * 0.3, DF.BLOOD1 + (Math.random() * 4 | 0));
                  if (Math.random() < 0.5) g.audio.play('gibSplat', { pos: p.set(it.x, it.y, it.z), vol: 0.5 });
                }
              }
              if (ny > 0.6 && Math.hypot(it.vx, it.vy, it.vz) < 0.6) { it.rest = true; }
            }
          }
          if (it.bleed > 0) {
            it.bleed -= dt;
            if (Math.random() < 0.5) g.fx.bloodSpurt(it.x, it.y, it.z, it.vx * 0.05, 0, it.vz * 0.05);
          }
          if (it.y < -300) it.life = 0;
        }
        const fade = it.life < 1 ? it.life : 1;
        p.set(it.x, it.y, it.z);
        s.setScalar(it.scale * fade);
        m.compose(p, it.q, s);
        M.mesh.setMatrixAt(n, m);
        c.setRGB(it.color[0], it.color[1], it.color[2]);
        M.mesh.setColorAt(n, c);
        items[n] = it;
        n++;
      }
      items.length = n;
      M.mesh.count = n;
      M.mesh.instanceMatrix.needsUpdate = true;
      if (M.mesh.instanceColor) M.mesh.instanceColor.needsUpdate = true;
    }
  }
}

// Ejected shell casings: tiny instanced rigid bodies with clink sounds.
export class Shells {
  constructor(game, cap = 64) {
    this.game = game;
    this.cap = cap;
    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      game.scene.add(m);
      return { mesh: m, items: [] };
    };
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
    const red = new THREE.MeshStandardMaterial({ color: 0x9a1a14, roughness: 0.5 });
    this.types = {
      pistol: mk(new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 6), brass),
      rifle: mk(new THREE.CylinderGeometry(0.0045, 0.005, 0.045, 6), brass),
      shell: mk(new THREE.CylinderGeometry(0.0095, 0.0095, 0.06, 8), red),
    };
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._tmp = { x: 0, y: 0, z: 0 };
    this._c = { nx: 0, ny: 0, nz: 0 };
  }
  clear() { for (const k in this.types) { this.types[k].items = []; this.types[k].mesh.count = 0; } }
  spawn(x, y, z, vx, vy, vz, type) {
    const T = this.types[type] || this.types.pistol;
    if (T.items.length >= this.cap) T.items.shift();
    T.items.push({ x, y, z, vx: vx + (Math.random() - 0.5) * 0.6, vy: vy + Math.random() * 0.6, vz: vz + (Math.random() - 0.5) * 0.6,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
      av: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), life: 8, rest: false, clinks: 0, type });
  }
  update(dt) {
    const g = this.game;
    const col = g.level?.col;
    const dq = new THREE.Quaternion();
    const ax = new THREE.Vector3();
    for (const k in this.types) {
      const T = this.types[k];
      let n = 0;
      for (const it of T.items) {
        it.life -= dt;
        if (it.life <= 0) continue;
        if (!it.rest) {
          it.vy -= 16 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          const w = it.av.length();
          if (w > 0.01) { dq.setFromAxisAngle(ax.copy(it.av).divideScalar(w), w * dt); it.q.premultiply(dq); }
          if (col) {
            const tp = this._tmp; tp.x = it.x; tp.y = it.y; tp.z = it.z;
            if (col.collideSphere(tp, 0.01, this._c)) {
              it.x = tp.x; it.y = tp.y; it.z = tp.z;
              if (this._c.ny > 0.5) {
                if (it.vy < -0.8 && it.clinks < 3) {
                  it.clinks++;
                  g.audio.play(it.type === 'shell' ? 'shellDrop' : 'casing', { pos: this._p.set(it.x, it.y, it.z), vol: 0.35 });
                }
                it.vy = Math.abs(it.vy) * 0.3;
                it.vx *= 0.5; it.vz *= 0.5; it.av.multiplyScalar(0.5);
                if (Math.abs(it.vy) < 0.3) { it.rest = true; it.q.setFromEuler(new THREE.Euler(Math.PI / 2, Math.random() * 6, 0)); }
              } else { it.vx *= -0.3; it.vz *= -0.3; }
            }
          }
        }
        this._p.set(it.x, it.y, it.z);
        this._m.compose(this._p, it.q, this._s);
        T.mesh.setMatrixAt(n, this._m);
        T.items[n++] = it;
      }
      T.items.length = n;
      T.mesh.count = n;
      T.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
