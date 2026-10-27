// Spray paint: freehand graffiti on any wall, floor or ceiling. Each burst
// lays down speckled dots (dithered like the rest of the frame); heavy paint on
// a wall starts to run. Dots are vertex lit with the same baked light, the
// flashlight and fog as the world, so tags sit in the scene like the old ones.
import * as THREE from 'three';
import { T, F, GW, ci, cj, CELL, GX0, GZ0 } from './plan.js';
import { LAMP_AVG } from './lighting.js';

export const SPRAY_COLORS = [
  { name: 'RED', rgb: [0.72, 0.1, 0.08] },
  { name: 'BLACK', rgb: [0.07, 0.07, 0.08] },
  { name: 'WHITE', rgb: [0.86, 0.85, 0.8] },
  { name: 'YELLOW', rgb: [0.88, 0.72, 0.12] },
  { name: 'BLUE', rgb: [0.12, 0.26, 0.7] },
  { name: 'GREEN', rgb: [0.16, 0.52, 0.2] },
];

const CAP = 6000; // dots per floor (ring buffer: the oldest paint is reused)
const RANGE = 2.2;

const vert = /* glsl */ `
in vec4 aColor;   // rgb + solidity (1 = drips, solid)
in vec3 aLight;   // baked light at the spot
uniform vec3 uFlashPos;
uniform vec3 uFlashDir;
uniform vec3 uFlashColor;
uniform float uFlashOn;
uniform float uFlashRange;
uniform vec2 uFlashCone;
uniform vec2 uSnap;
uniform float uJitter;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBrightness;
out vec2 vUv;
out vec4 vColor;
out float vFog;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec4 vp = viewMatrix * wp;
  vec4 cp = projectionMatrix * vp;
  vec3 light = aLight;
  if (uFlashOn > 0.001) {
    vec3 tv = wp.xyz - uFlashPos;
    float d = length(tv);
    vec3 L = tv / max(d, 0.001);
    float spot = smoothstep(uFlashCone.y, uFlashCone.x, dot(L, uFlashDir));
    float att = clamp(1.0 - d / uFlashRange, 0.0, 1.0);
    float ndl = clamp(dot(normal, -L) * 0.8 + 0.2, 0.0, 1.0);
    light += uFlashColor * uFlashOn * ndl * (spot * att * att * 1.7 + clamp(1.0 - d / 3.5, 0.0, 1.0) * 0.12);
  }
  vColor = vec4(aColor.rgb * light * uBrightness, aColor.a);
  vFog = smoothstep(uFogNear, uFogFar, -vp.z);
  if (uJitter > 0.5 && cp.w > 0.0) {
    vec2 ndc = floor(cp.xy / cp.w * uSnap + 0.5) / uSnap;
    cp.xy = ndc * cp.w;
  }
  gl_Position = cp;
  vUv = uv;
}
`;

const frag = /* glsl */ `
uniform vec3 uFogColor;
in vec2 vUv;
in vec4 vColor;
in float vFog;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // dense core, speckled overspray toward the edge
  float keep = mix(1.0 - r * r * r, 1.0, vColor.a);
  if (hash(floor(gl_FragCoord.xy) + vUv * 3.1) > keep) discard;
  fragColor = vec4(mix(vColor.rgb, uFogColor, vFog), 1.0);
}
`;

class FloorPaint {
  constructor(k, material) {
    this.k = k;
    this.count = 0;
    this.head = 0;
    const g = new THREE.BufferGeometry();
    const n = CAP * 4;
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.nrm = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.uv = new THREE.BufferAttribute(new Float32Array(n * 2), 2);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4), 4);
    this.lit = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    for (const a of [this.pos, this.nrm, this.uv, this.col, this.lit]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nrm);
    g.setAttribute('uv', this.uv);
    g.setAttribute('aColor', this.col);
    g.setAttribute('aLight', this.lit);
    const idx = new Uint16Array(CAP * 6);
    for (let i = 0; i < CAP; i++) {
      // CAP*4 < 65536 so 16-bit indices are enough
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }

  // centre c, normal n, in-plane axes u/v (already scaled), colour, light
  add(c, n, u, v, rgb, solid, light) {
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    this.count = Math.min(CAP, this.count + 1);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let q = 0; q < 4; q++) {
      const [a, b] = corners[q];
      const vi = i * 4 + q;
      this.pos.setXYZ(vi, c.x + u.x * a + v.x * b, c.y + u.y * a + v.y * b, c.z + u.z * a + v.z * b);
      this.nrm.setXYZ(vi, n.x, n.y, n.z);
      this.uv.setXY(vi, a, b);
      this.col.setXYZW(vi, rgb[0], rgb[1], rgb[2], solid);
      this.lit.setXYZ(vi, light[0], light[1], light[2]);
    }
    this.dirtyFrom = Math.min(this.dirtyFrom, i);
    this.dirtyTo = Math.max(this.dirtyTo, i);
  }

  flush() {
    if (this.dirtyTo < 0) return;
    const from = this.dirtyFrom * 4, cnt = (this.dirtyTo - this.dirtyFrom + 1) * 4;
    for (const [a, s] of [[this.pos, 3], [this.nrm, 3], [this.uv, 2], [this.col, 4], [this.lit, 3]]) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * s, cnt * s);
      a.needsUpdate = true;
    }
    this.mesh.geometry.setDrawRange(0, this.count * 6);
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
  }
}

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

export class SprayPaint {
  constructor(level, baker, doors, worldMaterial, scene) {
    this.level = level;
    this.baker = baker;
    this.doors = doors;
    const wu = worldMaterial.uniforms;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: vert,
      fragmentShader: frag,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // share the world's live uniforms (flashlight, fog, jitter, brightness)
      uniforms: {
        uFlashPos: wu.uFlashPos, uFlashDir: wu.uFlashDir, uFlashColor: wu.uFlashColor, uFlashOn: wu.uFlashOn,
        uFlashRange: wu.uFlashRange, uFlashCone: wu.uFlashCone, uSnap: wu.uSnap, uJitter: wu.uJitter,
        uFogNear: wu.uFogNear, uFogFar: wu.uFogFar, uFogColor: wu.uFogColor, uBrightness: wu.uBrightness,
      },
    });
    this.floors = new Map();
    for (const k of [-1, 0, 1]) {
      const f = new FloorPaint(k, this.material);
      this.floors.set(k, f);
      scene.add(f.mesh);
    }
    this.color = 0;
    this.density = new Map();
    this.carry = 0;
    this.lastHit = null;
    this.layer = 0;
    this.shade = {};
  }

  setVisible(camF, vertical) {
    for (const f of this.floors.values()) f.mesh.visible = vertical || f.k === camF;
  }

  // Is point q inside something paintable? Returns a normal (into _n) or false.
  solidAt(q, prev) {
    const L = this.level;
    // bias so a point just under a floor still belongs to that floor's grid
    const k = Math.max(-1, Math.min(1, Math.floor((q.y + 0.25) / 4)));
    const g = L.grid(k);
    const i = ci(q.x), j = cj(q.z);
    const t = g.at(i, j);
    if (t === T.OUT || t === T.SOLID || t === T.WINDOW) {
      // wall: pick the cell face the ray came through
      const x0 = GX0 + i * CELL, z0 = GZ0 + j * CELL;
      // how far the (outside) previous point lies beyond each face of the cell
      const faces = [[x0 - prev.x, -1, 0], [prev.x - x0 - CELL, 1, 0], [z0 - prev.z, 0, -1], [prev.z - z0 - CELL, 0, 1]];
      let best = faces[0];
      for (const f of faces) if (f[0] > best[0]) best = f;
      _n.set(best[1], 0, best[2]);
      return true;
    }
    const n = j * GW + i;
    const yRel = q.y - g.base;
    let hasFloor = t === T.FLOOR || t === T.DOOR;
    let hasCeil = hasFloor;
    if (t === T.STAIR || t === T.SHAFT) {
      hasFloor = !!(g.flag[n] & F.HASFLOOR);
      hasCeil = !!(g.flag[n] & F.HASCEIL);
    }
    const hi = g.hi[n] + (g.flag[n] & F.HOLE && t === T.FLOOR ? 0.7 : 0);
    if (hasFloor && yRel < g.lo[n]) return _n.set(0, 1, 0), true;
    if (hasCeil && yRel > hi) return _n.set(0, -1, 0), true;
    // stair landings and flights
    const bl = L.surfBucket.get(Math.floor(q.x / 2) * 1000 + Math.floor(q.z / 2));
    if (bl)
      for (const s of bl) {
        if (q.x < s.x0 || q.x > s.x1 || q.z < s.z0 || q.z > s.z1) continue;
        const y = s.ramp ? s.ya + ((s.yb - s.ya) * (q.z - s.z0)) / (s.z1 - s.z0) : s.y;
        if (q.y <= y && q.y > y - 0.25) return _n.set(0, prev.y > y ? 1 : -1, 0), true;
      }
    return false;
  }

  hitsDoor(q) {
    for (const c of this.doors.colliders) {
      if (q.x > c.x0 && q.x < c.x1 && q.y > c.y0 && q.y < c.y1 && q.z > c.z0 && q.z < c.z1) return true;
    }
    return false;
  }

  // March along the ray, then bisect to the surface.
  raycast(origin, dir) {
    _p0.copy(origin);
    const step = 0.04;
    for (let t = step; t <= RANGE; t += step) {
      _q.copy(origin).addScaledVector(dir, t);
      if (this.hitsDoor(_q)) return null;
      if (this.solidAt(_q, _p0)) {
        let a = t - step, b = t;
        for (let it = 0; it < 7; it++) {
          const m = (a + b) / 2;
          _q.copy(origin).addScaledVector(dir, m);
          if (this.solidAt(_q, _p0)) b = m;
          else {
            a = m;
            _p0.copy(_q);
          }
        }
        _q.copy(origin).addScaledVector(dir, a);
        this.solidAt(_c.copy(origin).addScaledVector(dir, b), _q);
        return { p: _q.clone(), n: _n.clone(), t: a };
      }
      _p0.copy(_q);
    }
    return null;
  }

  lightAt(p, n) {
    const s = this.baker.shade(p.x, p.y, p.z, n.x, n.y, n.z, this.shade);
    const a = s.dyn ? LAMP_AVG[s.dyn.behavior] ?? 1 : 0;
    return [s.r + s.dr * a, s.g + s.dg * a, s.b + s.db * a];
  }

  // Called every simulation step while the trigger is held.
  spray(dt, origin, forward) {
    const col = SPRAY_COLORS[this.color].rgb;
    this.carry += dt * 70;
    let any = false;
    while (this.carry >= 1) {
      this.carry -= 1;
      // jitter the nozzle direction: a tight cone with a soft halo
      const spread = Math.random() < 0.8 ? 0.028 : 0.06;
      _d.set(forward.x + gauss() * spread, forward.y + gauss() * spread, forward.z + gauss() * spread).normalize();
      const hit = this.raycast(origin, _d);
      if (!hit) continue;
      any = true;
      this.place(hit, col, hit.t);
    }
    return any;
  }

  // Upload this frame's new dots (once per frame, before rendering).
  commit() {
    for (const f of this.floors.values()) f.flush();
  }

  place(hit, col, dist) {
    const { p, n } = hit;
    const k = Math.max(-1, Math.min(1, Math.floor((p.y + 0.25) / 4)));
    const f = this.floors.get(k);
    // tangent frame on the surface
    if (Math.abs(n.y) > 0.7) _u.set(1, 0, 0);
    else _u.set(-n.z, 0, n.x);
    _v.crossVectors(n, _u).normalize();
    const size = (0.018 + dist * 0.018) * (0.7 + Math.random() * 0.6);
    this.layer = (this.layer + 1) % 64;
    _c.copy(p).addScaledVector(n, 0.016 + this.layer * 0.00015);
    const light = this.lightAt(p, n);
    const shade = 0.92 + Math.random() * 0.12;
    const rgb = [col[0] * shade, col[1] * shade, col[2] * shade];
    f.add(_c, n, _u.clone().multiplyScalar(size), _v.clone().multiplyScalar(size), rgb, 0, light);
    // build-up on walls makes the paint run
    if (Math.abs(n.y) < 0.3) {
      const key = `${k}:${Math.round(p.x * 14)}:${Math.round(p.y * 14)}:${Math.round(p.z * 14)}`;
      const c = (this.density.get(key) || 0) + 1;
      this.density.set(key, c);
      if (c > 9 && c % 6 === 0 && Math.random() < 0.6) {
        const len = 0.07 + Math.random() * 0.3;
        const w = 0.006 + Math.random() * 0.007;
        _c.copy(p).addScaledVector(n, 0.017 + this.layer * 0.00015);
        _c.y -= len / 2;
        f.add(_c, n, _u.clone().multiplyScalar(w), new THREE.Vector3(0, len / 2, 0), rgb, 1, light);
      }
      if (this.density.size > 20000) this.density.clear();
    }
  }

  cycle(d) {
    this.color = (this.color + d + SPRAY_COLORS.length) % SPRAY_COLORS.length;
  }
}

function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}
