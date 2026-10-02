/**
 * Deferred HDR renderer orchestrating all passes.
 */
import * as THREE from 'three';
import { ChunkRenderer } from './chunkRenderer';
import { createTerrainGBufferMaterial, createTerrainShadowMaterial } from './shaders/terrain';
import { createLightingPass } from './lighting';
import { createTranslucentMaterial } from './translucent';
import { CascadedShadows } from './shadows';
import { CopyPass, LinearDepthPass, SSAOPass, VolumetricPass, TAAPass, BloomPass, ExposurePass, TonemapPass } from './post/passes';
import type { AtmosphereLike, BlockMaterialSet, SkyParams } from './types';
import { shaderPass, type FullscreenPass } from './post/fullscreen';
import { createEntityDepthMaterial } from './entityMaterial';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

export interface RenderSettings {
  quality: Quality;
  renderScale: number;
  shadowRes: number;
  shadowDistance: number;
  ssao: boolean;
  volumetrics: boolean;
  taa: boolean;
  ssr: boolean;
  pom: boolean;
  bloom: number;
  exposureBias: number;
  gamma: number;
}

export function presetSettings(q: Quality): RenderSettings {
  switch (q) {
    case 'low':
      return { quality: q, renderScale: 0.75, shadowRes: 1024, shadowDistance: 64, ssao: false, volumetrics: false, taa: true, ssr: false, pom: false, bloom: 0.035, exposureBias: 1, gamma: 1 };
    case 'medium':
      return { quality: q, renderScale: 0.85, shadowRes: 1536, shadowDistance: 96, ssao: true, volumetrics: false, taa: true, ssr: true, pom: true, bloom: 0.04, exposureBias: 1, gamma: 1 };
    case 'ultra':
      return { quality: q, renderScale: 1, shadowRes: 3072, shadowDistance: 160, ssao: true, volumetrics: true, taa: true, ssr: true, pom: true, bloom: 0.045, exposureBias: 1, gamma: 1 };
    default:
      return { quality: q, renderScale: 1, shadowRes: 2048, shadowDistance: 128, ssao: true, volumetrics: true, taa: true, ssr: true, pom: true, bloom: 0.045, exposureBias: 1, gamma: 1 };
  }
}

export interface FrameState {
  camera: THREE.PerspectiveCamera;
  time: number;
  dt: number;
  sky: SkyParams;
  underwater: boolean;
  waterFogColor: THREE.Color;
  wind: number;
  /** 0..1 rain wetness of exposed surfaces. */
  wetness?: number;
  nightVision: number;
  damage: number;
  overlay?: THREE.Vector4;
  /** Entities etc. rendered into the G-buffer (materials must write the 4 MRT outputs). */
  gbufferScenes?: THREE.Scene[];
  /** Shadow casters besides terrain (rendered with their own depth materials). */
  shadowScenes?: THREE.Scene[];
  /** Forward HDR scenes drawn after translucents (particles, effects). */
  forwardScenes?: THREE.Scene[];
  /** First-person hand/item scene and camera (drawn after TAA). */
  hand?: { scene: THREE.Scene; camera: THREE.Camera };
  /** Selection outline / overlays drawn after TAA (no AA, no bloom feedback). */
  overlayScene?: THREE.Scene;
}

const HALTON = (i: number, b: number) => {
  let f = 1, r = 0;
  while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
  return r;
};

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly chunks: ChunkRenderer;
  settings: RenderSettings;
  width = 1;
  height = 1;
  frame = 0;
  private gbuffer!: THREE.WebGLRenderTarget;
  private depthTex!: THREE.DepthTexture;
  private hdrA!: THREE.WebGLRenderTarget;
  private hdrB!: THREE.WebGLRenderTarget;
  private post!: THREE.WebGLRenderTarget;
  private shadows: CascadedShadows;
  private linDepth!: LinearDepthPass;
  private ssao!: SSAOPass;
  private vol!: VolumetricPass;
  private taa!: TAAPass;
  private bloom!: BloomPass;
  private exposure: ExposurePass;
  private tonemap: TonemapPass;
  private copy: CopyPass;
  private lighting!: FullscreenPass;
  private whiteTex: THREE.DataTexture;
  readonly terrainUniforms: Record<string, THREE.IUniform>;
  readonly shadowUniforms: Record<string, THREE.IUniform>;
  readonly lightUniforms: Record<string, THREE.IUniform>;
  readonly translucentUniforms: Record<string, THREE.IUniform>;
  private matOpaque: THREE.RawShaderMaterial;
  private matCutout: THREE.RawShaderMaterial;
  private matTranslucent!: THREE.RawShaderMaterial;
  private shadowOpaque: THREE.RawShaderMaterial;
  private shadowCutout: THREE.RawShaderMaterial;
  private atmo!: AtmosphereLike;
  private prevViewProj = new THREE.Matrix4();
  private viewProj = new THREE.Matrix4();
  private jitter = new THREE.Vector2();
  readonly stats = { drawCalls: 0, triangles: 0, frameMs: 0 };
  /** The camera used for the last frame (jittered projection). */
  lastCamera: THREE.PerspectiveCamera | null = null;
  /** Debug output: 'albedo' | 'normal' | 'material' | 'light' | 'ssao' | 'hdr' | 'shadow' | 'lindepth' */
  debugView = '';
  private debugPass: CopyPass | null = null;
  private debugShader: FullscreenPass | null = null;
  private entityDepth: THREE.Material | null = null;
  private prevResolved: THREE.Texture | null = null;

  /** Linear view-distance texture of the current frame (R32F, sky = 1e6). For soft particles / overlays. */
  get linearDepthTexture(): THREE.Texture {
    return this.linDepth.target.texture;
  }
  /** Opaque scene HDR colour (before translucents) of the current frame. */
  get sceneColorTexture(): THREE.Texture {
    return this.hdrA.texture;
  }
  get depthTexture(): THREE.DepthTexture {
    return this.depthTex;
  }

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality = 'high') {
    this.settings = presetSettings(quality);
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.autoClear = false;
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.setClearColor(0x000000, 0);
    this.whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.whiteTex.needsUpdate = true;

    this.terrainUniforms = {
      u_albedo: { value: null },
      u_normalTex: { value: null },
      u_props: { value: null },
      u_texSize: { value: 16 },
      u_pomDepth: { value: 0.08 },
      u_pomDist: { value: 28 },
      u_normalStrength: { value: 1.0 },
      u_time: { value: 0 },
      u_wind: { value: 0 },
      u_viewInvRot: { value: new THREE.Matrix3() },
      u_resolution: { value: new THREE.Vector2(1, 1) },
    };
    this.shadows = new CascadedShadows(this.settings.shadowRes, this.settings.shadowDistance);
    this.shadowUniforms = {
      u_shadowMap: { value: this.shadows.texture },
      u_shadowMat: { value: this.shadows.shaderMats },
      u_shadowRects: { value: this.shadows.rects },
      u_cascadeRadius: { value: this.shadows.radius },
      u_shadowTexel: { value: 1 / (this.settings.shadowRes * 2) },
      u_shadowEnabled: { value: 1 },
      u_shadowSoftness: { value: 1 },
    };
    this.lightUniforms = {
      g0: { value: null }, g1: { value: null }, g2: { value: null }, g3: { value: null },
      u_depth: { value: null },
      u_ssao: { value: this.whiteTex },
      u_projInv: { value: new THREE.Matrix4() },
      u_viewInvRot: this.terrainUniforms.u_viewInvRot,
      u_cameraPos: { value: new THREE.Vector3() },
      u_lightDir: { value: new THREE.Vector3(0, 1, 0) },
      u_lightColor: { value: new THREE.Color() },
      u_sh: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
      u_frame: { value: 0 },
      u_time: this.terrainUniforms.u_time,
      u_minAmbient: { value: 0.0035 },
      u_nightVision: { value: 0 },
      u_skyLightScale: { value: 1 },
      u_underwater: { value: 0 },
      u_waterFog: { value: new THREE.Color(0.02, 0.08, 0.12) },
      u_dimension: { value: 0 },
      u_dimAmbient: { value: new THREE.Color(0, 0, 0) },
      u_wetness: { value: 0 },
      u_prevColor: { value: null },
      u_linDepth: { value: null },
      u_prevViewProj: { value: new THREE.Matrix4() },
      u_viewMat: { value: new THREE.Matrix4() },
      u_viewInvMat: { value: new THREE.Matrix4() },
      u_projMat: { value: new THREE.Matrix4() },
      u_ssrEnabled: { value: 1 },
      u_hasPrev: { value: 0 },
      ...this.shadowUniforms,
    };
    this.translucentUniforms = {
      ...this.terrainUniforms,
      ...this.shadowUniforms,
      u_sceneColor: { value: null },
      u_linDepth: { value: null },
      u_cameraPos: this.lightUniforms.u_cameraPos,
      u_lightDir: this.lightUniforms.u_lightDir,
      u_lightColor: this.lightUniforms.u_lightColor,
      u_sh: this.lightUniforms.u_sh,
      u_frame: this.lightUniforms.u_frame,
      u_underwater: this.lightUniforms.u_underwater,
      u_waterFog: this.lightUniforms.u_waterFog,
      u_skyLightScale: this.lightUniforms.u_skyLightScale,
      u_dimAmbient: this.lightUniforms.u_dimAmbient,
      u_ssr: { value: 1 },
    };
    this.matOpaque = createTerrainGBufferMaterial(false, this.terrainUniforms);
    this.matCutout = createTerrainGBufferMaterial(true, this.terrainUniforms);
    this.shadowOpaque = createTerrainShadowMaterial(false, this.terrainUniforms);
    this.shadowCutout = createTerrainShadowMaterial(true, this.terrainUniforms);
    // translucent material needs the atmosphere GLSL: created in setAtmosphere
    this.chunks = new ChunkRenderer({ opaque: this.matOpaque, cutout: this.matCutout, translucent: this.matOpaque });
    this.exposure = new ExposurePass();
    this.tonemap = new TonemapPass();
    this.copy = new CopyPass();
    this.resize(canvas.clientWidth || 1280, canvas.clientHeight || 720);
  }

  /** Install block materials. */
  setMaterials(set: BlockMaterialSet) {
    this.terrainUniforms.u_albedo.value = set.albedo;
    this.terrainUniforms.u_normalTex.value = set.normal;
    this.terrainUniforms.u_props.value = set.props;
    this.terrainUniforms.u_texSize.value = set.size;
  }

  /** Install the atmosphere (builds shaders that include its GLSL). */
  setAtmosphere(atmo: AtmosphereLike) {
    this.atmo = atmo;
    const lu: Record<string, THREE.IUniform> = { ...this.lightUniforms, ...atmo.uniforms };
    this.lighting?.dispose();
    this.lighting = createLightingPass(atmo.glsl, lu);
    this.matTranslucent?.dispose();
    this.matTranslucent = createTranslucentMaterial(atmo.glsl, { ...this.translucentUniforms, ...atmo.uniforms });
    this.chunks.setMaterials({ opaque: this.matOpaque, cutout: this.matCutout, translucent: this.matTranslucent });
    this.vol = new VolumetricPass(this.width, this.height, atmo.glsl, this.shadowUniforms, atmo.uniforms);
  }

  get atmosphere() {
    return this.atmo;
  }

  /** Terrain G-buffer materials (for single-block meshes: falling blocks, items in the world). */
  blockMaterials() {
    return { opaque: this.matOpaque, cutout: this.matCutout };
  }

  applySettings(s: Partial<RenderSettings>) {
    const prev = this.settings;
    this.settings = { ...this.settings, ...s };
    if (s.shadowRes && s.shadowRes !== prev.shadowRes) {
      this.shadows.dispose();
      this.shadows = new CascadedShadows(this.settings.shadowRes, this.settings.shadowDistance);
      this.shadowUniforms.u_shadowMap.value = this.shadows.texture;
      this.shadowUniforms.u_shadowMat.value = this.shadows.shaderMats;
      this.shadowUniforms.u_shadowRects.value = this.shadows.rects;
      this.shadowUniforms.u_cascadeRadius.value = this.shadows.radius;
      this.shadowUniforms.u_shadowTexel.value = 1 / (this.settings.shadowRes * 2);
    }
    if (s.shadowDistance) this.shadows.setDistance(s.shadowDistance);
    if (s.renderScale && s.renderScale !== prev.renderScale) this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.terrainUniforms.u_pomDepth.value = this.settings.pom ? 0.08 : 0;
    this.translucentUniforms.u_ssr.value = this.settings.ssr ? 1 : 0;
  }

  resize(cssW: number, cssH: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(cssW * dpr * this.settings.renderScale));
    const h = Math.max(1, Math.round(cssH * dpr * this.settings.renderScale));
    this.gl.setPixelRatio(1);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    if (w === this.width && h === this.height && this.gbuffer) return;
    this.width = w;
    this.height = h;
    this.gbuffer?.dispose();
    this.depthTex?.dispose();
    this.hdrA?.dispose();
    this.hdrB?.dispose();
    this.post?.dispose();
    this.depthTex = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.depthTex.format = THREE.DepthFormat;
    this.depthTex.minFilter = this.depthTex.magFilter = THREE.NearestFilter;
    this.gbuffer = new THREE.WebGLRenderTarget(w, h, { count: 4, type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.gbuffer.textures[0].type = THREE.UnsignedByteType;
    this.gbuffer.textures[2].type = THREE.UnsignedByteType;
    this.gbuffer.textures[3].type = THREE.UnsignedByteType;
    this.gbuffer.depthTexture = this.depthTex;
    const mk = (depth: boolean) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      return rt;
    };
    this.hdrA = mk(false);
    this.hdrB = mk(true);
    this.hdrB.depthTexture = this.depthTex;
    this.post = mk(true);
    if (!this.linDepth) {
      this.linDepth = new LinearDepthPass(w, h);
      this.ssao = new SSAOPass(w, h);
      this.taa = new TAAPass(w, h);
      this.bloom = new BloomPass(w, h);
    } else {
      this.linDepth.setSize(w, h);
      this.ssao.setSize(w, h);
      this.taa.setSize(w, h);
      this.bloom.setSize(w, h);
      this.vol?.setSize(w, h);
    }
    this.terrainUniforms.u_resolution.value.set(w, h);
  }

  /** Renders one frame. */
  render(f: FrameState) {
    const t0 = performance.now();
    const gl = this.gl;
    const cam = f.camera;
    const s = this.settings;
    this.frame++;
    this.chunks.flush();
    gl.info.autoReset = false;
    gl.info.reset();

    // ---------- camera + TAA jitter
    cam.aspect = this.width / this.height;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (s.taa) {
      const i = (this.frame % 16) + 1;
      this.jitter.set(HALTON(i, 2) - 0.5, HALTON(i, 3) - 0.5);
      cam.projectionMatrix.elements[8] += (this.jitter.x * 2) / this.width;
      cam.projectionMatrix.elements[9] += (this.jitter.y * 2) / this.height;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
    this.lastCamera = cam;

    // ---------- shared uniforms
    this.terrainUniforms.u_time.value = f.time;
    this.terrainUniforms.u_wind.value = f.wind;
    (this.terrainUniforms.u_viewInvRot.value as THREE.Matrix3).setFromMatrix4(cam.matrixWorld);
    this.lightUniforms.u_projInv.value.copy(cam.projectionMatrixInverse);
    this.lightUniforms.u_cameraPos.value.copy(cam.position);
    this.lightUniforms.u_frame.value = this.frame;
    this.lightUniforms.u_underwater.value = f.underwater ? 1 : 0;
    this.lightUniforms.u_waterFog.value.copy(f.waterFogColor);
    this.lightUniforms.u_nightVision.value = f.nightVision;
    const dim = f.sky.dimension;
    this.lightUniforms.u_dimension.value = dim === 'nether' ? 1 : dim === 'end' ? 2 : 0;
    (this.lightUniforms.u_dimAmbient.value as THREE.Color).setRGB(...((dim === 'nether' ? [0.05, 0.028, 0.02] : dim === 'end' ? [0.03, 0.025, 0.04] : [0, 0, 0]) as [number, number, number]));
    this.lightUniforms.u_skyLightScale.value = dim === 'overworld' ? 1 : 0;

    // ---------- atmosphere
    this.atmo.update(f.sky, cam, this.frame);
    this.lightUniforms.u_lightDir.value.copy(this.atmo.lightDir);
    this.lightUniforms.u_lightColor.value.copy(this.atmo.lightColor);
    for (let i = 0; i < 9; i++) (this.lightUniforms.u_sh.value as THREE.Vector3[])[i].copy(this.atmo.ambientSH[i]);

    // ---------- shadows
    const shadowsOn = s.shadowRes > 0 && dim === 'overworld' && this.atmo.lightColor.r + this.atmo.lightColor.g + this.atmo.lightColor.b > 1e-4;
    this.shadowUniforms.u_shadowEnabled.value = shadowsOn ? 1 : 0;
    if (shadowsOn) {
      const casters = [
        { scene: this.chunks.opaque, material: this.shadowOpaque },
        { scene: this.chunks.cutout, material: this.shadowCutout },
        ...(f.shadowScenes ?? []).map((sc) => ({ scene: sc, material: (this.entityDepth ??= createEntityDepthMaterial(false)) as THREE.Material })),
      ];
      this.shadows.update(gl, cam, this.atmo.lightDir, casters);
    }

    // ---------- G-buffer
    gl.setRenderTarget(this.gbuffer);
    gl.setClearColor(0x000000, 0);
    gl.clear(true, true, false);
    gl.render(this.chunks.opaque, cam);
    gl.render(this.chunks.cutout, cam);
    if (f.gbufferScenes) for (const sc of f.gbufferScenes) gl.render(sc, cam);

    // ---------- linear depth + SSAO
    this.linDepth.render(gl, this.depthTex, cam.projectionMatrixInverse);
    if (s.ssao) this.lightUniforms.u_ssao.value = this.ssao.render(gl, this.depthTex, this.gbuffer.textures[1], cam, this.frame);
    else this.lightUniforms.u_ssao.value = this.whiteTex;

    // ---------- lighting -> hdrA, sky -> hdrA
    const lu = this.lightUniforms;
    lu.g0.value = this.gbuffer.textures[0];
    lu.g1.value = this.gbuffer.textures[1];
    lu.g2.value = this.gbuffer.textures[2];
    lu.g3.value = this.gbuffer.textures[3];
    lu.u_depth.value = this.depthTex;
    lu.u_wetness.value = f.wetness ?? 0;
    lu.u_linDepth.value = this.linDepth.target.texture;
    lu.u_prevViewProj.value.copy(this.prevViewProj);
    lu.u_viewMat.value.copy(cam.matrixWorldInverse);
    lu.u_viewInvMat.value.copy(cam.matrixWorld);
    lu.u_projMat.value.copy(cam.projectionMatrix);
    lu.u_ssrEnabled.value = s.ssr ? 1 : 0;
    lu.u_prevColor.value = this.prevResolved;
    lu.u_hasPrev.value = this.prevResolved ? 1 : 0;
    this.lighting.render(gl, this.hdrA);
    this.atmo.render(this.hdrA, this.depthTex, cam);

    // ---------- translucent -> hdrB (copy of hdrA + shared depth)
    this.copy.render(gl, this.hdrA.texture, this.hdrB);
    this.translucentUniforms.u_sceneColor.value = this.hdrA.texture;
    this.translucentUniforms.u_linDepth.value = this.linDepth.target.texture;
    gl.setRenderTarget(this.hdrB);
    gl.render(this.chunks.translucent, cam);
    if (f.forwardScenes) for (const sc of f.forwardScenes) gl.render(sc, cam);

    // ---------- volumetric light
    if (s.volumetrics && this.vol && dim !== 'end') {
      const vu = this.vol.uniforms;
      vu.u_projInv.value.copy(cam.projectionMatrixInverse);
      vu.u_viewInvRot.value.setFromMatrix4(cam.matrixWorld);
      vu.u_cameraPos.value.copy(cam.position);
      vu.u_lightDir.value.copy(this.atmo.lightDir);
      vu.u_lightColor.value.copy(this.atmo.lightColor).multiplyScalar(shadowsOn ? 1 : 0);
      vu.u_frame.value = this.frame;
      vu.u_underwater.value = f.underwater ? 1 : 0;
      vu.u_density.value = dim === 'nether' ? 0.012 : 0.0016 + f.sky.rain * 0.006 + Math.max(0, 0.35 - Math.abs(this.atmo.lightDir.y)) * 0.006;
      (vu.u_ambientFog.value as THREE.Color).copy(this.atmo.fogColor).multiplyScalar(dim === 'nether' ? 0.4 : 0.02);
      this.vol.render(gl, this.linDepth.target.texture, this.hdrB);
    }

    // ---------- TAA
    let resolved: THREE.Texture = this.hdrB.texture;
    if (s.taa) {
      const viewInv = cam.matrixWorld;
      const out = this.taa.render(gl, this.hdrB.texture, this.depthTex, cam.projectionMatrixInverse, viewInv, this.prevViewProj);
      resolved = out.texture;
      this.prevResolved = out.texture;
    } else this.prevResolved = null;
    this.prevViewProj.copy(this.viewProj);

    // ---------- hand / overlays (post TAA)
    this.copy.render(gl, resolved, this.post);
    if (f.hand || f.overlayScene) {
      gl.setRenderTarget(this.post);
      gl.clear(false, true, false);
      if (f.overlayScene) {
        // overlays need the scene depth: draw without depth test
        gl.render(f.overlayScene, cam);
      }
      if (f.hand) gl.render(f.hand.scene, f.hand.camera);
    }

    // ---------- bloom, exposure, tonemap
    const bloomTex = this.bloom.render(gl, this.post.texture, this.width, this.height);
    const expTex = this.exposure.render(gl, this.post.texture, Math.min(0.1, f.dt));
    const tu = this.tonemap.uniforms;
    tu.u_bloomStrength.value = s.bloom;
    tu.u_exposureBias.value = s.exposureBias;
    tu.u_gamma.value = s.gamma;
    tu.u_time.value = f.time;
    tu.u_damage.value = f.damage;
    tu.u_overlay.value.copy(f.overlay ?? new THREE.Vector4(0, 0, 0, 0));
    gl.setViewport(0, 0, this.width, this.height);
    this.tonemap.render(gl, this.post.texture, bloomTex, expTex, null);
    if (this.debugView) {
      this.debugPass ??= new CopyPass();
      const map: Record<string, THREE.Texture | null> = {
        albedo: this.gbuffer.textures[0], normal: this.gbuffer.textures[1], material: this.gbuffer.textures[2], light: this.gbuffer.textures[3],
        ssao: this.lightUniforms.u_ssao.value, hdr: this.hdrA.texture, shadow: this.shadows.texture, lindepth: this.linDepth.target.texture, exposure: expTex, bloom: bloomTex, post: this.post.texture, hdrb: this.hdrB.texture,
      };
      const tex = map[this.debugView];
      if (tex) {
        this.debugShader ??= shaderPass(
          `precision highp float; uniform sampler2D t; uniform float mode; in vec2 v_uv; out vec4 o;
          void main(){ vec4 c = texture(t, v_uv); if (any(isnan(c)) || any(isinf(c))) { o = vec4(1,0,1,1); return; }
            if (mode == 1.0) c.rgb = c.rgb * 0.5 + 0.5; o = vec4(c.rgb, 1.0); }`,
          { t: { value: null }, mode: { value: 0 } },
        );
        const u = (this.debugShader.material as THREE.RawShaderMaterial).uniforms;
        u.t.value = tex;
        u.mode.value = this.debugView === 'normal' ? 1 : 0;
        this.debugShader.render(gl, null);
      }
    }

    this.stats.drawCalls = gl.info.render.calls;
    this.stats.triangles = gl.info.render.triangles;
    this.stats.frameMs = performance.now() - t0;
  }

  resetTemporal() {
    this.taa?.reset();
    this.exposure.reset();
    this.prevResolved = null;
  }

  get exposureUniforms() {
    return this.exposure.uniforms;
  }
  get tonemapUniforms() {
    return this.tonemap.uniforms;
  }
}
