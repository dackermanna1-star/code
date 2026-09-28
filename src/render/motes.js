// Dust motes that only show where light actually passes: inside the player's
// flashlight beam and the level's volumetric light cones (L._cones). One
// Points draw call; the cloud lives in a box that wraps around the camera and
// all lighting/drift is done in the vertex shader (dark motes are culled there).
import * as THREE from 'three';

const MAXC = 12;
const VS = /* glsl */ `
  attribute vec4 seed;
  uniform float time, box, pxScale;
  uniform vec3 camPos, flPos, flDir;
  uniform float flOn;
  uniform vec4 cA[${MAXC}];   // apex xyz, length
  uniform vec4 cD[${MAXC}];   // dir xyz, end radius
  uniform vec3 cC[${MAXC}];   // colour * intensity
  uniform int nC;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec3 p = seed.xyz * box;
    float ph = seed.w * 6.2832;
    p += vec3(sin(time * 0.11 + ph) * 0.5 + sin(time * 0.37 + ph * 3.0) * 0.08,
              sin(time * 0.07 + ph * 2.0) * 0.35 - time * 0.015,
              cos(time * 0.13 + ph * 1.7) * 0.5);
    p = camPos + mod(p - camPos + box * 0.5, box) - box * 0.5;
    vec3 col = vec3(0.0);
    // flashlight: bright near the lens, soft cone edge
    vec3 d = p - flPos;
    float dl = length(d);
    float ca = dot(d, flDir) / max(dl, 1e-3);
    col += vec3(1.0, 0.94, 0.84) * flOn * smoothstep(0.915, 0.975, ca) * smoothstep(0.35, 0.9, dl) / (1.0 + dl * dl * 0.09);
    for (int i = 0; i < ${MAXC}; i++) {
      if (i >= nC) break;
      vec3 v = p - cA[i].xyz;
      float t = dot(v, cD[i].xyz);
      float len = cA[i].w;
      if (t <= 0.0 || t >= len) continue;
      float rr = cD[i].w * t / len + 0.05;
      float r = length(v - cD[i].xyz * t);
      col += cC[i] * (1.0 - smoothstep(rr * 0.45, rr, r)) * (1.0 - t / len) * 0.9;
    }
    float tw = 0.65 + 0.35 * sin(time * (1.5 + seed.w * 2.0) + ph * 5.0);
    col *= tw;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float lum = dot(col, vec3(0.3, 0.6, 0.1));
    gl_Position = projectionMatrix * mv;
    if (lum < 0.004 || mv.z > -0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec3(0.0); vA = 0.0; return; }
    float sz = (0.004 + seed.w * 0.005) * pxScale / -mv.z;
    // sub-pixel motes fade instead of shrinking (keeps them from sparkling)
    vA = clamp(sz / 1.5, 0.0, 1.0);
    gl_PointSize = max(sz, 1.5);
    vCol = col;
  }
`;
const FS = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.25, 0.0, dot(c, c)) * vA;
    gl_FragColor = vec4(vCol * a * 2.2, 1.0);
  }
`;

export class BeamMotes {
  constructor(scene, quality) {
    const n = quality.bloom ? 2600 : 1100;
    const seed = new Float32Array(n * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const arr = (k) => Array.from({ length: MAXC }, () => (k === 3 ? new THREE.Vector3() : new THREE.Vector4()));
    this.u = {
      time: { value: 0 }, box: { value: 12 }, pxScale: { value: 500 },
      camPos: { value: new THREE.Vector3() }, flPos: { value: new THREE.Vector3() }, flDir: { value: new THREE.Vector3(0, 0, -1) }, flOn: { value: 0 },
      cA: { value: arr(4) }, cD: { value: arr(4) }, cC: { value: arr(3) }, nC: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 16;
    this.points.name = 'beamMotes';
    scene.add(this.points);
    this.pick = [];
    this.pickT = 0;
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
  }
  update(dt, game, camera, heightPx) {
    const u = this.u;
    u.time.value += dt;
    u.pxScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    camera.getWorldPosition(u.camPos.value);
    const fl = game.flashlight;
    if (fl && fl.intensity > 0) {
      fl.getWorldPosition(u.flPos.value);
      fl.target.getWorldPosition(this._v);
      u.flDir.value.copy(this._v).sub(u.flPos.value).normalize();
      u.flOn.value = Math.min(1, fl.intensity / 22) * 0.55;
    } else u.flOn.value = 0;
    // nearest light cones (re-picked a few times a second)
    const cones = game.level?._cones;
    const cp = u.camPos.value;
    this.pickT -= dt;
    if (this.pickT <= 0) {
      this.pickT = 0.3;
      this.pick.length = 0;
      if (cones) {
        const cand = [];
        for (const c of cones) {
          const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          const r = c.len + 7;
          if (d2 < r * r) cand.push([d2, c]);
        }
        cand.sort((a, b) => a[0] - b[0]);
        for (let i = 0; i < Math.min(MAXC, cand.length); i++) this.pick.push(cand[i][1]);
      }
    }
    let n = 0;
    for (const c of this.pick) {
      const L = c.light;
      const k = L ? (L.on ? Math.max(0, Math.min(1.2, L.cur ?? 1)) : 0) : 1;
      if (k <= 0.01) continue;
      const dx = c.dir[0], dy = c.dir[1], dz = c.dir[2], dl = Math.hypot(dx, dy, dz) || 1;
      u.cA.value[n].set(c.x, c.y, c.z, c.len);
      u.cD.value[n].set(dx / dl, dy / dl, dz / dl, c.radius);
      this._c.set(c.color ?? 0xffc070);
      u.cC.value[n].set(this._c.r, this._c.g, this._c.b).multiplyScalar(k * (c.tint ?? 1) * 0.35);
      n++;
    }
    u.nC.value = n;
    this.points.visible = n > 0 || u.flOn.value > 0;
  }
}
