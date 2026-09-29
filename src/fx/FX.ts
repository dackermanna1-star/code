import * as THREE from 'three';
import { G } from '../core/G';
import { clamp, rand } from '../core/math';
import { makeFlashTexture, makeGlowTexture, makePuffTexture } from '../render/textures';
import { DebrisSystem, twoToneBox } from './Debris';
import { LightPool } from './Lights';
import { ParticleSystem } from './Particles';
import { Stains } from './Stains';
import { Tracers } from './Tracers';

const BLOOD_BRIGHT = [0.5, 0.018, 0.018];
const BLOOD_DARK = [0.2, 0.006, 0.006];

interface FirePatch {
  x: number;
  z: number;
  r: number;
  t: number;
  dps: number;
  acc: number;
  source: string;
}

interface Ring {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  busy: boolean;
}

/**
 * High-level visual effects facade used by gameplay code.
 */
export class FX {
  readonly blood: ParticleSystem;
  readonly mist: ParticleSystem;
  readonly sparksP: ParticleSystem;
  readonly fire: ParticleSystem;
  readonly smoke: ParticleSystem;
  readonly dust: ParticleSystem;
  readonly chips: ParticleSystem;
  readonly flashes: ParticleSystem;
  readonly stains: Stains;
  readonly tracers = new Tracers();
  readonly lights: LightPool;
  readonly casings: DebrisSystem;
  readonly shells: DebrisSystem;
  readonly bigCasings: DebrisSystem;
  readonly gibs: DebrisSystem;
  readonly splinters: DebrisSystem;
  private patches: FirePatch[] = [];
  private rings: Ring[] = [];
  private time = 0;
  readonly flashTex = makeFlashTexture();
  readonly glowTex = makeGlowTexture();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    const puff = makePuffTexture();
    this.blood = new ParticleSystem({ max: 7000, lit: true, stretch: 0.012, ground: true, alphaTest: 0.5, depthWrite: true, renderOrder: 5 });
    this.mist = new ParticleSystem({ max: 900, lit: true, texture: puff, renderOrder: 14 });
    this.sparksP = new ParticleSystem({ max: 3000, blending: 'additive', stretch: 0.02, ground: false, renderOrder: 15 });
    this.fire = new ParticleSystem({ max: 5000, blending: 'additive', texture: this.glowTex, renderOrder: 16 });
    this.smoke = new ParticleSystem({ max: 2500, lit: true, texture: puff, renderOrder: 13 });
    this.dust = new ParticleSystem({ max: 1800, lit: true, texture: puff, renderOrder: 12 });
    this.chips = new ParticleSystem({ max: 3000, lit: true, ground: true, alphaTest: 0.5, depthWrite: true, renderOrder: 6 });
    this.flashes = new ParticleSystem({ max: 200, blending: 'additive', texture: this.glowTex, renderOrder: 17, fog: false });
    for (const p of [this.blood, this.mist, this.sparksP, this.fire, this.smoke, this.dust, this.chips, this.flashes]) scene.add(p.mesh);
    this.stains = new Stains(renderer, scene);
    scene.add(this.tracers.mesh);
    this.lights = new LightPool(scene, 5);

    const litMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const brass = new THREE.MeshLambertMaterial({ color: 0xd8a640, emissive: 0x2a1a05 });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    this.casings = new DebrisSystem({ geo: unit, max: 1800, bounce: 0.35, friction: 0.6, sound: 'casing' }, brass);
    this.bigCasings = new DebrisSystem({ geo: unit, max: 600, bounce: 0.3, friction: 0.55, sound: 'casingBig' }, brass);
    this.shells = new DebrisSystem({ geo: twoToneBox(1, 1, 1, 0.28, 0xd8a640, 0xb3261e), max: 700, bounce: 0.3, friction: 0.55, sound: 'shell' }, vcMat);
    this.gibs = new DebrisSystem(
      {
        geo: unit,
        max: 3000,
        bounce: 0.18,
        friction: 0.45,
        sound: 'gib',
        castShadow: true,
        onLand: (x, z, speed) => {
          if (Math.random() < 0.8) this.stains.blood(x, z, 0.18 + Math.min(0.3, speed * 0.04));
        },
      },
      litMat,
    );
    this.splinters = new DebrisSystem({ geo: unit, max: 1500, bounce: 0.3, friction: 0.5, castShadow: true, sound: 'wood' }, litMat);
    for (const d of [this.casings, this.bigCasings, this.shells, this.gibs, this.splinters]) {
      scene.add(d.mesh);
      d.onSound = (x, y, z, speed, kind) => G.audio?.debris(kind, x, y, z, speed);
    }
    // shockwave rings
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      );
      m.visible = false;
      m.renderOrder = 18;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 0.4, r0: 0.5, r1: 8, busy: false });
    }
  }

  setAmbient(c: THREE.Color) {
    for (const p of [this.blood, this.mist, this.smoke, this.dust, this.chips]) p.ambient.copy(c);
  }

  clear() {
    for (const p of [this.blood, this.mist, this.sparksP, this.fire, this.smoke, this.dust, this.chips, this.flashes]) p.clear();
    for (const d of [this.casings, this.bigCasings, this.shells, this.gibs, this.splinters]) d.clear();
    this.stains.clear();
    this.patches.length = 0;
  }

  update(dt: number, now: number) {
    this.time = now;
    for (const p of [this.blood, this.mist, this.sparksP, this.fire, this.smoke, this.dust, this.chips, this.flashes]) p.update(now);
    this.stains.update(now);
    this.tracers.update(now);
    this.lights.update(dt);
    for (const d of [this.casings, this.bigCasings, this.shells, this.gibs, this.splinters]) d.update(dt);
    for (const r of this.rings) {
      if (!r.busy) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) {
        r.busy = false;
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
    }
    this.updatePatches(dt);
  }

  // ---------------------------------------------------------------- blood
  private emitBlood(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, stain: boolean) {
    const bright = Math.random();
    const r = BLOOD_DARK[0] + (BLOOD_BRIGHT[0] - BLOOD_DARK[0]) * bright;
    const g = BLOOD_DARK[1] + (BLOOD_BRIGHT[1] - BLOOD_DARK[1]) * bright;
    this.blood.emit(x, y, z, vx, vy, vz, life, size, size * 0.8, r, g, g, 1, r * 0.6, g * 0.5, g * 0.5, 1, 1.2, 1.0);
    if (stain) {
      // approximate landing point (drag-reduced ballistic flight)
      const gg = 9.81;
      const tl = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * gg * Math.max(0.02, y)))) / gg;
      const k = 1.2;
      const hx = (vx * (1 - Math.exp(-k * tl))) / k;
      const hz = (vz * (1 - Math.exp(-k * tl))) / k;
      this.stains.blood(x + hx, z + hz, 0.12 + size * 3 + Math.random() * 0.12, Math.min(tl, life));
    }
  }

  bloodHit(x: number, y: number, z: number, dx: number, dy: number, dz: number, amount: number, kind: string) {
    const n = Math.round(6 + amount * 10);
    const spd = kind === 'pellet' ? 3.5 : kind === 'explosion' ? 5 : 4.5;
    for (let i = 0; i < n; i++) {
      const s = spd * rand(0.3, 1.2);
      const exitSide = Math.random() < 0.72;
      const sx = (exitSide ? dx : -dx * 0.6) + rand(-0.45, 0.45);
      const sy = (exitSide ? dy : -dy * 0.6) + rand(-0.2, 0.6);
      const sz = (exitSide ? dz : -dz * 0.6) + rand(-0.45, 0.45);
      this.emitBlood(x, y, z, sx * s, sy * s + 0.8, sz * s, rand(0.025, 0.06), rand(0.7, 1.5), i % 3 === 0);
    }
    const mists = Math.min(3, 1 + Math.floor(amount));
    for (let i = 0; i < mists; i++) {
      this.mist.emit(x, y, z, dx * rand(0.3, 1.2) + rand(-0.3, 0.3), rand(0, 0.4), dz * rand(0.3, 1.2) + rand(-0.3, 0.3), rand(0.25, 0.5), 0.12, 0.55 + amount * 0.15, 0.45, 0.02, 0.02, 0.75, 0.3, 0.01, 0.01, 0, 3, 0.1, rand(0, 6), rand(-2, 2));
    }
    // a splat right behind the victim
    if (Math.random() < 0.7) this.stains.blood(x + dx * rand(0.4, 1.4), z + dz * rand(0.4, 1.4), rand(0.2, 0.45) * Math.min(1.5, amount), 0.25);
  }

  bloodBurst(x: number, y: number, z: number, amount: number) {
    const n = Math.round(10 + amount * 16);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 4.5) * (0.6 + amount * 0.3);
      this.emitBlood(x, y, z, Math.cos(a) * s, rand(0.5, 4), Math.sin(a) * s, rand(0.03, 0.07), rand(0.8, 1.6), i % 2 === 0);
    }
    for (let i = 0; i < 3; i++)
      this.mist.emit(x, y, z, rand(-0.6, 0.6), rand(0, 0.5), rand(-0.6, 0.6), rand(0.4, 0.7), 0.2, 0.8 + amount * 0.3, 0.42, 0.02, 0.02, 0.7, 0.25, 0.01, 0.01, 0, 2.5, 0.05, rand(0, 6), 0);
    this.stains.blood(x + rand(-0.3, 0.3), z + rand(-0.3, 0.3), 0.5 + amount * 0.35, 0.4);
    this.bloodPool(x, z, 0.5 + amount * 0.35);
  }

  /** Slowly growing pool under a body. */
  bloodPool(x: number, z: number, size: number) {
    for (let i = 0; i < 4; i++) {
      this.stains.stamp(x + rand(-0.15, 0.15), z + rand(-0.15, 0.15), size * (0.5 + i * 0.22), 0.16, 0.006, 0.006, 0.45, 8 + Math.floor(Math.random() * 8), 0.6 + i * 0.7);
    }
  }

  bloodSpurt(x: number, y: number, z: number, strength: number) {
    for (let i = 0; i < 2; i++) this.emitBlood(x, y, z, rand(-0.8, 0.8), rand(1.5, 3.5) * strength, rand(-0.8, 0.8), rand(0.02, 0.045), rand(0.5, 1), Math.random() < 0.3);
  }

  /** A single drop falling from a wound. */
  drip(x: number, y: number, z: number) {
    this.emitBlood(x, y, z, rand(-0.15, 0.15), rand(-0.3, 0), rand(-0.15, 0.15), rand(0.01, 0.018), 0.9, Math.random() < 0.3);
  }

  bloodDrip(x: number, z: number, size: number) {
    this.stains.blood(x, z, 0.05 + size * 0.07, 0, 0.8);
  }

  headPop(x: number, y: number, z: number, dx: number, dy: number, dz: number, skin: number) {
    for (let i = 0; i < 46; i++) {
      const s = rand(1.5, 6);
      this.emitBlood(x, y, z, (dx * 0.8 + rand(-0.7, 0.7)) * s, (dy * 0.5 + rand(0, 0.9)) * s, (dz * 0.8 + rand(-0.7, 0.7)) * s, rand(0.03, 0.08), rand(0.8, 1.6), i % 2 === 0);
    }
    for (let i = 0; i < 5; i++)
      this.mist.emit(x, y, z, dx * rand(0.5, 2) + rand(-0.6, 0.6), rand(0, 0.8), dz * rand(0.5, 2) + rand(-0.6, 0.6), rand(0.4, 0.8), 0.25, 1.2, 0.5, 0.02, 0.02, 0.85, 0.3, 0.01, 0.01, 0, 2, 0.05, rand(0, 6), 0);
    this.gore(x, y, z, 9, skin, dx, dz);
    // bone chips
    for (let i = 0; i < 6; i++) {
      this.gibs.spawn(x, y, z, dx * rand(1, 4) + rand(-2, 2), rand(1, 4), dz * rand(1, 4) + rand(-2, 2), rand(0.02, 0.045), rand(0.02, 0.04), rand(0.02, 0.05), 0xe8e0cc);
    }
  }

  private gibColor = new THREE.Color();
  gore(x: number, y: number, z: number, n: number, skin: number, dx = 0, dz = 0) {
    const pal = G.skinPalette?.[skin] as number[][] | undefined;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (pal && r < 0.45) {
        const c = pal[Math.floor(Math.random() * pal.length)];
        this.gibColor.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
      } else if (r < 0.85) this.gibColor.setRGB(rand(0.25, 0.45), 0.01, 0.015);
      else this.gibColor.setRGB(0.8, 0.75, 0.62);
      const s = rand(0.04, 0.1);
      this.gibs.spawn(x + rand(-0.1, 0.1), y + rand(-0.1, 0.1), z + rand(-0.1, 0.1), dx * 3 + rand(-3, 3), rand(1.5, 5), dz * 3 + rand(-3, 3), s, s * rand(0.6, 1.2), s * rand(0.7, 1.3), this.gibColor);
    }
  }

  // ---------------------------------------------------------------- impacts
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, n: number, speed = 6) {
    for (let i = 0; i < n; i++) {
      const s = rand(0.3, 1) * speed;
      this.sparksP.emit(x, y, z, (nx + rand(-0.7, 0.7)) * s, (ny + rand(-0.3, 0.9)) * s, (nz + rand(-0.7, 0.7)) * s, rand(0.15, 0.45), 0.02, 0.01, 3.2, 2.4, 1.2, 1, 1.6, 0.5, 0.1, 1, 1.5, 1.2);
    }
    this.flashes.emit(x, y, z, 0, 0, 0, 0.05, 0.25, 0.1, 2.5, 2.2, 1.6, 1, 1, 0.6, 0.2, 0);
  }

  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, material: string) {
    const col =
      material === 'wood' ? [0.35, 0.22, 0.12] : material === 'metal' ? [0.3, 0.3, 0.32] : material === 'concrete' ? [0.55, 0.55, 0.52] : material === 'asphalt' ? [0.18, 0.18, 0.19] : [0.35, 0.3, 0.18];
    for (let i = 0; i < 6; i++) {
      const s = rand(1, 4);
      this.chips.emit(x, y, z, (nx + rand(-0.6, 0.6)) * s, (ny + rand(0, 1)) * s, (nz + rand(-0.6, 0.6)) * s, rand(0.4, 0.9), rand(0.02, 0.04), 0.02, col[0], col[1], col[2], 1, col[0], col[1], col[2], 1, 0.5, 1);
    }
    const dc = material === 'asphalt' ? [0.5, 0.5, 0.5] : [0.65, 0.58, 0.44];
    this.dust.emit(x, y, z, nx * 0.6, 0.4 + ny * 0.3, nz * 0.6, rand(0.5, 0.9), 0.1, 0.55, dc[0], dc[1], dc[2], 0.55, dc[0], dc[1], dc[2], 0, 2, -0.02, rand(0, 6), 0);
    if (material === 'metal') this.sparks(x, y, z, nx, ny, nz, 5, 4);
  }

  structureHit(s: any, z: any) {
    const x = (s.x + z.x) / 2;
    const zz = (s.z + z.z) / 2;
    const mat = s.def?.material ?? 'wood';
    const dx = z.x - s.x;
    const dz = z.z - s.z;
    const l = Math.hypot(dx, dz) || 1;
    this.impact(x, 0.6 + Math.random() * 0.5, zz, dx / l, 0.3, dz / l, mat);
    if (mat === 'wood') {
      for (let i = 0; i < 2; i++) this.splinters.spawn(x, 0.7, zz, (dx / l) * rand(0.5, 2), rand(1, 3), (dz / l) * rand(0.5, 2), 0.02, 0.02, rand(0.08, 0.2), 0x8a5a30);
    }
    G.audio?.structHit(mat, x, 0.8, zz);
  }

  // ---------------------------------------------------------------- fire & smoke
  fireAt(x: number, y: number, z: number, size: number) {
    this.fire.emit(x + rand(-0.05, 0.05), y, z + rand(-0.05, 0.05), rand(-0.2, 0.2), rand(0.8, 1.8) * size, rand(-0.2, 0.2), rand(0.35, 0.7), 0.22 * size, 0.05, 2.6, 1.3, 0.35, 1, 1.4, 0.2, 0.02, 0, 0.6, -0.15, rand(0, 6), rand(-2, 2));
    if (Math.random() < 0.25)
      this.smoke.emit(x, y + 0.3, z, rand(-0.2, 0.2), rand(0.6, 1.2), rand(-0.2, 0.2), rand(1.2, 2.2), 0.2, 0.9 * size + 0.3, 0.12, 0.11, 0.1, 0.5, 0.2, 0.19, 0.18, 0, 0.8, -0.05, rand(0, 6), rand(-0.5, 0.5));
  }

  muzzleSmoke(x: number, y: number, z: number, dx: number, dy: number, dz: number, amount = 1) {
    for (let i = 0; i < Math.ceil(amount * 2); i++)
      this.smoke.emit(x, y, z, dx * rand(0.4, 1.4) + rand(-0.15, 0.15), dy * 0.8 + rand(0.1, 0.4), dz * rand(0.4, 1.4) + rand(-0.15, 0.15), rand(0.5, 1.1), 0.05, 0.3 * amount + 0.1, 0.8, 0.8, 0.8, 0.28, 0.8, 0.8, 0.8, 0, 2.2, -0.05, rand(0, 6), rand(-1, 1));
  }

  worldMuzzleFlash(x: number, y: number, z: number, size: number) {
    this.flashes.emit(x, y, z, 0, 0, 0, 0.05, size, size * 0.5, 3, 2.4, 1.2, 1, 1.5, 0.6, 0.1, 0);
    this.lights.flash(x, y, z, 0xffb060, 10 * size, 10, 0.07);
  }

  addFirePatch(x: number, z: number, r: number, dur: number, dps: number, source = 'fire') {
    if (this.patches.length > 60) this.patches.shift();
    this.patches.push({ x, z, r, t: dur, dps, acc: 0, source });
    this.stains.scorch(x, z, r * 1.4);
  }

  private near: any[] = [];
  private updatePatches(dt: number) {
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const p = this.patches[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.patches.splice(i, 1);
        continue;
      }
      p.acc += dt * 30 * p.r * Math.min(1, p.t);
      while (p.acc > 1) {
        p.acc -= 1;
        const a = Math.random() * 6.28;
        const d = Math.sqrt(Math.random()) * p.r;
        this.fireAt(p.x + Math.cos(a) * d, 0.05, p.z + Math.sin(a) * d, 0.9);
      }
      if (G.zombies && Math.random() < dt * 6) {
        G.zombies.queryRadius(p.x, p.z, p.r + 0.3, this.near);
        for (const z of this.near) G.zombies.ignite(z, p.dps, 3.5, p.source);
      }
    }
  }

  // ---------------------------------------------------------------- explosions
  explosionVisual(x: number, y: number, z: number, radius: number, big = false) {
    const k = radius / 5;
    // flash
    this.flashes.emit(x, y + 0.3, z, 0, 0, 0, 0.14, 5 * k, 9 * k, 4, 3.4, 2.4, 1, 3, 1.4, 0.4, 0);
    // fireball
    const nf = Math.round(46 * k + (big ? 20 : 0));
    for (let i = 0; i < nf; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 - 0.1;
      const s = rand(2, 9) * k;
      this.fire.emit(
        x + rand(-0.3, 0.3), y + rand(0, 0.4), z + rand(-0.3, 0.3),
        Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + rand(0.5, 2.5), Math.sin(a) * Math.cos(e) * s,
        rand(0.35, 0.8), rand(0.6, 1.3) * k, rand(0.2, 0.5) * k,
        3.2, 2.2, 1.0, 1, 1.8, 0.35, 0.04, 0, 3.5, -0.25, rand(0, 6), rand(-2, 2),
      );
    }
    // smoke column
    const ns = Math.round(26 * k);
    for (let i = 0; i < ns; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.5, 3.2) * k;
      const shade = rand(0.08, 0.2);
      this.smoke.emit(
        x + rand(-0.5, 0.5), y + rand(0, 0.8), z + rand(-0.5, 0.5),
        Math.cos(a) * s, rand(1, 4) * k, Math.sin(a) * s,
        rand(2.5, 5.5), rand(0.6, 1.2) * k, rand(2.5, 4.5) * k,
        shade, shade * 0.95, shade * 0.9, 0.85, shade * 1.6, shade * 1.55, shade * 1.5, 0,
        1.1, -0.04, rand(0, 6), rand(-0.4, 0.4), rand(0, 0.12),
      );
    }
    // sparks & embers
    for (let i = 0; i < 70 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(4, 16) * k;
      this.sparksP.emit(x, y + 0.2, z, Math.cos(a) * s, rand(2, 10) * k, Math.sin(a) * s, rand(0.4, 1.2), 0.03, 0.01, 3.4, 2, 0.7, 1, 1.5, 0.4, 0.1, 1, 0.8, 1);
    }
    // dirt/asphalt chunks
    for (let i = 0; i < 26 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(2, 9) * k;
      const c = rand(0.15, 0.3);
      this.chips.emit(x, y + 0.1, z, Math.cos(a) * s, rand(3, 10) * k, Math.sin(a) * s, rand(0.8, 1.6), rand(0.04, 0.09), 0.04, c, c * 0.9, c * 0.75, 1, c, c * 0.9, c * 0.75, 1, 0.3, 1);
    }
    // dust ring along the ground
    for (let i = 0; i < 18 * k; i++) {
      const a = (i / (18 * k)) * Math.PI * 2;
      const s = rand(5, 9) * k;
      this.dust.emit(x, 0.2, z, Math.cos(a) * s, rand(0.2, 0.8), Math.sin(a) * s, rand(0.8, 1.5), 0.6 * k, 2.4 * k, 0.5, 0.45, 0.36, 0.6, 0.5, 0.45, 0.36, 0, 3.5, -0.02, rand(0, 6), 0);
    }
    // shockwave
    const ring = this.rings.find((r) => !r.busy) ?? this.rings[0];
    ring.busy = true;
    ring.t = 0;
    ring.dur = 0.38;
    ring.r0 = 0.5;
    ring.r1 = radius * 1.8;
    ring.mesh.position.set(x, 0.08, z);
    ring.mesh.visible = true;
    this.lights.flash(x, y + 1.5, z, 0xff9a40, 90 * k, radius * 6, 0.7, 0.3);
    this.stains.scorch(x, z, radius * 0.9);
  }
}
