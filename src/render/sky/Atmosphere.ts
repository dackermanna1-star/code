import * as THREE from 'three';
import {
  CLOUD_BASE_Y, CLOUD_KM_PER_BLOCK, CLOUD_PLANET_RADIUS_KM, CLOUD_SHAPE_TILE_KM, CLOUD_DETAIL_TILE_KM, CLOUD_TOP_Y,
  CLOUD_WRAP_KM, MOON_ANGULAR_RADIUS, MOON_ILLUMINANCE, MULTISCAT_LUT_SIZE, SKY_QUALITY, SKY_SEA_LEVEL,
  SUN_ANGULAR_RADIUS, SUN_ILLUMINANCE, TRANSMITTANCE_LUT_SIZE,
  type SkyQuality, type SkyQualitySettings,
} from './constants';
import { moonLightDirection, moonPhaseFactor, starFrameRotation } from './celestial';
import { planetShadow, transmittance } from './cpuAtmosphere';
import { FullscreenPass, makePassMaterial, RendererStateGuard } from './fullscreen';
import { GLSL_ATMO_PUBLIC } from './glsl/atmosphere';
import { MULTISCAT_FRAG, SKYVIEW_FRAG, TRANSMITTANCE_FRAG } from './glsl/luts';
import { DETAIL_NOISE_FRAG, SHAPE_NOISE_FRAG, WEATHER_FRAG } from './glsl/noise';
import { CLOUD_ENV_FRAG, CLOUD_MARCH_FRAG, CLOUD_SHADOW_FRAG, CLOUD_TEMPORAL_FRAG } from './glsl/clouds';
import { SH_FRAG, SKY_COMPOSITE_FRAG } from './glsl/composite';

export interface SkyParams {
  /** unit, world space, toward the sun */
  sunDir: THREE.Vector3;
  /** unit, toward the moon (≈ -sunDir) */
  moonDir: THREE.Vector3;
  /** 0..7 (0 = full moon), Minecraft order */
  moonPhase: number;
  /** seconds (animation) */
  time: number;
  /** 0..1 weather strength */
  rain: number;
  /** 0..1 */
  thunder: number;
  dimension: 'overworld' | 'nether' | 'end';
  /** world position in blocks (y = altitude) */
  cameraPosition: THREE.Vector3;
  /** blocks; terrain fades into sky at this distance */
  renderDistance: number;
  /** nether/end fog tint for the current biome. A THREE.Color (linear working space, e.g.
   *  `new THREE.Color(0x330808)` for nether wastes); used as HDR fog radiance in the Nether. */
  biomeFogColor?: THREE.Color;
}

export type { SkyQuality };

/** Moonlight tint (luminance ≈ 1): dim and bluish. */
const MOON_TINT = new THREE.Vector3(0.86, 0.98, 1.3);
const NIGHT_GLOW = new THREE.Vector3(0.45, 0.62, 0.9).multiplyScalar(2.2e-4);
const NETHER_FOG_DEFAULT = new THREE.Color(0x330808);
const END_FOG_DEFAULT = new THREE.Color().setRGB(0.06, 0.035, 0.08);
const SH_TARGET_WIDTH = 16;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};
const wrap = (x: number, p: number) => ((x % p) + p) % p;
function halton(i: number, b: number): number {
  let f = 1, r = 0;
  while (i > 0) {
    f /= b;
    r += f * (i % b);
    i = Math.floor(i / b);
  }
  return r;
}

function makeRT(w: number, h: number, opts: Partial<THREE.RenderTargetOptions> = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    ...opts,
  });
}

export class Atmosphere {
  /** GLSL ES 3.00 include (uniform declarations + atmo_* functions). See index.ts for the contract. */
  readonly glsl: string = GLSL_ATMO_PUBLIC;
  /** Uniforms referenced by `glsl` (same objects every frame; merge into your materials). */
  readonly uniforms: Record<string, THREE.IUniform>;
  /** Direction of the dominant shadow-casting light (sun when above the horizon, else moon). */
  readonly lightDir = new THREE.Vector3(0, 1, 0);
  /** Its illuminance at the camera (after transmittance, weather; fades through the horizon). */
  readonly lightColor = new THREE.Color(0, 0, 0);
  /** 9 L2 SH coefficients of sky irradiance (cosine-convolved). E(n) = Σ c_i·Y_i(n), see evalAmbientSH. */
  readonly ambientSH: THREE.Vector3[] = Array.from({ length: 9 }, () => new THREE.Vector3());
  /** Average horizon colour (linear HDR). */
  readonly fogColor = new THREE.Color(0.5, 0.6, 0.75);

  // ---- tunables (safe to change at runtime) ----
  /** Kilometres of air per block for aerial perspective (game-scale exaggeration). */
  fogDistanceScale = 0.04;
  /** Ground haze density (multiplier of the standard Mie density) in clear weather. */
  hazeDensity = 2.0;
  /** Haze scale height in blocks above sea level. */
  hazeHeight = 90;
  /** Fair-weather cloud coverage (0..1); rain pushes toward overcast. */
  cloudCoverage = 0.42;
  /** Wind at cloud level (km/s in cloud space, x = east, y = south). */
  readonly wind = new THREE.Vector2(0.011, 0.0045);
  /** Strength of terrain cloud shadows (0..1). */
  cloudShadowStrength = 0.92;
  /**
   * When true (default) and the depth texture is sampled, render() also blends the full sky over
   * terrain inside the render-distance fade zone (75..100% of renderDistance) with the same factor
   * atmo_applyFog uses, replacing the low-res sky+cloud approximation baked in by the lighting pass.
   * Disable to leave every non-sky pixel untouched.
   */
  fadeTerrainInSkyPass = true;
  /** Cloud look: view-ray extinction (/km at density 1), light-transport extinction, detail erosion,
   *  ambient scale, multiple-scattering scale, aerial-perspective extinction (/km). */
  readonly cloudLook = { viewSigma: 90, lightSigma: 120, diffDecay: 0.07, diffAmp: 0.4, detail: 0.42, ambient: 1.0, multiScatter: 1.0, aerial: 0.02, spread: 0.78 };

  private readonly renderer: THREE.WebGLRenderer;
  private qualityName: SkyQuality;
  private q: SkyQualitySettings;
  private readonly guard: RendererStateGuard;

  // static resources
  private transmittanceRT: THREE.WebGLRenderTarget;
  private multiScatRT: THREE.WebGLRenderTarget;
  private weatherRT: THREE.WebGLRenderTarget;
  private shapeRT: THREE.WebGL3DRenderTarget | null = null;
  private detailRT: THREE.WebGL3DRenderTarget | null = null;
  private staticReady = false;
  // per-quality resources
  private skyViewRT!: THREE.WebGLRenderTarget;
  private cloudEnvRT!: THREE.WebGLRenderTarget;
  private cloudShadowRT!: THREE.WebGLRenderTarget;
  private readonly shRT: THREE.WebGLRenderTarget;
  private cloudRT: THREE.WebGLRenderTarget | null = null;
  private historyRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private historyIndex = 0;
  private historyValid = false;

  // passes
  private readonly passes: Record<string, FullscreenPass> = {};
  private readonly cloudUniforms: Record<string, THREE.IUniform>;
  private readonly dummyTex: THREE.DataTexture;

  // state
  private frame = 0;
  private lastShFrame = -1e9;
  private lastShadowFrame = -1e9;
  private shPending = false;
  private shReadOnce = false;
  private readonly shBuffer = new Float32Array(SH_TARGET_WIDTH * 4);
  private dimension: SkyParams['dimension'] = 'overworld';
  private readonly prevViewProj = new THREE.Matrix4();
  private readonly viewProj = new THREE.Matrix4();
  private readonly invViewProj = new THREE.Matrix4();
  private readonly tmpM = new THREE.Matrix4();
  private originX = 0; // unwrapped cloud-frame origin (km)
  private originZ = 0;
  private shadowGenX = 0;
  private shadowGenZ = 0;
  private readonly shadowLight = new THREE.Vector3(0, 1, 0);
  private lastTime = 0;
  private updateCount = 0;
  private lastRenderUpdate = -1;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private readonly moonDir = new THREE.Vector3(0, -1, 0);
  private coverage = 0.42;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, quality: SkyQuality = 'high') {
    this.renderer = renderer;
    this.qualityName = quality;
    this.q = SKY_QUALITY[quality];
    this.guard = new RendererStateGuard(renderer);

    this.dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.dummyTex.needsUpdate = true;

    this.transmittanceRT = makeRT(TRANSMITTANCE_LUT_SIZE[0], TRANSMITTANCE_LUT_SIZE[1]);
    this.multiScatRT = makeRT(MULTISCAT_LUT_SIZE, MULTISCAT_LUT_SIZE);
    this.weatherRT = makeRT(512, 512, {
      type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.shRT = makeRT(SH_TARGET_WIDTH, 1, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });

    const v3 = () => ({ value: new THREE.Vector3() });
    const v4 = () => ({ value: new THREE.Vector4() });
    this.uniforms = {
      atmo_transmittanceLUT: { value: this.transmittanceRT.texture },
      atmo_multiScatLUT: { value: this.multiScatRT.texture },
      atmo_skyViewLUT: { value: this.dummyTex },
      atmo_cloudEnvMap: { value: this.dummyTex },
      atmo_cloudShadowMap: { value: this.dummyTex },
      atmo_skyViewSize: { value: new THREE.Vector2(1, 1) },
      atmo_cloudEnvSize: { value: new THREE.Vector2(1, 1) },
      atmo_sunDir: { value: new THREE.Vector3(0, 1, 0) },
      atmo_moonDir: { value: new THREE.Vector3(0, -1, 0) },
      atmo_sunIlluminance: v3(),
      atmo_moonIlluminance: v3(),
      atmo_lightDir: { value: this.lightDir },
      atmo_lightColor: { value: new THREE.Vector3() },
      atmo_cameraPos: v3(),
      atmo_cameraAltKm: { value: 0.03 },
      atmo_sunTransCam: v3(),
      atmo_moonTransCam: v3(),
      atmo_fogParams: v4(),
      atmo_hazeParams: v4(),
      atmo_weather: v4(),
      atmo_dimension: { value: 0 },
      atmo_dimFogColor: v3(),
      atmo_nightGlow: { value: NIGHT_GLOW.clone() },
      atmo_cloudShadowParams: v4(),
      atmo_cloudShadowParams2: v4(),
      atmo_cloudShadowLight: { value: new THREE.Vector3(0, 1, 0) },
      atmo_ambientSH: { value: this.ambientSH },
    };
    this.cloudUniforms = {
      cl_shapeNoise: { value: null },
      cl_detailNoise: { value: null },
      cl_weatherMap: { value: this.weatherRT.texture },
      cl_layer: v4(),
      cl_origin: v4(),
      cl_shape: v4(),
      cl_lightDir: { value: new THREE.Vector3(0, 1, 0) },
      cl_lightIllum: v3(),
      cl_look: v4(),
      cl_march: v4(),
      cl_lod: v4(),
      cl_light: v4(),
    };

    this.buildPasses();
    this.allocateQualityTargets();
    this.ambientFallback();
  }

  get quality(): SkyQuality {
    return this.qualityName;
  }

  setQuality(q: SkyQuality): void {
    if (q === this.qualityName) return;
    const prevNoise = this.q.shapeNoiseSize;
    this.qualityName = q;
    this.q = SKY_QUALITY[q];
    this.disposeQualityTargets();
    this.allocateQualityTargets();
    this.disposeCloudTargets();
    if (this.q.shapeNoiseSize !== prevNoise) {
      this.shapeRT?.dispose();
      this.shapeRT = null;
      this.staticReady = false;
    }
    this.lastShFrame = -1e9;
    this.lastShadowFrame = -1e9;
  }

  // ------------------------------------------------------------------------------------------
  // per-frame update
  // ------------------------------------------------------------------------------------------

  update(params: SkyParams, camera: THREE.PerspectiveCamera, frameIndex: number): void {
    if (this.disposed) return;
    this.guard.save();
    try {
      if (!this.staticReady) this.buildStatic();
      this.frame = frameIndex;
      this.updateCount++;
      if (params.dimension !== this.dimension) {
        this.dimension = params.dimension;
        this.historyValid = false;
        this.shReadOnce = false; // next SH projection reads back synchronously
        this.lastShFrame = -1e9;
        this.lastShadowFrame = -1e9;
      }
      if (Math.abs(params.time - this.lastTime) > 30) this.historyValid = false;
      this.lastTime = params.time;

      this.updateCelestialAndLight(params);
      this.updateUniforms(params, camera);

      if (this.dimension === 'overworld') {
        this.passes.skyView.render(this.renderer, this.skyViewRT);
        this.renderCloudEnv();
        // scheduling uses the internal update counter (robust to callers passing a constant frameIndex)
        const n = this.updateCount;
        if (n - this.lastShadowFrame >= this.q.shadowEvery) {
          this.renderCloudShadow();
          this.lastShadowFrame = n;
        }
        this.updateShadowLookup(params);
        if (!this.shPending && (n - this.lastShFrame >= this.q.shEvery || !this.shReadOnce)) {
          this.lastShFrame = n;
          this.computeSH();
        }
      } else {
        this.setDimensionAmbient(params);
      }
    } finally {
      this.guard.restore();
    }
  }

  // ------------------------------------------------------------------------------------------
  // sky render
  // ------------------------------------------------------------------------------------------

  render(target: THREE.WebGLRenderTarget, depthTexture: THREE.Texture, camera: THREE.PerspectiveCamera): void {
    if (this.disposed) return;
    this.guard.save();
    try {
      if (!this.staticReady) this.buildStatic();
      camera.updateMatrixWorld();
      // rotation-only view-projection (camera-relative directions; precise far from the origin)
      this.tmpM.copy(camera.matrixWorldInverse).setPosition(0, 0, 0);
      this.viewProj.multiplyMatrices(camera.projectionMatrix, this.tmpM);
      this.invViewProj.copy(this.viewProj).invert();

      const w = target ? target.width : this.renderer.domElement.width;
      const h = target ? target.height : this.renderer.domElement.height;
      // Only the first render() after update() is the main view (volumetric clouds + temporal
      // history). Extra views in the same frame (reflections, portals) use the cloud panorama.
      const mainView = this.lastRenderUpdate !== this.updateCount;
      this.lastRenderUpdate = this.updateCount;
      let cloudMode = 0;
      let cloudTex: THREE.Texture = this.dummyTex;
      if (this.dimension === 'overworld') {
        if (!mainView) {
          cloudMode = 3;
        } else if (this.q.volumetric) {
          this.ensureCloudTargets(w, h);
          const cu = this.passes.cloud.material.uniforms;
          cu.cl_invViewProj.value.copy(this.invViewProj);
          cu.cl_res.value.set(this.cloudRT!.width, this.cloudRT!.height);
          cu.cl_depth.value = depthTexture ?? this.dummyTex;
          cu.cl_skip.value = depthTexture ? 1 : 0;
          cu.cl_frame.value = this.updateCount % 1024;
          // sub-texel jitter (Halton 2,3) so the temporal history anti-aliases the low-res edges
          const hi = (this.updateCount % 16) + 1;
          if (this.q.temporal) cu.cl_subpixel.value.set(halton(hi, 2) - 0.5, halton(hi, 3) - 0.5);
          else cu.cl_subpixel.value.set(0, 0);
          const fovY = THREE.MathUtils.degToRad(camera.fov) / Math.max(camera.zoom, 1e-3);
          this.cloudUniforms.cl_lod.value.x = (2 * Math.tan(fovY / 2)) / this.cloudRT!.height;
          this.passes.cloud.render(this.renderer, this.cloudRT);
          cloudTex = this.cloudRT!.texture;
          if (this.q.temporal && this.historyRT) {
            const src = this.historyRT[this.historyIndex];
            const dst = this.historyRT[1 - this.historyIndex];
            const tu = this.passes.temporal.material.uniforms;
            tu.tp_current.value = this.cloudRT!.texture;
            tu.tp_history.value = src.texture;
            tu.tp_invViewProj.value.copy(this.invViewProj);
            tu.tp_prevViewProj.value.copy(this.prevViewProj);
            tu.tp_res.value.set(dst.width, dst.height);
            tu.tp_blend.value = this.q.temporalBlend;
            tu.tp_valid.value = this.historyValid ? 1 : 0;
            this.passes.temporal.render(this.renderer, dst);
            this.historyIndex = 1 - this.historyIndex;
            cloudTex = dst.texture;
            this.historyValid = true;
          }
          cloudMode = 1;
        } else {
          cloudMode = 2;
        }
      }

      const sameDepth = !!target && !!depthTexture && target.depthTexture === depthTexture;
      const comp = this.passes.composite.material;
      const u = comp.uniforms;
      comp.depthTest = sameDepth;
      comp.depthFunc = THREE.LessEqualDepth;
      u.fs_z.value = sameDepth ? 1.0 : 0.0;
      u.sky_depthMode.value = sameDepth || !depthTexture ? 0 : 1;
      u.sky_fadeTerrain.value = this.fadeTerrainInSkyPass ? 1 : 0;
      u.sky_depth.value = sameDepth || !depthTexture ? this.dummyTex : depthTexture;
      u.sky_invViewProj.value.copy(this.invViewProj);
      u.sky_clouds.value = cloudTex;
      u.sky_cloudMode.value = cloudMode;
      const fovY = THREE.MathUtils.degToRad(camera.fov) / Math.max(camera.zoom, 1e-3);
      u.sky_pixelAngle.value = (2 * Math.tan(fovY / 2)) / Math.max(h, 1);
      this.passes.composite.render(this.renderer, target);

      if (mainView) this.prevViewProj.copy(this.viewProj);
    } finally {
      this.guard.restore();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of Object.values(this.passes)) p.dispose();
    this.transmittanceRT.dispose();
    this.multiScatRT.dispose();
    this.weatherRT.dispose();
    this.shapeRT?.dispose();
    this.detailRT?.dispose();
    this.shRT.dispose();
    this.disposeQualityTargets();
    this.disposeCloudTargets();
    this.dummyTex.dispose();
  }

  /** Internal textures for debug visualisation. */
  debugTextures(): Record<string, THREE.Texture | null> {
    return {
      transmittance: this.transmittanceRT.texture,
      multiScat: this.multiScatRT.texture,
      skyView: this.skyViewRT.texture,
      cloudEnv: this.cloudEnvRT.texture,
      cloudShadow: this.cloudShadowRT.texture,
      weather: this.weatherRT.texture,
      shape: this.shapeRT?.texture ?? null,
      clouds: this.cloudRT?.texture ?? null,
    };
  }

  // ------------------------------------------------------------------------------------------
  // internals
  // ------------------------------------------------------------------------------------------

  private buildPasses() {
    const U = this.uniforms;
    const C = this.cloudUniforms;
    const m4 = () => ({ value: new THREE.Matrix4() });
    this.passes.transmittance = new FullscreenPass(makePassMaterial(TRANSMITTANCE_FRAG, {}));
    this.passes.multiScat = new FullscreenPass(makePassMaterial(MULTISCAT_FRAG, { ...U }));
    this.passes.skyView = new FullscreenPass(makePassMaterial(SKYVIEW_FRAG, { ...U, sv_size: { value: new THREE.Vector2(1, 1) } }));
    this.passes.shape = new FullscreenPass(makePassMaterial(SHAPE_NOISE_FRAG, { nz_slice: { value: 0 }, nz_size: { value: 128 } }));
    this.passes.detail = new FullscreenPass(makePassMaterial(DETAIL_NOISE_FRAG, { nz_slice: { value: 0 }, nz_size: { value: 32 } }));
    this.passes.weather = new FullscreenPass(makePassMaterial(WEATHER_FRAG, { nz_size: { value: 512 } }));
    this.passes.cloud = new FullscreenPass(makePassMaterial(CLOUD_MARCH_FRAG, {
      ...U, ...C,
      cl_invViewProj: m4(), cl_res: { value: new THREE.Vector2(1, 1) }, cl_depth: { value: this.dummyTex },
      cl_skip: { value: 0 }, cl_frame: { value: 0 }, cl_subpixel: { value: new THREE.Vector2() },
    }));
    this.passes.temporal = new FullscreenPass(makePassMaterial(CLOUD_TEMPORAL_FRAG, {
      tp_current: { value: null }, tp_history: { value: null }, tp_invViewProj: m4(), tp_prevViewProj: m4(),
      tp_res: { value: new THREE.Vector2(1, 1) }, tp_blend: { value: 0.1 }, tp_valid: { value: 0 },
    }));
    this.passes.cloudEnv = new FullscreenPass(makePassMaterial(CLOUD_ENV_FRAG, {
      ...U, ...C, ce_size: { value: new THREE.Vector2(1, 1) }, ce_mode: { value: 1 }, ce_march: { value: new THREE.Vector4() },
    }));
    this.passes.cloudShadow = new FullscreenPass(makePassMaterial(CLOUD_SHADOW_FRAG, {
      ...U, ...C, cs_size: { value: new THREE.Vector2(1, 1) }, cs_params: { value: new THREE.Vector4() },
      cs_light: { value: new THREE.Vector3(0, 1, 0) },
    }));
    this.passes.sh = new FullscreenPass(makePassMaterial(SH_FRAG, {
      ...U, sh_sunGround: { value: new THREE.Vector3() }, sh_groundAlbedo: { value: 0.18 },
    }));
    this.passes.composite = new FullscreenPass(makePassMaterial(SKY_COMPOSITE_FRAG, {
      ...U, ...C,
      sky_invViewProj: m4(), sky_depth: { value: this.dummyTex }, sky_depthMode: { value: 1 },
      sky_clouds: { value: this.dummyTex }, sky_cloudMode: { value: 0 },
      sky_starRot: { value: new THREE.Matrix3() }, sky_moonLight: { value: new THREE.Vector3(0, 0, 1) },
      sky_disk: { value: new THREE.Vector4() }, sky_night: { value: new THREE.Vector4() },
      sky_pixelAngle: { value: 0.001 }, sky_fadeTerrain: { value: 1 },
    }));
    // alpha = 1 for sky pixels; fade factor for terrain in the render-distance fade zone
    const cm = this.passes.composite.material;
    cm.blending = THREE.CustomBlending;
    cm.blendEquation = THREE.AddEquation;
    cm.blendSrc = THREE.SrcAlphaFactor;
    cm.blendDst = THREE.OneMinusSrcAlphaFactor;
    cm.blendSrcAlpha = THREE.ZeroFactor;
    cm.blendDstAlpha = THREE.OneFactor;
  }

  private allocateQualityTargets() {
    const q = this.q;
    this.skyViewRT = makeRT(q.skyViewSize[0], q.skyViewSize[1], { wrapS: THREE.RepeatWrapping });
    this.cloudEnvRT = makeRT(q.envSize[0], q.envSize[1], { wrapS: THREE.RepeatWrapping });
    this.cloudShadowRT = makeRT(q.shadowSize, q.shadowSize, { type: THREE.UnsignedByteType });
    this.uniforms.atmo_skyViewLUT.value = this.skyViewRT.texture;
    this.uniforms.atmo_skyViewSize.value.set(q.skyViewSize[0], q.skyViewSize[1]);
    this.uniforms.atmo_cloudEnvMap.value = this.cloudEnvRT.texture;
    this.uniforms.atmo_cloudEnvSize.value.set(q.envSize[0], q.envSize[1]);
    this.uniforms.atmo_cloudShadowMap.value = this.cloudShadowRT.texture;
    (this.passes.skyView.material.uniforms.sv_size.value as THREE.Vector2).set(q.skyViewSize[0], q.skyViewSize[1]);
    // clear env / shadow to "no clouds"
    this.guard.save();
    try {
      const r = this.renderer;
      const prevColor = new THREE.Color();
      r.getClearColor(prevColor);
      const prevAlpha = r.getClearAlpha();
      r.setClearColor(0x000000, 1);
      r.setRenderTarget(this.cloudEnvRT);
      r.clear(true, false, false);
      r.setClearColor(0xffffff, 1);
      r.setRenderTarget(this.cloudShadowRT);
      r.clear(true, false, false);
      r.setClearColor(prevColor, prevAlpha);
    } finally {
      this.guard.restore();
    }
  }

  private disposeQualityTargets() {
    this.skyViewRT?.dispose();
    this.cloudEnvRT?.dispose();
    this.cloudShadowRT?.dispose();
  }

  private ensureCloudTargets(w: number, h: number) {
    const div = this.q.cloudDivisor;
    const cw = Math.max(1, Math.ceil(w / div));
    const ch = Math.max(1, Math.ceil(h / div));
    if (this.cloudRT && this.cloudRT.width === cw && this.cloudRT.height === ch) return;
    this.disposeCloudTargets();
    this.cloudRT = makeRT(cw, ch);
    if (this.q.temporal) this.historyRT = [makeRT(cw, ch), makeRT(cw, ch)];
    this.historyValid = false;
  }

  private disposeCloudTargets() {
    this.cloudRT?.dispose();
    this.cloudRT = null;
    if (this.historyRT) {
      this.historyRT[0].dispose();
      this.historyRT[1].dispose();
    }
    this.historyRT = null;
    this.historyValid = false;
  }

  /** LUTs that depend only on the atmosphere, and the procedural cloud noise. */
  private buildStatic() {
    const r = this.renderer;
    this.passes.transmittance.render(r, this.transmittanceRT);
    this.passes.multiScat.render(r, this.multiScatRT);

    // weather map (2D, mipmapped)
    this.weatherRT.texture.generateMipmaps = true;
    this.passes.weather.render(r, this.weatherRT);
    this.weatherRT.texture.generateMipmaps = false;

    const sN = this.q.shapeNoiseSize;
    if (!this.shapeRT) {
      this.shapeRT = this.make3D(sN);
      this.renderSlices(this.shapeRT, this.passes.shape, sN);
    }
    if (!this.detailRT) {
      this.detailRT = this.make3D(32);
      this.renderSlices(this.detailRT, this.passes.detail, 32);
    }
    this.cloudUniforms.cl_shapeNoise.value = this.shapeRT.texture;
    this.cloudUniforms.cl_detailNoise.value = this.detailRT.texture;
    this.staticReady = true;
  }

  private make3D(n: number): THREE.WebGL3DRenderTarget {
    const rt = new THREE.WebGL3DRenderTarget(n, n, n, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    rt.texture.wrapS = rt.texture.wrapT = rt.texture.wrapR = THREE.RepeatWrapping;
    return rt;
  }

  private renderSlices(rt: THREE.WebGL3DRenderTarget, pass: FullscreenPass, n: number) {
    const u = pass.material.uniforms;
    u.nz_size.value = n;
    for (let z = 0; z < n; z++) {
      u.nz_slice.value = z;
      // generate the mip chain once, after the last slice
      rt.texture.generateMipmaps = z === n - 1;
      pass.render(this.renderer, rt, z);
    }
    rt.texture.generateMipmaps = false;
  }

  private updateCelestialAndLight(p: SkyParams) {
    this.sunDir.copy(p.sunDir).normalize();
    this.moonDir.copy(p.moonDir).normalize();
    const sun = this.sunDir, moon = this.moonDir;
    const hCam = 0.02 + Math.max(p.cameraPosition.y, 0) * 0.00025; // == atmo_altitudeForY
    const Ts = transmittance(hCam, sun.y);
    const ps = planetShadow(hCam, sun.y);
    const Tm = transmittance(hCam, moon.y);
    const pm = planetShadow(hCam, moon.y);
    const phase = moonPhaseFactor(p.moonPhase);
    const mI = MOON_ILLUMINANCE * phase;

    const U = this.uniforms;
    U.atmo_sunDir.value.copy(sun);
    U.atmo_moonDir.value.copy(moon);
    U.atmo_sunIlluminance.value.setScalar(SUN_ILLUMINANCE);
    U.atmo_moonIlluminance.value.copy(MOON_TINT).multiplyScalar(mI);
    U.atmo_sunTransCam.value.set(Ts[0] * ps, Ts[1] * ps, Ts[2] * ps);
    U.atmo_moonTransCam.value.set(Tm[0] * pm, Tm[1] * pm, Tm[2] * pm);
    U.atmo_cameraAltKm.value = hCam;

    const weather = (1 - 0.5 * p.rain) * (1 - 0.4 * p.thunder);
    if (p.dimension !== 'overworld') {
      this.lightDir.set(0, 1, 0);
      this.lightColor.setRGB(0, 0, 0);
    } else if (sun.y > -0.01) {
      const f = smoothstep(-0.01, 0.03, sun.y) * ps * SUN_ILLUMINANCE * weather;
      this.lightDir.copy(sun);
      this.lightColor.setRGB(Ts[0] * f, Ts[1] * f, Ts[2] * f);
    } else {
      const f = smoothstep(0.01, 0.05, moon.y) * smoothstep(-0.01, -0.06, sun.y) * pm * mI * weather;
      this.lightDir.copy(moon);
      this.lightColor.setRGB(Tm[0] * f * MOON_TINT.x, Tm[1] * f * MOON_TINT.y, Tm[2] * f * MOON_TINT.z);
    }
    U.atmo_lightColor.value.set(this.lightColor.r, this.lightColor.g, this.lightColor.b);

    // cloud light: sun (incl. twilight when the clouds are still sunlit), else moon
    const C = this.cloudUniforms;
    if (sun.y > -0.1) {
      C.cl_lightDir.value.copy(sun);
      C.cl_lightIllum.value.setScalar(SUN_ILLUMINANCE);
    } else {
      C.cl_lightDir.value.copy(moon);
      C.cl_lightIllum.value.copy(MOON_TINT).multiplyScalar(mI * smoothstep(-0.1, -0.2, sun.y));
    }

    // composite: moon phase lighting, stars rotation, disks
    const comp = this.passes.composite.material.uniforms;
    moonLightDirection(moon, p.moonPhase, undefined, comp.sky_moonLight.value);
    starFrameRotation(sun, undefined, comp.sky_starRot.value);
    const sunSolidAngle = Math.PI * SUN_ANGULAR_RADIUS * SUN_ANGULAR_RADIUS;
    // capped far below the physical 1/solidAngle: keeps fp16/TAA sane and lets a low sun stay coloured
    const sunDisk = Math.min(1 / sunSolidAngle, 80);
    comp.sky_disk.value.set(sunDisk, MOON_ILLUMINANCE * 1.4, SUN_ANGULAR_RADIUS, MOON_ANGULAR_RADIUS);
    const night = smoothstep(-0.07, -0.24, sun.y);
    comp.sky_night.value.set(night, p.time, 0.010 * (1 + 4 * p.rain), 3.0e-4);
  }

  private updateUniforms(p: SkyParams, camera: THREE.PerspectiveCamera) {
    const U = this.uniforms;
    const C = this.cloudUniforms;
    const rain = THREE.MathUtils.clamp(p.rain, 0, 1);
    const thunder = THREE.MathUtils.clamp(p.thunder, 0, 1);
    U.atmo_cameraPos.value.copy(p.cameraPosition);
    U.atmo_weather.value.set(rain, thunder, smoothstep(0.08, -0.22, this.sunDir.y), p.time % 100000);
    U.atmo_dimension.value = p.dimension === 'overworld' ? 0 : p.dimension === 'nether' ? 1 : 2;
    U.atmo_fogParams.value.set(this.fogDistanceScale, Math.max(p.renderDistance, 16), 0.75, this.hazeDensity * (1 + 3.5 * rain) * (1 + thunder));

    let dimFogDensity = 0;
    if (p.dimension === 'nether') {
      // THREE.Color stores linear working-space values (hex input is converted on construction)
      const c = p.biomeFogColor ?? NETHER_FOG_DEFAULT;
      U.atmo_dimFogColor.value.set(c.r, c.g, c.b);
      dimFogDensity = 1 / 55;
    } else if (p.dimension === 'end') {
      const c = p.biomeFogColor ?? END_FOG_DEFAULT;
      // End sky: near-black deep purple; fog is a dim purple haze
      U.atmo_dimFogColor.value.set(c.r, c.g, c.b).multiplyScalar(0.6);
      dimFogDensity = 1 / 220;
    }
    U.atmo_hazeParams.value.set(SKY_SEA_LEVEL, this.hazeHeight, 1.0, dimFogDensity);

    // ---- clouds ----
    this.coverage = THREE.MathUtils.lerp(this.cloudCoverage, 0.97, Math.pow(rain, 0.6));
    const kmpb = CLOUD_KM_PER_BLOCK;
    const camAlt = Math.max((p.cameraPosition.y - SKY_SEA_LEVEL) * kmpb, 0.0);
    C.cl_layer.value.set((CLOUD_BASE_Y - SKY_SEA_LEVEL) * kmpb, (CLOUD_TOP_Y - SKY_SEA_LEVEL) * kmpb, camAlt, CLOUD_PLANET_RADIUS_KM);
    this.originX = p.cameraPosition.x * kmpb - this.wind.x * p.time;
    this.originZ = p.cameraPosition.z * kmpb - this.wind.y * p.time;
    C.cl_origin.value.set(
      wrap(this.originX, CLOUD_WRAP_KM),
      wrap(this.originZ, CLOUD_WRAP_KM),
      wrap(p.time * 0.0012, CLOUD_SHAPE_TILE_KM),
      wrap(p.time * 0.006, CLOUD_DETAIL_TILE_KM),
    );
    const L = this.cloudLook;
    // overcast layers are much denser in the noise remap; lower the per-density extinction so the
    // whole deck has a physical optical depth (~30-60) instead of hundreds
    const overcast = Math.pow(rain, 0.7);
    C.cl_shape.value.set(this.coverage, L.viewSigma * (1 - 0.5 * overcast), L.detail, L.spread * (1 - 0.5 * rain));
    C.cl_light.value.set(L.lightSigma * (1 - 0.65 * overcast), L.diffDecay, L.diffAmp, 0);
    C.cl_look.value.set(L.aerial + 0.04 * rain, L.ambient, Math.min(0.55 * rain + 0.25 * thunder, 0.8), L.multiScatter);
    C.cl_march.value.set(this.q.stepsMin, this.q.stepsMax, this.q.lightSteps, 70);
    // x (pixel angle of the main cloud pass) is set in render()
    C.cl_lod.value.set(C.cl_lod.value.x || 0.002, this.q.shapeNoiseSize, 32, this.q.detail ? 22 : 0);
  }

  private renderCloudEnv() {
    const u = this.passes.cloudEnv.material.uniforms;
    u.ce_size.value.set(this.q.envSize[0], this.q.envSize[1]);
    u.ce_mode.value = this.q.volumetric ? 1 : 2;
    u.ce_march.value.set(this.q.envSteps, Math.round(this.q.envSteps * 1.6), 3, 0);
    this.passes.cloudEnv.render(this.renderer, this.cloudEnvRT);
  }

  private shadowExtentKm() {
    const rd = this.uniforms.atmo_fogParams.value.y as number;
    return 2 * Math.max(rd * 1.3, 160) * CLOUD_KM_PER_BLOCK;
  }

  private renderCloudShadow() {
    const L = this.lightDir;
    this.shadowLight.set(L.x, Math.max(L.y, 0.25), L.z).normalize();
    const u = this.passes.cloudShadow.material.uniforms;
    u.cs_size.value.set(this.q.shadowSize, this.q.shadowSize);
    u.cs_params.value.set(this.shadowExtentKm(), this.q.volumetric ? 10 : 1, 0.55, this.q.volumetric ? 1 : 2);
    u.cs_light.value.copy(this.shadowLight);
    this.passes.cloudShadow.render(this.renderer, this.cloudShadowRT);
    this.shadowGenX = this.originX;
    this.shadowGenZ = this.originZ;
    this.uniforms.atmo_cloudShadowLight.value.copy(this.shadowLight);
  }

  private updateShadowLookup(p: SkyParams) {
    const U = this.uniforms;
    const ext = this.shadowExtentKm();
    const fade = smoothstep(0.0, 0.12, this.lightDir.y);
    U.atmo_cloudShadowParams.value.set(this.originX - this.shadowGenX, this.originZ - this.shadowGenZ, 1 / ext, this.cloudShadowStrength * fade);
    const C = this.cloudUniforms.cl_layer.value as THREE.Vector4;
    U.atmo_cloudShadowParams2.value.set(0.5 * (C.x + C.y), CLOUD_KM_PER_BLOCK, 1 - 0.55 * this.coverage, 0);
  }

  private computeSH() {
    const u = this.passes.sh.material.uniforms;
    const lc = this.lightColor;
    const vis = 1 - 0.55 * this.coverage;
    u.sh_sunGround.value.set(lc.r, lc.g, lc.b).multiplyScalar(Math.max(this.lightDir.y, 0) * vis);
    this.passes.sh.render(this.renderer, this.shRT);
    const r = this.renderer as THREE.WebGLRenderer & { readRenderTargetPixelsAsync?: Function };
    if (!this.shReadOnce || typeof r.readRenderTargetPixelsAsync !== 'function') {
      r.readRenderTargetPixels(this.shRT, 0, 0, SH_TARGET_WIDTH, 1, this.shBuffer);
      this.applySH(this.shBuffer);
      this.shReadOnce = true;
    } else {
      this.shPending = true;
      const buf = new Float32Array(SH_TARGET_WIDTH * 4);
      (r.readRenderTargetPixelsAsync(this.shRT, 0, 0, SH_TARGET_WIDTH, 1, buf) as Promise<unknown>)
        .then(() => {
          if (!this.disposed && this.dimension === 'overworld') this.applySH(buf);
        })
        .catch(() => {})
        .finally(() => {
          this.shPending = false;
        });
    }
  }

  private applySH(b: Float32Array) {
    for (let i = 0; i < 9; i++) {
      const r = b[i * 4], g = b[i * 4 + 1], bl = b[i * 4 + 2];
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(bl)) this.ambientSH[i].set(r, g, bl);
    }
    const fr = b[36], fg = b[37], fb = b[38];
    if (Number.isFinite(fr)) this.fogColor.setRGB(fr, fg, fb);
  }

  private setConstantAmbient(r: number, g: number, b: number) {
    // constant irradiance E -> c0 = E / Y00
    this.ambientSH[0].set(r, g, b).multiplyScalar(1 / 0.282095);
    for (let i = 1; i < 9; i++) this.ambientSH[i].set(0, 0, 0);
  }

  private setDimensionAmbient(p: SkyParams) {
    const fc = this.uniforms.atmo_dimFogColor.value as THREE.Vector3;
    if (p.dimension === 'nether') {
      this.setConstantAmbient(0.42, 0.24, 0.17);
      // slight top/bottom variation: warmer from below (lava glow)
      this.ambientSH[1].set(-0.06, -0.03, -0.02);
    } else {
      this.setConstantAmbient(0.13, 0.1, 0.17);
    }
    this.fogColor.setRGB(fc.x, fc.y, fc.z);
    this.uniforms.atmo_cloudShadowParams.value.w = 0;
  }

  /** Rough initial ambient before the first GPU projection. */
  private ambientFallback() {
    this.setConstantAmbient(2.0, 2.4, 3.0);
  }
}

/** Evaluates `ambientSH` (irradiance) for a normal, same basis as GLSL atmo_ambient(). */
export function evalAmbientSH(sh: THREE.Vector3[], n: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const { x, y, z } = n;
  out.set(0, 0, 0)
    .addScaledVector(sh[0], 0.282095)
    .addScaledVector(sh[1], 0.488603 * y)
    .addScaledVector(sh[2], 0.488603 * z)
    .addScaledVector(sh[3], 0.488603 * x)
    .addScaledVector(sh[4], 1.092548 * x * y)
    .addScaledVector(sh[5], 1.092548 * y * z)
    .addScaledVector(sh[6], 0.315392 * (3 * z * z - 1))
    .addScaledVector(sh[7], 1.092548 * x * z)
    .addScaledVector(sh[8], 0.546274 * (x * x - y * y));
  return out.set(Math.max(out.x, 0), Math.max(out.y, 0), Math.max(out.z, 0));
}

export { CLOUD_SHAPE_TILE_KM, CLOUD_DETAIL_TILE_KM };
