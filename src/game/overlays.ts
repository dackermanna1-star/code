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

const CRACK_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D u_linDepth;
uniform vec2 u_res;
uniform float u_stage;
uniform float u_seed;
in float v_depth;
in vec3 v_local;
out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453); }
void main() {
  float d = texture(u_linDepth, gl_FragCoord.xy / u_res).r;
  if (v_depth > d + 0.03 + d * 0.004) discard;
  // pick the two coordinates of the face
  vec3 a = abs(v_local - 0.5);
  vec2 uv = a.x > a.y && a.x > a.z ? v_local.zy : a.y > a.z ? v_local.xz : v_local.xy;
  // voronoi cracks growing with stage
  vec2 p = uv * 5.0;
  vec2 ip = floor(p), fp = fract(p);
  float m1 = 9.0, m2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 r = g + vec2(h(ip + g), h(ip + g + 7.3)) - fp;
    float dd = dot(r, r);
    if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
  }
  float edge = sqrt(m2) - sqrt(m1);
  float centre = length(uv - 0.5);
  float grow = u_stage / 9.0;
  float crack = smoothstep(0.08, 0.0, edge) * step(centre, 0.15 + grow * 0.6);
  if (crack < 0.5) discard;
  o = vec4(0.0, 0.0, 0.0, 0.75);
}`;
const CRACK_VERT = /* glsl */ `
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
      uniforms: { u_linDepth: { value: null }, u_res: res, u_stage: { value: 0 }, u_seed: { value: 0 }, u_boxMin: { value: new THREE.Vector3() }, u_boxSize: { value: new THREE.Vector3(1, 1, 1) } },
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
      const def = BLOCKS[m.state >>> 4];
      void def;
      const b = t?.boxes ?? [m.x, m.y, m.z, m.x + 1, m.y + 1, m.z + 1];
      this.crackMat.uniforms.u_boxMin.value.set(b[0] - 0.003, b[1] - 0.003, b[2] - 0.003);
      this.crackMat.uniforms.u_boxSize.value.set(b[3] - b[0] + 0.006, b[4] - b[1] + 0.006, b[5] - b[2] + 0.006);
      this.crackMat.uniforms.u_stage.value = Math.min(9, Math.floor(m.progress * 10));
      this.crackMat.uniforms.u_seed.value = (m.x * 7 + m.y * 13 + m.z * 17) % 100;
    }
  }
}
