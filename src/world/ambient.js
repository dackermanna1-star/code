// Ambient life: steam plumes (fed to the volumetric fog), falling drips with
// puddle ripples and synced drip sounds, and ripples/splashes under the
// walker's heels.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { shared } from '../render/shaderlib.js';
import { facadeById, facadeToWorld, LAMPS } from './layout.js';

const MAX_DROPS = 48;

export class Ambient {
  constructor(engine) {
    this.engine = engine;
    this.world = engine.world;
    this.rng = new RNG(8080);
    this.drops = [];
    this.dripPoints = [];
    this.steam = [];
  }

  build() {
    const r = this.rng;
    const w = this.world;
    // ── steam sources: kitchen exhaust, dryer vent, storm drains, manhole ──
    const L2 = facadeById('L2'), R0 = facadeById('R0');
    this.steam = [
      { pos: facadeToWorld(L2, 14.6, 2.75, 0.35), strength: 3.2, pulse: 0.3 },
      { pos: facadeToWorld(R0, 2.9, 2.5, 0.2), strength: 2.6, pulse: 0.6 },
      { pos: new THREE.Vector3(0.05, -0.02, -27.2), strength: 3.0, pulse: 0.4 },
      { pos: new THREE.Vector3(-0.1, -0.02, -61.0), strength: 2.6, pulse: 0.5 },
      { pos: new THREE.Vector3(-0.45, 0.0, -12.6), strength: 1.4, pulse: 0.8 },
    ];

    // ── drip points ──
    const add = (pos, min, max, extra = {}) => {
      const gy = w.groundHeight(pos.x, pos.z);
      const water = w.ground?.sample.water(pos.x, pos.z) ?? 0;
      // brightness: how strongly nearby lamps light the falling drop
      let lit = 0.02;
      for (const l of w.lamps) {
        const d2 = l.light.position.distanceToSquared(pos);
        lit += (l.base / (d2 + 1)) * 0.25;
      }
      this.dripPoints.push({ pos, min, max, next: r.range(0, max), groundY: gy + water, water: water > 0.002, lit, ...extra });
    };
    // fire escape platform edges (lowest platforms) and AC units
    for (const [id, u0, y] of [['L0', 16.2, 3.92], ['L1', 6.1, 4.52], ['L3', 10.6, 4.12]]) {
      const f = facadeById(id);
      for (let k = 0; k < 4; k++) add(facadeToWorld(f, u0 + r.range(-2.1, 2.1), y, 1.08), 1.2, 6.0);
    }
    for (const fx of w.facadeData.fixtures) {
      if (fx.kind === 'window' && fx.ac) add(facadeToWorld(fx.facade, fx.u + fx.w / 2 + r.range(-0.15, 0.15), fx.y - 0.05, 0.45), 0.9, 2.4, { steady: true });
    }
    // drops off the hero lamp shade (they catch the light)
    const hero = LAMPS.find((l) => l.id === 'L1rlm');
    if (hero) add(facadeToWorld(facadeById('L1'), hero.u + 0.1, hero.y - 0.1, (hero.out ?? 0.6) + 0.12), 1.6, 5.0);
    // cornices and wires
    for (let i = 0; i < 18; i++) {
      const side = r.sign();
      add(new THREE.Vector3(side * r.range(2.3, 2.65), r.range(5, 11), r.range(-72, 6)), 3, 14);
    }
    for (let i = 0; i < 8; i++) add(new THREE.Vector3(r.range(-1.5, 1.8), r.range(6, 9), r.range(-70, 5)), 5, 20);

    // ── droplet streak sprites ──
    const geo = new THREE.PlaneGeometry(0.004, 1);
    geo.translate(0, -0.5, 0);
    this.dropMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.6, 0.65, 0.75) } },
      vertexShader: /* glsl */ `
        attribute vec4 dropData; // len, brightness, unused, unused
        varying float vB;
        varying float vT;
        void main() {
          vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 toCam = normalize(cameraPosition - center);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 side = normalize(cross(up, toCam));
          vec3 p = center + side * position.x + up * position.y * dropData.x;
          vB = dropData.y;
          vT = -position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vB;
        varying float vT;
        void main() {
          float a = smoothstep(0.0, 0.3, vT) * smoothstep(1.0, 0.6, vT);
          gl_FragColor = vec4(uColor * vB * a, 1.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dropMesh = new THREE.InstancedMesh(geo, this.dropMat, MAX_DROPS);
    this.dropData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DROPS * 4), 4);
    geo.setAttribute('dropData', this.dropData);
    this.dropMesh.frustumCulled = false;
    this.dropMesh.count = 0;
    this.engine.scene.add(this.dropMesh);
    this._m = new THREE.Matrix4();

    // ── heel ripples ──
    this.engine.player.onStep((e) => {
      if (e.part !== 'heel' && e.part !== 'toe') return;
      if (e.surface === 'puddle') {
        w.ground.addRipple(e.position.x, e.position.z, e.part === 'heel' ? 1.0 : 0.6);
        if (e.part === 'heel') this.splash(e.position, 6);
      } else if (e.surface === 'wet') w.ground.addRipple(e.position.x, e.position.z, 0.35);
    });
    return this;
  }

  /** Tiny splash droplets thrown up from a footstep in a puddle. */
  splash(p, n) {
    for (let i = 0; i < n; i++) {
      if (this.drops.length >= MAX_DROPS) break;
      const a = this.rng.range(0, Math.PI * 2), s = this.rng.range(0.3, 0.9);
      this.drops.push({ x: p.x, y: p.y + 0.02, z: p.z, vx: Math.cos(a) * s * 0.4, vy: this.rng.range(0.6, 1.3), vz: Math.sin(a) * s * 0.4, groundY: p.y, water: true, lit: 0.25, splash: true });
    }
  }

  /** Strong gusts rattle the chain-link gate and a loose boarded door, and make wires creak. */
  windEvents(dt, t) {
    const audio = this.engine.audio;
    if (!audio?.ready) return;
    const w = this.world.windAt(t);
    if (w < 0.6) return;
    const k = (w - 0.6) * 2.5 * dt;
    if (Math.random() < k * 0.35) audio.oneShot('doorRattle', { position: { x: 0.9, y: 1.0, z: 7.0 } });
    if (Math.random() < k * 0.2) {
      const L0 = facadeById('L0');
      const p = facadeToWorld(L0, 21.9, 1.0, 0.05);
      audio.oneShot('doorRattle', { position: { x: p.x, y: p.y, z: p.z } });
    }
    if (Math.random() < k * 0.25) {
      const z = this.engine.player.pos.z + this.rng.range(-12, 6);
      audio.oneShot('wireCreak', { position: { x: this.rng.range(-2, 2.3), y: 8.5, z } });
    }
  }

  update(dt, t) {
    this.windEvents(dt, t);
    // steam → fog uniforms (gently pulsing)
    const su = this.engine.post?.fogMat?.uniforms.uSteam.value;
    if (su) {
      this.steam.forEach((s, i) => {
        if (i >= su.length) return;
        const pulse = 1 - s.pulse * (0.5 + 0.5 * Math.sin(t * 0.7 + i * 2.3)) * (0.5 + 0.5 * Math.sin(t * 0.23 + i));
        su[i].set(s.pos.x, s.pos.y, s.pos.z, s.strength * pulse);
      });
    }
    // spawn drips
    const cam = this.engine.camera.position;
    for (const d of this.dripPoints) {
      d.next -= dt;
      if (d.next > 0) continue;
      d.next = d.steady ? this.rng.range(d.min, d.min * 1.15) : this.rng.range(d.min, d.max);
      if (this.drops.length >= MAX_DROPS) continue;
      // only simulate drips that could be seen or heard
      if (d.pos.distanceToSquared(cam) > 30 * 30) continue;
      this.drops.push({ x: d.pos.x, y: d.pos.y, z: d.pos.z, vx: 0, vy: 0, vz: 0, groundY: d.groundY, water: d.water, lit: d.lit, surface: d.surface });
    }
    // simulate
    let n = 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const p = this.drops[i];
      p.vy -= 9.81 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y <= p.groundY) {
        if (!p.splash) {
          if (p.water) this.world.ground.addRipple(p.x, p.z, 0.55);
          this.engine.audio?.oneShot?.('drip', { position: { x: p.x, y: p.groundY, z: p.z }, surface: p.water ? 'water' : p.surface ?? 'ground' });
        }
        this.drops.splice(i, 1);
        continue;
      }
    }
    for (const p of this.drops) {
      if (n >= MAX_DROPS) break;
      this._m.makeTranslation(p.x, p.y, p.z);
      this.dropMesh.setMatrixAt(n, this._m);
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      this.dropData.setXYZW(n, Math.max(0.01, speed / 60), Math.min(1.5, p.lit) * (p.splash ? 0.6 : 1), 0, 0);
      n++;
    }
    this.dropMesh.count = n;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    this.dropData.needsUpdate = true;
  }
}
