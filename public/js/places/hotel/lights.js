// The hotel's lights. Hundreds of fixtures - sconces, chandeliers, lamps,
// tubes, emergency lights, the storm through the windows - but only a pool
// of eight real point lights: each frame they're handed to the fixtures that
// matter most to what you can see. Every fixture still glows (its bulbs and
// shades are instanced, unlit, with a halo in the dark), flickers on its
// own circuit, dies when the power's out, and gutters when the Night
// Manager comes near.
import * as THREE from 'three';

const _c = new THREE.Color(), _v = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the glowing parts' shapes
function shapeGeo(kind) {
  switch (kind) {
    case 'bulb': return new THREE.SphereGeometry(0.16, 8, 6);
    case 'flame': return new THREE.ConeGeometry(0.07, 0.3, 6).translate(0, 0.15, 0);
    case 'tulip': return new THREE.LatheGeometry([[0.05, -0.3], [0.32, -0.22], [0.42, 0.05], [0.36, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    case 'drum': return new THREE.CylinderGeometry(0.7, 0.85, 1.1, 14, 1, true);
    case 'globe': return new THREE.SphereGeometry(0.5, 12, 8);
    case 'bowl': return new THREE.SphereGeometry(0.9, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    case 'tube': return new THREE.CylinderGeometry(0.12, 0.12, 4, 6).rotateZ(Math.PI / 2);
    case 'panel': return new THREE.BoxGeometry(1, 1, 0.1);
    case 'ember': return new THREE.PlaneGeometry(1, 1);
    default: return new THREE.SphereGeometry(0.2, 8, 6);
  }
}

const HALO_VS = `
attribute float size; attribute vec3 hcol;
varying vec3 vCol; varying float vFade;
uniform float scale; uniform float fogNear; uniform float fogFar;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = size * scale / max(d, 0.5);
  vCol = hcol;
  vFade = 1.0 - smoothstep(fogNear, fogFar, d);
}`;
const HALO_FS = `
varying vec3 vCol; varying float vFade;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float a = exp(-r * 4.0) * 0.9 + exp(-r * 18.0) * 0.6;
  gl_FragColor = vec4(vCol * a * vFade, 1.0);
}`;

export class Lights {
  constructor(world, o = {}) {
    this.world = world;
    this.fixtures = [];
    this.shapes = new Map();
    this.N = o.pool ?? 8;
    this.pool = [];
    for (let i = 0; i < this.N; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 2);
      world.scene.add(l);
      this.pool.push({ l, fx: null, k: 0 });
    }
    this.power = false; // the main circuit
    this.lightning = 0; // 0..1 flash
    this.drainAt = null; // the Night Manager's position, when he's about
    this.drainR = 16;
    this.boost = 1;
    this.t = 0;
  }

  /** Register a fixture. f: {pos, color, power, range, circuit, flicker, broken, halo, kind}. */
  add(f) {
    const fx = {
      pos: f.pos.clone(), color: new THREE.Color(f.color ?? 0xffb46a), power: f.power ?? 30, range: f.range ?? 14,
      circuit: f.circuit || 'main', flicker: f.flicker ?? 0.05, broken: !!f.broken, kind: f.kind || 'lamp',
      halo: f.halo ?? 1.5, emergency: f.emergency ?? 0.18, dim: 1, level: 0, shown: -1, parts: [], f: 1, ft: Math.random() * 3, fade: 1, room: f.room,
      tag: f.tag,
    };
    this.fixtures.push(fx);
    return fx;
  }
  /** A glowing part of a fixture (instanced): shape, world matrix, brightness factor. */
  glow(fx, shape, matrix, k = 1, tint) {
    let s = this.shapes.get(shape);
    if (!s) { s = { items: [] }; this.shapes.set(shape, s); }
    s.items.push({ matrix: matrix.clone(), fx, k, tint: tint ? new THREE.Color(tint) : null });
  }
  /** Make the instanced glow meshes and the halos (after everything is registered). */
  finalize() {
    for (const [shape, s] of this.shapes) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: shape === 'drum' || shape === 'tulip' || shape === 'bowl' ? THREE.DoubleSide : THREE.FrontSide });
      const m = new THREE.InstancedMesh(shapeGeo(shape), mat, s.items.length);
      s.items.forEach((it, i) => { m.setMatrixAt(i, it.matrix); m.setColorAt(i, _c.setRGB(0, 0, 0)); it.fx.parts.push({ s, i, k: it.k, tint: it.tint }); });
      m.instanceMatrix.needsUpdate = true;
      m.frustumCulled = false;
      this.world.scene.add(m);
      s.mesh = m;
    }
    // halos
    const n = this.fixtures.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.fixtures.flatMap((f) => [f.pos.x, f.pos.y, f.pos.z]), 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(this.fixtures.map((f) => f.halo), 1));
    g.setAttribute('hcol', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VS, fragmentShader: HALO_FS,
      uniforms: { scale: { value: 300 }, fogNear: { value: 20 }, fogFar: { value: 90 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halos = new THREE.Points(g, this.haloMat);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 5;
    this.world.scene.add(this.halos);
  }

  _flicker(fx, dt, near) {
    // each fixture's own little state machine: steady, dips, blackouts, strobing tubes
    fx.ft -= dt;
    const fl = Math.min(1, fx.flicker + near * 0.9);
    if (fx.ft > 0) return;
    const r = Math.random();
    if (fl < 0.01) { fx.f = 1; fx.ft = 2 + Math.random() * 4; return; }
    if (fx.kind === 'tube' && r < fl) { fx.f = Math.random() < 0.5 ? 0 : 1; fx.ft = 0.02 + Math.random() * 0.08; return; }
    if (r < fl * 0.35) { fx.f = 0; fx.ft = 0.04 + Math.random() * (near > 0.5 ? 0.6 : 0.18); }
    else if (r < fl) { fx.f = 0.25 + Math.random() * 0.5; fx.ft = 0.03 + Math.random() * 0.15; }
    else { fx.f = 1; fx.ft = (0.3 + Math.random() * 2.5) * (1.2 - fl); }
  }

  update(dt, cam) {
    this.t += dt;
    const d2 = this.drainAt, R = this.drainR;
    const col = this.halos.geometry.attributes.hcol;
    for (const s of this.shapes.values()) s.dirty = false;
    let haloDirty = false;
    for (let i = 0; i < this.fixtures.length; i++) {
      const fx = this.fixtures[i];
      let base;
      switch (fx.circuit) {
        case 'main': base = this.power ? 1 : fx.emergency; break;
        case 'emergency': base = 1; break;
        case 'battery': base = 1; break;
        case 'window': base = 0.35 + this.lightning * 6; break;
        case 'event': base = fx.on ? 1 : 0; break;
        default: base = 0;
      }
      if (fx.broken) base = 0;
      let near = 0;
      if (d2 && fx.circuit !== 'window') { const d = fx.pos.distanceTo(d2); near = smooth(R, R * 0.35, d); }
      if (base > 0) this._flicker(fx, dt, near); else fx.f = 1;
      const lvl = base * fx.f * fx.dim * (1 - near * 0.85) * this.boost;
      fx.level = lvl;
      if (Math.abs(lvl - fx.shown) > 0.01) {
        fx.shown = lvl;
        for (const p of fx.parts) {
          const k = Math.min(lvl, 3) * p.k;
          _c.copy(p.tint || fx.color).multiplyScalar(k * 2.2);
          p.s.mesh.setColorAt(p.i, _c);
          p.s.dirty = true;
        }
        _c.copy(fx.color).multiplyScalar(Math.min(lvl, 2) * 0.55);
        col.setXYZ(i, _c.r, _c.g, _c.b); haloDirty = true;
      }
    }
    for (const s of this.shapes.values()) if (s.dirty) s.mesh.instanceColor.needsUpdate = true;
    if (haloDirty) col.needsUpdate = true;

    // hand the real lights to the fixtures that matter most here
    const cand = [];
    for (const fx of this.fixtures) {
      if (fx.level < 0.02) continue;
      const d = fx.pos.distanceTo(cam);
      if (d > fx.range + 26) continue;
      const score = fx.power * fx.level / (1 + (d / fx.range) * (d / fx.range) * 1.5);
      cand.push([score, fx]);
    }
    cand.sort((a, b) => b[0] - a[0]);
    const want = new Set(cand.slice(0, this.N).map((c) => c[1]));
    for (const p of this.pool) if (p.fx && !want.has(p.fx)) p.fx = null;
    const has = new Set(this.pool.map((p) => p.fx));
    for (const fx of want) if (!has.has(fx)) { const p = this.pool.find((q) => !q.fx); if (p) { p.fx = fx; p.k = 0; } }
    for (const p of this.pool) {
      if (!p.fx) { p.l.intensity = 0; continue; }
      p.k = Math.min(1, p.k + dt * 8); // fade in when a light is handed over
      p.l.position.copy(p.fx.pos);
      p.l.color.copy(p.fx.color);
      p.l.distance = p.fx.range;
      p.l.intensity = p.fx.power * p.fx.level * p.k;
    }
  }
  /** Roughly how much lamplight falls on a point (0 dark .. 1+ well lit), for how easily you're seen. */
  lightAt(p) {
    let s = 0;
    for (const fx of this.fixtures) {
      if (fx.level < 0.02) continue;
      const d2 = fx.pos.distanceToSquared(p), R = fx.range * 1.2;
      if (d2 > R * R) continue;
      s += fx.power * fx.level / (4 + d2) * (1 - Math.sqrt(d2) / R);
    }
    return s;
  }
  setFog(near, far) { if (this.haloMat) { this.haloMat.uniforms.fogNear.value = near; this.haloMat.uniforms.fogFar.value = far; } }
  setScale(h) { if (this.haloMat) this.haloMat.uniforms.scale.value = h * 0.45; }
}
