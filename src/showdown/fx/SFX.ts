import * as THREE from 'three';
import { mulberry32 } from '../../core/math';
import { DebrisSystem } from '../../fx/Debris';
import { LightPool } from '../../fx/Lights';
import { ParticleSystem } from '../../fx/Particles';
import { Arcs, Pulses, Streaks } from '../../gojo/GojoFX';
import { makeGlowTexture, makePuffTexture } from '../../render/textures';
import { GroundCuts, Slashes } from '../../sukuna/SukunaFX';
import { SD } from '../core/SD';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const Z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ ribbon lightning
const MAXB = 1400;
/**
 * Jagged ribbons drawn as camera-facing quads per segment: a normal-blended
 * ink core (Black Flash's black lightning) plus an additive glow.
 */
class Bolts {
  readonly ink: THREE.InstancedMesh;
  readonly glow: THREE.InstancedMesh;
  private nInk = 0;
  private nGlow = 0;
  private live: { a: THREE.Vector3; b: THREE.Vector3; w: number; col: THREE.Color; ink: boolean; t: number; life: number; jitter: number; segs: number; seed: number }[] = [];

  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.ink = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false, transparent: true, fog: false }), MAXB);
    this.glow = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }), MAXB);
    for (const m of [this.ink, this.glow]) {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.ink.renderOrder = 41;
    this.glow.renderOrder = 40;
  }

  /** A bolt from a to b that crackles for `life` seconds. */
  bolt(a: THREE.Vector3, b: THREE.Vector3, w: number, color: THREE.ColorRepresentation, ink: boolean, life = 0.18, jitter = 0.3, segs = 9) {
    this.live.push({ a: a.clone(), b: b.clone(), w, col: new THREE.Color(color), ink, t: 0, life, jitter, segs, seed: Math.random() * 1000 });
  }

  update(dt: number, cam: THREE.Camera) {
    this.nInk = this.nGlow = 0;
    const cp = cam.getWorldPosition(_v2.set(0, 0, 0)).clone();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const L = this.live[i];
      L.t += dt;
      if (L.t >= L.life) {
        this.live.splice(i, 1);
        continue;
      }
      // re-roll the shape a few times per bolt for flicker
      const r = mulberry32(Math.floor(L.seed + L.t * 40));
      const fade = 1 - L.t / L.life;
      let x0 = L.a.clone();
      for (let s = 1; s <= L.segs; s++) {
        const t = s / L.segs;
        const j = s === L.segs ? 0 : L.jitter * Math.sin(t * Math.PI);
        const x1 = new THREE.Vector3().lerpVectors(L.a, L.b, t).add(new THREE.Vector3((r() - 0.5) * j, (r() - 0.5) * j, (r() - 0.5) * j));
        this.seg(x0, x1, L.w * (0.6 + 0.4 * fade) * (1 - t * 0.5), L.col, L.ink, fade, cp);
        // branches
        if (r() < 0.18 && s < L.segs - 1) {
          const br = x1.clone().add(new THREE.Vector3((r() - 0.5) * L.jitter * 2.5, (r() - 0.5) * L.jitter * 2.5, (r() - 0.5) * L.jitter * 2.5));
          this.seg(x1, br, L.w * 0.5, L.col, L.ink, fade, cp);
        }
        x0 = x1;
      }
    }
    for (const [m, n] of [
      [this.ink, this.nInk],
      [this.glow, this.nGlow],
    ] as [THREE.InstancedMesh, number][]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private seg(a: THREE.Vector3, b: THREE.Vector3, w: number, col: THREE.Color, ink: boolean, fade: number, cp: THREE.Vector3) {
    const d = _v.subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return;
    const y = d.multiplyScalar(1 / len);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const toCam = new THREE.Vector3().subVectors(cp, mid).normalize();
    const x = new THREE.Vector3().crossVectors(y, toCam).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const put = (mesh: THREE.InstancedMesh, i: number, width: number, c: THREE.Color) => {
      _m.makeBasis(x, y, z);
      _m.scale(_v2.set(width, len, 1));
      _m.setPosition(a);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, c);
    };
    if (ink && this.nInk < MAXB) put(this.ink, this.nInk++, w, new THREE.Color(0.01, 0.005, 0.01));
    if (this.nGlow < MAXB) put(this.glow, this.nGlow++, w * (ink ? 3.2 : 1.6), col.clone().multiplyScalar(fade * (ink ? 1.4 : 2.2)));
  }
}

// ------------------------------------------------------------------ craters
const MAXD = 60;
function craterTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = S / 2;
  const grd = g.createRadialGradient(c, c, 0, c, c, c);
  grd.addColorStop(0, 'rgba(20,18,18,0.95)');
  grd.addColorStop(0.35, 'rgba(40,36,34,0.85)');
  grd.addColorStop(0.62, 'rgba(70,64,60,0.55)');
  grd.addColorStop(1, 'rgba(70,64,60,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  // radial cracks in ink
  const r = mulberry32(7);
  g.strokeStyle = 'rgba(8,8,10,0.95)';
  for (let i = 0; i < 16; i++) {
    let a = (i / 16) * Math.PI * 2 + r() * 0.3;
    let x = c + Math.cos(a) * c * 0.2;
    let y = c + Math.sin(a) * c * 0.2;
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    g.moveTo(x, y);
    const len = c * (0.55 + r() * 0.4);
    for (let k = 0; k < 6; k++) {
      a += (r() - 0.5) * 0.6;
      x += (Math.cos(a) * len) / 6;
      y += (Math.sin(a) * len) / 6;
      g.lineTo(x, y);
      g.lineWidth *= 0.8;
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(10,10,12,0.9)';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(c, c, c * 0.36, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Craters {
  readonly mesh: THREE.InstancedMesh;
  private head = 0;
  private n = 0;
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshLambertMaterial({ map: craterTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAXD);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }
  add(p: THREE.Vector3, n: THREE.Vector3, size: number) {
    const i = this.head;
    this.head = (this.head + 1) % MAXD;
    this.n = Math.min(MAXD, this.n + 1);
    _q.setFromUnitVectors(Z, n);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * Math.PI * 2));
    _m.compose(_v.copy(p).addScaledVector(n, 0.02), _q, _v2.set(size, size, size));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.n = this.head = 0;
    this.mesh.count = 0;
  }
}

/** Every effect in the fight, behind one facade. */
export class SFX {
  readonly dust: ParticleSystem;
  readonly smoke: ParticleSystem;
  readonly sparks: ParticleSystem;
  readonly fire: ParticleSystem;
  readonly energy: ParticleSystem;
  readonly ink: ParticleSystem;
  readonly blood: ParticleSystem;
  readonly chips: ParticleSystem;
  readonly rocks: DebrisSystem;
  readonly streaks: Streaks;
  readonly pulses: Pulses;
  readonly arcs: Arcs;
  readonly bolts: Bolts;
  readonly slashes: Slashes;
  readonly cuts: GroundCuts;
  readonly craters: Craters;
  readonly lights: LightPool;
  readonly glowTex = makeGlowTexture();
  private time = 0;

  constructor(readonly scene: THREE.Scene) {
    const puff = makePuffTexture();
    this.dust = new ParticleSystem({ max: 3000, lit: true, texture: puff, renderOrder: 12, nearFade: [0.8, 4.5] });
    this.smoke = new ParticleSystem({ max: 2000, lit: true, texture: puff, renderOrder: 13, nearFade: [1, 5] });
    this.sparks = new ParticleSystem({ max: 3000, blending: 'additive', stretch: 0.025, renderOrder: 15 });
    this.fire = new ParticleSystem({ max: 4000, blending: 'additive', texture: this.glowTex, renderOrder: 16, nearFade: [0.6, 3] });
    this.energy = new ParticleSystem({ max: 3000, blending: 'additive', texture: this.glowTex, renderOrder: 17, fog: false });
    this.ink = new ParticleSystem({ max: 1500, texture: puff, renderOrder: 18, fog: false });
    this.blood = new ParticleSystem({ max: 2000, lit: true, stretch: 0.012, ground: true, alphaTest: 0.5, depthWrite: true, renderOrder: 5 });
    this.chips = new ParticleSystem({ max: 3000, lit: true, ground: true, alphaTest: 0.5, depthWrite: true, renderOrder: 6 });
    for (const p of [this.dust, this.smoke, this.sparks, this.fire, this.energy, this.ink, this.blood, this.chips]) scene.add(p.mesh);
    const rockMat = new THREE.MeshToonMaterial({ color: 0xffffff });
    this.rocks = new DebrisSystem({ geo: new THREE.DodecahedronGeometry(0.5, 0), max: 900, bounce: 0.25, friction: 0.55, castShadow: true }, rockMat);
    scene.add(this.rocks.mesh);
    this.streaks = new Streaks(scene, () => SD.camera, 1);
    this.pulses = new Pulses(scene);
    this.arcs = new Arcs(scene);
    this.bolts = new Bolts(scene);
    this.slashes = new Slashes(scene, () => SD.camera);
    this.cuts = new GroundCuts(scene);
    this.craters = new Craters(scene);
    this.lights = new LightPool(scene, 5);
  }

  setAmbient(c: THREE.Color) {
    for (const p of [this.dust, this.smoke, this.blood, this.chips]) p.ambient.copy(c);
  }

  // ---------------------------------------------------------------- building blocks
  /** Billowing dust ring at the ground (landings, shockwaves). */
  dustRing(x: number, y: number, z: number, r: number, n: number, speed = 6, col = [0.62, 0.6, 0.56]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const s = speed * rnd(0.6, 1.2);
      const sz = rnd(0.8, 1.8) * (0.5 + r * 0.15);
      this.dust.emit(x + Math.cos(a) * r * 0.3, y + 0.3, z + Math.sin(a) * r * 0.3, Math.cos(a) * s, rnd(0.3, 1.6), Math.sin(a) * s, rnd(0.9, 1.8), sz, sz * 2.6, col[0], col[1], col[2], 0.75, col[0], col[1], col[2], 0, 2.2, -0.05, rnd(0, 6), rnd(-0.6, 0.6));
    }
  }

  /** Concrete thrown up: chunks with weight, grit and dust. */
  debris(p: THREE.Vector3, n: THREE.Vector3, power: number, color = 0x8f8a84) {
    const c = new THREE.Color(color);
    const k = Math.min(1, power);
    for (let i = 0; i < 10 + 26 * k; i++) {
      const d = _v.set(n.x + rnd(-0.9, 0.9), n.y + rnd(-0.3, 0.9), n.z + rnd(-0.9, 0.9)).normalize();
      const s = rnd(3, 11) * (0.6 + power);
      const sz = rnd(0.05, 0.22) * (0.8 + k);
      this.rocks.spawn(p.x, p.y, p.z, d.x * s, d.y * s + 2, d.z * s, sz, sz * rnd(0.6, 1), sz, c.clone().multiplyScalar(rnd(0.7, 1.1)), SD.city ? SD.city.groundY(p.x, p.z) : 0);
    }
    for (let i = 0; i < 40 * k + 10; i++) {
      const d = _v.set(n.x + rnd(-1, 1), n.y + rnd(-0.2, 1), n.z + rnd(-1, 1)).normalize();
      const s = rnd(4, 16) * (0.5 + power);
      const sh = rnd(0.35, 0.6);
      this.chips.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.8, 1.6), 0.05, 0.04, sh, sh * 0.95, sh * 0.9, 1, sh, sh, sh, 1, 0.4, 1.0);
    }
    for (let i = 0; i < 14 * k + 6; i++) {
      const d = _v.set(n.x + rnd(-0.8, 0.8), n.y + rnd(-0.2, 0.8), n.z + rnd(-0.8, 0.8)).normalize();
      const s = rnd(2, 7);
      const sz = rnd(0.8, 2) * (0.6 + k);
      this.dust.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(1.4, 2.8), sz, sz * 3, 0.66, 0.63, 0.58, 0.85, 0.6, 0.58, 0.55, 0, 1.6, -0.03, rnd(0, 6), rnd(-0.5, 0.5));
    }
  }

  /** Bright contact spark burst. */
  burst(p: THREE.Vector3, dir: THREE.Vector3, n: number, r: number, g: number, b: number, speed = 14) {
    for (let i = 0; i < n; i++) {
      const d = _v.set(dir.x + rnd(-0.8, 0.8), dir.y + rnd(-0.8, 0.8), dir.z + rnd(-0.8, 0.8)).normalize();
      const s = speed * rnd(0.4, 1.2);
      this.sparks.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.12, 0.35), 0.035, 0.01, r, g, b, 1, r * 0.6, g * 0.3, b * 0.2, 1, 2.5, 0.6);
    }
  }

  /** Expanding shock shell, skipped when it would swallow the camera (a full-screen wash). */
  shell(p: THREE.Vector3, r0: number, r1: number, dur: number, color: THREE.ColorRepresentation, intensity: number) {
    const d = SD.camera.position.distanceTo(p);
    if (d < r1 * 1.05) {
      // seen from inside: just a quick screen flash instead
      SD.renderer.post.flash = Math.max(SD.renderer.post.flash, Math.min(0.25, intensity * 0.05));
      return;
    }
    this.pulses.shell(p.x, p.y, p.z, r0, r1, dur, color, intensity);
  }

  /** A punch landing: shock ring, sparks, a puff of dust and a light. */
  impact(p: THREE.Vector3, dir: THREE.Vector3, power: number, color: THREE.ColorRepresentation = 0xfff2d8) {
    const c = new THREE.Color(color);
    this.burst(p, dir, 10 + 30 * power, c.r * 3, c.g * 3, c.b * 3, 10 + 12 * power);
    this.shell(p, 0.2, 1.4 + 3 * power, 0.25, color, 1.2 + power);
    // a puff of air off the contact, kept small and thrown away from the camera
    const away = _v2.subVectors(p, SD.camera.position).normalize();
    const camD = p.distanceTo(SD.camera.position);
    const n = camD < 4 ? 3 : 6 + 10 * power;
    for (let i = 0; i < n; i++) {
      const d = _v.set(away.x + rnd(-0.7, 0.7), away.y + rnd(-0.5, 0.7), away.z + rnd(-0.7, 0.7)).normalize();
      const s = rnd(2, 6) * (0.6 + power);
      const sz = rnd(0.15, 0.35) * (0.6 + power) * Math.min(1, camD / 5);
      this.dust.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.25, 0.5), sz, sz * 2.2, 0.9, 0.9, 0.92, 0.45, 0.8, 0.8, 0.8, 0, 3, 0, rnd(0, 6), rnd(-1, 1));
    }
    this.lights.flash(p.x, p.y, p.z, c.getHex(), 6 + power * 20, 10 + power * 10, 0.15 + power * 0.1);
  }

  /** 黒閃: black lightning crawling out of the contact, red glare, ink spray. */
  blackFlash(p: THREE.Vector3, dir: THREE.Vector3) {
    const red = new THREE.Color(1.0, 0.05, 0.08);
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Vector3(dir.x + rnd(-1.2, 1.2), dir.y + rnd(-1, 1), dir.z + rnd(-1.2, 1.2)).normalize();
      const len = rnd(1.2, 4.2);
      this.bolts.bolt(p, p.clone().addScaledVector(d, len), rnd(0.05, 0.12), red, true, rnd(0.2, 0.42), len * 0.35, 8);
    }
    for (let i = 0; i < 5; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize();
      this.bolts.bolt(p, p.clone().addScaledVector(d, rnd(4, 8)), rnd(0.1, 0.2), red, true, rnd(0.3, 0.55), 1.4, 10);
    }
    for (let i = 0; i < 60; i++) {
      const d = _v.set(dir.x + rnd(-1, 1), dir.y + rnd(-1, 1), dir.z + rnd(-1, 1)).normalize();
      const s = rnd(4, 20);
      const sz = rnd(0.08, 0.3);
      this.ink.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.25, 0.6), sz, sz * 0.2, 0.01, 0.0, 0.01, 1, 0.02, 0, 0, 0, 3, 0.2);
    }
    for (let i = 0; i < 40; i++) {
      const d = _v.set(dir.x + rnd(-1, 1), dir.y + rnd(-1, 1), dir.z + rnd(-1, 1)).normalize();
      const s = rnd(6, 26);
      this.energy.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.15, 0.4), rnd(0.1, 0.25), 0.02, 2.4, 0.08, 0.12, 1, 0.6, 0, 0, 0, 4, 0);
    }
    this.shell(p, 0.3, 6, 0.35, 0xff1020, 3);
    this.lights.flash(p.x, p.y, p.z, 0xff1a20, 60, 30, 0.5, 0.4);
  }

  /** Crater in the street or a wall: decal, chunks, dust ring. */
  crater(p: THREE.Vector3, n: THREE.Vector3, size: number) {
    this.craters.add(p, n, size);
    this.debris(p, n, Math.min(1.4, size / 4));
    if (n.y > 0.6) this.dustRing(p.x, p.y, p.z, size, Math.round(10 + size * 3), 3 + size * 1.5);
    this.pulses.ring(p.x, p.z, 0.5, size * 2.2, 0.5, 0xfff0d8, 1.2);
  }

  /** Big fiery blast (Fuga, Red detonations get their own colour). */
  explosion(p: THREE.Vector3, r: number, col = new THREE.Color(1.6, 0.55, 0.12)) {
    for (let i = 0; i < 120 * Math.min(2, r / 6); i++) {
      const d = _v.set(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize();
      const s = rnd(4, 16) * (r / 8);
      const sz = rnd(0.8, 2.4) * (r / 8);
      this.fire.emit(p.x, p.y, p.z, d.x * s, d.y * s, d.z * s, rnd(0.4, 1.1), sz, sz * 1.8, col.r * 1.6, col.g * 1.6, col.b * 1.6, 1, col.r * 0.4, col.g * 0.1, 0, 0, 2.2, -0.3);
    }
    for (let i = 0; i < 40 * Math.min(2, r / 6); i++) {
      const d = _v.set(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize();
      const s = rnd(2, 8) * (r / 8);
      const sz = rnd(1.5, 3.5) * (r / 8);
      this.smoke.emit(p.x, p.y, p.z, d.x * s, d.y * s + 2, d.z * s, rnd(2, 4), sz, sz * 2.5, 0.16, 0.14, 0.13, 0.85, 0.3, 0.29, 0.28, 0, 1.1, -0.08, rnd(0, 6), rnd(-0.4, 0.4));
    }
    this.shell(p, 0.5, r * 1.3, 0.45, col.getHex(), 3);
    this.pulses.ring(p.x, p.z, 1, r * 2, 0.6, 0xffd0a0, 2);
    this.lights.flash(p.x, p.y + 1, p.z, col.getHex(), 80, r * 4, 0.8, 0.3);
  }

  clear() {
    for (const p of [this.dust, this.smoke, this.sparks, this.fire, this.energy, this.ink, this.blood, this.chips]) p.clear();
    this.rocks.clear();
    this.streaks.clear();
    this.pulses.clear();
    this.slashes.clear();
    this.cuts.clear();
    this.craters.clear();
  }

  update(dt: number) {
    this.time += dt;
    for (const p of [this.dust, this.smoke, this.sparks, this.fire, this.energy, this.ink, this.blood, this.chips]) p.update(this.time);
    this.rocks.update(dt);
    this.streaks.update(dt);
    this.pulses.update(dt, this.time);
    this.bolts.update(dt, SD.camera);
    this.slashes.update(dt);
    this.cuts.update(dt);
    this.lights.update(dt);
  }
}
