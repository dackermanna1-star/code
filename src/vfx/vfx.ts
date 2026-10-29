// VFX system: particles (dust, splinters, sparks, glass glitter, water, smoke, ...), micro-debris
// (persistent tiny fragments without physics bodies) and decals (marks, puddles, settled dust),
// reacting to gameplay events. Implements VfxSystem (src/core/context.ts).
//
// Integration (main loop):
//   fixed step: destruction.afterPhysics() → vfx.fixedUpdate(FIXED_DT)   (micro-debris sim)
//   per frame:  vfx.update(frameDt × time.scale)  before scene.render()  (particles, uploads,
//               decals; dt = 0 freezes all effects while paused)
// The integrator provides `groundProbe(x, y, z)`: height of the first surface below the point
// (a downward physics raycast that ignores the player capsule), and should pass the render
// system's world material + `registerMesh: m => lighting.registerReceiver(m)` so micro-debris
// meshes get room-correct lights and shadows.
//
// API semantics beyond the contract:
//   burst(kind, pos, normal, intensity)  intensity 1 ≈ a hammer-sized hit; 0.2 = a whisper of
//                                        dust; 5–8 = a shattered window / sledged wall.
//   emitter(kind, pos, dir, rate)        rate is a strength multiplier, 1 = nominal (burst mains
//                                        pipe ≈ 0.25 L/s spray, extinguisher at full blast);
//                                        0 pauses; capped at 2.5× nominal. Legacy values > 8 are
//                                        read as caller particle rates relative to the first one
//                                        (= strength 1), see emitterRate.ts. Water/liquid
//                                        emitters grow puddles where their spray lands.
//   micro(kind, pos, vel, size, surf, tint) size = largest extent (m), surf = surface index of
//                                        the parent part, tint = 0xRRGGBB face tint.
//   decal(kind, pos, normal, size)       size = diameter (m); world-space quads, removed again
//                                        when their support breaks or is moved away (fracture /
//                                        split / grab / throw / drop / heavy impact and tool-hit
//                                        re-checks); puddles near an
//                                        existing one enlarge it.
// Optional createVfx hooks: `lightLevel(x,y,z)` (exact light level for unlit sprites),
// `roomMaskAt(x,z)` (room layer bits so lights of other rooms are ignored by the estimate),
// `zoneOf/zoneBounds` (micro-debris mesh zones; default: the apartment's rooms, see zones.ts),
// `registerMesh/unregisterMesh` (Lighting receiver registration). `vfx.stats()` feeds the
// debug overlay (particles, budget, micro moving/settled, decals, timings).

import type { AbstractMesh, Material, Scene } from "@babylonjs/core";
import type { EmitterHandle, VfxKind, VfxSystem } from "../core/context.ts";
import type { EventBus, GameEvents } from "../core/events.ts";
import type { Settings } from "../core/settings.ts";
import type { Vec3 } from "../geom/vec.ts";
import type { MicroKind } from "../destruction/model/materials.ts";
import { S, SURFACES, registerSurface, surfaceDef, type SurfaceName } from "../render/surfaces.ts";
import { colorAttrib, surfAttrib } from "../render/batch.ts";
import { createBitsAtlas, createPuffAtlas } from "./atlas.ts";
import { Decals } from "./decals.ts";
import { LightSampler } from "./light.ts";
import { MicroRenderer } from "./microRender.ts";
import { MicroSim, MICRO_KIND_INDEX, type MicroSpawn } from "./microSim.ts";
import { NO_GROUND, ParticleFx, type BurstOptions } from "./particles.ts";
import { PROFILES } from "./profiles.ts";
import { Reactions } from "./reactions.ts";
import { roomZoneBounds, roomZoneOf, type ZoneRect } from "./zones.ts";

export interface CreateVfxOptions {
  scene: Scene;
  events: EventBus<GameEvents>;
  settings: Settings;
  /** Height of the first surface below (x, y, z), or null (nothing below). */
  groundProbe: (x: number, y: number, z: number) => number | null;
  /** Shared texture-array world material (render-core); micro-debris instances use it. */
  worldMaterial?: Material;
  /** Optional exact local light level (~0..1.2); default: estimated from the scene lights. */
  lightLevel?: (x: number, y: number, z: number) => number;
  /**
   * Optional room layer mask at (x, z) — e.g. `(x, z) => roomMaskForBox(x, x, z, z)` from
   * src/render/env/roomGraph.ts — so the light estimate ignores lights of other rooms
   * (lights restricted with includeOnlyWithLayerMask, as the Lighting system does).
   */
  roomMaskAt?: (x: number, z: number) => number;
  /** Called for every opaque mesh VFX creates (e.g. Lighting.registerReceiver). */
  registerMesh?: (mesh: AbstractMesh) => void;
  unregisterMesh?: (mesh: AbstractMesh) => void;
  /**
   * Micro-debris zone of a spawn point (0..MAX_ZONES-1) and its horizontal bounds; each zone is
   * one mesh per chunk shape, lit by the lights of the room(s) its bounds overlap. Default: one
   * zone per apartment room (src/world/plan.ts ROOMS) plus a 4 m grid outside them.
   */
  zoneOf?: (x: number, y: number, z: number) => number;
  zoneBounds?: (zone: number) => ZoneRect;
}

export interface VfxStats {
  particles: number;
  queued: number;
  budget: number;
  emitters: number;
  micro: number;
  microMoving: number;
  microSettled: number;
  microMeshes: number;
  probesTotal: number;
  decals: number;
  puddles: number;
  fixedMs: number;
  updateMs: number;
  uploadedFloats: number;
}

/** Default surface when a caller passes an invalid surface index. */
const KIND_SURF: Record<Exclude<MicroKind, "none">, SurfaceName> = {
  glass: "glass_edge",
  ceramic: "ceramic_bisque",
  wood: "wood_fiber",
  gypsum: "gypsum",
  concrete: "concrete_broken",
  plastic: "plastic",
  metal: "metal_raw",
  foam: "foam",
  paper: "paper",
  soil: "soil",
};

/**
 * Broken glass crumbs: the transparent pane surfaces render through the glass mesh, which
 * instanced debris cannot use; `glass_edge` (meant for thin cut edges) reads as green candy on
 * a whole crumb. This glossy, faintly cool-tinted white surface reads as clear glass bits.
 */
function glassCrumbSurface(): number {
  return registerSurface({ name: "vfx_glass_crumb", tex: "proc:white", worldSize: 0.1, roughness: 0.04, metallic: 0, tint: 0xd2e8e0 });
}

/** Litres per second at emitter rate 1. */
const FLOW: Partial<Record<VfxKind, number>> = { water: 0.25, liquid: 0.3, waterDrip: 0.0006 };

const finite3 = (v: Vec3 | null | undefined): v is Vec3 => !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

interface PuddleFeed {
  litres: number;
  t: number;
}

/** Deferred decal support re-check (bodies need a moment to fall away after a break). */
interface Revalidation {
  x: number;
  y: number;
  z: number;
  radius: number;
  /** Only decals that existed when the event happened. */
  stamp: number;
  /** Seconds since the event. */
  age: number;
  /** Index into REVALIDATE_AT of the next check. */
  next: number;
}

/** When (s after the event) decal supports are re-probed. */
const REVALIDATE_AT = [0.15, 0.6, 1.6];
const MAX_REVALIDATIONS = 48;
export class Vfx implements VfxSystem {
  readonly scene: Scene;
  readonly light: LightSampler;
  readonly fx: ParticleFx;
  readonly sim: MicroSim;
  readonly microRender: MicroRenderer;
  readonly decals: Decals;
  readonly reactions: Reactions;
  private readonly settings: Settings;
  private readonly groundProbe: (x: number, y: number, z: number) => number | null;
  private readonly detach: () => void;
  private readonly atlases: Array<{ dispose(): void }>;
  private time = 0;
  private frame = 1;
  private disposed = false;
  private fixedMs = 0;
  private updateMs = 0;
  private readonly feeds = new WeakMap<object, PuddleFeed>();
  private readonly revals: Revalidation[] = [];
  // ground cache (per frame)
  private readonly gKey = new Int32Array(512);
  private readonly gVal = new Float32Array(512);
  private readonly gStamp = new Uint32Array(512);
  // scratch
  private readonly tmpSurf = new Float32Array(4);
  private readonly tmpCol = new Float32Array(4);
  private readonly glassSurf = glassCrumbSurface();
  private readonly spawnRec: MicroSpawn = { kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.01, r: 1, g: 1, b: 1, a: 1, s0: 0, s1: 0, s2: 0, s3: 0 };

  constructor(opts: CreateVfxOptions) {
    const scene = opts.scene;
    this.scene = scene;
    this.settings = opts.settings;
    this.groundProbe = opts.groundProbe;
    this.light = new LightSampler(scene);
    if (opts.lightLevel) this.light.override = opts.lightLevel;
    if (opts.roomMaskAt) this.light.roomMaskAt = opts.roomMaskAt;
    const puff = createPuffAtlas(scene);
    const bits = createBitsAtlas(scene);
    this.atlases = [puff, bits];
    this.fx = new ParticleFx(
      scene,
      {
        groundAt: (x, y, z) => this.groundAt(x, y, z),
        light: (x, y, z) => this.light.sample(x, y, z),
        quality: () => this.settings.quality.particles,
      },
      puff,
      bits,
    );
    this.fx.prewarm(0.4);
    this.sim = new MicroSim({
      capacity: this.settings.quality.microDebrisMax,
      groundProbe: (x, y, z) => this.groundProbe(x, y, z),
      zoneOf: opts.zoneOf ?? roomZoneOf,
    });
    this.microRender = new MicroRenderer(scene, this.sim, {
      material: opts.worldMaterial ?? null,
      registerMesh: opts.registerMesh,
      unregisterMesh: opts.unregisterMesh,
      zoneBounds: opts.zoneBounds ?? (opts.zoneOf ? undefined : roomZoneBounds),
    });
    this.decals = new Decals(scene, { light: (x, y, z) => this.light.sample(x, y, z) });
    this.reactions = new Reactions({
      burst: (k, p, n, i, o) => this.burst(k, p, n, i, o),
      kick: (p, r, s) => {
        this.sim.kick(p.x, p.y, p.z, r, s);
      },
      dustPatch: (p, size, tint, n) => this.dustPatch(p, size, tint, n),
      disturb: (p, r) => this.sim.disturb(p.x, p.y, p.z, r),
      revalidate: (p, r, sr) => this.revalidateDecals(p, r, sr),
      now: () => this.time,
      random: Math.random,
    });
    this.detach = this.reactions.attach(opts.events);
    this.settings.onChange(() => {
      if (!this.disposed) this.sim.setCapacity(this.settings.quality.microDebrisMax);
    });
  }

  // ------------------------------------------------------------------ VfxSystem
  get particleCount(): number {
    return this.fx.particleCount;
  }

  get microCount(): number {
    return this.sim.count;
  }

  burst(kind: VfxKind, pos: Vec3, normal: Vec3, intensity: number, opts?: { tint?: number; dir?: Vec3; radius?: number }): void {
    if (this.disposed || !finite3(pos)) return;
    this.fx.burst(kind, pos, finite3(normal) ? normal : { x: 0, y: 1, z: 0 }, intensity, opts as BurstOptions | undefined);
  }

  emitter(kind: VfxKind, pos: Vec3, dir: Vec3, rate: number, opts?: { tint?: number }): EmitterHandle {
    return this.fx.emitter(kind, finite3(pos) ? pos : { x: 0, y: -1000, z: 0 }, finite3(dir) ? dir : { x: 0, y: -1, z: 0 }, rate, opts);
  }

  micro(kind: MicroKind, pos: Vec3, vel: Vec3, size: number, surf: number, tint: number): void {
    if (this.disposed || kind === "none") return;
    const ki = MICRO_KIND_INDEX[kind];
    if (ki === undefined || !finite3(pos) || !(size > 0) || !Number.isFinite(size)) return;
    // quality density: 0.4 keeps 40 %, 1.4 adds a smaller sibling 40 % of the time
    const q = Math.max(0, this.settings.quality.microDebris);
    const n = Math.floor(q + Math.random());
    if (n <= 0) return;
    const s = this.surfaceFor(kind, surf);
    const t = Number.isFinite(tint) ? tint : 0xffffff;
    surfAttrib(s, this.tmpSurf, 0);
    colorAttrib(s, t, this.tmpCol, 0);
    const sp = this.spawnRec;
    sp.kind = ki;
    sp.r = this.tmpCol[0];
    sp.g = this.tmpCol[1];
    sp.b = this.tmpCol[2];
    sp.a = 1; // opaque instances (alpha is written to the framebuffer)
    sp.s0 = this.tmpSurf[0];
    sp.s1 = this.tmpSurf[1];
    sp.s2 = this.tmpSurf[2];
    sp.s3 = 0; // broken pieces never glow
    const v = finite3(vel) ? vel : { x: 0, y: 0, z: 0 };
    for (let k = 0; k < n; k++) {
      const sib = k > 0;
      const j = sib ? size : 0;
      sp.x = pos.x + (Math.random() - 0.5) * j;
      sp.y = pos.y + (Math.random() - 0.5) * j;
      sp.z = pos.z + (Math.random() - 0.5) * j;
      const vj = sib ? 0.25 : 0;
      sp.vx = v.x * (1 + (Math.random() - 0.5) * vj);
      sp.vy = v.y * (1 + (Math.random() - 0.5) * vj);
      sp.vz = v.z * (1 + (Math.random() - 0.5) * vj);
      sp.size = sib ? size * (0.45 + Math.random() * 0.25) : size;
      this.sim.spawn(sp);
    }
  }

  decal(kind: "impact" | "scorch" | "puddle" | "crack", pos: Vec3, normal: Vec3, size: number): void {
    if (this.disposed || !finite3(pos)) return;
    const n = finite3(normal) ? normal : { x: 0, y: 1, z: 0 };
    this.decals.add(kind, pos.x, pos.y, pos.z, n.x, n.y, n.z, size);
  }

  fixedUpdate(dt: number): void {
    if (this.disposed) return;
    const t0 = performance.now();
    this.sim.step(dt);
    this.fixedMs = performance.now() - t0;
  }

  update(dt: number): void {
    if (this.disposed) return;
    const t0 = performance.now();
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.time += d;
    this.frame = (this.frame + 1) >>> 0 || 1;
    this.light.tick(d);
    this.fx.update(d);
    if (d > 0) {
      this.feedPuddles(d);
      this.reactions.update(); // periodic support re-checks around a held object's grab spot
      this.runRevalidations(d);
    }
    this.microRender.sync();
    this.decals.update(d);
    this.updateMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------ helpers
  /** Ground height below a point (cached per frame on a 10 cm grid). NO_GROUND if none. */
  groundAt(x: number, y: number, z: number): number {
    if (!Number.isFinite(x + y + z)) return NO_GROUND;
    const key = (Math.imul(Math.floor(x * 10), 73856093) ^ Math.imul(Math.floor(z * 10), 19349663) ^ Math.imul(Math.floor(y * 4), 83492791)) | 0;
    const slot = key & 511;
    if (this.gStamp[slot] === this.frame && this.gKey[slot] === key) return this.gVal[slot];
    let h: number | null;
    try {
      h = this.groundProbe(x, y, z);
    } catch {
      h = null;
    }
    const v = h === null || !Number.isFinite(h) ? NO_GROUND : Math.min(h, y);
    this.gStamp[slot] = this.frame;
    this.gKey[slot] = key;
    this.gVal[slot] = v;
    return v;
  }

  private surfaceFor(kind: Exclude<MicroKind, "none">, surf: number): number {
    if (Number.isInteger(surf) && surf >= 0 && surf < SURFACES.length) {
      // transparent panes break into opaque, glossy, faintly green crumbs
      const def = surfaceDef(surf);
      return def.transparent || def.name === "glass_edge" ? this.glassSurf : surf;
    }
    return kind === "glass" ? this.glassSurf : S[KIND_SURF[kind]];
  }

  /**
   * Settled dust below a fracture. For a broken wall (horizontal outward normal) the patch is
   * smaller and pushed off the wall line to the room side so it settles along the wall base
   * instead of straddling it (and showing on the neighbouring room's floor). The patch texture
   * fades out over its outer ~20 %, so an offset of 0.85 r + 4 cm keeps it clear of the wall.
   */
  private dustPatch(p: Vec3, size: number, tint: number, normal?: Vec3): void {
    let x = p.x,
      z = p.z;
    let s = size;
    if (finite3(normal)) {
      const h = Math.hypot(normal.x, normal.z);
      const nl = Math.hypot(normal.x, normal.y, normal.z);
      if (nl > 1e-6 && h / nl > 0.5) {
        s = Math.min(s, 1.0);
        const off = 0.85 * (s / 2) + 0.04;
        x += (normal.x / h) * off;
        z += (normal.z / h) * off;
      }
    }
    const gy = this.groundAt(x, p.y + 0.05, z);
    if (gy <= NO_GROUND || p.y - gy > 3.5) return;
    this.decals.add("dust", x, gy, z, 0, 1, 0, s, { tint });
  }

  /** Remove wall decals on a broken-out surface now; re-check horizontal supports shortly. */
  private revalidateDecals(p: Vec3, radius: number, surfaceRadius: number): void {
    if (this.disposed || !finite3(p) || this.decals.count === 0) return;
    const stamp = this.decals.currentStamp;
    if (surfaceRadius > 0) this.decals.revalidate(p.x, p.y, p.z, 0, surfaceRadius, this.groundAtFn, stamp);
    if (!(radius > 0)) return;
    // coalesce with a check sequence nearby (event storms around one break, the periodic checks
    // around a held object's grab spot): a sequence that already ran its first check restarts so
    // the new event gets its full deferred schedule; one still waiting for its first check simply
    // absorbs it (so a storm can never postpone the first check indefinitely)
    for (const r of this.revals) {
      if ((r.x - p.x) ** 2 + (r.y - p.y) ** 2 + (r.z - p.z) ** 2 < 0.09) {
        r.radius = Math.max(r.radius, radius);
        r.stamp = Math.max(r.stamp, stamp);
        if (r.next > 0) {
          r.age = 0;
          r.next = 0;
        }
        return;
      }
    }
    if (this.revals.length >= MAX_REVALIDATIONS) this.revals.shift();
    this.revals.push({ x: p.x, y: p.y, z: p.z, radius, stamp, age: 0, next: 0 });
  }

  private readonly groundAtFn = (x: number, y: number, z: number): number => this.groundAt(x, y, z);

  private runRevalidations(dt: number): void {
    for (let i = 0; i < this.revals.length; i++) {
      const r = this.revals[i];
      r.age += dt;
      if (r.age < REVALIDATE_AT[r.next]) continue;
      this.decals.revalidate(r.x, r.y, r.z, r.radius, 0, this.groundAtFn, r.stamp);
      r.next++;
      if (r.next >= REVALIDATE_AT.length) {
        this.revals.splice(i, 1);
        i--;
      }
    }
  }

  /** Water/liquid emitters grow a puddle where their spray lands. */
  private feedPuddles(dt: number): void {
    for (const e of this.fx.emitters) {
      const flow = FLOW[e.kind];
      if (!flow || !e.alive || e.rate <= 0) continue;
      let f = this.feeds.get(e);
      if (!f) {
        f = { litres: 0, t: 0 };
        this.feeds.set(e, f);
      }
      f.litres += flow * e.rate * dt;
      f.t += dt;
      if (f.t < 0.25) continue;
      const land = this.sprayLanding(e.kind, e.x, e.y, e.z, e.dx, e.dy, e.dz, e.rate);
      if (land) this.decals.water(land.x, land.y, land.z, f.litres, Math.min(1, 0.3 + e.rate * 0.7));
      f.litres = 0;
      f.t = 0;
    }
  }

  /** Where the centre of a spray lands (ballistic estimate with a drag factor, two probe passes). */
  private sprayLanding(kind: VfxKind, x: number, y: number, z: number, dx: number, dy: number, dz: number, rate: number): Vec3 | null {
    const prof = kind === "liquid" ? PROFILES.liquidDrops : kind === "waterDrip" ? PROFILES.drip : PROFILES.waterDrops;
    const v0 = ((prof.speed[0] + prof.speed[1]) / 2) * Math.pow(Math.max(0.3, Math.min(2.5, rate)), 0.35);
    const vx = dx * v0 * 0.8,
      vy = dy * v0,
      vz = dz * v0 * 0.8;
    let gy = this.groundAt(x, y, z);
    if (gy <= NO_GROUND) return null;
    let lx = x,
      lz = z;
    for (let pass = 0; pass < 2; pass++) {
      const h = Math.max(0, y - gy);
      const t = (vy + Math.sqrt(vy * vy + 2 * 9.81 * h)) / 9.81;
      lx = x + vx * t;
      lz = z + vz * t;
      const g2 = this.groundAt(lx, y, lz);
      if (g2 <= NO_GROUND) return null;
      if (Math.abs(g2 - gy) < 0.02) break;
      gy = g2;
    }
    return { x: lx, y: gy, z: lz };
  }

  stats(): VfxStats {
    const fs = this.fx.stats;
    return {
      particles: fs.live,
      queued: fs.queued,
      budget: Math.round(fs.budget),
      emitters: fs.emitters,
      micro: this.sim.count,
      microMoving: this.sim.movingCount,
      microSettled: this.sim.settledCount,
      microMeshes: this.microRender.meshCount,
      probesTotal: this.sim.probes,
      decals: this.decals.count,
      puddles: this.decals.puddleCount,
      fixedMs: this.fixedMs,
      updateMs: this.updateMs,
      uploadedFloats: this.microRender.uploadedFloats,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
    this.fx.dispose();
    this.microRender.dispose();
    this.decals.dispose();
    for (const a of this.atlases) a.dispose();
  }
}

export function createVfx(opts: CreateVfxOptions): Vfx {
  return new Vfx(opts);
}
