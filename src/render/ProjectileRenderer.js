// Visible projectiles: tracer streaks as camera-facing ribbons (additive,
// HDR-bright for bloom), rocket/missile motor glows and flares, and small
// solid bodies for rockets, missiles, bombs and grenades.

import * as THREE from 'three';
import { FACTION_INFO } from '../sim/world.js';

const VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aC; // rgb (HDR), half width (negative = round glow sprite)
varying vec3 vColor;
varying vec2 vUv;
varying float vGlow;
void main() {
  vec3 p = mix(aA, aB, position.x);
  vec3 dir = aB - aA;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec3(0.0, 1.0, 0.0);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = cross(dir, toCam);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  vGlow = aC.w < 0.0 ? 1.0 : 0.0;
  // Keep at least ~2 px of width so distant tracers stay visible.
  float w = max(abs(aC.w), distance(cameraPosition, p) * 0.0009);
  p += side * position.y * w;
  if (vGlow > 0.5) {
    vec3 up = normalize(cross(side, toCam));
    p += up * (position.x - 0.5) * 2.0 * w;
  }
  vColor = aC.rgb;
  vUv = vec2(position.x, position.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
varying vec3 vColor;
varying vec2 vUv;
varying float vGlow;
void main() {
  float a;
  if (vGlow > 0.5) {
    float r2 = (vUv.x * 2.0 - 1.0) * (vUv.x * 2.0 - 1.0) + vUv.y * vUv.y;
    a = max(0.0, 1.0 - r2);
    a *= a;
  } else {
    float across = 1.0 - vUv.y * vUv.y;
    a = across * across * mix(0.25, 1.0, vUv.x);
  }
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export class ProjectileRenderer {
  constructor(scene, max = 6000) {
    this.max = max;
    const quad = new THREE.BufferGeometry();
    // x: 0 at tail .. 1 at head; y: -1..1 across.
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    this.A = new Float32Array(max * 3);
    this.B = new Float32Array(max * 3);
    this.C = new Float32Array(max * 4);
    for (const [n, arr, s] of [['aA', this.A, 3], ['aB', this.B, 3], ['aC', this.C, 4]]) {
      const at = new THREE.InstancedBufferAttribute(arr, s);
      at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(n, at);
    }
    geo.instanceCount = 0;
    this.geo = geo;
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    scene.add(this.mesh);
    // Solid bodies.
    const body = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    body.rotateX(Math.PI / 2);
    this.bodies = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ color: 0x3a3c38, roughness: 0.6, metalness: 0.4 }), 1500);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.frustumCulled = false;
    scene.add(this.bodies);
    this.tracerCols = FACTION_INFO.map((f) => new THREE.Color(f.tracer));
    this.obj = new THREE.Object3D();
    this.n = 0;
  }

  seg(ax, ay, az, bx, by, bz, r, g, b, w) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.A[i * 3] = ax;
    this.A[i * 3 + 1] = ay;
    this.A[i * 3 + 2] = az;
    this.B[i * 3] = bx;
    this.B[i * 3 + 1] = by;
    this.B[i * 3 + 2] = bz;
    this.C[i * 4] = r;
    this.C[i * 4 + 1] = g;
    this.C[i * 4 + 2] = b;
    this.C[i * 4 + 3] = w;
  }

  update(world, camera) {
    this.n = 0;
    let nb = 0;
    const cam = camera.position;
    const o = this.obj;
    for (const p of world.projectiles.active) {
      if (!p.active) continue;
      const k = p.kind;
      const sp = Math.hypot(p.vx, p.vy, p.vz) || 1;
      if (k === 'bullet') {
        if (!p.tracer || p.age > 3.2) continue;
        const heavy = (p.ap.pen || 0) > 20;
        const aa = p.def.id === 'aa_twin';
        const len = Math.min(sp * 0.024, heavy ? 30 : 20) * (p.ricochet ? 0.5 : 1);
        let c = this.tracerCols[p.faction] || this.tracerCols[0];
        let r = c.r;
        let g = c.g;
        let b = c.b;
        if (aa) {
          r = 1;
          g = 0.62;
          b = 0.2;
        }
        const I = heavy ? 9 : 6;
        this.seg(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len, p.z - (p.vz / sp) * len, p.x, p.y, p.z, r * I, g * I, b * I, heavy ? 0.09 : 0.05);
      } else if (k === 'shell') {
        if (p.age > 2.5) continue;
        const len = Math.min(sp * 0.02, 32);
        this.seg(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len, p.z - (p.vz / sp) * len, p.x, p.y, p.z, 10, 8.5, 6, 0.12);
      } else if (k === 'rocket' || k === 'missile') {
        // Motor glow while burning (or sustaining), plus a short exhaust streak.
        const burning = p.thrustT > 0 || p.sustain > 0 || (k === 'rocket' && p.age < 1.8);
        if (burning) {
          const len = Math.min(sp * 0.02, 6);
          this.seg(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len, p.z - (p.vz / sp) * len, p.x, p.y, p.z, 12, 7, 3, 0.28);
          this.seg(p.x, p.y, p.z, p.x, p.y, p.z, 9, 5.5, 2.5, -0.7);
        }
        if (nb < 1500) {
          o.position.set(p.x, p.y, p.z);
          o.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
          const big = k === 'missile' ? 1.4 : p.def.id === 'mlrs_rocket' ? 2.6 : 1.1;
          o.scale.set(0.13 * big, 0.13 * big, big);
          o.updateMatrix();
          this.bodies.setMatrixAt(nb++, o.matrix);
        }
      } else if (k === 'bomb' || k === 'grenade') {
        if (nb >= 1500) continue;
        if (k === 'grenade' && (p.x - cam.x) ** 2 + (p.y - cam.y) ** 2 + (p.z - cam.z) ** 2 > 250000) continue;
        o.position.set(p.x, p.y, p.z);
        if (sp > 0.5) o.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        if (k === 'bomb') o.scale.set(0.36, 0.36, 2.2);
        else o.scale.set(0.07, 0.07, 0.12);
        o.updateMatrix();
        this.bodies.setMatrixAt(nb++, o.matrix);
      } else if (k === 'flare') {
        const f = Math.max(0, 1 - p.age / p.life);
        this.seg(p.x, p.y, p.z, p.x, p.y, p.z, 14 * f, 10 * f, 13 * f, -1.4);
      }
    }
    const geo = this.geo;
    geo.instanceCount = this.n;
    for (const name of ['aA', 'aB', 'aC']) {
      const a = geo.getAttribute(name);
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
    this.bodies.count = nb;
    if (nb) this.bodies.instanceMatrix.needsUpdate = true;
  }
}
