// How Vice City is drawn: the world renders into a floating-point target (HDR,
// 4x MSAA); bright things (the sun, its glints on the water, neon, headlights,
// lit windows) bloom through a downsample/upsample chain; one final pass adds
// the bloom, grades the picture (warm highlights, teal shadows, a little extra
// colour - the Miami look), tone-maps it like film (ACES), and adds a hint of
// chromatic aberration at the edges, a vignette and very light grain. The same
// pass does the hit flash, the fades and WASTED (colour drains away, a slight
// blur, a red-brown tint).
//
//   const post = new Post(world)          replaces world.render
//   post.update(dt, {exposure, desat, vignette, tint (Color), blur, wasted 0..1, chroma, bloom})
//   post.fadeIn(s) / post.fadeOut(s)      from / to black
//   post.hit(amount 0..1, color)          a flash at the edges of the screen
//   post.overlays[]                       fn(renderer) called after the scene, into the HDR target
//   post.info = {calls, tris}             of the scene pass (shadows included)
//   post.resize(), post.setSamples(n), post.setBloom(on)
//
// Bloom threshold is ~1.6 (linear, before exposure): daylight concrete stays below it.
// For things that should glow, use emissive colours brighter than that (neon 3-8,
// headlights 4-10, lit windows 1.5-3).
import * as THREE from 'three';
import { V } from '../state.js';

const VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// 13-tap downsample (Jimenez 2014); the first pass also thresholds and tames fireflies
const DOWN = `
uniform sampler2D tSrc; uniform vec2 texel; uniform float first; uniform vec4 thr; // threshold, knee, clamp
varying vec2 vUv;
vec3 pre(vec3 c) {
  c = min(c, vec3(thr.z));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - thr.x + thr.y, 0.0, 2.0 * thr.y);
  soft = soft * soft / (4.0 * thr.y + 1e-4);
  float w = max(soft, br - thr.x) / max(br, 1e-4);
  return c * w;
}
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() {
  vec2 t = texel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb, b = texture2D(tSrc, vUv + t * vec2(0.0, -2.0)).rgb, c = texture2D(tSrc, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0, 0.0)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, 2.0)).rgb, h = texture2D(tSrc, vUv + t * vec2(0.0, 2.0)).rgb, i = texture2D(tSrc, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb, k = texture2D(tSrc, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, 1.0)).rgb, m = texture2D(tSrc, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 o;
  if (first > 0.5) {
    // groups weighted by brightness so single hot pixels don't flicker
    vec3 g0 = pre((j + k + l + m) * 0.25), g1 = pre((a + b + d + e) * 0.25), g2 = pre((b + c + e + f) * 0.25), g3 = pre((d + e + g + h) * 0.25), g4 = pre((e + f + h + i) * 0.25);
    float w0 = karis(g0) * 0.5, w1 = karis(g1) * 0.125, w2 = karis(g2) * 0.125, w3 = karis(g3) * 0.125, w4 = karis(g4) * 0.125;
    o = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  gl_FragColor = vec4(max(o, 0.0), 1.0);
}`;
// 9-tap tent upsample, added onto the level above (additive blending)
const UP = `
uniform sampler2D tSrc; uniform vec2 texel; uniform float radius, weight;
varying vec2 vUv;
void main() {
  vec2 t = texel * radius;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += (texture2D(tSrc, vUv + vec2(-t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(t.x, 0.0)).rgb + texture2D(tSrc, vUv + vec2(0.0, -t.y)).rgb + texture2D(tSrc, vUv + vec2(0.0, t.y)).rgb) * 2.0;
  s += texture2D(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture2D(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSrc, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 * weight, 1.0);
}`;

const FINAL = `
uniform sampler2D tDiffuse, tBloom; uniform vec2 res;
uniform float time, exposure, vignette, desat, blur, flash, fade, grain, chroma, bloom, wasted, sat;
uniform vec3 flashCol, tint, lift, gain;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec2 uv = vUv, c = uv - 0.5;
  vec2 ca = c * vec2(res.x / res.y, 1.0);
  float r2 = dot(ca, ca);
  // a little chromatic aberration, only towards the edges
  float ab = chroma * smoothstep(0.08, 0.6, r2);
  vec3 col;
  col.r = texture2D(tDiffuse, uv - c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv + c * ab).b;
  if (blur > 0.0) {
    vec3 s = vec3(0.0);
    for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; s += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * (1.5 + float(i - (i / 3) * 3) * 1.5) * blur * (0.6 + r2 * 1.5) / res * 3.0).rgb; }
    col = mix(col, s / 12.0, clamp(blur * 1.5, 0.0, 1.0));
  }
  col += texture2D(tBloom, uv).rgb * bloom;
  col *= exposure;
  // the grade: teal in the shadows, warm in the light, a bit more colour
  float l = lum(col);
  float hi = smoothstep(0.04, 0.9, l);
  col *= mix(lift, gain, hi);
  col = max(mix(vec3(l), col, sat * (1.0 - desat)), 0.0);
  col *= tint;
  // wasted: nearly grey, a red-brown cast, darker at the edges
  col = mix(col, vec3(lum(col)) * vec3(1.08, 0.93, 0.88), wasted * 0.92);
  // hit: red creeping in from the edges
  col = mix(col, flashCol, flash * (0.25 + 0.75 * smoothstep(0.05, 0.55, r2)));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb *= mix(1.0, smoothstep(0.95, 0.12, r2), vignette);
  gl_FragColor.rgb += (hash(uv * res + fract(time * 7.13) * 91.0) - 0.5) * grain;
  gl_FragColor.rgb *= 1.0 - fade;
}`;

const LEVELS = 6;
const _sz = new THREE.Vector2();

export class Post {
  constructor(world) {
    this.world = world;
    const r = world.renderer;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.samples = 4;
    this.size = r.getDrawingBufferSize(new THREE.Vector2());
    this.rt = this._target(this.size.x, this.size.y, this.samples, true);
    // the bloom chain: half size, then halving
    this.bloomOn = true;
    this.chain = [];
    for (let i = 0; i < LEVELS; i++) this.chain.push(this._target(2, 2, 0, false));
    const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)).setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const pass = (fs, uniforms, o = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...o });
    this.down = pass(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, first: { value: 0 }, thr: { value: new THREE.Vector4(1.6, 0.8, 60, 0) } });
    this.up = pass(UP, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 }, weight: { value: 1 } }, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, transparent: true });
    this.mat = pass(FINAL, {
      tDiffuse: { value: this.rt.texture }, tBloom: { value: this.chain[0].texture }, res: { value: this.size.clone() }, time: { value: 0 },
      exposure: { value: 1 }, vignette: { value: 0.3 }, desat: { value: 0 }, blur: { value: 0 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(0.8, 0.02, 0.0) },
      fade: { value: 1 }, grain: { value: 0.012 }, chroma: { value: 0.0035 }, bloom: { value: 0.32 }, wasted: { value: 0 }, sat: { value: 1.12 },
      tint: { value: new THREE.Color(1, 1, 1) }, lift: { value: new THREE.Vector3(0.93, 1.0, 1.05) }, gain: { value: new THREE.Vector3(1.05, 1.0, 0.94) },
    }, { toneMapped: true });
    this.quad = new THREE.Mesh(tri, this.mat); this.quad.frustumCulled = false;
    this.screen = new THREE.Scene(); this.screen.add(this.quad);
    this.screenCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.flash = 0; this.t = 0; this.wasted = 0;
    this.fade = 1; this.fadeTo = 1; this.fadeSpeed = 1;
    this.brightness = 1;
    this.overlays = [];
    this.info = { calls: 0, tris: 0 };
    this._resizeChain();
    world.render = () => this.render();
  }

  _target(w, h, samples, depth) {
    const t = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { type: THREE.HalfFloatType, samples, depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    t.texture.generateMipmaps = false;
    return t;
  }
  _resizeChain() {
    let w = this.size.x, h = this.size.y;
    for (const t of this.chain) { w = Math.max(2, Math.round(w / 2)); h = Math.max(2, Math.round(h / 2)); t.setSize(w, h); }
  }
  setSamples(n) {
    if (this.samples === n) return;
    this.samples = n;
    this.rt.dispose();
    this.rt = this._target(this.size.x, this.size.y, n, true);
    this.mat.uniforms.tDiffuse.value = this.rt.texture;
  }
  setBloom(on) { this.bloomOn = !!on; }
  resize() {
    this.world.renderer.getDrawingBufferSize(this.size);
    this.rt.setSize(Math.max(2, this.size.x), Math.max(2, this.size.y));
    this.mat.uniforms.res.value.copy(this.size);
    this._resizeChain();
  }
  fadeIn(s = 1) { this.fadeTo = 0; this.fadeSpeed = 1 / Math.max(0.01, s); }
  fadeOut(s = 1) { this.fadeTo = 1; this.fadeSpeed = 1 / Math.max(0.01, s); }
  hit(amount = 1, color = 0xb00000) { this.flash = Math.min(1, Math.max(this.flash, amount)); this.mat.uniforms.flashCol.value.set(color); }

  update(dt, o = {}) {
    this.t += dt;
    if (!this._hooks && typeof window !== 'undefined' && window.__vc) this._addHooks();
    const u = this.mat.uniforms;
    if (this.fade !== this.fadeTo) this.fade += Math.sign(this.fadeTo - this.fade) * Math.min(Math.abs(this.fadeTo - this.fade), dt * this.fadeSpeed);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    // wasted eases in (and out)
    const wt = o.wasted || 0;
    this.wasted += (wt - this.wasted) * Math.min(1, dt * (wt > this.wasted ? 1.6 : 4));
    const ws = this.wasted;
    const sky = V.sky?.state;
    u.time.value = this.t;
    u.fade.value = this.fade;
    u.flash.value = this.flash * 0.55;
    u.desat.value = o.desat || 0;
    u.blur.value = Math.max(o.blur || 0, ws * 0.7);
    u.wasted.value = ws;
    u.vignette.value = 0.3 + (o.vignette || 0) + ws * 0.35;
    u.exposure.value = (o.exposure ?? 1) * (sky?.exposure ?? 1) * (0.8 + this.brightness * 0.2) * (1 - ws * 0.15);
    u.chroma.value = 0.0035 + (o.chroma || 0) + ws * 0.006;
    u.bloom.value = this.bloomOn ? (o.bloom ?? 0.32) * (1 + (sky?.night || 0) * 0.35) : 0;
    if (o.tint) u.tint.value.copy(o.tint); else u.tint.value.setRGB(1, 1, 1);
  }

  /** Test hooks: __vc.unfade(), __vc.postInfo(), __vc.bloom(on), __vc.wasted(v), __vc.hit(a). */
  _addHooks() {
    this._hooks = true;
    Object.assign(window.__vc, {
      unfade: () => { this.fade = this.fadeTo = 0; return 1; },
      bloom: (on = true) => { this.setBloom(on); return on; },
      wasted: (v = 1) => { V.postFx = { ...(V.postFx || {}), wasted: v }; this.wasted = v; return v; },
      hit: (a = 1) => { this.hit(a); return a; },
      postInfo: () => ({ ...this.info, size: [this.size.x, this.size.y], samples: this.samples }),
    });
  }

  render() {
    const r = this.world.renderer, w = this.world;
    const target = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(w.scene, w.camera);
    this.info.calls = r.info.render.calls; this.info.tris = r.info.render.triangles;
    for (const fn of this.overlays) fn(r);
    const ac = r.autoClear;
    r.autoClear = false;
    if (this.bloomOn) this._bloom(r);
    r.setRenderTarget(target);
    // (someone may have left the canvas viewport or scissor changed while baking into a target)
    if (!target) { r.getSize(_sz); r.setViewport(0, 0, _sz.x, _sz.y); r.setScissorTest(false); }
    r.render(this.screen, this.screenCam);
    r.autoClear = ac;
  }

  _bloom(r) {
    const q = this.quad, D = this.down.uniforms, U = this.up.uniforms, ch = this.chain;
    q.material = this.down;
    let src = this.rt;
    for (let i = 0; i < ch.length; i++) {
      D.tSrc.value = src.texture; D.first.value = i === 0 ? 1 : 0;
      D.texel.value.set(1 / src.width, 1 / src.height);
      r.setRenderTarget(ch[i]); r.render(this.screen, this.screenCam);
      src = ch[i];
    }
    // back up: each level gets the (blurred) level below added on top
    q.material = this.up;
    for (let i = ch.length - 1; i > 0; i--) {
      U.tSrc.value = ch[i].texture; U.texel.value.set(1 / ch[i].width, 1 / ch[i].height);
      U.weight.value = 1;
      r.setRenderTarget(ch[i - 1]); r.render(this.screen, this.screenCam);
    }
    q.material = this.mat;
  }
}
