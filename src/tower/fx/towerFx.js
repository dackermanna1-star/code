// LAST LOOKOUT — combat effects in the retro style: chunky dithered pixel particles (two draw
// calls: normal and additive), tracers (one line-segments draw call), ground shockwave rings,
// instanced brass casings and a small pool of flash lights (constant light count, so no shader
// recompiles). Fixed capacities everywhere, nothing allocated per frame.
//
//   const fx = new TowerFx(scene, { onCasing: (pos) => audio.casing(pos) });
//   fx.update(dt, camera);                       // every frame
//   fx.explosion(pos, power); fx.fire(pos, radius, dur); fx.gasCloud(pos, radius, dur);
//   fx.muzzle(pos, dir, { suppressed, brake }); fx.tracer(from, to);
//   fx.impact(pos, normal, material); fx.bloodMist(pos, dir, amount); fx.dust(pos); fx.shellCasing(pos, dir);

import * as THREE from 'three';
import { PixelParticles, RAMP_INDEX as R, FLOOR, STICK, GROW_EASE } from './particles.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

const MAX_EMITTERS = 12;
const MAX_TRACERS = 32;
const MAX_CASINGS = 16;
const MAX_RINGS = 4;

/** Random unit vector into `out`, biased toward `dir` by `bias` (0 uniform .. 1 exactly dir). */
function spray(out, dx, dy, dz, spread) {
  const x = dx + (Math.random() * 2 - 1) * spread;
  const y = dy + (Math.random() * 2 - 1) * spread;
  const z = dz + (Math.random() * 2 - 1) * spread;
  const l = Math.hypot(x, y, z) || 1;
  out.x = x / l;
  out.y = y / l;
  out.z = z / l;
  return out;
}

export class TowerFx {
  /**
   * opts.onCasing(pos)  called when a casing first lands (hook for the tink sound)
   * opts.casingDrop     how far below its ejection point a casing lands (default 1.25 m: the cabin floor)
   * opts.lights         flash lights in the pool (default 1; 0 disables)
   * opts.maxParticles   per system (default 4096)
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    const max = opts.maxParticles || 4096;
    this.soft = new PixelParticles(scene, { max, additive: false, minPx: 2 });
    this.glow = new PixelParticles(scene, { max: Math.round(max * 0.75), additive: true, minPx: 1.5 });
    this.emitters = [];
    for (let i = 0; i < MAX_EMITTERS; i++) this.emitters.push({ on: false, kind: '', x: 0, y: 0, z: 0, r: 1, t: 0, dur: 0, acc: 0, acc2: 0, acc3: 0 });
    // tracers
    const tg = (this.tracerGeo = new THREE.BufferGeometry());
    this.tPos = new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3);
    this.tCol = new THREE.BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3);
    this.tPos.setUsage(THREE.DynamicDrawUsage);
    this.tCol.setUsage(THREE.DynamicDrawUsage);
    this.tAttrs = [this.tPos, this.tCol];
    tg.setAttribute('position', this.tPos);
    tg.setAttribute('color', this.tCol);
    tg.setDrawRange(0, 0);
    this.tracerMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.tracerLines = new THREE.LineSegments(tg, this.tracerMat);
    this.tracerLines.frustumCulled = false;
    this.tracerLines.renderOrder = 7;
    scene.add(this.tracerLines);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) this.tracers.push({ on: false, a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, life: 0.4 });
    // shockwave rings
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const m = new THREE.Mesh(ringGeo, mat);
      m.visible = false;
      m.renderOrder = 5;
      scene.add(m);
      this.rings.push({ m, t: 0, life: 0.4, r: 8 });
    }
    // casings
    const cg = new THREE.CylinderGeometry(0.0055, 0.0055, 0.048, 6, 1);
    cg.rotateZ(Math.PI / 2);
    this.casingMat = new THREE.MeshLambertMaterial({ color: 0xc89b3c, emissive: 0x3a2808 });
    this.casingMesh = new THREE.InstancedMesh(cg, this.casingMat, MAX_CASINGS);
    this.casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    scene.add(this.casingMesh);
    this.casings = [];
    for (let i = 0; i < MAX_CASINGS; i++) {
      this.casings.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, floor: 0, landed: false, rest: false });
    }
    // flash lights
    this.lights = [];
    const nl = opts.lights ?? 1;
    for (let i = 0; i < nl; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 60, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, t: 0, life: 0, peak: 0 });
    }
    this._casePos = new THREE.Vector3();
  }

  // -------------------------------------------------------------------------------------------

  update(dt, camera) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const fog = this.scene.fog || null;
    this._emitters(dt);
    this.soft.update(dt, fog);
    this.glow.update(dt, fog);
    this._tracers(dt);
    this._rings(dt);
    this._casings(dt);
    for (const L of this.lights) {
      if (L.t >= L.life) continue;
      L.t += dt;
      const k = Math.max(0, 1 - L.t / L.life);
      L.l.intensity = L.peak * k * k;
      if (L.t >= L.life) L.l.intensity = 0;
    }
    void camera;
  }

  /** Total live particles (both systems). */
  get count() {
    return this.soft.n + this.glow.n;
  }

  // -------------------------------------------------------------------------------------------
  // Effects

  /** A blast at pos (power ~1): flash, fireball, smoke column, sparks, debris, ground ring, light. */
  explosion(pos, power = 1) {
    const P = Math.max(0.3, Math.min(3, power || 1));
    const x = pos.x, y = Math.max(0.2, pos.y), z = pos.z;
    const S = this.soft, G = this.glow;
    G.spawn(x, y + 0.6, z, 0, 0, 0, 0.14, 5 * P, 7 * P, R.flash);
    // fireball: fast, then hanging and rising
    const nf = Math.round(34 * P);
    for (let i = 0; i < nf; i++) {
      spray(_v, 0, 0.55, 0, 1);
      const sp = rnd(3, 10) * P;
      G.spawn(x + _v.x * 0.6 * P, y + 0.4 + Math.abs(_v.y) * 0.5, z + _v.z * 0.6 * P, _v.x * sp, Math.abs(_v.y) * sp + 2, _v.z * sp,
        rnd(0.45, 0.95), rnd(1, 1.6) * P, rnd(2.2, 3.2) * P, R.fire, 3.2, -2.5, 0, -rnd(0, 0.06));
    }
    // smoke column, born a little after the fireball
    const ns = Math.round(26 * P);
    for (let i = 0; i < ns; i++) {
      spray(_v, 0, 1, 0, 0.6);
      S.spawn(x + _v.x * P, y + rnd(0.5, 2) * P, z + _v.z * P, _v.x * 2, rnd(2.2, 4.5) * P, _v.z * 2,
        rnd(4, 8), rnd(1.4, 2.2) * P, rnd(4.5, 7) * P, R.smoke, 0.55, -0.35, GROW_EASE, -rnd(0.08, 0.5));
    }
    // sparks
    const nk = Math.round(38 * P);
    for (let i = 0; i < nk; i++) {
      spray(_v, 0, 0.7, 0, 1);
      const sp = rnd(8, 24);
      G.spawn(x, y + 0.5, z, _v.x * sp, Math.abs(_v.y) * sp, _v.z * sp, rnd(0.5, 1.4), rnd(0.07, 0.13), 0.04, R.spark, 0.25, 9.8, FLOOR);
    }
    // debris: dirt clods and splinters thrown out on arcs, settling on the ground
    const nd = Math.round(26 * P);
    for (let i = 0; i < nd; i++) {
      spray(_v, 0, 1, 0, 0.9);
      const sp = rnd(5, 16) * Math.sqrt(P);
      S.spawn(x, y + 0.3, z, _v.x * sp, Math.abs(_v.y) * sp + 2, _v.z * sp, rnd(2.2, 3.6), rnd(0.12, 0.32), rnd(0.12, 0.3),
        Math.random() < 0.7 ? R.dirt : R.wood, 0.08, 9.8, FLOOR | STICK);
    }
    // dust ring rolling out along the ground
    const nr = Math.round(30 * P);
    for (let i = 0; i < nr; i++) {
      const a = (i / nr) * Math.PI * 2 + rnd(-0.1, 0.1);
      const sp = rnd(9, 15) * Math.sqrt(P);
      S.spawn(x + Math.cos(a) * 0.8, 0.35, z + Math.sin(a) * 0.8, Math.cos(a) * sp, rnd(0.2, 0.8), Math.sin(a) * sp,
        rnd(1.2, 2.2), rnd(0.8, 1.2) * P, rnd(2.2, 3.4) * P, R.dust, 2.6, 0.15, GROW_EASE);
    }
    this._ring(x, z, 9 * P, 0.38);
    this._light(x, y + 1.5, z, 0xffa850, 900 * P, 0.32, 70 * P);
  }

  /** A burning patch: flames, smoke and embers for `dur` seconds. */
  fire(pos, radius = 2, dur = 10) {
    this._emitter('fire', pos, radius, dur);
  }

  /** A sickly green cloud rolling over the ground for `dur` seconds. */
  gasCloud(pos, radius = 5, dur = 9) {
    this._emitter('gas', pos, radius, dur);
  }

  /** Muzzle flash at the muzzle (world space), pointing along dir; then a drift of smoke. */
  muzzle(pos, dir, opts = {}) {
    const G = this.glow, S = this.soft;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    const x = pos.x, y = pos.y, z = pos.z;
    if (!opts.suppressed) {
      G.spawn(x + dx * 0.05, y + dy * 0.05, z + dz * 0.05, 0, 0, 0, 0.055, 0.22, 0.32, R.flash);
      for (let i = 1; i <= 3; i++) {
        const d = i * 0.13;
        G.spawn(x + dx * d, y + dy * d, z + dz * d, dx * 2, dy * 2, dz * 2, 0.045, 0.2 - i * 0.04, 0.08, R.flash);
      }
      if (opts.brake) {
        // muzzle brake: flames thrown out sideways
        _v.set(dx, dy, dz).cross(_up).normalize();
        for (const s of [-1, 1]) G.spawn(x + _v.x * s * 0.08, y, z + _v.z * s * 0.08, _v.x * s * 6, 0.5, _v.z * s * 6, 0.07, 0.16, 0.24, R.flash, 6);
      }
      this._light(x, y, z, 0xffc070, 60, 0.06, 12);
    }
    const ns = opts.suppressed ? 3 : 7;
    for (let i = 0; i < ns; i++) {
      spray(_v, dx, dy + 0.15, dz, 0.35);
      const sp = rnd(0.6, 2.2);
      S.spawn(x + dx * 0.1, y + dy * 0.1, z + dz * 0.1, _v.x * sp, _v.y * sp + 0.2, _v.z * sp, rnd(1.4, 2.6), rnd(0.05, 0.09), rnd(0.35, 0.6), R.smokeLight, 1.8, -0.12, GROW_EASE);
    }
  }

  /** A tracer streak from the muzzle to the impact, shooting out and fading in ~0.35 s. */
  tracer(from, to) {
    let T = null;
    for (const t of this.tracers) {
      if (!t.on) {
        T = t;
        break;
      }
    }
    if (!T) {
      T = this.tracers[0];
      for (const t of this.tracers) if (t.t > T.t) T = t;
    }
    T.on = true;
    T.a.copy(from);
    T.b.copy(to);
    T.t = 0;
    T.life = 0.38;
  }

  /** A bullet striking a surface: 'dirt' | 'wood' | 'metal' | 'concrete' | 'flesh' | 'water'. */
  impact(pos, normal, material = 'dirt') {
    const S = this.soft, G = this.glow;
    const x = pos.x, y = pos.y, z = pos.z;
    const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
    const m = material === 'ground' || material === 'grass' ? 'dirt' : material === 'stone' || material === 'brick' ? 'concrete' : material;
    if (m === 'metal') {
      G.spawn(x, y, z, 0, 0, 0, 0.05, 0.25, 0.1, R.flash);
      for (let i = 0; i < 16; i++) {
        spray(_v, nx, ny, nz, 0.9);
        const sp = rnd(5, 15);
        G.spawn(x, y, z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.2, 0.55), rnd(0.03, 0.06), 0.02, R.spark, 0.4, 9.8, FLOOR);
      }
      for (let i = 0; i < 3; i++) S.spawn(x, y, z, nx * 0.5, ny * 0.5 + 0.3, nz * 0.5, rnd(0.6, 1), 0.1, 0.4, R.smokeLight, 2, -0.2, GROW_EASE);
      return;
    }
    if (m === 'flesh') {
      for (let i = 0; i < 9; i++) {
        spray(_v, nx, ny, nz, 0.7);
        const sp = rnd(1.5, 5);
        S.spawn(x, y, z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.5, 1), rnd(0.06, 0.12), 0.05, R.blood, 0.6, 9.8, FLOOR | STICK);
      }
      for (let i = 0; i < 4; i++) {
        spray(_v, nx, ny, nz, 0.5);
        S.spawn(x, y, z, _v.x * 1.2, _v.y * 1.2, _v.z * 1.2, rnd(0.5, 0.8), 0.15, 0.4, R.bloodMist, 3, 0.8, GROW_EASE);
      }
      return;
    }
    if (m === 'water') {
      for (let i = 0; i < 14; i++) {
        spray(_v, 0, 1, 0, 0.35);
        const sp = rnd(2, 6);
        S.spawn(x, y + 0.05, z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.5, 0.9), rnd(0.05, 0.1), 0.04, R.water, 0.3, 9.8);
      }
      S.spawn(x, y + 0.1, z, 0, 0.3, 0, 0.8, 0.3, 0.9, R.steam, 2, 0, GROW_EASE);
      return;
    }
    // dirt, wood, concrete: a dust puff and thrown fragments
    const puff = m === 'concrete' ? R.concrete : R.dust;
    const chip = m === 'wood' ? R.wood : m === 'concrete' ? R.concrete : R.dirt;
    for (let i = 0; i < 9; i++) {
      spray(_v, nx, ny, nz, 0.6);
      const sp = rnd(0.6, 2.4);
      S.spawn(x, y, z, _v.x * sp, _v.y * sp + 0.3, _v.z * sp, rnd(0.7, 1.4), rnd(0.15, 0.3), rnd(0.6, 1.1), m === 'concrete' ? R.smokeLight : puff, 2.6, -0.1, GROW_EASE);
    }
    for (let i = 0; i < 8; i++) {
      spray(_v, nx, ny + 0.4, nz, 0.7);
      const sp = rnd(2, 6);
      S.spawn(x, y, z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.9, 1.6), rnd(0.04, 0.09), rnd(0.04, 0.09), chip, 0.15, 9.8, FLOOR | STICK);
    }
  }

  /**
   * Chunky blood mist from a wound at pos spraying along dir (the exit direction); amount ~0..2.
   * Sized to stay visible through a scope at long range.
   */
  bloodMist(pos, dir, amount = 1) {
    const S = this.soft;
    const A = Math.max(0.2, Math.min(3, amount || 1));
    const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 1;
    const nm = Math.round(10 + 18 * A);
    for (let i = 0; i < nm; i++) {
      spray(_v, dx, dy + 0.1, dz, 0.55);
      const sp = rnd(1, 4.5) * Math.sqrt(A);
      S.spawn(pos.x, pos.y, pos.z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.7, 1.5), rnd(0.12, 0.22), rnd(0.45, 0.85) * Math.sqrt(A), R.bloodMist, 3.2, 1.2, GROW_EASE);
    }
    const nd = Math.round(8 + 14 * A);
    for (let i = 0; i < nd; i++) {
      spray(_v, dx, dy + 0.2, dz, 0.4);
      const sp = rnd(3, 9);
      S.spawn(pos.x, pos.y, pos.z, _v.x * sp, _v.y * sp, _v.z * sp, rnd(0.6, 1.2), rnd(0.05, 0.1), 0.06, R.blood, 0.35, 9.8, FLOOR | STICK);
    }
  }

  /** A dust puff (a body hitting the ground, a near miss). */
  dust(pos) {
    const S = this.soft;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(0.4, 1.6);
      S.spawn(pos.x + Math.cos(a) * 0.3, Math.max(0.1, pos.y), pos.z + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(0.2, 0.7), Math.sin(a) * sp,
        rnd(1.4, 2.4), rnd(0.35, 0.55), rnd(1.1, 1.7), R.dust, 1.4, -0.05, GROW_EASE);
    }
  }

  /** A spent case thrown out of the action along dir (world space), tumbling, landing with a tink. */
  shellCasing(pos, dir) {
    let C = null;
    for (const c of this.casings) {
      if (!c.on) {
        C = c;
        break;
      }
    }
    if (!C) {
      C = this.casings[0];
      for (const c of this.casings) if (c.t > C.t) C = c;
    }
    C.on = true;
    C.t = 0;
    C.landed = false;
    C.rest = false;
    C.p.copy(pos);
    C.v.set(dir.x * rnd(1.8, 2.8), dir.y * 2 + rnd(1.4, 2.2), dir.z * rnd(1.8, 2.8));
    C.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    C.w.set(rnd(-25, 25), rnd(-25, 25), rnd(-25, 25));
    C.floor = pos.y - (this.opts.casingDrop ?? 1.25);
  }

  /** Removes everything (e.g. between runs). */
  clear() {
    this.soft.clear();
    this.glow.clear();
    for (const e of this.emitters) e.on = false;
    for (const t of this.tracers) t.on = false;
    for (const c of this.casings) c.on = false;
    for (const r of this.rings) r.m.visible = false;
    for (const L of this.lights) {
      L.t = L.life;
      L.l.intensity = 0;
    }
  }

  dispose() {
    this.clear();
    this.soft.dispose();
    this.glow.dispose();
    this.scene.remove(this.tracerLines, this.casingMesh);
    this.tracerGeo.dispose();
    this.tracerMat.dispose();
    for (const r of this.rings) {
      this.scene.remove(r.m);
      r.m.material.dispose();
    }
    for (const L of this.lights) this.scene.remove(L.l);
  }

  // -------------------------------------------------------------------------------------------
  // internals

  _emitter(kind, pos, radius, dur) {
    let E = this.emitters.find((e) => !e.on);
    if (!E) {
      E = this.emitters[0];
      for (const e of this.emitters) if (e.dur - e.t < E.dur - E.t) E = e;
    }
    E.on = true;
    E.kind = kind;
    E.x = pos.x;
    E.y = pos.y || 0;
    E.z = pos.z;
    E.r = Math.max(0.3, radius || 1);
    E.t = 0;
    E.dur = Math.max(0.5, dur || 5);
    E.acc = E.acc2 = E.acc3 = 0;
  }

  _emitters(dt) {
    const S = this.soft, G = this.glow;
    for (const E of this.emitters) {
      if (!E.on) continue;
      E.t += dt;
      if (E.t >= E.dur) {
        E.on = false;
        continue;
      }
      // intensity: quick rise, full, fade over the last 2 s
      const k = Math.min(1, E.t / 0.6) * Math.min(1, (E.dur - E.t) / 2);
      const area = E.r * E.r;
      if (E.kind === 'fire') {
        E.acc += dt * (14 + 16 * area) * k;
        E.acc2 += dt * (2.5 + 1.5 * area) * k;
        E.acc3 += dt * 4 * k;
        while (E.acc >= 1) {
          E.acc--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * E.r;
          G.spawn(E.x + Math.cos(a) * rr, E.y + 0.1, E.z + Math.sin(a) * rr, rnd(-0.3, 0.3), rnd(1, 2.6), rnd(-0.3, 0.3),
            rnd(0.45, 1), rnd(0.45, 0.75) * (0.6 + 0.4 * k), rnd(0.12, 0.25), R.fire, 0.6, -1.4);
        }
        while (E.acc2 >= 1) {
          E.acc2--;
          const a = Math.random() * Math.PI * 2, rr = Math.random() * E.r * 0.7;
          S.spawn(E.x + Math.cos(a) * rr, E.y + 1, E.z + Math.sin(a) * rr, rnd(-0.2, 0.2), rnd(1.2, 2.2), rnd(-0.2, 0.2),
            rnd(3, 5), rnd(0.6, 0.9), rnd(2.4, 3.6), R.smoke, 0.25, -0.15, GROW_EASE);
        }
        while (E.acc3 >= 1) {
          E.acc3--;
          G.spawn(E.x + rnd(-E.r, E.r) * 0.6, E.y + 0.4, E.z + rnd(-E.r, E.r) * 0.6, rnd(-0.6, 0.6), rnd(2, 4), rnd(-0.6, 0.6), rnd(1.2, 2.4), 0.06, 0.03, R.ember, 0.4, -0.3);
        }
      } else {
        // gas: big slow billows rolling round the centre
        E.acc += dt * (3 + 0.45 * area) * k;
        while (E.acc >= 1) {
          E.acc--;
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * E.r * 0.8;
          const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
          // tangential roll plus a slow outward drift
          const sp = rnd(0.25, 0.6);
          S.spawn(E.x + px, E.y + rnd(0.4, 1.4), E.z + pz, -Math.sin(a) * sp + Math.cos(a) * 0.15, rnd(0.05, 0.25), Math.cos(a) * sp + Math.sin(a) * 0.15,
            rnd(3.5, 5.5), rnd(2.4, 3.4), rnd(5, 7.5) * Math.min(1.5, 0.6 + E.r * 0.12), R.gas, 0.15, -0.02, GROW_EASE);
        }
      }
    }
  }

  _tracers(dt) {
    const P = this.tPos.array, C = this.tCol.array;
    let n = 0;
    for (const T of this.tracers) {
      if (!T.on) continue;
      T.t += dt;
      if (T.t >= T.life) {
        T.on = false;
        continue;
      }
      // the head shoots out to the impact in ~0.07 s, the tail follows and the streak fades
      const head = Math.min(1, T.t / 0.07);
      const tail = Math.max(0, (T.t - 0.03) / (T.life - 0.03)) ** 0.7;
      const fade = 1 - T.t / T.life;
      const o = n * 6;
      for (let k = 0; k < 3; k++) {
        const ak = k === 0 ? 'x' : k === 1 ? 'y' : 'z';
        const a = T.a[ak], b = T.b[ak];
        P[o + k] = a + (b - a) * tail * head;
        P[o + 3 + k] = a + (b - a) * head;
      }
      C[o] = 0.25 * fade;
      C[o + 1] = 0.16 * fade;
      C[o + 2] = 0.05 * fade;
      C[o + 3] = 1.0 * fade;
      C[o + 4] = 0.86 * fade;
      C[o + 5] = 0.5 * fade;
      n++;
    }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerLines.visible = n > 0;
    if (n) {
      for (const at of this.tAttrs) {
        at.clearUpdateRanges();
        at.addUpdateRange(0, n * 6);
        at.needsUpdate = true;
      }
    }
  }

  _ring(x, z, r, life) {
    let R0 = this.rings[0];
    for (const r1 of this.rings) {
      if (!r1.m.visible) {
        R0 = r1;
        break;
      }
    }
    R0.m.visible = true;
    R0.m.position.set(x, 0.06, z);
    R0.t = 0;
    R0.life = life;
    R0.r = r;
  }

  _rings(dt) {
    for (const R1 of this.rings) {
      if (!R1.m.visible) continue;
      R1.t += dt;
      const u = R1.t / R1.life;
      if (u >= 1) {
        R1.m.visible = false;
        continue;
      }
      const s = 0.5 + R1.r * (1 - (1 - u) ** 2);
      R1.m.scale.set(s, 1, s);
      R1.m.material.opacity = 0.75 * (1 - u) ** 1.5;
    }
  }

  _casings(dt) {
    let n = 0;
    const mesh = this.casingMesh;
    for (const C of this.casings) {
      if (!C.on) continue;
      C.t += dt;
      if (C.t > 5) {
        C.on = false;
        continue;
      }
      if (!C.rest) {
        C.v.y -= 9.81 * dt;
        C.p.addScaledVector(C.v, dt);
        C.r.addScaledVector(C.w, dt);
        if (C.p.y < C.floor) {
          C.p.y = C.floor;
          if (!C.landed) {
            C.landed = true;
            if (this.opts.onCasing) {
              this._casePos.copy(C.p);
              try {
                this.opts.onCasing(this._casePos);
              } catch (e) {
                // the hook must not break the effects
              }
            }
          }
          C.v.y = Math.abs(C.v.y) * 0.32;
          C.v.x *= 0.5;
          C.v.z *= 0.5;
          C.w.multiplyScalar(0.45);
          if (C.v.y < 0.4) {
            C.rest = true;
            C.r.x = Math.round(C.r.x / Math.PI) * Math.PI;
          }
        }
      }
      _e.set(C.r.x, C.r.y, C.r.z);
      _q.setFromEuler(_e);
      _m.compose(C.p, _q, _s);
      mesh.setMatrixAt(n++, _m);
    }
    mesh.count = n;
    if (n) mesh.instanceMatrix.needsUpdate = true;
  }

  _light(x, y, z, color, peak, life, dist) {
    if (!this.lights.length) return;
    let L = this.lights[0];
    for (const l of this.lights) if (l.t >= l.life || l.peak * (1 - l.t / l.life) < L.peak * (1 - L.t / L.life)) L = l;
    L.l.position.set(x, y, z);
    L.l.color.setHex(color);
    L.l.distance = dist;
    L.peak = peak;
    L.t = 0;
    L.life = life;
    L.l.intensity = peak;
  }
}
