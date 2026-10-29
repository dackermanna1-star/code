// Golden-hour lighting: a low west-south-west sun with one fitted shadow map through the
// windows, a hemispheric sky fill, and the interior lights owned by `light` features
// (clustered forward+ shading, flicker, mains power, point-light shadows for the fixtures
// nearest the player).
//
// Interior lights (docs/api-notes/rendering-lighting-post.md §2): every supported point/spot
// light joins ONE ClusteredLightContainer, which occupies a single light slot of every
// material regardless of how many bulbs exist (the open-plan kitchen/living/foyer alone has
// 12+). Clustered lights ignore include/exclude lists and `setEnabled(false)`, so power cuts
// and flicker drive `intensity` (0 = off), every light gets a finite `range`, and PBR
// receivers are switched to glTF falloff (smooth window to 0 at `range`, no tile seams).
// Up to `quality.pointShadows` lights nearest the camera leave the cluster to cast cube
// shadows (a light with a ShadowGenerator cannot be clustered) and rejoin it when demoted.
// If clustering is unsupported (no float colour blending), the lights stay ordinary scene
// lights and only the few nearest the camera are shaded (the others are masked out of every
// mesh with `excludeWithLayerMask`, so the owner's own enable flag is never touched).
//
// Light budget: Standard/PBR shade at most `maxSimultaneousLights` (default 4) lights and
// silently drop the rest. Sun + sky + cluster use 3; every shadowed point light (Ultra: 2)
// or fallback light needs one more slot. Whenever that exceeds 4, every lit material in the
// scene (and every material added later) is raised to the required count (≤ 6, well under
// the vertex UBO limit, notes §2.1); otherwise a shadowed bulb would vanish entirely on
// materials still at 4.
//
// Sun shadows: one ShadowGenerator (a CSM doubles the caster draws, notes §1.2) with a
// fixed orthographic frustum fitted to the apartment in light space (shadowOrthoScale 0: no
// hidden 20 % padding): no per-frame refit, no shimmer, 9 × 4 mm texels at 2048. Its
// depth range extends upstream so the balconies and slab edges of the tower outside the
// windows still occlude. The map is cached: it only
// re-renders when a caster moved, was added/removed, or `invalidateShadows()` was called;
// point-light cube maps only re-render for casters within that light's reach. A slow
// round-robin safety refresh (one map per tick) catches in-place geometry edits, so a
// settled room costs at most one shadow map every couple of seconds.

import {
  ClusteredLightContainer,
  Color3,
  DirectionalLight,
  HemisphericLight,
  Matrix,
  PointLight,
  RenderTargetTexture,
  ShadowGenerator,
  ShadowLight,
  SpotLight,
  Vector3,
  type AbstractMesh,
  type Light,
  type Material,
  type Nullable,
  type Observer,
  type Scene,
  type SubMesh,
} from "@babylonjs/core";
import type { QualityPreset, Settings } from "../core/settings.ts";
import type { ILighting } from "./contracts.ts";
import { ROOMS, type RoomId } from "../world/plan.ts";
import { nearestRoom } from "./env/roomGraph.ts";
import { SUN_COLOR_HEX, SUN_LIGHT_DIR, TO_SUN, hexToLinear } from "./env/sunModel.ts";
import { noise1 } from "./env/noise.ts";

/** Receiver bounds the sun shadow map must cover (apartment + balcony, furniture up to ~2 m). */
export const SHADOW_BOUNDS = { min: { x: -1.5, y: -0.3, z: -2.0 }, max: { x: 14.3, y: 3.4, z: 10.2 } } as const;

/** Tunable look / behaviour parameters (exposed for integration tweaks). */
export interface LightingTuning {
  /** Sun illuminance multiplier (HDR, linear). */
  sunIntensity: number;
  /** Sky fill intensity. */
  skyIntensity: number;
  /** Linear sky (zenith-facing) fill colour. */
  skyColor: [number, number, number];
  /** Linear ground-bounce fill colour (lights ceilings / undersides). */
  groundColor: [number, number, number];
  /** Sun shadow bias (normalised light depth) and normal bias (world units, scaled by texel). */
  shadowBias: number;
  shadowNormalBias: number;
  /** Extra shadow-caster depth (m) upstream of the receiver box (neighbouring balconies, slabs above). */
  casterMargin: number;
  /** Multiplier applied to every interior light's nominal intensity. */
  interiorGain: number;
  /** Range (m) given to interior lights created without a finite range. */
  defaultRange: number;
  /** Cache the sun shadow map between caster movements (false = re-render every frame). */
  staticShadowCache: boolean;
  /**
   * Safety refresh period (s) of the cached shadow maps (catches in-place geometry edits).
   * Each tick re-renders ONE map, round-robin over the sun and the point-light cube maps.
   */
  maxShadowAge: number;
  /** Interior lights with a smaller range never cast point shadows (LED strips, hood lamps). */
  pointShadowMinRange: number;
}

export const DEFAULT_TUNING: LightingTuning = {
  sunIntensity: 7.0,
  skyIntensity: 1.0,
  skyColor: [0.52, 0.56, 0.66],
  groundColor: [0.58, 0.44, 0.32],
  shadowBias: 0.0004,
  shadowNormalBias: 0.02,
  casterMargin: 9,
  interiorGain: 1,
  defaultRange: 6,
  staticShadowCache: true,
  maxShadowAge: 1.5,
  pointShadowMinRange: 3,
};

/** Lights shaded at once when clustering is unavailable (sun + sky + N = 6 material slots). */
const FALLBACK_MAX_LIGHTS = 4;
/** Lights every material reserves for sun, sky and the cluster. */
const BASE_SLOTS = 3;
/** Babylon's default `maxSimultaneousLights`. */
const DEFAULT_SLOTS = 4;
/** Hard cap on raised material slots (each light is a vertex UBO; notes §2.1 say ≤ 8). */
const MAX_SLOTS = 6;
/** Layer mask that excludes a light from every mesh (fallback deselection). */
const EXCLUDE_ALL = 0xffffffff | 0;
/** Upper bound for light ranges (cluster depth slicing / tile bounds). */
const MAX_RANGE = 14;

interface LightRec {
  light: Light;
  /** Fixed room, or null for portable lights (tracked from their position). */
  fixedRoom: RoomId | null;
  room: RoomId;
  mains: boolean;
  /** Nominal intensity (adopted from the owner whenever it changes the light itself). */
  base: number;
  /** Intensity we last wrote (detects external changes). */
  written: number;
  flickerLeft: number;
  flickerTime: number;
  seed: number;
  /** Effective intensity last frame. */
  effective: number;
  /** Currently a member of the clustered container. */
  clustered: boolean;
  /** Point/spot shadow generator while promoted. */
  shadow: ShadowGenerator | null;
  /** Casters in that generator's render list, and the light position / reach it was built for. */
  shadowSet: Set<AbstractMesh>;
  shadowPos: Vector3;
  shadowReach: number;
  /** Fallback mode: shaded by the nearest-light selection (else masked out of every mesh). */
  selected: boolean;
  /** The owner's `excludeWithLayerMask`, saved while the fallback selection masks the light. */
  savedExcludeMask: number;
  disposeObs: Observer<unknown> | null;
}

interface CasterRec {
  large: boolean;
  obs: Observer<unknown> | null;
}

const TMP_V = new Vector3();
const TMP_C = new Vector3();
const ROOM_IDS = new Set<string>(ROOMS.map((r) => r.id));
let fallbackWarned = false;

export class Lighting implements ILighting {
  readonly sun: DirectionalLight;
  /** Hemispheric sky fill. */
  readonly sky: HemisphericLight;
  /** The forward+ container of the interior lights (null when clustering is unsupported). */
  readonly cluster: ClusteredLightContainer | null;
  readonly settings: Settings;
  readonly tuning: LightingTuning;
  /** Unit vector towards the sun (world). */
  readonly toSun: Vector3;
  /** Linear sun colour (per unit intensity). */
  readonly sunColor: Color3;

  private readonly scene: Scene;
  private _quality: QualityPreset;
  private _sunShadows!: ShadowGenerator;
  /** Light view matrix + ortho extents of the fitted sun frustum (static: the sun never moves). */
  private readonly sunView = new Matrix();
  private readonly sunBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, texel: 0.01 };

  private readonly casters = new Map<AbstractMesh, CasterRec>();
  private readonly receivers = new Set<AbstractMesh>();
  private readonly preparedMaterials = new WeakSet<Material>();
  private readonly lights = new Map<Light, LightRec>();
  /** Shadow generators of the promoted (shadow-casting) interior lights. */
  private readonly pointGens: ShadowGenerator[] = [];
  /** Promoted light records (parallel to their generators; for per-light invalidation). */
  private readonly pointRecs: LightRec[] = [];
  /** Material light slots currently required of every lit material (see header). */
  private slotsNeeded = DEFAULT_SLOTS;
  private slotSweepCount = -1;
  private materialObs: Nullable<Observer<Material>> = null;
  /** Round-robin cursor of the shadow safety refresh (0 = sun, i = pointGens[i - 1]). */
  private refreshCursor = 0;
  /** Lights handed back by removeLight(): re-added to the scene if their owner keeps them. */
  private readonly released: Light[] = [];
  private _powered = true;

  private shadowAge = 0;
  private trackTimer = 0;
  private pointTimer = 0;
  private pruneTimer = 0;
  private disposed = false;
  private readonly onCasterMoved = (mesh: unknown): void => this.invalidateNear(mesh as AbstractMesh);

  constructor(scene: Scene, settings: Settings, tuning: Partial<LightingTuning> = {}) {
    this.scene = scene;
    this.settings = settings;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this._quality = settings.quality;
    this.toSun = new Vector3(TO_SUN.x, TO_SUN.y, TO_SUN.z);
    const [sr, sg, sb] = hexToLinear(SUN_COLOR_HEX);
    this.sunColor = new Color3(sr, sg, sb);

    // ---- sun: position = shadow camera origin, well upstream of every caster
    const dir = new Vector3(SUN_LIGHT_DIR.x, SUN_LIGHT_DIR.y, SUN_LIGHT_DIR.z);
    this.sun = new DirectionalLight("sun", dir, scene);
    this.sun.diffuse = this.sunColor.clone();
    this.sun.specular = this.sunColor.clone();
    this.sun.intensity = this.tuning.sunIntensity;
    const c = new Vector3((SHADOW_BOUNDS.min.x + SHADOW_BOUNDS.max.x) / 2, 1.3, (SHADOW_BOUNDS.min.z + SHADOW_BOUNDS.max.z) / 2);
    this.sun.position = c.subtract(dir.scale(40));
    this.sun.renderPriority = 1000;
    this.sun.shadowOrthoScale = 0; // the fitted box is the map: no hidden padding (texel math)
    this.fitSunFrustum();

    // ---- sky fill: cool zenith, warm bounce from the sunlit floors below
    this.sky = new HemisphericLight("skyFill", new Vector3(0, 1, 0), scene);
    this.sky.diffuse = new Color3(...this.tuning.skyColor);
    this.sky.groundColor = new Color3(...this.tuning.groundColor);
    this.sky.specular = new Color3(0.04, 0.045, 0.05);
    this.sky.intensity = this.tuning.skyIntensity;
    this.sky.renderPriority = 999;

    // ---- interior lights: one clustered container (one light slot per material)
    let cluster: ClusteredLightContainer | null = new ClusteredLightContainer("interiorLights", [], scene);
    if (!cluster.isSupported) {
      cluster.dispose();
      cluster = null;
    } else {
      cluster.maxRange = MAX_RANGE;
      cluster.renderPriority = 998;
    }
    this.cluster = cluster;

    this.createSunShadows(this._quality);
    this.updateLightSlots();
  }

  // ------------------------------------------------------------------ ILighting

  get sunShadows(): ShadowGenerator {
    return this._sunShadows;
  }

  get powered(): boolean {
    return this._powered;
  }

  get quality(): QualityPreset {
    return this._quality;
  }

  setShadowCaster(mesh: AbstractMesh, cast: boolean, large = false): void {
    if (!mesh || this.disposed) return;
    if (cast) {
      if (mesh.isDisposed()) return;
      const rec = this.casters.get(mesh);
      if (rec) {
        rec.large = large;
      } else {
        const obs = mesh.onAfterWorldMatrixUpdateObservable.add(this.onCasterMoved) as Observer<unknown>;
        this.casters.set(mesh, { large, obs });
        this._sunShadows.addShadowCaster(mesh, false);
      }
    } else {
      const rec = this.casters.get(mesh);
      if (!rec) return;
      this.casters.delete(mesh);
      if (rec.obs) mesh.onAfterWorldMatrixUpdateObservable.remove(rec.obs as never);
      this._sunShadows.removeShadowCaster(mesh, false);
      for (const g of this.pointGens) g.removeShadowCaster(mesh, false);
    }
    this.invalidateNear(mesh);
  }

  registerReceiver(mesh: AbstractMesh): void {
    if (!mesh || mesh.isDisposed() || this.disposed) return;
    mesh.receiveShadows = true;
    this.receivers.add(mesh);
    this.prepareMaterial(mesh.material);
    // A (re)built receiver usually means new geometry: refresh the cached shadows around it.
    this.invalidateNear(mesh);
  }

  unregisterReceiver(mesh: AbstractMesh): void {
    if (this.receivers.delete(mesh)) this.invalidateNear(mesh);
  }

  addLight(light: Light, roomId: string | null, mains: boolean): void {
    if (!light || light.isDisposed() || this.disposed) return;
    const fixed = roomId && ROOM_IDS.has(roomId) ? (roomId as RoomId) : null;
    const existing = this.lights.get(light);
    if (existing) {
      existing.fixedRoom = fixed;
      existing.room = fixed ?? this.roomOfLight(light);
      existing.mains = mains;
      this.applyPowerAndFlicker(existing, 0);
      return;
    }
    const ri = this.released.indexOf(light);
    if (ri >= 0) this.released.splice(ri, 1);
    if (light instanceof PointLight || light instanceof SpotLight) {
      if (!(light.range > 0 && light.range < 1e6)) light.range = this.tuning.defaultRange;
      if (light.range > MAX_RANGE) light.range = MAX_RANGE;
    }
    const rec: LightRec = {
      light,
      fixedRoom: fixed,
      room: fixed ?? this.roomOfLight(light),
      mains,
      base: light.intensity,
      written: light.intensity,
      flickerLeft: 0,
      flickerTime: 0,
      seed: (Math.random() * 1e6) | 0,
      effective: light.intensity,
      clustered: false,
      shadow: null,
      shadowSet: new Set(),
      shadowPos: new Vector3(),
      shadowReach: 0,
      selected: true,
      savedExcludeMask: 0,
      disposeObs: null,
    };
    this.lights.set(light, rec);
    if (light.renderPriority >= 998) light.renderPriority = 10;
    if (this.cluster) {
      this.joinCluster(rec);
    } else if (!fallbackWarned) {
      fallbackWarned = true;
      console.warn("Lighting: clustered lights unsupported; only the nearest interior lights are shaded");
    }
    rec.disposeObs = light.onDisposeObservable.add(() => this.forget(light, true)) as Observer<unknown>;
    this.applyPowerAndFlicker(rec, 0);
    this.pointTimer = 0; // (re)select shadowed / fallback lights next update
  }

  removeLight(light: Light): void {
    if (this.lights.has(light)) this.forget(light, false);
  }

  flicker(light: Light, seconds: number): void {
    const rec = this.lights.get(light);
    if (!rec || !(seconds > 0)) return;
    rec.flickerLeft = Math.max(rec.flickerLeft, Math.min(seconds, 3600));
  }

  setPower(on: boolean): void {
    on = !!on;
    if (this._powered === on) return;
    this._powered = on;
    for (const rec of this.lights.values()) this.applyPowerAndFlicker(rec, 0);
    this.pointTimer = 0; // reselect shadowed lights right away
  }

  applyQuality(q: QualityPreset): void {
    const prev = this._quality;
    this._quality = q;
    if (prev.shadowMapSize !== q.shadowMapSize) this.createSunShadows(q);
    else this._sunShadows.filteringQuality = this.filterQuality(q);
    // Point shadow resolution or count changed: rebuild the shadowed set.
    if (q.pointShadows !== prev.pointShadows) {
      for (const rec of this.lights.values()) if (rec.shadow) this.demote(rec);
    }
    this.updateLightSlots();
    this.pointTimer = 0;
    this.invalidateShadows();
  }

  update(dt: number): void {
    if (this.disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    // Lights released by removeLight() and not disposed by their owner: plain scene lights again.
    if (this.released.length) {
      for (const l of this.released) if (!l.isDisposed() && this.scene.lights.indexOf(l) < 0) this.scene.addLight(l);
      this.released.length = 0;
    }
    // Interior lights: power, flicker, external intensity changes.
    for (const rec of this.lights.values()) this.applyPowerAndFlicker(rec, step);
    // Portable lights: track their room (debug / per-room queries).
    this.trackTimer -= step;
    if (this.trackTimer <= 0) {
      this.trackTimer = 0.5;
      for (const rec of this.lights.values()) if (!rec.fixedRoom) rec.room = this.roomOfLight(rec.light);
    }
    // Point-light shadows (and fallback light selection) for the lights nearest the camera.
    this.pointTimer -= step;
    if (this.pointTimer <= 0) {
      this.pointTimer = 0.5;
      this.updatePointShadows();
      if (!this.cluster) this.updateFallbackSelection();
    }
    // Cached shadow maps: slow round-robin safety refresh, one map per tick.
    if (this.tuning.staticShadowCache) {
      this.shadowAge += step;
      if (this.shadowAge >= this.tuning.maxShadowAge) {
        this.shadowAge = 0;
        const n = this.pointGens.length + 1;
        this.refreshCursor = (this.refreshCursor + 1) % n;
        const g = this.refreshCursor === 0 ? this._sunShadows : this.pointGens[this.refreshCursor - 1];
        g?.getShadowMap()?.resetRefreshCounter();
      }
    }
    // Drop disposed casters / receivers now and then (Babylon already removed them from the maps).
    this.pruneTimer -= step;
    if (this.pruneTimer <= 0) {
      this.pruneTimer = 2;
      for (const [m, rec] of this.casters) {
        if (!m.isDisposed()) continue;
        if (rec.obs) m.onAfterWorldMatrixUpdateObservable.remove(rec.obs as never);
        this.casters.delete(m);
      }
      for (const m of this.receivers) {
        if (m.isDisposed()) this.receivers.delete(m);
        else this.prepareMaterial(m.material); // material assigned after registration
      }
      // Materials whose slot count was lowered again by their creator after creation.
      if (this.slotsNeeded > DEFAULT_SLOTS && this.scene.materials.length !== this.slotSweepCount) this.sweepMaterialSlots();
    }
  }

  // ------------------------------------------------------------------ extras

  /**
   * Re-render the cached shadow maps on the next frame. Called automatically when a caster
   * moves (world matrix update), is added/removed, or a receiver is (re)registered; call it
   * after editing caster geometry in place.
   */
  invalidateShadows(): void {
    this.shadowAge = 0;
    if (!this.tuning.staticShadowCache) return;
    this._sunShadows?.getShadowMap()?.resetRefreshCounter();
    for (const g of this.pointGens) g.getShadowMap()?.resetRefreshCounter();
  }

  /** Material light slots currently required of every lit material (debug). */
  get lightSlots(): number {
    return this.slotsNeeded;
  }

  /** Number of interior lights currently managed. */
  get lightCount(): number {
    return this.lights.size;
  }

  /** Interior lights currently shaded through the cluster. */
  get clusteredCount(): number {
    return this.cluster ? this.cluster.lights.length : 0;
  }

  /** Point/spot lights currently casting shadows (debug). */
  get shadowedLights(): Light[] {
    const out: Light[] = [];
    for (const rec of this.lights.values()) if (rec.shadow) out.push(rec.light);
    return out;
  }

  /** Registered shadow casters / receivers (debug). */
  get casterCount(): number {
    return this.casters.size;
  }

  get receiverCount(): number {
    return this.receivers.size;
  }

  /** Managed interior lights of a room (fixed room, or current room of portable lights). */
  lightsInRoom(room: RoomId): Light[] {
    const out: Light[] = [];
    for (const rec of this.lights.values()) if (rec.room === room) out.push(rec.light);
    return out;
  }

  /**
   * Make a material compatible with the clustered lights: PBR switches to glTF light falloff
   * (inverse square windowed smoothly to 0 at `range`; plain physical falloff never reaches 0
   * and shows hard cluster-tile seams). Called for every registered receiver's material.
   */
  prepareMaterial(mat: Material | null | undefined): void {
    if (!mat || this.preparedMaterials.has(mat)) return;
    this.preparedMaterials.add(mat);
    const subs = (mat as unknown as { subMaterials?: Array<Material | null> }).subMaterials;
    if (Array.isArray(subs)) {
      for (const m of subs) this.prepareMaterial(m);
      return;
    }
    const pbr = mat as Material & { useGLTFLightFalloff?: boolean };
    if (typeof pbr.useGLTFLightFalloff === "boolean" && !pbr.useGLTFLightFalloff) pbr.useGLTFLightFalloff = true;
    this.raiseSlots(mat);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const rec of [...this.lights.values()]) this.forget(rec.light, false);
    this.released.length = 0;
    for (const [m, rec] of this.casters) if (rec.obs) m.onAfterWorldMatrixUpdateObservable.remove(rec.obs as never);
    this.casters.clear();
    this.receivers.clear();
    if (this.materialObs) this.scene.onNewMaterialAddedObservable.remove(this.materialObs);
    this.materialObs = null;
    this._sunShadows.dispose();
    this.cluster?.dispose();
    this.sun.dispose();
    this.sky.dispose();
  }

  // ------------------------------------------------------------------ sun shadows

  private filterQuality(q: QualityPreset): number {
    return q.shadowMapSize >= 4096 ? ShadowGenerator.QUALITY_HIGH : q.shadowMapSize >= 2048 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
  }

  private createSunShadows(q: QualityPreset): void {
    const old = this._sunShadows as ShadowGenerator | undefined;
    if (old) old.dispose();
    const size = Math.max(512, Math.min(8192, q.shadowMapSize | 0 || 2048));
    // 32-bit float depth: the light-space depth range is ~30 m (upstream casters included).
    const gen = new ShadowGenerator(size, this.sun, true);
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = this.filterQuality(q);
    gen.bias = this.tuning.shadowBias;
    gen.normalBias = this.tuning.shadowNormalBias;
    gen.darkness = 0;
    gen.transparencyShadow = false;
    gen.frustumEdgeFalloff = 0;
    this.sunBox.texel = (this.sunBox.maxX - this.sunBox.minX) / size;
    gen.customAllowRendering = (sm: SubMesh) => this.allowSunCaster(sm);
    const map = gen.getShadowMap();
    if (map) map.refreshRate = this.tuning.staticShadowCache ? RenderTargetTexture.REFRESHRATE_RENDER_ONCE : 1;
    this._sunShadows = gen;
    for (const m of this.casters.keys()) if (!m.isDisposed()) gen.addShadowCaster(m, false);
    this.invalidateShadows();
  }

  /**
   * One stable orthographic map fitted to the receiver box in light space. X/Y cover the
   * receivers (a caster that shadows a receiver shares its light-space X/Y); the depth range
   * extends `casterMargin` metres upstream for the tower outside the windows.
   */
  private fitSunFrustum(): void {
    const s = this.sun;
    s.autoUpdateExtends = false;
    s.autoCalcShadowZBounds = false;
    Matrix.LookAtLHToRef(s.position, s.position.add(s.direction), Vector3.Up(), this.sunView);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    const b = SHADOW_BOUNDS;
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) {
          Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, this.sunView, TMP_V);
          minX = Math.min(minX, TMP_V.x);
          maxX = Math.max(maxX, TMP_V.x);
          minY = Math.min(minY, TMP_V.y);
          maxY = Math.max(maxY, TMP_V.y);
          minZ = Math.min(minZ, TMP_V.z);
          maxZ = Math.max(maxZ, TMP_V.z);
        }
    minZ -= this.tuning.casterMargin;
    s.orthoLeft = minX;
    s.orthoRight = maxX;
    s.orthoBottom = minY;
    s.orthoTop = maxY;
    s.shadowMinZ = Math.max(0.1, minZ - 0.25);
    s.shadowMaxZ = maxZ + 0.25;
    Object.assign(this.sunBox, { minX, maxX, minY, maxY, minZ: s.shadowMinZ, maxZ: s.shadowMaxZ });
  }

  /** Sun caster culling: skip meshes outside the fitted light box, and specks below ~1.5 texels. */
  private allowSunCaster(subMesh: SubMesh): boolean {
    const mesh = subMesh.getMesh();
    const bs = mesh.getBoundingInfo().boundingSphere;
    const r = bs.radiusWorld;
    Vector3.TransformCoordinatesToRef(bs.centerWorld, this.sunView, TMP_C);
    const b = this.sunBox;
    if (TMP_C.x + r < b.minX || TMP_C.x - r > b.maxX || TMP_C.y + r < b.minY || TMP_C.y - r > b.maxY) return false;
    if (TMP_C.z + r < b.minZ || TMP_C.z - r > b.maxZ) return false;
    if (r < b.texel * 0.75 && !this.casters.get(mesh as AbstractMesh)?.large) return false;
    return true;
  }

  // ------------------------------------------------------------------ interior lights

  private roomOfLight(light: Light): RoomId {
    const p = this.lightPosition(light);
    return nearestRoom(p.x, p.z).id;
  }

  private lightPosition(light: Light): Vector3 {
    if (light instanceof ShadowLight) {
      light.computeTransformedInformation(); // parented lights follow their island
      return light.getAbsolutePosition();
    }
    return TMP_V.setAll(0); // hemispheric/area lights: position irrelevant
  }

  private applyPowerAndFlicker(rec: LightRec, dt: number): void {
    const l = rec.light;
    if (l.isDisposed()) return;
    if (Math.abs(l.intensity - rec.written) > 1e-7) rec.base = l.intensity; // owner changed it
    let f = 1;
    if (rec.mains && !this._powered) {
      f = 0;
    } else if (rec.flickerLeft > 0) {
      rec.flickerLeft -= dt;
      rec.flickerTime += dt;
      f = rec.flickerLeft > 0 ? flickerLevel(rec.flickerTime, rec.seed) : 1;
    }
    // Clustered shading ignores setEnabled(false): honour an owner's disable through intensity.
    if (rec.clustered && !l.isEnabled()) f = 0;
    const eff = Math.max(0, rec.base * this.tuning.interiorGain * f);
    if (l.intensity !== eff) l.intensity = eff;
    rec.written = l.intensity;
    rec.effective = eff;
  }

  private joinCluster(rec: LightRec): void {
    const c = this.cluster;
    if (!c || rec.clustered || rec.shadow) return;
    if (!ClusteredLightContainer.IsLightSupported(rec.light)) return; // stays a normal light
    c.addLight(rec.light);
    rec.clustered = c.lights.indexOf(rec.light) >= 0;
  }

  /**
   * Take a light out of the cluster. `toScene` = it continues as an ordinary scene light
   * (point shadows); otherwise it is detached without the O(meshes) re-registration that
   * ClusteredLightContainer.removeLight performs (its owner is about to dispose it).
   */
  private leaveCluster(rec: LightRec, toScene: boolean): void {
    const c = this.cluster;
    if (!c || !rec.clustered) return;
    rec.clustered = false;
    if (toScene) {
      c.removeLight(rec.light);
      return;
    }
    const s = this.scene as unknown as { _blockEntityCollection: boolean };
    const prev = s._blockEntityCollection;
    s._blockEntityCollection = true; // scene.addLight() becomes a no-op
    try {
      c.removeLight(rec.light);
    } finally {
      s._blockEntityCollection = prev;
    }
  }

  /** Stop managing a light (removeLight, owner disposal, Lighting disposal). */
  private forget(light: Light, disposing: boolean): void {
    const rec = this.lights.get(light);
    if (!rec) return;
    this.lights.delete(light);
    if (rec.disposeObs && !disposing) light.onDisposeObservable.remove(rec.disposeObs as never);
    rec.disposeObs = null;
    if (rec.shadow) {
      // Light.dispose() already disposed its generators before notifying observers.
      if (!disposing) rec.shadow.dispose();
      this.dropPointGen(rec.shadow);
      rec.shadow = null;
      this.invalidateShadows();
    }
    const wasClustered = rec.clustered;
    this.leaveCluster(rec, false);
    if (!disposing && !light.isDisposed()) {
      // Hand the light back in its nominal state; it rejoins the scene as an ordinary light
      // at the next update unless the owner disposes it first (the usual case).
      light.intensity = rec.base;
      if (!rec.selected) light.excludeWithLayerMask = rec.savedExcludeMask; // undo the fallback mask
      if (wasClustered) this.released.push(light);
    }
  }

  // ---- point-light shadows

  private updatePointShadows(): void {
    const want = this.pointShadowCount();
    const cam = this.scene.activeCamera;
    const chosen = new Set<LightRec>();
    if (want > 0 && cam) {
      const cp = cam.globalPosition;
      const cands: Array<{ rec: LightRec; d: number }> = [];
      for (const rec of this.lights.values()) {
        const l = rec.light;
        if (!(l instanceof PointLight || l instanceof SpotLight)) continue;
        if (!l.isEnabled() || (!this.cluster && !rec.selected)) continue; // owner-disabled / not shaded
        if (rec.effective <= 0.02 || !(l.range >= this.tuning.pointShadowMinRange)) continue;
        if (rec.flickerLeft > 0 && !rec.shadow) continue; // do not promote a dying fixture
        let d = Vector3.Distance(this.lightPosition(l), cp);
        if (rec.shadow) d -= 1.2; // hysteresis: keep the current choice unless clearly beaten
        cands.push({ rec, d });
      }
      cands.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(want, cands.length); i++) chosen.add(cands[i].rec);
    }
    for (const rec of this.lights.values()) if (rec.shadow && !chosen.has(rec)) this.demote(rec);
    for (const rec of chosen) {
      if (!rec.shadow) this.promote(rec);
      if (rec.shadow) this.fillPointCasters(rec);
    }
  }

  private promote(rec: LightRec): void {
    const l = rec.light as PointLight | SpotLight;
    this.leaveCluster(rec, true);
    l.shadowMinZ = 0.05;
    l.shadowMaxZ = Math.min(l.range, 10);
    const ultra = this._quality.pointShadows >= 2;
    const g = new ShadowGenerator(ultra ? 1024 : 512, l, true);
    if (l instanceof SpotLight) {
      g.usePercentageCloserFiltering = true;
      g.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    } else {
      g.usePoissonSampling = true; // PCF silently becomes Poisson on cube maps (notes §1.3)
    }
    g.bias = 0.0015;
    g.normalBias = 0.012;
    g.darkness = 0;
    g.transparencyShadow = false;
    const sm = g.getShadowMap();
    if (sm) sm.refreshRate = this.tuning.staticShadowCache ? RenderTargetTexture.REFRESHRATE_RENDER_ONCE : 1;
    rec.shadow = g;
    rec.shadowSet.clear();
    this.pointGens.push(g);
    this.pointRecs.push(rec);
  }

  private demote(rec: LightRec): void {
    if (rec.shadow) {
      rec.shadow.dispose();
      this.dropPointGen(rec.shadow);
    }
    rec.shadow = null;
    if (!rec.light.isDisposed()) this.joinCluster(rec);
  }

  private dropPointGen(g: ShadowGenerator): void {
    const i = this.pointGens.indexOf(g);
    if (i < 0) return;
    this.pointGens.splice(i, 1);
    const rec = this.pointRecs.splice(i, 1)[0];
    rec?.shadowSet.clear();
  }

  /** Shadowed point lights wanted: quality, capped so sun + sky + cluster + N fits the slot cap. */
  private pointShadowCount(): number {
    const q = Math.floor(this._quality.pointShadows);
    return Number.isFinite(q) ? Math.max(0, Math.min(MAX_SLOTS - BASE_SLOTS, q)) : 0;
  }

  /** Is this caster something point light `rec` must render (within reach, not its own fixture)? */
  private pointCasterWanted(rec: LightRec, m: AbstractMesh): boolean {
    const bs = m.getBoundingInfo().boundingSphere;
    const r = bs.radiusWorld;
    const d = Vector3.Distance(bs.centerWorld, rec.shadowPos);
    if (d - r > rec.shadowReach) return false;
    if (r < 0.6 && d < r + 0.05) return false; // lamp shade / fixture enclosing the bulb
    return r >= 0.02;
  }

  /**
   * Cached-shadow invalidation for one mesh that moved / changed / was (un)registered: the sun
   * map always, a point-light cube map only when the mesh is (or now should be) in its list.
   */
  private invalidateNear(mesh: AbstractMesh | null | undefined): void {
    if (!this.tuning.staticShadowCache) return;
    this._sunShadows?.getShadowMap()?.resetRefreshCounter();
    if (this.pointGens.length === 0) return;
    if (!mesh || mesh.isDisposed()) {
      for (const g of this.pointGens) g.getShadowMap()?.resetRefreshCounter();
      return;
    }
    const caster = this.casters.has(mesh);
    for (let i = 0; i < this.pointRecs.length; i++) {
      const rec = this.pointRecs[i];
      const sm = this.pointGens[i].getShadowMap();
      if (!sm) continue;
      const listed = rec.shadowSet.has(mesh);
      if (!caster) {
        if (listed) {
          // No longer a caster (setShadowCaster(false) already removed it from the list).
          rec.shadowSet.delete(mesh);
          sm.resetRefreshCounter();
        }
        continue;
      }
      if (listed) {
        sm.resetRefreshCounter();
      } else if (this.pointCasterWanted(rec, mesh)) {
        // Moved into reach: render it now instead of at the next list rebuild.
        rec.shadowSet.add(mesh);
        if (sm.renderList) sm.renderList.push(mesh);
        else sm.renderList = [mesh];
        sm.resetRefreshCounter();
      }
    }
  }

  // ---- material light slots

  /** Slots every lit material needs for the current quality / mode; raises them if needed. */
  private updateLightSlots(): void {
    const extra = this.cluster ? this.pointShadowCount() : FALLBACK_MAX_LIGHTS;
    const need = Math.min(MAX_SLOTS, (this.cluster ? BASE_SLOTS : BASE_SLOTS - 1) + extra);
    if (need <= this.slotsNeeded) return; // never lowered: spare slots cost nothing, recompiles do
    this.slotsNeeded = need;
    if (!this.materialObs) {
      // Scene announces new materials asynchronously (SetImmediate), i.e. after their
      // constructor and the creator's synchronous setup have run.
      this.materialObs = this.scene.onNewMaterialAddedObservable.add((m) => {
        if (!this.disposed) this.raiseSlots(m);
      });
    }
    this.sweepMaterialSlots();
  }

  private sweepMaterialSlots(): void {
    this.slotSweepCount = this.scene.materials.length;
    for (const m of this.scene.materials) this.raiseSlots(m);
  }

  /** Raise one lit Standard/PBR(-like) material to the required light slots. */
  private raiseSlots(mat: Material | null | undefined): void {
    if (!mat || this.slotsNeeded <= DEFAULT_SLOTS) return;
    const m = mat as Material & { maxSimultaneousLights?: number; disableLighting?: boolean; unlit?: boolean };
    if (typeof m.maxSimultaneousLights !== "number" || m.disableLighting === true || m.unlit === true) return;
    if (m.maxSimultaneousLights >= this.slotsNeeded) return;
    const frozen = m.isFrozen;
    if (frozen) m.unfreeze();
    m.maxSimultaneousLights = this.slotsNeeded;
    if (frozen) m.freeze();
  }

  /** Point shadows: casters within reach of the light, minus the fixture around the bulb. */
  private fillPointCasters(rec: LightRec): void {
    const gen = rec.shadow;
    const sm = gen?.getShadowMap();
    if (!gen || !sm) return;
    rec.shadowPos.copyFrom(this.lightPosition(rec.light));
    rec.shadowReach = Math.min((rec.light as PointLight).range || 8, 10);
    const list: AbstractMesh[] = [];
    for (const m of this.casters.keys()) if (!m.isDisposed() && this.pointCasterWanted(rec, m)) list.push(m);
    const old = sm.renderList;
    let same = !!old && old.length === list.length;
    if (same && old) for (let i = 0; i < list.length; i++) if (old[i] !== list[i]) same = false;
    if (!same) {
      sm.renderList = list;
      rec.shadowSet.clear();
      for (const m of list) rec.shadowSet.add(m);
      sm.resetRefreshCounter();
    }
  }

  // ---- fallback (no clustering): only the nearest lights are shaded

  private updateFallbackSelection(): void {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const cp = cam.globalPosition;
    const cands: Array<{ rec: LightRec; d: number }> = [];
    for (const rec of this.lights.values()) {
      // Owner-disabled, dimmed-to-zero and powered-off lights never take a slot.
      const lit = rec.base > 0 && rec.light.isEnabled() && !(rec.mains && !this._powered);
      cands.push({ rec, d: lit ? Vector3.Distance(this.lightPosition(rec.light), cp) - (rec.selected ? 0.8 : 0) : Infinity });
    }
    cands.sort((a, b) => a.d - b.d);
    cands.forEach(({ rec, d }, i) => {
      const sel = i < FALLBACK_MAX_LIGHTS && d < Infinity;
      if (sel === rec.selected) return;
      rec.selected = sel;
      // Masked lights leave every mesh's light list (freeing the material slot) while the
      // owner's enable flag stays untouched.
      const l = rec.light;
      if (sel) {
        l.excludeWithLayerMask = rec.savedExcludeMask;
      } else {
        rec.savedExcludeMask = l.excludeWithLayerMask;
        l.excludeWithLayerMask = EXCLUDE_ALL;
      }
    });
  }
}

/** Damaged-fixture flicker: mostly on, stuttering drop-outs and dim phases, mains buzz. */
export function flickerLevel(t: number, seed: number): number {
  const slow = noise1(t * 7.3, seed);
  const fast = noise1(t * 61, seed + 17);
  if (slow > 0.18) return 0.88 + 0.12 * fast;
  if (slow > -0.25) return 0.35 + 0.25 * fast;
  return 0.02;
}
