/**
 * Post-processing passes: linear depth, SSAO, volumetric light, TAA, bloom, auto exposure,
 * tonemapping/grading, copy.
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_SHADOWS } from '../shaders/common';
import { shaderPass, makeRT, type FullscreenPass } from './fullscreen';

// ---------------------------------------------------------------------------------------------
export class CopyPass {
  pass: FullscreenPass;
  constructor() {
    this.pass = shaderPass(`precision highp float; uniform sampler2D t; in vec2 v_uv; out vec4 o; void main(){ o = texture(t, v_uv); }`, { t: { value: null } });
  }
  render(r: THREE.WebGLRenderer, src: THREE.Texture, dst: THREE.WebGLRenderTarget | null) {
    (this.pass.material as THREE.RawShaderMaterial).uniforms.t.value = src;
    this.pass.render(r, dst);
  }
}

// ---------------------------------------------------------------------------------------------
/** Converts the hardware depth buffer to linear view distance (R32F). */
export class LinearDepthPass {
  target: THREE.WebGLRenderTarget;
  pass: FullscreenPass;
  constructor(w: number, h: number) {
    this.target = makeRT(w, h, { type: THREE.FloatType, format: THREE.RedFormat, filter: THREE.NearestFilter });
    this.pass = shaderPass(
      `precision highp float; uniform sampler2D u_depth; uniform mat4 u_projInv; in vec2 v_uv; out vec4 o;
      void main(){ float d = texture(u_depth, v_uv).r; if (d >= 1.0) { o = vec4(1e6); return; }
      vec4 p = u_projInv * vec4(v_uv*2.0-1.0, d*2.0-1.0, 1.0); o = vec4(length(p.xyz/p.w)); }`,
      { u_depth: { value: null }, u_projInv: { value: new THREE.Matrix4() } },
    );
  }
  setSize(w: number, h: number) {
    this.target.setSize(w, h);
  }
  render(r: THREE.WebGLRenderer, depth: THREE.Texture, projInv: THREE.Matrix4) {
    const u = (this.pass.material as THREE.RawShaderMaterial).uniforms;
    u.u_depth.value = depth;
    u.u_projInv.value.copy(projInv);
    this.pass.render(r, this.target);
  }
}

// ---------------------------------------------------------------------------------------------
export class SSAOPass {
  raw: THREE.WebGLRenderTarget;
  blurA: THREE.WebGLRenderTarget;
  blurB: THREE.WebGLRenderTarget;
  private ao: FullscreenPass;
  private blur: FullscreenPass;
  enabled = true;
  constructor(w: number, h: number) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.raw = makeRT(hw, hh, { type: THREE.HalfFloatType, format: THREE.RGFormat });
    this.blurA = makeRT(hw, hh, { type: THREE.HalfFloatType, format: THREE.RGFormat });
    this.blurB = makeRT(hw, hh, { type: THREE.HalfFloatType, format: THREE.RGFormat });
    this.ao = shaderPass(
      /* glsl */ `precision highp float;
      ${GLSL_COMMON}
      uniform sampler2D u_depth; uniform sampler2D u_normal; uniform mat4 u_proj; uniform mat4 u_projInv; uniform mat4 u_view;
      uniform float u_frame; uniform vec2 u_res; uniform float u_radius;
      in vec2 v_uv; out vec4 o;
      vec3 viewPos(vec2 uv) { float d = texture(u_depth, uv).r; vec4 p = u_projInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0); return p.xyz/p.w; }
      void main(){
        float d = texture(u_depth, v_uv).r;
        if (d >= 1.0) { o = vec4(1.0, 6.0e4, 0.0, 1.0); return; }
        vec3 P = viewPos(v_uv);
        vec3 Nw = texture(u_normal, v_uv).xyz;
        vec3 N = normalize(mat3(u_view) * Nw);
        float n = ignT(gl_FragCoord.xy, u_frame);
        float n2 = hash12(gl_FragCoord.xy + u_frame * 1.37);
        float occ = 0.0;
        const int S = 10;
        float radius = u_radius;
        for (int i = 0; i < S; i++) {
          float fi = (float(i) + n) / float(S);
          float phi = 2.399963 * float(i) + n2 * 6.2831853;
          float r = sqrt(fi);
          // cosine-ish hemisphere sample
          vec3 t = normalize(abs(N.y) < 0.99 ? cross(N, vec3(0,1,0)) : cross(N, vec3(1,0,0)));
          vec3 b = cross(N, t);
          vec3 h = t * (cos(phi) * r) + b * (sin(phi) * r) + N * sqrt(max(0.0, 1.0 - r * r));
          vec3 S3 = P + h * radius * mix(0.25, 1.0, fi);
          vec4 c = u_proj * vec4(S3, 1.0);
          vec2 suv = c.xy / c.w * 0.5 + 0.5;
          if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
          float sd = viewPos(suv).z;
          float diff = sd - S3.z;
          float range = smoothstep(0.0, 1.0, radius / abs(P.z - sd));
          occ += step(0.03, diff) * range;
        }
        float ao = 1.0 - occ / float(S);
        o = vec4(ao, -P.z, 0.0, 1.0);
      }`,
      {
        u_depth: { value: null }, u_normal: { value: null }, u_proj: { value: new THREE.Matrix4() }, u_projInv: { value: new THREE.Matrix4() },
        u_view: { value: new THREE.Matrix4() }, u_frame: { value: 0 }, u_res: { value: new THREE.Vector2() }, u_radius: { value: 0.9 },
      },
    );
    this.blur = shaderPass(
      /* glsl */ `precision highp float; uniform sampler2D t; uniform vec2 u_dir; in vec2 v_uv; out vec4 o;
      void main(){ vec2 c = texture(t, v_uv).rg; float sum = c.r; float w = 1.0;
        for (int i = -3; i <= 3; i++) { if (i == 0) continue; vec2 s = texture(t, v_uv + u_dir * float(i)).rg;
          float wt = exp(-min(abs(s.g - c.g) / max(0.05, c.g * 0.04), 60.0)) * exp(-float(i*i) * 0.12); sum += s.r * wt; w += wt; }
        o = vec4(sum / w, c.g, 0.0, 1.0); }`,
      { t: { value: null }, u_dir: { value: new THREE.Vector2() } },
    );
  }
  setSize(w: number, h: number) {
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.raw.setSize(hw, hh);
    this.blurA.setSize(hw, hh);
    this.blurB.setSize(hw, hh);
  }
  render(r: THREE.WebGLRenderer, depth: THREE.Texture, normal: THREE.Texture, cam: THREE.PerspectiveCamera, frame: number): THREE.Texture {
    const u = (this.ao.material as THREE.RawShaderMaterial).uniforms;
    u.u_depth.value = depth;
    u.u_normal.value = normal;
    u.u_proj.value.copy(cam.projectionMatrix);
    u.u_projInv.value.copy(cam.projectionMatrixInverse);
    u.u_view.value.copy(cam.matrixWorldInverse);
    u.u_frame.value = frame;
    this.ao.render(r, this.raw);
    const b = (this.blur.material as THREE.RawShaderMaterial).uniforms;
    b.t.value = this.raw.texture;
    b.u_dir.value.set(1 / this.raw.width, 0);
    this.blur.render(r, this.blurA);
    b.t.value = this.blurA.texture;
    b.u_dir.value.set(0, 1 / this.raw.height);
    this.blur.render(r, this.blurB);
    return this.blurB.texture;
  }
}

// ---------------------------------------------------------------------------------------------
/** Shadowed volumetric in-scattering (god rays) at half resolution, composited into the HDR target. */
export class VolumetricPass {
  target: THREE.WebGLRenderTarget;
  private march: FullscreenPass;
  private composite: FullscreenPass;
  enabled = true;
  constructor(w: number, h: number, atmoGlsl: string, shadowUniforms: Record<string, THREE.IUniform>, atmoUniforms: Record<string, THREE.IUniform>) {
    this.target = makeRT(Math.max(1, w >> 1), Math.max(1, h >> 1), { type: THREE.HalfFloatType });
    this.march = shaderPass(
      /* glsl */ `precision highp float;
      ${GLSL_COMMON}
      ${atmoGlsl}
      ${GLSL_SHADOWS}
      uniform sampler2D u_linDepth; uniform mat4 u_projInv; uniform mat3 u_viewInvRot; uniform vec3 u_cameraPos;
      uniform vec3 u_lightDir; uniform vec3 u_lightColor; uniform float u_frame; uniform float u_density; uniform float u_maxDist;
      uniform float u_underwater; uniform vec3 u_ambientFog;
      in vec2 v_uv; out vec4 o;
      float shadowAt(vec3 rel) {
        for (int i = 0; i < 4; i++) {
          vec4 sc = u_shadowMat[i] * vec4(rel, 1.0);
          vec3 c = sc.xyz;
          if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) continue;
          vec4 r = u_shadowRects[i];
          return step(c.z - 0.001, texture(u_shadowMap, r.xy + c.xy * r.zw).r);
        }
        return 1.0;
      }
      void main(){
        float ld = texture(u_linDepth, v_uv).r;
        vec4 vp = u_projInv * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 dir = normalize(u_viewInvRot * (vp.xyz / vp.w));
        float dist = min(ld, u_maxDist);
        const int STEPS = 20;
        float jitter = ignT(gl_FragCoord.xy, u_frame);
        float stepLen = dist / float(STEPS);
        float VoL = dot(dir, u_lightDir);
        float g = u_underwater > 0.5 ? 0.6 : 0.76;
        float hg = (1.0 - g*g) / (4.0 * PI * pow(1.0 + g*g - 2.0*g*VoL, 1.5));
        float phase = mix(1.0 / (4.0 * PI), hg, 0.85);
        vec3 scatter = vec3(0.0);
        float trans = 1.0;
        for (int i = 0; i < STEPS; i++) {
          float t = (float(i) + jitter) * stepLen;
          vec3 rel = dir * t;
          float h = rel.y + u_cameraPos.y;
          float dens = u_density * exp(-max(h - 62.0, 0.0) * 0.012);
          if (u_underwater > 0.5) dens = 0.06;
          float sh = shadowAt(rel) * atmo_cloudShadow(rel + u_cameraPos);
          vec3 Ls = u_lightColor * sh * phase + u_ambientFog;
          float st = exp(-dens * stepLen);
          scatter += trans * (1.0 - st) * Ls;
          trans *= st;
        }
        o = vec4(scatter, trans);
      }`,
      {
        ...shadowUniforms,
        ...atmoUniforms,
        u_linDepth: { value: null }, u_projInv: { value: new THREE.Matrix4() }, u_viewInvRot: { value: new THREE.Matrix3() }, u_cameraPos: { value: new THREE.Vector3() },
        u_lightDir: { value: new THREE.Vector3() }, u_lightColor: { value: new THREE.Color() }, u_frame: { value: 0 }, u_density: { value: 0.004 }, u_maxDist: { value: 96 },
        u_underwater: { value: 0 }, u_ambientFog: { value: new THREE.Color() },
      },
    );
    this.composite = shaderPass(
      /* glsl */ `precision highp float; uniform sampler2D u_vol; uniform sampler2D u_linDepth; uniform vec2 u_volTexel; in vec2 v_uv; out vec4 o;
      void main(){
        // depth-aware upsample
        float d0 = texture(u_linDepth, v_uv).r;
        vec4 acc = vec4(0.0); float wsum = 0.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 uv = v_uv + vec2(x, y) * u_volTexel;
          vec4 s = texture(u_vol, uv);
          float d = texture(u_linDepth, uv).r;
          float w = 1.0 / (0.05 + abs(d - d0) / max(d0, 1.0) * 30.0);
          acc += s * w; wsum += w;
        }
        o = acc / wsum;
      }`,
      { u_vol: { value: null }, u_linDepth: { value: null }, u_volTexel: { value: new THREE.Vector2() } },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, transparent: true },
    );
  }
  get uniforms() {
    return (this.march.material as THREE.RawShaderMaterial).uniforms;
  }
  setSize(w: number, h: number) {
    this.target.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  }
  render(r: THREE.WebGLRenderer, linDepth: THREE.Texture, dst: THREE.WebGLRenderTarget) {
    const u = this.uniforms;
    u.u_linDepth.value = linDepth;
    this.march.render(r, this.target);
    const c = (this.composite.material as THREE.RawShaderMaterial).uniforms;
    c.u_vol.value = this.target.texture;
    c.u_linDepth.value = linDepth;
    c.u_volTexel.value.set(1 / this.target.width, 1 / this.target.height);
    // premultiplied composite: dst = scatter + dst * transmittance
    const prevAuto = r.autoClear;
    r.autoClear = false;
    this.composite.render(r, dst);
    r.autoClear = prevAuto;
  }
}

// ---------------------------------------------------------------------------------------------
export class TAAPass {
  history: THREE.WebGLRenderTarget[];
  private idx = 0;
  private pass: FullscreenPass;
  private first = true;
  enabled = true;
  constructor(w: number, h: number) {
    this.history = [makeRT(w, h, { type: THREE.HalfFloatType }), makeRT(w, h, { type: THREE.HalfFloatType })];
    this.pass = shaderPass(
      /* glsl */ `precision highp float;
      uniform sampler2D u_cur; uniform sampler2D u_hist; uniform sampler2D u_depth;
      uniform mat4 u_projInv; uniform mat4 u_viewInv; uniform mat4 u_prevViewProj; uniform vec2 u_texel; uniform float u_reset; uniform vec2 u_jitter;
      in vec2 v_uv; out vec4 o;
      vec3 toYCoCg(vec3 c) { return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b); }
      vec3 fromYCoCg(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
      vec3 tm(vec3 c) { return c / (1.0 + max(max(c.r, c.g), c.b)); }
      vec3 itm(vec3 c) { return c / max(1e-4, 1.0 - max(max(c.r, c.g), c.b)); }
      vec4 sampleCatmull(sampler2D t, vec2 uv, vec2 texSize) {
        vec2 sp = uv * texSize; vec2 tc = floor(sp - 0.5) + 0.5; vec2 f = sp - tc;
        vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
        vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)); vec2 w3 = f * f * (-0.5 + 0.5 * f);
        vec2 w12 = w1 + w2; vec2 off12 = w2 / w12;
        vec2 tc0 = (tc - 1.0) / texSize; vec2 tc3 = (tc + 2.0) / texSize; vec2 tc12 = (tc + off12) / texSize;
        vec4 r = vec4(0.0);
        r += texture(t, vec2(tc12.x, tc0.y)) * w12.x * w0.y;
        r += texture(t, vec2(tc0.x, tc12.y)) * w0.x * w12.y;
        r += texture(t, vec2(tc12.x, tc12.y)) * w12.x * w12.y;
        r += texture(t, vec2(tc3.x, tc12.y)) * w3.x * w12.y;
        r += texture(t, vec2(tc12.x, tc3.y)) * w12.x * w3.y;
        float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
        return r / ws;
      }
      vec3 sanitize(vec3 c) { return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 65000.0); }
      void main(){
        vec3 cur = sanitize(texture(u_cur, v_uv).rgb);
        float d = texture(u_depth, v_uv).r;
        vec4 vp = u_projInv * vec4(v_uv*2.0-1.0, d*2.0-1.0, 1.0); vp /= vp.w;
        vec4 wp = u_viewInv * vp;
        vec4 pc = u_prevViewProj * vec4(wp.xyz, 1.0);
        vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
        if (u_reset > 0.5 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { o = vec4(cur, 1.0); return; }
        vec3 m1 = vec3(0.0), m2 = vec3(0.0); vec3 mn = vec3(1e9), mx = vec3(-1e9);
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec3 s = toYCoCg(tm(sanitize(texture(u_cur, v_uv + vec2(x, y) * u_texel).rgb)));
          m1 += s; m2 += s * s; mn = min(mn, s); mx = max(mx, s);
        }
        m1 /= 9.0; m2 /= 9.0;
        vec3 sigma = sqrt(max(m2 - m1 * m1, 0.0));
        vec3 lo = max(mn, m1 - 1.25 * sigma), hi = min(mx, m1 + 1.25 * sigma);
        vec3 hist = toYCoCg(tm(sanitize(max(sampleCatmull(u_hist, puv, 1.0 / u_texel).rgb, 0.0))));
        vec3 clipped = clamp(hist, lo, hi);
        vec3 c = toYCoCg(tm(cur));
        float motion = length((puv - v_uv) / u_texel);
        float alpha = mix(0.08, 0.25, clamp(motion / 12.0, 0.0, 1.0));
        vec3 res = mix(clipped, c, alpha);
        o = vec4(max(itm(fromYCoCg(res)), 0.0), 1.0);
      }`,
      {
        u_cur: { value: null }, u_hist: { value: null }, u_depth: { value: null }, u_projInv: { value: new THREE.Matrix4() }, u_viewInv: { value: new THREE.Matrix4() },
        u_prevViewProj: { value: new THREE.Matrix4() }, u_texel: { value: new THREE.Vector2() }, u_reset: { value: 1 }, u_jitter: { value: new THREE.Vector2() },
      },
    );
  }
  setSize(w: number, h: number) {
    for (const h2 of this.history) h2.setSize(w, h);
    this.first = true;
  }
  reset() {
    this.first = true;
  }
  /** Returns the resolved texture. */
  render(r: THREE.WebGLRenderer, cur: THREE.Texture, depth: THREE.Texture, projInv: THREE.Matrix4, viewInv: THREE.Matrix4, prevViewProj: THREE.Matrix4): THREE.WebGLRenderTarget {
    const dst = this.history[this.idx];
    const src = this.history[1 - this.idx];
    const u = (this.pass.material as THREE.RawShaderMaterial).uniforms;
    u.u_cur.value = cur;
    u.u_hist.value = src.texture;
    u.u_depth.value = depth;
    u.u_projInv.value.copy(projInv);
    u.u_viewInv.value.copy(viewInv);
    u.u_prevViewProj.value.copy(prevViewProj);
    u.u_texel.value.set(1 / dst.width, 1 / dst.height);
    u.u_reset.value = this.first || !this.enabled ? 1 : 0;
    this.pass.render(r, dst);
    this.first = false;
    this.idx = 1 - this.idx;
    return dst;
  }
}

// ---------------------------------------------------------------------------------------------
export class BloomPass {
  mips: THREE.WebGLRenderTarget[] = [];
  private down: FullscreenPass;
  private up: FullscreenPass;
  levels = 6;
  constructor(w: number, h: number) {
    this.down = shaderPass(
      /* glsl */ `precision highp float; uniform sampler2D t; uniform vec2 u_texel; uniform float u_first; in vec2 v_uv; out vec4 o;
      vec3 s(vec2 uv) { return texture(t, uv).rgb; }
      float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
      void main(){
        vec2 x = u_texel;
        vec3 a = s(v_uv + vec2(-2,2)*x), b = s(v_uv + vec2(0,2)*x), c = s(v_uv + vec2(2,2)*x);
        vec3 d = s(v_uv + vec2(-2,0)*x), e = s(v_uv), f = s(v_uv + vec2(2,0)*x);
        vec3 g = s(v_uv + vec2(-2,-2)*x), h = s(v_uv + vec2(0,-2)*x), i = s(v_uv + vec2(2,-2)*x);
        vec3 j = s(v_uv + vec2(-1,1)*x), k = s(v_uv + vec2(1,1)*x), l = s(v_uv + vec2(-1,-1)*x), m = s(v_uv + vec2(1,-1)*x);
        vec3 res;
        if (u_first > 0.5) {
          vec3 g0 = (a+b+d+e)*0.25, g1 = (b+c+e+f)*0.25, g2 = (d+e+g+h)*0.25, g3 = (e+f+h+i)*0.25, g4 = (j+k+l+m)*0.25;
          float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
          res = (g0*w0*0.125 + g1*w1*0.125 + g2*w2*0.125 + g3*w3*0.125 + g4*w4*0.5) / (w0*0.125+w1*0.125+w2*0.125+w3*0.125+w4*0.5);
        } else {
          res = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
        }
        o = vec4(max(res, 0.0), 1.0);
      }`,
      { t: { value: null }, u_texel: { value: new THREE.Vector2() }, u_first: { value: 0 } },
    );
    this.up = shaderPass(
      /* glsl */ `precision highp float; uniform sampler2D t; uniform vec2 u_texel; uniform float u_radius; in vec2 v_uv; out vec4 o;
      void main(){
        vec2 x = u_texel * u_radius;
        vec3 r = texture(t, v_uv).rgb * 4.0;
        r += (texture(t, v_uv + vec2(-x.x, 0)).rgb + texture(t, v_uv + vec2(x.x, 0)).rgb + texture(t, v_uv + vec2(0, -x.y)).rgb + texture(t, v_uv + vec2(0, x.y)).rgb) * 2.0;
        r += texture(t, v_uv + vec2(-x.x, -x.y)).rgb + texture(t, v_uv + vec2(x.x, -x.y)).rgb + texture(t, v_uv + vec2(-x.x, x.y)).rgb + texture(t, v_uv + vec2(x.x, x.y)).rgb;
        o = vec4(r / 16.0, 1.0);
      }`,
      { t: { value: null }, u_texel: { value: new THREE.Vector2() }, u_radius: { value: 1 } },
      { blending: THREE.AdditiveBlending, transparent: true },
    );
    this.setSize(w, h);
  }
  setSize(w: number, h: number) {
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let cw = w, ch = h;
    for (let i = 0; i < this.levels; i++) {
      cw = Math.max(1, cw >> 1);
      ch = Math.max(1, ch >> 1);
      this.mips.push(makeRT(cw, ch, { type: THREE.HalfFloatType }));
    }
  }
  render(r: THREE.WebGLRenderer, src: THREE.Texture, srcW: number, srcH: number): THREE.Texture {
    const d = (this.down.material as THREE.RawShaderMaterial).uniforms;
    let tex = src, tw = srcW, th = srcH;
    for (let i = 0; i < this.mips.length; i++) {
      d.t.value = tex;
      d.u_texel.value.set(1 / tw, 1 / th);
      d.u_first.value = i === 0 ? 1 : 0;
      this.down.render(r, this.mips[i]);
      tex = this.mips[i].texture;
      tw = this.mips[i].width;
      th = this.mips[i].height;
    }
    const u = (this.up.material as THREE.RawShaderMaterial).uniforms;
    const prev = r.autoClear;
    r.autoClear = false;
    for (let i = this.mips.length - 1; i > 0; i--) {
      u.t.value = this.mips[i].texture;
      u.u_texel.value.set(1 / this.mips[i].width, 1 / this.mips[i].height);
      this.up.render(r, this.mips[i - 1]);
    }
    r.autoClear = prev;
    return this.mips[0].texture;
  }
}

// ---------------------------------------------------------------------------------------------
/** GPU-only eye adaptation: log-luminance mip chain + temporal 1x1 adaptation. */
export class ExposurePass {
  lum: THREE.WebGLRenderTarget;
  adapt: THREE.WebGLRenderTarget[];
  private idx = 0;
  private lumPass: FullscreenPass;
  private adaptPass: FullscreenPass;
  constructor() {
    this.lum = makeRT(256, 256, { type: THREE.HalfFloatType, format: THREE.RedFormat, mipmaps: true });
    this.adapt = [makeRT(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, filter: THREE.NearestFilter }), makeRT(1, 1, { type: THREE.FloatType, format: THREE.RedFormat, filter: THREE.NearestFilter })];
    this.lumPass = shaderPass(
      `precision highp float; uniform sampler2D t; in vec2 v_uv; out vec4 o;
      void main(){ vec3 c = texture(t, v_uv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec2 cc = v_uv - 0.5; float w = exp(-dot(cc, cc) * 3.0);
        o = vec4(log2(max(l, 1e-5)) * w, 0.0, 0.0, 1.0); }`,
      { t: { value: null } },
    );
    this.adaptPass = shaderPass(
      `precision highp float; uniform sampler2D u_lum; uniform sampler2D u_prev; uniform float u_dt; uniform float u_min; uniform float u_max; uniform float u_key; uniform float u_reset; uniform float u_weightSum;
      in vec2 v_uv; out vec4 o;
      void main(){ float avg = textureLod(u_lum, vec2(0.5), 8.0).r / u_weightSum; float l = exp2(avg);
        float target = clamp(u_key / max(l, 1e-4), u_min, u_max);
        float prev = texture(u_prev, vec2(0.5)).r; if (u_reset > 0.5 || prev <= 0.0) prev = target;
        float speed = target > prev ? 1.6 : 2.6;
        float e = exp(mix(log(prev), log(target), 1.0 - exp(-u_dt * speed)));
        o = vec4(e, 0.0, 0.0, 1.0); }`,
      { u_lum: { value: null }, u_prev: { value: null }, u_dt: { value: 0.016 }, u_min: { value: 0.02 }, u_max: { value: 6 }, u_key: { value: 0.16 }, u_reset: { value: 1 }, u_weightSum: { value: 1 } },
    );
    // average of the gaussian weight over the image (for normalisation)
    let ws = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const cx = (x + 0.5) / 64 - 0.5, cy = (y + 0.5) / 64 - 0.5; ws += Math.exp(-(cx * cx + cy * cy) * 3); }
    (this.adaptPass.material as THREE.RawShaderMaterial).uniforms.u_weightSum.value = ws / 4096;
  }
  get uniforms() {
    return (this.adaptPass.material as THREE.RawShaderMaterial).uniforms;
  }
  reset() {
    this.uniforms.u_reset.value = 1;
  }
  render(r: THREE.WebGLRenderer, src: THREE.Texture, dt: number): THREE.Texture {
    (this.lumPass.material as THREE.RawShaderMaterial).uniforms.t.value = src;
    this.lumPass.render(r, this.lum);
    // mipmaps are generated by three when the render target is unbound (generateMipmaps = true)
    r.setRenderTarget(null);
    const u = this.uniforms;
    u.u_lum.value = this.lum.texture;
    u.u_prev.value = this.adapt[1 - this.idx].texture;
    u.u_dt.value = dt;
    this.adaptPass.render(r, this.adapt[this.idx]);
    u.u_reset.value = 0;
    const out = this.adapt[this.idx].texture;
    this.idx = 1 - this.idx;
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
export class TonemapPass {
  pass: FullscreenPass;
  constructor() {
    this.pass = shaderPass(
      /* glsl */ `precision highp float;
      ${GLSL_COMMON}
      uniform sampler2D u_hdr; uniform sampler2D u_bloom; uniform sampler2D u_exposure; uniform float u_bloomStrength;
      uniform float u_exposureBias; uniform float u_saturation; uniform float u_contrast; uniform float u_vignette; uniform float u_grain;
      uniform float u_time; uniform vec3 u_whiteBalance; uniform vec4 u_overlay; uniform float u_damage; uniform float u_underwater; uniform float u_gamma;
      uniform float u_dbg;
      uniform vec3 u_sunScreen;   // xy = sun uv, z = 1 if in front of the camera
      uniform vec3 u_sunColor;    // flare tint (linear HDR, pre-exposure)
      uniform sampler2D u_flareVis;
      uniform float u_aspect;
      in vec2 v_uv; out vec4 o;
      vec3 flare(vec2 uv) {
        if (u_sunScreen.z < 0.5 || dot(u_sunColor, u_sunColor) < 1e-8) return vec3(0.0);
        float vis = texture(u_flareVis, vec2(0.5)).r;
        if (vis <= 0.0) return vec3(0.0);
        vec2 s = u_sunScreen.xy;
        vec2 d = (uv - s) * vec2(u_aspect, 1.0);
        float r = length(d);
        vec3 c = vec3(0.0);
        // soft glare halo + anamorphic streak
        c += u_sunColor * (0.06 / (1.0 + r * r * 60.0) + 0.02 * exp(-abs(d.y) * 220.0) * exp(-abs(d.x) * 2.2));
        // ghosts along the axis through the screen centre
        vec2 axis = (vec2(0.5) - s);
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          float k = -0.4 + fi * 0.55;
          vec2 gp = s + axis * (1.0 + k);
          float gr = length((uv - gp) * vec2(u_aspect, 1.0));
          float size = 0.02 + 0.025 * fract(fi * 0.618);
          vec3 tint = mix(vec3(1.0, 0.55, 0.25), vec3(0.3, 0.6, 1.0), fract(fi * 0.37));
          c += u_sunColor * tint * 0.004 * smoothstep(size, size * 0.6, gr);
        }
        return c * vis;
      }
      vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 ACESFitted(vec3 color) {
        const mat3 ACESInputMat = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
        const mat3 ACESOutputMat = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
        color = ACESInputMat * color; color = RRTAndODTFit(color); color = ACESOutputMat * color; return clamp(color, 0.0, 1.0);
      }
      void main(){
        vec3 c = texture(u_hdr, v_uv).rgb;
        vec3 b = texture(u_bloom, v_uv).rgb;
        c = mix(c, b, u_bloomStrength);
        c += flare(v_uv);
        float e = texture(u_exposure, vec2(0.5)).r * u_exposureBias;
        if (u_dbg == 1.0) { o = vec4(c, e); return; }
        c *= e * u_whiteBalance;
        if (u_dbg == 2.0) { o = vec4(c, 1.0); return; }
        // saturation / contrast in linear
        float l = luminance(c);
        c = max(mix(vec3(l), c, u_saturation), 0.0);
        if (u_dbg == 3.0) { o = vec4(c, 1.0); return; }
        c = ACESFitted(c * 1.25);
        if (u_dbg == 4.0) { o = vec4(c, 1.0); return; }
        c = linearToSrgb(c);
        c = pow(c, vec3(u_gamma));
        c = clamp((c - 0.5) * u_contrast + 0.5, 0.0, 1.0);
        if (u_dbg == 5.0) { o = vec4(c, 1.0); return; }
        // vignette
        vec2 q = v_uv - 0.5;
        c *= 1.0 - u_vignette * dot(q, q) * 1.6;
        // damage / effect overlays
        c = mix(c, u_overlay.rgb, u_overlay.a);
        c = mix(c, vec3(0.6, 0.0, 0.0), u_damage * smoothstep(0.15, 0.7, length(q)) * 0.5);
        // grain + dither
        float n = hash12(gl_FragCoord.xy + fract(u_time * 7.13) * 97.0);
        c += (n - 0.5) * u_grain + (hash12(gl_FragCoord.yx * 1.7) - 0.5) / 255.0;
        o = vec4(c, 1.0);
      }`,
      {
        u_hdr: { value: null }, u_bloom: { value: null }, u_exposure: { value: null }, u_bloomStrength: { value: 0.045 }, u_exposureBias: { value: 1 },
        u_saturation: { value: 1.12 }, u_contrast: { value: 1.04 }, u_vignette: { value: 0.32 }, u_grain: { value: 0.012 }, u_time: { value: 0 },
        u_whiteBalance: { value: new THREE.Vector3(1, 1, 1) }, u_overlay: { value: new THREE.Vector4(0, 0, 0, 0) }, u_damage: { value: 0 }, u_underwater: { value: 0 }, u_gamma: { value: 1 }, u_dbg: { value: 0 },
        u_sunScreen: { value: new THREE.Vector3() }, u_sunColor: { value: new THREE.Color(0, 0, 0) }, u_aspect: { value: 1 }, u_flareVis: { value: null },
      },
    );
  }
  get uniforms() {
    return (this.pass.material as THREE.RawShaderMaterial).uniforms;
  }
  render(r: THREE.WebGLRenderer, hdr: THREE.Texture, bloom: THREE.Texture, exposure: THREE.Texture, dst: THREE.WebGLRenderTarget | null) {
    const u = this.uniforms;
    u.u_hdr.value = hdr;
    u.u_bloom.value = bloom;
    u.u_exposure.value = exposure;
    this.pass.render(r, dst);
  }
}
