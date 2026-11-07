// =============================================================================
// Exterior light glows: one draw call of camera-facing quads with HDR intensity
// (picked up by the pipeline's bloom), per-light angular visibility (nav light
// sectors, landing light beams), minimum pixel size so lights stay visible as
// sparkles at a distance, and optional wing flex.
// =============================================================================
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute vec3 aColor;
attribute vec4 aParams;   // size (m), intensity, min pixels, pull towards camera (m)
attribute vec4 aDir;      // local direction, w = cos(cone half-angle) (-2 = omni)
uniform float uPxScale;
uniform float uFlex;
uniform float uFlexRoll;
uniform float uUseFlex;
varying vec3 vColor;
varying vec2 vUv;
varying float vI;
float exteriorFlex(vec3 p) {
  float s = clamp((abs(p.x) - 1.9) / 15.25, 0.0, 1.25);
  float m = 1.0 - smoothstep(10.5, 11.5, p.z);
  return (uFlex + uFlexRoll * sign(p.x)) * s * s * m;
}
void main() {
  vec4 wp = modelMatrix * vec4(aCenter, 1.0);
  if (uUseFlex > 0.5) wp.y += exteriorFlex(wp.xyz);
  vec4 mv = viewMatrix * wp;
  float dist = max(-mv.z, 0.05);
  float vis = 1.0;
  if (aDir.w > -1.5) {
    vec3 dW = normalize(mat3(modelMatrix) * aDir.xyz);
    vec3 toCam = normalize(cameraPosition - wp.xyz);
    float c = dot(dW, toCam);
    vis = smoothstep(aDir.w - 0.12, aDir.w + 0.06, c);
    // a little forward lobe so beams are hot when looked into
    vis *= mix(1.0, 1.0 + 3.0 * smoothstep(0.9, 1.0, c), step(0.0, aDir.w));
  }
  float size = aParams.x;
  float px = size * uPxScale / dist;
  float grow = max(1.0, aParams.z / max(px, 1e-3));
  vI = aParams.y * vis / pow(grow, 1.2);
  vColor = aColor;
  vUv = aCorner;
  // pull the quad towards the camera so it does not clip into the light housing
  mv.xyz += normalize(-mv.xyz) * min(aParams.w, dist * 0.5);
  mv.xy += aCorner * size * grow * 0.5;
  gl_Position = projectionMatrix * mv;
  if (vI <= 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

const FRAG = /* glsl */`
varying vec3 vColor;
varying vec2 vUv;
varying float vI;
void main() {
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 70.0);
  float halo = exp(-r2 * 9.0) * 0.025 + exp(-r2 * 2.5) * 0.005;
  // faint horizontal / vertical diffraction streaks
  float streak = exp(-abs(vUv.y) * 80.0) * exp(-abs(vUv.x) * 4.0) * 0.012 + exp(-abs(vUv.x) * 80.0) * exp(-abs(vUv.y) * 4.0) * 0.006;
  float e = (core + halo + streak) * (1.0 - smoothstep(0.75, 1.0, sqrt(r2)));
  vec3 c = mix(vColor, vec3(1.0), clamp(core * 0.6, 0.0, 1.0)) * vI * e;
  gl_FragColor = vec4(c, 1.0);
}`;

export class GlowSet {
  /** lights: [{ pos: Vector3, color, size, min, pull, dir?: Vector3, cone?: deg }] */
  constructor(lights, { flex = false, shared = null } = {}) {
    const n = lights.length;
    this.n = n;
    const center = new Float32Array(n * 12), corner = new Float32Array(n * 8), color = new Float32Array(n * 12);
    const params = new Float32Array(n * 16), dir = new Float32Array(n * 16);
    const idx = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    lights.forEach((L, i) => {
      const c = new THREE.Color(L.color ?? 0xffffff);
      const cone = L.dir ? Math.cos((L.cone ?? 90) * Math.PI / 180) : -2;
      const d = L.dir ? L.dir.clone().normalize() : new THREE.Vector3(0, 0, -1);
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        center.set([L.pos.x, L.pos.y, L.pos.z], v * 3);
        corner.set(corners[k], v * 2);
        color.set([c.r, c.g, c.b], v * 3);
        params.set([L.size ?? 0.5, 0, L.min ?? 2.5, L.pull ?? 0.25], v * 4);
        dir.set([d.x, d.y, d.z, cone], v * 4);
      }
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
    g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    this.paramAttr = new THREE.BufferAttribute(params, 4);
    this.paramAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aParams', this.paramAttr);
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 4));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);
    this.uniforms = {
      uPxScale: { value: 500 },
      uFlex: shared ? shared.uFlex : { value: 0 },
      uFlexRoll: shared ? shared.uFlexRoll : { value: 0 },
      uUseFlex: { value: flex ? 1 : 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.values = new Float32Array(n);
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      if (camera.isPerspectiveCamera) {
        const h = renderer.getDrawingBufferSize(_v2).y;
        this.uniforms.uPxScale.value = h / (2 * Math.tan(camera.fov * Math.PI / 360));
      }
    };
  }
  set(i, intensity) { this.values[i] = intensity; }
  /** push intensities to the GPU */
  commit() {
    const a = this.paramAttr.array;
    let changed = false;
    for (let i = 0; i < this.n; i++) {
      const v = this.values[i];
      if (a[i * 16 + 1] !== v) { changed = true; for (let k = 0; k < 4; k++) a[(i * 4 + k) * 4 + 1] = v; }
    }
    if (changed) this.paramAttr.needsUpdate = true;
  }
  setPosition(i, p) {
    const at = this.mesh.geometry.attributes.aCenter;
    for (let k = 0; k < 4; k++) at.setXYZ(i * 4 + k, p.x, p.y, p.z);
    at.needsUpdate = true;
  }
}
const _v2 = new THREE.Vector2();

/** Strobe pattern: double flash every `period` s (returns 0..1). */
export function strobe(t, period = 1.2, offset = 0) {
  const p = ((t + offset) % period + period) % period;
  const f = (x) => Math.exp(-Math.pow((p - x) / 0.022, 2));
  return Math.max(f(0.03), f(0.17) * 0.9);
}
/** Beacon: rotating/flashing red at ~1 Hz. */
export function beacon(t, rate = 1.0, offset = 0) {
  const p = ((t * rate + offset) % 1 + 1) % 1;
  return Math.pow(Math.max(0, Math.cos(p * Math.PI * 2)), 10);
}

/**
 * Soft volumetric beam cones (landing lights in haze / cloud). One mesh for all beams.
 * beams: [{ pos, dir, length, radius }]
 */
export function beamCones(beams) {
  const geos = [];
  for (const b of beams) {
    const g = new THREE.CylinderGeometry(b.radius, 0.12, b.length, 20, 6, true);
    g.translate(0, -b.length / 2, 0);              // apex at the origin, extending along -Y
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.dir.clone().normalize());
    g.applyQuaternion(q);
    g.translate(b.pos.x, b.pos.y, b.pos.z);
    // along-beam coordinate in uv.y (0 at the lamp, 1 at the end)
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const d = new THREE.Vector3(p.getX(i) - b.pos.x, p.getY(i) - b.pos.y, p.getZ(i) - b.pos.z).dot(b.dir.clone().normalize());
      uv.setY(i, d / b.length);
    }
    geos.push(g);
  }
  const g = geos.length > 1 ? mergeGeoms(geos) : geos[0];
  const uniforms = { uIntensity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.95, 0.86) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying float vT;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vT = uv.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uIntensity; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV; varying float vT;
      void main() {
        float edge = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(edge, 1.6) * pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.04, vT);
        gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 9;
  mesh.visible = false;
  return { mesh, uniforms };
}

function mergeGeoms(list) {
  // minimal merge (position, normal, uv) without importing BufferGeometryUtils here
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    const ia = g.index.array;
    for (let i = 0; i < ia.length; i++) idx[oi + i] = ia[i] + o;
    o += g.attributes.position.count; oi += ia.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
