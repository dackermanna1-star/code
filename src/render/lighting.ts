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
// windows still occlude.
//
// Shadow caching (shadowCache.ts): every shadow map is LAYERED. Casters at rest live in a
// cached static layer; the sampled live map is rebuilt from it by a GPU copy plus only the
// casters that are moving. A caster that moves more than `shadowMoveEpsilon` (sub-texel jitter
// of resting bodies is ignored) becomes dynamic; after `shadowSettleTime` without moving it is
// folded back into the static layer. Only the region that changed is redrawn: a texel
// rectangle of the sun map (the caster's light-space footprint, old and new), and the cube
// faces of a point-light map whose frustum the caster's bounding sphere touches (casters are
// culled per face as well). In-place geometry edits arrive through casterGeometryChanged()
// (island rebuilds), so the spinning ceiling fan costs a copy and a couple of draws per frame
// instead of re-rendering every caster of both maps.

import {
  ClusteredLightContainer,
  Color3,
  DirectionalLight,
  HemisphericLight,
  Matrix,
  PointLight,
  ShadowGenerator,
  ShadowLight,
  SpotLight,
  Vector3,
  type AbstractMesh,
  type Engine,
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
import { addCircleTexels, boxDisplacement, cubeFaceMask, emptyRect, projectBoxToFace, type RectSet, type TexelRect } from "./env/shadowMath.ts";
import { LayeredShadowMap, type CasterKind, type LayerStats } from "./shadowCache.ts";

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
  /** Cache the shadow maps between caster movements (false = re-render every frame). */
  staticShadowCache: boolean;
  /**
   * Split every cached map into a static layer + live map (shadowCache.ts). False: a cached
   * map is redrawn with every caster whenever anything in it changed (the old behaviour).
   */
  layeredShadows: boolean;
  /**
   * Safety refresh period (s) of the cached shadow maps, 0 = off. Each tick fully redraws ONE
   * map, round-robin over the sun and the point-light cube maps. Island rebuilds report in-place
   * geometry edits (casterGeometryChanged), so this is only a net for foreign edits.
   */
  maxShadowAge: number;
  /** A caster whose bounds moved less than this (m) since it was last drawn is not redrawn. */
  shadowMoveEpsilon: number;
  /** Seconds a moving caster must stay still before it is folded into the static layer. */
  shadowSettleTime: number;
  /** Sun casters with a bounding radius below this many (coarser-axis) texels are skipped (unless `large`). */
  sunCasterMinTexels: number;
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
  layeredShadows: true,
  maxShadowAge: 0,
  shadowMoveEpsilon: 0.002,
  shadowSettleTime: 0.5,
  sunCasterMinTexels: 0.75,
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
  /** Point/spot shadow generator (the sampled live map) while promoted. */
  shadow: ShadowGenerator | null;
  /** Its layered cache (static layer + live map). */
  layer: LayeredShadowMap | null;
  /** Light position / reach the cached map is drawn for. */
  shadowPos: Vector3;
  shadowReach: number;
  /** View matrices of the six cube faces at `shadowPos` (the generator's own LookAtLH per face). */
  faceViews: Matrix[];
  /** Fallback mode: shaded by the nearest-light selection (else masked out of every mesh). */
  selected: boolean;
  /** Left the cluster because of the quality's interior-light budget (rejoins when near again). */
  culled: boolean;
  /** The owner's `excludeWithLayerMask`, saved while the fallback selection masks the light. */
  savedExcludeMask: number;
  disposeObs: Observer<unknown> | null;
}

interface CasterRec {
  mesh: AbstractMesh;
  large: boolean;
  obs: Observer<unknown> | null;
  /** Mesh disposal observer (a disposed caster leaves the cached maps at once). */
  disp: Observer<unknown> | null;
  /** Drawn into the live maps (moving) instead of the cached static layers. */
  dynamic: boolean;
  /** Clock (s) of the last move beyond the epsilon, geometry edit or registration. */
  changedAt: number;
  /** Pending changes (Q_* bits) for the next processShadows(). */
  queued: number;
  /** Unregistered while queued. */
  removed: boolean;
  /** World matrix when last flagged as moved: sub-epsilon motion relative to it is ignored. */
  readonly ref: Float32Array;
  /**
   * World bounds the maps were last told about (valid when hasSphere): bounding sphere
   * (cx, cy, cz, r) then the world AABB (x0, y0, z0, x1, y1, z1).
   */
  readonly b: Float64Array;
  hasSphere: boolean;
}

/** CasterRec.queued bits. */
const Q_ADDED = 1,
  Q_MOVED = 2,
  Q_GEOMETRY = 4;
/** Seconds between scans that fold settled moving casters back into the static layers. */
const PROMOTE_INTERVAL = 0.25;
/** Texels of padding around a caster's sun-map footprint (rasterisation, normal bias). */
const SUN_RECT_PAD = 2;
/** Texels of padding around a caster's footprint on a cube face. */
const CUBE_RECT_PAD = 2;
/** Near plane of the point-light cube maps (shadowMinZ). */
const POINT_NEAR = 0.05;

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
  private readonly engine: Engine;
  /** Layered sun shadow cache (its live generator is `sunShadows`). */
  private _sunLayer!: LayeredShadowMap;
  /** Light view matrix + ortho extents of the fitted sun frustum (static: the sun never moves). */
  private readonly sunView = new Matrix();
  /** (texelX / texelY: light-space metres per sun-map texel; the fitted box is not square.) */
  private readonly sunBox = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, texelX: 0.01, texelY: 0.01 };

  private readonly casters = new Map<AbstractMesh, CasterRec>();
  /** Casters at rest (drawn into the static layers) / moving (drawn into the live maps). */
  private readonly staticList: AbstractMesh[] = [];
  private readonly dynamicList: AbstractMesh[] = [];
  private listsDirty = true;
  /** Casters with pending changes (CasterRec.queued). */
  private readonly queue: CasterRec[] = [];
  /** Seconds of lighting time (update dt), for the settle timers. */
  private clock = 0;
  private promoteTimer = 0;
  private evalObs: Nullable<Observer<Scene>> = null;
  private readonly tmpRect: TexelRect = emptyRect();
  private readonly tmpRect2: TexelRect = emptyRect();
  private readonly oldBounds = new Float64Array(10);
  private readonly receivers = new Set<AbstractMesh>();
  private readonly preparedMaterials = new WeakSet<Material>();
  private readonly lights = new Map<Light, LightRec>();
  /** Promoted (shadow-casting) interior lights, in promotion order. */
  private readonly pointRecs: LightRec[] = [];
  /** Scratch of updateClusterBudget(). */
  private readonly budgetCands: Array<{ rec: LightRec; d: number }> = [];
  /** Material light slots currently required of every lit material (see header). */
  private slotsNeeded = DEFAULT_SLOTS;
  private slotSweepCount = -1;
  private materialObs: Nullable<Observer<Material>> = null;
  /** Round-robin cursor of the shadow safety refresh (0 = sun, i = pointRecs[i - 1]). */
  private refreshCursor = 0;
  /** Lights handed back by removeLight(): re-added to the scene if their owner keeps them. */
  private readonly released: Light[] = [];
  private _powered = true;

  private shadowAge = 0;
  /** Lighting clock of the last time the cached maps were armed (quality.shadowRefreshInterval). */
  private lastArm = -Infinity;
  private trackTimer = 0;
  private pointTimer = 0;
  private pruneTimer = 0;
  private disposed = false;
  private readonly onCasterMoved = (mesh: unknown): void => this.casterMoved(mesh as AbstractMesh);
  private readonly sunProvider = (kind: CasterKind, _face: number, rects: RectSet | null, out: AbstractMesh[]): void => this.fillSun(kind, rects, out);

  constructor(scene: Scene, settings: Settings, tuning: Partial<LightingTuning> = {}) {
    this.scene = scene;
    this.engine = scene.getEngine() as Engine;
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
    // Moves are detected while the frame evaluates its meshes (world matrices); the caches are
    // updated and armed right after, before the render targets of the same frame.
    this.evalObs = scene.onAfterActiveMeshesEvaluationObservable.add(() => this.processShadows());
  }

  // ------------------------------------------------------------------ ILighting

  get sunShadows(): ShadowGenerator {
    return this._sunLayer.gen;
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
        this.queueCaster(rec, Q_GEOMETRY); // re-registration = rebuilt geometry
        return;
      }
      const obs = mesh.onAfterWorldMatrixUpdateObservable.add(this.onCasterMoved) as Observer<unknown>;
      const c: CasterRec = { mesh, large, obs, disp: null, dynamic: true, changedAt: this.clock, queued: 0, removed: false, ref: new Float32Array(16), b: new Float64Array(10), hasSphere: false };
      c.disp = mesh.onDisposeObservable.add(() => this.dropCaster(c)) as Observer<unknown>;
      c.ref.set(mesh.worldMatrixFromCache.m);
      this.casters.set(mesh, c);
      // the live sun map's render list mirrors the casters (introspection; drawing uses the layers)
      this._sunLayer.gen.addShadowCaster(mesh, false);
      this.listsDirty = true;
      this.queueCaster(c, Q_ADDED);
    } else {
      const rec = this.casters.get(mesh);
      if (!rec) return;
      this.dropCaster(rec);
    }
  }

  /**
   * A caster's geometry was rebuilt in place (same mesh, new vertices / bounds): redraw the
   * cached shadow maps where it was and where it is now. Island batching calls this.
   */
  casterGeometryChanged(mesh: AbstractMesh): void {
    const rec = this.casters.get(mesh);
    if (rec && !this.disposed) this.queueCaster(rec, Q_GEOMETRY);
  }

  registerReceiver(mesh: AbstractMesh): void {
    if (!mesh || mesh.isDisposed() || this.disposed) return;
    mesh.receiveShadows = true;
    this.receivers.add(mesh);
    this.prepareMaterial(mesh.material);
    // (receivers never change the shadow maps: only casters do)
  }

  unregisterReceiver(mesh: AbstractMesh): void {
    this.receivers.delete(mesh);
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
      layer: null,
      shadowPos: new Vector3(),
      shadowReach: 0,
      faceViews: [],
      selected: true,
      culled: false,
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
    else {
      const fq = this.filterQuality(q);
      this._sunLayer.gen.filteringQuality = fq;
      if (this._sunLayer.staticGen) this._sunLayer.staticGen.filteringQuality = fq;
    }
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
      else this.updateClusterBudget();
    }
    this.clock += step;
    this.promoteTimer -= step;
    // Cached shadow maps: optional slow round-robin safety refresh, one map per tick.
    if (this.tuning.staticShadowCache && this.tuning.maxShadowAge > 0) {
      this.shadowAge += step;
      if (this.shadowAge >= this.tuning.maxShadowAge) {
        this.shadowAge = 0;
        const n = this.pointRecs.length + 1;
        this.refreshCursor = (this.refreshCursor + 1) % n;
        const layer = this.refreshCursor === 0 ? this._sunLayer : this.pointRecs[this.refreshCursor - 1]?.layer;
        layer?.markAll();
      }
    }
    // Drop disposed casters / receivers now and then.
    this.pruneTimer -= step;
    if (this.pruneTimer <= 0) {
      this.pruneTimer = 2;
      for (const rec of this.casters.values()) if (rec.mesh.isDisposed()) this.dropCaster(rec);
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
   * Fully redraw every cached shadow map (both layers) on the next frame. Moves, caster
   * (un)registration and casterGeometryChanged() are handled incrementally; call this after
   * changes the lighting cannot see (e.g. editing a caster's vertices behind its back).
   */
  invalidateShadows(): void {
    this.shadowAge = 0;
    this._sunLayer?.markAll();
    for (const rec of this.pointRecs) rec.layer?.markAll();
  }

  /** Shadow-cache counters (debug / perf tooling). */
  get shadowCacheStats(): { staticCasters: number; dynamicCasters: number; layered: boolean; sun: LayerStats; points: Array<{ light: string; stats: LayerStats }> } {
    return {
      staticCasters: this.staticList.length,
      dynamicCasters: this.dynamicList.length,
      layered: this._sunLayer.layered,
      sun: { ...this._sunLayer.stats },
      points: this.pointRecs.map((r) => ({ light: r.light.name, stats: { ...(r.layer?.stats ?? { staticRenders: 0, liveRenders: 0, copies: 0, retries: 0 }) } })),
    };
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
    for (const [m, rec] of this.casters) {
      if (rec.obs) m.onAfterWorldMatrixUpdateObservable.remove(rec.obs as never);
      if (rec.disp) m.onDisposeObservable.remove(rec.disp as never);
    }
    this.casters.clear();
    this.staticList.length = 0;
    this.dynamicList.length = 0;
    this.queue.length = 0;
    this.receivers.clear();
    if (this.materialObs) this.scene.onNewMaterialAddedObservable.remove(this.materialObs);
    this.materialObs = null;
    if (this.evalObs) this.scene.onAfterActiveMeshesEvaluationObservable.remove(this.evalObs);
    this.evalObs = null;
    this._sunLayer.dispose();
    this.cluster?.dispose();
    this.sun.dispose();
    this.sky.dispose();
  }

  // ------------------------------------------------------------------ sun shadows

  private filterQuality(q: QualityPreset): number {
    return q.shadowMapSize >= 4096 ? ShadowGenerator.QUALITY_HIGH : q.shadowMapSize >= 2048 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
  }

  private createSunShadows(q: QualityPreset): void {
    const old = this._sunLayer as LayeredShadowMap | undefined;
    if (old) old.dispose();
    const size = Math.max(512, Math.min(8192, q.shadowMapSize | 0 || 2048));
    this.sunBox.texelX = (this.sunBox.maxX - this.sunBox.minX) / size;
    this.sunBox.texelY = (this.sunBox.maxY - this.sunBox.minY) / size;
    // 32-bit float depth: the light-space depth range is ~30 m (upstream casters included).
    const layer = new LayeredShadowMap(this.sun, this.engine, {
      size,
      layered: this.tuning.staticShadowCache && this.tuning.layeredShadows,
      provider: this.sunProvider,
      configure: (gen) => {
        gen.usePercentageCloserFiltering = true;
        gen.filteringQuality = this.filterQuality(q);
        gen.bias = this.tuning.shadowBias;
        gen.normalBias = this.tuning.shadowNormalBias;
        gen.darkness = 0;
        gen.transparencyShadow = false;
        gen.frustumEdgeFalloff = 0;
        gen.customAllowRendering = (sm: SubMesh) => this.allowSunCaster(sm);
      },
    });
    this._sunLayer = layer;
    for (const m of this.casters.keys()) if (!m.isDisposed()) layer.gen.addShadowCaster(m, false);
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

  /** Sun caster culling: skip meshes outside the fitted light box, and specks below `sunCasterMinTexels`. */
  private allowSunCaster(subMesh: SubMesh): boolean {
    const mesh = subMesh.getMesh();
    const bs = mesh.getBoundingInfo().boundingSphere;
    const c = bs.centerWorld;
    return this.sunWants(c.x, c.y, c.z, bs.radiusWorld, !!this.casters.get(mesh as AbstractMesh)?.large);
  }

  /** Does a caster with this world bounding sphere render into the sun map? (TMP_C = its light-space centre) */
  private sunWants(x: number, y: number, z: number, r: number, large: boolean): boolean {
    Vector3.TransformCoordinatesFromFloatsToRef(x, y, z, this.sunView, TMP_C);
    const b = this.sunBox;
    if (TMP_C.x + r < b.minX || TMP_C.x - r > b.maxX || TMP_C.y + r < b.minY || TMP_C.y - r > b.maxY) return false;
    if (TMP_C.z + r < b.minZ || TMP_C.z - r > b.maxZ) return false;
    if (!large && (r < Math.max(b.texelX, b.texelY) * this.tuning.sunCasterMinTexels || r < this._quality.shadowMinRadius)) return false;
    return true;
  }

  /** Sun-map casters of one pass: `kind` from the static/moving lists, footprint overlapping `rects`. */
  private fillSun(kind: CasterKind, rects: RectSet | null, out: AbstractMesh[]): void {
    const b = this.sunBox;
    const add = (m: AbstractMesh): void => {
      if (m.isDisposed() || !m.isEnabled()) return;
      const bs = m.getBoundingInfo().boundingSphere;
      const c = bs.centerWorld;
      const r = bs.radiusWorld;
      if (!this.sunWants(c.x, c.y, c.z, r, !!this.casters.get(m)?.large)) return;
      if (rects && !rects.hitsCircle(TMP_C.x, TMP_C.y, r, b.minX, b.minY, b.texelX, b.texelY)) return;
      out.push(m);
    };
    this.forKind(kind, add);
  }

  /** Visit the casters of a kind (static layer / moving / every caster). */
  private forKind(kind: CasterKind, fn: (m: AbstractMesh) => void): void {
    if (this.listsDirty) this.rebuildLists();
    if (kind !== "dynamic") for (const m of this.staticList) fn(m);
    // weak-PC presets: moving casters cast no shadow until they come to rest
    if (kind !== "static" && this._quality.dynamicShadows) for (const m of this.dynamicList) fn(m);
  }

  // ------------------------------------------------------------------ shadow cache bookkeeping

  /** World matrix of a caster changed: queue it unless it moved less than the epsilon since it was last drawn. */
  private casterMoved(mesh: AbstractMesh): void {
    const rec = this.casters.get(mesh);
    if (!rec || rec.queued & (Q_MOVED | Q_ADDED)) return;
    const wm = mesh.worldMatrixFromCache.m;
    const bb = mesh.getBoundingInfo().boundingBox;
    const lo = bb.minimum,
      hi = bb.maximum;
    const d = boxDisplacement(rec.ref, wm, (lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, (lo.z + hi.z) * 0.5, (hi.x - lo.x) * 0.5, (hi.y - lo.y) * 0.5, (hi.z - lo.z) * 0.5);
    if (d < this.tuning.shadowMoveEpsilon) return;
    rec.ref.set(wm);
    this.queueCaster(rec, Q_MOVED);
  }

  private queueCaster(rec: CasterRec, flag: number): void {
    if (rec.queued === 0) this.queue.push(rec);
    rec.queued |= flag;
  }

  /** Unregister a caster: its last drawn footprint is redrawn without it. */
  private dropCaster(rec: CasterRec): void {
    const mesh = rec.mesh;
    if (this.casters.get(mesh) !== rec) return;
    this.casters.delete(mesh);
    rec.removed = true;
    if (rec.obs) mesh.onAfterWorldMatrixUpdateObservable.remove(rec.obs as never);
    if (rec.disp) mesh.onDisposeObservable.remove(rec.disp as never);
    rec.obs = rec.disp = null;
    this._sunLayer.gen.removeShadowCaster(mesh, false);
    for (const lr of this.pointRecs) lr.shadow?.removeShadowCaster(mesh, false);
    if (rec.hasSphere) this.markBounds(!rec.dynamic, rec.b, rec.large);
    this.listsDirty = true;
  }

  /** Refresh a caster's cached world bounds from its mesh. */
  private readSphere(rec: CasterRec): void {
    const bi = rec.mesh.getBoundingInfo();
    const bs = bi.boundingSphere;
    const c = bs.centerWorld;
    const lo = bi.boundingBox.minimumWorld,
      hi = bi.boundingBox.maximumWorld;
    const b = rec.b;
    b[0] = c.x;
    b[1] = c.y;
    b[2] = c.z;
    b[3] = bs.radiusWorld;
    b[4] = lo.x;
    b[5] = lo.y;
    b[6] = lo.z;
    b[7] = hi.x;
    b[8] = hi.y;
    b[9] = hi.z;
    let ok = true;
    for (let i = 0; i < 10; i++) if (!Number.isFinite(b[i])) ok = false;
    rec.hasSphere = ok;
  }

  /**
   * A caster's bounds changed in the static layers (`stat`: both layers redraw the region) or
   * only among the moving casters (live maps only), in every cached map it can touch: its
   * light-space footprint on the sun map, its AABB's footprint on each cube face it reaches.
   */
  private markBounds(stat: boolean, bb: Float64Array, large: boolean): void {
    if (!stat && !this._quality.dynamicShadows) return; // moving casters are not drawn at all
    const x = bb[0],
      y = bb[1],
      z = bb[2],
      r = bb[3];
    const sun = this._sunLayer;
    if (this.sunWants(x, y, z, r, large)) {
      const b = this.sunBox;
      const rect = this.tmpRect;
      rect.x0 = rect.y0 = rect.x1 = rect.y1 = 0;
      if (addCircleTexels(rect, TMP_C.x, TMP_C.y, r, b.minX, b.minY, b.texelX, b.texelY, sun.size, SUN_RECT_PAD)) {
        if (stat) sun.markStaticRect(0, rect);
        else sun.markLiveRect(0, rect);
      }
    }
    for (const lr of this.pointRecs) {
      const layer = lr.layer;
      if (!layer) continue;
      const p = lr.shadowPos;
      const dx = x - p.x,
        dy = y - p.y,
        dz = z - p.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - r > lr.shadowReach) continue;
      if (!layer.cube) {
        // spot light: one perspective map, redrawn whole
        if (stat) layer.markStaticFaces(1);
        else layer.markLiveFaces(1);
        continue;
      }
      const faces = cubeFaceMask(dx, dy, dz, r);
      const rect = this.tmpRect;
      for (let f = 0; f < 6; f++) {
        if (!(faces & (1 << f)) || !lr.faceViews[f]) continue;
        if (!projectBoxToFace(lr.faceViews[f].m, bb[4], bb[5], bb[6], bb[7], bb[8], bb[9], layer.size, POINT_NEAR, CUBE_RECT_PAD, rect)) continue;
        if (stat) layer.markStaticRect(f, rect);
        else layer.markLiveRect(f, rect);
      }
    }
  }

  /** The six cube-face view matrices of a promoted point light at its `shadowPos` (as its generator builds them). */
  private updateFaceViews(rec: LightRec): void {
    const l = rec.light;
    if (!(l instanceof PointLight)) {
      rec.faceViews.length = 0;
      return;
    }
    const p = rec.shadowPos;
    for (let f = 0; f < 6; f++) {
      const m = rec.faceViews[f] ?? (rec.faceViews[f] = new Matrix());
      const d = TMP_V.copyFrom(l.getShadowDirection(f)).normalize();
      if (Math.abs(Vector3.Dot(d, Vector3.UpReadOnly)) === 1) d.z = 0.0000000000001; // (as ShadowGenerator.getTransformMatrix)
      Matrix.LookAtLHToRef(p, p.add(d), Vector3.UpReadOnly, m);
    }
  }

  private rebuildLists(): void {
    this.listsDirty = false;
    this.staticList.length = 0;
    this.dynamicList.length = 0;
    for (const rec of this.casters.values()) (rec.dynamic ? this.dynamicList : this.staticList).push(rec.mesh);
  }

  /**
   * Per frame, after the meshes were evaluated (world matrices up to date) and before the render
   * targets: apply queued caster changes to the layers, fold settled casters into the static
   * layers, follow moving point lights, and arm the maps with dirty regions.
   */
  private processShadows(): void {
    if (this.disposed) return;
    const t = this.tuning;
    if (!t.staticShadowCache) {
      // uncached: every map redrawn every frame with every caster
      this.queue.length = 0;
      for (const rec of this.casters.values()) rec.queued = 0;
      this._sunLayer.markAll();
      this._sunLayer.arm();
      for (const lr of this.pointRecs) {
        lr.layer?.markAll();
        lr.layer?.arm();
      }
      return;
    }
    const now = this.clock;
    // promoted lights that moved (lamps knocked over, a swinging fixture): redraw their maps
    for (const lr of this.pointRecs) {
      const layer = lr.layer;
      if (!layer) continue;
      const p = this.lightPosition(lr.light);
      if (Vector3.DistanceSquared(p, lr.shadowPos) > 1e-6) {
        lr.shadowPos.copyFrom(p);
        this.updateFaceViews(lr);
        layer.markAll();
      }
    }
    // queued caster changes
    for (let i = 0; i < this.queue.length; i++) {
      const rec = this.queue[i];
      const flags = rec.queued;
      rec.queued = 0;
      if (rec.removed || rec.mesh.isDisposed()) continue;
      const had = rec.hasSphere;
      const old = this.oldBounds;
      old.set(rec.b);
      this.readSphere(rec);
      if (flags & Q_ADDED) {
        // new casters start moving (fragments, rebuilt islands); they settle into the static layer
        rec.dynamic = true;
        rec.changedAt = now;
        rec.ref.set(rec.mesh.worldMatrixFromCache.m);
        this.listsDirty = true;
        if (had) this.markBounds(false, old, rec.large);
      } else {
        if (flags & Q_MOVED) {
          rec.changedAt = now;
          if (!rec.dynamic) {
            // leaves the static layer: redraw it there without the caster
            rec.dynamic = true;
            this.listsDirty = true;
            if (had) this.markBounds(true, old, rec.large);
          } else if (had) this.markBounds(false, old, rec.large);
        }
        if (flags & Q_GEOMETRY && had) this.markBounds(!rec.dynamic, old, rec.large);
      }
      if (rec.hasSphere) this.markBounds(!rec.dynamic && !(flags & Q_ADDED), rec.b, rec.large);
    }
    this.queue.length = 0;
    // settled moving casters → static layers (batched: one static redraw per scan at most)
    if (this.promoteTimer <= 0) {
      this.promoteTimer = PROMOTE_INTERVAL;
      if (this.listsDirty) this.rebuildLists();
      for (const m of this.dynamicList) {
        const rec = this.casters.get(m);
        if (!rec || now - rec.changedAt < t.shadowSettleTime) continue;
        rec.dynamic = false;
        this.listsDirty = true;
        if (rec.hasSphere) this.markBounds(true, rec.b, rec.large);
      }
    }
    if (this.listsDirty) this.rebuildLists();
    // weak-PC presets redraw the cached maps at most every shadowRefreshInterval seconds: dirty
    // regions accumulate meanwhile (a settling debris shower costs a few redraws, not one per frame)
    const interval = this._quality.shadowRefreshInterval;
    if (interval > 0 && now - this.lastArm < interval && now >= this.lastArm) return;
    this.lastArm = now;
    this._sunLayer.arm();
    for (const lr of this.pointRecs) lr.layer?.arm();
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
      if (!disposing) rec.layer?.dispose();
      this.dropPointRec(rec);
    }
    const wasClustered = rec.clustered || rec.culled;
    rec.culled = false;
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
    l.shadowMinZ = POINT_NEAR;
    l.shadowMaxZ = Math.min(l.range, 10);
    rec.shadowPos.copyFrom(this.lightPosition(l));
    rec.shadowReach = Math.min(l.range || 8, 10);
    this.updateFaceViews(rec);
    const ultra = this._quality.pointShadows >= 2;
    const layer = new LayeredShadowMap(l, this.engine, {
      size: ultra ? 1024 : 512,
      layered: this.tuning.staticShadowCache && this.tuning.layeredShadows,
      provider: (kind, face, rects, out) => this.fillPoint(rec, kind, face, rects, out),
      configure: (g) => {
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
      },
    });
    rec.layer = layer;
    rec.shadow = layer.gen;
    this.pointRecs.push(rec);
  }

  private demote(rec: LightRec): void {
    rec.layer?.dispose();
    this.dropPointRec(rec);
    if (!rec.light.isDisposed()) this.joinCluster(rec);
  }

  private dropPointRec(rec: LightRec): void {
    rec.shadow = null;
    rec.layer = null;
    const i = this.pointRecs.indexOf(rec);
    if (i >= 0) this.pointRecs.splice(i, 1);
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
    return r >= Math.max(0.02, this._quality.shadowMinRadius);
  }

  /** Casters of one cube face (or of the whole map of a spot light) of promoted light `rec`, overlapping `rects`. */
  private fillPoint(rec: LightRec, kind: CasterKind, face: number, rects: RectSet | null, out: AbstractMesh[]): void {
    const layer = rec.layer;
    const cube = !!layer?.cube;
    const p = rec.shadowPos;
    const view = cube ? rec.faceViews[face] : undefined;
    const rect = this.tmpRect2;
    const size = layer?.size ?? 0;
    this.forKind(kind, (m) => {
      if (m.isDisposed() || !m.isEnabled() || !this.pointCasterWanted(rec, m)) return;
      if (!cube) {
        out.push(m);
        return;
      }
      const bi = m.getBoundingInfo();
      const bs = bi.boundingSphere;
      const c = bs.centerWorld;
      if (!(cubeFaceMask(c.x - p.x, c.y - p.y, c.z - p.z, bs.radiusWorld) & (1 << face))) return;
      if (rects && view) {
        const lo = bi.boundingBox.minimumWorld,
          hi = bi.boundingBox.maximumWorld;
        if (!projectBoxToFace(view.m, lo.x, lo.y, lo.z, hi.x, hi.y, hi.z, size, POINT_NEAR, 0, rect)) return;
        if (!rects.hitsRect(rect.x0, rect.y0, rect.x1, rect.y1)) return;
      }
      out.push(m);
    });
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

  /**
   * Point shadows: the live map's render list mirrors the casters within reach (introspection and
   * Babylon's readiness checks; drawing uses the per-face layer lists).
   */
  private fillPointCasters(rec: LightRec): void {
    const sm = rec.shadow?.getShadowMap();
    if (!sm) return;
    const list: AbstractMesh[] = [];
    for (const m of this.casters.keys()) if (!m.isDisposed() && this.pointCasterWanted(rec, m)) list.push(m);
    sm.renderList = list;
  }

  // ---- interior-light budget (quality.maxInteriorLights): only the nearest lights stay clustered

  /**
   * Keep at most `maxInteriorLights` interior lights in the cluster: the nearest to the camera
   * (lights in the camera's room count as 3 m nearer; hysteresis keeps the current set). The
   * others leave the cluster (no per-pixel cost at all) and rejoin when the player comes closer.
   * Shadow-promoted lights are never culled.
   */
  private updateClusterBudget(): void {
    const max = Math.max(0, Math.floor(this._quality.maxInteriorLights));
    const cam = this.scene.activeCamera;
    let n = 0;
    for (const rec of this.lights.values()) if (rec.clustered || rec.culled) n++;
    if (n <= max || !cam) {
      for (const rec of this.lights.values()) {
        if (!rec.culled) continue;
        rec.culled = false;
        if (!rec.light.isDisposed()) this.joinCluster(rec);
      }
      return;
    }
    const cp = cam.globalPosition;
    const camRoom = nearestRoom(cp.x, cp.z).id;
    const cands = this.budgetCands;
    cands.length = 0;
    for (const rec of this.lights.values()) {
      if (!(rec.clustered || rec.culled) || rec.light.isDisposed()) continue;
      const lit = rec.base > 0 && !(rec.mains && !this._powered);
      let d = lit ? Vector3.Distance(this.lightPosition(rec.light), cp) : 1e6;
      if (rec.room === camRoom) d -= 3;
      if (rec.clustered) d -= 0.75; // hysteresis
      cands.push({ rec, d });
    }
    cands.sort((a, b) => a.d - b.d);
    for (let i = 0; i < cands.length; i++) {
      const rec = cands[i].rec;
      const keep = i < max;
      if (keep && rec.culled) {
        rec.culled = false;
        this.joinCluster(rec);
      } else if (!keep && rec.clustered) {
        this.leaveCluster(rec, false);
        rec.culled = true;
      }
    }
    cands.length = 0;
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
