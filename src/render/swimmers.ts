/**
 * Aquatic life on worlds with complex biospheres and open seas of water,
 * brine, ammonia or hydrocarbons.
 *
 * Breathers — large air-breathing swimmers, where the air holds oxygen. Pods
 * cruise along a loop in deep water, submerged most of the time, and surface
 * in bouts of a few breaths. Each roll arches the back through the surface
 * (the opaque sea hides what is below) with a blow of spray. The last roll of
 * a bout is a deep dive that lifts the flukes clear.
 * Baskers — where the air is unbreathable, broad flat swimmers rise to bask
 * at the surface instead.
 * Leapers — schools of small, fast swimmers that leap clear of the water in
 * ballistic arcs. Launch speed is set by muscle, not gravity, so a leap rises
 * h = (v sin θ)² / 2g: higher and longer on low-gravity worlds.
 *
 * Motion is a pure function of time, placed deterministically per 700-m
 * cell, and pods keep to water deeper than ~10 m. Animals close to the
 * observer stay down.
 */
import * as THREE from 'three';
import type { Body } from '../astro/body';
import type { SurfaceGenerator } from '../terrain/surface';
import { Rng, seedOf } from '../core/rng';
import { faceToDir } from '../terrain/cubesphere';
import { dirToFace } from './scatter';
import { PRE_EXPOSURE_GLSL, PRE_EXPOSURE_TEX } from './exposure';

const QPI = Math.PI / 4;
const CELL = 700;
const SWIM_LIQUIDS = new Set(['water', 'brine', 'ammonia', 'methane']);
const SPRAY_CAP = 2000;

/** Spray and breath condensate: soft alpha-blended sprites sized in metres, lit by the local daylight. */
const SPRAY_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize;
attribute float aAlpha;
uniform float uViewH;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aSize * projectionMatrix[1][1] * 0.5 * uViewH / max(-mv.z, 0.05);
  vAlpha = aAlpha * min(1.0, px * px / 4.0); // sub-pixel puffs fade rather than flicker
  gl_PointSize = clamp(px, 1.0, 128.0);
  #include <logdepthbuf_vertex>
}
`;
const SPRAY_FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; // radiance (scene units)
${PRE_EXPOSURE_GLSL}
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord - 0.5;
  float a = vAlpha * smoothstep(0.25, 0.0, dot(c, c));
  if (a <= 0.003) discard;
  gl_FragColor = vec4(uColor * uPreExposure * a, a);
}
`;

export type SwimKind = 'breather' | 'basker' | 'leaper';

export interface SwimSpecies {
  kind: SwimKind;
  length: number;     // m
  height: number;     // body depth (m)
  speed: number;      // cruising speed (m/s)
  color: THREE.Color;
  pod: [number, number];
  /** vertical launch speed of a leap (m/s) */
  leapV: number;
}

interface Member {
  a: number;      // phase along the loop (rad)
  dr: number;     // lane offset (fraction of the loop radius)
  t0: number;     // schedule offset (s)
  period: number; // leap period (leapers) or bout offset jitter
}

export interface Pod {
  sp: number;
  centre: THREE.Vector3;  // unit direction of the loop centre (planet-fixed)
  radius: number;         // loop radius (m)
  dir: number;            // ±1
  cycle: number;          // breathing cycle (s)
  members: Member[];
}

/** Where a swimmer is at a given time: height of its centre above the liquid surface and pitch (nose up > 0). */
export interface SwimState {
  y: number;
  pitch: number;
  /** time since the start of the current surfacing roll or leap (s), or −1 */
  tau: number;
  /** duration of that roll or leap (s) */
  dur: number;
  /** breathers: index of the roll within the bout; leapers: 0 */
  roll: number;
}

/** Vertical motion of one pod member at time t (pure function, for rendering and tests). */
export function swimState(sp: SwimSpecies, pod: Pod, m: Member, t: number, g: number, out: SwimState): SwimState {
  const L = sp.length;
  out.tau = -1; out.dur = 0; out.roll = 0;
  if (sp.kind === 'leaper') {
    const dur = (2 * sp.leapV) / g;
    const tt = (((t + m.t0) % m.period) + m.period) % m.period;
    if (tt < dur) {
      out.y = sp.leapV * tt - 0.5 * g * tt * tt;
      out.pitch = Math.atan2(sp.leapV - g * tt, sp.speed);
      out.tau = tt; out.dur = dur;
    } else { out.y = -2 * L; out.pitch = 0; }
    return out;
  }
  const tc = (((t + m.t0) % pod.cycle) + pod.cycle) % pod.cycle;
  if (sp.kind === 'basker') {
    // rise, bask, sink
    const up = Math.min(1, tc / 4) * Math.min(1, Math.max(0, (pod.cycle * 0.45 - tc) / 4));
    out.y = -L * 0.5 + up * (L * 0.5 - sp.height * 0.32);
    out.pitch = 0;
    if (up > 0) { out.tau = tc; out.dur = pod.cycle * 0.45; }
    return out;
  }
  // breather: bouts of `breaths` rolls, 7 s apart, at the start of each cycle
  const breaths = 4, gap = 7, roll = 2.6;
  const k = Math.floor(tc / gap);
  const s = (tc - k * gap) / roll;
  if (k < breaths && s < 1) {
    const last = k === breaths - 1;
    // the centre peaks just below the surface, so only the back (a third of the body depth) shows
    out.y = -0.25 * L + (0.25 * L - 0.15 * sp.height) * Math.sin(Math.PI * s);
    // nose up as it breaks the surface, nose down as it goes under; a steep fluke-up dive to end the bout
    out.pitch = last ? 0.3 * Math.cos(Math.PI * s) - 1.1 * Math.max(0, s - 0.45) / 0.55 : 0.3 * Math.cos(Math.PI * s);
    out.tau = s * roll; out.dur = roll; out.roll = k;
  } else { out.y = -L; out.pitch = 0; }
  return out;
}

/** Unit-height swimmer geometry (body depth 1, length = aspect along +Z, nose at −Z). */
function swimmerGeometry(kind: SwimKind, aspect: number, rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const ell = (rx: number, ry: number, rz: number, x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0) => {
    const s = new THREE.SphereGeometry(0.5, kind === 'leaper' ? 10 : 18, kind === 'leaper' ? 7 : 12);
    s.scale(rx * 2, ry * 2, rz * 2);
    s.rotateX(rotX); s.rotateY(rotY); s.rotateZ(rotZ);
    s.translate(x, y, z);
    parts.push(s);
  };
  const A = aspect;
  if (kind === 'basker') {
    ell(A * 0.45, 0.5, A * 0.5, 0, 0, 0);                    // broad disc
    ell(A * 0.04, 0.35, A * 0.12, 0, 0.45, A * 0.1, -0.5);   // keel fin
  } else {
    ell(0.55, 0.5, A * 0.5, 0, 0, 0);                        // fusiform body
    const vertical = kind === 'leaper' ? rng.chance(0.7) : rng.chance(0.25);
    if (vertical) {
      ell(0.04, 0.7, A * 0.07, 0, 0.35, A * 0.53, -0.5);
      ell(0.04, 0.7, A * 0.07, 0, -0.35, A * 0.53, 0.5);
    } else for (const side of [-1, 1]) ell(A * 0.12, 0.04, A * 0.05, side * A * 0.1, 0, A * 0.52, 0, side * 0.5); // flukes: span ≈ L/3
    if (rng.chance(0.75)) ell(0.04, 0.45, A * 0.08, 0, 0.55, A * 0.05, -0.6);                          // dorsal fin
    for (const side of [-1, 1]) ell(0.45, 0.04, A * 0.06, side * 0.45, -0.2, -A * 0.18, 0, -side * 0.5); // pectoral fins
  }
  // merge, keeping the smooth normals of each part
  let n = 0;
  const flat = parts.map((p) => { const q = p.toNonIndexed(); p.dispose(); n += q.attributes.position.count; return q; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of flat) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    o += p.attributes.position.count;
    p.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geo;
}

const hash = (a: number, b: number, c: number) => {
  const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return x - Math.floor(x);
};

export class Swimmers {
  readonly group = new THREE.Group();
  readonly species: SwimSpecies[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private spray: THREE.Points;
  private sprayMat: THREE.ShaderMaterial;
  private cells = new Map<string, Pod[]>();
  private anchor = new THREE.Vector3();
  count = 0;
  sprayCount = 0;

  constructor(readonly body: Body, material: THREE.ShaderMaterial) {
    const pl = body.planet!;
    const sf = pl.surface;
    const ok = pl.life.kind === 'complex' && !(body.known && body.name === 'Earth') && !!sf && SWIM_LIQUIDS.has(pl.liquid) && sf.oceanFraction > 0.05;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPRAY_CAP * 3), 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(SPRAY_CAP), 1).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(SPRAY_CAP), 1).setUsage(THREE.DynamicDrawUsage));
    sg.setDrawRange(0, 0);
    this.sprayMat = new THREE.ShaderMaterial({
      vertexShader: SPRAY_VERT, fragmentShader: SPRAY_FRAG, transparent: true, depthWrite: false, blending: THREE.NormalBlending,
      uniforms: { uColor: { value: new THREE.Vector3() }, uViewH: { value: 1080 }, tPreExposure: PRE_EXPOSURE_TEX },
    });
    this.spray = new THREE.Points(sg, this.sprayMat);
    this.spray.frustumCulled = false;
    const vh = new THREE.Vector2();
    this.spray.onBeforeRender = (r) => { this.sprayMat.uniforms.uViewH.value = r.getDrawingBufferSize(vh).y; };
    this.group.add(this.spray);
    if (!ok) return;
    const rng = new Rng(seedOf(sf.seed, 'swimmers'));
    const o2 = pl.atmosphere?.composition.O2 ?? 0;
    const pal = sf.palette;
    const deep = new THREE.Color(pal.liquidDeep[0], pal.liquidDeep[1], pal.liquidDeep[2]);
    const kinds: SwimKind[] = [o2 > 0.01 ? 'breather' : 'basker'];
    if (rng.chance(0.8)) kinds.push('leaper');
    for (const kind of kinds) {
      const base = rng.pick([pal.rockA, pal.rockB, pal.highland, pal.veg2]);
      const col = new THREE.Color(base[0], base[1], base[2]);
      if (kind === 'leaper') col.lerp(new THREE.Color(0.75, 0.78, 0.8), 0.5).multiplyScalar(rng.range(1, 1.4)); // silvery
      else col.lerp(deep, 0.35).multiplyScalar(rng.range(0.6, 1));
      col.offsetHSL(rng.range(-0.15, 0.15), rng.range(-0.1, 0.15), 0);
      const length = kind === 'breather' ? rng.range(5, 20) : kind === 'basker' ? rng.range(2, 6) : rng.range(0.4, 1.5);
      const aspect = kind === 'basker' ? rng.range(0.9, 1.3) * 3 : rng.range(4.2, 6.5);
      const sp: SwimSpecies = {
        kind, length, height: length / aspect,
        speed: kind === 'breather' ? rng.range(1.5, 3) : kind === 'basker' ? rng.range(0.4, 1) : rng.range(3, 6),
        color: col,
        pod: kind === 'breather' ? [2, 6] : kind === 'basker' ? [1, 4] : [6, 24],
        // muscle sets the launch speed (≈ flying fish and dolphins: 4–8 m/s), not gravity
        leapV: kind === 'leaper' ? 2.6 + 2.2 * Math.sqrt(length) : 0,
      };
      this.species.push(sp);
      this.meshes.push(this.mk(swimmerGeometry(kind, aspect, rng.fork(kind)), material, kind === 'leaper' ? 400 : 120));
    }
  }

  private mk(geo: THREE.BufferGeometry, material: THREE.ShaderMaterial, cap: number) {
    const m = new THREE.InstancedMesh(geo, material, cap);
    m.count = 0;
    m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.userData.nearShadowOnly = true;
    this.group.add(m);
    return m;
  }

  get hasSwimmers() {
    return this.species.length > 0;
  }

  /** Pods in one cell of a cube face (deterministic; empty over land or shallows). */
  spawn(gen: SurfaceGenerator, face: number, ci: number, cj: number): Pod[] {
    const R = this.body.radius;
    const sea = gen.liquidLevel();
    if (sea === -Infinity || !this.species.length) return [];
    const rng = new Rng(seedOf(this.body.planet!.surface!.seed, 'pod', face, ci, cj));
    if (!rng.chance(0.6)) return [];
    const da = CELL / (R * QPI);
    const d = [0, 0, 0];
    faceToDir(face, (ci + rng.next()) * da, (cj + rng.next()) * da, d);
    const c = new THREE.Vector3(d[0], d[1], d[2]);
    const depth = (v: THREE.Vector3) => { const s = gen.sample(v.x, v.y, v.z, 10); return sea - s.height; };
    if (depth(c) < 15) return [];
    const s0 = gen.sample(c.x, c.y, c.z, 10);
    if (s0.temp < gen.freezeT - 2 || s0.temp > gen.boilT - 5) return []; // frozen over or boiling
    const si = rng.int(0, this.species.length - 1);
    const sp = this.species[si];
    // a loop that stays in deep water
    const east = new THREE.Vector3(-c.z, 0, c.x);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = new THREE.Vector3().crossVectors(c, east);
    let radius = rng.range(60, 220) * (sp.kind === 'leaper' ? 0.7 : 1);
    const v = new THREE.Vector3();
    for (let tries = 0; tries < 3; tries++) {
      let shallow = false;
      for (let k = 0; k < 8 && !shallow; k++) {
        const a = (k / 8) * Math.PI * 2;
        v.copy(c).multiplyScalar(R).addScaledVector(east, Math.cos(a) * radius * 1.3).addScaledVector(north, Math.sin(a) * radius * 1.3).normalize();
        shallow = depth(v) < 10;
      }
      if (!shallow) break;
      radius *= 0.45;
      if (tries === 2 || radius < 20) return [];
    }
    const n = rng.int(sp.pod[0], sp.pod[1]);
    const members: Member[] = Array.from({ length: n }, () => ({
      a: rng.normal(0, sp.kind === 'leaper' ? 0.12 : 0.05) * (220 / radius),
      dr: rng.normal(0, sp.kind === 'leaper' ? 0.04 : 0.02),
      t0: rng.range(0, sp.kind === 'leaper' ? 30 : 2),
      period: rng.range(4, 12),
    }));
    return [{ sp: si, centre: c, radius, dir: rng.chance(0.5) ? 1 : -1, cycle: sp.kind === 'basker' ? rng.range(50, 90) : rng.range(45, 80), members }];
  }

  /** Path position (planet-fixed, on the liquid surface) and heading of a member at time t. */
  pathAt(pod: Pod, m: Member, t: number, sea: number, pos: THREE.Vector3, fwd: THREE.Vector3) {
    const sp = this.species[pod.sp];
    const c = pod.centre;
    const east = _e.set(-c.z, 0, c.x);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = _n.crossVectors(c, east);
    const ang = m.a + (sp.speed / pod.radius) * pod.dir * t;
    const r = pod.radius * (1 + m.dr);
    pos.copy(c).multiplyScalar(this.body.radius).addScaledVector(east, Math.cos(ang) * r).addScaledVector(north, Math.sin(ang) * r);
    const up = _u.copy(pos).normalize();
    pos.copy(up).multiplyScalar(this.body.radius + sea);
    fwd.copy(east).multiplyScalar(-Math.sin(ang)).addScaledVector(north, Math.cos(ang)).multiplyScalar(pod.dir);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  }

  /** light: daylight illuminance at the observer (scene units), for the spray. */
  update(gen: SurfaceGenerator | null, camBody: THREE.Vector3, time: number, enabled: boolean, light: THREE.Vector3 | null = null) {
    const R = this.body.radius;
    const sea = gen ? gen.liquidLevel() : -Infinity;
    const want = enabled && !!gen && this.species.length > 0 && sea > -Infinity && camBody.length() - R - sea < 3000;
    this.group.visible = want;
    if (!want || !gen) { this.cells.clear(); this.count = this.sprayCount = 0; return; }
    const f = dirToFace(_v.copy(camBody).normalize());
    const da = CELL / (R * QPI);
    const ci = Math.floor(f.a / da), cj = Math.floor(f.b / da);
    const needed = new Set<string>();
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const key = `${f.face}:${ci + di}:${cj + dj}`;
        needed.add(key);
        if (!this.cells.has(key)) this.cells.set(key, this.spawn(gen, f.face, ci + di, cj + dj));
      }
    for (const k of this.cells.keys()) if (!needed.has(k)) this.cells.delete(k);
    if (this.anchor.distanceTo(camBody) > 1500 || this.anchor.lengthSq() === 0) this.anchor.copy(camBody);
    const g = this.body.planet!.gravity;
    const counts = this.meshes.map(() => 0);
    let ns = 0;
    const pos = new THREE.Vector3(), fwd = new THREE.Vector3(), up = new THREE.Vector3(), right = new THREE.Vector3();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const basis = new THREE.Matrix4(), X = new THREE.Vector3(1, 0, 0);
    const st: SwimState = { y: 0, pitch: 0, tau: -1, dur: 0, roll: 0 };
    const o2 = (this.body.planet!.atmosphere?.composition.O2 ?? 0) > 0.01;
    const sp3 = this.spray.geometry.attributes.position.array as Float32Array;
    const sSize = this.spray.geometry.attributes.aSize.array as Float32Array;
    const sAlpha = this.spray.geometry.attributes.aAlpha.array as Float32Array;
    const drop = (x: THREE.Vector3, size: number, alpha: number) => {
      if (ns >= SPRAY_CAP) return;
      p.copy(x).sub(this.anchor);
      sp3[ns * 3] = p.x; sp3[ns * 3 + 1] = p.y; sp3[ns * 3 + 2] = p.z;
      sSize[ns] = size;
      sAlpha[ns] = alpha;
      ns++;
    };
    for (const pods of this.cells.values()) for (const pod of pods) {
      const sp = this.species[pod.sp];
      const mesh = this.meshes[pod.sp];
      const cap = sp.kind === 'leaper' ? 400 : 120;
      for (let i = 0; i < pod.members.length; i++) {
        const mb = pod.members[i];
        swimState(sp, pod, mb, time, g, st);
        if (st.y < -0.55 * sp.length) continue; // well below the surface: hidden by the sea
        this.pathAt(pod, mb, time, sea, pos, fwd);
        if (pos.distanceTo(camBody) < 4 + 2 * sp.length) continue; // shy of the observer: stays down
        up.copy(pos).normalize();
        right.crossVectors(fwd, up).normalize();
        basis.makeBasis(right, up, _v.copy(fwd).negate()); // nose along −Z
        q.setFromRotationMatrix(basis).multiply(qp.setFromAxisAngle(X, st.pitch));
        const centre = _c.copy(pos).addScaledVector(up, st.y);
        if (counts[pod.sp] < cap) {
          m4.compose(p.copy(centre).sub(this.anchor), q, sc.setScalar(sp.height));
          mesh.setMatrixAt(counts[pod.sp], m4);
          mesh.setColorAt(counts[pod.sp], sp.color);
          counts[pod.sp]++;
        }
        if (st.tau < 0) continue;
        // spray: the blow of a breath, or the splash of a leap leaving and re-entering the water
        const seed = i * 7.31 + pod.radius;
        if (sp.kind === 'breather' && o2 && st.tau < 2.2) {
          const nose = _w.set(0, 0, -0.42 * sp.length).applyQuaternion(q).add(centre);
          nose.addScaledVector(up, sea + R - nose.length()); // blowholes clear the surface as the roll begins
          // a plume of condensing breath: puffs launched over half a second, slowed by drag, spreading as they rise
          const vUp = 6 + 0.3 * sp.length, k = 1.6;
          for (let j = 0; j < 40; j++) {
            const tt = st.tau - hash(j, seed, st.roll) * 0.5;
            if (tt < 0) continue;
            const v = vUp * (0.55 + 0.45 * hash(seed, j, 11));
            const h = (v / k) * (1 - Math.exp(-k * tt)) - 0.25 * g * tt * tt;
            if (h < 0) continue;
            const spread = (0.15 + 0.9 * tt) * hash(j, 17, seed) * (0.6 + 0.02 * sp.length);
            const ang = hash(j, seed, 3) * Math.PI * 2;
            drop(_d.copy(nose).addScaledVector(up, h).addScaledVector(right, Math.cos(ang) * spread).addScaledVector(fwd, Math.sin(ang) * spread),
              (0.35 + 0.04 * sp.length) * (0.5 + 1.5 * tt), 0.35 * Math.max(0, 1 - tt / 2.2));
          }
        } else if (sp.kind === 'leaper') {
          for (const [t0, sgn] of [[0, -1], [st.dur, 1]] as const) {
            const tt = st.tau - t0;
            if (tt < 0 || tt > 0.7) continue;
            const at = _w.copy(pos).addScaledVector(fwd, sgn * 0.3 * sp.length);
            for (let k = 0; k < 10; k++) {
              const ang = hash(k, seed, t0) * Math.PI * 2, vh = 0.8 + 1.6 * hash(seed, k, 5), vz = 1.2 + 1.8 * hash(k, 9, seed);
              const h = vz * tt - 0.5 * g * tt * tt;
              if (h < 0) continue;
              drop(_d.copy(at).addScaledVector(up, h).addScaledVector(right, Math.cos(ang) * vh * tt).addScaledVector(fwd, Math.sin(ang) * vh * tt), 0.06 + 0.04 * sp.length, 0.8 * (1 - tt / 0.7));
            }
          }
        }
      }
    }
    this.count = 0;
    this.meshes.forEach((m, k) => { m.count = counts[k]; this.count += counts[k]; });
    this.sprayCount = ns;
    const sg = this.spray.geometry;
    sg.setDrawRange(0, ns);
    for (const k of ['position', 'aSize', 'aAlpha']) sg.attributes[k].needsUpdate = true;
    this.spray.position.copy(this.anchor);
    // condensate and droplets scatter the daylight (albedo ≈ 0.9, forward-scattering a little brighter)
    if (light) this.sprayMat.uniforms.uColor.value.copy(light).multiplyScalar(1.1 / Math.PI);
    for (const m of this.meshes) {
      m.position.copy(this.anchor);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.spray.geometry.dispose();
    this.sprayMat.dispose();
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();
const _e = new THREE.Vector3(), _n = new THREE.Vector3(), _u = new THREE.Vector3();
