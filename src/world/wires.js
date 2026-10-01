// Overhead wires: catenaries built from thin square-section segments (blocky
// but sub-pixel at a distance), swaying with the shared wind in the vertex
// shader. The dense web between poles and buildings is what makes the sky
// strip of an alley read as an alley.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { GLSL_COMMON, shared, patch } from '../render/shaderlib.js';
import { POLES } from './layout.js';
import { LAYER_REFLECT } from './units.js';

/** Attachment heights per pole (relative to its height). */
export function poleAnchors(P) {
  const top = P.height;
  const dir = P.x > 0 ? -1 : 1; // toward the alley centre
  return {
    primary: [0, 1, 2].map((k) => new THREE.Vector3(P.x + dir * (0.2 + k * 0.62), top - 0.75, P.z)),
    neutral: [0, 1].map((k) => new THREE.Vector3(P.x + dir * (0.15 + k * 0.3), top - 2.65, P.z)),
    secondary: new THREE.Vector3(P.x + dir * 0.18, top - 2.9, P.z),
    telecom: [0, 1].map((k) => new THREE.Vector3(P.x + dir * (0.12 + k * 0.1), top - 4.9 - k * 0.32, P.z)),
  };
}

export class Wires {
  constructor(engine) {
    this.engine = engine;
    this.list = []; // {a, b, sag, thick, kind}
    this.rng = new RNG(5151);
  }

  add(a, b, opts = {}) {
    this.list.push({ a: a.clone(), b: b.clone(), sag: opts.sag ?? 0.035, thick: opts.thick ?? 0.014, sway: opts.sway ?? 1, color: opts.color ?? [16, 16, 17], hang: opts.hang ?? 0 });
  }

  /** A loose end hanging from an anchor. */
  addDangle(a, len, opts = {}) {
    this.list.push({ a: a.clone(), b: null, len, curl: opts.curl ?? 0.3, thick: opts.thick ?? 0.012, sway: opts.sway ?? 2.5, color: opts.color ?? [14, 14, 15], dangle: true });
  }

  /** Lay out the alley's wire network. */
  layout() {
    const r = this.rng;
    const A = POLES.map((P) => ({ P, a: poleAnchors(P) }));
    // pole-to-pole runs along the alley
    for (let i = 0; i < A.length - 1; i++) {
      const p = A[i].a, q = A[i + 1].a;
      for (let k = 0; k < 3; k++) this.add(p.primary[k], q.primary[k], { sag: 0.018 + r.range(0, 0.008), thick: 0.016 });
      for (let k = 0; k < 2; k++) this.add(p.neutral[k], q.neutral[k], { sag: 0.025 + r.range(0, 0.01), thick: 0.013 });
      for (let k = 0; k < 2; k++) this.add(p.telecom[k], q.telecom[k], { sag: 0.04 + r.range(0, 0.02), thick: k === 0 ? 0.034 : 0.022 });
    }
    // beyond the ends (fade into the distance)
    const p0 = A[0].a;
    for (let k = 0; k < 3; k++) this.add(p0.primary[k], p0.primary[k].clone().add(new THREE.Vector3(0, 0.6, 26)), { sag: 0.02, thick: 0.016 });
    this.add(p0.telecom[0], p0.telecom[0].clone().add(new THREE.Vector3(-14, 1.0, 16)), { sag: 0.035, thick: 0.03 });
    const p3 = A[3].a;
    for (let k = 0; k < 3; k++) this.add(p3.primary[k], new THREE.Vector3(p3.primary[k].x - 26, p3.primary[k].y + 0.4, p3.primary[k].z - 1.2), { sag: 0.02, thick: 0.016 });
    for (let k = 0; k < 2; k++) this.add(p3.telecom[k], new THREE.Vector3(p3.telecom[k].x + 21, p3.telecom[k].y - 0.5, p3.telecom[k].z - 0.3), { sag: 0.04, thick: 0.026 });

    // service drops from pole secondaries to building weatherheads
    const drops = [
      [0, [-2.72, 7.2, 9.0]], [0, [-2.72, 6.4, 2.6]], [0, [2.72, 6.9, 5.0]],
      [1, [-2.72, 6.6, -6.0]], [1, [-2.72, 8.1, -14.2]], [1, [2.72, 7.6, -20.0]], [1, [2.72, 6.6, -4.0]], [1, [-2.72, 9.4, -24.6]],
      [2, [-2.72, 8.6, -36.0]], [2, [-2.72, 7.8, -52.5]], [2, [2.72, 7.0, -54.0]], [2, [5.52, 6.9, -40.0]], [2, [-2.72, 9.9, -45.5]],
      [3, [-6.0, 8.6, -79.42]], [3, [6.0, 8.2, -79.42]], [3, [-2.72, 7.0, -70.0]], [3, [2.72, 6.5, -70.0]], [3, [12.0, 7.2, -74.05]],
    ];
    for (const [pi, t] of drops) {
      const a = A[pi].a.secondary;
      const b = new THREE.Vector3(...t);
      this.add(a, b, { sag: 0.05 + r.range(0, 0.04), thick: 0.019 });
      // second conductor of the drop, slightly offset
      if (r.chance(0.5)) this.add(a.clone().add(new THREE.Vector3(0, -0.12, 0.05)), b.clone().add(new THREE.Vector3(0, -0.1, 0.06)), { sag: 0.06 + r.range(0, 0.04), thick: 0.011 });
    }
    // building-to-building cables across the alley (phone/cable TV, some abandoned)
    for (let i = 0; i < 16; i++) {
      const z = r.range(-72, 12);
      const z2 = z + r.range(-6, 6);
      const ya = r.range(5.2, 11.8), yb = ya + r.range(-1.8, 1.8);
      const a = new THREE.Vector3(-2.72, ya, z), b = new THREE.Vector3(2.72, Math.max(4.8, yb), z2);
      this.add(a, b, { sag: r.range(0.04, 0.12), thick: r.range(0.008, 0.016), sway: 1.4 });
    }
    // long cables running down the alley along/near the walls
    for (const side of [-1, 1]) {
      let z = 12;
      while (z > -72) {
        const len = r.range(6, 16);
        const y = r.range(3.6, 6.2);
        const off = side * (2.72 - r.range(0.0, 0.05));
        this.add(new THREE.Vector3(off, y, z), new THREE.Vector3(off, y + r.range(-0.4, 0.4), z - len), { sag: r.range(0.008, 0.02), thick: 0.011, sway: 0.4 });
        z -= len + r.range(1, 8);
      }
    }
    // dangling loose ends
    const dangles = [[-2.7, 6.3, -27.4], [2.7, 5.1, -9.9], [-2.7, 7.6, -58.2], [2.7, 5.8, -44.0], [A[1].a.telecom[1].x, A[1].a.telecom[1].y, -16.8]];
    for (const d of dangles) this.addDangle(new THREE.Vector3(...d), r.range(1.2, 3.2), { curl: r.range(0.1, 0.5) });
  }

  build() {
    const pos = [], nrm = [], wp = [], idx = [];
    let v = 0;
    const tmp = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3();
    const r = new RNG(77);
    let wid = 0;
    for (const w of this.list) {
      const pts = [];
      if (w.dangle) {
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          pts.push(new THREE.Vector3(w.a.x + Math.sin(t * 3.0) * w.curl * t * (w.a.x > 0 ? -1 : 1) * 0.6, w.a.y - w.len * t + w.curl * t * t * 0.4, w.a.z + Math.sin(t * 2.0) * w.curl * 0.5 * t));
        }
      } else {
        const L = w.a.distanceTo(w.b);
        const n = Math.max(8, Math.min(60, Math.round(L / 0.35)));
        const sag = L * w.sag;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          tmp.lerpVectors(w.a, w.b, t);
          tmp.y -= sag * 4 * t * (1 - t);
          pts.push(tmp.clone());
        }
      }
      const phase = r.range(0, 100);
      const h = w.thick * 0.75; // drawn ~1.5x thicker so they read at 1080p
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const dir = tmp.subVectors(p1, p0).normalize();
        side.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        up.crossVectors(side, dir).normalize();
        const t0 = i / (pts.length - 1), t1 = (i + 1) / (pts.length - 1);
        const swayAmp = w.dangle ? w.sway : w.sway * (w.b ? Math.min(1, w.a.distanceTo(w.b) / 12) : 1);
        // 4 faces of the square section
        const faces = [[side, up], [up, side.clone().negate()], [side.clone().negate(), up.clone().negate()], [up.clone().negate(), side]];
        for (const [n, e] of faces) {
          const c0 = p0.clone().addScaledVector(n, h), c1 = p1.clone().addScaledVector(n, h);
          const a0 = c0.clone().addScaledVector(e, -h), b0 = c0.clone().addScaledVector(e, h);
          const a1 = c1.clone().addScaledVector(e, -h), b1 = c1.clone().addScaledVector(e, h);
          for (const [p, t] of [[a0, t0], [b0, t0], [b1, t1], [a1, t1]]) {
            pos.push(p.x, p.y, p.z);
            nrm.push(n.x, n.y, n.z);
            // t along wire, sway amplitude, phase, dangle flag
            wp.push(t, swayAmp, phase, w.dangle ? 1 : 0);
          }
          idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
          v += 4;
        }
      }
      wid++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('wpar', new THREE.Float32BufferAttribute(wp, 4));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    geo.computeBoundingSphere();
    this.material = createWireMaterial();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'wires';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(LAYER_REFLECT);
    this.engine.scene.add(this.mesh);
    this.tris = idx.length / 3;
    return this;
  }
}

function createWireMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.42, metalness: 0.0 });
  mat.name = 'wires';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    shader.vertexShader = patch(shader.vertexShader, '#include <common>', /* glsl */ `
      attribute vec4 wpar;
      uniform float uTime;
      uniform float uWind;
      varying vec3 vWPos;
    `, 'after');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>', /* glsl */ `
      {
        float t = wpar.x;
        float shape = wpar.w > 0.5 ? t * t : 4.0 * t * (1.0 - t);
        float g = 0.25 + uWind * 1.4;
        float sw = sin(uTime * (1.1 + 0.3 * sin(wpar.z)) + wpar.z) * 0.6 + sin(uTime * 2.3 + wpar.z * 1.7) * 0.25;
        transformed.x += shape * wpar.y * g * sw * 0.07;
        transformed.z += shape * wpar.y * g * cos(uTime * 0.9 + wpar.z) * 0.03;
        transformed.y += shape * wpar.y * g * sw * 0.02;
      }
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
    `, 'after');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>', GLSL_COMMON + 'varying vec3 vWPos;', 'after');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <lights_fragment_maps>', /* glsl */ `
      irradiance = sampleIrradiance(vWPos, normalize((vec4(normal, 0.0) * viewMatrix).xyz));
    `, 'after');
  };
  mat.customProgramCacheKey = () => 'wires-v1';
  return mat;
}
