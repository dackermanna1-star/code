import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { Engine } from '../core/Engine';

const FINAL_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uExposure;
  uniform float uVignette;
  uniform float uDamage;
  uniform vec2 uDamageDir;
  uniform float uLowHealth;
  uniform float uPulse;
  uniform float uRage;
  uniform float uDrunk;
  uniform float uSlowMo;
  uniform float uRadial;
  uniform float uGrain;
  uniform float uFade;
  uniform float uSaturation;
  varying vec2 vUv;

  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= uExposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit(color);
    color = ACESOutputMat * color;
    return clamp(color, 0.0, 1.0);
  }
  vec3 srgb(vec3 c) {
    return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = vUv;
    if (uDrunk > 0.001) {
      uv += vec2(sin(uv.y * 7.0 + uTime * 1.3), cos(uv.x * 5.0 + uTime * 1.1)) * 0.0045 * uDrunk;
    }
    vec2 dc = uv - 0.5;
    float r2 = dot(dc, dc);
    float ca = (0.0012 + uDamage * 0.012 + uRage * 0.006 + uSlowMo * 0.004) * r2 * 4.0;
    vec3 col;
    col.r = texture2D(tScene, uv + dc * ca).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv - dc * ca).b;
    if (uRadial > 0.002) {
      vec3 acc = col;
      for (int i = 1; i < 7; i++) {
        float s = 1.0 - float(i) * uRadial * 0.014;
        acc += texture2D(tScene, 0.5 + dc * s).rgb;
      }
      col = acc / 7.0;
    }
    if (uDrunk > 0.001) {
      vec2 off = vec2(sin(uTime * 0.71), cos(uTime * 0.53)) * 0.014 * uDrunk;
      col = mix(col, texture2D(tScene, uv + off).rgb, 0.4 * uDrunk);
    }
    col = aces(col);

    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float desat = clamp(uLowHealth * 0.6 + uSlowMo * 0.35 + (1.0 - uSaturation), 0.0, 1.0);
    col = mix(col, vec3(lum), desat);
    // rage: blood red grade with crushed blacks
    vec3 rage = vec3(lum * 1.5 + 0.05, lum * 0.32, lum * 0.22);
    col = mix(col, rage, uRage * 0.55);

    // vignette (aspect corrected)
    vec2 vd = dc * vec2(uRes.x / uRes.y, 1.0);
    float vig = smoothstep(1.25, 0.3, length(vd));
    col *= mix(1.0, vig, uVignette);

    // red edges: incoming damage (biased toward the hit direction), low health heartbeat, rage
    float edge = smoothstep(0.22, 0.75, length(dc) * 1.35);
    float dirBias = 0.55 + 0.9 * max(0.0, dot(normalize(dc + 1e-4), uDamageDir));
    float red = uDamage * dirBias + uLowHealth * (0.28 + 0.42 * uPulse) + uRage * 0.35;
    col = mix(col, vec3(0.42, 0.0, 0.0), clamp(edge * red, 0.0, 0.92));

    col += (hash(uv * uRes + fract(uTime) * 61.0) - 0.5) * uGrain;
    col *= 1.0 - uFade;
    gl_FragColor = vec4(srgb(clamp(col, 0.0, 1.0)), 1.0);
  }
`;

/** Soft-knee bright pass: only the energy above the threshold blooms, capped so big emitters can't flood the frame. */
const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = max(max(c.r, c.g), c.b);
    float knee = smoothWidth;
    float soft = clamp(l - luminosityThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float contrib = max(soft, l - luminosityThreshold) / max(l, 1e-4);
    gl_FragColor = vec4(min(c * contrib, vec3(1.6)), 1.0);
  }
`;

const FINAL_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export interface PostState {
  damage: number;
  damageDir: THREE.Vector2;
  lowHealth: number;
  pulse: number;
  rage: number;
  drunk: number;
  slowMo: number;
  radial: number;
  fade: number;
  saturation: number;
}

/**
 * Renders the scene into an HDR target, adds bloom for neon / emissive
 * surfaces, then tone maps and applies the gameplay screen effects in one
 * full-screen pass (vignette, damage flash, rage grade, drunk double vision,
 * slow motion desaturation, radial speed blur, film grain).
 */
export class PostFX {
  private sceneRT: THREE.WebGLRenderTarget;
  private bloom: UnrealBloomPass | null = null;
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  readonly state: PostState = {
    damage: 0,
    damageDir: new THREE.Vector2(0, 0),
    lowHealth: 0,
    pulse: 0,
    rage: 0,
    drunk: 0,
    slowMo: 0,
    radial: 0,
    fade: 0,
    saturation: 1,
  };
  enabled = true;

  constructor(private engine: Engine) {
    const q = engine.quality;
    const { w, h } = this.size();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa, depthBuffer: true });
    this.sceneRT.texture.name = 'PostFX.scene';
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.sceneRT.texture },
        uRes: { value: new THREE.Vector2(w, h) },
        uTime: { value: 0 },
        uExposure: { value: engine.renderer.toneMappingExposure },
        uVignette: { value: 0.38 },
        uDamage: { value: 0 },
        uDamageDir: { value: new THREE.Vector2() },
        uLowHealth: { value: 0 },
        uPulse: { value: 0 },
        uRage: { value: 0 },
        uDrunk: { value: 0 },
        uSlowMo: { value: 0 },
        uRadial: { value: 0 },
        uGrain: { value: 0.016 },
        uFade: { value: 0 },
        uSaturation: { value: 1 },
      },
      vertexShader: FINAL_VERT,
      fragmentShader: FINAL_FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.mat);
    this.setBloom(q.bloom);
    engine.onResize(() => this.resize());
  }

  private size(): { w: number; h: number } {
    const pr = this.engine.renderer.getPixelRatio();
    return { w: Math.max(1, Math.floor(this.engine.width * pr)), h: Math.max(1, Math.floor(this.engine.height * pr)) };
  }

  setBloom(on: boolean): void {
    if (on && !this.bloom) {
      const { w, h } = this.size();
      // strength, radius, threshold (HDR linear: only neon, bulbs, sparks and lit glass exceed it)
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.4, 1.0);
      (this.bloom.highPassUniforms as Record<string, THREE.IUniform>).smoothWidth.value = 0.5;
      this.bloom.materialHighPassFilter.fragmentShader = BRIGHT_FRAG;
      this.bloom.materialHighPassFilter.needsUpdate = true;
      this.bloom.setSize(w, h);
    } else if (!on && this.bloom) {
      this.bloom.dispose();
      this.bloom = null;
    }
  }

  applyQuality(): void {
    const q = this.engine.quality;
    this.setBloom(q.bloom);
    if (this.sceneRT.samples !== q.msaa) {
      this.sceneRT.dispose();
      const { w, h } = this.size();
      this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa, depthBuffer: true });
      this.mat.uniforms.tScene.value = this.sceneRT.texture;
    }
    this.resize();
  }

  resize(): void {
    const { w, h } = this.size();
    this.sceneRT.setSize(w, h);
    this.bloom?.setSize(w, h);
    (this.mat.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  /** Pre-compile the scene's shader programs for the HDR target (hides first-frame hitches). */
  async compile(scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    const r = this.engine.renderer;
    r.setRenderTarget(this.sceneRT);
    try {
      await r.compileAsync(scene, camera);
    } finally {
      r.setRenderTarget(null);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number, dt: number): void {
    const r = this.engine.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    if (this.bloom) this.bloom.render(r, null as unknown as THREE.WebGLRenderTarget, this.sceneRT, dt, false);
    const u = this.mat.uniforms;
    const s = this.state;
    u.uTime.value = time;
    u.uExposure.value = r.toneMappingExposure;
    u.uDamage.value = s.damage;
    (u.uDamageDir.value as THREE.Vector2).copy(s.damageDir);
    u.uLowHealth.value = s.lowHealth;
    u.uPulse.value = s.pulse;
    u.uRage.value = s.rage;
    u.uDrunk.value = s.drunk;
    u.uSlowMo.value = s.slowMo;
    u.uRadial.value = s.radial;
    u.uFade.value = s.fade;
    u.uSaturation.value = s.saturation;
    r.setRenderTarget(null);
    this.quad.render(r);
  }
}
