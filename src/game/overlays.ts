/**
 * Selection outline and block-breaking crack overlay (post-TAA overlay scene, depth tested
 * against the scene's linear depth in the shader).
 */
import * as THREE from 'three';
import type { Game } from './game';
import type { GameSystem } from './systems';
import { BLOCKS } from '../world/blocks/registry';

const OUTLINE_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out float v_depth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  v_depth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const OUTLINE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_linDepth;
uniform vec2 u_res;
uniform vec4 u_color;
in float v_depth;
out vec4 o;
void main() {
  float d = texture(u_linDepth, gl_FragCoord.xy / u_res).r;
  if (v_depth > d + 0.02 + d * 0.004) discard;
  o = u_color;
}`;

export const CRACK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_linDepth;
uniform vec2 u_res;
uniform float u_progress;
uniform float u_seed;
uniform vec3 u_boxSize;
in float v_depth;
in vec3 v_local;
out vec4 o;
float h1(float n) { return fract(sin(n * 12.9898 + u_seed * 78.233) * 43758.5453); }
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 3.7) * 43758.5453); }
float vnoise(float x) { float i = floor(x), f = fract(x); return mix(h1(i), h1(i + 1.0), f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0; }
// distance to a jagged crack starting at c along angle a, visible up to length len
float crackLine(vec2 p, vec2 c, float a, float len, float salt, out float along) {
  vec2 d = vec2(cos(a), sin(a));
  vec2 q = p - c;
  float t = dot(q, d);
  float s = q.x * d.y - q.y * d.x;
  along = t / max(len, 1e-3);
  float jag = (vnoise(t * 9.0 + salt) * 0.06 + vnoise(t * 23.0 + salt * 3.1) * 0.02) * smoothstep(0.0, 0.08, t);
  float w = mix(0.016, 0.003, clamp(along, 0.0, 1.0));
  float inside = step(0.0, t) * step(t, len);
  return inside > 0.5 ? abs(s - jag) - w : 1.0;
}
void main() {
  float d = texture(u_linDepth, gl_FragCoord.xy / u_res).r;
  if (v_depth > d + 0.03 + d * 0.004) discard;
  // face: the axis whose coordinate sits on the box boundary; uv in block units
  vec3 e = min(v_local, 1.0 - v_local) * u_boxSize;
  vec3 lp = v_local * u_boxSize;
  float face; vec2 uv;
  if (e.x < e.y && e.x < e.z) { uv = lp.zy; face = v_local.x < 0.5 ? 0.0 : 1.0; }
  else if (e.y < e.z) { uv = lp.xz; face = v_local.y < 0.5 ? 2.0 : 3.0; }
  else { uv = lp.xy; face = v_local.z < 0.5 ? 4.0 : 5.0; }
  float fs = face * 17.0;
  float g = clamp(u_progress, 0.0, 1.0);
  vec2 c = vec2(0.5) + (vec2(h1(fs + 1.0), h1(fs + 2.0)) - 0.5) * 0.3;
  float dist = 1.0;
  // main radial cracks (more appear as the block weakens) with side branches
  for (int i = 0; i < 7; i++) {
    float fi = float(i) + fs;
    float start = float(i) / 7.0 * 0.55;
    float grow = clamp((g - start) / 0.45, 0.0, 1.0);
    if (grow <= 0.0) continue;
    float a = (float(i) + h1(fi * 3.1)) / 7.0 * 6.2832;
    float len = (0.35 + 0.45 * h1(fi * 5.7)) * grow;
    float al;
    float dl = crackLine(uv, c, a, len, fi * 11.0, al);
    dist = min(dist, dl);
    // branch from part-way along the main crack
    float bt = 0.3 + 0.4 * h1(fi * 9.3);
    float bgrow = clamp((grow - bt) / (1.0 - bt), 0.0, 1.0);
    if (bgrow > 0.0) {
      vec2 dir = vec2(cos(a), sin(a));
      vec2 bc = c + dir * len / max(grow, 1e-3) * bt;
      float ba = a + (h1(fi * 13.7) > 0.5 ? 0.7 : -0.7);
      float bl;
      dist = min(dist, crackLine(uv, bc, ba, 0.22 * bgrow, fi * 19.0, bl) + 0.002);
    }
  }
  // late stages: the centre shatters into small chips
  float shatter = smoothstep(0.55, 1.0, g);
  if (shatter > 0.0) {
    vec2 sp = (uv - c) * 9.0;
    vec2 ip = floor(sp), fp = fract(sp);
    float m1 = 9.0, m2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 gg = vec2(x, y);
      vec2 r = gg + vec2(h2(ip + gg), h2(ip + gg + 7.3)) - fp;
      float dd = dot(r, r);
      if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
    }
    float edge = (sqrt(m2) - sqrt(m1)) / 9.0 - 0.004;
    float radius = shatter * 0.32;
    dist = min(dist, length(uv - c) < radius ? edge : 1.0);
  }
  float aa = max(fwidth(dist), 1e-4);
  float core = 1.0 - smoothstep(0.0, aa, dist);
  // chipped light rim just outside the crack gives it depth
  float lip = (1.0 - smoothstep(0.0, aa * 2.0, abs(dist - 0.006))) * (1.0 - core);
  float a = core * 0.82 + lip * 0.18;
  if (a < 0.01) discard;
  vec3 col = (vec3(0.02, 0.018, 0.015) * core * 0.82 + vec3(0.85) * lip * 0.18) / a;
  o = vec4(col, a);
}`;
export const CRACK_VERT = /* glsl */ `
precision highp float;
in vec3 position;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 u_boxMin;
uniform vec3 u_boxSize;
out float v_depth;
out vec3 v_local;
void main() {
  v_local = position + 0.5;
  vec3 p = u_boxMin + v_local * u_boxSize;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  v_depth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export class OverlaySystem implements GameSystem {
  readonly name = 'overlays';
  private scene = new THREE.Scene();
  private lines: THREE.LineSegments;
  private lineGeo = new THREE.BufferGeometry();
  private crack: THREE.Mesh;
  private outlineMat: THREE.RawShaderMaterial;
  private crackMat: THREE.RawShaderMaterial;
  private lastKey = '';

  constructor() {
    const res = { value: new THREE.Vector2(1, 1) };
    this.outlineMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: OUTLINE_VERT, fragmentShader: OUTLINE_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { u_linDepth: { value: null }, u_res: res, u_color: { value: new THREE.Vector4(0, 0, 0, 0.55) } },
    });
    this.lines = new THREE.LineSegments(this.lineGeo, this.outlineMat);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.crackMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: { u_linDepth: { value: null }, u_res: res, u_progress: { value: 0 }, u_seed: { value: 0 }, u_boxMin: { value: new THREE.Vector3() }, u_boxSize: { value: new THREE.Vector3(1, 1, 1) } },
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.crackMat);
    this.crack.frustumCulled = false;
    this.scene.add(this.crack);
  }

  init(game: Game) {
    game.renderExtras.overlayScene = this.scene;
  }

  update(game: Game) {
    const r: any = game.renderer;
    const lin = r.linDepth?.target?.texture;
    this.outlineMat.uniforms.u_linDepth.value = lin;
    this.crackMat.uniforms.u_linDepth.value = lin;
    this.outlineMat.uniforms.u_res.value.set(r.width, r.height);
    const t = game.interaction.target;
    const show = !!t && !game.player.dead && game.cameraCtl.perspective !== 'third_front';
    this.lines.visible = show;
    if (t && show) {
      const key = t.boxes.join(',');
      if (key !== this.lastKey) {
        this.lastKey = key;
        const pts: number[] = [];
        const e = 0.002;
        for (let i = 0; i < t.boxes.length; i += 6) {
          const [x0, y0, z0, x1, y1, z1] = [t.boxes[i] - e, t.boxes[i + 1] - e, t.boxes[i + 2] - e, t.boxes[i + 3] + e, t.boxes[i + 4] + e, t.boxes[i + 5] + e];
          const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
          const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
          for (const [a, b] of E) pts.push(...c[a], ...c[b]);
        }
        this.lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.lineGeo.computeBoundingSphere();
      }
    }
    const m = game.interaction.mining;
    this.crack.visible = !!m && m.progress > 0 && !game.player.creative;
    if (m && this.crack.visible) {
      // the mined block's own shape (the target can drift off it for a frame)
      const onTarget = t && t.x === m.x && t.y === m.y && t.z === m.z;
      const b = onTarget ? t!.boxes : [m.x, m.y, m.z, m.x + 1, m.y + 1, m.z + 1];
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < b.length; i += 6) {
        x0 = Math.min(x0, b[i]); y0 = Math.min(y0, b[i + 1]); z0 = Math.min(z0, b[i + 2]);
        x1 = Math.max(x1, b[i + 3]); y1 = Math.max(y1, b[i + 4]); z1 = Math.max(z1, b[i + 5]);
      }
      const e = 0.004;
      this.crackMat.uniforms.u_boxMin.value.set(x0 - e, y0 - e, z0 - e);
      this.crackMat.uniforms.u_boxSize.value.set(x1 - x0 + 2 * e, y1 - y0 + 2 * e, z1 - z0 + 2 * e);
      // smooth growth, eased so early hits already show a crack
      this.crackMat.uniforms.u_progress.value = Math.pow(Math.min(1, m.progress), 0.8);
      this.crackMat.uniforms.u_seed.value = ((m.x * 73856093) ^ (m.y * 19349663) ^ (m.z * 83492791)) % 997 / 97;
    }
  }
}
