// Effects: pooled particles (sand and dust puffs, splashes, embers and
// sparks), shafts of light (sunbeams through the temple roof, the Eye of
// Ra), and the dust motes that hang in the air of the tombs.
import * as THREE from 'three';
import { glowTexture } from './kit.js';

const _c = new THREE.Color();
/** A pool of particles drawn as one Points object. additive: glowing (embers, sparks) or not (dust, water). */
export class Particles {
  constructor(scene, n = 900, additive = false) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.age = new Float32Array(n); this.grav = new Float32Array(n); this.s0 = new Float32Array(n); this.drag = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTexture() }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC = color; vA = clamp(size, 0.0, 1.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * ${additive ? '1.0' : '0.85'}); if (gl_FragColor.a < 0.02) discard; }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(p, v, color, size, life, grav = 0, drag = 0.5) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    _c.set(color); this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    this.s0[i] = size; this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.grav[i] = grav; this.drag[i] = drag;
  }
  /** A puff of n particles around p. */
  puff(p, color, n = 8, size = 2, speed = 4, life = 1.4, grav = -2) {
    for (let k = 0; k < n; k++) this.emit(p, { x: (Math.random() - 0.5) * speed, y: Math.random() * speed * 0.6, z: (Math.random() - 0.5) * speed }, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav);
  }
  update(dt) {
    const P = this.pos, Vv = this.vel;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) { this.life[i] = 0; P[i * 3 + 1] = -9999; this.size[i] = 0; continue; }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      Vv[i * 3] *= d; Vv[i * 3 + 2] *= d; Vv[i * 3 + 1] = Vv[i * 3 + 1] * d - this.grav[i] * dt;
      P[i * 3] += Vv[i * 3] * dt; P[i * 3 + 1] += Vv[i * 3 + 1] * dt; P[i * 3 + 2] += Vv[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85 * 0.9) * (1 + k * 0.6);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

/** A shaft of light: a long additive cone/cylinder, brighter at its source. */
export function lightShaft(r0, r1, len, color = 0xfff0c0, opacity = 0.18) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true);
  g.translate(0, -len / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color(color) }, a: { value: opacity } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 col; uniform float a; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(col, a * edge * smoothstep(0.0, 0.6, vY)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 5;
  return mesh;
}

/** Dust motes hanging in the air around the camera (sunlit in the temple, warm in the tombs). */
export class Motes {
  constructor(scene, n = 400) {
    this.n = n; this.box = 70;
    this.base = new Float32Array(n * 3); this.out = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) this.base[i] = Math.random() * this.box;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.out, 3));
    this.mat = new THREE.PointsMaterial({ map: glowTexture(), size: 0.22, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe0a0, sizeAttenuation: true });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    scene.add(this.points);
    this.t = 0;
  }
  update(dt, cam, color, opacity) {
    this.t += dt;
    this.mat.color.set(color); this.mat.opacity = opacity;
    this.points.visible = opacity > 0.01;
    if (!this.points.visible) return;
    const B = this.box, O = this.out, b = this.base, t = this.t;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      const x = b[j] + Math.sin(t * 0.21 + i) * 2, y = b[j + 1] + Math.sin(t * 0.13 + i * 1.7) * 1.5 - t * 0.3, z = b[j + 2] + Math.cos(t * 0.17 + i) * 2;
      O[j] = cam.x - B / 2 + ((((x - cam.x) % B) + B) % B);
      O[j + 1] = cam.y - B / 2 + ((((y - cam.y) % B) + B) % B);
      O[j + 2] = cam.z - B / 2 + ((((z - cam.z) % B) + B) % B);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
