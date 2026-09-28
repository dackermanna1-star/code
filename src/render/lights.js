// Dynamic light manager. Levels can register hundreds of "virtual" lights; each
// frame the most relevant ones are mapped onto a small fixed pool of real
// PointLights so the shader light count never changes (no recompiles) and
// forward-rendering cost stays bounded.
//
// Also owns the cheap "volumetric" light shafts: soft additive cone meshes that
// fake light scattering in fog. Static cones (street lamps, flood lights) are
// merged per level (see `lightCone` / `buildConeBatch`); every SpotLight in the
// scene that is not attached to the camera (bot flashlights, helicopter
// searchlights) gets a dynamic cone automatically. Cones are off on low.
import * as THREE from 'three';
import { QUALITY } from '../config.js';

// ------------------------------------------------------------ cone shader --
const CONE_VS = /* glsl */ `
  attribute float aT;
  attribute float aIdx;
  attribute vec3 aCol;
  uniform float intens[64];
  varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vI; varying float vDist;
  #include <fog_pars_vertex>
  void main(){
    vT = aT;
    int idx = int(aIdx + 0.5);
    vI = intens[idx];
    vCol = aCol;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mvPosition.xyz);
    vDist = length(mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const CONE_FS = /* glsl */ `
  uniform float strength, time;
  uniform vec3 tint;
  varying float vT; varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vI; varying float vDist;
  #include <fog_pars_fragment>
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    if (vI <= 0.001) discard;
    float along = pow(1.0 - vT, 1.35) * smoothstep(0.0, 0.06, vT);
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.8);
    float nearFade = smoothstep(0.4, 3.0, vDist);
    // slow drifting density variation (dust in the beam)
    float n = 0.85 + 0.15 * sin(vT * 9.0 - time * 0.7 + vN.x * 3.0);
    float a = along * edge * nearFade * n * vI * strength;
    // subtle dither against banding
    a += (h21(gl_FragCoord.xy + time) - 0.5) * 0.004;
    vec3 c = vCol * tint * a;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      c *= 1.0 - fogFactor * 0.9;
    #endif
    gl_FragColor = vec4(max(c, 0.0), 1.0);
  }
`;
let _coneShared = null;
function coneShared() {
  if (_coneShared) return _coneShared;
  _coneShared = { time: { value: 0 } };
  return _coneShared;
}
export function coneMaterial(strength = 1) {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { intens: { value: new Array(64).fill(1) }, strength: { value: strength }, time: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) } }]),
    vertexShader: CONE_VS,
    fragmentShader: CONE_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  m.uniforms.time = coneShared().time;
  return m;
}
// Unit cone: apex at the origin, opening along -Y to radius 1 at y = -1.
let _unitCone = null;
export function unitConeGeometry() {
  if (_unitCone) return _unitCone;
  const g = new THREE.CylinderGeometry(0.02, 1, 1, 20, 4, true);
  g.translate(0, -0.5, 0);
  const pos = g.attributes.position;
  const t = new Float32Array(pos.count), idx = new Float32Array(pos.count), col = new Float32Array(pos.count * 3).fill(1);
  for (let i = 0; i < pos.count; i++) t[i] = -pos.getY(i);
  g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  _unitCone = g;
  return g;
}

// Build one merged mesh for a list of static cones:
// [{x,y,z, dir:[x,y,z], len, radius, color, light}] -> {mesh, update()}
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function buildConeBatch(list, strength = 1) {
  const src = unitConeGeometry();
  const n = Math.min(64, list.length);
  const vc = src.attributes.position.count;
  const pos = new Float32Array(n * vc * 3), nor = new Float32Array(n * vc * 3), t = new Float32Array(n * vc), idx = new Float32Array(n * vc), col = new Float32Array(n * vc * 3);
  const index = [];
  const sp = src.attributes.position, sn = src.attributes.normal, st = src.attributes.aT;
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const c = list[k];
    _d.set(c.dir[0], c.dir[1], c.dir[2]).normalize();
    _q.setFromUnitVectors(_up, _d);
    _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.radius, c.len, c.radius));
    nm.getNormalMatrix(_m);
    _c.set(c.color ?? 0xffc070);
    const tint = c.tint ?? 1;
    for (let i = 0; i < vc; i++) {
      const o = k * vc + i;
      v.fromBufferAttribute(sp, i).applyMatrix4(_m);
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(sn, i).applyMatrix3(nm).normalize();
      nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      t[o] = st.getX(i);
      idx[o] = k;
      col[o * 3] = _c.r * tint; col[o * 3 + 1] = _c.g * tint; col[o * 3 + 2] = _c.b * tint;
    }
    for (let i = 0; i < src.index.count; i++) index.push(k * vc + src.index.getX(i));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  const mat = coneMaterial(strength);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'lightCones';
  mesh.renderOrder = 15;
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  const I = mat.uniforms.intens.value;
  for (let k = 0; k < n; k++) I[k] = list[k].light ? (list[k].light.on ? 1 : 0) : 1;
  return {
    mesh,
    update() {
      for (let k = 0; k < n; k++) {
        const L = list[k].light;
        if (!L) continue;
        // follow the virtual light's flicker (cur is set by the LightManager)
        const target = L.on ? Math.max(0, Math.min(1.2, L.cur ?? 1)) : 0;
        I[k] += (target - I[k]) * 0.5;
      }
    },
  };
}

export class LightManager {
  constructor(scene, poolSize = 8) {
    this.scene = scene;
    this.pool = [];
    this.virtual = [];
    this.temp = []; // transient lights (muzzle flashes, explosions) {x,y,z,color,intensity,range,life,max}
    this.setPoolSize(poolSize);
    this.frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._s = new THREE.Sphere();
    this.time = 0;
    const q = Object.values(QUALITY).find((p) => p.lights === poolSize);
    this.cones = q ? q.cones !== false : poolSize > 4;
    this.spotCones = new Map(); // SpotLight -> cone mesh
    this._scan = 0;
  }
  setPoolSize(n) {
    for (const p of this.pool) this.scene.remove(p);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 1.3);
      L.castShadow = false;
      L.layers.enable(1);
      L.userData.assigned = null;
      this.scene.add(L);
      this.pool.push(L);
    }
  }
  setVirtual(list) {
    this.virtual = list;
  }
  flash(x, y, z, color, intensity, range, life) {
    // Reuse an existing temp slot if too many
    if (this.temp.length > 12) this.temp.shift();
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    this.temp.push({ x, y, z, color: c, intensity, range, life, max: life, temp: true });
  }
  // Dynamic beams for scene SpotLights not attached to the camera.
  updateSpotCones(dt, camera) {
    if (!this.cones) return;
    coneShared().time.value = this.time;
    if (--this._scan <= 0) {
      this._scan = 90;
      const seen = new Set();
      this.scene.traverse((o) => {
        if (!o.isSpotLight || o.userData.noCone) return;
        if (o.parent && o.parent.isCamera) return;
        seen.add(o);
        if (!this.spotCones.has(o)) {
          const mesh = new THREE.Mesh(unitConeGeometry(), coneMaterial(0.05));
          mesh.name = 'spotCone';
          mesh.frustumCulled = false;
          mesh.renderOrder = 15;
          this.scene.add(mesh);
          this.spotCones.set(o, mesh);
        }
      });
      for (const [L, mesh] of this.spotCones) if (!seen.has(L)) { this.scene.remove(mesh); mesh.material.dispose(); this.spotCones.delete(L); }
    }
    for (const [L, mesh] of this.spotCones) {
      const on = L.intensity > 0.01 && L.visible !== false && L.parent;
      mesh.visible = !!on;
      if (!on) continue;
      L.getWorldPosition(_p);
      L.target.getWorldPosition(_d);
      _d.sub(_p);
      const dl = _d.length();
      if (dl < 1e-4) { mesh.visible = false; continue; }
      _d.multiplyScalar(1 / dl);
      const len = Math.min(L.distance > 0 ? L.distance * 0.75 : 30, L.intensity > 60 ? 70 : 14);
      const rad = Math.tan(Math.min(1.2, L.angle)) * len * 0.8;
      _q.setFromUnitVectors(_up, _d);
      mesh.position.copy(_p);
      mesh.quaternion.copy(_q);
      mesh.scale.set(rad, len, rad);
      const u = mesh.material.uniforms;
      u.intens.value[0] = Math.min(4, L.intensity / 18);
      u.strength.value = L.intensity > 60 ? 0.035 : 0.05;
      u.tint.value.copy(L.color);
    }
  }
  update(dt, camera) {
    this.time += dt;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._m);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const cand = this._cand || (this._cand = []);
    cand.length = 0;
    const t = this.time;
    for (const L of this.virtual) {
      if (!L.on) { L.cur = 0; continue; }
      const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > L.range + 45) continue;
      this._s.center.set(L.x, L.y, L.z);
      this._s.radius = L.range;
      const vis = this.frustum.intersectsSphere(this._s);
      if (!vis && d > L.range * 1.1) continue;
      // flicker
      let k = 1;
      if (L.flicker > 0) {
        const n = Math.sin(t * 13.1 + L.phase) * Math.sin(t * 7.3 + L.phase * 2.1) + Math.sin(t * 29.7 + L.phase);
        k = n > 1.2 - L.flicker * 1.6 ? 1 : 0.15 + 0.2 * Math.random() * (1 - L.flicker);
        if (L.flicker > 0.9 && Math.random() < 0.02) k = 0;
      }
      if (L.buzz) k *= 0.92 + 0.08 * Math.sin(t * 120 + L.phase);
      L.cur = k;
      // priority boosts relevance but stays distance-aware so a few priority
      // lights can't starve the whole (small) pool
      const score = (L.intensity * (L.range + 4)) / (1 + d * d * 0.06) * (vis ? 1 : 0.35) * (1 + (L.priority || 0));
      cand.push({ L, score, k });
    }
    for (let i = this.temp.length - 1; i >= 0; i--) {
      const L = this.temp[i];
      L.life -= dt;
      if (L.life <= 0) { this.temp.splice(i, 1); continue; }
      const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > (L.range + 30) ** 2) continue;
      const k = L.life / L.max;
      cand.push({ L, score: 1e6 - d2, k: L.fade === false ? 1 : k });
    }
    cand.sort((a, b) => b.score - a.score);
    for (let i = 0; i < this.pool.length; i++) {
      const P = this.pool[i];
      const c = cand[i];
      if (!c) {
        P.intensity = 0;
        // keep visible (light count must stay constant to avoid shader recompiles)
        continue;
      }

      const L = c.L;
      P.position.set(L.x, L.y, L.z);
      P.color.copy(L.color);
      P.distance = L.range;
      P.decay = L.decay ?? 1.3;
      // Smooth reassignment to avoid pops when a slot changes owner.
      const target = L.intensity * c.k;
      if (P.userData.assigned !== L) {
        P.userData.assigned = L;
        P.intensity = L.temp ? target : target * 0.35;
      } else {
        P.intensity += (target - P.intensity) * Math.min(1, dt * (L.temp ? 60 : 14));
      }
    }
    this.updateSpotCones(dt, camera);
  }
}
