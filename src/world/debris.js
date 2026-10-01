// Reactive debris: cans and bottles that get kicked and roll away, paper
// scraps and plastic bags pushed along by gusts. Simple 2D physics against the
// collision grid, with sounds from the audio engine.
import * as THREE from 'three';
import { PROPS } from '../props/catalog.js';
import { meshModel } from '../voxel/mesher.js';
import { RNG } from '../core/rng.js';

const KINDS = {
  can: { radius: 0.035, friction: 0.55, kick: 2.4, sound: 'canKick', roll: true },
  bottle: { radius: 0.04, friction: 0.9, kick: 1.6, sound: 'bottleKick', roll: true },
  paperScrap: { radius: 0.06, friction: 3.5, kick: 0.6, sound: 'paperRustle', wind: 1.0 },
  plasticBag: { radius: 0.14, friction: 2.2, kick: 0.8, sound: 'plasticRustle', wind: 1.8, lift: true },
};

export class Debris {
  constructor(engine, material) {
    this.engine = engine;
    this.world = engine.world;
    this.material = material;
    this.items = [];
    this.rng = new RNG(6060);
    this.geoCache = new Map();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  geo(name, variant) {
    const key = `${name}:${variant}`;
    if (this.geoCache.has(key)) return this.geoCache.get(key);
    const gen = PROPS[name];
    if (!gen) return null;
    let g = null;
    try {
      const res = gen(new RNG(500 + variant * 13), { variant });
      g = meshModel(res.model);
    } catch (e) {
      console.warn('debris prop failed', name, e);
    }
    this.geoCache.set(key, g);
    return g;
  }

  build() {
    const r = this.rng;
    const spawn = (name, n, zone) => {
      for (let i = 0; i < n; i++) {
        const variant = r.int(0, 5);
        const g = this.geo(name, variant);
        if (!g) return;
        let x, z, tries = 0;
        do {
          ({ x, z } = zone(r));
          tries++;
        } while ((this.world.collision?.circleBlocked(x, z, 0.08) || (this.world.ground?.sample.water(x, z) ?? 0) > 0.004) && tries < 20);
        const mesh = new THREE.Mesh(g, this.material);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.engine.scene.add(mesh);
        const k = KINDS[name];
        this.items.push({
          name, k, mesh,
          x, z, y: 0,
          vx: 0, vz: 0, vy: 0,
          yaw: r.range(0, Math.PI * 2),
          roll: k.roll ? Math.PI / 2 : 0,
          spin: 0,
          lastSound: -10,
          flutter: r.range(0, 10),
        });
      }
    };
    const path = (rr) => ({ x: rr.normal(0, 0.9), z: rr.range(-72, 5) });
    const walls = (rr) => ({ x: rr.sign() * rr.range(1.4, 2.5), z: rr.range(-72, 5) });
    spawn('can', 26, path);
    spawn('can', 10, walls);
    spawn('bottle', 12, path);
    spawn('paperScrap', 16, (rr) => (rr.chance(0.5) ? path(rr) : walls(rr)));
    spawn('plasticBag', 3, path);
    this.update(0, 0);
    return this;
  }

  update(dt, t) {
    const pl = this.engine.player;
    const wind = this.world.windAt ? this.world.windAt(t) : 0.3;
    const windDir = { x: 0.18 * Math.sin(t * 0.05), z: -1 }; // gusts run down the alley
    const audio = this.engine.audio;
    const speed = pl ? pl.speed : 0;
    const fx = pl ? -Math.sin(pl.yaw) : 0, fz = pl ? -Math.cos(pl.yaw) : 0;
    for (const it of this.items) {
      const k = it.k;
      // ── player interaction: feet sweep a small zone ahead of the hips ──
      if (pl && speed > 0.15) {
        const ax = pl.pos.x + fx * 0.25, az = pl.pos.z + fz * 0.25;
        const dx = it.x - ax, dz = it.z - az;
        const d = Math.hypot(dx, dz);
        if (d < 0.2 + k.radius && t - it.lastSound > 0.35) {
          const lat = (dx * -fz + dz * fx) / Math.max(d, 1e-3);
          const kick = k.kick * (0.5 + speed * 0.5) * (0.7 + 0.6 * Math.random());
          it.vx += (fx + -fz * lat * 0.6) * kick;
          it.vz += (fz + fx * lat * 0.6) * kick;
          if (k.roll) it.vy = 0.4 * Math.random();
          it.lastSound = t;
          audio?.oneShot?.(k.sound, { position: { x: it.x, y: 0.05, z: it.z }, strength: Math.min(1, kick / k.kick) });
          if (k.roll && kick > 1.2) audio?.oneShot?.('canRoll', { position: { x: it.x, y: 0.05, z: it.z }, duration: Math.min(2.5, kick * 0.6) });
        }
      }
      // ── wind ──
      if (k.wind) {
        const gust = Math.max(0, wind - 0.35) * k.wind;
        const turb = Math.sin(t * 3.1 + it.flutter) * 0.5 + Math.sin(t * 7.3 + it.flutter * 2) * 0.3;
        it.vx += (windDir.x + turb * 0.4) * gust * 2.2 * dt;
        it.vz += windDir.z * gust * 2.2 * dt;
        if (k.lift && gust > 0.25 && it.y < 0.02 && Math.random() < dt * 3) it.vy = 0.8 + gust * 2.0;
        const sp = Math.hypot(it.vx, it.vz);
        if (sp > 0.35 && t - it.lastSound > 1.2 && Math.random() < dt * 2) {
          it.lastSound = t;
          audio?.oneShot?.(k.sound, { position: { x: it.x, y: 0.1, z: it.z }, strength: Math.min(1, sp * 0.8) });
        }
      }
      // ── integrate ──
      if (dt > 0) {
        it.vy -= 9.8 * dt * (k.lift ? 0.25 : 1);
        it.y += it.vy * dt;
        if (it.y < 0) {
          it.y = 0;
          it.vy = Math.abs(it.vy) > 0.6 ? -it.vy * 0.3 : 0;
        }
        const fr = Math.exp(-k.friction * dt * (it.y > 0.01 ? 0.2 : 1));
        it.vx *= fr;
        it.vz *= fr;
        const nx = it.x + it.vx * dt, nz = it.z + it.vz * dt;
        const coll = this.world.collision;
        if (coll && coll.circleBlocked(nx, nz, k.radius)) {
          if (coll.circleBlocked(nx, it.z, k.radius)) it.vx *= -0.35;
          if (coll.circleBlocked(it.x, nz, k.radius)) it.vz *= -0.35;
        } else {
          it.x = nx;
          it.z = nz;
        }
        const sp = Math.hypot(it.vx, it.vz);
        if (k.roll && sp > 0.02) {
          it.yaw = Math.atan2(it.vx, it.vz);
          it.spin += (sp / k.radius) * dt;
        } else if (!k.roll && sp > 0.05) {
          it.yaw += (Math.sin(t * 2 + it.flutter) * sp * 2) * dt;
        }
      }
      const gy = this.world.groundHeight(it.x, it.z);
      const m = it.mesh;
      m.position.set(it.x, gy + it.y + (k.roll ? k.radius * 0.9 : 0), it.z);
      if (k.roll) {
        // lying on its side, rolling around its long axis
        this._e.set(it.spin, it.yaw, Math.PI / 2, 'YXZ');
        m.quaternion.setFromEuler(this._e);
      } else if (k.lift) {
        const fl = it.y > 0.02 ? Math.sin(t * 9 + it.flutter) * 0.5 : 0;
        m.rotation.set(fl * 0.3, it.yaw, fl * 0.2);
        m.scale.set(1, 1 + 0.08 * Math.sin(t * 5 + it.flutter) * Math.min(1, wind * 2), 1);
      } else {
        m.rotation.set(0, it.yaw, 0);
      }
    }
  }
}
