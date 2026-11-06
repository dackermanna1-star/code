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
uniform sampler2D tExposure;
uniform float uAutoExposure;
uniform float uNight;
uniform float uUnderwater;
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
  float wob = uWobble + uUnderwater * 0.6;
  if (wob > 0.0) {
    uv += vec2(sin(uv.y * 9.0 + uTime * 1.7), cos(uv.x * 7.0 + uTime * 1.3)) * 0.004 * wob;
  }
  vec2 dc = uv - 0.5;
  float r2 = dot(dc, dc);
  vec3 col;
  float ca = uChroma * 0.006 + uDamage * 0.004;
  if (ca > 0.0001) {
    col.r = textureLod(tScene, uv + dc * ca, 0.0).r;
    col.g = textureLod(tScene, uv, 0.0).g;
    col.b = textureLod(tScene, uv - dc * ca, 0.0).b;
  } else {
    col = textureLod(tScene, uv, 0.0).rgb;
  }
  // eye adaptation (measured from the frame, see Renderer.updateExposure) x game exposure
  float autoExp = mix(1.0, texture(tExposure, vec2(0.5)).r, uAutoExposure);
  col *= uExposure * autoExp;
  col += vec3(uFlash);
  col = aces(col);
  // grading: split toning + saturation + contrast
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.0, 0.7, l));
  float sat = uSaturation * (1.0 - uLowHealth * 0.7) * (1.0 - uDesat);
  col = mix(vec3(l), col, sat);
  col = (col - 0.5) * uContrast + 0.5;
  // night vision (Purkinje shift): dim scenes lose colour and turn moonlight-blue
  float scot = uNight * (1.0 - smoothstep(0.02, 0.3, l));
  col = mix(col, vec3(l) * vec3(0.78, 0.92, 1.22), scot * 0.55);
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
  col *= 1.0 - uBlackout;
  vec3 outc = toSRGB(clamp(col, 0.0, 1.0));
  // film grain in display space (in linear space it turned dark scenes into TV static)
  float g = hash(uv * uRes + fract(uTime * 13.7) * 100.0) - 0.5;
  outc += g * uGrain * 0.75 * (1.0 - 0.5 * outc.g) * (1.0 - uBlackout);
  fragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
`;

// Eye adaptation: log-average luminance of a coarse mip of the HDR frame (centre weighted) -> exposure,
// smoothed over time (ping-pong 1x1 targets). Partial adaptation (uStrength < 1) keeps night and
// interiors darker than day while lifting them out of the ACES toe.
const EXPO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tPrev;
uniform float uLod;
uniform float uDt;
uniform float uKey;
uniform float uStrength;
uniform vec2 uRange;
uniform float uReset;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float sw = 0.0, sl = 0.0;
  for (int y = 0; y < 6; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(8.0, 6.0);
    vec3 c = textureLod(tScene, uv, uLod).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec2 d = (uv - 0.5) * vec2(1.3, 1.0);
    float w = 1.0 - 0.7 * clamp(length(d) * 1.7, 0.0, 1.0);
    sl += w * log(max(l, 0.0005));
    sw += w;
  }
  float avg = exp(sl / sw);
  float target = clamp(pow(uKey / avg, uStrength), uRange.x, uRange.y);
  float prev = texture(tPrev, vec2(0.5)).r;
  if (uReset > 0.5 || !(prev > 0.0) || prev > 100.0) prev = target;
  // dark adaptation (exposure rising) is slower than light adaptation
  float speed = target > prev ? 0.9 : 2.6;
  float e = mix(prev, target, 1.0 - exp(-uDt * speed));
  fragColor = vec4(e, avg, target, 1.0);
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
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
    });
    // mipmaps (for the exposure meter) are built once per frame, after the last render into the target
    this.rt.texture.mipmapsAutoUpdate = false;
    const expOpts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.expRT = [new THREE.WebGLRenderTarget(1, 1, expOpts), new THREE.WebGLRenderTarget(1, 1, expOpts)];
    this.expIndex = 0;
    this.autoExposure = true;
    this.maxExposureDay = 4.0;
    this.maxExposureNight = 1.5;
    this._expReset = true;
    this._lastT = performance.now();
    this.expo = {
      tScene: { value: this.rt.texture },
      tPrev: { value: this.expRT[0].texture },
      uLod: { value: 6 },
      uDt: { value: 0.016 },
      uKey: { value: 0.13 },
      uStrength: { value: 0.72 },
      uRange: { value: new THREE.Vector2(0.75, 4.2) },
      uReset: { value: 1 },
    };
    this.expoMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: POST_VERT, fragmentShader: EXPO_FRAG, uniforms: this.expo,
      depthTest: false, depthWrite: false,
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
      tExposure: { value: this.expRT[1].texture },
      uAutoExposure: { value: 1 },
      uNight: globalUniforms.uNight,
      uUnderwater: globalUniforms.uUnderwater,
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
    this.expoQuad = new THREE.Mesh(tri, this.expoMat);
    this.expoQuad.frustumCulled = false;
    this.expoScene = new THREE.Scene();
    this.expoScene.add(this.expoQuad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Directional shadow map (sun / moon) for the voxel terrain. */
  initShadows(group, atlas) {
    const size = 2048;
    this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    this.shadowRT.depthTexture = new THREE.DepthTexture(size, size);
    this.shadowRT.depthTexture.type = THREE.UnsignedIntType;
    // hardware PCF: compare + bilinear filtering (sampler2DShadow in LIGHTING_GLSL)
    this.shadowRT.depthTexture.compareFunction = THREE.LessEqualCompare;
    this.shadowRT.depthTexture.minFilter = THREE.LinearFilter;
    this.shadowRT.depthTexture.magFilter = THREE.LinearFilter;
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
    this._shadowKey = null; // cached shadow map: re-rendered only when sun / centre / chunk meshes change
    globalUniforms.uShadowMap.value = this.shadowRT.depthTexture;
    globalUniforms.uShadowTexel.value = 1 / size;
    this.shadowsEnabled = true;
  }

  renderShadows(center) {
    if (!this.shadowsEnabled || !this.shadowGroup) { globalUniforms.uShadowOn.value = 0; this._shadowKey = null; return; }
    const sun = globalUniforms.uSunDir.value;
    // fade shadows in/out with the sun (moon) height instead of popping at a threshold
    const strength = THREE.MathUtils.smoothstep(sun.y, 0.03, 0.12);
    if (strength <= 0) { globalUniforms.uShadowOn.value = 0; this._shadowKey = null; return; }
    globalUniforms.uShadowOn.value = strength;
    // The shadow map only contains static voxel terrain, so it is cached: re-render when the light moved
    // (~0.15 deg), the view centre moved > 4 blocks or a chunk mesh was rebuilt.
    const ver = this.shadowGroup.userData.meshVersion || 0;
    const K = this._shadowKey;
    if (K && K.ver === ver && K.sun.dot(sun) > 0.9999966 && K.center.distanceToSquared(center) < 16) return;
    if (!K) this._shadowKey = { ver, sun: sun.clone(), center: center.clone() };
    else { K.ver = ver; K.sun.copy(sun); K.center.copy(center); }
    this.shadowRenders = (this.shadowRenders || 0) + 1;
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
    const idx = parent ? parent.children.indexOf(group) : -1;
    this.shadowScene.add(group);
    const rr = this.renderer;
    rr.setRenderTarget(this.shadowRT);
    rr.clear(true, true, false);
    rr.render(this.shadowScene, cam);
    if (parent) {
      // put the group back at the same place in the scene graph (keeps the scene's draw order stable)
      parent.add(group);
      const ch = parent.children;
      if (idx >= 0 && ch[ch.length - 1] === group && idx < ch.length - 1) { ch.pop(); ch.splice(idx, 0, group); }
    }
    for (const m of hidden) m.visible = true;
  }

  /** Force the next frame to re-render the shadow map (e.g. after teleporting). */
  invalidateShadows() { this._shadowKey = null; }

  /** Measure the frame and update the adapted exposure (1x1 ping-pong). */
  updateExposure() {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - this._lastT) / 1000));
    this._lastT = now;
    if (!this.autoExposure) { this.post.uAutoExposure.value = 0; return; }
    this.post.uAutoExposure.value = 1;
    const src = this.expRT[this.expIndex], dst = this.expRT[1 - this.expIndex];
    const E = this.expo;
    E.tPrev.value = src.texture;
    E.uDt.value = dt;
    E.uReset.value = this._expReset ? 1 : 0;
    this._expReset = false;
    E.uLod.value = Math.max(0, Math.log2(Math.max(this.rt.width, this.rt.height) / 16));
    // eyes adapt a lot to a dim house at noon, but nights must stay dark (flashlight matters)
    E.uRange.value.y = THREE.MathUtils.lerp(this.maxExposureDay, this.maxExposureNight, globalUniforms.uNight.value);
    const r = this.renderer;
    r.setRenderTarget(dst);
    r.render(this.expoScene, this.postCam);
    this.post.tExposure.value = dst.texture;
    this.expIndex = 1 - this.expIndex;
  }

  /** Debug: read back {exposure, avgLum, target} of the last measurement (slow, GPU sync). */
  readExposure() {
    const buf = new Uint16Array(4);
    this.renderer.readRenderTargetPixels(this.expRT[this.expIndex], 0, 0, 1, 1, buf);
    const f = THREE.DataUtils.fromHalfFloat;
    return { exposure: f(buf[0]), avgLum: f(buf[1]), target: f(buf[2]) };
  }

  /** Snap the adapted exposure to the current frame next time (teleports, loading). */
  resetExposure() { this._expReset = true; }

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
    else globalUniforms.uShadowOn.value = 0;
    r.setRenderTarget(this.rt);
    r.clear(true, true, false);
    const tex = this.rt.texture;
    tex.mipmapsAutoUpdate = this.autoExposure && !overlay;
    r.render(this.scene, this.camera);
    if (overlay) {
      tex.mipmapsAutoUpdate = this.autoExposure;
      overlay(r);
    }
    tex.mipmapsAutoUpdate = false;
    this.updateExposure();
    r.setRenderTarget(null);
    r.clear(true, true, false);
    r.render(this.postScene, this.postCam);
  }
}
