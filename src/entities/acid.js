// Spitter acid: lobbed globs (ballistic, glowing, dripping) that burst into
// spreading pools of glowing green acid. Pools conform to the ground they land
// on (heights sampled once over the full spread area), grow over ~1 s, fizz
// with particles and a sizzle loop, light the area green and deal damage that
// ramps up the longer a survivor stands in them. Owned by the game (g.acid) so
// pools outlive the Spitter that made them; updated by the Director.
import * as THREE from 'three';
import { FR } from '../render/particles.js';

const GRAV = 16;
const _v = new THREE.Vector3();
const R = Math.random;
const rs = (k) => (R() - 0.5) * 2 * k;

const VERT = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute float ok;
varying vec2 vP;
varying float vOk;
void main() {
  vP = position.xz;
  vOk = ok;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform float uR, uT, uFade, uSeed, uHeat;
varying vec2 vP;
varying float vOk;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  // lobed, noisy outline (splash tongues), grows with uR
  float lobes = 0.12 * sin(a * 3.0 + uSeed) + 0.08 * sin(a * 5.0 + uSeed * 2.3) + 0.1 * (vn(vec2(a * 2.2 + uSeed, uSeed)) - 0.5);
  float edge = uR * (0.86 + lobes);
  float m = (1.0 - smoothstep(edge * 0.82, edge, r)) * vOk;
  // satellite droplets around the main pool
  vec2 q = vP * 2.6 + uSeed;
  float drops = step(0.83, vn(q)) * (1.0 - smoothstep(uR * 1.05, uR * 1.3, r)) * step(edge, r);
  m = max(m, drops * vOk);
  if (m < 0.02) discard;
  float n1 = vn(vP * 2.5 + vec2(uT * 0.25, -uT * 0.18));
  float n2 = vn(vP * 6.0 - vec2(uT * 0.4, uT * 0.3));
  float bub = smoothstep(0.78, 0.92, vn(vP * 11.0 + vec2(uT * 0.9, uSeed)));
  float pulse = 0.85 + 0.15 * sin(uT * 4.0 + r * 5.0);
  vec3 deep = vec3(0.05, 0.28, 0.015);
  vec3 hot = vec3(0.42, 1.12, 0.1);
  vec3 c = mix(deep, hot, clamp(n1 * 0.7 + n2 * 0.5 - 0.1, 0.0, 1.0)) * pulse * (0.7 + 0.6 * uHeat);
  c += bub * vec3(0.9, 1.6, 0.4);
  // bright meniscus at the rim
  c += smoothstep(edge * 0.6, edge * 0.93, r) * vec3(0.35, 0.9, 0.08) * m;
  gl_FragColor = vec4(c, clamp(m * (0.72 + 0.2 * n2), 0.0, 1.0) * uFade);
  #include <fog_fragment>
}`;

export class AcidField {
  constructor(game) {
    this.game = game;
    this.pools = [];
    this.globs = [];
    this.lights = [];
    this.globGeo = new THREE.SphereGeometry(0.13, 10, 8);
    this.globMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.6, 0.15) });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.7, 0.05), transparent: true, opacity: 0.55, depthWrite: false });
  }
  get active() { return this.pools.length + this.globs.length; }
  clear() {
    for (const p of this.pools) this.disposePool(p);
    for (const b of this.globs) { b.mesh.parent?.remove(b.mesh); }
    this.pools = []; this.globs = [];
    for (const L of this.lights) L.on = false;
    this.lights = [];
  }

  // ------------------------------------------------------------ globs --
  spit(x, y, z, vx, vy, vz, owner) {
    const g = this.game;
    const mesh = new THREE.Mesh(this.globGeo, this.globMat);
    const shell = new THREE.Mesh(this.globGeo, this.coreMat);
    shell.scale.setScalar(1.8);
    mesh.add(shell);
    mesh.position.set(x, y, z);
    g.scene.add(mesh);
    this.globs.push({ x, y, z, vx, vy, vz, t: 0, owner, mesh });
  }
  updateGlobs(dt) {
    const g = this.game;
    const col = g.level.col;
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const b = this.globs[i];
      b.t += dt;
      b.vy -= GRAV * dt;
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1;
      const h = col.raycast(b.x, b.y, b.z, b.vx / sp, b.vy / sp, b.vz / sp, sp * dt + 0.15);
      // direct hit on a survivor splashes at their feet
      let hitS = null;
      for (const s of g.survivors) {
        if (s.dead) continue;
        if (Math.hypot(s.pos.x - b.x, s.pos.z - b.z) < 0.55 && b.y > s.pos.y && b.y < s.pos.y + 1.9) { hitS = s; break; }
      }
      if (h || hitS || b.t > 5 || b.y < -200) {
        let px = b.x, py = b.y, pz = b.z;
        if (h) { px = h.x + h.nx * 0.2; py = h.y + Math.max(0, h.ny) * 0.05; pz = h.z + h.nz * 0.2; }
        if (hitS) { px = hitS.pos.x; pz = hitS.pos.z; py = hitS.pos.y + 0.3; }
        this.burst(px, py, pz, b.owner);
        b.mesh.parent?.remove(b.mesh);
        this.globs.splice(i, 1);
        continue;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      const wob = 1 + Math.sin(b.t * 30) * 0.12;
      b.mesh.scale.set(wob, 2 - wob, wob);
      // glowing trail + dripping strands
      g.fx.add.spawn({ x: b.x, y: b.y, z: b.z, life: 0.35, size: 0.28, size1: 0.05, frame: FR.GLOW, color: [0.45, 1.3, 0.12], alpha: 0.7, alpha1: 0 });
      if (R() < 0.6) g.fx.alpha.spawn({ x: b.x + rs(0.05), y: b.y, z: b.z + rs(0.05), vx: b.vx * 0.1, vy: -0.5, vz: b.vz * 0.1, life: 0.6, size: 0.04, size1: 0.015, frame: FR.MIST, color: [0.3, 0.8, 0.08], alpha: 0.9, alpha1: 0.2, grav: 12, stretch: 0.02, lit: 0.3 });
    }
  }
  // Glob impact: splash, then a pool on the ground below the impact point.
  burst(x, y, z, owner) {
    const g = this.game;
    const gy = g.level.col.groundHeight(x, y + 0.4, z, 30, 0.2);
    const py = gy > -1e8 ? gy : y;
    g.audio.play('spitterSplat', { pos: _v.set(x, py, z), vol: 1.1 });
    for (let k = 0; k < 18; k++) {
      const a = R() * 6.28, s = 1.5 + R() * 3.5;
      g.fx.alpha.spawn({ x, y: py + 0.1, z, vx: Math.cos(a) * s, vy: 2 + R() * 3.5, vz: Math.sin(a) * s, life: 0.7 + R() * 0.4, size: 0.05, size1: 0.02, frame: FR.MIST, color: [0.35, 0.95, 0.1], alpha: 1, alpha1: 0.3, grav: 14, stretch: 0.025, lit: 0.2 });
    }
    g.fx.add.spawn({ x, y: py + 0.15, z, life: 0.3, size: 0.4, size1: 2.4, frame: FR.GLOW, color: [0.5, 1.4, 0.15], alpha: 0.8, alpha1: 0 });
    this.pool(x, py, z, { owner, rMax: 3.1, life: 7.2 });
    const near = g.survivors.find((s) => !s.dead && s.pos.distanceTo(_v.set(x, py, z)) < 7);
    if (near) g.voice?.say(near, 'spitterAcid', 2, { cooldown: 8 });
  }

  // ------------------------------------------------------------ pools --
  pool(x, y, z, o = {}) {
    const g = this.game;
    const rMax = o.rMax ?? 3;
    const N = o.small ? 10 : 18;
    const geo = new THREE.PlaneGeometry(rMax * 2.6, rMax * 2.6, N, N);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const ok = new Float32Array(pos.count);
    const col = g.level.col;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const gh = col.groundHeight(x + lx, y + 0.6, z + lz, 1.4, 0.2);
      const dy = gh > -1e8 ? gh - y : -9;
      ok[i] = Math.abs(dy) < 0.45 ? 1 : 0;
      pos.setY(i, (ok[i] ? dy : 0) + 0.03);
    }
    geo.setAttribute('ok', new THREE.BufferAttribute(ok, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uR: { value: 0.2 }, uT: { value: 0 }, uFade: { value: 1 }, uSeed: { value: R() * 50 }, uHeat: { value: 1 } }]),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    mesh.frustumCulled = true;
    g.scene.add(mesh);
    const p = { x, y, z, r: 0.2, rMax, t: 0, life: o.life ?? 7, grow: o.grow ?? 1.1, owner: o.owner || null, mesh, mat, geo, tick: 0, small: !!o.small, sizzle: null, light: null };
    p.sizzle = g.audio.loop?.('acidSizzle', { pos: _v.set(x, y, z), vol: o.small ? 0.5 : 0.9 }) || null;
    p.light = this.grabLight(x, y + 0.6, z, o.small ? 5 : 7);
    this.pools.push(p);
    // cap: oldest goes first
    if (this.pools.length > 6) { this.disposePool(this.pools[0]); this.pools.shift(); }
    return p;
  }
  grabLight(x, y, z, range) {
    const lv = this.game.level;
    if (!lv?.light) return null;
    let L = this.lights.find((l) => !l.on);
    if (!L) {
      if (this.lights.length >= 3) return null;
      L = lv.light(x, y, z, 0x5aff2a, 0, range, { dynamic: true, priority: 1, flicker: 0.15 });
      this.lights.push(L);
    }
    L.x = x; L.y = y; L.z = z; L.range = range; L.on = true; L.intensity = 0;
    return L;
  }
  disposePool(p) {
    p.mesh.parent?.remove(p.mesh);
    p.geo.dispose(); p.mat.dispose();
    if (p.sizzle) { p.sizzle.stop(0.4); p.sizzle = null; }
    if (p.light) { p.light.on = false; p.light = null; }
  }
  // Pool covering (x,z) (optionally grown by margin); null if none.
  at(x, y, z, margin = 0) {
    for (const p of this.pools) {
      if (p.t > p.life - 0.3) continue;
      if (Math.abs(y - p.y) > 1.3) continue;
      if (Math.hypot(x - p.x, z - p.z) < p.r * 0.92 + margin) return p;
    }
    return null;
  }
  update(dt) {
    if (!this.globs.length && !this.pools.length) return;
    const g = this.game;
    this.updateGlobs(dt);
    const client = g.net?.client;
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { this.disposePool(p); this.pools.splice(i, 1); continue; }
      p.r = p.rMax * Math.min(1, 0.25 + 0.75 * Math.pow(Math.min(1, p.t / p.grow), 0.6));
      const fade = Math.min(1, (p.life - p.t) / 1.4);
      const u = p.mat.uniforms;
      u.uR.value = p.r; u.uT.value = g.time; u.uFade.value = fade; u.uHeat.value = 0.6 + 0.4 * fade;
      if (p.light) p.light.intensity = (p.small ? 3 : 6) * fade * (0.85 + 0.15 * Math.sin(g.time * 7));
      // fizz: bubbles popping + drifting green vapour
      const n = (p.small ? 1 : 3) * (g.quality?.particles ?? 1) * fade;
      for (let q = 0; q < n; q++) {
        if (R() > 0.6) continue;
        const a = R() * 6.28, d = Math.sqrt(R()) * p.r * 0.85;
        const fx = p.x + Math.cos(a) * d, fz = p.z + Math.sin(a) * d;
        if (R() < 0.6) g.fx.add.spawn({ x: fx, y: p.y + 0.06, z: fz, vx: rs(0.3), vy: 0.4 + R() * 0.8, vz: rs(0.3), life: 0.4 + R() * 0.5, size: 0.03 + R() * 0.03, size1: 0.01, frame: FR.GLOW, color: [0.5, 1.5, 0.15], alpha: 0.9, alpha1: 0, grav: 1.5 });
        else g.fx.alpha.spawn({ x: fx, y: p.y + 0.15, z: fz, vx: rs(0.2), vy: 0.3 + R() * 0.3, vz: rs(0.2), life: 1.4 + R(), size: 0.3, size1: 1.1, frame: FR.SMOKE1 + ((R() * 3) | 0), color: [0.3, 0.55, 0.12], alpha: 0.22, alpha1: 0, fadeIn: 0.2, drag: 0.6, grav: -0.15, lit: 0.3, emit: 0.6 });
      }
      if (p.sizzle) p.sizzle.set?.({ pos: _v.set(p.x, p.y, p.z), vol: (p.small ? 0.5 : 0.9) * fade });
      // damage (ramps with time spent standing in it)
      p.tick -= dt;
      if (p.tick <= 0 && !client && p.t > 0.25) {
        p.tick = 0.25;
        for (const s of g.survivors) {
          if (s.dead) continue;
          const inside = Math.abs(s.pos.y - p.y) < 1.2 && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < p.r * 0.92;
          const st = s._acid || (s._acid = { t: 0, last: -9 });
          if (!inside) continue;
          if (g.time - st.last > 0.6) st.t = 0;
          st.last = g.time;
          st.t += 0.25;
          const dps = (2 + 12 * Math.min(1, st.t / 1.5)) * (g.difficulty?.siDmg ?? 1) * (p.small ? 0.6 : 1) * fade;
          const loud = st.t < 0.3 || ((st.t * 4) | 0) % 4 === 0;
          s.takeDamage(dps * 0.25, p.owner, 'acid', !loud);
          if (s.isHuman && g.renderer?.fx) {
            g.renderer.fx.flashColor?.value?.set(0.15, 0.5, 0.02);
            g.renderer.fx.flash.value = Math.min(0.45, g.renderer.fx.flash.value + 0.05);
          }
          if (st.t < 0.3) g.voice?.say(s, 'inAcid', 2, { cooldown: 7 });
          if (R() < 0.5) g.audio.play('acidBurn', { pos: s.pos, vol: 0.6, owner: s });
          g.fx.add.spawn({ x: s.pos.x + rs(0.2), y: s.pos.y + 0.1, z: s.pos.z + rs(0.2), vy: 1.2, life: 0.5, size: 0.08, size1: 0.02, frame: FR.GLOW, color: [0.5, 1.4, 0.12], alpha: 0.9, alpha1: 0 });
        }
      }
    }
  }
}

export function acidOf(game) {
  if (!game.acid) game.acid = new AcidField(game);
  return game.acid;
}
