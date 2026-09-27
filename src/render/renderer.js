// Renderer + post-processing chain.
// World pass -> viewmodel pass (depth cleared) -> bloom -> tonemap -> grade (vignette,
// grain, damage/bile/incap effects, chromatic aberration) -> FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.45 },
    grain: { value: 0.06 },
    saturation: { value: 0.85 },
    contrast: { value: 1.08 },
    tint: { value: new THREE.Vector3(1, 1, 1) },
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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, saturation, contrast, flash, chroma, lowHealth, bile, bw, fade, blur, smoke;
    uniform vec3 tint, flashColor;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);
      // bile / smoke warp
      if (bile > 0.0) {
        uv += vec2(noise(uv*6.0 + time*0.6), noise(uv*6.0 - time*0.5)) * 0.012 * bile;
      }
      vec3 col;
      float ca = chroma * 0.012 + 0.0012;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      if (blur > 0.0) {
        vec3 acc = col;
        for (int i = 0; i < 6; i++) {
          float a = float(i) * 1.047;
          acc += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * blur * 0.01).rgb;
        }
        col = acc / 7.0;
      }
      // contrast & saturation
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float sat = saturation * (1.0 - bw);
      col = mix(vec3(l), col, sat);
      col *= tint;
      // bile: sickly green overlay with streaks
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
      // low health red pulse on edges
      if (lowHealth > 0.0) {
        float p = 0.6 + 0.4 * sin(time * 5.0);
        float e = smoothstep(0.08, 0.45, r2);
        col = mix(col, vec3(0.35, 0.0, 0.0), e * lowHealth * p * 0.8);
      }
      // damage flash
      col = mix(col, flashColor, flash * smoothstep(0.02, 0.35, r2 + flash*0.1));
      // vignette
      col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 1.6);
      // film grain
      float gr = hash(uv * resolution + fract(time * 13.7) * 100.0) - 0.5;
      col += gr * grain;
      col *= 1.0 - fade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

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

export class Renderer {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;
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
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.msaa ? 4 : 0,
    });
    this.composer = new EffectComposer(r, rt);
    this.worldPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.worldPass);
    this.vmPass = new ViewmodelPass(this.scene, this.vmCamera);
    this.composer.addPass(this.vmPass);
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.5, 0.82);
      this.composer.addPass(this.bloom);
    }
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    if (!quality.msaa) {
      this.fxaa = new ShaderPass(FXAAShader);
      this.composer.addPass(this.fxaa);
    }
    this.fx = this.grade.uniforms;
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
  }
  render(dt) {
    this.fx.time.value += dt;
    this.vmCamera.position.copy(this.camera.position);
    this.vmCamera.quaternion.copy(this.camera.quaternion);
    this.vmCamera.updateMatrixWorld();
    this.r.shadowMap.needsUpdate = true;
    this.composer.render(dt);
  }
}
