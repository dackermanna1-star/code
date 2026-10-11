// Blood effects: hit bursts (droplet + mist particles), exit splatter / droplet / drip
// decals and slowly spreading puddles under corpses. Everything is batched: three decal
// meshes (puddles, splats, droplet stains) and one instanced particle mesh, so blood
// costs four draw calls no matter how much of it there is.
//
// All positions are GoldSrc space (children of renderer.world). Decals are lifted a
// fraction of a unit off the surface and drawn with polygonOffset, depthWrite off and
// a negative renderOrder (before other transparent effects). They are tinted with the
// baked light at the surface (W.sampler + the world shader's light curve).
//
//   const b = new BloodFX(effects)
//   b.hit(pos, dir, damage, { head, victim, blast, exit })   one bullet / knife / blast wound
//                                (exit: false when the bullet stopped in the body)
//   b.puddle(src, opts)          src = player | () => [x,y,z] | [x,y,z]; see puddle()
//   b.update(dt); b.clear()
import * as THREE from 'three';
import { TraceResult, MASK_SHOT } from '../engine/collision.js';
import { lightCurve } from '../map/meshbuilder.js';

export const MAX_SPLATS = 64;
export const MAX_DROPS = 128;
export const MAX_PUDDLES = 24;
export const MAX_PARTICLES = 320;
const GRAVITY = 800;

// atlas layouts (see src/assets/tex/blood.js)
const SPLAT = { cols: 4, rows: 2, round: [0, 1, 2], dir: [3, 4, 5], runs: [6, 7], dirShift: 11 / 64, runShift: 13 / 64 };
const DROP = { cols: 4, rows: 4, round: [0, 1, 2, 3, 4, 5, 6, 7], dir: [8, 9, 10, 11], drip: [12, 13, 14, 15], dirShift: 4 / 32 };
// puddle cell: main lobe radius 44 px of 128 -> world radius R needs a quad of R / 0.344
const POOL = { cols: 2, rows: 1, radiusFrac: 44 / 128 };

// ragdoll particle indices (src/game/ragdoll.js HEAD / CHEST)
const RAG_HEAD = 0, RAG_CHEST = 13;

// particle flags
const F_COLLIDE = 1, F_STAIN = 2, F_DRIP = 4, F_MIST = 8;

const rnd = (a, b) => a + (b - a) * Math.random();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ZERO = [0, 0, 0];

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l < 1e-6) return [1, 0, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/** Unit vector in the plane of n, closest to d (falls back to an arbitrary tangent). */
function tangentToward(n, d) {
  const k = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  const t = [d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k];
  const l = Math.hypot(t[0], t[1], t[2]);
  if (l > 1e-3) return [t[0] / l, t[1] / l, t[2] / l];
  return randomTangent(n);
}
function randomTangent(n) {
  const a = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const t1 = norm3(cross(n, a)), t2 = cross(n, t1);
  const r = Math.random() * Math.PI * 2, c = Math.cos(r), s = Math.sin(r);
  return [t1[0] * c + t2[0] * s, t1[1] * c + t2[1] * s, t1[2] * c + t2[2] * s];
}
/** Random direction within ~`spread` radians of unit vector d. */
function cone(d, spread) {
  return norm3([d[0] + (Math.random() - 0.5) * 2 * spread, d[1] + (Math.random() - 0.5) * 2 * spread, d[2] + (Math.random() - 0.5) * 2 * spread]);
}

// ------------------------------------------------------------------ shaders

const DECAL_VERT = /* glsl */`
  attribute vec4 aCol;
  varying vec2 vUv;
  varying vec4 vCol;
  #ifdef PUDDLE
    attribute float aProg;
    varying float vProg;
  #endif
  void main() {
    vUv = uv;
    vCol = aCol;
    #ifdef PUDDLE
      vProg = aProg;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DECAL_FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vCol;
  #ifdef PUDDLE
    varying float vProg;
  #endif
  void main() {
    vec4 t = texture2D(map, vUv);
    #ifdef PUDDLE
      // r = film thickness, g = gloss, b = spread order, a = coverage
      float wet = 1.0 - smoothstep(vProg - 0.07, vProg, t.b);
      float a = t.a * wet * mix(0.74, 0.95, t.r);
      vec3 c = mix(vec3(0.40, 0.030, 0.024), vec3(0.16, 0.010, 0.008), t.r);
      // the advancing edge is a little darker (thicker meniscus) while it spreads
      float front = smoothstep(vProg - 0.16, vProg - 0.03, t.b) * (1.0 - smoothstep(0.9, 1.05, vProg));
      c *= 1.0 - 0.3 * front;
      c += t.g * vec3(0.40, 0.29, 0.27);
      gl_FragColor = vec4(c * vCol.rgb, a * vCol.a);
    #else
      gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
    #endif
    if (gl_FragColor.a < 0.004) discard;
  }
`;

const PART_VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iVel;   // velocity, stretch factor
  attribute vec4 iCol;
  attribute vec4 iSRF;   // size, rotation, frame, min size in pixels
  uniform vec2 cells;
  uniform float pxScale; // world units per pixel at distance 1
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec2 ax = vec2(cos(iSRF.y), sin(iSRF.y));
    float st = 1.0;
    if (iVel.w > 0.0) {
      vec2 vv = (modelViewMatrix * vec4(iVel.xyz, 0.0)).xy;
      float sp = length(vv);
      if (sp > 1.0) { ax = vv / sp; st = 1.0 + min(sp * iVel.w, 2.5); }
    }
    vec2 ay = vec2(-ax.y, ax.x);
    // never smaller than a few pixels, so a hit reads at any range
    float sz = max(iSRF.x, iSRF.w * pxScale * max(1.0, -mv.z));
    mv.xy += (ax * position.x * st + ay * position.y) * sz;
    gl_Position = projectionMatrix * mv;
    float f = iSRF.z;
    vUv = (vec2(mod(f, cells.x), floor(f / cells.x)) + vec2(uv.x, 1.0 - uv.y)) / cells;
    vCol = iCol;
  }
`;

const PART_FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 t = texture2D(map, vUv);
    float a = t.a * vCol.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb * vCol.rgb, a);
  }
`;

// ------------------------------------------------------------------ decal batch

/** A fixed pool of textured quads in one mesh; slots are recycled oldest-first. */
class DecalBatch {
  constructor(parent, tex, max, cols, rows, order, puddle = false) {
    this.max = max;
    this.cols = cols;
    this.rows = rows;
    this.pos = new Float32Array(max * 12);
    this.uv = new Float32Array(max * 8);
    this.col = new Float32Array(max * 16);
    this.prog = puddle ? new Float32Array(max * 4) : null;
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const g = new THREE.BufferGeometry();
    this.attrs = [
      ['position', this.pos, 3], ['uv', this.uv, 2], ['aCol', this.col, 4], ...(puddle ? [['aProg', this.prog, 1]] : []),
    ].map(([name, arr, n]) => {
      const a = new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    });
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: DECAL_VERT,
      fragmentShader: DECAL_FRAG,
      defines: puddle ? { PUDDLE: 1 } : {},
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = puddle ? 'blood_puddles' : 'blood_decals';
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.owner = new Array(max).fill(null);
    this.count = 0;
    this.next = 0;
    this.dirty = false;
  }

  alloc(owner = null) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.count < this.max) {
      this.count++;
      this.mesh.geometry.setDrawRange(0, this.count * 6);
      this.mesh.visible = true;
    }
    this.owner[i] = owner;
    return i;
  }

  /** Quad centred at c spanning ±U*hu, ±V*hv (V = n × U keeps the front face towards n). */
  setQuad(i, c, U, V, hu, hv) {
    const P = this.pos, o = i * 12;
    for (let k = 0; k < 4; k++) {
      const su = k === 0 || k === 3 ? -hu : hu, sv = k < 2 ? -hv : hv;
      P[o + k * 3] = c[0] + U[0] * su + V[0] * sv;
      P[o + k * 3 + 1] = c[1] + U[1] * su + V[1] * sv;
      P[o + k * 3 + 2] = c[2] + U[2] * su + V[2] * sv;
    }
    this.dirty = true;
  }

  setCell(i, cell) {
    const u0 = (cell % this.cols) / this.cols, u1 = u0 + 1 / this.cols;
    const v0 = Math.floor(cell / this.cols) / this.rows, v1 = v0 + 1 / this.rows;
    this.uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    this.dirty = true;
  }

  setColor(i, rgb, a) {
    const C = this.col, o = i * 16;
    for (let k = 0; k < 4; k++) {
      C[o + k * 4] = rgb[0];
      C[o + k * 4 + 1] = rgb[1];
      C[o + k * 4 + 2] = rgb[2];
      C[o + k * 4 + 3] = a;
    }
    this.dirty = true;
  }

  setProg(i, p) {
    this.prog.fill(p, i * 4, i * 4 + 4);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    for (const a of this.attrs) a.needsUpdate = true;
  }

  clear() {
    this.count = 0;
    this.next = 0;
    this.owner.fill(null);
    this.mesh.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }
}

// ------------------------------------------------------------------ particles

/** Pooled camera-facing quads (one instanced draw); droplets collide with the world. */
class BloodParticles {
  constructor(parent, tex, max, collision, onLand) {
    this.max = max;
    this.n = 0;
    this.collision = collision;
    this.onLand = onLand;
    this.tr = new TraceResult();
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 3);
    // age, life, size, grow, alpha, gravity, drag, frame, rot, stretch, flags, min px
    this.s = new Float32Array(max * 12);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.iPos = inst('iPos', 3);
    this.iVel = inst('iVel', 4);
    this.iCol = inst('iCol', 4);
    this.iSRF = inst('iSRF', 4);
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, cells: { value: new THREE.Vector2(2, 2) }, pxScale: { value: 0.002 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.name = 'blood_particles';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this._a = [0, 0, 0];
    this._b = [0, 0, 0];
  }

  spawn(pos, vel, o) {
    let i = this.n;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // full: replace a random one
    else this.n++;
    this.p[i * 3] = pos[0]; this.p[i * 3 + 1] = pos[1]; this.p[i * 3 + 2] = pos[2];
    this.v[i * 3] = vel[0]; this.v[i * 3 + 1] = vel[1]; this.v[i * 3 + 2] = vel[2];
    const t = o.tint || [1, 1, 1];
    this.tint[i * 3] = t[0]; this.tint[i * 3 + 1] = t[1]; this.tint[i * 3 + 2] = t[2];
    const s = this.s, k = i * 12;
    s[k] = 0;
    s[k + 1] = o.life ?? 0.6;
    s[k + 2] = o.size ?? 1.5;
    s[k + 3] = o.grow ?? 0;
    s[k + 4] = o.alpha ?? 1;
    s[k + 5] = o.gravity ?? 1;
    s[k + 6] = o.drag ?? 0;
    s[k + 7] = o.frame ?? 0;
    s[k + 8] = o.rot ?? Math.random() * Math.PI * 2;
    s[k + 9] = o.stretch ?? 0;
    s[k + 10] = o.flags ?? 0;
    s[k + 11] = o.minPx ?? 1.5;
  }

  kill(i) {
    const j = --this.n;
    if (i === j) return;
    this.p.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.v.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.tint.copyWithin(i * 3, j * 3, j * 3 + 3);
    this.s.copyWithin(i * 12, j * 12, j * 12 + 12);
  }

  update(dt) {
    const P = this.p, V = this.v, S = this.s, a = this._a, b = this._b;
    if (dt > 0) {
      for (let i = 0; i < this.n; i++) {
        const k = i * 12;
        S[k] += dt;
        if (S[k] >= S[k + 1]) { this.kill(i--); continue; }
        const o = i * 3;
        const drag = S[k + 6];
        if (drag) { const f = Math.max(0, 1 - drag * dt); V[o] *= f; V[o + 1] *= f; V[o + 2] *= f; }
        V[o + 2] -= GRAVITY * S[k + 5] * dt;
        a[0] = P[o]; a[1] = P[o + 1]; a[2] = P[o + 2];
        b[0] = a[0] + V[o] * dt; b[1] = a[1] + V[o + 1] * dt; b[2] = a[2] + V[o + 2] * dt;
        if (S[k + 10] & F_COLLIDE) {
          const tr = this.collision.trace(a, b, ZERO, ZERO, MASK_SHOT, this.tr);
          if (tr.startsolid) { this.kill(i--); continue; }
          if (tr.fraction < 1) {
            if (S[k + 10] & F_STAIN) this.onLand(tr.endpos, tr.normal, [V[o], V[o + 1], V[o + 2]], S[k + 2], S[k + 10], [this.tint[o], this.tint[o + 1], this.tint[o + 2]]);
            this.kill(i--);
            continue;
          }
        }
        P[o] = b[0]; P[o + 1] = b[1]; P[o + 2] = b[2];
      }
    }
    const n = this.n;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    // anchor the mesh at the particles' centroid so it depth-sorts sensibly against other sprites
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    this.mesh.position.set(cx, cy, cz);
    const ip = this.iPos.array, iv = this.iVel.array, ic = this.iCol.array, is = this.iSRF.array;
    for (let i = 0; i < n; i++) {
      const k = i * 12, o = i * 3;
      const age = S[k], life = S[k + 1], t = age / life, flags = S[k + 10];
      ip[o] = P[o] - cx; ip[o + 1] = P[o + 1] - cy; ip[o + 2] = P[o + 2] - cz;
      iv[i * 4] = V[o]; iv[i * 4 + 1] = V[o + 1]; iv[i * 4 + 2] = V[o + 2]; iv[i * 4 + 3] = S[k + 9];
      let al = S[k + 4];
      if (flags & F_MIST) al *= (1 - t) * Math.min(1, age / 0.04);
      else al *= Math.min(1, (1 - t) * 5);
      ic[i * 4] = this.tint[o]; ic[i * 4 + 1] = this.tint[o + 1]; ic[i * 4 + 2] = this.tint[o + 2]; ic[i * 4 + 3] = al;
      const q = i * 4;
      is[q] = S[k + 2] + S[k + 3] * age; is[q + 1] = S[k + 8]; is[q + 2] = S[k + 7]; is[q + 3] = S[k + 11];
    }
    for (const at of [this.iPos, this.iVel, this.iCol, this.iSRF]) {
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
      at.needsUpdate = true;
    }
  }

  clear() {
    this.n = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }
}

// ------------------------------------------------------------------ blood fx

export class BloodFX {
  constructor(effects) {
    this.fx = effects;
    this.game = effects.game;
    this.collision = this.game.collision;
    this.group = new THREE.Group();
    this.group.name = 'blood';
    effects.group.add(this.group);
    this.tr = new TraceResult();
    this.time = 0;
    this.pools = new DecalBatch(this.group, this.texture('decal_blood_pool', true), MAX_PUDDLES, POOL.cols, POOL.rows, -3, true);
    this.splats = new DecalBatch(this.group, this.texture('decal_blood_splats', true), MAX_SPLATS, SPLAT.cols, SPLAT.rows, -2);
    this.drops = new DecalBatch(this.group, this.texture('decal_blood_drops', true), MAX_DROPS, DROP.cols, DROP.rows, -1);
    this.parts = new BloodParticles(this.group, this.texture('spr_blood', false), MAX_PARTICLES, this.collision,
      (pos, n, vel, size, flags, tint) => this.land(pos, n, vel, size, flags, tint));
    this.puddles = [];
    this.lastHit = new WeakMap();
    this._v = new THREE.Vector3();
  }

  /** RGBA atlas as a DataTexture (no canvas round trip, so data channels stay exact). */
  texture(name, mips) {
    const lib = this.game.texLib?.lib;
    let tex = null;
    try {
      if (lib?.generatePixels && lib.TEXTURES?.[name]) {
        const p = lib.generatePixels(name);
        tex = new THREE.DataTexture(new Uint8Array(p.data.buffer, p.data.byteOffset, p.data.length), p.w, p.h, THREE.RGBAFormat, THREE.UnsignedByteType);
      }
    } catch (e) {
      console.error('blood texture failed', name, e);
    }
    if (!tex) tex = new THREE.CanvasTexture(this.game.texLib.canvas(name));
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    tex.generateMipmaps = mips;
    tex.needsUpdate = true;
    return tex;
  }

  enabled() {
    const s = this.game.settings;
    const v = s?.get ? s.get('violence_hblood') : 1;
    return v === undefined || v === null || Number(v) !== 0;
  }

  /** Baked light at a surface point, run through the world shader's light curve. */
  lightAt(pos, n, out = [1, 1, 1]) {
    const smp = this.game.W?.sampler;
    out[0] = out[1] = out[2] = 1;
    if (!smp) return out;
    const q = [pos[0] + n[0] * 6, pos[1] + n[1] * 6, pos[2] + n[2] * 6 + 2];
    const l = smp.sample(q, [1, 1, 1]);
    for (let k = 0; k < 3; k++) out[k] = clamp(lightCurve(l[k]), 0.16, 1.5);
    return out;
  }

  // ---------------------------------------------------------------- hits
  hit(pos, dir, damage, opts = {}) {
    if (!this.enabled()) return;
    const d = norm3(dir || [1, 0, 0]);
    const head = !!opts.head, blast = !!opts.blast;
    const dmg = clamp(damage || 10, 1, 150);
    if (opts.victim) this.lastHit.set(opts.victim, { head, t: this.time, dmg });
    // your own wounds, seen from inside your head: no mist / back-spray in front of the camera
    const g = this.game, v = opts.victim;
    const inEye = !!v && v === g.viewTarget && v.alive && g.camMode !== 'third';
    const tint = this.lightAt(pos, [0, 0, 1]);
    const P = this.parts;
    const j = () => (Math.random() - 0.5) * 2;
    const at = (s) => [pos[0] + j() * s, pos[1] + j() * s, pos[2] + j() * s];

    // particles stay readable in shadow (the decals keep the full baked light)
    const pt = [Math.max(0.42, tint[0]), Math.max(0.42, tint[1]), Math.max(0.42, tint[2])];
    // the bullet went through: a jet out of the far side; otherwise the spray is mostly
    // thrown back out of the entry hole
    const through = opts.exit !== false && !blast;
    const back = [-d[0], -d[1], -d[2]];

    // entry: a dense red burst facing the shooter (the 1.6 blood sprite), big enough to
    // see across the map
    if (!inEye) {
      P.spawn([pos[0] - d[0] * 1.5, pos[1] - d[1] * 1.5, pos[2] - d[2] * 1.5], [back[0] * 30, back[1] * 30, back[2] * 30 + 10], {
        life: rnd(0.16, 0.22), size: (head ? 7 : 5) + dmg * 0.05, grow: head ? 46 : 34, alpha: 1, frame: 1,
        gravity: 0.1, drag: 6, flags: F_MIST, tint: pt, minPx: head ? 12 : 10,
      });
    }
    // exit: a cone of fast, stretched drops (bloodspray) plus slower heavy droplets
    const nFwd = Math.round(clamp(3 + dmg / 6, 4, 14) * (head ? 1.5 : 1) * (blast ? 0.6 : 1) * (through ? 1 : 0.5));
    for (let i = 0; i < nFwd; i++) {
      const c = cone(d, 0.38), sp = rnd(140, 320) * (head ? 1.25 : 1);
      P.spawn(at(1.5), [c[0] * sp, c[1] * sp, c[2] * sp + rnd(20, 80)], {
        life: rnd(0.55, 0.95), size: rnd(1.4, 2.8), frame: Math.random() < 0.35 ? 1 : 0, drag: 0.6, stretch: 0.014,
        flags: F_COLLIDE | (Math.random() < 0.4 ? F_STAIN : 0), tint: pt, minPx: 2.2,
      });
    }
    if (through) {
      const nJet = Math.round(clamp(6 + dmg / 8, 6, 16) * (head ? 1.4 : 1));
      for (let i = 0; i < nJet; i++) {
        const c = cone(d, 0.2), sp = rnd(320, 560);
        P.spawn([pos[0] + d[0] * 6 + j(), pos[1] + d[1] * 6 + j(), pos[2] + d[2] * 6 + j()], [c[0] * sp, c[1] * sp, c[2] * sp + rnd(10, 60)], {
          life: rnd(0.3, 0.5), size: rnd(2.2, 3.8), frame: 1, drag: 1.2, stretch: 0.02,
          flags: F_COLLIDE | (Math.random() < 0.25 ? F_STAIN : 0), tint: pt, minPx: 3,
        });
      }
    }
    // back-spray out of the entry wound, towards the shooter
    const nBack = inEye ? 0 : Math.round(nFwd * (through ? 0.5 : 1.1));
    for (let i = 0; i < nBack; i++) {
      const c = cone(back, 0.6), sp = rnd(60, 170);
      P.spawn(at(1.5), [c[0] * sp, c[1] * sp, c[2] * sp + rnd(30, 90)], {
        life: rnd(0.45, 0.8), size: rnd(1.1, 2.2), frame: Math.random() < 0.35 ? 1 : 0, drag: 0.8, stretch: 0.012,
        flags: F_COLLIDE | (Math.random() < 0.3 ? F_STAIN : 0), tint: pt, minPx: 2.2,
      });
    }
    // headshot: a fine, fast jet out of the exit plus an upward spurt
    if (head) {
      const nJet = Math.round(10 + dmg / 10);
      for (let i = 0; i < nJet; i++) {
        const c = cone(d, 0.22), sp = rnd(260, 480);
        P.spawn(at(1), [c[0] * sp, c[1] * sp, c[2] * sp + rnd(40, 120)], {
          life: rnd(0.6, 1.0), size: rnd(0.9, 1.6), drag: 0.4, stretch: 0.02,
          flags: F_COLLIDE | (Math.random() < 0.22 ? F_STAIN : 0), tint: pt, minPx: 2,
        });
      }
      for (let i = 0; i < 6; i++) {
        const sp = rnd(60, 130);
        P.spawn(at(1), [d[0] * sp * 0.5 + j() * 30, d[1] * sp * 0.5 + j() * 30, rnd(120, 220)], {
          life: rnd(0.7, 1.0), size: rnd(1.4, 2.4), frame: 1, drag: 0.3, stretch: 0.01, flags: F_COLLIDE | F_STAIN, tint: pt, minPx: 2.5,
        });
      }
    }
    // a few heavy drops falling straight down from the wound -> drip stains under the victim
    const nDrip = (Math.random() < 0.3 + dmg / 120 ? 1 + (Math.random() < 0.45 ? 1 : 0) : 0) + (head ? 1 : 0);
    for (let i = 0; i < nDrip; i++) {
      P.spawn(at(3), [j() * 25 + d[0] * 20, j() * 25 + d[1] * 20, rnd(-40, 25)], {
        life: 1.2, size: rnd(1.6, 2.4), frame: 0, stretch: 0.01, flags: F_COLLIDE | F_STAIN | F_DRIP, tint: pt, minPx: 1.5,
      });
    }
    // red mist: out of the exit (through shots) and a smaller puff at the entry
    const nMist = inEye ? 0 : head ? 3 : 1 + (dmg >= 30 ? 1 : 0);
    for (let i = 0; i < nMist; i++) {
      const sp = rnd(15, 45) * (head ? 1.6 : 1);
      const q = through ? [pos[0] + d[0] * 5 + j() * 2, pos[1] + d[1] * 5 + j() * 2, pos[2] + d[2] * 5 + j() * 2] : [pos[0] - d[0] * 2 + j() * 2, pos[1] - d[1] * 2 + j() * 2, pos[2] + j() * 2];
      const md = through ? d : back;
      P.spawn(q, [md[0] * sp + j() * 15, md[1] * sp + j() * 15, md[2] * sp + 8 + j() * 10], {
        life: head ? rnd(0.55, 0.75) : rnd(0.4, 0.55), size: head ? rnd(9, 13) : 7 + dmg * 0.08, grow: head ? rnd(44, 60) : rnd(30, 40),
        alpha: head ? 0.9 : 0.85, frame: 2 + (Math.random() < 0.5 ? 1 : 0), gravity: 0.04, drag: 3.5, flags: F_MIST, tint: pt, minPx: head ? 16 : 11,
      });
    }
    this.exitSplatter(pos, d, dmg, head, blast);
  }

  /** TraceBleed: splats on whatever is 96..128 units behind the wound. */
  exitSplatter(pos, d, dmg, head, blast) {
    const count = blast ? 1 : 1 + (dmg >= 30 ? 1 : 0) + (head ? 1 : 0);
    for (let k = 0; k < count; k++) {
      if (k === 0 && dmg < 12 && Math.random() < 0.4) continue;
      const t = cone(d, k === 0 ? 0.1 : 0.3);
      t[2] -= rnd(0.05, 0.35);
      const dir = norm3(t);
      const len = rnd(96, 128) * (head ? 1.15 : 1);
      const end = [pos[0] + dir[0] * len, pos[1] + dir[1] * len, pos[2] + dir[2] * len];
      const tr = this.collision.trace(pos, end, ZERO, ZERO, MASK_SHOT, this.tr);
      if (tr.fraction >= 1 || tr.startsolid) continue;
      const n = tr.normal.slice(), p = tr.endpos.slice();
      // farther surfaces catch a smaller, thinner spray
      const size = clamp(30 + dmg * 0.45, 30, 72) * (head ? 1.2 : 1) * (k ? 0.7 : 1) * rnd(0.85, 1.15) * (1.15 - 0.3 * tr.fraction);
      const cosI = -(dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2]);
      const wall = Math.abs(n[2]) < 0.7;
      let cell, U, shift = 0;
      if (cosI < 0.75) {
        cell = pick(SPLAT.dir);
        U = tangentToward(n, dir);
        shift = SPLAT.dirShift;
      } else if (wall && Math.random() < 0.55) {
        cell = pick(SPLAT.runs);
        U = tangentToward(n, [0, 0, -1]);
        shift = SPLAT.runShift;
      } else {
        cell = pick(SPLAT.round);
        U = randomTangent(n);
      }
      this.addDecal(this.splats, p, n, U, size, cell, shift, 0.25, true);
    }
  }

  /** A droplet hit the world. */
  land(pos, n, vel, size, flags, tint) {
    const floor = n[2] > 0.7;
    if (!floor && !(flags & F_DRIP) && Math.random() < 0.5) return;
    const vt = tangentToward(n, vel);
    const k = vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2];
    const sp = Math.hypot(vel[0] - n[0] * k, vel[1] - n[1] * k, vel[2] - n[2] * k);
    let cell, U, s, shift = 0;
    if (flags & F_DRIP) { cell = pick(DROP.drip); U = randomTangent(n); s = rnd(9, 14); }
    else if (sp > 140 || !floor) { cell = pick(DROP.dir); U = vt; s = size * rnd(6.5, 8.5); shift = DROP.dirShift; }
    else { cell = pick(DROP.round); U = randomTangent(n); s = size * rnd(5, 7); }
    this.addDecal(this.drops, pos, n, U, s, cell, shift, 0.3, false, tint);
  }

  /** Place one decal quad (U = texture +u direction on the surface). */
  addDecal(batch, p, n, U, size, cell, shift, lift, fit, tint = null) {
    const V = cross(n, U);
    let s = size;
    const c = [0, 0, 0];
    for (let tries = 0; ; tries++) {
      c[0] = p[0] + U[0] * shift * s; c[1] = p[1] + U[1] * shift * s; c[2] = p[2] + U[2] * shift * s;
      if (!fit || tries >= 3 || this.fits(c, n, U, V, s * 0.36)) break;
      s *= 0.72;
    }
    c[0] += n[0] * lift; c[1] += n[1] * lift; c[2] += n[2] * lift;
    const i = batch.alloc();
    batch.setQuad(i, c, U, V, s / 2, s / 2);
    batch.setCell(i, cell);
    batch.setColor(i, tint || this.lightAt(p, n), 1);
    return i;
  }

  /** Is there surface under the points ±U*r, ±V*r (no overhang past an edge)? */
  fits(c, n, U, V, r) {
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const T = k < 2 ? U : V, sg = k & 1 ? -r : r;
      for (let m = 0; m < 3; m++) {
        const q = c[m] + T[m] * sg;
        a[m] = q + n[m] * 3;
        b[m] = q - n[m] * 3;
      }
      const tr = this.collision.trace(a, b, ZERO, ZERO, MASK_SHOT, this.tr);
      if (tr.fraction >= 1 && !tr.startsolid) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- puddles
  /**
   * Spawn a blood puddle that spreads out over a few seconds.
   *   src  - a Player (follows the corpse: ragdoll / death pose / origin; while its
   *          ragdoll is still awake the pool keeps following for up to 5 s),
   *          a getter () => [x,y,z] | null (polled every 0.2 s for `follow` s), or [x,y,z]
   *   opts - { delay = 0.5, follow = 2, grow = 4..6 s, radius = 22..32, normal, head }
   *          (an array is taken as `normal`: then the position is used as the surface point)
   */
  puddle(src, opts = {}) {
    if (!this.enabled() || !src) return null;
    if (Array.isArray(opts)) opts = { normal: opts };
    let getter, alive = null, settling = null, head = !!opts.head;
    if (typeof src === 'function') getter = src;
    else if (Array.isArray(src)) { const p = src.slice(); getter = () => p; }
    else if (src.pm) {
      const lh = this.lastHit.get(src);
      head = head || !!(lh && lh.head && this.time - lh.t < 1);
      getter = this.corpseGetter(src, head);
      alive = () => src.alive;
      settling = () => !!(src.model?.ragdoll?.awake);
    } else return null;
    const e = {
      getter, alive, settling, normal: opts.normal ? norm3(opts.normal) : null,
      start: this.time + (opts.delay ?? 0.5), follow: opts.follow ?? 2, grow: opts.grow ?? rnd(4, 6),
      R: opts.radius ?? rnd(22, 32) * (head ? 0.85 : 1), r: 0, U: null,
      slot: -1, t0: 0, lastPoll: -1, pos: null, target: null, n: [0, 0, 1], fitPos: null, shift: [0, 0, 0],
    };
    this.puddles.push(e);
    return e;
  }

  /**
   * Where a corpse's blood collects: the chest (head for headshots) particle of its
   * ragdoll (src/game/ragdoll.js, model.ragdoll), else that bone of the posed model
   * (canned death animation), else the player's origin.
   */
  corpseGetter(p, head) {
    let bone = null;
    const v = this._v;
    return () => {
      const rd = p.model?.ragdoll;
      if (rd && !rd.removed && typeof rd.particle === 'function') return rd.particle(head ? RAG_HEAD : RAG_CHEST);
      const m = p.model;
      if (m?.object3D) {
        if (!bone || !bone.parent) bone = m.object3D.getObjectByName(head ? 'head' : 'chest') || null;
        if (bone && m.object3D.parent) {
          bone.getWorldPosition(v);
          this.group.worldToLocal(v);
          return [v.x, v.y, v.z];
        }
      }
      const o = p.pm.origin;
      return [o[0], o[1], o[2]];
    };
  }

  /** Floor under p: { pos, n } or null. */
  floorBelow(p, e) {
    if (e.normal) return { pos: p.slice(), n: e.normal };
    // start a little above the body point; again from higher up if that is inside a step
    for (const up of [12, 40]) {
      const a = [p[0], p[1], p[2] + up], b = [p[0], p[1], p[2] - 96];
      const tr = this.collision.trace(a, b, ZERO, ZERO, MASK_SHOT, this.tr);
      if (tr.startsolid) continue;
      if (tr.fraction >= 1 || tr.normal[2] < 0.6) return null;
      return { pos: tr.endpos.slice(), n: tr.normal.slice() };
    }
    return null;
  }

  /**
   * Fit a pool of radius <= R on the floor at pos without hanging over steps or
   * ledges: shrink it, and slide it away from an edge when that keeps it bigger.
   * Returns { pos, r }.
   */
  fitPool(pos, n, R) {
    const U = randomTangent(n), V = cross(n, U);
    const a = [0, 0, 0], b = [0, 0, 0], away = [0, 0, 0];
    const onFloor = (q) => {
      for (let m = 0; m < 3; m++) { a[m] = q[m] + n[m] * 3; b[m] = q[m] - n[m] * 3; }
      const tr = this.collision.trace(a, b, ZERO, ZERO, MASK_SHOT, this.tr);
      return tr.fraction < 1 || tr.startsolid; // inside a wall is fine: the wall hides that part
    };
    // rim test (the texture's lobes reach ~1.1 R); collects the direction of the misses
    const rim = (c, r) => {
      away[0] = away[1] = away[2] = 0;
      let miss = 0;
      const q = [0, 0, 0];
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        for (let m = 0; m < 3; m++) q[m] = c[m] + (U[m] * cs + V[m] * sn) * r * 1.1;
        if (!onFloor(q)) { miss++; for (let m = 0; m < 3; m++) away[m] -= U[m] * cs + V[m] * sn; }
      }
      return miss;
    };
    for (const f of [1, 0.8, 0.62, 0.48, 0.36]) {
      const r = R * f;
      const miss = rim(pos, r);
      if (!miss) return { pos: pos.slice(), r };
      if (miss < 8) {
        const l = Math.hypot(away[0], away[1], away[2]);
        if (l > 1e-3) {
          const sh = Math.min(0.6 * r, 14) / l;
          const c = [pos[0] + away[0] * sh, pos[1] + away[1] * sh, pos[2] + away[2] * sh];
          if (onFloor(c) && !rim(c, r)) return { pos: c, r };
        }
      }
    }
    return { pos: pos.slice(), r: R * 0.3 };
  }

  updatePuddles(dt) {
    const B = this.pools;
    for (let k = this.puddles.length - 1; k >= 0; k--) {
      const e = this.puddles[k];
      const drop = () => {
        if (e.slot >= 0 && B.owner[e.slot] === e) { B.setColor(e.slot, [0, 0, 0], 0); B.owner[e.slot] = null; }
        this.puddles.splice(k, 1);
      };
      if (e.alive && e.alive()) { drop(); continue; } // respawned: the body is gone
      if (this.time < e.start) continue;
      if (e.slot >= 0 && B.owner[e.slot] !== e) { this.puddles.splice(k, 1); continue; } // recycled
      const following = this.time < e.start + e.follow || (this.time < e.start + 5 && !!e.settling?.());
      if (e.slot < 0 || (following && this.time - e.lastPoll >= 0.2)) {
        e.lastPoll = this.time;
        const p = e.getter();
        const f = p && this.floorBelow(p, e);
        if (f) {
          const fp = e.fitPos;
          const refit = e.slot < 0 || Math.hypot(f.pos[0] - fp[0], f.pos[1] - fp[1], f.pos[2] - fp[2]) > 8;
          if (refit) {
            const fit = this.fitPool(f.pos, f.n, e.R);
            e.fitPos = f.pos;
            e.r = fit.r;
            e.shift = [fit.pos[0] - f.pos[0], fit.pos[1] - f.pos[1], fit.pos[2] - f.pos[2]];
          }
          e.target = [f.pos[0] + e.shift[0], f.pos[1] + e.shift[1], f.pos[2] + e.shift[2]];
          e.n = f.n;
          if (e.slot < 0) {
            e.slot = B.alloc(e);
            e.pos = e.target.slice();
            e.U = randomTangent(f.n);
            e.t0 = this.time;
            B.setCell(e.slot, Math.floor(Math.random() * POOL.cols * POOL.rows));
          }
          if (refit) B.setColor(e.slot, this.lightAt(e.target, f.n), 1);
        } else if (e.slot < 0 && !following) { this.puddles.splice(k, 1); continue; }
      }
      if (e.slot < 0) continue;
      // the pool slides along with a body that is still settling
      const s = 1 - Math.exp(-6 * dt);
      for (let m = 0; m < 3; m++) e.pos[m] += (e.target[m] - e.pos[m]) * s;
      const t = clamp((this.time - e.t0) / e.grow, 0, 1);
      const ease = 1 - Math.pow(1 - t, 2.2);
      const scale = 0.8 + 0.2 * ease;
      const half = (e.r / POOL.radiusFrac) * scale * 0.5;
      const U = tangentToward(e.n, e.U), V = cross(e.n, U);
      const c = [e.pos[0] + e.n[0] * 0.2, e.pos[1] + e.n[1] * 0.2, e.pos[2] + e.n[2] * 0.2];
      B.setQuad(e.slot, c, U, V, half, half);
      B.setProg(e.slot, 0.04 + 1.06 * ease);
      if (t >= 1 && !following) this.puddles.splice(k, 1); // finished: stays as a static decal
    }
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    const r = this.game.renderer;
    if (r?.camera && r.viewport?.rh) this.parts.material.uniforms.pxScale.value = 2 * Math.tan(r.camera.fov * Math.PI / 360) / r.viewport.rh;
    this.parts.update(dt);
    if (this.puddles.length) this.updatePuddles(dt);
    this.pools.flush();
    this.splats.flush();
    this.drops.flush();
  }

  clear() {
    this.parts.clear();
    this.pools.clear();
    this.splats.clear();
    this.drops.clear();
    this.puddles.length = 0;
  }
}
