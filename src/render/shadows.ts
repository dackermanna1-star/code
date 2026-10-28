/**
 * Sun shadows near the observer: two orthographic cascades (≈±400 m and
 * ±4 km) centred ahead of the camera, rendered from the primary star's
 * direction. Casters: terrain (with the same geomorph as the main view),
 * rocks, plants, animals and the spacecraft. Receivers: terrain and scatter
 * materials (shared uniforms), with 3×3 PCF and normal-offset bias.
 *
 * Cascade centres are snapped to whole shadow texels in planet-fixed light
 * space, so shadows do not shimmer as the camera moves. Further away the
 * terrain relies on macro-normal self-shadowing (no long mountain shadows).
 */
import * as THREE from 'three';

export const SHADOW_SIZE = 2048;
const EXTENTS = [400, 4000];
const DEPTHS = [3000, 16000];

export const SUN_SHADOW_GLSL = /* glsl */ `
uniform sampler2D uShadow0, uShadow1;
uniform mat4 uShadowM0, uShadowM1;
uniform float uShadowOn;
uniform vec2 uShadowBias;    // depth-units bias per cascade
float shadowPCF(sampler2D m, vec3 c, float bias) {
  float t = 1.0 / ${SHADOW_SIZE}.0;
  float s = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float d = texture(m, c.xy + vec2(float(x), float(y)) * t).r;
    s += c.z - bias <= d ? 1.0 : 0.0;
  }
  return s / 9.0;
}
float sunShadow(vec3 P, vec3 N) {
  if (uShadowOn < 0.5) return 1.0;
  vec4 c0 = uShadowM0 * vec4(P + N * 0.12, 1.0);
  vec3 p0 = c0.xyz / c0.w * 0.5 + 0.5;
  vec2 e0 = min(p0.xy, 1.0 - p0.xy);
  float w0 = smoothstep(0.0, 0.06, min(e0.x, e0.y));
  vec4 c1 = uShadowM1 * vec4(P + N * 1.0, 1.0);
  vec3 p1 = c1.xyz / c1.w * 0.5 + 0.5;
  vec2 e1 = min(p1.xy, 1.0 - p1.xy);
  float w1 = smoothstep(0.0, 0.08, min(e1.x, e1.y));
  float s1 = (w1 > 0.0 && p1.z < 1.0) ? mix(1.0, shadowPCF(uShadow1, p1, uShadowBias.y), w1) : 1.0;
  if (w0 > 0.0 && p0.z < 1.0) return mix(s1, shadowPCF(uShadow0, p0, uShadowBias.x), w0);
  return s1;
}
`;

/** Uniforms every receiver material carries (shared objects, updated in place). */
export function shadowUniforms(): Record<string, THREE.IUniform> {
  return {
    uShadow0: { value: null },
    uShadow1: { value: null },
    uShadowM0: { value: new THREE.Matrix4() },
    uShadowM1: { value: new THREE.Matrix4() },
    uShadowOn: { value: 0 },
    uShadowBias: { value: new THREE.Vector2() },
  };
}

const DEPTH_VERT_TERRAIN = /* glsl */ `
attribute vec4 a1;
attribute vec3 morph;
uniform float uLodK;
void main() {
  vec4 wp0 = modelMatrix * vec4(position, 1.0);
  float dist = length(wp0.xyz);           // distance to the main camera (world origin)
  float mEnd = 2.0 * uLodK * a1.w;
  float m = smoothstep(0.62 * mEnd, 0.95 * mEnd, dist);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position + morph * m, 1.0);
}
`;

const DEPTH_VERT_GENERIC = /* glsl */ `
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * p;
}
`;

const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

export class SunShadows {
  readonly targets: THREE.WebGLRenderTarget[];
  readonly cams: THREE.OrthographicCamera[];
  private terrainDepth: THREE.ShaderMaterial;
  private genericDepth: THREE.ShaderMaterial;
  /** cascade matrices in planet-fixed space (re-expressed for the camera every frame) */
  private mPF = EXTENTS.map(() => new THREE.Matrix4());
  private valid = EXTENTS.map(() => false);
  private planetId = '';
  private frame = 0;
  enabled = true;

  constructor() {
    this.targets = EXTENTS.map(() => {
      const rt = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true, type: THREE.UnsignedByteType });
      rt.depthTexture = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE, THREE.FloatType);
      rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
      return rt;
    });
    this.cams = EXTENTS.map((e, i) => new THREE.OrthographicCamera(-e, e, e, -e, 1, DEPTHS[i] * 2));
    this.terrainDepth = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT_TERRAIN, fragmentShader: DEPTH_FRAG, uniforms: { uLodK: { value: 3.5 } }, side: THREE.DoubleSide });
    this.genericDepth = new THREE.ShaderMaterial({ vertexShader: DEPTH_VERT_GENERIC, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
  }

  /**
   * Render both cascades.
   * scene: the main scene; casters: roots whose meshes cast shadows;
   * terrainMat: the terrain material (its meshes get the geomorph depth
   * shader); rel/rot: planet centre (camera-relative) and orientation;
   * camBody: camera in planet-fixed coordinates; L: unit vector toward the
   * star (world); fwd: camera forward (world); recv: receiver uniforms.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, casters: THREE.Object3D[], terrainMat: THREE.Material, lodK: number,
    rel: THREE.Vector3, rot: THREE.Quaternion, camBody: THREE.Vector3, L: THREE.Vector3, fwd: THREE.Vector3, recv: Record<string, THREE.IUniform>, planetId = '') {
    this.frame++;
    if (planetId !== this.planetId) { this.planetId = planetId; this.valid.fill(false); }
    // planet-fixed → world (camera-relative) and back
    const pfToWorld = new THREE.Matrix4().compose(rel, rot, new THREE.Vector3(1, 1, 1));
    const worldToPf = pfToWorld.clone().invert();
    // update one cascade per frame (both on the first frame); keep the other aligned
    const todo = this.valid.every((v) => v) ? [this.frame % 2] : [0, 1];
    const inv = rot.clone().invert();
    const Lpf = L.clone().applyQuaternion(inv);
    const upB = camBody.clone().normalize();
    const ref = Math.abs(Lpf.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = new THREE.Vector3().crossVectors(ref, Lpf).normalize();
    const up = new THREE.Vector3().crossVectors(Lpf, right);
    const fwdB = fwd.clone().applyQuaternion(inv);
    fwdB.addScaledVector(upB, -fwdB.dot(upB));
    if (fwdB.lengthSq() > 1e-8) fwdB.normalize();
    // hide everything that is not a caster; swap caster materials for depth-only ones
    const saved: { o: THREE.Object3D; vis: boolean }[] = [];
    for (const c of scene.children) { saved.push({ o: c, vis: c.visible }); c.visible = false; }
    const swapped: { m: THREE.Mesh; mat: THREE.Material | THREE.Material[] }[] = [];
    const hidden: THREE.Object3D[] = [];
    for (const root of casters) {
      let top: THREE.Object3D = root;
      while (top.parent && top.parent !== scene) top = top.parent;
      top.visible = true;
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((o as THREE.Points).isPoints || (o as THREE.LineSegments).isLineSegments) { if (o.visible) { hidden.push(o); o.visible = false; } return; }
        if (!mesh.isMesh) return;
        swapped.push({ m: mesh, mat: mesh.material });
        mesh.material = mesh.material === terrainMat ? this.terrainDepth : this.genericDepth;
      });
    }
    this.terrainDepth.uniforms.uLodK.value = lodK;
    const prevTarget = renderer.getRenderTarget();
    const ac = renderer.autoClear;
    renderer.autoClear = true;
    const prevClear = renderer.getClearAlpha();
    const nearOnly: THREE.Object3D[] = [];
    for (const root of casters) root.traverse((o) => { if (o.userData.nearShadowOnly && o.visible) nearOnly.push(o); });
    for (const i of todo) {
      const e = EXTENTS[i], D = DEPTHS[i];
      for (const o of nearOnly) o.visible = i === 0;
      const texel = (2 * e) / SHADOW_SIZE;
      // centre ahead of the camera on the ground, snapped to texels in planet-fixed light space
      const cpf = camBody.clone().addScaledVector(fwdB, e * 0.45);
      const cx = cpf.dot(right), cy = cpf.dot(up);
      cpf.addScaledVector(right, Math.round(cx / texel) * texel - cx).addScaledVector(up, Math.round(cy / texel) * texel - cy);
      const centre = cpf.applyQuaternion(rot).add(rel);
      const cam = this.cams[i];
      cam.position.copy(centre).addScaledVector(L, D);
      cam.up.copy(up).applyQuaternion(rot);
      cam.lookAt(centre);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      renderer.setRenderTarget(this.targets[i]);
      renderer.clear(true, true, false);
      renderer.render(scene, cam);
      this.mPF[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(pfToWorld);
      this.valid[i] = true;
      recv[i === 0 ? 'uShadow0' : 'uShadow1'].value = this.targets[i].depthTexture;
    }
    for (const o of nearOnly) o.visible = true;
    for (let i = 0; i < 2; i++) (recv[i === 0 ? 'uShadowM0' : 'uShadowM1'].value as THREE.Matrix4).multiplyMatrices(this.mPF[i], worldToPf);
    (recv.uShadowBias.value as THREE.Vector2).set(0.6 / (2 * DEPTHS[0]), 4 / (2 * DEPTHS[1]));
    recv.uShadowOn.value = 1;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = ac;
    renderer.setClearAlpha(prevClear);
    for (const s of swapped) s.m.material = s.mat;
    for (const h of hidden) h.visible = true;
    for (const s of saved) s.o.visible = s.vis;
  }

  dispose() {
    for (const t of this.targets) t.dispose();
    this.terrainDepth.dispose();
    this.genericDepth.dispose();
  }
}
