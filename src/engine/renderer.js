// Low-resolution PS1 renderer with a post pass for dithering, 15-bit colour,
// screen effects (damage, bile, black & white), grain and vignette.
import * as THREE from 'three';
import { G } from './ps1material.js';

THREE.ColorManagement.enabled = false;

const postVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const postFrag = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uDither;
uniform float uLevels;
uniform float uTime;
uniform float uDamage;      // red flash
uniform vec2 uDamageDir;    // screen-space direction of last hit
uniform float uBile;        // green vomit overlay
uniform float uGray;        // black & white / near death desaturation
uniform float uFade;        // fade to black
uniform vec3 uFadeColor;
uniform float uVignette;
uniform float uGrain;
uniform float uAcid;
uniform float uFire;
uniform float uAdrenaline;
uniform float uBrightness;
uniform float uGamma;
varying vec2 vUv;

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)); int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
  m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) if (k == i) v = m[k];
  return v / 16.0 - 0.5;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // bile: wobbly distortion
  if (uBile > 0.0) {
    uv.x += sin(uv.y * 18.0 + uTime * 3.0) * 0.004 * uBile;
    uv.y += cos(uv.x * 14.0 + uTime * 2.3) * 0.004 * uBile;
  }
  vec3 col = texture2D(tDiffuse, uv).rgb;
  col = pow(max(col, vec3(0.0)), vec3(uGamma)) * uBrightness;
  vec2 px = floor(uv * uRes);

  // bile overlay
  if (uBile > 0.0) {
    float n = hash(floor(px / 3.0) + floor(uTime * 8.0));
    vec3 g = vec3(0.35, 0.55, 0.08) * (0.7 + 0.3 * n);
    float blot = smoothstep(0.3, 0.9, sin(uv.x * 9.0 + uTime) * sin(uv.y * 7.0 - uTime * 0.7) * 0.5 + 0.5);
    col = mix(col, g * (col + 0.4), clamp(uBile * (0.35 + 0.45 * blot), 0.0, 0.85));
  }
  // acid: yellow-green edges
  if (uAcid > 0.0) {
    float e = length(uv - 0.5) * 1.6;
    col = mix(col, vec3(0.5, 0.75, 0.1) * col * 2.0, clamp(uAcid * e, 0.0, 0.6));
  }
  // fire: orange edge glow
  if (uFire > 0.0) {
    float e = length(uv - 0.5) * 1.5;
    float flick = 0.8 + 0.2 * sin(uTime * 23.0) * sin(uTime * 7.0);
    col = mix(col, vec3(1.0, 0.45, 0.1), clamp(uFire * e * flick, 0.0, 0.7));
  }
  // desaturation (black & white, incap)
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), uGray);
  // adrenaline: slight saturation boost / contrast
  if (uAdrenaline > 0.0) {
    col = mix(col, (col - 0.5) * 1.25 + 0.5 + vec3(0.03, 0.0, 0.0), uAdrenaline * 0.5);
  }
  // damage: red flash weighted towards hit direction
  if (uDamage > 0.0) {
    vec2 d = uv - 0.5;
    float edge = smoothstep(0.15, 0.75, length(d));
    float dirW = 1.0;
    if (length(uDamageDir) > 0.01) dirW = 0.4 + 0.6 * max(dot(normalize(d), normalize(uDamageDir)), 0.0);
    col = mix(col, vec3(0.6, 0.0, 0.0), clamp(uDamage * edge * dirW * 1.3, 0.0, 0.8));
  }
  // vignette
  vec2 vd = uv - 0.5;
  col *= 1.0 - uVignette * dot(vd, vd) * 1.6;
  // grain
  col += (hash(px + fract(uTime) * 100.0) - 0.5) * uGrain;
  // ordered dither + colour depth reduction (15-bit look)
  col += bayer4(px) * uDither / uLevels;
  col = floor(clamp(col, 0.0, 1.0) * uLevels + 0.5) / uLevels;
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(col, 1.0);
}
`;

export class PS1Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.setPixelRatio(1);
    this.gl.autoClear = false;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.target = new THREE.WebGLRenderTarget(320, 240, {
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postUniforms = {
      tDiffuse: { value: this.target.texture },
      uRes: { value: new THREE.Vector2(320, 240) },
      uDither: { value: 1 },
      uLevels: { value: 31 },
      uTime: { value: 0 },
      uDamage: { value: 0 },
      uDamageDir: { value: new THREE.Vector2() },
      uBile: { value: 0 },
      uGray: { value: 0 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uVignette: { value: 0.55 },
      uGrain: { value: 0.035 },
      uAcid: { value: 0 },
      uFire: { value: 0 },
      uAdrenaline: { value: 0 },
      uBrightness: { value: 1 },
      uGamma: { value: 0.8 },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.postMat = new THREE.ShaderMaterial({ uniforms: this.postUniforms, vertexShader: postVert, fragmentShader: postFrag, depthTest: false, depthWrite: false });
    const tri = new THREE.Mesh(geo, this.postMat);
    tri.frustumCulled = false;
    this.postScene.add(tri);
    this.width = 0; this.height = 0;
    this.lowW = 320; this.lowH = 240;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.width = w; this.height = h;
    this.gl.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const lowH = this.settings.get('resolution') || 240;
    const lowW = Math.round(lowH * w / h);
    this.lowW = lowW; this.lowH = lowH;
    this.target.setSize(lowW, lowH);
    this.postUniforms.uRes.value.set(lowW, lowH);
    const snap = this.settings.get('jitter') ? 1 : 0;
    // snapping grid ~ half internal resolution like the PS1 GTE's integer screen coords
    G.uSnapRes.value.set(lowW * 0.5, lowH * 0.5);
    G.uJitter.value = snap;
    this.aspect = w / h;
    if (this.onResize) this.onResize(this.aspect);
  }

  applySettings() {
    this.postUniforms.uDither.value = this.settings.get('dither') ? 1 : 0;
    this.postUniforms.uLevels.value = this.settings.get('dither') ? 31 : 255;
    G.uAffine.value = this.settings.get('affine') ? 0.65 : 0;
    this.postUniforms.uBrightness.value = this.settings.get('brightness') || 1;
    this.resize();
  }

  render(scene, camera, viewScene, viewCamera, overlayScene) {
    const gl = this.gl;
    gl.setRenderTarget(this.target);
    gl.setClearColor(scene.userData.clearColor || 0x000000, 1);
    gl.clear(true, true, true);
    gl.render(scene, camera);
    if (viewScene && viewCamera) {
      gl.clearDepth();
      gl.render(viewScene, viewCamera);
    }
    if (overlayScene) gl.render(overlayScene, camera);
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(this.postScene, this.postCam);
  }
}
