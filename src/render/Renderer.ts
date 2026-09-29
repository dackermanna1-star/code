import * as THREE from 'three';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

function fullscreenTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  return g;
}

/** Post-processing state other systems can poke. */
export interface PostFX {
  exposure: number;
  saturation: number;
  contrast: number;
  tint: THREE.Color;
  lift: THREE.Color;
  vignette: number;
  damage: number;
  flash: number;
  aberration: number;
  bloomStrength: number;
  bloomThreshold: number;
  grain: number;
  scope: number;
  heal: number;
}

export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly post: PostFX = {
    exposure: 1.0,
    saturation: 1.0,
    contrast: 1.0,
    tint: new THREE.Color(1, 1, 1),
    lift: new THREE.Color(0, 0, 0),
    vignette: 0.35,
    damage: 0,
    flash: 0,
    aberration: 0,
    bloomStrength: 0.55,
    bloomThreshold: 1.0,
    grain: 0.035,
    scope: 0,
    heal: 0,
  };
  pixelSize = 2;
  width = 1;
  height = 1;
  internalW = 1;
  internalH = 1;
  private sceneRT: THREE.WebGLRenderTarget;
  private bloomMips: THREE.WebGLRenderTarget[] = [];
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fsScene = new THREE.Scene();
  private fsMesh: THREE.Mesh;
  private prefilterMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private compositeMat: THREE.ShaderMaterial;
  private time = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.info.autoReset = false;

    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    for (let i = 0; i < 6; i++) {
      this.bloomMips.push(
        new THREE.WebGLRenderTarget(4, 4, {
          type: THREE.HalfFloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          generateMipmaps: false,
        }),
      );
    }

    this.prefilterMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold;
        varying vec2 vUv;
        vec3 samp(vec2 o){ return texture2D(tSrc, vUv + o * texel).rgb; }
        void main(){
          vec3 c = samp(vec2(-0.5,-0.5)) + samp(vec2(0.5,-0.5)) + samp(vec2(-0.5,0.5)) + samp(vec2(0.5,0.5));
          c *= 0.25;
          float br = max(c.r, max(c.g, c.b));
          float knee = threshold * 0.5;
          float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
          soft = soft * soft / (4.0 * knee + 1e-4);
          float contrib = max(soft, br - threshold) / max(br, 1e-4);
          c = min(c * contrib, vec3(40.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } },
      depthTest: false,
      depthWrite: false,
    });
    this.downMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel;
        varying vec2 vUv;
        void main(){
          vec3 a = texture2D(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb;
          vec3 b = texture2D(tSrc, vUv + texel * vec2( 1.0,-1.0)).rgb;
          vec3 c = texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb;
          vec3 d = texture2D(tSrc, vUv + texel * vec2( 1.0, 1.0)).rgb;
          vec3 e = texture2D(tSrc, vUv).rgb;
          gl_FragColor = vec4((a + b + c + d) * 0.125 + e * 0.5, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.upMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tSrc; uniform vec2 texel; uniform float weight;
        varying vec2 vUv;
        void main(){
          vec3 s = vec3(0.0);
          s += texture2D(tSrc, vUv + texel * vec2(-1.0,-1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2( 0.0,-1.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0,-1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2(-1.0, 0.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv).rgb * 4.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0, 0.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2(-1.0, 1.0)).rgb;
          s += texture2D(tSrc, vUv + texel * vec2( 0.0, 1.0)).rgb * 2.0;
          s += texture2D(tSrc, vUv + texel * vec2( 1.0, 1.0)).rgb;
          gl_FragColor = vec4(s / 16.0 * weight, 1.0);
        }`,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } },
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: FS_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene; uniform sampler2D tBloom;
        uniform vec2 internalRes; uniform vec2 outRes;
        uniform float exposure, saturation, contrast, vignette, damage, flash, aberration, bloomStrength, grain, time, scope, heal;
        uniform vec3 tint; uniform vec3 lift;
        varying vec2 vUv;

        vec3 aces(vec3 x){
          const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
          return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
        }
        float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
        vec3 toSRGB(vec3 c){
          c = clamp(c, 0.0, 1.0);
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c));
        }
        void main(){
          vec2 uv = vUv;
          // snap to internal pixel grid for crisp nearest upscale
          vec2 pix = (floor(uv * internalRes) + 0.5) / internalRes;
          vec3 col;
          if (aberration > 0.001) {
            vec2 dir = (uv - 0.5);
            vec2 off = dir * aberration * 0.02;
            col.r = texture2D(tScene, pix + off).r;
            col.g = texture2D(tScene, pix).g;
            col.b = texture2D(tScene, pix - off).b;
          } else {
            col = texture2D(tScene, pix).rgb;
          }
          vec3 bloom = texture2D(tBloom, uv).rgb;
          col += bloom * bloomStrength;
          col *= exposure;
          col = aces(col);
          // grading
          col = col * tint + lift * (1.0 - col);
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(l), col, saturation);
          col = (col - 0.5) * contrast + 0.5;
          // flash
          col += vec3(1.0, 0.92, 0.8) * flash;
          // vignette
          vec2 vd = uv - 0.5;
          vd.x *= outRes.x / outRes.y;
          float r = length(vd);
          col *= 1.0 - vignette * smoothstep(0.35, 1.05, r);
          // damage: red edges + slight desaturation
          if (damage > 0.001) {
            float edge = smoothstep(0.25, 0.95, r);
            col = mix(col, col * vec3(1.0, 0.35, 0.3), damage * 0.35);
            col = mix(col, vec3(0.55, 0.0, 0.0), damage * edge * 0.85);
          }
          if (heal > 0.001) {
            float edge = smoothstep(0.35, 1.0, r);
            col = mix(col, vec3(0.6, 1.0, 0.6), heal * edge * 0.3);
          }
          // grain at internal pixel resolution (fits the pixel look)
          float n = hash(floor(uv * internalRes) + fract(time * 13.7) * 91.0) - 0.5;
          col += n * grain;
          // scope mask
          if (scope > 0.001) {
            vec2 sd = (uv - 0.5); sd.x *= outRes.x / outRes.y;
            float sr = length(sd);
            float mask = smoothstep(0.43, 0.445, sr);
            col = mix(col, vec3(0.0), mask * scope);
            col *= 1.0 - scope * smoothstep(0.25, 0.44, sr) * 0.5;
          }
          gl_FragColor = vec4(toSRGB(col), 1.0);
        }`,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        internalRes: { value: new THREE.Vector2() },
        outRes: { value: new THREE.Vector2() },
        exposure: { value: 1 },
        saturation: { value: 1 },
        contrast: { value: 1 },
        vignette: { value: 0.3 },
        damage: { value: 0 },
        flash: { value: 0 },
        aberration: { value: 0 },
        bloomStrength: { value: 0.5 },
        grain: { value: 0.03 },
        time: { value: 0 },
        scope: { value: 0 },
        heal: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) },
        lift: { value: new THREE.Color(0, 0, 0) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.fsMesh = new THREE.Mesh(fullscreenTriangle(), this.compositeMat);
    this.fsMesh.frustumCulled = false;
    this.fsScene.add(this.fsMesh);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setPixelSize(px: number) {
    this.pixelSize = Math.max(1, Math.min(6, Math.round(px)));
    this.resize();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.internalW = Math.max(64, Math.round(w / this.pixelSize));
    this.internalH = Math.max(36, Math.round(h / this.pixelSize));
    this.sceneRT.setSize(this.internalW, this.internalH);
    let bw = Math.max(2, this.internalW >> 1);
    let bh = Math.max(2, this.internalH >> 1);
    for (const m of this.bloomMips) {
      m.setSize(bw, bh);
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
    this.onResize?.(w, h);
  }
  onResize: ((w: number, h: number) => void) | null = null;

  private blit(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.fsMesh.material = mat;
    this.renderer.setRenderTarget(target);
    if (clear) this.renderer.clear(true, false, false);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /**
   * Renders the world, then the first-person viewmodel on top (depth cleared),
   * then bloom + grading into the canvas.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, vmScene: THREE.Scene | null, vmCamera: THREE.Camera | null, dt: number) {
    this.time += dt;
    const r = this.renderer;
    r.info.reset();
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    if (vmScene && vmCamera) {
      r.clearDepth();
      r.render(vmScene, vmCamera);
    }

    // Bloom chain
    const p = this.post;
    const pre = this.prefilterMat;
    pre.uniforms.tSrc.value = this.sceneRT.texture;
    pre.uniforms.texel.value.set(1 / this.internalW, 1 / this.internalH);
    pre.uniforms.threshold.value = p.bloomThreshold;
    this.blit(pre, this.bloomMips[0]);
    for (let i = 1; i < this.bloomMips.length; i++) {
      const src = this.bloomMips[i - 1];
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.blit(this.downMat, this.bloomMips[i]);
    }
    for (let i = this.bloomMips.length - 1; i > 0; i--) {
      const src = this.bloomMips[i];
      this.upMat.uniforms.tSrc.value = src.texture;
      this.upMat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.upMat.uniforms.weight.value = 1.0;
      this.blit(this.upMat, this.bloomMips[i - 1], false);
    }

    const u = this.compositeMat.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.tBloom.value = this.bloomMips[0].texture;
    u.internalRes.value.set(this.internalW, this.internalH);
    u.outRes.value.set(this.width, this.height);
    u.exposure.value = p.exposure;
    u.saturation.value = p.saturation;
    u.contrast.value = p.contrast;
    u.vignette.value = p.vignette;
    u.damage.value = p.damage;
    u.flash.value = p.flash;
    u.aberration.value = p.aberration;
    u.bloomStrength.value = p.bloomStrength;
    u.grain.value = p.grain;
    u.time.value = this.time;
    u.scope.value = p.scope;
    u.heal.value = p.heal;
    (u.tint.value as THREE.Color).copy(p.tint);
    (u.lift.value as THREE.Color).copy(p.lift);
    r.setRenderTarget(null);
    r.clear(true, true, false);
    this.fsMesh.material = this.compositeMat;
    r.render(this.fsScene, this.fsCam);
  }
}
