// The whole world the game is played in (see DESIGN.md §1–2, §9):
//   backdrop (sky, far sea, burning town, lighthouse) drawn behind the scene,
//   the gameplay sea, the pier deck (blood decals), pier dressing, lamps,
//   the cargo crane, the ferry with its gangway and boarding queue, gulls,
//   the lighthouse beam crossing the deck, embers, and every light, fog and
//   post-processing value following the time of day.
//
// Usage (game view):
//   const env = new Environment(stage, { quality: 'high' });   // after the Stage, before anything else draws
//   env.setDecalMap(blood.texture, DECAL_RECT);
//   blood.isOnFloe = debris.isOnFloe = (x, z) => env.isOnDeck(x, z);
//   env.setTimeOfDay(world.timeOfDay, true);                     // snap once at start (env.settle())
//   every frame: env.setTimeOfDay(world.timeOfDay); env.setCrane(world.crane.state, world.crane.stateTime);
//                env.setBoarding(world.boarded, world.passengers); env.update(dt, time);
//   events: horn → env.ferryHorn(); cannonStrike → env.ferryGunRecoil(target) per shell + muzzle
//           = env.ferryGunMuzzle(); shot → env.scareGulls(muzzle.x, muzzle.z, 1);
//           explosion → env.scareGulls(x, z, 3), env.flashScreen(0.15); victory → ramp env.setDeparture(0→1).
//   Scale effect lights with env.lightRig.darkness (muzzle flashes / flares read stronger at night).
// The backdrop is drawn through stage.onBeforeMainRender; the wet-deck reflection
// through stage.onPreRender (high/medium quality).
import * as THREE from 'three';
import { DECAL_RECT, FERRY, PIER } from '../../config/world';
import { CAMERA_FOV } from '../../config/view';
import type { CraneState } from '../../core/events';
import { REFLECT_LAYER, type Stage } from '../Stage';
import { Backdrop, MOON_TAN, MOON_U, SUN_U, backdropDir } from './Backdrop';
import { Crane } from './Crane';
import { DECK_X0, buildDeckGeometry, createDeckMaterial, createDeckUniforms, type DeckUniforms } from './Deck';
import { Ferry } from './Ferry';
import { createEnvMaterials, type EnvMaterials } from './geo';
import { NOISE_GLSL, SKY_FN_GLSL, SKY_PARS_GLSL, createSkyUniforms, v3, type SkyUniforms } from './glsl';
import { Gulls } from './Gulls';
import { Glows, Lamps } from './Lamps';
import { LighthouseBeam } from './LighthouseBeam';
import { Atmosphere } from './Atmosphere';
import { PlanarReflection } from './PlanarReflection';
import { buildPier, type PierBuild } from './Pier';
import { bakeFoamMap, createMainSea, createSeaUniforms, type MainSeaUniforms, type SeaUniforms } from './Sea';
import { setRGB, todAt, type TodState } from './tod';

export type EnvQuality = 'low' | 'medium' | 'high';

export interface DecalRect {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
}

/** Lighting values other systems may read (effects, characters, UI tint). */
export interface LightRig {
  /** The key light (sun at dusk → moon at night); casts the shadows. */
  key: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Unit vector toward the key light. */
  keyDir: THREE.Vector3;
  /** Linear ambient colour (hemisphere sky × intensity). */
  ambientColor: THREE.Color;
  /** Linear fog colour. */
  fogColor: THREE.Color;
  /** 0 at sunset … 1 deep night: scale muzzle-flash / flare light with this. */
  darkness: number;
  /** Sodium lamp colour (linear) and current lamps level 0..1. */
  lampColor: THREE.Color;
  lamps: number;
}

interface QualitySettings {
  /** Planar reflection of characters in wet planks: render scale (0 = off). */
  reflection: number;
  shadowMapSize: number;
  shadowRadius: number;
  envSize: number;
  gulls: number;
  embers: number;
}

const QUALITY: Record<EnvQuality, QualitySettings> = {
  low: { reflection: 0, shadowMapSize: 1024, shadowRadius: 2, envSize: 64, gulls: 8, embers: 120 },
  medium: { reflection: 0.35, shadowMapSize: 2048, shadowRadius: 3, envSize: 128, gulls: 12, embers: 260 },
  high: { reflection: 0.5, shadowMapSize: 2048, shadowRadius: 3, envSize: 128, gulls: 16, embers: 420 },
};

/** Region the key light's shadow map covers (world) incl. the water in front of the pier. */
const SHADOW_BOX = new THREE.Box3(new THREE.Vector3(-27, -2.7, -10), new THREE.Vector3(26, 11, 17));

const ENV_SKY_FRAG = /* glsl */ `
  ${SKY_PARS_GLSL}
  uniform vec3 uSeaDeep;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${SKY_FN_GLSL}
  void main() {
    vec3 d = normalize(vWorld);
    vec3 c = d.y >= 0.0 ? skyPhysical(d) : mix(uHorizon * 0.35, uSeaDeep * 2.0, smoothstep(0.0, -0.4, d.y));
    // A soft sun / moon blob so glossy things catch them.
    c += uSunDisc * 0.004 * pow(max(dot(d, normalize(vec3(uSunDir.x, max(uSunDir.y, 0.0) + 0.15, uSunDir.z))), 0.0), 60.0);
    c += vec3(0.5, 0.6, 0.8) * uMoon * 0.12 * pow(max(dot(d, normalize(uMoonDir + vec3(0.0, 0.5, 0.0))), 0.0), 400.0);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Environment {
  readonly quality: EnvQuality;
  readonly waterLevel = PIER.waterY;
  /** Everything this class adds to the stage scene. */
  readonly group = new THREE.Group();
  readonly backdrop: Backdrop;
  readonly lightRig: LightRig;
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: SkyUniforms;
  readonly mats: EnvMaterials;
  readonly deck: THREE.Mesh;
  readonly deckUniforms: DeckUniforms;
  readonly sea: THREE.Mesh;
  readonly seaUniforms: MainSeaUniforms;
  readonly pier: PierBuild;
  readonly lamps: Lamps;
  readonly glows: Glows;
  readonly crane: Crane;
  readonly ferry: Ferry;
  readonly gulls: Gulls;
  readonly beam: LighthouseBeam;
  readonly atmosphere: Atmosphere;
  /** Wet-deck reflection pass (null on low quality). */
  readonly reflection: PlanarReflection | null;
  /** Town fire glow on the left of the deck. */
  readonly fireLight: THREE.PointLight;
  /** Current palette. */
  tod: TodState;
  private timeOfDay = 0;
  private appliedT = -1;
  private envT = -1;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envScene: THREE.Scene;
  private pmrem: THREE.PMREMGenerator;
  private fog: THREE.Fog;
  private seaU: SeaUniforms;
  private emptyDecal: THREE.DataTexture;
  private settings: QualitySettings;
  private disposed = false;
  private lastDt = 0;
  /** Lighthouse rotation (rad). */
  private beamAngle = 0.4;
  /** Extra flash requested for the post chain (cannon etc.), decays. */
  private flash = 0;
  private readonly _v = new THREE.Vector3();

  constructor(
    private stage: Stage,
    opts: { quality?: EnvQuality } = {},
  ) {
    this.quality = opts.quality ?? 'high';
    this.settings = QUALITY[this.quality];
    const { renderer, scene } = stage;
    this.group.name = 'Environment';
    scene.add(this.group);
    this.tod = todAt(0);
    this.mats = createEnvMaterials();

    // ---- lights ------------------------------------------------------------
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.name = 'KeyLight';
    this.sun.castShadow = true;
    const sh = this.sun.shadow;
    sh.mapSize.set(this.settings.shadowMapSize, this.settings.shadowMapSize);
    sh.radius = this.settings.shadowRadius;
    sh.bias = -0.0005;
    sh.normalBias = 0.035;
    this.sun.target.position.set(0, 0, 0);
    this.group.add(this.sun, this.sun.target);
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 46, 1.2);
    this.fireLight.position.set(-38, 7, -9);
    this.group.add(this.fireLight);
    this.lightRig = {
      key: this.sun,
      hemi: this.hemi,
      keyDir: new THREE.Vector3(0, 1, 0),
      ambientColor: new THREE.Color(),
      fogColor: new THREE.Color(),
      darkness: 0,
      lampColor: new THREE.Color(1.0, 0.52, 0.16),
      lamps: 0,
    };
    this.fog = new THREE.Fog(0x000000, 60, 250);
    scene.fog = this.fog;

    // ---- shared uniforms ---------------------------------------------------------
    this.sky = createSkyUniforms();
    this.seaU = createSeaUniforms();
    this.sky.uSunDir.value.copy(backdropDir(SUN_U, 0.0));
    this.sky.uMoonDir.value.copy(new THREE.Vector3((MOON_U - 0.5) * 2 * Math.tan((CAMERA_FOV / 2) * (Math.PI / 180)) * (16 / 9), MOON_TAN, -1).normalize());

    // ---- backdrop -------------------------------------------------------------------
    this.backdrop = new Backdrop(this.sky, this.seaU, this.quality);
    stage.onBeforeMainRender(() => {
      if (!this.disposed) this.backdrop.render(renderer, stage.mainTarget);
    });

    // ---- deck --------------------------------------------------------------------------
    const deckBuild = buildDeckGeometry();
    this.emptyDecal = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.emptyDecal.needsUpdate = true;
    this.deckUniforms = createDeckUniforms();
    this.deckUniforms.uDecalMap.value = this.emptyDecal;
    this.reflection = this.settings.reflection > 0 ? new PlanarReflection(this.settings.reflection) : null;
    if (this.reflection) {
      this.deckUniforms.uReflMap.value = this.reflection.target.texture;
      this.deckUniforms.uReflMatrix.value = this.reflection.textureMatrix;
      let frames = 0;
      stage.onPreRender(() => {
        // Skip the very first frame: the key light's shadow map does not exist yet.
        if (!this.disposed && this.reflection && frames++ > 0) this.reflection.render(renderer, scene, stage.camera);
      });
    }
    this.deck = new THREE.Mesh(deckBuild.geo, createDeckMaterial(this.deckUniforms, { reflections: !!this.reflection }));
    this.deck.name = 'Deck';
    this.deck.receiveShadow = true;
    this.deck.castShadow = false;
    this.group.add(this.deck);
    // Invisible solid slab under the boards: the deck's shadow on the water without light leaking through the seams.
    {
      const len = PIER.maxX - DECK_X0;
      const slabMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, PIER.maxZ - PIER.minZ + 0.2), slabMat);
      slab.position.set(DECK_X0 + len / 2, -0.09, 0);
      slab.castShadow = true;
      slab.name = 'DeckShadowSlab';
      this.group.add(slab);
    }

    // ---- pier dressing, lamps, glows ---------------------------------------------------------
    this.glows = new Glows(96);
    this.group.add(this.glows.points);
    this.pier = buildPier(this.mats, deckBuild.holes);
    this.group.add(this.pier.group);
    for (const g of this.pier.glows) this.glows.add(g.p, g.color, g.size);
    this.lamps = new Lamps(this.mats, this.glows, this.quality);
    this.group.add(this.lamps.group);

    // ---- sea ------------------------------------------------------------------------------------
    const foam = bakeFoamMap(this.pier.pilings, FERRY.hullX + 0.4);
    const sea = createMainSea(this.sky, this.seaU, foam);
    this.sea = sea.mesh;
    this.seaUniforms = sea.uniforms;
    this.group.add(this.sea);

    // ---- set pieces --------------------------------------------------------------------------------
    this.crane = new Crane(this.mats, this.glows, this.quality);
    this.group.add(this.crane.group);
    this.ferry = new Ferry(this.mats, this.glows, this.quality);
    this.group.add(this.ferry.group);
    this.beam = new LighthouseBeam(this.quality);
    this.group.add(this.beam.group);
    this.atmosphere = new Atmosphere(this.settings.embers);
    this.group.add(this.atmosphere.group);
    this.gulls = new Gulls(this.settings.gulls, [...this.pier.perches, ...this.lamps.perches, ...this.crane.perches]);
    this.group.add(this.gulls.group);
    // Lights also live on the reflection layer so the mirrored pass is lit the same way.
    this.group.traverse((o) => {
      if ((o as THREE.Light).isLight) o.layers.enable(REFLECT_LAYER);
    });

    // ---- environment map (PMREM of the sky, refreshed as the time of day moves) ------------------
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      uniforms: { ...this.sky, uSeaDeep: this.seaU.uSeaDeep },
      vertexShader: /* glsl */ `varying vec3 vWorld; void main() { vWorld = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: ENV_SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat));

    stage.onResize(() => this.resize());
    this.applyTimeOfDay(true);
  }

  // =================================================================== public API

  /**
   * Time of day 0 (sunset, ch.1) → 1 (deep night, end of ch.3). Applied in
   * update(), easing over ~1 s when it jumps; `immediate` snaps to it.
   */
  setTimeOfDay(t: number, immediate = false): void {
    this.timeOfDay = Math.min(1, Math.max(0, t));
    if (immediate) this.settle();
  }

  /** Snap every transition (time of day, lamp warm-up) to its target now (after loading / for screenshots). */
  settle(): void {
    this.applyTimeOfDay(true);
    this.lamps.snap(this.tod.lamps);
  }

  get timeOfDayValue(): number {
    return this.timeOfDay;
  }

  /** Blood/scorch decal texture (premultiplied RGBA) covering `rect` (use DECAL_RECT). */
  setDecalMap(tex: THREE.Texture | null, rect: DecalRect = DECAL_RECT): void {
    this.deckUniforms.uDecalMap.value = tex ?? this.emptyDecal;
    this.deckUniforms.uDecalRect.value.set(rect.minX, rect.minZ, rect.sizeX, rect.sizeZ);
    const img = tex?.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) this.deckUniforms.uDecalTexel.value.set(1 / img.width, 1 / img.height);
  }

  /** True when (x, z) is on the pier deck (blood lands, debris rests); else it falls into the sea. */
  isOnDeck(x: number, z: number): boolean {
    return x >= DECK_X0 && x <= PIER.maxX && z >= PIER.minZ - 0.05 && z <= PIER.maxZ + 0.05;
  }

  /** Crane state from the logic (call every frame or on change). */
  setCrane(state: CraneState, stateTime = 0): void {
    this.crane.setState(state, stateTime);
  }

  /** World position of the crane's hook block (centre). */
  craneHookPosition(out = new THREE.Vector3()): THREE.Vector3 {
    return this.crane.hookPosition(out);
  }

  /** Boarding progress (cosmetic queue). */
  setBoarding(boarded: number, total: number): void {
    this.ferry.setBoarding(boarded, total);
  }

  /** The ferry horn: steam from the whistle, lights flash, survivors cheer, gulls scatter. */
  ferryHorn(): void {
    this.ferry.horn();
    this.gulls.scare(10, 0, 3);
  }

  /** Victory sequence 0..1: the ferry pulls away and sails off toward the moon path. */
  setDeparture(t: number): void {
    this.ferry.setDeparture(t);
    this.backdrop.departure = Math.min(1, Math.max(0, (t - 0.5) / 0.5));
  }

  /** World position of the ferry's deck-gun muzzle (cannon strike origin). */
  ferryGunMuzzle(out = new THREE.Vector3()): THREE.Vector3 {
    return this.ferry.gunMuzzle(out);
  }

  /** Kick the deck gun's barrel back (one shell). Optional target to train the gun on first. */
  ferryGunRecoil(target?: { x: number; y: number; z: number }): void {
    if (target) this.ferry.aimGun(target.x, target.y, target.z);
    this.ferry.recoil();
  }

  /** Slew the deck gun toward a world point (smoothly). */
  ferryGunAim(x: number, y: number, z: number): void {
    this.ferry.aimGun(x, y, z);
  }

  /** Gulls near (x, z) take off; strength scales the radius (1 ≈ a gunshot, 3 = horn / explosion). */
  scareGulls(x: number, z: number, strength = 1): void {
    this.gulls.scare(x, z, strength);
  }

  /** A full-screen flash added after tone mapping (0..1), decays quickly. */
  flashScreen(amount: number, color?: THREE.ColorRepresentation): void {
    this.flash = Math.max(this.flash, amount);
    if (color !== undefined) this.stage.post.flashColor.set(color);
  }

  /** Per-frame update. */
  update(dt: number, time: number): void {
    if (this.disposed) return;
    this.lastDt = dt;
    this.applyTimeOfDay(false);
    const p = this.tod;
    this.sky.uTime.value = time;
    this.deckUniforms.uTime.value = time;
    // Lighthouse: two beams, one revolution every 22 s.
    this.beamAngle += dt * ((Math.PI * 2) / 22);
    const night = this.lightRig.darkness;
    this.backdrop.update(dt, time, { lighthouse: p.lighthouse, beamAngle: this.beamAngle, windows: p.windows }, this.backdropPalette());
    this.beam.update(dt, time, this.beamAngle, this.backdrop.lighthouseYawToCamera, p.lighthouse, night);
    this.lamps.update(dt, time, p.lamps, 0.25 + 0.75 * night);
    this.lightRig.lamps = p.lamps;
    // Town fire light flicker.
    const fl = 0.75 + 0.15 * Math.sin(time * 9.1) + 0.1 * Math.sin(time * 23.7 + 1.3);
    this.fireLight.intensity = 140 * p.fireLight * fl;
    this.crane.update(dt, time, p.lamps);
    this.ferry.update(dt, time, p.windows, night);
    const wash = this.ferry.wash;
    this.seaUniforms.uHullWake.value.set(wash.x, wash.strength * 0.9);
    this.gulls.update(dt, time);
    this.atmosphere.update(dt, time, night, p.fireLight, this.fog.color);
    // Screen flash (flashScreen) decays.
    this.flash = Math.max(0, this.flash - dt * 3.5);
    this.stage.post.flash = this.flash * 0.6;
  }

  dispose(): void {
    this.disposed = true;
    const scene = this.stage.scene;
    if (scene.fog === this.fog) scene.fog = null;
    if (this.envTarget && scene.environment === this.envTarget.texture) scene.environment = null;
    scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat.dispose();
      }
    });
    this.sun.shadow.map?.dispose();
    this.backdrop.dispose();
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.reflection?.dispose();
    this.emptyDecal.dispose();
  }

  // =================================================================== internals

  private backdropPalette() {
    const p = this.tod;
    const k = this._pal;
    v3(k.haze, p.haze);
    v3(k.ambient, p.hemiSky, 0.25 * p.hemiIntensity);
    k.ambient.add(this._v.set(p.townGlow[0], p.townGlow[1], p.townGlow[2]).multiplyScalar(0.02));
    v3(k.rim, p.keyColor, Math.min(1.2, p.keyIntensity * 0.2) * (1 - this.lightRig.darkness));
    v3(k.smokeLit, p.cloudLit, 0.32);
    k.smokeLit.add(this._v.set(0.03, 0.03, 0.035));
    v3(k.smokeDark, p.cloudDark, 0.75);
    k.fire = p.fireLight;
    k.sunSide = 1 - this.lightRig.darkness;
    return k;
  }
  private _pal = {
    haze: new THREE.Vector3(),
    ambient: new THREE.Vector3(),
    rim: new THREE.Vector3(),
    smokeLit: new THREE.Vector3(),
    smokeDark: new THREE.Vector3(),
    fire: 1,
    sunSide: 1,
  };

  private applyTimeOfDay(force: boolean): void {
    // Ease toward the requested time so jumps (chapter changes) blend over ~1.5 s.
    const target = this.timeOfDay;
    let t = this.appliedT < 0 || force ? target : this.appliedT;
    if (!force && this.appliedT >= 0) {
      const d = target - t;
      const step = Math.max(Math.abs(d) * Math.min(1, this.lastDt * 2.5), this.lastDt * 0.004);
      t = Math.abs(d) <= step ? target : t + Math.sign(d) * step;
    }
    if (!force && Math.abs(t - this.appliedT) < 1e-5) return;
    this.appliedT = t;
    const p = (this.tod = todAt(t, this.tod));
    const s = this.sky;
    v3(s.uZenith.value, p.zenith);
    v3(s.uUpper.value, p.upper);
    v3(s.uLower.value, p.lower);
    v3(s.uHorizon.value, p.horizon);
    v3(s.uSunGlow.value, p.sunGlow);
    s.uSunGlowWidth.value = p.sunGlowWidth;
    v3(s.uSunDisc.value, p.sunDisc);
    v3(s.uCloudLit.value, p.cloudLit);
    v3(s.uCloudDark.value, p.cloudDark);
    s.uCloudCover.value = p.cloudCover;
    s.uStars.value = p.stars;
    s.uMoon.value = p.moon;
    v3(s.uTownGlow.value, p.townGlow);
    v3(s.uHaze.value, p.haze);
    // Sun sinks along its azimuth.
    {
      const d = backdropDir(SUN_U, 0.0);
      const tanX = d.x / -d.z;
      s.uSunDir.value.set(tanX, p.sunElev, -1).normalize();
    }
    v3(this.seaU.uSeaDeep.value, p.seaDeep);
    v3(this.seaU.uSeaShallow.value, p.seaShallow);
    this.seaU.uGlitter.value = p.glitter;
    this.seaUniforms.uFoamCol.value.set(0.42, 0.44, 0.47).multiplyScalar(0.35 + 0.65 * (1 - Math.min(1, t * 1.3)));

    // Key light.
    const el = (p.keyElev * Math.PI) / 180;
    const az = (p.keyAz * Math.PI) / 180;
    const dir = this.lightRig.keyDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    setRGB(this.sun.color, p.keyColor);
    this.sun.intensity = p.keyIntensity;
    this.sun.shadow.intensity = p.shadowIntensity;
    this.sun.position.copy(this.sun.target.position).addScaledVector(dir, 60);
    this.sun.updateMatrixWorld();
    this.sun.target.updateMatrixWorld();
    this.fitShadowCamera();
    setRGB(this.hemi.color, p.hemiSky);
    setRGB(this.hemi.groundColor, p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.lightRig.ambientColor.copy(this.hemi.color).multiplyScalar(p.hemiIntensity);
    setRGB(this.fog.color, p.fog);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
    this.lightRig.fogColor.copy(this.fog.color);
    this.lightRig.darkness = Math.min(1, Math.max(0, (t - 0.25) / 0.45));
    this.seaUniforms.uSeaDirK.value = 0.1 - 0.07 * this.lightRig.darkness;
    this.deckUniforms.uDeckDirSpec.value = 0.6 - 0.55 * this.lightRig.darkness;
    this.deckUniforms.uPudEnv.value = 0.55 - 0.4 * this.lightRig.darkness;
    this.stage.scene.environmentIntensity = p.envIntensity;
    this.deckUniforms.uWetness.value = 0.45 + 0.4 * t;

    // Post grade.
    const post = this.stage.post;
    post.exposure = p.exposure;
    post.bloomStrength = p.bloom;
    post.bloomThreshold = p.bloomThreshold;
    post.saturation = p.saturation;
    post.contrast = p.contrast;
    setRGB(post.shadowTint, p.shadowTint);
    setRGB(post.highlightTint, p.highlightTint);
    setRGB(post.lift, p.lift);
    post.vignette = p.vignette;
    this.stage.renderer.toneMappingExposure = p.exposure;

    // Environment map: refresh when the palette has moved enough.
    if (force || Math.abs(t - this.envT) > 0.025) this.refreshEnvMap(t);
  }

  private refreshEnvMap(t: number): void {
    this.envT = t;
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 100, { size: this.settings.envSize });
    this.stage.scene.environment = this.envTarget.texture;
    old?.dispose();
  }

  private resize(): void {
    const size = this.stage.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.seaUniforms.uRes.value.set(size.x, size.y);
    if (this.reflection) {
      this.reflection.setSize(size.x, size.y);
      this.deckUniforms.uReflTexel.value.set(1 / this.reflection.target.width, 1 / this.reflection.target.height);
    }
    this.glows.setViewport(size.y, CAMERA_FOV);
    this.atmosphere.setViewport(size.y, CAMERA_FOV);
  }

  /** Fit the key light's orthographic shadow camera tightly around SHADOW_BOX. */
  private fitShadowCamera(): void {
    const cam = this.sun.shadow.camera;
    const view = new THREE.Matrix4().lookAt(this.sun.position, this.sun.target.position, new THREE.Vector3(0, 1, 0));
    view.setPosition(this.sun.position);
    const inv = view.clone().invert();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const p = new THREE.Vector3();
    const box = SHADOW_BOX;
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      p.applyMatrix4(inv);
      min.min(p);
      max.max(p);
    }
    cam.left = min.x;
    cam.right = max.x;
    cam.bottom = min.y;
    cam.top = max.y;
    cam.near = Math.max(0.5, -max.z - 5);
    cam.far = -min.z + 5;
    cam.updateProjectionMatrix();
  }
}
