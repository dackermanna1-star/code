// Visual effects: dust, smoke, sparks, loose chips/splinters, flashes, shock
// rings and camera shake. Everything here is cosmetic and lightweight — the
// pieces that matter physically are real rigid bodies in the simulation.
import * as THREE from 'three';
import { getTexture } from '../render/textures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();

// ---------------------------------------------------------------------------
// Camera-facing sprites (dust / smoke / glow)
// ---------------------------------------------------------------------------

class SpriteSystem {
  constructor(scene, max, texture, additive) {
    this.max = max;
    this.n = 0;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.rot = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('prot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 800 } },
      vertexShader: `
        attribute vec4 pcolor; attribute float psize; attribute float prot;
        uniform float scale; varying vec4 vColor; varying float vRot;
        void main(){
          vColor = pcolor; vRot = prot;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(psize * scale / max(-mv.z, 0.05), 1400.0);
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec4 vColor; varying float vRot;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          vec2 uv = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
          vec4 t = texture2D(map, clamp(uv, 0.0, 1.0));
          float a = t.a * vColor.a;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor.rgb * t.rgb, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    g.setDrawRange(0, 0);
    scene.add(this.points);
  }

  emit(p, v, life, s0, s1, color, alpha, drag = 1.5, grav = 0, spin = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.n < this.max) this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.drag[i] = drag; this.grav[i] = grav; this.spin[i] = spin;
    this.rot[i] = Math.random() * 6.28;
    _c.set(color);
    this.rgb[i * 3] = _c.r; this.rgb[i * 3 + 1] = _c.g; this.rgb[i * 3 + 2] = _c.b;
  }

  update(dt, viewScale) {
    this.mat.uniforms.scale.value = viewScale;
    const n = this.n;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      let l = this.life[i];
      if (l <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      l -= dt;
      this.life[i] = l;
      if (l <= 0) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      alive++;
      const k = 1 - l / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3;
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const sz = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - k) * (1 - k));
      if (this.pos[i3 + 1] < sz * 0.18) { this.pos[i3 + 1] = sz * 0.18; if (this.vel[i3 + 1] < 0) this.vel[i3 + 1] = 0; }
      this.size[i] = sz;
      this.rot[i] += this.spin[i] * dt;
      const fadeIn = Math.min(1, k * 12);
      const a = this.a0[i] * fadeIn * (1 - k) * (1 - k * 0.4);
      this.col[i * 4] = this.rgb[i3]; this.col[i * 4 + 1] = this.rgb[i3 + 1]; this.col[i * 4 + 2] = this.rgb[i3 + 2];
      this.col[i * 4 + 3] = a;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, alive ? n : 0);
    if (alive || this.wasAlive) {
      g.attributes.position.needsUpdate = true;
      g.attributes.pcolor.needsUpdate = true;
      g.attributes.psize.needsUpdate = true;
      g.attributes.prot.needsUpdate = true;
    }
    this.wasAlive = alive > 0;
  }

  clear() {
    this.life.fill(0);
    this.n = 0;
    this.cursor = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

// ---------------------------------------------------------------------------
// Loose chips and splinters (instanced, simple ballistic motion + ground bounce)
// ---------------------------------------------------------------------------

function shardGeometry() {
  // irregular flat triangle-ish sliver
  const g = new THREE.BufferGeometry();
  const v = [
    [-0.5, -0.12, -0.35], [0.55, -0.1, -0.2], [-0.1, -0.12, 0.6],
    [-0.42, 0.12, -0.3], [0.45, 0.1, -0.18], [-0.08, 0.12, 0.5],
  ];
  const idx = [0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0];
  const pos = [];
  for (const i of idx) pos.push(...v[i]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

class ChipSystem {
  constructor(scene, max, material, lifetime) {
    this.max = max;
    this.lifetime = lifetime;
    this.mesh = new THREE.InstancedMesh(shardGeometry(), material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.rot = new Float32Array(max * 3);
    this.spin = new Float32Array(max * 3);
    this.scl = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.rest = new Uint8Array(max);
    this.cursor = 0;
    this.n = 0;
    this.active = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, white);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m);
    scene.add(this.mesh);
  }

  emit(p, v, sx, sy, sz, color) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.n < this.max) this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = Math.max(p.y, 0.004); this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.rot[i3] = Math.random() * 6.28; this.rot[i3 + 1] = Math.random() * 6.28; this.rot[i3 + 2] = Math.random() * 6.28;
    const sp = 6 + Math.random() * 22;
    this.spin[i3] = (Math.random() - 0.5) * sp; this.spin[i3 + 1] = (Math.random() - 0.5) * sp; this.spin[i3 + 2] = (Math.random() - 0.5) * sp;
    this.scl[i3] = sx; this.scl[i3 + 1] = sy; this.scl[i3 + 2] = sz;
    this.age[i] = 0;
    this.rest[i] = 0;
    if (color !== undefined) {
      _c.set(color);
      this.mesh.setColorAt(i, _c);
      this.mesh.instanceColor.needsUpdate = true;
    }
    this.active++;
  }

  update(dt, g) {
    const n = this.n;
    this.mesh.count = n;
    if (!n) return;
    let dirty = false;
    const life = this.lifetime;
    for (let i = 0; i < n; i++) {
      const age = this.age[i];
      if (age > life + 1) continue;
      const na = age + dt;
      this.age[i] = na;
      const i3 = i * 3;
      if (na > life) {
        // shrink away
        const k = clamp(1 - (na - life), 0, 1);
        _e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
        _m.compose(_v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]), _q.setFromEuler(_e), _s.set(this.scl[i3] * k, this.scl[i3 + 1] * k, this.scl[i3 + 2] * k));
        this.mesh.setMatrixAt(i, _m);
        dirty = true;
        continue;
      }
      if (this.rest[i]) continue;
      this.vel[i3 + 1] -= g * dt;
      const d = Math.exp(-0.35 * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i3] += this.spin[i3] * dt; this.rot[i3 + 1] += this.spin[i3 + 1] * dt; this.rot[i3 + 2] += this.spin[i3 + 2] * dt;
      const floorY = this.scl[i3 + 1] * 0.2 + 0.0015;
      if (this.pos[i3 + 1] < floorY) {
        this.pos[i3 + 1] = floorY;
        if (this.vel[i3 + 1] < -0.6) {
          this.vel[i3 + 1] *= -0.32;
          this.vel[i3] *= 0.6; this.vel[i3 + 2] *= 0.6;
          this.spin[i3] *= 0.5; this.spin[i3 + 1] *= 0.5; this.spin[i3 + 2] *= 0.5;
        } else {
          this.vel[i3 + 1] = 0;
          const f = Math.exp(-9 * dt);
          this.vel[i3] *= f; this.vel[i3 + 2] *= f;
          if (this.vel[i3] * this.vel[i3] + this.vel[i3 + 2] * this.vel[i3 + 2] < 0.004) {
            this.rest[i] = 1;
            // lie flat
            this.rot[i3] = 0; this.rot[i3 + 2] = 0;
          } else {
            this.spin[i3] *= f; this.spin[i3 + 2] *= f;
          }
        }
      }
      _e.set(this.rot[i3], this.rot[i3 + 1], this.rot[i3 + 2]);
      _m.compose(_v.set(this.pos[i3], this.pos[i3 + 1], this.pos[i3 + 2]), _q.setFromEuler(_e), _s.set(this.scl[i3], this.scl[i3 + 1], this.scl[i3 + 2]));
      this.mesh.setMatrixAt(i, _m);
      dirty = true;
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.age.fill(1e9);
    this.n = 0;
    this.cursor = 0;
    this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------------------
// Spark streaks
// ---------------------------------------------------------------------------

class SparkSystem {
  constructor(scene, max) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.heat = new Float32Array(max);
    this.cursor = 0;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.lp = new Float32Array(max * 6);
    this.lc = new Float32Array(max * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.lp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.lc, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
    g.setDrawRange(0, 0);
    scene.add(this.lines);
  }

  emit(p, v, life, heat = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    if (this.n < this.max) this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = v.x; this.vel[i3 + 1] = v.y; this.vel[i3 + 2] = v.z;
    this.life[i] = life; this.maxLife[i] = life; this.heat[i] = heat;
  }

  update(dt, g) {
    const n = this.n;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, i6 = i * 6;
      let l = this.life[i];
      if (l <= 0) {
        this.lp[i6] = this.lp[i6 + 3] = 0; this.lp[i6 + 1] = this.lp[i6 + 4] = -10; this.lp[i6 + 2] = this.lp[i6 + 5] = 0;
        continue;
      }
      l -= dt;
      this.life[i] = l;
      alive++;
      this.vel[i3 + 1] -= g * 0.9 * dt;
      const d = Math.exp(-1.1 * dt);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.005) {
        this.pos[i3 + 1] = 0.005;
        this.vel[i3 + 1] *= -0.35;
        this.vel[i3] *= 0.7; this.vel[i3 + 2] *= 0.7;
      }
      const k = clamp(l / this.maxLife[i], 0, 1);
      const tail = 0.028;
      this.lp[i6] = this.pos[i3]; this.lp[i6 + 1] = this.pos[i3 + 1]; this.lp[i6 + 2] = this.pos[i3 + 2];
      this.lp[i6 + 3] = this.pos[i3] - this.vel[i3] * tail; this.lp[i6 + 4] = Math.max(0.004, this.pos[i3 + 1] - this.vel[i3 + 1] * tail); this.lp[i6 + 5] = this.pos[i3 + 2] - this.vel[i3 + 2] * tail;
      const h = this.heat[i] * k;
      // white-hot -> orange -> red
      const r = 3.2 * h + 0.25, gg = 2.2 * h * h + 0.03, b = 1.4 * h * h * h;
      this.lc[i6] = r; this.lc[i6 + 1] = gg; this.lc[i6 + 2] = b;
      this.lc[i6 + 3] = r * 0.25; this.lc[i6 + 4] = gg * 0.15; this.lc[i6 + 5] = b * 0.1;
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, alive ? n * 2 : 0);
    if (alive || this.wasAlive) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }
    this.wasAlive = alive > 0;
  }

  clear() {
    this.life.fill(0);
    this.n = 0;
    this.cursor = 0;
    this.lines.geometry.setDrawRange(0, 0);
  }
}

// ---------------------------------------------------------------------------
// Effects facade used by the simulation and the tools
// ---------------------------------------------------------------------------

const CHIP_COLORS = {
  wood: [0xd9bf94, 0xc7a877, 0xe6d2ab, 0xb89464],
  ceramic: [0xf4efe4, 0xe9e2d2, 0xfaf7f0, 0x3d5fa0],
  plastic: [0x26282c, 0x3a3d42, 0x1a1b1e, 0x55585e],
  concrete: [0xb0ada6, 0x9c9992, 0xc4c1ba],
  metal: [0xb9bcc2, 0x8f9299, 0xd6d8dc],
  paper: [0xf0ead8, 0xe6dfcc, 0xfaf6ea],
  fabric: [0x44484e, 0x33363b],
};

export class Effects {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    this.dust = new SpriteSystem(scene, 900, getTexture('sprite_dust'), false);
    this.smoke = new SpriteSystem(scene, 400, getTexture('sprite_smoke'), false);
    this.glow = new SpriteSystem(scene, 300, getTexture('sprite_glow'), true);
    this.sparkSys = new SparkSystem(scene, 700);
    this.solidChips = new ChipSystem(scene, 2600, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.0 }), 40);
    this.glassChips = new ChipSystem(
      scene, 2600,
      new THREE.MeshStandardMaterial({ color: 0xe6f6f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 2.4, depthWrite: false }),
      45
    );
    // shock rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.visible = false;
      m.renderOrder = 8;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, life: 0, r0: 0, r1: 1 });
    }
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.shakeRot = new THREE.Vector3();
    this.shakeEnabled = true;
    this.cameraPos = new THREE.Vector3();
    this.time = 0;
    this.density = 1;
    this.gravity = 9.81;
  }

  rnd(a = 1) { return (Math.random() - 0.5) * 2 * a; }

  /** Random direction in a cone around d (or anywhere on the upper hemisphere). */
  coneDir(d, spread, out) {
    out.set(this.rnd(), this.rnd(), this.rnd());
    if (out.lengthSq() < 1e-4) out.set(0, 1, 0);
    out.normalize().multiplyScalar(spread);
    if (d) out.add(d);
    else out.y = Math.abs(out.y) + 0.35;
    return out.normalize();
  }

  // --- camera shake --------------------------------------------------------

  shake(pos, amount) {
    if (!this.shakeEnabled) return;
    const d = pos ? pos.distanceTo(this.cameraPos) : 0;
    this.trauma = Math.min(1, this.trauma + amount / (1 + (d * d) / 60));
  }

  // --- primitive bursts ----------------------------------------------------

  dustPuff(p, color, count, radius, speed, life = 1.4, alpha = 0.32) {
    count = Math.round(count * this.density);
    for (let i = 0; i < count; i++) {
      _v.set(p.x + this.rnd(radius), Math.max(0.02, p.y + this.rnd(radius * 0.5)), p.z + this.rnd(radius));
      _w.set(this.rnd(speed), Math.random() * speed * 0.7 + 0.05, this.rnd(speed));
      const s = radius * (0.9 + Math.random() * 1.3);
      this.dust.emit(_v, _w, life * (0.6 + Math.random() * 0.8), s * 0.6, s * 3.2, color, alpha * (0.6 + Math.random() * 0.6), 2.2, -0.05, this.rnd(0.6));
    }
  }

  sparks(p, dir, count, speed = 1) {
    count = Math.round(count * this.density);
    for (let i = 0; i < count; i++) {
      this.coneDir(dir, dir ? 0.75 : 1, _w).multiplyScalar((1.2 + Math.random() * 5.5) * speed);
      this.sparkSys.emit(p, _w, 0.25 + Math.random() * 0.75, 0.6 + Math.random() * 0.5);
    }
    if (count > 3) {
      this.glow.emit(p, _w.set(0, 0, 0), 0.12, 0.25 * speed, 0.7 * speed, 0xffc880, 0.9, 0, 0, 0);
      this.stage.flashAt(p, 0xffb870, clamp(count * 0.45, 2, 16) * speed, 0.14);
    }
  }

  chips(kind, p, dir, count, speed, sizeScale = 1, inherit) {
    count = Math.round(count * this.density);
    const glass = kind === 'glass';
    const sys = glass ? this.glassChips : this.solidChips;
    const cols = CHIP_COLORS[kind] || CHIP_COLORS.plastic;
    for (let i = 0; i < count; i++) {
      this.coneDir(dir, dir ? 0.85 : 1, _w).multiplyScalar(speed * (0.25 + Math.random() * 1.0));
      if (inherit) _w.add(inherit);
      _v.set(p.x + this.rnd(0.03 * sizeScale), p.y + this.rnd(0.03 * sizeScale), p.z + this.rnd(0.03 * sizeScale));
      let sx, sy, sz;
      if (kind === 'wood') {
        const l = (0.018 + Math.random() * 0.07) * sizeScale;
        sx = l; sy = 0.003 + Math.random() * 0.004; sz = 0.004 + Math.random() * 0.008;
      } else if (glass) {
        const l = (0.006 + Math.random() * 0.02) * sizeScale;
        sx = l; sy = 0.004; sz = l * (0.5 + Math.random() * 0.8);
      } else {
        const l = (0.006 + Math.random() * 0.016) * sizeScale;
        sx = l; sy = l * (0.3 + Math.random() * 0.5); sz = l * (0.5 + Math.random() * 0.7);
      }
      sys.emit(_v, _w, sx, sy, sz, glass ? undefined : cols[(Math.random() * cols.length) | 0]);
    }
  }

  ring(p, normal, r0, r1, life, color = 0xffffff, opacity = 0.5) {
    let slot = this.rings[0];
    for (const r of this.rings) if (r.t >= r.life) { slot = r; break; }
    slot.t = 0; slot.life = life; slot.r0 = r0; slot.r1 = r1; slot.op = opacity;
    slot.mesh.position.copy(p).addScaledVector(normal, 0.02);
    slot.mesh.quaternion.setFromUnitVectors(_u.set(0, 0, 1), normal);
    slot.mesh.material.color.set(color);
    slot.mesh.visible = true;
  }

  // --- simulation hooks ----------------------------------------------------

  /** Ordinary collision: a little dust, the odd spark. */
  impact(physA, physB, P, N, J, vn, ground) {
    const e = J * vn;
    if (e < 2.5) return;
    const soft = physA.hardness < physB.hardness ? physA : physB;
    const k = clamp(Math.sqrt(e) / 14, 0, 1.6);
    if (ground && e > 6) this.dustPuff(P, 0xbdb8ae, 2 + k * 7, 0.06 + k * 0.22, 0.25 + k * 1.2, 1.1 + k, 0.22);
    else if (e > 25 && soft.dust) this.dustPuff(P, soft.dust, 1 + k * 3, 0.05 + k * 0.12, 0.3 + k, 0.9, 0.2);
    const metal = physA.name === 'metal' || physB.name === 'metal';
    const hard = Math.min(physA.hardness, physB.hardness) > 0.85;
    if (metal && hard && vn > 3.2 && e > 30) this.sparks(P, N, 3 + k * 9, 0.8 + k * 0.5);
    if (e > 120) this.shake(P, clamp(e / 9000, 0.02, 0.45));
  }

  /** A chunk shattered. */
  fracture(phys, P, D, intensity, size, pts, asm) {
    const kind = phys.chips;
    const k = clamp(intensity, 0.5, 6);
    const sizeK = clamp(size / 0.4, 0.25, 2.2);
    let inherit = null;
    if (asm && !asm.removed) {
      const v = asm.body.linvel();
      inherit = _u.set(v.x, v.y, v.z).multiplyScalar(0.7);
    }
    const speed = 1.2 + Math.sqrt(k) * 1.6;
    // dust-sized fragments leave from exactly where they were
    const sys = kind === 'glass' ? this.glassChips : this.solidChips;
    const cols = CHIP_COLORS[kind] || CHIP_COLORS.plastic;
    for (const pt of pts) {
      this.coneDir(D, 0.8, _w).multiplyScalar(speed * (0.3 + Math.random()));
      if (inherit) _w.add(inherit);
      const l = 0.008 + Math.random() * 0.016;
      sys.emit(pt, _w, l, kind === 'wood' ? 0.004 : l * 0.4, l * (0.4 + Math.random() * 0.6), kind === 'glass' ? undefined : cols[(Math.random() * cols.length) | 0]);
    }
    if (kind === 'glass') {
      this.chips('glass', P, D, 16 + 22 * sizeK * Math.sqrt(k), speed * 1.3, 1, inherit);
      this.dustPuff(P, 0xf2f8fb, 3 + 3 * sizeK, 0.06 * sizeK + 0.03, 0.8, 0.5, 0.16);
      for (let i = 0; i < 5; i++) {
        this.coneDir(D, 1, _w).multiplyScalar(speed);
        this.glow.emit(P, _w, 0.18, 0.02, 0.07, 0xffffff, 0.55, 3, 2, 0);
      }
    } else if (kind === 'wood') {
      this.chips('wood', P, D, 8 + 14 * sizeK * Math.sqrt(k), speed, 1 + sizeK * 0.5, inherit);
      this.dustPuff(P, phys.dust, 3 + 5 * sizeK, 0.07 + 0.08 * sizeK, 0.9, 1.3, 0.3);
    } else if (kind === 'ceramic') {
      this.chips('ceramic', P, D, 10 + 12 * sizeK * Math.sqrt(k), speed * 1.1, 1, inherit);
      this.dustPuff(P, phys.dust, 3 + 4 * sizeK, 0.06 + 0.05 * sizeK, 0.8, 1.2, 0.34);
    } else if (kind === 'concrete') {
      this.chips('concrete', P, D, 10 + 12 * sizeK, speed, 1.6, inherit);
      this.dustPuff(P, phys.dust, 8 + 8 * sizeK, 0.12 + 0.1 * sizeK, 1.2, 2.2, 0.42);
    } else {
      this.chips(kind, P, D, 5 + 8 * sizeK * Math.sqrt(k), speed, 1, inherit);
      if (phys.dust) this.dustPuff(P, phys.dust, 2 + 2 * sizeK, 0.05, 0.6, 0.7, 0.18);
    }
    if (phys.sparks) this.sparks(P, D, 8, 0.8);
    this.shake(P, clamp(0.015 * sizeK * k, 0, 0.2));
  }

  /** A joint between parts gave way without the parts themselves shattering. */
  snap(phys, P, D, absorbed) {
    const k = clamp(absorbed / 120, 0.15, 1.5);
    if (phys.name === 'metal') {
      this.sparks(P, D, 4 + 8 * k, 0.9);
      this.chips('metal', P, D, 2 + 3 * k, 2.5, 0.7);
    } else if (phys.chips === 'glass') {
      this.chips('glass', P, D, 4 + 6 * k, 2, 0.8);
    } else {
      this.chips(phys.chips, P, D, 3 + 7 * k, 2 + k, 1);
      if (phys.dust) this.dustPuff(P, phys.dust, 2 + 3 * k, 0.05 + 0.05 * k, 0.7, 1, 0.25);
    }
  }

  jointBreak(P, kind) {
    this.sparks(P, null, kind === 'latch' ? 3 : 8, 0.7);
    this.chips('metal', P, null, kind === 'latch' ? 2 : 4, 2.2, 0.7);
  }

  /** Blunt tool strike feedback. */
  hammerHit(P, N, J) {
    const k = clamp(J / 300, 0.2, 2);
    this.ring(P, N, 0.03, 0.25 + 0.35 * k, 0.22, 0xffffff, 0.45);
    this.shake(P, clamp(0.12 + 0.2 * k, 0, 0.6));
  }

  explosion(P, power, radius) {
    const k = clamp(power / 900, 0.3, 3);
    const up = _u.set(0, 1, 0);
    this.stage.flashAt(P, 0xffa040, 90 * k, 0.32);
    // fireball
    for (let i = 0; i < 26 * this.density; i++) {
      this.coneDir(null, 1, _w).multiplyScalar((1.5 + Math.random() * 5) * Math.sqrt(k));
      this.glow.emit(P, _w, 0.22 + Math.random() * 0.3, 0.3 * k, (1.1 + Math.random()) * Math.sqrt(k), i % 3 ? 0xff8a30 : 0xffe0a0, 0.95, 3.5, -1.5, 0);
    }
    // smoke column
    for (let i = 0; i < 34 * this.density; i++) {
      this.coneDir(null, 1, _w).multiplyScalar((0.6 + Math.random() * 3.2) * Math.sqrt(k));
      _w.y = Math.abs(_w.y) * 0.9 + 0.6;
      _v.set(P.x + this.rnd(0.3), Math.max(0.1, P.y + this.rnd(0.2)), P.z + this.rnd(0.3));
      const g = 0.16 + Math.random() * 0.14;
      this.smoke.emit(_v, _w, 1.6 + Math.random() * 2.2, 0.5 * Math.sqrt(k), (2 + Math.random() * 2.2) * Math.sqrt(k), _c.setRGB(g, g, g * 1.03).getHex(), 0.55, 1.4, -0.5, this.rnd(0.5));
    }
    // ground dust skirt
    for (let i = 0; i < 40 * this.density; i++) {
      const a = Math.random() * 6.283, sp = (3 + Math.random() * 7) * Math.sqrt(k);
      _w.set(Math.cos(a) * sp, 0.2 + Math.random() * 0.8, Math.sin(a) * sp);
      _v.set(P.x + Math.cos(a) * 0.3, 0.08, P.z + Math.sin(a) * 0.3);
      this.dust.emit(_v, _w, 1.4 + Math.random() * 1.6, 0.4, 1.8 + Math.random() * 1.6, 0xb9b3a8, 0.34, 2.4, 0, this.rnd(0.5));
    }
    this.sparks(P, null, 70, 2.2);
    this.chips('concrete', P, null, 40, 7, 1.4);
    this.ring(_v.set(P.x, 0.03, P.z), up, 0.2, radius * 0.9, 0.38, 0xffe6c0, 0.55);
    this.shake(P, clamp(0.6 * k, 0.3, 1));
  }

  // --- per frame -----------------------------------------------------------

  update(dt, realDt, camera) {
    this.time += realDt;
    this.cameraPos.copy(camera.position);
    const viewScale = this.stage.viewHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.dust.update(dt, viewScale);
    this.smoke.update(dt, viewScale);
    this.glow.update(dt, viewScale);
    this.sparkSys.update(dt, this.gravity);
    this.solidChips.update(dt, this.gravity);
    this.glassChips.update(dt, this.gravity);
    for (const r of this.rings) {
      if (r.t >= r.life) { r.mesh.visible = false; continue; }
      r.t += dt;
      const k = clamp(r.t / r.life, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.mesh.material.opacity = r.op * (1 - k);
    }
    // camera shake (decays in real time so slow motion does not prolong it)
    this.trauma = Math.max(0, this.trauma - realDt * 1.7);
    const s = this.trauma * this.trauma;
    const t = this.time * 38;
    this.shakeOffset.set(Math.sin(t * 1.13) + Math.sin(t * 2.31 + 1.7), Math.sin(t * 1.71 + 0.4) + Math.sin(t * 2.87 + 2.9), Math.sin(t * 1.37 + 5.1)).multiplyScalar(0.035 * s);
    this.shakeRot.set(Math.sin(t * 1.9 + 0.3), Math.sin(t * 1.5 + 1.9), Math.sin(t * 2.3 + 4.2)).multiplyScalar(0.012 * s);
  }

  clear() {
    this.dust.clear();
    this.smoke.clear();
    this.glow.clear();
    this.sparkSys.clear();
    this.solidChips.clear();
    this.glassChips.clear();
    for (const r of this.rings) { r.t = r.life; r.mesh.visible = false; }
    this.trauma = 0;
  }
}
