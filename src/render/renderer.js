// Renderer + post-processing chain.
// World pass -> ambient occlusion (depth-only SSAO, medium/high) -> viewmodel
// pass (depth cleared) -> bloom (mips only; blended in the grade) -> grade
// (ACES tone map, bloom + lens dirt, chromatic aberration, lift/gamma/gain,
// split toning, vignette, film grain, damage/bile/incap effects) -> FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GlowOutlines } from './glow.js';
import { BeamMotes } from './motes.js';

// Procedural blood splatter for the screen (one splat, alpha-premultiplied
// look: dark wet core, lighter thin rim, radiating droplets and a few runs).
function bloodTexture() {
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  let s = 4711;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const blob = (x, y, rad, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(70,4,4,${a})`); gr.addColorStop(0.75, `rgba(95,8,6,${a * 0.9})`); gr.addColorStop(1, 'rgba(120,12,8,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
  };
  const C = N / 2;
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 26; blob(C + Math.cos(a) * d, C + Math.sin(a) * d * 0.8, 14 + r() * 26, 0.9); }
  for (let i = 0; i < 70; i++) { // radiating droplets, smaller further out
    const a = r() * 6.28, d = 30 + Math.pow(r(), 0.7) * 90, rad = Math.max(1.2, 7 - d / 18 + r() * 3);
    blob(C + Math.cos(a) * d, C + Math.sin(a) * d, rad, 0.95);
    if (r() < 0.25) { // streak toward the droplet
      g.strokeStyle = 'rgba(80,6,5,0.8)'; g.lineWidth = rad * 0.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(C + Math.cos(a) * (d - 14), C + Math.sin(a) * (d - 14)); g.lineTo(C + Math.cos(a) * d, C + Math.sin(a) * d); g.stroke();
    }
  }
  for (let i = 0; i < 6; i++) { // runs (downward drips)
    const x = C + (r() - 0.5) * 70, y = C + r() * 20, len = 20 + r() * 70, w = 2 + r() * 4;
    g.strokeStyle = 'rgba(75,5,4,0.9)'; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + len); g.stroke();
    blob(x, y + len, w * 1.1, 0.95);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; // composited in display space: keep authored values
  return t;
}

// Per-campaign colour grades (display-linear lift/gamma/gain + split tones).
export const GRADES = {
  default: {},
  // Dead Air: cold blue night, sodium-orange city glow in the highlights
  deadair: { lift: [0.006, 0.014, 0.034], gamma: [1.0, 1.0, 1.04], gain: [1.05, 0.99, 0.92], shadowTone: [0.8, 0.95, 1.2], highTone: [1.16, 0.98, 0.74], splitAmount: 0.62, saturation: 0.86, contrast: 1.1, vignette: 0.46, grain: 0.04 },
  nomercy: { lift: [0.012, 0.016, 0.026], gain: [1.03, 1.0, 0.96], shadowTone: [0.9, 0.98, 1.1], highTone: [1.08, 1.0, 0.88], splitAmount: 0.5, saturation: 0.86, contrast: 1.07 },
};
const GRADE_BASE = { lift: [0.012, 0.016, 0.026], gamma: [1, 1, 1], gain: [1.03, 1.0, 0.96], shadowTone: [0.88, 0.97, 1.12], highTone: [1.08, 1.0, 0.88], splitAmount: 0.55, saturation: 0.88, contrast: 1.06, vignette: 0.42, grain: 0.035 };

// HDR sanitizer for full-screen passes. One non-finite pixel (a specular
// highlight that overflows half-float to Inf, or 0*Inf = NaN in a later pass)
// is smeared by the bloom mip chain into a huge pure-black disc, so every pass
// that feeds bloom/tone mapping clamps its input: NaN/negative -> 0, Inf and
// extreme values -> 64 (far past the tone-map shoulder, visually identical).
const SANITIZE_GLSL = /* glsl */ `
    vec3 sanHDR(vec3 c){
      float s = c.r + c.g + c.b;
      if (!(s >= 0.0)) return vec3(0.0);
      return min(max(c, vec3(0.0)), vec3(64.0));
    }
`;

// Procedural lens dirt: soft smudges, specks and a couple of wipe streaks.
function lensDirtTexture() {
  const W = 512, H = 288;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  let s = 9127;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 38; i++) { // large smudges
    const x = r() * W, y = r() * H, rad = 20 + r() * 70;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + r() * 0.12;
    gr.addColorStop(0, `rgba(255,250,240,${a})`); gr.addColorStop(0.6, `rgba(255,250,240,${a * 0.4})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 260; i++) { // dust specks
    const x = r() * W, y = r() * H, rad = 0.6 + r() * r() * 5;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.2 + r() * 0.5;
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 5; i++) { // wipe streaks
    g.strokeStyle = `rgba(255,248,235,${0.03 + r() * 0.04})`;
    g.lineWidth = 8 + r() * 18;
    g.beginPath();
    const x0 = r() * W, y0 = r() * H;
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 + (r() - 0.5) * 300, y0 + (r() - 0.5) * 120, x0 + (r() - 0.5) * 420, y0 + (r() - 0.5) * 160);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    tDirt: { value: null },
    bloomOn: { value: 0 },
    dirtAmount: { value: 1.4 },
    exposure: { value: 1 },
    time: { value: 0 },
    vignette: { value: 0.42 },
    grain: { value: 0.035 },
    saturation: { value: 0.88 },
    contrast: { value: 1.06 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
    lift: { value: new THREE.Vector3(0.012, 0.016, 0.026) },
    gamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    gain: { value: new THREE.Vector3(1.03, 1.0, 0.96) },
    shadowTone: { value: new THREE.Vector3(0.88, 0.97, 1.12) },
    highTone: { value: new THREE.Vector3(1.08, 1.0, 0.88) },
    splitAmount: { value: 0.55 },
    caBase: { value: 0.0016 },
    flashColor: { value: new THREE.Vector3(1, 0, 0) },
    flash: { value: 0 },
    chroma: { value: 0.0 },
    lowHealth: { value: 0 },
    bile: { value: 0 },
    bw: { value: 0 },
    fade: { value: 0 },
    blur: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    smoke: { value: 0 },
    tBlood: { value: null },
    bloodS: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    bloodA: { value: new THREE.Vector4() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tBloom, tDirt;
    uniform float bloomOn, dirtAmount, exposure;
    uniform sampler2D tBlood;
    uniform vec4 bloodS[4];
    uniform vec4 bloodA;
    uniform float time, vignette, grain, saturation, contrast, flash, chroma, lowHealth, bile, bw, fade, blur, smoke, splitAmount, caBase;
    uniform vec3 tint, flashColor, lift, gamma, gain, shadowTone, highTone;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
    vec3 aces(vec3 c){
      const mat3 IM = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
      const mat3 OM = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
      c *= exposure / 0.6;
      c = IM * c; c = RRTAndODTFit(c); c = OM * c;
      return clamp(c, 0.0, 1.0);
    }
    ${SANITIZE_GLSL}
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, pow(c, vec3(0.41666)) * 1.055 - 0.055, step(0.0031308, c)); }
    vec3 hdrAt(vec2 uv){
      vec3 c = sanHDR(texture2D(tDiffuse, uv).rgb);
      if (bloomOn > 0.5) {
        vec3 b = sanHDR(texture2D(tBloom, uv).rgb);
        float d = texture2D(tDirt, uv).r;
        c += b * (1.0 + d * dirtAmount);
      }
      return c;
    }
    void main(){
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      float r2 = dot(cc,cc);
      if (bile > 0.0) uv += vec2(noise(uv*6.0 + time*0.6), noise(uv*6.0 - time*0.5)) * 0.012 * bile;
      // chromatic aberration grows toward the frame edges
      float ca = caBase * (0.35 + r2 * 3.0) + chroma * 0.012;
      vec3 col;
      if (ca > 0.0004) {
        col.r = hdrAt(uv + cc * ca).r;
        col.g = hdrAt(uv).g;
        col.b = hdrAt(uv - cc * ca).b;
      } else col = hdrAt(uv);
      if (blur > 0.0) {
        vec3 acc = col;
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.047;
          acc += hdrAt(uv + vec2(cos(a), sin(a)) * blur * 0.01);
        }
        col = acc / 7.0;
      }
      col = aces(col);
      // lift / gamma / gain (display-linear)
      col = pow(max(col * gain + lift * (1.0 - col), 0.0), 1.0 / gamma);
      // split toning: cool shadows, warm highlights
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float hk = smoothstep(0.08, 0.6, lum);
      vec3 tone = mix(shadowTone, highTone, hk);
      col = mix(col, col * tone, splitAmount);
      col = toSRGB(col);
      // contrast (s-curve around mid grey) & saturation
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation * (1.0 - bw));
      col *= tint;
      if (bile > 0.0) {
        float n = noise(vec2(uv.x*14.0, uv.y*3.0 - time*0.4));
        vec3 g = vec3(0.35, 0.45, 0.08) * (0.6 + n*0.6);
        col = mix(col, col * vec3(0.7,1.0,0.35) + g*0.25, bile * 0.85);
        col = mix(col, g, smoothstep(0.35, 0.9, n) * bile * 0.35 * smoothstep(0.05, 0.3, r2));
      }
      if (smoke > 0.0) {
        float n = noise(uv*4.0 + time*0.2);
        col = mix(col, vec3(0.35,0.36,0.33)*(0.8+n*0.4), smoke*0.8);
      }
      if (lowHealth > 0.0) {
        float p = 0.6 + 0.4 * sin(time * 5.0);
        float e = smoothstep(0.08, 0.45, r2);
        col = mix(col, vec3(0.35, 0.0, 0.0), e * lowHealth * p * 0.8);
      }
      // blood on the lens: up to four splats (xy centre, scale, rotation)
      if (bloodA.x + bloodA.y + bloodA.z + bloodA.w > 0.002) {
        float asp = resolution.x / resolution.y;
        for (int i = 0; i < 4; i++) {
          float ba = bloodA[i];
          if (ba < 0.002) continue;
          vec4 s = bloodS[i];
          vec2 p = (vUv - s.xy) * vec2(asp, 1.0) / s.z;
          float cs = cos(s.w), sn = sin(s.w);
          p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) + 0.5;
          if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) continue;
          vec4 b = texture2D(tBlood, p);
          // thin film thins out as it fades: edges go first
          float al = smoothstep(0.0, 1.0, b.a * (0.4 + ba) - (1.0 - ba) * 0.5) * ba;
          col = mix(col, b.rgb * (0.75 + 0.25 * lum), al * 0.92);
        }
      }
      col = mix(col, flashColor, flash * smoothstep(0.02, 0.35, r2 + flash*0.1));
      // vignette (slightly elliptical, film-like falloff)
      vec2 vc = cc * vec2(1.0, 0.82);
      col *= 1.0 - vignette * smoothstep(0.12, 0.8, dot(vc, vc) * 1.9);
      // film grain: luminance-weighted, strongest in the mid-shadows
      float lg = dot(col, vec3(0.299, 0.587, 0.114));
      float gr = hash(uv * resolution + fract(time * 13.7) * 100.0) + hash(uv * resolution * 1.7 + fract(time * 7.1) * 50.0) - 1.0;
      col += gr * grain * (0.55 + 0.9 * (1.0 - lg) * lg * 2.0);
      col *= 1.0 - fade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

// ----------------------------------------------------------------------- AO --
// Screen-space ambient obscurance from the world pass's depth buffer only (no
// extra scene render, so no extra draw calls): half-res SAO-style spiral taps
// with reconstructed normals, then a depth-aware blur + composite at full res.
const AOShader = {
  uniforms: {
    tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    projInv: { value: new THREE.Matrix4() },
    projScale: { value: 1 },
    radius: { value: 0.55 },
    bias: { value: 0.02 },
    intensity: { value: 1.2 },
    maxDist: { value: 45 },
    frame: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform mat4 projInv;
    uniform float projScale, radius, bias, intensity, maxDist, frame;
    varying vec2 vUv;
    #define TAPS 10
    vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    void main(){
      float d = texture2D(tDepth, vUv).x;
      if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = vpos(vUv);
      if (-P.z > maxDist) { gl_FragColor = vec4(1.0); return; }
      vec2 px = 1.0 / resolution;
      vec3 pr = vpos(vUv + vec2(px.x, 0.0)), pl = vpos(vUv - vec2(px.x, 0.0));
      vec3 pu = vpos(vUv + vec2(0.0, px.y)), pd = vpos(vUv - vec2(0.0, px.y));
      vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
      vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
      vec3 cN = cross(dx, dy);
      if (!(dot(cN, cN) > 1e-24)) { gl_FragColor = vec4(1.0); return; } // degenerate / non-finite depth
      vec3 N = cN * inversesqrt(dot(cN, cN));
      // interleaved gradient noise rotates the spiral per pixel
      float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float ssR = radius * projScale / -P.z; // radius in uv units (y)
      ssR = min(ssR, 0.12);
      float aspect = resolution.y / resolution.x;
      float sum = 0.0;
      float r2 = radius * radius;
      for (int i = 0; i < TAPS; i++) {
        float fi = float(i);
        float alpha = (fi + 0.5 + ign * 0.5) / float(TAPS);
        float ang = fi * 2.3999632 + ign * 6.2831853; // golden-angle spiral
        vec2 o = vec2(cos(ang) * aspect, sin(ang)) * ssR * (alpha * 0.85 + 0.15);
        vec3 Q = vpos(vUv + o);
        vec3 v = Q - P;
        float vv = dot(v, v);
        float vn = dot(v, N);
        float f = max(r2 - vv, 0.0);
        sum += f * f * max((vn - bias - 0.0015 * -P.z) / (0.01 + vv), 0.0);
      }
      float ao = max(0.0, 1.0 - sum * intensity * 2.2 / (r2 * r2 * float(TAPS)));
      ao = mix(ao, 1.0, smoothstep(maxDist * 0.6, maxDist, -P.z));
      gl_FragColor = vec4(ao, ao, ao, 1.0);
    }
  `,
};
const AOCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tAO: { value: null },
    tDepth: { value: null },
    aoRes: { value: new THREE.Vector2(1, 1) },
    projInv: { value: new THREE.Matrix4() },
    strength: { value: 0.85 },
    debug: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tAO, tDepth;
    uniform vec2 aoRes;
    uniform mat4 projInv;
    uniform float strength, debug;
    varying vec2 vUv;
    float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.z / p.w; }
    ${SANITIZE_GLSL}
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = sanHDR(c.rgb); // Inf * ao(0) would be NaN
      float z0 = vz(vUv);
      vec2 px = 1.0 / aoRes;
      float acc = 0.0, wsum = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 uv = vUv + vec2(float(x), float(y)) * px * 1.25;
        float z = vz(uv);
        float w = 1.0 / (0.002 + abs(z - z0) * 8.0 / max(0.5, -z0));
        acc += texture2D(tAO, uv).r * w; wsum += w;
      }
      float ao = acc / wsum;
      // bright (emissive / fire / lamp) pixels are not occluded
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      ao = mix(ao, 1.0, smoothstep(0.9, 2.5, l));
      ao = mix(1.0, ao, strength);
      if (debug > 0.5) { gl_FragColor = vec4(vec3(ao), 1.0); return; }
      gl_FragColor = vec4(c.rgb * ao, c.a);
    }
  `,
};

class AOPass extends Pass {
  constructor(camera, scale = 0.5) {
    super();
    this.camera = camera;
    this.scale = scale;
    this.needsSwap = true;
    this.aoRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.aoMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AOShader.uniforms), vertexShader: AOShader.vertexShader, fragmentShader: AOShader.fragmentShader, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(AOCompositeShader.uniforms), vertexShader: AOCompositeShader.vertexShader, fragmentShader: AOCompositeShader.fragmentShader, depthTest: false, depthWrite: false });
    this.quad = new FullScreenQuad(null);
    this.frame = 0;
  }
  setSize(w, h) {
    const aw = Math.max(1, Math.round(w * this.scale)), ah = Math.max(1, Math.round(h * this.scale));
    this.aoRT.setSize(aw, ah);
    this.aoMat.uniforms.resolution.value.set(aw, ah);
    this.compMat.uniforms.aoRes.value.set(aw, ah);
  }
  render(renderer, writeBuffer, readBuffer) {
    const cam = this.camera;
    const depth = readBuffer.depthTexture;
    if (!depth) return;
    const u = this.aoMat.uniforms;
    u.tDepth.value = depth;
    u.projInv.value.copy(cam.projectionMatrixInverse);
    u.projScale.value = cam.projectionMatrix.elements[5] * 0.5;
    u.frame.value = (this.frame++) % 64;
    renderer.setRenderTarget(this.aoRT);
    this.quad.material = this.aoMat;
    this.quad.render(renderer);
    const c = this.compMat.uniforms;
    c.tDiffuse.value = readBuffer.texture;
    c.tAO.value = this.aoRT.texture;
    c.tDepth.value = depth;
    c.projInv.value.copy(cam.projectionMatrixInverse);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.compMat;
    this.quad.render(renderer);
  }
  dispose() { this.aoRT.dispose(); this.aoMat.dispose(); this.compMat.dispose(); this.quad.dispose(); }
}

// Renders the viewmodel layer on top with cleared depth, without re-rendering shadow maps.
class ViewmodelPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.clear = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const oldAuto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    const bg = this.scene.background, fog = this.scene.fog;
    this.scene.background = null;
    this.scene.fog = null;
    renderer.shadowMap.needsUpdate = false;
    renderer.render(this.scene, this.camera);
    this.scene.background = bg;
    this.scene.fog = fog;
    renderer.autoClear = oldAuto;
  }
}

const _bv = new THREE.Vector3();
export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
    // Tone mapping happens in the grade pass (ACES); keep the exposure here so
    // levels can keep setting renderer.r.toneMappingExposure.
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.r = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.04, 600);
    this.camera.layers.set(0);
    this.scene.add(this.camera);
    this.vmCamera = new THREE.PerspectiveCamera(58, 16 / 9, 0.01, 20);
    this.vmCamera.layers.set(1);
    this.baseFov = 75;

    const size = new THREE.Vector2();
    r.getDrawingBufferSize(size);
    const useAO = quality.ao ?? !!quality.bloom;
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa ? 4 : 0,
    });
    // depth texture: AO and the glow outlines' through-wall test read it
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    rt.depthTexture.type = THREE.UnsignedIntType;
    this.composer = new EffectComposer(r, rt);
    this.worldPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.worldPass);
    this.glow = new GlowOutlines(this.camera, quality);
    this.composer.addPass(this.glow.maskPass);
    if (useAO) {
      this.ao = new AOPass(this.camera, quality.aoScale ?? 0.5);
      if (quality.aoStrength != null) this.ao.compMat.uniforms.strength.value = quality.aoStrength;
      this.composer.addPass(this.ao);
    }
    this.composer.addPass(this.glow.compPass);
    this.motes = new BeamMotes(this.scene, quality);
    this.vmPass = new ViewmodelPass(this.scene, this.vmCamera);
    this.composer.addPass(this.vmPass);
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.45, 0.5, 1.0);
      // threshold 1.0 (scene-linear): lamps, neon, fire and emissives (HDR > 1) glow, lit
      // surfaces and flashlit skin don't smear into a milky haze
      // the grade pass adds the bloom (with lens dirt); skip the pass's own blend draw
      this.bloom.blendMaterial.visible = false;
      // sanitize the bloom input: a single Inf/NaN pixel would otherwise spread
      // through the mip blurs into a screen-sized black disc
      const hp = this.bloom.materialHighPassFilter;
      const tap = 'vec4 texel = texture2D( tDiffuse, vUv );';
      if (hp.fragmentShader.includes(tap)) {
        hp.fragmentShader = SANITIZE_GLSL + hp.fragmentShader.replace(tap, tap + ' texel.rgb = sanHDR(texel.rgb);');
        hp.needsUpdate = true;
      } else console.warn('bloom high-pass: sanitizer not applied');
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.fx = this.grade.uniforms;
    this.fx.tDirt.value = lensDirtTexture();
    this.fx.tBlood.value = bloodTexture();
    this.blood = [0, 0, 0, 0]; // per-splat life (s)
    this.bloodCool = 0;
    this._gradeKey = null;
    if (this.bloom) {
      this.fx.bloomOn.value = 1;
      this.fx.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
    }
    if (!quality.msaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
    this.composer.setSize(w, h);
    const pr = this.r.getPixelRatio();
    if (this.fxaa) {
      this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
    }
    this.fx.resolution.value.set(w * pr, h * pr);
    this.glow.setSize(w * pr, h * pr);
  }
  // Apply a colour grade preset (see GRADES); unspecified fields use the base.
  setGrade(g) {
    const G = Object.assign({}, GRADE_BASE, g || {});
    const f = this.fx;
    for (const k of ['lift', 'gamma', 'gain', 'shadowTone', 'highTone']) f[k].value.set(...G[k]);
    for (const k of ['splitAmount', 'saturation', 'contrast', 'vignette', 'grain']) f[k].value = G[k];
  }
  // Gore within arm's reach in front of the camera sprays the lens.
  nearBlood(x, y, z, amount) {
    const c = this.camera.position;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > 1.8 || d < 0.05) return;
    const e = this.camera.matrixWorld.elements; // forward = -Z column
    if (-(dx * e[8] + dy * e[9] + dz * e[10]) / d < 0.45) return;
    _bv.set(x, y, z).project(this.camera);
    const k = Math.min(1, amount * 0.8) * (1.9 - d) / 1.4;
    if (k < 0.15 || Math.random() > 0.35 + k) return;
    this.bloodSplat(k, 0.5 + _bv.x * 0.5 + (Math.random() - 0.5) * 0.25, 0.5 + _bv.y * 0.5 + (Math.random() - 0.5) * 0.2);
  }
  // Blood sprayed onto the lens (close kills, melee, big hits). strength 0..1.
  bloodSplat(strength = 1, x, y) {
    if (this.bloodCool > 0 && strength < 0.9) return;
    this.bloodCool = 0.35;
    const L = this.blood, S = this.fx.bloodS.value;
    let k = 0;
    for (let i = 1; i < 4; i++) if (L[i] < L[k]) k = i;
    const R = Math.random;
    L[k] = 1.4 + 2.2 * Math.min(1, strength);
    S[k].set(x ?? 0.2 + R() * 0.6, y ?? 0.25 + R() * 0.55, (0.28 + R() * 0.3) * (0.6 + 0.5 * Math.min(1, strength)), R() * 6.28);
  }
  render(dt, game) {
    this.fx.time.value += dt;
    if (game) {
      const key = game.level;
      if (key !== this._gradeKey) {
        this._gradeKey = key;
        const cid = game.session?.campaign?.id || (typeof window !== 'undefined' && window.session?.campaign?.id);
        this.setGrade(key?.env?.grade || GRADES[cid] || GRADES.default);
      }
      if (game.fx && !game.fx.screenBlood) game.fx.screenBlood = (x, y, z, amount) => this.nearBlood(x, y, z, amount);
      this.glow.update(game);
      this.motes.update(dt, game, this.camera, this.fx.resolution.value.y);
    }
    // lens blood: hold, then thin out and slide down a little
    this.bloodCool = Math.max(0, this.bloodCool - dt);
    const BA = this.fx.bloodA.value, BS = this.fx.bloodS.value;
    for (let i = 0; i < 4; i++) {
      const l = this.blood[i];
      if (l <= 0) { BA.setComponent(i, 0); continue; }
      this.blood[i] = l - dt;
      BA.setComponent(i, Math.min(1, l / 1.6));
      BS[i].y -= dt * 0.006;
    }
    this.fx.exposure.value = this.r.toneMappingExposure;
    if (this.bloom) this.fx.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
    this.vmCamera.position.copy(this.camera.position);
    this.vmCamera.quaternion.copy(this.camera.quaternion);
    this.vmCamera.updateMatrixWorld();
    this.r.shadowMap.needsUpdate = true;
    this.composer.render(dt);
  }
}
