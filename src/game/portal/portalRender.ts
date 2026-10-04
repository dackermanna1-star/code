/**
 * Portal visuals (forward HDR scene):
 *  - the surface: an animated ellipse showing the view through the portal (sampled in screen
 *    space from the portal's off-screen render), with a burning rim of colour, or a swirling
 *    membrane when unlinked / beyond the recursion limit. A shallow box behind the plane takes
 *    over while the camera is within the near-plane distance of the opening, so the image never
 *    clips while you step through.
 *  - an additive halo/rim-flame layer that spills onto the surrounding wall.
 *  - spark particles (rim embers, opening bursts, shot trails and fizzles) and the shot bolts.
 * Plus the virtual-camera maths for rendering through a portal (oblique near plane).
 */
import * as THREE from 'three';
import { PORTAL_HH, PORTAL_HW, type PortalFrame } from './portalMath';

export const PORTAL_COLORS = [new THREE.Color(0.16, 0.52, 1.0), new THREE.Color(1.0, 0.42, 0.06)];
export const PORTAL_HEX = [0x2f8bff, 0xff7a12];

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// periodic noise around the rim (angle in [0, 2pi))
float rimNoise(float ang, float k, float t, float seed){ vec2 c = vec2(cos(ang), sin(ang)) * k; return fbm(c + vec2(t, seed)); }
`;

const VERT = /* glsl */ `
in vec3 position;
in float a_box;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec3 v_local;
out float v_box;
void main(){
  v_local = position;
  v_box = a_box;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SURFACE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_view;
uniform vec2 u_screen;
uniform float u_mode;      // 0 unlinked membrane, 1 view, 2 recursion-limit membrane
uniform vec3 u_color;
uniform float u_open;      // 0..1 opening animation (radius scale)
uniform float u_time;
uniform float u_near;      // 1 = the near-plane box is active (camera inside the opening)
uniform float u_seed;
uniform float u_flash;     // brief white-hot flash when opening
uniform vec2 u_half;
in vec3 v_local;
in float v_box;
out vec4 o;
${NOISE_GLSL}
void main(){
  vec2 p = v_local.xy / u_half;
  float r = length(p);
  float ang = atan(p.y, p.x) + 3.14159265;
  float wob = (rimNoise(ang, 2.2, u_time * 0.9, u_seed) - 0.5) * 0.045;
  float edge = u_open * (0.975 + wob);
  bool box = v_box > 0.5;
  if (box) { if (u_near < 0.5) discard; }
  else if (r > edge) discard;
  vec3 col;
  vec2 suv = gl_FragCoord.xy / u_screen;
  if (u_mode > 0.5 && u_mode < 1.5) {
    // slight refraction wobble right at the rim
    float rimK = box ? 0.0 : smoothstep(edge - 0.16, edge, r);
    vec2 jitter = (vec2(vnoise(p * 7.0 + u_time * 1.3), vnoise(p * 7.0 - u_time * 1.1)) - 0.5) * 0.004 * rimK;
    col = texture(u_view, suv + jitter).rgb;
  } else {
    // swirling membrane
    float sw = fbm(vec2(ang * 1.2 - r * 3.5 + u_time * 0.6, r * 4.0 - u_time * 0.8) + u_seed);
    float sw2 = fbm(vec2(ang * 3.0 + r * 6.0 - u_time * 1.4, r * 9.0) + u_seed * 2.0);
    float dim = u_mode > 1.5 ? 0.55 : 1.0;
    col = u_color * dim * (0.06 + 0.55 * pow(sw, 2.2) + 0.3 * sw2 * smoothstep(0.2, 1.0, r));
    col += u_color * dim * 1.2 * smoothstep(0.55, 1.0, r);
  }
  if (!box) {
    // burning rim: bright band with flame tongues licking inward
    float d = max(edge - r, 0.0);
    float flames = rimNoise(ang, 5.5, u_time * 1.6, u_seed + 3.0);
    float lick = fbm(vec2(ang * 7.0 + u_time * 0.7, d * 18.0 - u_time * 3.0) + u_seed);
    float band = exp(-d / (0.045 + 0.06 * flames * lick));
    vec3 hot = mix(u_color * 3.5, vec3(1.0) * 4.5 + u_color * 2.0, smoothstep(0.75, 1.0, band) * 0.6);
    col = mix(col, hot, clamp(band * (0.65 + 0.55 * lick), 0.0, 1.0));
    col += u_color * 0.35 * exp(-d / 0.18);
  }
  col += vec3(1.0) * u_flash * 6.0 * (1.0 - r);
  o = vec4(col, 1.0);
}`;

const GLOW_FRAG = /* glsl */ `
precision highp float;
uniform vec3 u_color;
uniform float u_open;
uniform float u_time;
uniform float u_seed;
uniform float u_flash;
uniform float u_fade;
uniform vec2 u_half;
in vec3 v_local;
in float v_box;
out vec4 o;
${NOISE_GLSL}
void main(){
  vec2 p = v_local.xy / u_half;
  float r = length(p);
  float ang = atan(p.y, p.x) + 3.14159265;
  float wob = (rimNoise(ang, 2.2, u_time * 0.9, u_seed) - 0.5) * 0.045;
  float edge = u_open * (0.975 + wob);
  float d = r - edge;
  float flames = rimNoise(ang, 6.0, u_time * 2.0, u_seed + 7.0);
  float tongues = pow(rimNoise(ang, 11.0, u_time * 2.6, u_seed + 11.0), 3.0);
  float outer = d > 0.0 ? exp(-d / (0.045 + 0.08 * flames)) * (0.7 + 1.8 * tongues) + exp(-d / 0.25) * 0.3 : 0.0;
  float ring = exp(-abs(d) / 0.022) * (0.9 + 0.7 * flames);
  vec3 c = u_color * (outer * 2.4 + ring * 4.0) * u_fade + u_color * u_flash * exp(-max(d, 0.0) / 0.4) * 3.0;
  o = vec4(c, 0.0);
}`;

/** Surface quad (front, slightly larger than the opening for the halo) + the near-plane box. */
function surfaceGeometry(): THREE.BufferGeometry {
  const hw = PORTAL_HW, hh = PORTAL_HH, z0 = 0, z1 = -0.14;
  const pos: number[] = [], box: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], isBox: number) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) box.push(isBox);
  };
  // front (faces +z)
  quad([-hw, -hh, z0], [hw, -hh, z0], [hw, hh, z0], [-hw, hh, z0], 0);
  // box: back face (faces +z, seen from in front through the clipped wall) and the four sides
  quad([-hw, -hh, z1], [hw, -hh, z1], [hw, hh, z1], [-hw, hh, z1], 1);
  quad([-hw, -hh, z0], [-hw, hh, z0], [-hw, hh, z1], [-hw, -hh, z1], 1);
  quad([hw, -hh, z1], [hw, hh, z1], [hw, hh, z0], [hw, -hh, z0], 1);
  quad([-hw, hh, z1], [-hw, hh, z0], [hw, hh, z0], [hw, hh, z1], 1);
  quad([-hw, -hh, z0], [-hw, -hh, z1], [hw, -hh, z1], [hw, -hh, z0], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('a_box', new THREE.Float32BufferAttribute(box, 1));
  return g;
}

function glowGeometry(): THREE.BufferGeometry {
  const s = 1.45;
  const hw = PORTAL_HW * s, hh = PORTAL_HH * s;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, -hh, 0, hw, hh, 0, -hw, hh, 0], 3));
  g.setAttribute('a_box', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 1));
  return g;
}

let SURF_GEO: THREE.BufferGeometry | null = null;
let GLOW_GEO: THREE.BufferGeometry | null = null;
const _size = new THREE.Vector2();

export class PortalVisual {
  readonly root = new THREE.Group();
  readonly surface: THREE.Mesh;
  readonly glow: THREE.Mesh;
  readonly surfMat: THREE.RawShaderMaterial;
  readonly glowMat: THREE.RawShaderMaterial;
  open = 0;
  closing = false;
  /** 0..1 closing animation progress. */
  closeT = 0;
  private flash = 1;
  private readonly seed = Math.random() * 100;

  constructor(readonly color: number, frame: PortalFrame) {
    SURF_GEO ??= surfaceGeometry();
    GLOW_GEO ??= glowGeometry();
    const c = PORTAL_COLORS[color];
    const common = {
      u_color: { value: c.clone() },
      u_open: { value: 0 },
      u_time: { value: 0 },
      u_seed: { value: this.seed },
      u_flash: { value: 1 },
      u_half: { value: new THREE.Vector2(PORTAL_HW, PORTAL_HH) },
    };
    this.surfMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: SURFACE_FRAG,
      uniforms: { ...common, u_view: { value: null }, u_screen: { value: new THREE.Vector2(1, 1) }, u_mode: { value: 0 }, u_near: { value: 0 } },
      side: THREE.DoubleSide,
    });
    this.glowMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: GLOW_FRAG,
      uniforms: { ...common, u_fade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.surface = new THREE.Mesh(SURF_GEO, this.surfMat);
    this.surface.frustumCulled = false;
    this.surface.renderOrder = -50;
    this.surface.onBeforeRender = (r) => {
      const rt = r.getRenderTarget();
      if (rt) this.surfMat.uniforms.u_screen.value.set(rt.width, rt.height);
      else this.surfMat.uniforms.u_screen.value.copy(r.getDrawingBufferSize(_size));
    };
    this.glow = new THREE.Mesh(GLOW_GEO, this.glowMat);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 10;
    this.glow.position.z = 0.004;
    this.surface.position.z = 0.003;
    this.root.add(this.surface, this.glow);
    this.setFrame(frame);
  }

  setFrame(f: PortalFrame) {
    this.root.matrixAutoUpdate = false;
    f.matrix(this.root.matrix);
    this.root.matrixWorldNeedsUpdate = true;
  }

  /** Per frame: opening / closing animation. Returns false when fully closed. */
  update(dt: number, time: number): boolean {
    if (this.closing) {
      this.closeT = Math.min(1, this.closeT + dt / 0.28);
      this.open = Math.max(0, 1 - this.closeT * this.closeT) * 1;
    } else if (this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt / 0.34);
      const t = this.openT, c1 = 1.9, c3 = c1 + 1;
      // ease-out-back: overshoots a little, then settles
      this.open = t >= 1 ? 1 : Math.max(0.001, 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
    }
    this.flash = Math.max(0, this.flash - dt * 3.2);
    const u = this.surfMat.uniforms, g = this.glowMat.uniforms;
    u.u_open.value = g.u_open.value = Math.max(0.001, this.open);
    u.u_time.value = g.u_time.value = time;
    u.u_flash.value = g.u_flash.value = this.flash * this.flash;
    g.u_fade.value = this.closing ? 1 - this.closeT : 1;
    return !(this.closing && this.closeT >= 1);
  }
  private openT = 0;

  /** Configure for a view: hidden, membrane (unlinked / recursion limit) or a view texture. */
  show(mode: 'hidden' | 'membrane' | 'deep' | 'view', tex: THREE.Texture | null = null, near = false) {
    const hidden = mode === 'hidden';
    this.surface.visible = !hidden;
    this.glow.visible = !hidden;
    const u = this.surfMat.uniforms;
    u.u_mode.value = mode === 'view' ? 1 : mode === 'deep' ? 2 : 0;
    u.u_view.value = tex;
    u.u_near.value = near ? 1 : 0;
  }

  dispose() {
    this.root.removeFromParent();
    this.surfMat.dispose();
    this.glowMat.dispose();
  }
}

// ------------------------------------------------------------------------------- virtual camera
const _m = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _n = new THREE.Vector3();
const _pt = new THREE.Vector3();

/**
 * Place `out` where `parent` would be if it were moved through the portal (`m` = entry→exit),
 * with `baseProj` as the projection and the near plane replaced by the exit portal's plane
 * (pushed `bias` m into the room so the wall the portal sits on is always clipped).
 */
export function virtualCamera(out: THREE.PerspectiveCamera, parent: THREE.Camera, baseProj: THREE.Matrix4, fov: number, aspect: number, m: THREE.Matrix4, exit: PortalFrame, bias = 0.004) {
  parent.updateMatrixWorld();
  _m.multiplyMatrices(m, parent.matrixWorld);
  _m.decompose(out.position, out.quaternion, out.scale);
  out.scale.set(1, 1, 1);
  out.fov = fov;
  out.aspect = aspect;
  out.updateMatrixWorld(true);
  out.projectionMatrix.copy(baseProj);
  // oblique near plane (Lengyel): clip plane in camera space, keeping the side the exit faces
  _n.copy(exit.n);
  _pt.copy(exit.c).addScaledVector(exit.n, bias);
  _plane.setFromNormalAndCoplanarPoint(_n, _pt);
  _plane.applyMatrix4(out.matrixWorldInverse);
  _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  // the camera must be behind the plane (it looks through the exit from inside the wall)
  if (_plane.constant >= 0) {
    out.projectionMatrixInverse.copy(out.projectionMatrix).invert();
    return;
  }
  const e = out.projectionMatrix.elements;
  _q.x = (Math.sign(_clip.x) + e[8]) / e[0];
  _q.y = (Math.sign(_clip.y) + e[9]) / e[5];
  _q.z = -1.0;
  _q.w = (1.0 + e[10]) / e[14];
  _clip.multiplyScalar(2.0 / _clip.dot(_q));
  e[2] = _clip.x;
  e[6] = _clip.y;
  e[10] = _clip.z + 1.0;
  e[14] = _clip.w;
  out.projectionMatrixInverse.copy(out.projectionMatrix).invert();
}

const _corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _v4 = new THREE.Vector4();
const _vp = new THREE.Matrix4();

/** Screen rect [x0, y0, x1, y1] (0..1) covered by the portal's opening from `cam` (null = off screen). */
export function portalScreenRect(f: PortalFrame, cam: THREE.Camera, margin = 0.08): number[] | null {
  _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const hw = PORTAL_HW * (1 + margin), hh = PORTAL_HH * (1 + margin);
  _corners[0].copy(f.c).addScaledVector(f.right, -hw).addScaledVector(f.up, -hh);
  _corners[1].copy(f.c).addScaledVector(f.right, hw).addScaledVector(f.up, -hh);
  _corners[2].copy(f.c).addScaledVector(f.right, hw).addScaledVector(f.up, hh);
  _corners[3].copy(f.c).addScaledVector(f.right, -hw).addScaledVector(f.up, hh);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let behind = 0;
  for (const c of _corners) {
    _v4.set(c.x, c.y, c.z, 1).applyMatrix4(_vp);
    if (_v4.w <= 1e-4) { behind++; continue; }
    const x = _v4.x / _v4.w, y = _v4.y / _v4.w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (behind === 4) return null;
  if (behind > 0) return [0, 0, 1, 1];
  const r = [x0 * 0.5 + 0.5, y0 * 0.5 + 0.5, x1 * 0.5 + 0.5, y1 * 0.5 + 0.5];
  if (r[2] < 0 || r[3] < 0 || r[0] > 1 || r[1] > 1) return null;
  return [Math.max(0, r[0]), Math.max(0, r[1]), Math.min(1, r[2]), Math.min(1, r[3])];
}

// ------------------------------------------------------------------------------- particles
const MAX_P = 1500;

function sparkTexture(): THREE.Texture {
  const s = 64;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const dx = (x + 0.5) / s - 0.5, dy = (y + 0.5) / s - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - r);
      const v = Math.pow(a, 2.2) * 0.85 + Math.pow(a, 10) * 0.15;
      const i = (y * s + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(v * 255);
    }
  const t = new THREE.DataTexture(data, s, s);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** Additive HDR spark particles (CPU simulated). */
export class SparkFx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX_P * 3);
  private col = new Float32Array(MAX_P * 3);
  private vel = new Float32Array(MAX_P * 3);
  private base = new Float32Array(MAX_P * 3);
  private life = new Float32Array(MAX_P);
  private age = new Float32Array(MAX_P);
  private drag = new Float32Array(MAX_P);
  private grav = new Float32Array(MAX_P);
  private n = 0;

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.PointsMaterial({ size: 0.07, sizeAttenuation: true, vertexColors: true, map: sparkTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, intensity: number, life: number, drag = 2, gravity = 0) {
    if (this.n >= MAX_P) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.base[i * 3] = color.r * intensity; this.base[i * 3 + 1] = color.g * intensity; this.base[i * 3 + 2] = color.b * intensity;
    this.life[i] = life;
    this.age[i] = 0;
    this.drag[i] = drag;
    this.grav[i] = gravity;
  }

  update(dt: number) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i] + dt;
      if (a >= this.life[i]) continue;
      const k = Math.exp(-this.drag[i] * dt);
      const i3 = i * 3, j3 = j * 3;
      const vx = this.vel[i3] * k, vy = this.vel[i3 + 1] * k - this.grav[i] * dt, vz = this.vel[i3 + 2] * k;
      this.vel[j3] = vx; this.vel[j3 + 1] = vy; this.vel[j3 + 2] = vz;
      this.pos[j3] = this.pos[i3] + vx * dt; this.pos[j3 + 1] = this.pos[i3 + 1] + vy * dt; this.pos[j3 + 2] = this.pos[i3 + 2] + vz * dt;
      this.base[j3] = this.base[i3]; this.base[j3 + 1] = this.base[i3 + 1]; this.base[j3 + 2] = this.base[i3 + 2];
      this.life[j] = this.life[i];
      this.age[j] = a;
      this.drag[j] = this.drag[i];
      this.grav[j] = this.grav[i];
      const t = a / this.life[j];
      const f = (1 - t) * (1 - t) * Math.min(1, a * 30);
      this.col[j3] = this.base[j3] * f; this.col[j3 + 1] = this.base[j3 + 1] * f; this.col[j3 + 2] = this.base[j3 + 2] * f;
      j++;
    }
    this.n = j;
    const g = this.points.geometry;
    g.setDrawRange(0, j);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

/** A flying portal shot: a white-hot core in a coloured, stretched glow. */
export class ShotBolt {
  readonly obj = new THREE.Group();
  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  constructor(color: number) {
    const c = PORTAL_COLORS[color];
    const geo = new THREE.SphereGeometry(1, 16, 10);
    this.core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).lerp(c, 0.25).multiplyScalar(14), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.halo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(4), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.core.scale.set(0.035, 0.035, 0.32);
    this.halo.scale.set(0.09, 0.09, 0.75);
    this.obj.add(this.core, this.halo);
    for (const m of [this.core, this.halo]) m.frustumCulled = false;
  }
  place(p: THREE.Vector3, dir: THREE.Vector3) {
    this.obj.position.copy(p);
    this.obj.quaternion.setFromUnitVectors(_zAxis, dir);
  }
  dispose() {
    this.obj.removeFromParent();
    for (const m of [this.core, this.halo]) (m.material as THREE.Material).dispose();
  }
}
const _zAxis = new THREE.Vector3(0, 0, 1);
