// Post-processing: HDR scene → restrained bloom → filmic tone map, muted winter grade,
// vignette, film grain and ordered dithering ("a forgotten PC game from 2008, reconstructed
// through a dream").

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.35 },
    uDither: { value: 1.0 },
    uSaturation: { value: 0.82 },
    uLift: { value: new THREE.Vector3(0.012, 0.014, 0.024) },
    uGain: { value: new THREE.Vector3(1.0, 0.98, 0.96) },
    uFade: { value: 0 },
    uFadeColor: { value: new THREE.Color(0, 0, 0) },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uChroma: { value: 0.0015 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uGrain, uVignette, uDither, uSaturation, uFade, uChroma;
    uniform vec3 uLift, uGain, uFadeColor;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 aces(vec3 x) {
      const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float bayer4(vec2 p) {
      ivec2 i = ivec2(mod(p, 4.0));
      int idx = i.x + i.y * 4;
      int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
      return (float(m[idx]) + 0.5) / 16.0;
    }
    void main() {
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      // very slight lens chromatic fringe at the edges
      float ca = dot(cc, cc) * uChroma * 10.0;
      vec3 col;
      col.r = texture2D(tDiffuse, uv - cc * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + cc * ca).b;
      col *= uExposure;
      col = aces(col * 1.1);
      // grade: lift shadows toward cold blue, gentle gain, muted saturation
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSaturation);
      col = col * uGain + uLift * (1.0 - col);
      // vignette
      float v = 1.0 - uVignette * smoothstep(0.25, 0.95, length(cc * vec2(1.15, 1.0)));
      col *= v;
      col = toSRGB(clamp(col, 0.0, 1.0));
      // film grain (luma-weighted) and ordered dithering to ~6 bits
      vec2 fc = gl_FragCoord.xy;
      float g = hash12(fc + fract(uTime * 13.7) * 300.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4 * (1.0 - l));
      float levels = 64.0;
      float bd = bayer4(fc) - 0.5;
      col = mix(col, floor(col * levels + 0.5 + bd) / levels, uDither * 0.6);
      col = mix(col, uFadeColor, uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer
    const size = renderer.getSize(new THREE.Vector2())
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
    })
    this.composer = new EffectComposer(renderer, rt)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.75, 0.82)
    this.composer.addPass(this.bloom)
    this.final = new ShaderPass(FinalShader)
    this.composer.addPass(this.final)
    this.scale = 1
  }

  setSize(w, h, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(w, h)
    this.final.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio)
  }

  setCamera(camera) { this.renderPass.camera = camera }

  render(dt, time) {
    this.final.uniforms.uTime.value = time
    this.composer.render(dt)
  }

  get uniforms() { return this.final.uniforms }
}
