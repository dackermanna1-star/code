// WorldSystem: assembles the apartment — the structure (src/world/structure.ts) and every
// furnishing module (src/world/furnish/index.ts) — into the destruction system, behind the
// loading overlay, then lets everything come to rest and captures the reflection environment.
//
// build():
//   1. structure assemblies (concrete shell, slabs, partitions, floors, ceilings, doors, windows,
//      balcony, corridor), spawned in time-sliced chunks so the loading bar keeps moving;
//   2. furnishing, area by area (each furnisher builds its blueprints on call);
//   3. SETTLE: ~90 fixed steps of the real step order (destruction ↔ physics) so anything placed
//      awake comes to rest; after that the physics auto-sleep takes over;
//   4. render.captureEnvironment() (async: completes on the next rendered frames).
// Spawn failures of single assemblies are recorded (report.failures) and never abort the build.

import { Vector3, type PhysicsBody } from "@babylonjs/core";
import type { GameContext, RoomInfo, WorldSystem } from "../core/context.ts";
import { FIXED_DT } from "../core/time.ts";
import type { Vec3 } from "../geom/vec.ts";
import type { AssemblyDef } from "../destruction/model/types.ts";
import type { Xform } from "../geom/vec.ts";
import { CEILING_H, ROOMS, SPAWN, roomAt as planRoomAt, type RoomId } from "./plan.ts";
import { buildStructure } from "./structure.ts";
import { FURNISHERS } from "./furnish/index.ts";

export interface WorldOptions {
  /** Spawn the furnishing (false = structure only, `?nofurniture=1`). Default true. */
  furniture?: boolean;
  /** Fixed steps of the settle phase. Default 90. */
  settleSteps?: number;
  /** Loading-bar progress (0..1) + label. */
  onProgress?: (p: number, label: string) => void;
  /** Max milliseconds of spawning between two yields to the browser. Default 40. */
  sliceMs?: number;
}

export interface SpawnRecord {
  id: number;
  type: string;
  name: string;
  room: RoomId | null;
  source: string;
}

/** An assembly with islands still simulated (not asleep): who keeps the physics awake. */
export interface AwakeAssembly {
  id: number;
  type: string;
  name: string;
  room: string | null;
  /** Awake islands / all islands of the assembly. */
  awake: number;
  islands: number;
  /** Fastest awake island's linear speed (m/s): rattling items show a persistent small speed. */
  maxSpeed: number;
}

/** The slice of the destruction runtime this module introspects (Destruction.world). */
interface IslandIntrospection {
  world?: {
    assemblies: Map<number, { id: number; type: string; name: string; room: string | null; islands: Set<{ alive?: boolean; body: PhysicsBody | null }> }>;
  };
}

export interface WorldReport {
  assemblies: number;
  parts: number;
  bonds: number;
  bodies: number;
  awakeAfterSettle: number;
  /** The assemblies that are still awake after the settle phase (moving ones first, then most awake islands; ≤ 15). */
  awakeAssemblies: AwakeAssembly[];
  triangles: number;
  meshes: number;
  /** Per phase: assemblies spawned and milliseconds (build = blueprint construction, spawn = engine). */
  phases: Array<{ id: string; assemblies: number; parts: number; buildMs: number; spawnMs: number }>;
  settleMs: number;
  settleSteps: number;
  /** Gameplay events raised during the settle phase (should be ~0: nothing should break at rest). */
  settleEvents: Record<string, number>;
  totalMs: number;
  failures: Array<{ source: string; type: string; error: string }>;
}

const yieldToBrowser = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const now = (): number => performance.now();

/** Room acoustics + bounds for every plan room (vertical extent: floor slab to ceiling). */
function roomInfos(): RoomInfo[] {
  return ROOMS.map((r) => ({
    id: r.id,
    name: r.name,
    min: { x: r.x0, y: r.outdoor ? -0.3 : 0, z: r.z0 },
    max: { x: r.x1, y: r.outdoor ? CEILING_H + 0.3 : CEILING_H, z: r.z1 },
    acoustics: { id: r.id, rt60: r.rt60, brightness: r.brightness, wet: r.wet },
    floor: r.floorMat,
  }));
}

export class GameWorld implements WorldSystem {
  readonly rooms: RoomInfo[] = roomInfos();
  /** Player spawn (plan.ts SPAWN). */
  readonly spawn: { pos: Vec3; yaw: number; pitch: number } = { pos: { ...SPAWN.pos }, yaw: SPAWN.yaw, pitch: SPAWN.pitch };
  /** Every assembly spawned by build(), in spawn order. */
  readonly spawned: SpawnRecord[] = [];
  report: WorldReport | null = null;
  /** Resolves once the post-build environment capture is active (true) or failed/unsupported (false). */
  envReady: Promise<boolean> = Promise.resolve(false);
  built = false;

  private readonly ctx: GameContext;
  private readonly opts: Required<Omit<WorldOptions, "onProgress">> & Pick<WorldOptions, "onProgress">;
  private readonly byId = new Map<RoomId, RoomInfo>();

  constructor(ctx: GameContext, opts: WorldOptions = {}) {
    this.ctx = ctx;
    this.opts = {
      furniture: opts.furniture ?? true,
      settleSteps: Math.max(0, Math.floor(opts.settleSteps ?? 90)),
      sliceMs: opts.sliceMs ?? 40,
      onProgress: opts.onProgress,
    };
    for (const r of this.rooms) this.byId.set(r.id as RoomId, r);
  }

  roomAt(p: Vec3): RoomInfo | null {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
    // below the slab / above the ceiling (falling off the balcony, the floor above): no room
    if (p.y < -0.6 || p.y > CEILING_H + 0.6) return null;
    const r = planRoomAt(p.x, p.z);
    return r ? (this.byId.get(r.id) ?? null) : null;
  }

  async build(): Promise<void> {
    if (this.built) throw new Error("world already built");
    this.built = true;
    const t0 = now();
    const progress = (p: number, label: string) => {
      try {
        this.opts.onProgress?.(Math.min(1, Math.max(0, p)), label);
      } catch {
        /* the loading bar must never break the build */
      }
    };
    const report: WorldReport = {
      assemblies: 0, parts: 0, bonds: 0, bodies: 0, awakeAfterSettle: 0, awakeAssemblies: [], triangles: 0, meshes: 0,
      phases: [], settleMs: 0, settleSteps: 0, settleEvents: {}, totalMs: 0, failures: [],
    };
    this.report = report;

    // phase weights for the loading bar (structure ≈ 30 %, furnishing ≈ 60 %, settle ≈ 10 %)
    const furnishers = this.opts.furniture ? FURNISHERS : [];
    const phases: Array<{ id: string; label: string; build: () => Array<{ def: AssemblyDef; xf: Xform; type?: string; room?: RoomId | null }> }> = [
      { id: "structure", label: "Structure", build: () => buildStructure().map((p) => ({ ...p, type: p.def.type, room: null })) },
      ...furnishers.map((f) => ({ id: f.id, label: f.label, build: () => f.build() })),
    ];
    const weight = (i: number) => (i === 0 ? 0.3 : 0.6 / Math.max(1, phases.length - 1));
    let base = 0;
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      const w = weight(i);
      progress(base, `Building ${ph.label.toLowerCase()}`);
      await yieldToBrowser();
      const tb = now();
      let items: Array<{ def: AssemblyDef; xf: Xform; type?: string; room?: RoomId | null }> = [];
      try {
        items = ph.build();
      } catch (e) {
        report.failures.push({ source: ph.id, type: "*", error: errText(e) });
        console.warn(`world: ${ph.id} furnishing failed to build`, e);
      }
      const buildMs = now() - tb;
      progress(base + w * 0.25, `Placing ${ph.label.toLowerCase()}`);
      const ts = now();
      let slice = now();
      let parts = 0;
      let count = 0;
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        const type = it.type ?? it.def.type;
        try {
          const id = this.ctx.destruction.spawn(it.def, it.xf);
          this.spawned.push({ id, type, name: it.def.name, room: it.room ?? (it.def.room as RoomId | undefined) ?? null, source: ph.id });
          parts += it.def.parts.length;
          report.bonds += it.def.bonds.length;
          count++;
        } catch (e) {
          report.failures.push({ source: ph.id, type, error: errText(e) });
          console.warn(`world: spawning ${ph.id}/${type} failed`, e);
        }
        if (now() - slice > this.opts.sliceMs) {
          progress(base + w * (0.25 + (0.75 * (k + 1)) / items.length), `Placing ${ph.label.toLowerCase()}`);
          await yieldToBrowser();
          slice = now();
        }
      }
      report.phases.push({ id: ph.id, assemblies: count, parts, buildMs: round1(buildMs), spawnMs: round1(now() - ts) });
      report.assemblies += count;
      report.parts += parts;
      base += w;
    }

    // ---- settle
    progress(0.9, "Settling");
    await yieldToBrowser();
    const counts: Record<string, number> = {};
    const unsubs = (["impact", "fracture", "bondBreak", "split", "damage"] as const).map((k) =>
      this.ctx.events.on(k, () => {
        counts[k] = (counts[k] ?? 0) + 1;
      }),
    );
    const tSettle = now();
    const { destruction, physics, vfx, time } = this.ctx;
    let steps = 0;
    try {
      for (; steps < this.opts.settleSteps; steps++) {
        destruction.beforePhysics(FIXED_DT);
        physics.step(FIXED_DT);
        destruction.afterPhysics(FIXED_DT);
        vfx.fixedUpdate(FIXED_DT);
        time.tick();
        if (steps % 15 === 14) {
          progress(0.9 + (0.08 * steps) / Math.max(1, this.opts.settleSteps), "Settling");
          await yieldToBrowser();
        }
      }
      destruction.update(FIXED_DT);
    } finally {
      for (const u of unsubs) u();
    }
    report.settleMs = round1(now() - tSettle);
    report.settleSteps = steps;
    report.settleEvents = counts;

    // ---- totals
    const ps = physics.stats();
    report.bodies = ps.bodies;
    report.awakeAfterSettle = ps.awake;
    report.awakeAssemblies = this.awakeAssemblies(15);
    let tris = 0;
    let meshes = 0;
    for (const m of this.ctx.scene.meshes) {
      const n = m.getTotalIndices();
      if (n > 0) {
        tris += n / 3;
        meshes++;
      }
    }
    report.triangles = Math.round(tris);
    report.meshes = meshes;

    // ---- reflection environment (renders on the next frames of the game loop)
    progress(0.99, "Capturing reflections");
    const r = this.ctx.render as unknown as { captureEnvironmentAsync?: () => Promise<boolean> };
    try {
      if (typeof r.captureEnvironmentAsync === "function") this.envReady = r.captureEnvironmentAsync().catch(() => false);
      else {
        this.ctx.render.captureEnvironment();
        this.envReady = Promise.resolve(true);
      }
    } catch (e) {
      console.warn("world: environment capture failed", e);
      this.envReady = Promise.resolve(false);
    }
    report.totalMs = round1(now() - t0);
    progress(1, "Ready");
  }

  /**
   * Assemblies with awake (simulated) islands: visibly moving ones first (fastest first), then by
   * number of awake islands. Finds what
   * keeps the physics from resting (a rattling item, a jointed group that never sleeps).
   */
  awakeAssemblies(limit = 20): AwakeAssembly[] {
    const w = (this.ctx.destruction as unknown as IslandIntrospection).world;
    if (!w) return [];
    const ph = this.ctx.physics;
    const v = new Vector3();
    const out: AwakeAssembly[] = [];
    const roomOf = new Map<number, string | null>();
    for (const r of this.spawned) roomOf.set(r.id, r.room);
    for (const asm of w.assemblies.values()) {
      let awake = 0;
      let maxSpeed = 0;
      for (const isl of asm.islands) {
        const b = isl.body;
        if (!b || isl.alive === false) continue;
        let on = false;
        try {
          on = ph.isAwake(b); // false for static bodies
        } catch {
          continue;
        }
        if (!on) continue;
        awake++;
        try {
          b.getLinearVelocityToRef(v);
          const sp = v.length();
          if (Number.isFinite(sp) && sp > maxSpeed) maxSpeed = sp;
        } catch {
          /* ignore */
        }
      }
      if (awake) out.push({ id: asm.id, type: asm.type, name: asm.name, room: asm.room ?? roomOf.get(asm.id) ?? null, awake, islands: asm.islands.size, maxSpeed: Math.round(maxSpeed * 1000) / 1000 });
    }
    // moving ones first (a rattling item), fastest first; then the most awake islands
    const MOVING = 0.02;
    out.sort((a, b) => Number(b.maxSpeed > MOVING) - Number(a.maxSpeed > MOVING) || (a.maxSpeed > MOVING ? b.maxSpeed - a.maxSpeed : 0) || b.awake - a.awake || b.maxSpeed - a.maxSpeed);
    return out.slice(0, Math.max(0, limit));
  }

  /** Spawn records of one source ("structure", "kitchen", …) or all. */
  list(source?: string): SpawnRecord[] {
    return source ? this.spawned.filter((s) => s.source === source) : this.spawned.slice();
  }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function errText(e: unknown): string {
  return String((e as Error)?.message ?? e).slice(0, 300);
}
