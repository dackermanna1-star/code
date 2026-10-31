import { clamp } from '../../core/math';
import type { IPostFX, PostFXParams } from './types';

/**
 * Cinematic post-processing compositor.
 *
 * The scene is drawn with Canvas2D into an offscreen canvas; `render()` uploads it to the GPU and
 * composites it onto the visible canvas:
 *
 *   upload ─► bright-pass (½ res, soft knee) ─► dual-filter downsample ×5 ─► upsample/accumulate
 *          └────────────────────────────────────────────────────────────────┐
 *   composite: shockwaves → motion blur → radial blur → chromatic aberration → + bloom → grading
 *              → impact frame → flash → vignette → scanlines → grain → letterbox
 *
 * Everything is allocated up front (programs, framebuffers, uniform arrays) — `render()` performs no
 * JS allocations. If WebGL2 is missing, fails to initialise, or the context is lost, rendering
 * transparently continues through the Canvas2D compositor (`Canvas2DPostFX`).
 */

export interface PostFXOptions {
  /** Skip WebGL2 entirely and composite with Canvas2D. */
  forceFallback?: boolean;
}

const MAX_SHOCKWAVES = 8;
const MAX_BLOOM_LEVELS = 6; // ½ res bright pass + 5 downsamples
const MAX_TAPS = 16;

const GL_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
};

/* ================================================================== */
/* Shaders                                                            */
/* ================================================================== */

const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Scene texture is stored top-row-first (canvas order); every shader samples it with a flipped v. */
const SCENE_SAMPLER = /* glsl */ `
uniform sampler2D uScene;
vec3 scene(vec2 uv) { return textureLod(uScene, vec2(uv.x, 1.0 - uv.y), 0.0).rgb; }
`;

const FRAG_BRIGHT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
${SCENE_SAMPLER}
uniform vec2 uTexel;       // 1 / scene size
uniform float uThreshold;
uniform float uKnee;
uniform float uPreScale;
void main() {
  // 4 bilinear taps on texel corners = 4x4 box: anti-aliased, flicker-resistant downsample.
  vec2 o = uTexel;
  vec3 c = scene(vUv + vec2(-o.x, -o.y)) + scene(vUv + vec2(o.x, -o.y))
         + scene(vUv + vec2(-o.x,  o.y)) + scene(vUv + vec2(o.x,  o.y));
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-5);
  outColor = vec4(c * contrib * uPreScale, 1.0);
}`;

const FRAG_DOWN = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;   // 1 / source size
uniform float uOffset;
void main() {
  vec2 o = uTexel * uOffset;
  vec3 sum = texture(uSrc, vUv).rgb * 4.0;
  sum += texture(uSrc, vUv - o).rgb;
  sum += texture(uSrc, vUv + o).rgb;
  sum += texture(uSrc, vUv + vec2(o.x, -o.y)).rgb;
  sum += texture(uSrc, vUv - vec2(o.x, -o.y)).rgb;
  outColor = vec4(sum * 0.125, 1.0);
}`;

const FRAG_UP = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uSrc;    // lower-resolution accumulated level
uniform sampler2D uBase;   // this level's downsample
uniform vec2 uTexel;       // 1 / source (lower) size
uniform float uOffset;
uniform float uBaseWeight;
void main() {
  vec2 h = uTexel * 0.5 * uOffset;
  vec3 sum = texture(uSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  sum += texture(uSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  sum += texture(uSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  sum += texture(uSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  sum += texture(uSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  sum += texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  outColor = vec4(texture(uBase, vUv).rgb * uBaseWeight + sum * (1.0 / 12.0), 1.0);
}`;

const FRAG_COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
${SCENE_SAMPLER}
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uAspect;
uniform float uTime;
uniform float uBloomStrength;
uniform float uChromatic;
uniform float uImpact;
uniform int uImpactMode;
uniform vec3 uImpactTint;
uniform float uDesaturate;
uniform float uContrast;
uniform float uBrightness;
uniform float uSaturation;
uniform vec4 uTint;
uniform vec4 uFlash;
uniform float uVignette;
uniform vec3 uVignetteColor;
uniform float uGrain;
uniform float uRadialBlur;
uniform vec2 uRadialCenter;
uniform vec2 uMotionBlur;
uniform int uTaps;
uniform int uShockCount;
uniform vec4 uShockA[${MAX_SHOCKWAVES}];   // x, y, radius, thickness  (GL uv, radius in screen heights)
uniform float uShockS[${MAX_SHOCKWAVES}];  // strength
uniform float uLetterbox;
uniform float uScanlines;
uniform vec4 uInk;   // impact ink detector: radius1 px, radius2 px, lod1, lod2

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float lumAt(vec2 uv, float lod) { return dot(textureLod(uScene, vec2(uv.x, 1.0 - uv.y), lod).rgb, LUMA); }

// Brightest of the horizontal/vertical pair minima at radius r: a cheap morphological closing. Thin dark
// strokes (brighter on both sides along some axis) rise to their surroundings; edges and corners of large
// regions and the dark side of bright halos (dark on one side) do not, so only figures/lines get inked.
// (Axis pairs catch strokes of any orientation; diagonal pairs would falsely ink convex corners.)
float closing(vec2 uv, vec2 px, float r, float lod) {
  vec2 a = vec2(px.x * r, 0.0);
  vec2 b = vec2(0.0, px.y * r);
  float m = min(lumAt(uv + a, lod), lumAt(uv - a, lod));
  return max(m, min(lumAt(uv + b, lod), lumAt(uv - b, lod)));
}

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

void main() {
  vec2 uv = vUv;
  uint frame = uint(max(uTime, 0.0) * 60.0);
  uvec2 fc = uvec2(gl_FragCoord.xy);
  uint h1 = pcg(fc.x + pcg(fc.y + pcg(frame)));
  float rnd = float(h1) * (1.0 / 4294967295.0);

  /* ---- 1. shockwave displacement ---------------------------------- */
  vec2 disp = vec2(0.0);
  float ring = 0.0;
  for (int i = 0; i < ${MAX_SHOCKWAVES}; i++) {
    if (i >= uShockCount) break;
    vec4 s = uShockA[i];
    vec2 d = vec2((uv.x - s.x) * uAspect, uv.y - s.y);
    float dist = length(d);
    float x = (dist - s.z) / max(s.w, 1e-4);
    float ax = abs(x);
    if (ax < 1.0 && dist > 1e-5) {
      // Lens profile: zero on the ring line and at both edges, opposite signs inside/outside.
      float prof = x * (1.0 - pow(ax, 0.8)) * 1.7;
      vec2 off = (d / dist) * prof * uShockS[i];
      disp += vec2(off.x / uAspect, off.y);
      float e = 1.0 - ax;
      ring += e * e * e * uShockS[i];
    }
  }
  vec2 uvG = uv + disp;
  vec2 ringSplit = disp * 0.3;

  /* ---- 2-4. motion blur, radial blur, chromatic aberration -------- */
  vec2 c = uv - 0.5;
  vec2 ca = c * (uChromatic * 0.03 * length(c));
  vec2 uvR = uvG + ringSplit + ca;
  vec2 uvB = uvG - ringSplit - ca;
  vec2 dRB = uvR - uvB;
  bool split = dot(dRB, dRB) > 1.6e-7;  // only split channels where R/B separate by >~0.75 px

  vec3 col;
  if (uTaps > 1) {
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    float nt = float(uTaps);
    // Per-pixel jitter of the tap positions turns stepping/ghosting into fine noise (hidden by grain).
    float jit = float(pcg(h1)) * (1.0 / 4294967295.0);
    vec2 radial = (uRadialCenter - uvG) * (uRadialBlur * 0.22);
    float radialOn = step(1e-4, uRadialBlur);
    for (int i = 0; i < ${MAX_TAPS}; i++) {
      if (i >= uTaps) break;
      float fi = float(i) + jit;
      float t = fi / nt;
      vec2 off = uMotionBlur * (fi - 0.5 * nt) + radial * t;
      float w = 1.0 - 0.6 * t * radialOn;
      vec3 sm = split ? vec3(scene(uvR + off).r, scene(uvG + off).g, scene(uvB + off).b) : scene(uvG + off);
      acc += sm * w;
      wsum += w;
    }
    col = acc / wsum;
  } else {
    col = split ? vec3(scene(uvR).r, scene(uvG).g, scene(uvB).b) : scene(uvG);
  }

  /* ---- 5. bloom ---------------------------------------------------- */
  vec3 bloom = texture(uBloom, uvG).rgb * uBloomStrength;
  col += bloom;
  col += vec3(ring * 1.4);

  /* ---- 6. grading -------------------------------------------------- */
  col = (col - 0.5) * uContrast + 0.5 + uBrightness;
  float l = dot(col, LUMA);
  col = mix(col, vec3(l), clamp(uDesaturate, 0.0, 1.0));
  l = dot(col, LUMA);
  col = mix(vec3(l), col, uSaturation);
  col = mix(col, uTint.rgb, clamp(uTint.a, 0.0, 1.0));
  col = max(col, vec3(0.0));

  /* ---- 7. impact frame --------------------------------------------- */
  if (uImpact > 0.0005) {
    vec3 cc = clamp(col, 0.0, 1.0);
    vec3 imp;
    if (uImpactMode == 0) {
      imp = 1.0 - cc;
    } else {
      // "Ink" = thin dark strokes (figures, weapons, debris) found with a two-scale closing; large dark
      // regions and the dark side of bright halos stay background. Near-white energy stays white-hot.
      vec2 px = 1.0 / uResolution;
      float Lc = lumAt(uvG, 0.0);
      float cl = max(closing(uvG, px, uInk.x, uInk.z), closing(uvG, px, uInk.y, uInk.w));
      float v = cl - Lc;
      float ink = smoothstep(0.008, 0.03, v) * smoothstep(0.14, 0.3, v / (cl + 0.03));
      ink *= 1.0 - smoothstep(0.08, 0.17, Lc);  // only genuinely dark strokes (figures are near-black)
      float L = dot(cc, LUMA);
      float hot = smoothstep(0.62, 0.9, L);
      float halo = clamp(dot(bloom, LUMA) * 2.2, 0.0, 1.0) * (1.0 - hot) * (1.0 - ink);
      if (uImpactMode == 1) {
        vec3 bg = mix(vec3(0.97), uImpactTint, 0.4);
        imp = mix(bg, vec3(0.015), ink);
        imp = mix(imp, uImpactTint * 0.8, halo * 0.8);
        imp = mix(imp, vec3(1.0), hot);
      } else {
        imp = mix(vec3(0.012), vec3(0.96), ink);
        imp = mix(imp, uImpactTint, halo * 0.9);
        imp = mix(imp, mix(uImpactTint, vec3(1.0), 0.55), hot);
      }
    }
    col = mix(col, imp, clamp(uImpact, 0.0, 1.0));
  }

  /* ---- 8. flash ---------------------------------------------------- */
  col += uFlash.rgb * uFlash.a;

  /* ---- 9. vignette ------------------------------------------------- */
  float vr = length(c) * 1.41421;
  float vig = smoothstep(0.35, 1.25, vr) * clamp(uVignette, 0.0, 1.0) * 1.15;
  col = mix(col, uVignetteColor, clamp(vig, 0.0, 1.0));

  /* ---- 10. scanlines ------------------------------------------------ */
  if (uScanlines > 0.0) {
    float sl = 0.5 + 0.5 * cos(gl_FragCoord.y * 2.0943951);
    col *= 1.0 - uScanlines * 0.3 * sl;
    float bandY = fract(uv.y * 0.65 - uTime * 0.22) - 0.5;
    col += uScanlines * 0.045 * exp(-bandY * bandY * 180.0);
  }

  /* ---- 11. grain (+ always-on 8-bit dither) -------------------------- */
  float n = rnd - 0.5;
  float gl2 = dot(clamp(col, 0.0, 1.0), LUMA);
  float response = 0.5 + 2.0 * gl2 * (1.0 - gl2);
  col += n * (uGrain * response * 2.0 + 1.0 / 255.0);

  /* ---- 12. letterbox ------------------------------------------------ */
  float barH = 0.12 * clamp(uLetterbox, 0.0, 1.0);
  if (barH > 0.0) {
    float aa = 1.0 / uResolution.y;
    float edgeDist = min(uv.y, 1.0 - uv.y);
    float bar = 1.0 - smoothstep(barH - aa, barH + aa, edgeDist);
    col = mix(col, vec3(0.0), bar);
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

/* ================================================================== */
/* GL helpers                                                         */
/* ================================================================== */

type UniformMap = Record<string, WebGLUniformLocation | null>;

interface Program {
  prog: WebGLProgram;
  u: UniformMap;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`[PostFX] failed to create ${what}`);
  return v;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const sh = must(gl.createShader(type), `${label} shader`);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    gl.deleteShader(sh);
    throw new Error(`[PostFX] ${label} compile error:\n${log}`);
  }
  return sh;
}

function createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fsSrc: string, label: string): Program {
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, label);
  const prog = must(gl.createProgram(), `${label} program`);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(prog) ?? '';
    gl.deleteProgram(prog);
    throw new Error(`[PostFX] ${label} link error:\n${log}`);
  }
  const u: UniformMap = {};
  const count = (gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number) || 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(prog, i);
    if (!info) continue;
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, info.name);
  }
  return { prog, u };
}

let supportCache: boolean | null = null;

/* ================================================================== */
/* WebGL2 compositor                                                  */
/* ================================================================== */

export class PostFX implements IPostFX {
  /** True if this browser can create a WebGL2 context (tested once on a scratch canvas). */
  static isSupported(): boolean {
    if (supportCache !== null) return supportCache;
    supportCache = false;
    try {
      if (typeof document === 'undefined') return false;
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      supportCache = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      supportCache = false;
    }
    return supportCache;
  }

  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ready = false;
  private lost = false;
  private broken = false;
  private disposed = false;
  private warned = false;

  // Fallback (used when WebGL2 is unavailable / broken / lost).
  private fallback: Canvas2DPostFX | null = null;
  private fallbackCanvas: HTMLCanvasElement | null = null;
  private savedDisplay = '';
  private movedId = '';

  // GL resources.
  private vao: WebGLVertexArrayObject | null = null;
  private vbo: WebGLBuffer | null = null;
  private progBright: Program | null = null;
  private progDown: Program | null = null;
  private progUp: Program | null = null;
  private progComposite: Program | null = null;
  private sceneTex: WebGLTexture | null = null;
  private blackTex: WebGLTexture | null = null;
  private sceneW = 0;
  private sceneH = 0;
  private down: Target[] = [];
  private up: Target[] = [];
  private bloomFloat = false;
  private levels = 0;
  private inkR1 = 7;
  private inkR2 = 20;
  private inkLod1 = 1;
  private inkLod2 = 2;

  private width: number;
  private height: number;
  private allocW = 0;
  private allocH = 0;

  private readonly shockA = new Float32Array(MAX_SHOCKWAVES * 4);
  private readonly shockS = new Float32Array(MAX_SHOCKWAVES);

  constructor(output: HTMLCanvasElement) {
    this.canvas = output;
    this.width = Math.max(1, output.width | 0);
    this.height = Math.max(1, output.height | 0);
    output.addEventListener('webglcontextlost', this.onContextLost, false);
    output.addEventListener('webglcontextrestored', this.onContextRestored, false);

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = output.getContext('webgl2', GL_ATTRIBUTES) as WebGL2RenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl) {
      this.broken = true;
      this.enterFallback();
      return;
    }
    this.gl = gl;
    try {
      this.initGL(gl);
    } catch (err) {
      console.warn('[PostFX] WebGL2 initialisation failed — using the Canvas2D compositor.', err);
      this.releaseGL();
      this.broken = true;
      this.enterFallback();
    }
  }

  get accelerated(): boolean {
    return this.ready && !this.lost && !this.broken && this.fallback === null;
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.width = w;
    this.height = h;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.fallback?.resize(w, h);
    if (this.gl && this.ready && !this.lost) {
      try {
        this.allocateBloom(this.gl);
      } catch (err) {
        this.warnOnce(err);
      }
    }
  }

  render(source: HTMLCanvasElement | OffscreenCanvas, params: PostFXParams): void {
    if (this.disposed) return;
    if (this.fallback) {
      this.fallback.render(source, params);
      return;
    }
    const gl = this.gl;
    if (!gl || !this.ready || this.lost) return;
    if (gl.isContextLost()) {
      // The 'webglcontextlost' event is on its way; render this frame through the fallback already.
      this.lost = true;
      this.dropGLRefs();
      this.enterFallback();
      (this.fallback as Canvas2DPostFX | null)?.render(source, params);
      return;
    }
    try {
      this.renderGL(gl, source, params);
    } catch (err) {
      this.warnOnce(err);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
    if (this.gl && !this.lost) this.releaseGL();
    this.exitFallback();
    this.fallback = null;
  }

  /* ---------------------------------------------------------------- */

  private warnOnce(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('[PostFX] render error (further errors suppressed):', err);
  }

  private readonly onContextLost = (e: Event): void => {
    e.preventDefault(); // ask the browser to restore the context
    if (this.disposed) return;
    this.lost = true;
    this.dropGLRefs();
    this.enterFallback();
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed || !this.gl || this.broken) return;
    try {
      this.initGL(this.gl);
      this.lost = false;
      this.exitFallback();
    } catch (err) {
      console.warn('[PostFX] could not rebuild after context restore — staying on Canvas2D.', err);
      this.broken = true;
    }
  };

  private initGL(gl: WebGL2RenderingContext): void {
    this.ready = false;
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT, 'vertex');
    try {
      this.progBright = createProgram(gl, vs, FRAG_BRIGHT, 'bright');
      this.progDown = createProgram(gl, vs, FRAG_DOWN, 'downsample');
      this.progUp = createProgram(gl, vs, FRAG_UP, 'upsample');
      this.progComposite = createProgram(gl, vs, FRAG_COMPOSITE, 'composite');
    } finally {
      gl.deleteShader(vs);
    }

    // Fullscreen triangle.
    this.vao = must(gl.createVertexArray(), 'VAO');
    this.vbo = must(gl.createBuffer(), 'vertex buffer');
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Static state.
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // Sampler bindings never change.
    gl.useProgram(this.progBright.prog);
    gl.uniform1i(this.progBright.u.uScene, 0);
    gl.useProgram(this.progDown.prog);
    gl.uniform1i(this.progDown.u.uSrc, 0);
    gl.useProgram(this.progUp.prog);
    gl.uniform1i(this.progUp.u.uSrc, 0);
    gl.uniform1i(this.progUp.u.uBase, 1);
    gl.useProgram(this.progComposite.prog);
    gl.uniform1i(this.progComposite.u.uScene, 0);
    gl.uniform1i(this.progComposite.u.uBloom, 1);
    gl.useProgram(null);

    // 1×1 black texture used when bloom is disabled.
    this.blackTex = must(gl.createTexture(), 'black texture');
    gl.bindTexture(gl.TEXTURE_2D, this.blackTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // Half-float bloom targets when renderable (no clamping, smoother halos); RGBA8 otherwise.
    const ext = gl.getExtension('EXT_color_buffer_float') ?? gl.getExtension('EXT_color_buffer_half_float');
    this.bloomFloat = !!ext && this.probeFloatTarget(gl);

    this.sceneW = this.sceneH = 0;
    this.allocW = this.allocH = 0;
    this.ready = true;
    this.allocateBloom(gl);
  }

  private probeFloatTarget(gl: WebGL2RenderingContext): boolean {
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) return false;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, 4, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }

  private createTarget(gl: WebGL2RenderingContext, w: number, h: number): Target {
    const tex = must(gl.createTexture(), 'bloom texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.bloomFloat ? gl.RGBA16F : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = must(gl.createFramebuffer(), 'framebuffer');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      throw new Error('[PostFX] bloom framebuffer incomplete');
    }
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { tex, fbo, w, h };
  }

  private deleteTargets(gl: WebGL2RenderingContext): void {
    for (const t of this.down) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    for (const t of this.up) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    this.down = [];
    this.up = [];
    this.levels = 0;
  }

  /** (Re)build the bloom chain for the current output size. */
  private allocateBloom(gl: WebGL2RenderingContext): void {
    if (this.allocW === this.width && this.allocH === this.height && this.levels > 0) return;
    this.deleteTargets(gl);
    let w = Math.max(1, this.width >> 1);
    let h = Math.max(1, this.height >> 1);
    for (let i = 0; i < MAX_BLOOM_LEVELS; i++) {
      if (i > 0 && (w < 4 || h < 4)) break;
      this.down.push(this.createTarget(gl, w, h));
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    for (let i = 0; i < this.down.length - 1; i++) {
      this.up.push(this.createTarget(gl, this.down[i].w, this.down[i].h));
    }
    this.levels = this.down.length;
    // Impact-frame ink detector scales with resolution (tuned at 720p: radii 7 & 20 px).
    const s = this.height / 720;
    this.inkR1 = 7 * s;
    this.inkR2 = 20 * s;
    // Near-full-resolution side samples: blurrier mips leak nearby bright lines into the closing.
    this.inkLod1 = Math.max(0, Math.log2(s));
    this.inkLod2 = Math.max(0, Math.log2(s)) + 0.5;
    this.allocW = this.width;
    this.allocH = this.height;
  }

  private allocateScene(gl: WebGL2RenderingContext, w: number, h: number): void {
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    const tex = must(gl.createTexture(), 'scene texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const mipLevels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    // Immutable storage with a full mip chain: always complete; mips are only regenerated on the
    // frames that need a local mean (impact modes 1 & 2).
    gl.texStorage2D(gl.TEXTURE_2D, mipLevels, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.sceneTex = tex;
    this.sceneW = w;
    this.sceneH = h;
  }

  private renderGL(gl: WebGL2RenderingContext, source: HTMLCanvasElement | OffscreenCanvas, p: PostFXParams): void {
    const sw = source.width | 0;
    const sh = source.height | 0;
    if (sw <= 0 || sh <= 0) return;

    // Tolerate callers that resize the output canvas directly.
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.width = Math.max(1, this.canvas.width);
      this.height = Math.max(1, this.canvas.height);
    }
    this.allocateBloom(gl);
    if (sw !== this.sceneW || sh !== this.sceneH || !this.sceneTex) this.allocateScene(gl, sw, sh);

    const pBright = this.progBright!;
    const pDown = this.progDown!;
    const pUp = this.progUp!;
    const pComp = this.progComposite!;

    // 1. Upload.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    const impact = p.impact > 0.0005;
    if (impact && p.impactMode !== 0) gl.generateMipmap(gl.TEXTURE_2D);

    gl.bindVertexArray(this.vao);

    // 2. Bloom chain.
    const bloomOn = p.bloomStrength > 0.001 && this.levels > 0;
    const n = this.levels;
    if (bloomOn) {
      const radius = clamp(p.bloomRadius, 0.25, 3);
      const threshold = clamp(p.bloomThreshold, 0, 1.5);
      // Bright pass (scene -> down[0]).
      gl.useProgram(pBright.prog);
      gl.uniform2f(pBright.u.uTexel, 1 / sw, 1 / sh);
      gl.uniform1f(pBright.u.uThreshold, threshold);
      gl.uniform1f(pBright.u.uKnee, Math.max(1e-3, threshold * 0.5));
      gl.uniform1f(pBright.u.uPreScale, this.bloomFloat ? 1 : 1 / n);
      this.drawTo(gl, this.down[0]);

      // Downsample.
      gl.useProgram(pDown.prog);
      gl.uniform1f(pDown.u.uOffset, radius);
      for (let i = 1; i < n; i++) {
        const src = this.down[i - 1];
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform2f(pDown.u.uTexel, 1 / src.w, 1 / src.h);
        this.drawTo(gl, this.down[i]);
      }

      // Upsample + accumulate (down[n-1] -> up[n-2] -> ... -> up[0]).
      if (n > 1) {
        gl.useProgram(pUp.prog);
        gl.uniform1f(pUp.u.uOffset, radius);
        gl.uniform1f(pUp.u.uBaseWeight, 1);
        for (let i = n - 2; i >= 0; i--) {
          const src = i === n - 2 ? this.down[n - 1] : this.up[i + 1];
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, src.tex);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.down[i].tex);
          gl.uniform2f(pUp.u.uTexel, 1 / src.w, 1 / src.h);
          this.drawTo(gl, this.up[i]);
        }
      }
    }

    // 3. Composite to the screen.
    gl.useProgram(pComp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1);
    const bloomTex = !bloomOn ? this.blackTex : n > 1 ? this.up[0].tex : this.down[0].tex;
    gl.bindTexture(gl.TEXTURE_2D, bloomTex);
    gl.activeTexture(gl.TEXTURE0);

    const u = pComp.u;
    const W = this.width;
    const H = this.height;
    gl.uniform2f(u.uResolution, W, H);
    gl.uniform1f(u.uAspect, W / H);
    gl.uniform1f(u.uTime, p.time);
    // Float chain accumulates every level: normalise by level count. RGBA8 chain was pre-scaled.
    const bloomScale = bloomOn ? clamp(p.bloomStrength, 0, 4) * (this.bloomFloat ? 1 / n : 1) * 1.6 : 0;
    gl.uniform1f(u.uBloomStrength, bloomScale);
    gl.uniform1f(u.uChromatic, clamp(p.chromatic, 0, 2));
    gl.uniform1f(u.uImpact, impact ? clamp(p.impact, 0, 1) : 0);
    gl.uniform1i(u.uImpactMode, p.impactMode | 0);
    gl.uniform3f(u.uImpactTint, p.impactTint[0], p.impactTint[1], p.impactTint[2]);
    gl.uniform1f(u.uDesaturate, p.desaturate);
    gl.uniform1f(u.uContrast, p.contrast);
    gl.uniform1f(u.uBrightness, p.brightness);
    gl.uniform1f(u.uSaturation, p.saturation);
    gl.uniform4f(u.uTint, p.tint[0], p.tint[1], p.tint[2], p.tint[3]);
    gl.uniform4f(u.uFlash, p.flash[0], p.flash[1], p.flash[2], p.flash[3]);
    gl.uniform1f(u.uVignette, p.vignette);
    gl.uniform3f(u.uVignetteColor, p.vignetteColor[0], p.vignetteColor[1], p.vignetteColor[2]);
    gl.uniform1f(u.uGrain, Math.max(0, p.grain));
    gl.uniform1f(u.uLetterbox, p.letterbox);
    gl.uniform1f(u.uScanlines, Math.max(0, p.scanlines));
    gl.uniform4f(u.uInk, this.inkR1, this.inkR2, this.inkLod1, this.inkLod2);

    // Blur taps (params use top-left UV; the GL pipeline is bottom-left, so flip y).
    const radial = Math.max(0, p.radialBlur);
    const mbx = p.motionBlur[0];
    const mby = -p.motionBlur[1];
    const motionOn = Math.abs(mbx) + Math.abs(mby) > 1e-6;
    const taps = radial > 1e-3 ? 12 : motionOn ? 8 : 1;
    gl.uniform1i(u.uTaps, taps);
    gl.uniform1f(u.uRadialBlur, radial > 1e-3 ? radial : 0);
    gl.uniform2f(u.uRadialCenter, p.radialCenter[0], 1 - p.radialCenter[1]);
    gl.uniform2f(u.uMotionBlur, motionOn ? mbx : 0, motionOn ? mby : 0);

    // Shockwaves.
    const waves = p.shockwaves;
    let count = 0;
    for (let i = 0; i < waves.length && count < MAX_SHOCKWAVES; i++) {
      const s = waves[i];
      if (!(s.strength > 0) || !(s.thickness > 0)) continue;
      const k = count * 4;
      this.shockA[k] = s.x;
      this.shockA[k + 1] = 1 - s.y;
      this.shockA[k + 2] = s.radius;
      this.shockA[k + 3] = s.thickness;
      this.shockS[count] = s.strength;
      count++;
    }
    gl.uniform1i(u.uShockCount, count);
    if (count > 0) {
      gl.uniform4fv(u.uShockA, this.shockA);
      gl.uniform1fv(u.uShockS, this.shockS);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  private drawTo(gl: WebGL2RenderingContext, t: Target): void {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Forget GL handles without deleting them (they died with the context). */
  private dropGLRefs(): void {
    this.ready = false;
    this.vao = null;
    this.vbo = null;
    this.progBright = this.progDown = this.progUp = this.progComposite = null;
    this.sceneTex = null;
    this.blackTex = null;
    this.down = [];
    this.up = [];
    this.levels = 0;
    this.sceneW = this.sceneH = 0;
    this.allocW = this.allocH = 0;
  }

  private releaseGL(): void {
    const gl = this.gl;
    if (!gl) return;
    try {
      this.deleteTargets(gl);
      for (const p of [this.progBright, this.progDown, this.progUp, this.progComposite]) if (p) gl.deleteProgram(p.prog);
      if (this.sceneTex) gl.deleteTexture(this.sceneTex);
      if (this.blackTex) gl.deleteTexture(this.blackTex);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.vao) gl.deleteVertexArray(this.vao);
    } catch {
      /* context may already be gone */
    }
    this.dropGLRefs();
  }

  /**
   * Switch to Canvas2D compositing. If the output canvas has no context yet we draw on it directly;
   * otherwise (it owns a WebGL context) a sibling canvas with the same class/style/id takes its place.
   */
  private enterFallback(): void {
    if (this.fallback) return;
    if (!this.gl) {
      const direct = new Canvas2DPostFX(this.canvas);
      if (direct.usable) {
        this.fallback = direct;
        return;
      }
    }
    if (typeof document === 'undefined') return;
    const doc = this.canvas.ownerDocument ?? document;
    const sib = doc.createElement('canvas');
    sib.width = this.width;
    sib.height = this.height;
    sib.className = this.canvas.className;
    sib.style.cssText = this.canvas.style.cssText;
    sib.setAttribute('data-postfx-fallback', '');
    if (this.canvas.parentNode) {
      this.canvas.parentNode.insertBefore(sib, this.canvas.nextSibling);
      this.savedDisplay = this.canvas.style.display;
      this.canvas.style.display = 'none';
      if (this.canvas.id) {
        this.movedId = this.canvas.id;
        this.canvas.removeAttribute('id');
        sib.id = this.movedId;
      }
    }
    this.fallbackCanvas = sib;
    const fb = new Canvas2DPostFX(sib);
    this.fallback = fb.usable ? fb : null;
  }

  private exitFallback(): void {
    if (this.fallbackCanvas) {
      if (this.movedId) {
        this.fallbackCanvas.removeAttribute('id');
        this.canvas.id = this.movedId;
        this.movedId = '';
      }
      this.fallbackCanvas.remove();
      this.canvas.style.display = this.savedDisplay;
      this.fallbackCanvas = null;
    }
    // A direct (same-canvas) fallback is only used when WebGL never existed; keep it in that case.
    if (this.gl) this.fallback = null;
  }
}

/* ================================================================== */
/* Canvas2D compositor (fallback)                                     */
/* ================================================================== */

function detectFilter(ctx: CanvasRenderingContext2D): boolean {
  try {
    if (typeof (ctx as { filter?: unknown }).filter !== 'string') return false;
    const prev = ctx.filter;
    ctx.filter = 'blur(1px)';
    const ok = ctx.filter === 'blur(1px)';
    ctx.filter = prev || 'none';
    return ok;
  } catch {
    return false;
  }
}

function rgbCss(r: number, g: number, b: number, a: number): string {
  const R = Math.round(clamp(r, 0, 1) * 255);
  const G = Math.round(clamp(g, 0, 1) * 255);
  const B = Math.round(clamp(b, 0, 1) * 255);
  return `rgba(${R},${G},${B},${clamp(a, 0, 1).toFixed(3)})`;
}

/**
 * Canvas2D approximation of the GPU compositor. Cheap, never throws, and keeps the cinematic language
 * (bloom glow, flashes, impact frames, letterbox, vignette, grain) readable on any browser.
 */
export class Canvas2DPostFX implements IPostFX {
  readonly accelerated = false;
  /** False if a 2D context could not be obtained (render() becomes a no-op). */
  readonly usable: boolean;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly filterOk: boolean;
  private bloomCanvas: HTMLCanvasElement | null = null;
  private bloomCtx: CanvasRenderingContext2D | null = null;
  private noisePattern: CanvasPattern | null = null;
  private scanPattern: CanvasPattern | null = null;
  private vignette: CanvasGradient | null = null;
  private vignetteKey = '';
  private rng = 0x9e3779b9;
  private warned = false;

  constructor(target: HTMLCanvasElement) {
    this.canvas = target;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = target.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    } catch {
      ctx = null;
    }
    this.ctx = ctx;
    this.usable = ctx !== null;
    this.filterOk = ctx !== null && detectFilter(ctx);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  render(source: HTMLCanvasElement | OffscreenCanvas, params: PostFXParams): void {
    if (!this.ctx) return;
    try {
      this.renderInner(this.ctx, source, params);
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        console.warn('[PostFX:Canvas2D] render error (further errors suppressed):', err);
      }
      try {
        this.resetState(this.ctx);
      } catch {
        /* ignore */
      }
    }
  }

  dispose(): void {
    this.bloomCanvas = null;
    this.bloomCtx = null;
    this.noisePattern = null;
    this.scanPattern = null;
    this.vignette = null;
  }

  private resetState(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.filterOk) ctx.filter = 'none';
  }

  private nextRand(): number {
    // xorshift32 — deterministic, allocation-free.
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  private renderInner(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement | OffscreenCanvas, p: PostFXParams): void {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (source.width <= 0 || source.height <= 0) return;
    this.resetState(ctx);

    // Base image with grading baked in via CSS filters where available.
    if (this.filterOk) {
      const sat = Math.max(0, p.saturation * (1 - clamp(p.desaturate, 0, 1)));
      const bright = Math.max(0, 1 + p.brightness);
      ctx.filter = `contrast(${p.contrast.toFixed(3)}) brightness(${bright.toFixed(3)}) saturate(${sat.toFixed(3)})`;
    }
    ctx.drawImage(source, 0, 0, W, H);

    // Directional motion blur: a few offset ghost copies.
    const mbx = p.motionBlur[0] * W;
    const mby = p.motionBlur[1] * H;
    if (Math.abs(mbx) + Math.abs(mby) > 0.05) {
      ctx.globalAlpha = 0.22;
      for (let i = 1; i <= 3; i++) {
        ctx.drawImage(source, mbx * i * 1.2, mby * i * 1.2, W, H);
        ctx.drawImage(source, -mbx * i * 1.2, -mby * i * 1.2, W, H);
      }
      ctx.globalAlpha = 1;
    }

    // Radial zoom blur: scaled ghost copies around the centre.
    if (p.radialBlur > 0.01) {
      const cx = p.radialCenter[0] * W;
      const cy = p.radialCenter[1] * H;
      for (let i = 1; i <= 4; i++) {
        const s = 1 + p.radialBlur * 0.045 * i;
        ctx.globalAlpha = 0.24 * (1 - i / 5);
        ctx.setTransform(s, 0, 0, s, cx - cx * s, cy - cy * s);
        ctx.drawImage(source, 0, 0, W, H);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (this.filterOk) ctx.filter = 'none';

    // Bloom: threshold + blur a quarter-res copy, add it back.
    if (p.bloomStrength > 0.01 && this.filterOk) this.drawBloom(ctx, source, p, W, H);

    // Tint.
    if (p.tint[3] > 0.001) {
      ctx.fillStyle = rgbCss(p.tint[0], p.tint[1], p.tint[2], p.tint[3]);
      ctx.fillRect(0, 0, W, H);
    }

    // Shockwaves: faint refractive rings.
    const waves = p.shockwaves;
    if (waves.length > 0) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < waves.length && i < MAX_SHOCKWAVES; i++) {
        const s = waves[i];
        if (!(s.strength > 0) || !(s.thickness > 0)) continue;
        ctx.strokeStyle = rgbCss(1, 1, 1, clamp(s.strength * 2.2, 0, 0.5));
        ctx.lineWidth = Math.max(1, s.thickness * H * 0.35);
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, Math.max(0.5, s.radius * H), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Impact frame.
    if (p.impact > 0.0005) this.drawImpact(ctx, source, p, W, H);

    // Flash.
    if (p.flash[3] > 0.001) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgbCss(p.flash[0], p.flash[1], p.flash[2], p.flash[3]);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Vignette.
    if (p.vignette > 0.001) {
      const vc = p.vignetteColor;
      const key = `${W}x${H}:${vc[0]},${vc[1]},${vc[2]}`;
      if (key !== this.vignetteKey || !this.vignette) {
        const r = Math.hypot(W, H) * 0.5;
        const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.3, W / 2, H / 2, r * 1.05);
        g.addColorStop(0, rgbCss(vc[0], vc[1], vc[2], 0));
        g.addColorStop(0.55, rgbCss(vc[0], vc[1], vc[2], 0.35));
        g.addColorStop(1, rgbCss(vc[0], vc[1], vc[2], 1));
        this.vignette = g;
        this.vignetteKey = key;
      }
      ctx.globalAlpha = clamp(p.vignette, 0, 1);
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    // Scanlines.
    if (p.scanlines > 0.001) {
      const pat = this.getScanPattern(ctx);
      if (pat) {
        ctx.globalAlpha = clamp(p.scanlines * 0.35, 0, 1);
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }

    // Grain.
    if (p.grain > 0.001) {
      const pat = this.getNoisePattern(ctx);
      if (pat) {
        const ox = Math.floor(this.nextRand() * 128);
        const oy = Math.floor(this.nextRand() * 128);
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = clamp(p.grain * 2.5, 0, 1);
        ctx.setTransform(1, 0, 0, 1, -ox, -oy);
        ctx.fillStyle = pat;
        ctx.fillRect(ox, oy, W, H);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Letterbox.
    const bar = 0.12 * clamp(p.letterbox, 0, 1) * H;
    if (bar > 0.25) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }
    this.resetState(ctx);
  }

  private drawBloom(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement | OffscreenCanvas, p: PostFXParams, W: number, H: number): void {
    if (typeof document === 'undefined') return;
    const bw = Math.max(1, Math.floor(W / 4));
    const bh = Math.max(1, Math.floor(H / 4));
    if (!this.bloomCanvas) {
      this.bloomCanvas = document.createElement('canvas');
      this.bloomCtx = this.bloomCanvas.getContext('2d');
    }
    const bc = this.bloomCanvas;
    const bctx = this.bloomCtx;
    if (!bctx) return;
    if (bc.width !== bw) bc.width = bw;
    if (bc.height !== bh) bc.height = bh;
    // brightness() maps the threshold to 0.5, contrast() turns that into a steep soft knee.
    const t = clamp(p.bloomThreshold, 0.05, 1);
    bctx.globalCompositeOperation = 'source-over';
    bctx.filter = `brightness(${(0.5 / t).toFixed(3)}) contrast(3.2) blur(${Math.max(1, 3 * p.bloomRadius).toFixed(1)}px)`;
    bctx.fillStyle = '#000';
    bctx.fillRect(0, 0, bw, bh);
    bctx.drawImage(source, 0, 0, bw, bh);
    bctx.filter = 'none';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(p.bloomStrength * 0.45, 0, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bc, 0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawImpact(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement | OffscreenCanvas, p: PostFXParams, W: number, H: number): void {
    const a = clamp(p.impact, 0, 1);
    const tint = p.impactTint;
    if (p.impactMode !== 0 && this.filterOk) {
      // Threshold the current frame into a stark two-tone image.
      ctx.globalAlpha = a;
      ctx.filter = p.impactMode === 1 ? 'grayscale(1) brightness(2.4) contrast(9)' : 'grayscale(1) brightness(2.4) contrast(9) invert(1)';
      ctx.drawImage(this.canvas, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = p.impactMode === 1 ? 'multiply' : 'screen';
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = rgbCss(tint[0], tint[1], tint[2], 1);
      ctx.fillRect(0, 0, W, H);
      // Keep near-white energy white-hot: add back only the brightest parts of the original frame.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.filter = 'grayscale(1) brightness(0.75) contrast(12)';
      ctx.drawImage(source, 0, 0, W, H);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    // Colour inversion: difference with white.
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private getScanPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.scanPattern || typeof document === 'undefined') return this.scanPattern;
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 3;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = 'rgba(0,0,0,0)';
    g.clearRect(0, 0, 4, 3);
    g.fillStyle = '#000';
    g.fillRect(0, 0, 4, 1);
    this.scanPattern = ctx.createPattern(c, 'repeat');
    return this.scanPattern;
  }

  private getNoisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
    if (this.noisePattern || typeof document === 'undefined') return this.noisePattern;
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    if (!g) return null;
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = Math.floor(this.nextRand() * 255);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.noisePattern = ctx.createPattern(c, 'repeat');
    return this.noisePattern;
  }
}

/* ================================================================== */
/* Factory                                                            */
/* ================================================================== */

/**
 * Create the best available compositor for `output`:
 * WebGL2 `PostFX` when supported (it falls back internally if its context is ever lost),
 * otherwise `Canvas2DPostFX`. Pass `{ forceFallback: true }` to force the Canvas2D path.
 */
export function createPostFX(output: HTMLCanvasElement, options: PostFXOptions = {}): IPostFX {
  if (!options.forceFallback && PostFX.isSupported()) return new PostFX(output);
  return new Canvas2DPostFX(output);
}
