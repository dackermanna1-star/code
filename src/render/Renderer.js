// WebGL renderer, HDR scene target and the final post-processing pass
// (ACES tone mapping, colour grading, vignette, grain, damage / low-health / infection effects).
import * as THREE from 'three';
import { globalUniforms } from './materials.js';

const POST_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform float uTime;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uGrain;
uniform float uDamage;
uniform float uLowHealth;
uniform float uWobble;
uniform float uChroma;
uniform float uFlash;
uniform float uSick;
uniform float uBlackout;
uniform float uDesat;
uniform vec2 uRes;
in vec2 vUv;
out vec4 fragColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec2 uv = vUv;
  if (uWobble > 0.0) {
    uv += vec2(sin(uv.y * 9.0 + uTime * 1.7), cos(uv.x * 7.0 + uTime * 1.3)) * 0.004 * uWobble;
  }
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  vec3 col;
  float ca = uChroma * 0.006 + uDamage * 0.004;
  if (ca > 0.0001) {
    col.r = texture(tScene, uv + dc * ca).r;
    col.g = texture(tScene, uv).g;
    col.b = texture(tScene, uv - dc * ca).b;
  } else {
    col = texture(tScene, uv).rgb;
  }
  col *= uExposure;
  col += vec3(uFlash);
  col = aces(col);
  // grading: split toning + saturation + contrast
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.0, 0.7, l));
  float sat = uSaturation * (1.0 - uLowHealth * 0.7) * (1.0 - uDesat);
  col = mix(vec3(l), col, sat);
  col = (col - 0.5) * uContrast + 0.5;
  // sickness: queasy green tint
  col = mix(col, col * vec3(0.85, 1.05, 0.8), uSick * 0.6);
  col = clamp(col, 0.0, 1.0);
  // vignette (stronger when hurt)
  float vig = smoothstep(0.85, 0.15, r2 * (1.0 + uLowHealth * 0.8)) ;
  col *= mix(1.0, vig, uVignette + uLowHealth * 0.35);
  // damage: red edges pulse
  float pulse = 0.65 + 0.35 * sin(uTime * 6.0);
  float edge = smoothstep(0.08, 0.45, r2);
  col = mix(col, vec3(0.45, 0.0, 0.0), edge * (uDamage * 0.85 + uLowHealth * 0.4 * pulse));
  // film grain
  float g = hash(uv * uRes + fract(uTime * 13.7) * 100.0) - 0.5;
  col += g * uGrain * (1.0 - l * 0.5);
  col *= 1.0 - uBlackout;
  fragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
}
`;

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scale = 1;

    this.rt = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.post = {
      tScene: { value: this.rt.texture },
      uTime: globalUniforms.uTime,
      uExposure: { value: 1.0 },
      uSaturation: { value: 0.92 },
      uContrast: { value: 1.08 },
      uShadowTint: { value: new THREE.Vector3(0.94, 1.0, 1.04) },
      uHighTint: { value: new THREE.Vector3(1.04, 1.0, 0.94) },
      uVignette: { value: 0.35 },
      uGrain: { value: 0.035 },
      uDamage: { value: 0 },
      uLowHealth: { value: 0 },
      uWobble: { value: 0 },
      uChroma: { value: 0 },
      uFlash: { value: 0 },
      uSick: { value: 0 },
      uBlackout: { value: 0 },
      uDesat: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    };
    this.postMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: this.post,
      depthTest: false,
      depthWrite: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.postQuad = new THREE.Mesh(tri, this.postMat);
    this.postQuad.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.postQuad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Directional shadow map (sun / moon) for the voxel terrain. */
  initShadows(group, atlas) {
    const size = 2048;
    this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.shadowRT.depthTexture = new THREE.DepthTexture(size, size);
    this.shadowRT.depthTexture.type = THREE.UnsignedIntType;
    this.shadowCam = new THREE.OrthographicCamera(-70, 70, 70, -70, 1, 320);
    this.shadowScene = new THREE.Scene();
    this.shadowScene.overrideMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `in vec4 aData; out vec3 vUvL; void main(){ vUvL = vec3(uv / 32.0, aData.z + aData.w * 256.0); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position / 32.0, 1.0); }`,
      fragmentShader: `precision highp float; precision highp sampler2DArray; uniform sampler2DArray uAtlas; in vec3 vUvL; out vec4 fragColor; void main(){ if (texture(uAtlas, vUvL).a < 0.5) discard; fragColor = vec4(1.0); }`,
      uniforms: { uAtlas: { value: atlas } },
      side: THREE.DoubleSide,
    });
    this.shadowGroup = group;
    globalUniforms.uShadowMap.value = this.shadowRT.depthTexture;
    globalUniforms.uShadowTexel.value = 1 / size;
    this.shadowsEnabled = true;
  }

  renderShadows(center) {
    if (!this.shadowsEnabled || !this.shadowGroup) { globalUniforms.uShadowOn.value = 0; return; }
    const sun = globalUniforms.uSunDir.value;
    if (sun.y < 0.08) { globalUniforms.uShadowOn.value = 0; return; }
    const cam = this.shadowCam;
    // snap the centre to shadow texels to avoid shimmering
    const texel = 140 / this.shadowRT.width;
    const up = Math.abs(sun.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, sun).normalize();
    const camUp = new THREE.Vector3().crossVectors(sun, right).normalize();
    const c = center.clone();
    const r = Math.round(c.dot(right) / texel) * texel - c.dot(right);
    const u = Math.round(c.dot(camUp) / texel) * texel - c.dot(camUp);
    c.addScaledVector(right, r).addScaledVector(camUp, u);
    cam.position.copy(c).addScaledVector(sun, 160);
    cam.up.copy(camUp);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    globalUniforms.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const group = this.shadowGroup, parent = group.parent;
    // translucent sections (water, glass) don't cast
    const hidden = [];
    for (const m of group.children) if (m.renderOrder === 2 && m.visible) { m.visible = false; hidden.push(m); }
    this.shadowScene.add(group);
    const rr = this.renderer;
    rr.setRenderTarget(this.shadowRT);
    rr.clear(true, true, false);
    rr.render(this.shadowScene, cam);
    if (parent) parent.add(group);
    for (const m of hidden) m.visible = true;
    globalUniforms.uShadowOn.value = 1;
  }

  setQuality(q) {
    this.scale = q === 'low' ? 0.6 : q === 'medium' ? 0.85 : 1;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * this.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const W = Math.max(1, Math.floor(w * pr)), H = Math.max(1, Math.floor(h * pr));
    this.rt.setSize(W, H);
    this.post.uRes.value.set(W, H);
    this.onResize?.(w, h);
  }

  /** Render the world scene, then optional overlay (viewmodel) into the HDR target, then post to screen. */
  render(overlay, shadowCenter) {
    const r = this.renderer;
    if (shadowCenter) this.renderShadows(shadowCenter);
    r.setRenderTarget(this.rt);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    if (overlay) overlay(r);
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.postScene, this.postCam);
  }
}
