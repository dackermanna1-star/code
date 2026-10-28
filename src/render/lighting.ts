// Golden-hour lighting: low west-south-west sun with cascaded shadows through the windows,
// hemispheric sky fill, and the interior lights owned by `light` features (room-based
// light assignment, flicker, mains power, point-light shadows for the nearest fixtures).
//
// Room-based assignment (see env/roomGraph.ts): every registered receiver mesh carries the
// layer-mask bits of the rooms its AABB overlaps (+ WORLD_LAYER_BIT so it stays visible to
// the default camera mask 0x0FFFFFFF); every interior light gets
// `includeOnlyWithLayerMask` = its room + connected rooms. Babylon's `canAffectMesh` then
// gives each mesh only the lights of its own and neighbouring rooms in O(1), so bulbs do not
// leak through solid walls and per-material light limits are respected. Meshes created by
// other systems that are NOT registered keep the default mask and therefore match every
// interior light (capped by their material's maxSimultaneousLights) — register moving
// meshes such as the view model to get correct room lighting.

import {
  CascadedShadowGenerator,
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
  type Light,
  type Material,
  type Scene,
  type SubMesh,
} from "@babylonjs/core";
import type { QualityPreset, Settings } from "../core/settings.ts";
import type { ILighting } from "./contracts.ts";
import type { RoomId } from "../world/plan.ts";
import { ROOM_BIT, WORLD_LAYER_BIT, lightMaskForRoom, nearestRoom, roomMaskForBox } from "./env/roomGraph.ts";
import { SUN_COLOR_HEX, SUN_LIGHT_DIR, TO_SUN, hexToLinear } from "./env/sunModel.ts";
import { noise1 } from "./env/noise.ts";

/** Hard cap of lights per material: sun + sky + 6 interior (12 fragment UBO blocks on ANGLE/D3D11). */
export const MAX_LIGHTS_PER_MATERIAL = 8;

/** Apartment bounds the sun shadows must cover (furniture up to ~2 m, balcony included). */
export const SHADOW_BOUNDS = { min: { x: -1.5, y: -0.3, z: -2.0 }, max: { x: 14.3, y: 3.2, z: 10.2 } } as const;

/** Tunable look parameters (exposed for integration tweaks). */
export interface LightingTuning {
  /** Sun illuminance multiplier (HDR, linear). */
  sunIntensity: number;
  /** Sky fill intensity. */
  skyIntensity: number;
  /** Linear sky (zenith-facing) fill colour. */
  skyColor: [number, number, number];
  /** Linear ground-bounce fill colour (lights ceilings / undersides). */
  groundColor: [number, number, number];
  /** Sun shadow bias / normal bias (CSM). */
  shadowBias: number;
  shadowNormalBias: number;
  /** Distance (m) covered by the cascades from the camera. */
  shadowMaxZ: number;
}

export const DEFAULT_TUNING: LightingTuning = {
  sunIntensity: 3.4,
  skyIntensity: 0.62,
  skyColor: [0.48, 0.56, 0.74],
  groundColor: [0.5, 0.39, 0.3],
  shadowBias: 0.0012,
  shadowNormalBias: 0.012,
  shadowMaxZ: 24,
};

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
}

interface ReceiverRec {
  mesh: AbstractMesh;
  rooms: number;
  cx: number;
  cz: number;
  ext: number;
}

const TMP_V = new Vector3();

export class Lighting implements ILighting {
  readonly sun: DirectionalLight;
  /** Hemispheric sky fill. */
  readonly sky: HemisphericLight;
  readonly settings: Settings;
  readonly tuning: LightingTuning;
  /** Unit vector towards the sun (world). */
  readonly toSun: Vector3;
  /** Linear sun colour (per unit intensity). */
  readonly sunColor: Color3;

  private readonly scene: Scene;
  private _quality: QualityPreset;
  private _sunShadows!: ShadowGenerator;
  private csm: CascadedShadowGenerator | null = null;
  private appliedMaxZ = false;

  private readonly casters = new Map<AbstractMesh, boolean>();
  private readonly receivers: ReceiverRec[] = [];
  private readonly receiverIndex = new Map<AbstractMesh, number>();
  private receiverCursor = 0;
  private readonly receiverMaterials = new Set<Material>();
  private maxNeeded = 4;

  private readonly lights = new Map<Light, LightRec>();
  private readonly pointGens = new Map<Light, ShadowGenerator>();
  private _powered = true;

  private trackTimer = 0;
  private pointTimer = 0;
  private pruneTimer = 0;

  constructor(scene: Scene, settings: Settings, tuning: Partial<LightingTuning> = {}) {
    this.scene = scene;
    this.settings = settings;
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this._quality = settings.quality;
    this.toSun = new Vector3(TO_SUN.x, TO_SUN.y, TO_SUN.z);
    const [sr, sg, sb] = hexToLinear(SUN_COLOR_HEX);
    this.sunColor = new Color3(sr, sg, sb);

    // ---- sun
    const dir = new Vector3(SUN_LIGHT_DIR.x, SUN_LIGHT_DIR.y, SUN_LIGHT_DIR.z);
    this.sun = new DirectionalLight("sun", dir, scene);
    this.sun.diffuse = this.sunColor.clone();
    this.sun.specular = this.sunColor.clone();
    this.sun.intensity = this.tuning.sunIntensity;
    const c = new Vector3((SHADOW_BOUNDS.min.x + SHADOW_BOUNDS.max.x) / 2, 1.3, (SHADOW_BOUNDS.min.z + SHADOW_BOUNDS.max.z) / 2);
    this.sun.position = c.subtract(dir.scale(40));
    this.sun.renderPriority = 1000;

    // ---- sky fill: cool zenith, warm bounce from the sunlit floors below
    this.sky = new HemisphericLight("skyFill", new Vector3(0, 1, 0), scene);
    this.sky.diffuse = new Color3(...this.tuning.skyColor);
    this.sky.groundColor = new Color3(...this.tuning.groundColor);
    this.sky.specular = new Color3(0.04, 0.045, 0.05);
    this.sky.intensity = this.tuning.skyIntensity;
    this.sky.renderPriority = 999;

    this.createSunShadows(this._quality);
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

  /** True when the sun uses cascaded shadow maps (else a fitted single map). */
  get cascaded(): boolean {
    return this.csm !== null;
  }

  setShadowCaster(mesh: AbstractMesh, cast: boolean, large = false): void {
    if (!mesh || mesh.isDisposed()) return;
    if (cast) {
      const had = this.casters.has(mesh);
      this.casters.set(mesh, large);
      if (!had) this._sunShadows.addShadowCaster(mesh, false);
    } else {
      if (!this.casters.delete(mesh)) return;
      this._sunShadows.removeShadowCaster(mesh, false);
      for (const g of this.pointGens.values()) g.removeShadowCaster(mesh, false);
    }
  }

  registerReceiver(mesh: AbstractMesh): void {
    if (!mesh || mesh.isDisposed()) return;
    mesh.receiveShadows = true;
    let idx = this.receiverIndex.get(mesh);
    if (idx === undefined) {
      idx = this.receivers.length;
      this.receivers.push({ mesh, rooms: -1, cx: NaN, cz: NaN, ext: NaN });
      this.receiverIndex.set(mesh, idx);
    }
    this.refreshReceiver(this.receivers[idx], true);
    this.trackMaterial(mesh);
  }

  unregisterReceiver(mesh: AbstractMesh): void {
    const idx = this.receiverIndex.get(mesh);
    if (idx === undefined) return;
    this.removeReceiverAt(idx);
  }

  addLight(light: Light, roomId: string | null, mains: boolean): void {
    if (!light || light.isDisposed()) return;
    const fixed = roomId && (ROOM_BIT as Record<string, number>)[roomId] !== undefined ? (roomId as RoomId) : null;
    const room = fixed ?? this.roomOfLight(light);
    const rec: LightRec = {
      light,
      fixedRoom: fixed,
      room,
      mains,
      base: light.intensity,
      written: light.intensity,
      flickerLeft: 0,
      flickerTime: 0,
      seed: (Math.random() * 1e6) | 0,
      effective: light.intensity,
    };
    this.lights.set(light, rec);
    if (light.renderPriority < 1 || light.renderPriority >= 999) light.renderPriority = 10;
    light.includeOnlyWithLayerMask = lightMaskForRoom(room);
    this.recountLights();
    this.applyPowerAndFlicker(rec, 0);
  }

  removeLight(light: Light): void {
    const rec = this.lights.get(light);
    if (!rec) return;
    this.lights.delete(light);
    const gen = this.pointGens.get(light);
    if (gen) {
      gen.dispose();
      this.pointGens.delete(light);
    }
    if (!light.isDisposed()) {
      // Hand the light back in its nominal state.
      light.intensity = rec.base;
      light.includeOnlyWithLayerMask = 0;
    }
    this.recountLights();
  }

  flicker(light: Light, seconds: number): void {
    const rec = this.lights.get(light);
    if (!rec || !(seconds > 0)) return;
    rec.flickerLeft = Math.max(rec.flickerLeft, Math.min(seconds, 3600));
  }

  setPower(on: boolean): void {
    if (this._powered === on) return;
    this._powered = on;
    for (const rec of this.lights.values()) this.applyPowerAndFlicker(rec, 0);
    if (!on) this.pointTimer = 0; // reselect shadowed lights right away
  }

  applyQuality(q: QualityPreset): void {
    const prev = this._quality;
    this._quality = q;
    const csmWanted = CascadedShadowGenerator.IsSupported && q.shadowCascades >= 2;
    if (csmWanted !== (this.csm !== null)) {
      this.createSunShadows(q);
    } else {
      if (prev.shadowMapSize !== q.shadowMapSize) this._sunShadows.mapSize = q.shadowMapSize;
      if (this.csm && this.csm.numCascades !== this.cascadeCount(q)) this.csm.numCascades = this.cascadeCount(q);
      this._sunShadows.filteringQuality = this.filterQuality(q);
    }
    if (q.pointShadows < this.pointGens.size) this.pointTimer = 0;
  }

  update(dt: number): void {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    // CSM range needs a camera; apply once one exists.
    if (this.csm && !this.appliedMaxZ && this.scene.activeCamera) {
      this.csm.shadowMaxZ = Math.min(this.tuning.shadowMaxZ, this.scene.activeCamera.maxZ || this.tuning.shadowMaxZ);
      this.appliedMaxZ = true;
    }
    // Interior lights: power, flicker, external intensity changes, disposal.
    for (const rec of this.lights.values()) {
      if (rec.light.isDisposed()) {
        this.lights.delete(rec.light);
        const g = this.pointGens.get(rec.light);
        if (g) {
          g.dispose();
          this.pointGens.delete(rec.light);
        }
        this.recountLights();
        continue;
      }
      this.applyPowerAndFlicker(rec, step);
    }
    // Portable lights follow their island between rooms.
    this.trackTimer -= step;
    if (this.trackTimer <= 0) {
      this.trackTimer = 0.4;
      let changed = false;
      for (const rec of this.lights.values()) {
        if (rec.fixedRoom) continue;
        const room = this.roomOfLight(rec.light);
        if (room !== rec.room) {
          rec.room = room;
          rec.light.includeOnlyWithLayerMask = lightMaskForRoom(room);
          changed = true;
        }
      }
      if (changed) this.recountLights();
    }
    // Receivers: round-robin room re-assignment (moving debris, thrown furniture).
    const n = this.receivers.length;
    if (n > 0) {
      const k = Math.min(n, Math.max(24, Math.ceil(n / 18)));
      for (let i = 0; i < k && this.receivers.length > 0; i++) {
        if (this.receiverCursor >= this.receivers.length) this.receiverCursor = 0;
        const rec = this.receivers[this.receiverCursor];
        if (rec.mesh.isDisposed()) {
          this.removeReceiverAt(this.receiverCursor);
          continue;
        }
        this.refreshReceiver(rec, false);
        this.receiverCursor++;
      }
    }
    // Point-light shadows for the nearest powered fixtures.
    this.pointTimer -= step;
    if (this.pointTimer <= 0) {
      this.pointTimer = 0.5;
      this.updatePointShadows();
    }
    // Drop disposed casters now and then (Babylon already removed them from the maps).
    this.pruneTimer -= step;
    if (this.pruneTimer <= 0) {
      this.pruneTimer = 2;
      for (const m of this.casters.keys()) if (m.isDisposed()) this.casters.delete(m);
    }
  }

  // ------------------------------------------------------------------ extras

  /** Number of interior lights currently managed. */
  get lightCount(): number {
    return this.lights.size;
  }

  /** Point lights currently casting shadows (debug). */
  get shadowedLights(): Light[] {
    return [...this.pointGens.keys()];
  }

  /** Room bits currently assigned to a receiver (debug/tests); -1 if not registered. */
  roomsOf(mesh: AbstractMesh): number {
    const i = this.receiverIndex.get(mesh);
    return i === undefined ? -1 : this.receivers[i].rooms;
  }

  dispose(): void {
    for (const g of this.pointGens.values()) g.dispose();
    this.pointGens.clear();
    this._sunShadows.dispose();
    this.sun.dispose();
    this.sky.dispose();
    this.lights.clear();
    this.receivers.length = 0;
    this.receiverIndex.clear();
    this.casters.clear();
  }

  // ------------------------------------------------------------------ internals

  private cascadeCount(q: QualityPreset): number {
    return Math.max(2, Math.min(4, Math.round(q.shadowCascades)));
  }

  private filterQuality(q: QualityPreset): number {
    return q.shadowMapSize >= 4096 ? ShadowGenerator.QUALITY_HIGH : q.shadowMapSize >= 2048 ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
  }

  private createSunShadows(q: QualityPreset): void {
    const old = this._sunShadows as ShadowGenerator | undefined;
    if (old) old.dispose();
    this.csm = null;
    this.appliedMaxZ = false;
    let gen: ShadowGenerator;
    if (CascadedShadowGenerator.IsSupported && q.shadowCascades >= 2) {
      const csm = new CascadedShadowGenerator(q.shadowMapSize, this.sun);
      csm.numCascades = this.cascadeCount(q);
      csm.stabilizeCascades = true; // no shimmering when the camera turns
      csm.lambda = 0.8;
      csm.cascadeBlendPercentage = 0.1;
      csm.depthClamp = true; // casters behind the cascade near plane still occlude
      csm.shadowMaxZ = this.tuning.shadowMaxZ;
      csm.customAllowRendering = (sm: SubMesh) => this.allowInCascade(sm);
      this.csm = csm;
      gen = csm;
    } else {
      gen = new ShadowGenerator(q.shadowMapSize, this.sun);
      this.fitSunFrustum();
    }
    gen.usePercentageCloserFiltering = true;
    gen.filteringQuality = this.filterQuality(q);
    gen.bias = this.tuning.shadowBias;
    gen.normalBias = this.tuning.shadowNormalBias;
    gen.darkness = 0;
    gen.transparencyShadow = false;
    this._sunShadows = gen;
    for (const m of this.casters.keys()) if (!m.isDisposed()) gen.addShadowCaster(m, false);
  }

  /** Fallback (no CSM): one stable orthographic map fitted to the apartment in light space. */
  private fitSunFrustum(): void {
    const s = this.sun;
    s.autoUpdateExtends = false;
    s.autoCalcShadowZBounds = false;
    const view = Matrix.LookAtLH(s.position, s.position.add(s.direction), Vector3.Up());
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
          Vector3.TransformCoordinatesToRef(new Vector3(x, y, z), view, TMP_V);
          minX = Math.min(minX, TMP_V.x);
          maxX = Math.max(maxX, TMP_V.x);
          minY = Math.min(minY, TMP_V.y);
          maxY = Math.max(maxY, TMP_V.y);
          minZ = Math.min(minZ, TMP_V.z);
          maxZ = Math.max(maxZ, TMP_V.z);
        }
    s.orthoLeft = minX;
    s.orthoRight = maxX;
    s.orthoBottom = minY;
    s.orthoTop = maxY;
    s.shadowMinZ = Math.max(0.1, minZ - 30);
    s.shadowMaxZ = maxZ + 1;
  }

  /** Per-cascade caster culling: outside the cascade box → skip; tiny meshes skip coarse cascades. */
  private allowInCascade(subMesh: SubMesh): boolean {
    const csm = this.csm;
    if (!csm) return true;
    const layer = (csm as unknown as { _currentLayer?: number })._currentLayer ?? 0;
    const view = csm.getCascadeViewMatrix(layer);
    const mn = csm.getCascadeMinExtents(layer);
    const mx = csm.getCascadeMaxExtents(layer);
    if (!view || !mn || !mx) return true;
    const mesh = subMesh.getMesh();
    const bs = mesh.getBoundingInfo().boundingSphere;
    const r = bs.radiusWorld;
    Vector3.TransformCoordinatesToRef(bs.centerWorld, view, TMP_V);
    const margin = r + (mx.x - mn.x) / Math.max(1, csm.mapSize); // + one texel (snapping)
    if (TMP_V.x + margin < mn.x || TMP_V.x - margin > mx.x || TMP_V.y + margin < mn.y || TMP_V.y - margin > mx.y) return false;
    if (TMP_V.z - r > mx.z) return false; // entirely beyond the far plane (near side is depth-clamped)
    if (!this.casters.get(mesh as AbstractMesh)) {
      const texel = (mx.x - mn.x) / Math.max(1, csm.mapSize);
      if (2 * r < 3 * texel) return false; // its shadow would be under ~3 texels in this cascade
    }
    return true;
  }

  private roomOfLight(light: Light): RoomId {
    const p = this.lightPosition(light);
    return nearestRoom(p.x, p.z).id;
  }

  private lightPosition(light: Light): Vector3 {
    if (light instanceof ShadowLight) {
      light.computeWorldMatrix(true);
      const parent = light.parent;
      if (parent) {
        Vector3.TransformCoordinatesToRef(light.position, parent.getWorldMatrix(), TMP_V);
        return TMP_V;
      }
      return light.position;
    }
    return TMP_V.setAll(0); // hemispheric/area lights: position irrelevant
  }

  private applyPowerAndFlicker(rec: LightRec, dt: number): void {
    const l = rec.light;
    if (Math.abs(l.intensity - rec.written) > 1e-7) rec.base = l.intensity; // owner changed it
    let f = 1;
    if (rec.mains && !this._powered) {
      f = 0;
    } else if (rec.flickerLeft > 0) {
      rec.flickerLeft -= dt;
      rec.flickerTime += dt;
      f = rec.flickerLeft > 0 ? flickerLevel(rec.flickerTime, rec.seed) : 1;
    }
    const eff = rec.base * f;
    if (l.intensity !== eff) l.intensity = eff;
    rec.written = l.intensity;
    rec.effective = eff;
  }

  // ---- receivers

  private refreshReceiver(rec: ReceiverRec, force: boolean): void {
    const mesh = rec.mesh;
    if (force) mesh.computeWorldMatrix(true);
    const bb = mesh.getBoundingInfo().boundingBox;
    const c = bb.centerWorld;
    const ext = bb.extendSizeWorld.x + bb.extendSizeWorld.z;
    if (!force && Math.abs(c.x - rec.cx) + Math.abs(c.z - rec.cz) < 0.12 && Math.abs(ext - rec.ext) < 0.05) return;
    rec.cx = c.x;
    rec.cz = c.z;
    rec.ext = ext;
    const rooms = roomMaskForBox(bb.minimumWorld.x, bb.maximumWorld.x, bb.minimumWorld.z, bb.maximumWorld.z);
    if (rooms === rec.rooms && !force) return;
    const grew = rooms & ~Math.max(rec.rooms, 0);
    rec.rooms = rooms;
    const mask = (mesh.layerMask & 0xf0000000) | WORLD_LAYER_BIT | rooms;
    if (mesh.layerMask !== mask) mesh.layerMask = mask; // resyncs mesh.lightSources (O(lights))
    if (grew) this.raiseMaterialLimit(this.countLights(rooms));
  }

  private removeReceiverAt(idx: number): void {
    const last = this.receivers.length - 1;
    const rec = this.receivers[idx];
    this.receiverIndex.delete(rec.mesh);
    if (idx !== last) {
      const moved = this.receivers[last];
      this.receivers[idx] = moved;
      this.receiverIndex.set(moved.mesh, idx);
    }
    this.receivers.pop();
  }

  private trackMaterial(mesh: AbstractMesh): void {
    const mat = mesh.material;
    if (!mat) return;
    const subs = (mat as unknown as { subMaterials?: Array<Material | null> }).subMaterials;
    const list = subs ? subs.filter((m): m is Material => !!m) : [mat];
    for (const m of list) {
      if (!("maxSimultaneousLights" in m) || this.receiverMaterials.has(m)) continue;
      this.receiverMaterials.add(m);
      this.applyLimit(m);
    }
  }

  /** Interior lights whose include mask touches `rooms`. */
  private countLights(rooms: number): number {
    let n = 0;
    for (const rec of this.lights.values()) if (rec.light.includeOnlyWithLayerMask & rooms) n++;
    return n;
  }

  private raiseMaterialLimit(interior: number): void {
    const needed = Math.min(MAX_LIGHTS_PER_MATERIAL, 2 + interior);
    if (needed <= this.maxNeeded) return;
    this.maxNeeded = needed;
    for (const m of this.receiverMaterials) this.applyLimit(m);
  }

  private applyLimit(m: Material): void {
    const mm = m as Material & { maxSimultaneousLights: number };
    if (typeof mm.maxSimultaneousLights === "number" && mm.maxSimultaneousLights < this.maxNeeded) mm.maxSimultaneousLights = this.maxNeeded;
  }

  /** Re-evaluate the per-material light budget after lights were added/moved/removed. */
  private recountLights(): void {
    const masks = new Set<number>();
    for (const r of this.receivers) if (r.rooms > 0) masks.add(r.rooms);
    let worst = 0;
    for (const m of masks) worst = Math.max(worst, this.countLights(m));
    this.raiseMaterialLimit(worst);
  }

  // ---- point-light shadows

  private updatePointShadows(): void {
    const want = Math.max(0, Math.floor(this._quality.pointShadows));
    const cam = this.scene.activeCamera;
    const chosen: Light[] = [];
    if (want > 0 && cam) {
      const cp = cam.globalPosition;
      const cands: Array<{ l: Light; d: number }> = [];
      for (const rec of this.lights.values()) {
        const l = rec.light;
        if (!(l instanceof PointLight || l instanceof SpotLight)) continue;
        if (!l.isEnabled() || rec.effective <= 0.02) continue;
        const p = this.lightPosition(l);
        let d = Vector3.Distance(p, cp);
        if (this.pointGens.has(l)) d -= 1.2; // hysteresis: keep the current choice unless clearly beaten
        cands.push({ l, d });
      }
      cands.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(want, cands.length); i++) chosen.push(cands[i].l);
    }
    for (const [l, g] of this.pointGens) {
      if (!chosen.includes(l)) {
        g.dispose();
        this.pointGens.delete(l);
      }
    }
    for (const l of chosen) {
      let g = this.pointGens.get(l);
      if (!g) {
        const sl = l as PointLight | SpotLight;
        sl.shadowMinZ = 0.05;
        sl.shadowMaxZ = 9;
        g = new ShadowGenerator(this._quality.pointShadows >= 2 ? 1024 : 512, sl);
        g.usePoissonSampling = true;
        g.bias = 0.004;
        g.normalBias = 0.01;
        g.darkness = 0;
        g.transparencyShadow = false;
        const sm = g.getShadowMap();
        if (sm) sm.refreshRate = this._quality.pointShadows >= 2 ? 1 : 2;
        this.pointGens.set(l, g);
      }
      this.fillPointCasters(l, g);
    }
  }

  /** Point shadows: casters within reach of the light, minus the fixture around the bulb. */
  private fillPointCasters(light: Light, gen: ShadowGenerator): void {
    const sm = gen.getShadowMap();
    if (!sm) return;
    const p = this.lightPosition(light).clone();
    const range = Math.min((light as PointLight).range ?? 8, 8);
    const list: AbstractMesh[] = [];
    for (const m of this.casters.keys()) {
      if (m.isDisposed()) continue;
      const bs = m.getBoundingInfo().boundingSphere;
      const d = Vector3.Distance(bs.centerWorld, p);
      if (d - bs.radiusWorld > range) continue;
      if (bs.radiusWorld < 0.6 && d < bs.radiusWorld + 0.05) continue; // lamp shade / fixture enclosing the bulb
      if (bs.radiusWorld < 0.03) continue;
      list.push(m);
    }
    sm.renderList = list;
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
