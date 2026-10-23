import * as THREE from 'three';
import { U } from '../../engine/uniforms.js';
import { FullscreenPass, makeFullscreenMaterial } from '../../engine/fullscreen.js';
import { NOISE_GLSL, HEIGHTFIELD_GLSL } from '../heightfield.js';
import { CLIPMAP_GLSL } from '../../shaders/common.js';

// A clipmap of the procedural heightfield, generated on the GPU.
//
// Level k is an N x N grid with texel size s0 * 2^k, centred near the camera and snapped
// to a coarse grid so a level only regenerates after the camera has moved a fair way.
// All levels live in one atlas (4 tiles per row) for three textures:
//   height (RG32F)   x = height, y = slip-face factor; fetched manually (exact)
//   normal (RGBA16F) x,y = dh/dx, dh/dz; z = slip-face factor; w = curvature; filtered
//   shadow (R8)      soft sun/moon visibility, ray-marched through the clipmap
// Long dune shadows are the signature of low-sun desert light, so they are computed by
// marching toward the light across every coarser level (up to ~6 km).

const HEIGHT_FRAG = /* glsl */ `
${NOISE_GLSL}
${HEIGHTFIELD_GLSL}
uniform vec4 uLevel;
uniform vec2 uTileOffset;
void main() {
  vec2 tc = gl_FragCoord.xy - uTileOffset;
  vec2 p = uLevel.xy + tc * uLevel.z;
  gl_FragColor = vec4(terrainHeightLee(p, uLevel.z), 0.0, 1.0);
}
`;

const NORMAL_FRAG = /* glsl */ `
uniform highp sampler2D tHeight;
uniform vec4 uLevel;
uniform vec2 uTileOffset;
uniform float uN;
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  ivec2 lo = ivec2(uTileOffset);
  ivec2 hi = lo + ivec2(int(uN) - 1);
  vec2 hc = texelFetch(tHeight, c, 0).rg;
  float hl = texelFetch(tHeight, clamp(c - ivec2(1, 0), lo, hi), 0).r;
  float hr = texelFetch(tHeight, clamp(c + ivec2(1, 0), lo, hi), 0).r;
  float hd = texelFetch(tHeight, clamp(c - ivec2(0, 1), lo, hi), 0).r;
  float hu = texelFetch(tHeight, clamp(c + ivec2(0, 1), lo, hi), 0).r;
  float s = uLevel.z;
  vec2 grad = vec2(hr - hl, hu - hd) / (2.0 * s);
  float curv = (hl + hr + hd + hu - 4.0 * hc.x) / (s * s);
  gl_FragColor = vec4(grad, hc.y, curv);
}
`;

const SHADOW_FRAG = /* glsl */ `
${CLIPMAP_GLSL}
uniform vec4 uLevel;
uniform vec2 uTileOffset;
uniform int uLevelIndex;
uniform vec3 uLightDirShadow;
void main() {
  vec2 tc = gl_FragCoord.xy - uTileOffset;
  vec2 p = uLevel.xy + tc * uLevel.z;
  float h0 = texelFetch(tHeight, ivec2(gl_FragCoord.xy), 0).r + 0.02;
  vec3 L = uLightDirShadow;
  float horiz = length(L.xz);
  float vis = 1.0;
  if (horiz > 1e-4) {
    vec2 dir = L.xz / horiz;
    float tanL = L.y / horiz;
    float maxTan = -1e6;
    float t = uLevel.z * 1.5;
    for (int i = 0; i < SHADOW_STEPS; i++) {
      vec2 q = p + dir * t;
      float h = clipHeightFrom(q, uLevelIndex);
      maxTan = max(maxTan, (h - h0) / t);
      t *= SHADOW_GROWTH;
      if (t > 6000.0) break;
    }
    // Penumbra: the solar disc is ~0.5 deg; a little extra softness reads better.
    vis = smoothstep(-0.011, 0.011, tanL - maxTan);
  }
  gl_FragColor = vec4(vis, 0.0, 0.0, 1.0);
}
`;

export class HeightAtlas {
  constructor(renderer, { levels = 9, size = 512, baseTexel = 0.25, shadowSteps = 44 } = {}) {
    this.renderer = renderer;
    this.levels = levels;
    this.N = size;
    this.s0 = baseTexel;
    this.cols = 4;
    this.rows = Math.ceil(levels / this.cols);
    const W = this.cols * size;
    const H = this.rows * size;
    this.width = W;
    this.height = H;

    const gl = renderer.getContext();
    const floatRT = !!gl.getExtension('EXT_color_buffer_float');
    const base = { depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    this.heightRT = new THREE.WebGLRenderTarget(W, H, {
      ...base,
      type: floatRT ? THREE.FloatType : THREE.HalfFloatType,
      format: THREE.RGFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.normalRT = new THREE.WebGLRenderTarget(W, H, {
      ...base,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.shadowRT = new THREE.WebGLRenderTarget(W, H, {
      ...base,
      type: THREE.UnsignedByteType,
      format: THREE.RedFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    for (const rt of [this.heightRT, this.normalRT, this.shadowRT]) rt.texture.colorSpace = THREE.NoColorSpace;

    U.tHeight.value = this.heightRT.texture;
    U.tNormal.value = this.normalRT.texture;
    U.tShadow.value = this.shadowRT.texture;
    U.uAtlasInv.value.set(1 / W, 1 / H);
    U.uClip.value = [];
    this.levelState = [];
    for (let k = 0; k < levels; k++) {
      const s = baseTexel * 2 ** k;
      U.uClip.value.push(new THREE.Vector4(0, 0, s, 1 / s));
      this.levelState.push({ cx: NaN, cz: NaN, texel: s, valid: false, shadowLight: new THREE.Vector3(0, -2, 0) });
    }

    this.defines = { CLIP_LEVELS: levels, CLIP_N: size };
    const levelUniforms = () => ({ uLevel: { value: new THREE.Vector4() }, uTileOffset: { value: new THREE.Vector2() } });
    this.heightMat = makeFullscreenMaterial(HEIGHT_FRAG, levelUniforms());
    this.normalMat = makeFullscreenMaterial(NORMAL_FRAG, { ...levelUniforms(), tHeight: U.tHeight, uN: { value: size } });
    this.shadowMat = makeFullscreenMaterial(
      SHADOW_FRAG,
      {
        ...levelUniforms(),
        tHeight: U.tHeight,
        uClip: U.uClip,
        uAtlasInv: U.uAtlasInv,
        uLevelIndex: { value: 0 },
        uLightDirShadow: { value: new THREE.Vector3(0, 1, 0) },
      },
      { ...this.defines, SHADOW_STEPS: shadowSteps, SHADOW_GROWTH: '1.215' },
    );
    this.pass = new FullscreenPass(this.heightMat);
    this.shadowCursor = 0;
    this.generated = 0;
  }

  texel(k) {
    return this.s0 * 2 ** k;
  }

  tileOffset(k) {
    return [(k % this.cols) * this.N, Math.floor(k / this.cols) * this.N];
  }

  _renderLevel(material, k) {
    const st = this.levelState[k];
    const [ox, oy] = this.tileOffset(k);
    material.uniforms.uLevel.value.copy(U.uClip.value[k]);
    material.uniforms.uTileOffset.value.set(ox, oy);
    this.pass.material = material;
    const target = material === this.heightMat ? this.heightRT : material === this.normalMat ? this.normalRT : this.shadowRT;
    this.pass.renderRect(this.renderer, target, ox, oy, this.N, this.N);
    return st;
  }

  /**
   * Recentre levels around the camera and refresh what changed.
   * lightDir: key light direction for shadows. Returns the number of levels regenerated.
   */
  update(camPos, lightDir, { maxShadowLevels = 2 } = {}) {
    const N = this.N;
    const changed = [];
    for (let k = 0; k < this.levels; k++) {
      const st = this.levelState[k];
      const s = st.texel;
      const snap = s * (N / 16);
      const limit = snap * 1.0;
      if (!st.valid || Math.abs(camPos.x - st.cx) > limit || Math.abs(camPos.z - st.cz) > limit) {
        st.cx = Math.round(camPos.x / snap) * snap;
        st.cz = Math.round(camPos.z / snap) * snap;
        U.uClip.value[k].set(st.cx - (N / 2) * s, st.cz - (N / 2) * s, s, 1 / s);
        st.valid = true;
        changed.push(k);
      }
    }
    for (const k of changed) this._renderLevel(this.heightMat, k);
    for (const k of changed) this._renderLevel(this.normalMat, k);

    // Shadows: every regenerated level, then round-robin levels whose light moved.
    let budget = maxShadowLevels;
    const light = lightDir;
    for (const k of changed) {
      this._shadowLevel(k, light);
      budget--;
    }
    // Refresh the stalest levels first, favouring the fine ones around the player:
    // their shadow edges are the ones you can see move.
    while (budget > 0) {
      let best = -1;
      let bestScore = 0;
      for (let k = 0; k < this.levels; k++) {
        const err = this.levelState[k].shadowLight.angleTo(light);
        const threshold = 0.0006 * (1 + k * 0.7);
        if (err <= threshold) continue;
        const score = err / threshold;
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
      if (best < 0) break;
      this._shadowLevel(best, light);
      budget--;
    }
    this.generated += changed.length;
    return changed.length;
  }

  _shadowLevel(k, light) {
    const st = this.levelState[k];
    this.shadowMat.uniforms.uLevelIndex.value = k;
    this.shadowMat.uniforms.uLightDirShadow.value.copy(light);
    this._renderLevel(this.shadowMat, k);
    st.shadowLight.copy(light);
  }

  /** Force all shadow levels to refresh (e.g. after a big time-of-day jump). */
  refreshShadows(light) {
    for (let k = 0; k < this.levels; k++) this._shadowLevel(k, light);
  }

  dispose() {
    this.heightRT.dispose();
    this.normalRT.dispose();
    this.shadowRT.dispose();
  }
}
