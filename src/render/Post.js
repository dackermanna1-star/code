// Render pipeline:
//   pre-hooks (planar reflection) → main HDR pass (MSAA, depth) →
//   half-res raymarched volumetric fog (spot lights sampled with their real
//   shadow maps) → depth-aware upsample + composite → bloom chain →
//   final: exposure, AgX tone map, restrained grade, vignette, grain, CA, dither.
import * as THREE from 'three';
import { shared } from './shaderlib.js';

const FS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

class FullscreenPass {
  constructor(material) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  get material() {
    return this.mesh.material;
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }
}

function rt(w, h, opts = {}) {
  const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    generateMipmaps: false,
    ...opts,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Post {
  constructor(engine, opts = {}) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.preHooks = [];
    this.frame = 0;
    this.q = opts.quality ?? 'high';
    this.fogScale = this.q === 'low' ? 0.25 : 0.5;
    this.fogSteps = this.q === 'low' ? 16 : this.q === 'medium' ? 22 : 28;
    this.exposure = opts.exposure ?? 10.5;
    this.fade = 1;
    this.bloomStrength = 0.055;
    this.fogLightScale = 0.3;
    this.size = new THREE.Vector2(1, 1);
  }

  /** Must be called after lights exist (fog shader is generated for them). */
  init(lamps) {
    const spots = lamps.map((l) => l.light).filter((l) => l.isSpotLight);
    this.fogLights = spots;
    const shadowLights = spots.filter((l) => l.castShadow);
    this.fogShadowLights = shadowLights;
    const N = spots.length;
    const S = shadowLights.length;

    const lightUniforms = {
      uLPos: { value: spots.map(() => new THREE.Vector3()) },
      uLDir: { value: spots.map(() => new THREE.Vector3()) },
      uLCol: { value: spots.map(() => new THREE.Vector3()) },
      uLCone: { value: spots.map(() => new THREE.Vector4()) },
      uShadowMat: { value: shadowLights.map(() => new THREE.Matrix4()) },
    };
    for (let i = 0; i < S; i++) lightUniforms[`uShadow${i}`] = { value: null };

    let lightCode = '';
    spots.forEach((l, i) => {
      const si = shadowLights.indexOf(l);
      lightCode += `
      {
        vec3 Lv = uLPos[${i}] - p;
        float d2 = dot(Lv, Lv);
        if (d2 < uLCone[${i}].z * uLCone[${i}].z) {
          float d = sqrt(d2);
          vec3 l = Lv / d;
          float cone = smoothstep(uLCone[${i}].x, uLCone[${i}].y, dot(-l, uLDir[${i}]));
          if (cone > 0.0) {
            float att = pow(clamp(1.0 - pow(d / uLCone[${i}].z, 4.0), 0.0, 1.0), 2.0) / max(d2, 0.3);
            float sh = 1.0;
            ${si >= 0 ? `
            vec4 sc = uShadowMat[${si}] * vec4(p, 1.0);
            sc.xyz /= sc.w;
            if (sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0) sh = texture(uShadow${si}, vec3(sc.xy, sc.z - 0.002));
            ` : ''}
            acc += uLCol[${i}] * (cone * att * sh * hg(dot(l, dir)));
          }
        }
      }`;
    });

    this.fogMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0.04 },
        uFar: { value: 700 },
        uFrame: { value: 0 },
        uMaxDist: { value: 95 },
        uDensity: { value: 0.008 },
        uHeightFalloff: { value: 0.3 },
        uFogAmbient: { value: new THREE.Vector3(0.0035, 0.005, 0.0088) },
        uBounceScale: { value: 0.05 },
        uWindOffset: { value: new THREE.Vector3() },
        uIrrA: shared.uIrrA,
        uIrrMin: shared.uIrrMin,
        uIrrInvSize: shared.uIrrInvSize,
        uNoise3: shared.uNoise3,
        uTime: shared.uTime,
        uSteam: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
        uWind: shared.uWind,
        ...lightUniforms,
      },
      vertexShader: FS_VERT.replace(/varying/g, 'out'),
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler2DShadow;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D tDepth;
        uniform mat4 uInvProj, uCamWorld;
        uniform vec3 uCamPos;
        uniform float uNear, uFar, uFrame, uMaxDist, uDensity, uHeightFalloff, uBounceScale, uTime;
        uniform vec3 uFogAmbient, uWindOffset;
        uniform highp sampler3D uIrrA;
        uniform highp sampler3D uNoise3;
        uniform vec3 uIrrMin, uIrrInvSize;
        uniform vec4 uSteam[5];
        uniform float uWind;
        ${N > 0 ? `uniform vec3 uLPos[${N}]; uniform vec3 uLDir[${N}]; uniform vec3 uLCol[${N}]; uniform vec4 uLCone[${N}];` : ''}
        ${S > 0 ? `uniform mat4 uShadowMat[${S}];` : ''}
        ${shadowLights.map((_, i) => `uniform sampler2DShadow uShadow${i};`).join('\n')}

        float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        float hg(float c) {
          const float g = 0.45;
          float g2 = g * g;
          return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)) * 12.566 * 0.35 + 0.65;
        }
        float n3(vec3 p) { return textureLod(uNoise3, p * (1.0 / 64.0), 0.0).r; }
        float steam(vec3 p) {
          float s = 0.0;
          for (int i = 0; i < 5; i++) {
            vec4 e = uSteam[i];
            if (e.w <= 0.0) continue;
            vec3 d = p - e.xyz;
            if (d.y < -0.15 || d.y > 3.8) continue;
            float h = max(d.y, 0.0);
            vec2 drift = vec2(0.22, -0.32) * h * (0.35 + uWind);
            float r = 0.1 + h * 0.3;
            float rr = length(d.xz - drift);
            if (rr > r * 2.0) continue;
            float n = n3(p * 2.1 - vec3(uTime * 0.12, uTime * 0.85, 0.0));
            float n2 = n3(p * 4.7 - vec3(0.0, uTime * 1.4, uTime * 0.2));
            float core = exp(-rr * rr / (r * r)) * exp(-h * 0.75);
            s += e.w * core * smoothstep(0.2, 0.8, n * 0.7 + n2 * 0.3 + 0.3 * core);
          }
          return s;
        }
        float density(vec3 p) {
          float h = exp(-max(p.y, 0.0) * uHeightFalloff);
          float n = n3(p * 0.21 + uWindOffset);
          float n2 = n3(p * 0.63 + uWindOffset * 1.9 + 31.0);
          float mist = smoothstep(0.3, 0.85, n * 0.65 + n2 * 0.35);
          float ground = 1.0 + 1.1 * exp(-max(p.y, 0.0) * 2.5);
          return uDensity * (0.25 + 0.75 * h) * (0.35 + 1.3 * mist) * ground + steam(p);
        }
        void main() {
          float d = textureLod(tDepth, vUv, 0.0).r;
          vec4 rv = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          rv.xyz /= rv.w;
          vec3 rView = rv.xyz / -rv.z;
          float viewZ = (uNear * uFar) / ((uFar - uNear) * d - uFar);
          float tMax = d >= 0.999999 ? uMaxDist : min(-viewZ * length(rView), uMaxDist);
          vec3 dir = normalize(mat3(uCamWorld) * rView);
          float jit = ign(gl_FragCoord.xy + vec2(uFrame * 7.0, uFrame * 3.0));
          vec3 scat = vec3(0.0);
          float T = 1.0;
          float tPrev = 0.0;
          const int STEPS = ${this.fogSteps};
          for (int i = 0; i < STEPS; i++) {
            float f = (float(i) + jit) / float(STEPS);
            float t = tMax * f * f;
            float ds = max(t - tPrev, 0.0);
            tPrev = t;
            vec3 p = uCamPos + dir * t;
            float dens = density(p);
            vec4 A = textureLod(uIrrA, (p - uIrrMin) * uIrrInvSize, 0.0);
            vec3 acc = uFogAmbient * (0.2 + 0.8 * A.a) + A.rgb * uBounceScale;
            ${lightCode}
            float ext = dens * ds;
            scat += T * acc * ext;
            T *= exp(-ext);
          }
          // remaining segment to the surface
          float ds = max(tMax - tPrev, 0.0);
          vec3 p = uCamPos + dir * tMax;
          float dens = density(p);
          scat += T * uFogAmbient * dens * ds * 0.5;
          T *= exp(-dens * ds);
          fragColor = vec4(scat, T);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.fogPass = new FullscreenPass(this.fogMat);

    this.compMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tFog: { value: null },
        tDepth: { value: null },
        uFogTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.04 },
        uFar: { value: 700 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene, tFog, tDepth;
        uniform vec2 uFogTexel;
        uniform float uNear, uFar;
        varying vec2 vUv;
        float lin(float d) { return (uNear * uFar) / ((uFar - uNear) * d - uFar); }
        void main() {
          vec4 sc = texture2D(tScene, vUv);
          float z0 = lin(texture2D(tDepth, vUv).r);
          vec4 acc = vec4(0.0);
          float wsum = 0.0;
          for (int y = -1; y <= 1; y++)
            for (int x = -1; x <= 1; x++) {
              vec2 o = vec2(float(x), float(y)) * uFogTexel;
              vec4 f = texture2D(tFog, vUv + o);
              float z = lin(texture2D(tDepth, vUv + o).r);
              float w = (x == 0 && y == 0 ? 2.0 : 1.0) * exp(-abs(z - z0) / (0.05 + 0.04 * abs(z0)) * 2.0);
              acc += f * w;
              wsum += w;
            }
          vec4 fog = acc / max(wsum, 1e-4);
          gl_FragColor = vec4(sc.rgb * fog.a + fog.rgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.compPass = new FullscreenPass(this.compMat);

    // bloom
    this.bloomDown = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPrefilter;
        varying vec2 vUv;
        vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
        float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        void main() {
          vec3 a = s(vec2(-1.0, -1.0)), b = s(vec2(1.0, -1.0)), c = s(vec2(-1.0, 1.0)), d = s(vec2(1.0, 1.0)), e = s(vec2(0.0));
          vec3 col;
          if (uPrefilter > 0.5) {
            // Karis average against fireflies + soft knee so only bright things bloom
            float wa = 1.0 / (1.0 + lum(a)), wb = 1.0 / (1.0 + lum(b)), wc = 1.0 / (1.0 + lum(c)), wd = 1.0 / (1.0 + lum(d)), we = 1.0 / (1.0 + lum(e));
            col = (a * wa + b * wb + c * wc + d * wd + e * we * 2.0) / (wa + wb + wc + wd + we * 2.0);
            float l = lum(col);
            float k = smoothstep(0.02, 0.25, l);
            col *= k;
          } else {
            col = (a + b + c + d) * 0.125 + e * 0.5;
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.bloomUp = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc, tBase; uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec3 c = vec3(0.0);
          c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(0.0, -1.0) * uTexel).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(1.0, -1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(-1.0, 0.0) * uTexel).rgb * 2.0;
          c += texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + vec2(1.0, 0.0) * uTexel).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
          c += texture2D(tSrc, vUv + vec2(0.0, 1.0) * uTexel).rgb * 2.0;
          c += texture2D(tSrc, vUv + vec2(1.0, 1.0) * uTexel).rgb;
          gl_FragColor = vec4(c / 16.0 + texture2D(tBase, vUv).rgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.bloomDownPass = new FullscreenPass(this.bloomDown);
    this.bloomUpPass = new FullscreenPass(this.bloomUp);

    this.finalMat = new THREE.ShaderMaterial({
      uniforms: {
        tHDR: { value: null },
        tBloom: { value: null },
        uExposure: { value: this.exposure },
        uBloom: { value: this.bloomStrength },
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2() },
        uFade: { value: 1 },
        uGrain: { value: 0.045 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tHDR, tBloom;
        uniform float uExposure, uBloom, uTime, uFade, uGrain;
        uniform vec2 uRes;
        varying vec2 vUv;
        const mat3 LIN_REC2020_TO_LIN_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
        const mat3 LIN_SRGB_TO_LIN_REC2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
        vec3 agxContrast(vec3 x) {
          vec3 x2 = x * x; vec3 x4 = x2 * x2;
          return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
        }
        vec3 agx(vec3 color) {
          const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
          const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
          const float minEv = -12.47393; const float maxEv = 4.026069;
          color = LIN_SRGB_TO_LIN_REC2020 * color;
          color = inset * color;
          color = max(color, 1e-10);
          color = log2(color);
          color = (color - minEv) / (maxEv - minEv);
          color = clamp(color, 0.0, 1.0);
          color = agxContrast(color);
          // look: a little punchier than base AgX (deeper shadows, slightly richer colour)
          float lumL = dot(color, vec3(0.2126, 0.7152, 0.0722));
          color = mix(vec3(lumL), color, 1.12);
          color = pow(max(color, 0.0), vec3(1.18));
          color = outset * color;
          color = pow(max(vec3(0.0), color), vec3(2.2));
          color = LIN_REC2020_TO_LIN_SRGB * color;
          return clamp(color, 0.0, 1.0);
        }
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        void main() {
          vec2 uv = vUv;
          vec2 cc = uv - 0.5;
          float r2 = dot(cc, cc);
          // subtle lateral chromatic aberration toward the corners
          vec2 ca = cc * r2 * 0.0065;
          vec3 hdr;
          hdr.r = texture2D(tHDR, uv - ca).r;
          hdr.g = texture2D(tHDR, uv).g;
          hdr.b = texture2D(tHDR, uv + ca).b;
          vec3 bloom = texture2D(tBloom, uv).rgb;
          hdr = hdr + bloom * uBloom;
          hdr *= uExposure;
          vec3 c = agx(hdr);
          // restrained grade: cool lifted shadows, faintly warm highlights, slight desaturation
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 0.9);
          vec3 shadowTint = vec3(0.9, 0.96, 1.08);
          vec3 highTint = vec3(1.04, 1.0, 0.94);
          c *= mix(shadowTint, highTint, smoothstep(0.02, 0.5, l));
          c = c * 0.985 + vec3(0.0035, 0.0048, 0.0068);
          // vignette
          float vig = 1.0 - smoothstep(0.18, 0.95, r2 * 1.6);
          c *= mix(0.62, 1.0, vig);
          c *= uFade;
          vec3 s = toSRGB(clamp(c, 0.0, 1.0));
          // film grain, strongest in the mid-tones
          float g = hash(gl_FragCoord.xy + fract(uTime * 13.17) * 917.0) + hash(gl_FragCoord.xy * 1.37 + fract(uTime * 7.31) * 413.0) - 1.0;
          float gl = dot(s, vec3(0.333));
          s += g * uGrain * (0.35 + 0.65 * (1.0 - abs(gl * 2.0 - 0.7)));
          // dither against banding in dark gradients
          s += (hash(gl_FragCoord.xy + 0.37) - 0.5) / 255.0;
          gl_FragColor = vec4(s, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.finalPass = new FullscreenPass(this.finalMat);

    // temporal AA: static-world reprojection from depth + neighbourhood clamp
    this.taaMat = new THREE.ShaderMaterial({
      uniforms: {
        tCur: { value: null },
        tHist: { value: null },
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() },
        uTexel: { value: new THREE.Vector2() },
        uAlpha: { value: 0.1 },
        uReset: { value: 1 },
      },
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCur, tHist, tDepth;
        uniform mat4 uInvProj, uCamWorld, uPrevVP;
        uniform vec2 uTexel;
        uniform float uAlpha, uReset;
        varying vec2 vUv;
        vec3 toYC(vec3 c) { return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b); }
        vec3 fromYC(vec3 y) { return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
        vec3 tm(vec3 c) { return c / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
        vec3 itm(vec3 c) { return c / max(1e-4, 1.0 - dot(c, vec3(0.2126, 0.7152, 0.0722))); }
        void main() {
          vec3 cur = tm(texture2D(tCur, vUv).rgb);
          float d = texture2D(tDepth, vUv).r;
          vec4 ndc = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 vp = uInvProj * ndc;
          vp /= vp.w;
          vec4 wp = uCamWorld * vec4(vp.xyz, 1.0);
          vec4 pc = uPrevVP * wp;
          vec2 huv = pc.xy / pc.w * 0.5 + 0.5;
          // neighbourhood min/max in YCoCg (tonemapped)
          vec3 mn = vec3(1e9), mx = vec3(-1e9), m1 = vec3(0.0), m2 = vec3(0.0);
          for (int y = -1; y <= 1; y++)
            for (int x = -1; x <= 1; x++) {
              vec3 c = toYC(tm(texture2D(tCur, vUv + vec2(float(x), float(y)) * uTexel).rgb));
              mn = min(mn, c); mx = max(mx, c); m1 += c; m2 += c * c;
            }
          m1 /= 9.0;
          vec3 sd = sqrt(max(m2 / 9.0 - m1 * m1, 0.0));
          mn = max(mn, m1 - sd * 1.25);
          mx = min(mx, m1 + sd * 1.25);
          vec3 hist = toYC(tm(texture2D(tHist, huv).rgb));
          hist = clamp(hist, mn, mx);
          bool off = huv.x < 0.0 || huv.y < 0.0 || huv.x > 1.0 || huv.y > 1.0 || uReset > 0.5;
          vec3 res = off ? toYC(cur) : mix(hist, toYC(cur), uAlpha);
          gl_FragColor = vec4(itm(fromYC(res)), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.taaPass = new FullscreenPass(this.taaMat);
    this.prevVP = new THREE.Matrix4();
    this.taaReset = true;
    this.jitterIndex = 0;
    this.taa = true;
  }

  /** Halton(2,3) subpixel jitter applied to the camera projection. */
  applyJitter(camera) {
    if (!this.taa) return;
    const halton = (i, b) => {
      let f = 1, r = 0;
      while (i > 0) {
        f /= b;
        r += f * (i % b);
        i = Math.floor(i / b);
      }
      return r;
    };
    this.jitterIndex = (this.jitterIndex % 8) + 1;
    const jx = (halton(this.jitterIndex, 2) - 0.5) * 2 / this.size.x;
    const jy = (halton(this.jitterIndex, 3) - 0.5) * 2 / this.size.y;
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[8] += jx;
    camera.projectionMatrix.elements[9] += jy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  setSize(w, h, dpr) {
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    this.size.set(W, H);
    const samples = this.q === 'ultra' ? 4 : 0;
    this.dispose();
    this.depthTex = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
    this.mainRT = rt(W, H, { depthBuffer: true, samples, depthTexture: this.depthTex });
    const fw = Math.round(W * this.fogScale), fh = Math.round(H * this.fogScale);
    this.fogRT = rt(fw, fh);
    this.compRT = rt(W, H);
    this.histA = rt(W, H);
    this.histB = rt(W, H);
    this.taaReset = true;
    this.bloomRTs = [];
    let bw = Math.round(W / 2), bh = Math.round(H / 2);
    for (let i = 0; i < 6; i++) {
      this.bloomRTs.push({ down: rt(bw, bh), up: rt(bw, bh), w: bw, h: bh });
      bw = Math.max(1, Math.round(bw / 2));
      bh = Math.max(1, Math.round(bh / 2));
    }
    this.compMat.uniforms.uFogTexel.value.set(1 / fw, 1 / fh);
    this.taaMat.uniforms.uTexel.value.set(1 / W, 1 / H);
    this.finalMat.uniforms.uRes.value.set(W, H);
  }

  dispose() {
    const all = [this.mainRT, this.fogRT, this.compRT, this.histA, this.histB];
    for (const r of all) r?.dispose();
    for (const b of this.bloomRTs ?? []) {
      b.down.dispose();
      b.up.dispose();
    }
    this.depthTex?.dispose();
  }

  updateFogUniforms(camera) {
    const u = this.fogMat.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFrame.value = this.frame % 64;
    const t = shared.uTime.value;
    u.uWindOffset.value.set(t * 0.09, -t * 0.012, t * 0.05);
    const tmp = new THREE.Vector3();
    this.fogLights.forEach((l, i) => {
      u.uLPos.value[i].copy(l.position);
      tmp.copy(l.target.position).sub(l.position).normalize();
      u.uLDir.value[i].copy(tmp);
      const c = l.color;
      const k = l.intensity * (l.userData.fogScale ?? 1) * this.fogLightScale;
      u.uLCol.value[i].set(c.r * k, c.g * k, c.b * k);
      const outer = Math.cos(l.angle);
      const inner = Math.cos(l.angle * (1 - l.penumbra));
      u.uLCone.value[i].set(outer, inner, l.distance || 30, 0);
    });
    this.fogShadowLights.forEach((l, i) => {
      u.uShadowMat.value[i].copy(l.shadow.matrix);
      u[`uShadow${i}`].value = l.shadow.map ? l.shadow.map.depthTexture : null;
    });
    const cu = this.compMat.uniforms;
    cu.uNear.value = camera.near;
    cu.uFar.value = camera.far;
  }

  render(scene, camera, dt, t) {
    const r = this.renderer;
    this.frame++;
    this.applyJitter(camera);
    for (const h of this.preHooks) h(r, scene, camera);

    // main pass
    r.setRenderTarget(this.mainRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);

    // fog
    this.updateFogUniforms(camera);
    this.fogMat.uniforms.tDepth.value = this.depthTex;
    this.fogPass.render(r, this.fogRT);

    // composite
    this.compMat.uniforms.tScene.value = this.mainRT.texture;
    this.compMat.uniforms.tFog.value = this.fogRT.texture;
    this.compMat.uniforms.tDepth.value = this.depthTex;
    this.compPass.render(r, this.compRT);

    // temporal resolve
    let hdr = this.compRT.texture;
    if (this.taa) {
      const tu = this.taaMat.uniforms;
      tu.tCur.value = this.compRT.texture;
      tu.tHist.value = this.histA.texture;
      tu.tDepth.value = this.depthTex;
      tu.uInvProj.value.copy(camera.projectionMatrixInverse);
      tu.uCamWorld.value.copy(camera.matrixWorld);
      tu.uPrevVP.value.copy(this.prevVP);
      tu.uReset.value = this.taaReset ? 1 : 0;
      this.taaPass.render(r, this.histB);
      [this.histA, this.histB] = [this.histB, this.histA];
      hdr = this.histA.texture;
      this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.taaReset = false;
    }

    // bloom chain
    let src = hdr;
    let sw = this.size.x, sh = this.size.y;
    this.bloomRTs.forEach((b, i) => {
      this.bloomDown.uniforms.tSrc.value = src;
      this.bloomDown.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      this.bloomDown.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
      this.bloomDownPass.render(r, b.down);
      src = b.down.texture;
      sw = b.w;
      sh = b.h;
    });
    let up = this.bloomRTs[this.bloomRTs.length - 1].down.texture;
    for (let i = this.bloomRTs.length - 2; i >= 0; i--) {
      const b = this.bloomRTs[i];
      const nb = this.bloomRTs[i + 1];
      this.bloomUp.uniforms.tSrc.value = up;
      this.bloomUp.uniforms.tBase.value = b.down.texture;
      this.bloomUp.uniforms.uTexel.value.set(1 / nb.w, 1 / nb.h);
      this.bloomUpPass.render(r, b.up);
      up = b.up.texture;
    }

    // final
    const fu = this.finalMat.uniforms;
    fu.tHDR.value = hdr;
    fu.tBloom.value = up;
    fu.uExposure.value = this.exposure;
    fu.uBloom.value = this.bloomStrength;
    fu.uTime.value = t;
    fu.uFade.value = this.fade;
    this.finalPass.render(r, null);
  }
}
