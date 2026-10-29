// Debug / test API: `window.__sim` (docs/ARCHITECTURE.md §12) and the DebugSystem.
//
//   __sim.ready / error            boot state (error = message + stack of a boot failure)
//   __sim.step(n)                  advance n fixed steps synchronously, render once
//   __sim.stats()                  fps, frame ms, physics / destruction / render / audio / vfx stats
//   __sim.world()                  world build report (counts, timings, failures)
//   __sim.listAssemblies()         every spawned assembly (+ source area and room)
//   __sim.findAssembly(q)          first assembly whose type / name matches (exact, then substring)
//   __sim.hit({ id | point, tool, power, dir })  strike as if the player swung that tool at it
//   __sim.throwAt(id, speed, type) spawn a projectile in front of the camera aimed at assembly id
//   __sim.spawn(type, pos, yaw)    spawn a registered object
//   __sim.teleport(pos, yaw, pitch), setTool(id), action(name, power)
//   __sim.setQuality(level), setPS2(on), setPose(name | null), screenshotPoses
//   __sim.events(sinceIndex)       recent game events (ring buffer) for tests
//
// Everything is guarded: a bad argument returns an { error } object instead of throwing into the
// test harness, except step(), which rethrows simulation failures.

import { SceneInstrumentation, Vector3, type PhysicsBody } from "@babylonjs/core";
import { Layer, type DebugSystem, type GameContext, type ToolId, type StrikeResult } from "../core/context.ts";
import type { GameEvents } from "../core/events.ts";
import { QUALITY, type QualityLevel } from "../core/settings.ts";
import { qeuler, type Vec3 } from "../geom/vec.ts";
import { TOOL_DEFS, TOOL_ORDER, sharpnessFor } from "../player/tools/defs.ts";
import { buildObject, objectTypes } from "../objects/registry.ts";
import type { Game } from "../core/game.ts";
import type { GameWorld } from "../world/world.ts";
import { SCREENSHOT_POSES, lookAngles, type CameraPose } from "./poses.ts";

const EVENT_TYPES: ReadonlyArray<keyof GameEvents> = [
  "impact", "fracture", "chip", "crack", "dent", "bondBreak", "split", "toolSwing", "toolHit", "footstep",
  "land", "grab", "throw", "drop", "strain", "feature", "damage", "fellOut",
];
const RING = 4096;

export interface EventRecord {
  i: number;
  t: number;
  type: keyof GameEvents;
  ev: unknown;
}

export interface HitArgs {
  /** Assembly id (or use `point`). */
  id?: number;
  point?: Vec3;
  tool?: ToolId;
  /** 0 = normal swing … 1 = fully charged. Default 1. */
  power?: number;
  /** Direction of travel (default: from the player's eye towards the target). */
  dir?: Vec3;
}

type Json = Record<string, unknown>;

const v3 = (v: { x: number; y: number; z: number }): Vec3 => ({ x: r3(v.x), y: r3(v.y), z: r3(v.z) });
function r3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
const finiteV = (v: unknown): v is Vec3 => !!v && typeof v === "object" && ["x", "y", "z"].every((k) => Number.isFinite((v as Record<string, number>)[k]));

export class DebugApi implements DebugSystem {
  ready = false;
  error: string | null = null;
  /** Boot information (timings, URL options), filled by main.ts. */
  boot: Json = {};

  private readonly ctx: GameContext;
  private game: Game | null = null;
  private world: GameWorld | null = null;
  private readonly ring: EventRecord[] = [];
  private evCount = 0;
  private instr: SceneInstrumentation | null = null;
  private poseName: string | null = null;

  constructor(ctx: GameContext) {
    this.ctx = ctx;
    for (const type of EVENT_TYPES) {
      ctx.events.on(type, (ev) => this.record(type, ev));
    }
  }

  attach(game: Game, world: GameWorld): void {
    this.game = game;
    this.world = world;
  }

  update(_dt: number): void {
    /* stats are computed on demand; the event ring is filled by the bus */
  }

  /** Extra lines for the HUD's F3 overlay. */
  overlay(): string[] {
    const L: string[] = [];
    const g = this.game?.stats;
    if (g) L.push(`<b>LOOP</b>    frame ${g.frameMsAvg.toFixed(2)} ms (steps ${g.stepsMs.toFixed(2)}  update ${g.updateMs.toFixed(2)}  render ${g.renderMs.toFixed(2)})  errors ${g.errors}`);
    const w = this.world?.report;
    if (w) L.push(`<b>WORLD</b>   asm ${w.assemblies}  parts ${w.parts}  tris ${(w.triangles / 1000).toFixed(0)}k  built in ${(w.totalMs / 1000).toFixed(1)} s${w.failures.length ? `  FAILURES ${w.failures.length}` : ""}`);
    if (this.poseName) L.push(`<b>POSE</b>    ${this.poseName}`);
    return L;
  }

  /** Install `window.__sim`. */
  install(): void {
    (globalThis as unknown as { __sim: unknown }).__sim = this.api();
  }

  // ------------------------------------------------------------------ API object
  private api(): Json {
    const self = this;
    return {
      get ready() {
        return self.ready;
      },
      get error() {
        return self.error;
      },
      get boot() {
        return self.boot;
      },
      screenshotPoses: Object.fromEntries(Object.entries(SCREENSHOT_POSES).map(([k, p]) => [k, { pos: p.pos, yaw: r3(p.yaw), pitch: r3(p.pitch), target: p.target }])),
      step: (n = 1) => this.step(n),
      stats: () => this.guard(() => this.stats()),
      world: () => this.world?.report ?? null,
      listAssemblies: () => this.guard(() => this.listAssemblies()),
      findAssembly: (q: string) => this.guard(() => this.findAssembly(q)),
      findAssemblies: (q: string) => this.guard(() => this.findAssemblies(q)),
      hit: (a: HitArgs) => this.guard(() => this.hit(a)),
      throwAt: (id: number, speed = 10, type = "mug") => this.guard(() => this.throwAt(id, speed, type)),
      spawn: (type: string, pos: Vec3, yaw = 0) => this.guard(() => this.spawn(type, pos, yaw)),
      objectTypes: () => objectTypes(),
      teleport: (pos: Vec3, yaw = 0, pitch = 0) => this.guard(() => this.teleport(pos, yaw, pitch)),
      setTool: (t: ToolId) => this.guard(() => this.setTool(t)),
      action: (name: Parameters<GameContext["player"]["debugAction"]>[0], power?: number) => this.guard(() => {
        this.ctx.player.debugAction(name, power);
        return { ok: true };
      }),
      setQuality: (q: QualityLevel) => this.guard(() => this.setQuality(q)),
      setPS2: (on: boolean) => this.guard(() => {
        this.ctx.settings.set("ps2Mode", !!on);
        this.ctx.render.setPS2Mode(!!on);
        return { ok: true };
      }),
      setPose: (name: string | CameraPose | null) => this.guard(() => this.setPose(name)),
      events: (since = 0) => this.events(since),
      eventCount: () => this.evCount,
      player: () => this.guard(() => this.playerInfo()),
      roomAt: (p: Vec3) => this.world?.roomAt(p)?.id ?? null,
      seed: () => this.boot.seed ?? null,
    };
  }

  private guard<T>(fn: () => T): T | { error: string } {
    try {
      return fn();
    } catch (e) {
      return { error: String((e as Error)?.stack ?? e) };
    }
  }

  // ------------------------------------------------------------------ implementations
  private step(n: number): Json {
    if (!this.game) throw new Error("game not started");
    const t0 = performance.now();
    this.game.stepSync(Number.isFinite(n) ? n : 1);
    return { steps: Math.max(0, Math.floor(n)), ms: Math.round((performance.now() - t0) * 10) / 10, simTime: r3(this.ctx.time.simTime) };
  }

  private stats(): Json {
    const c = this.ctx;
    if (!this.instr) {
      this.instr = new SceneInstrumentation(c.scene);
      this.instr.captureFrameTime = true;
    }
    const ps = c.physics.stats();
    const ds = c.destruction.stats();
    const loop = this.game?.stats;
    const r = c.render as unknown as { stats?: () => unknown };
    const vfx = c.vfx as unknown as { stats?: () => unknown };
    const audio = c.audio as unknown as { stats?: () => unknown };
    let active = 0;
    try {
      active = c.scene.getActiveMeshes().length;
    } catch {
      /* ignore */
    }
    return {
      fps: Math.round(c.engine.getFps() * 10) / 10,
      frameMs: loop ? Math.round(loop.frameMsAvg * 100) / 100 : null,
      loop: loop ? { ...loop } : null,
      drawCalls: this.instr.drawCallsCounter.current,
      activeMeshes: active,
      meshes: c.scene.meshes.length,
      vertices: c.scene.getTotalVertices(),
      physics: ps,
      destruction: ds,
      voices: c.audio.activeVoices,
      particles: c.vfx.particleCount,
      micro: c.vfx.microCount,
      render: typeof r.stats === "function" ? r.stats() : null,
      vfx: typeof vfx.stats === "function" ? vfx.stats() : null,
      audio: typeof audio.stats === "function" ? audio.stats() : null,
      time: { simTime: r3(c.time.simTime), step: c.time.step, scale: c.time.scale },
      player: this.playerInfo(),
      events: this.evCount,
    };
  }

  private playerInfo(): Json {
    const p = this.ctx.player;
    const pos = p.position;
    return { pos: v3(pos), forward: v3(p.forward), tool: p.tool, holding: !!p.holding, room: this.world?.roomAt(pos)?.id ?? null, target: p.target };
  }

  private listAssemblies(): Array<Json> {
    const meta = new Map<number, { source: string; room: string | null }>();
    for (const s of this.world?.spawned ?? []) meta.set(s.id, { source: s.source, room: s.room });
    return this.ctx.destruction.list().map((a) => ({ ...a, damage: r3(a.damage), pos: v3(a.pos), source: meta.get(a.id)?.source ?? "runtime", room: meta.get(a.id)?.room ?? null }));
  }

  private findAssemblies(q: string): Array<Json> {
    const s = String(q ?? "").toLowerCase();
    if (!s) return [];
    const all = this.listAssemblies();
    const exact = all.filter((a) => String(a.type).toLowerCase() === s || String(a.name).toLowerCase() === s);
    if (exact.length) return exact;
    return all.filter((a) => String(a.type).toLowerCase().includes(s) || String(a.name).toLowerCase().includes(s));
  }

  private findAssembly(q: string): Json | null {
    return this.findAssemblies(q)[0] ?? null;
  }

  /**
   * Strike like a player swing: the tool's effective mass and head speed (charged by `power`),
   * contact radius, material-aware sharpness and striker material, along `dir`, at the first
   * surface of the target on that line.
   */
  private hit(a: HitArgs): Json {
    const c = this.ctx;
    const tool: ToolId = a.tool && (TOOL_ORDER as readonly string[]).includes(a.tool) ? a.tool : "sledgehammer";
    const def = TOOL_DEFS[tool];
    const power = Number.isFinite(a.power) ? Math.min(1, Math.max(0, a.power as number)) : 1;
    let target: Vec3 | null = null;
    if (a.id !== undefined) target = c.destruction.positionOf(a.id);
    else if (finiteV(a.point)) target = a.point;
    if (!target) throw new Error(`hit: no such target (id ${a.id})`);
    const eye = c.player.position;
    const dir = finiteV(a.dir) ? new Vector3(a.dir.x, a.dir.y, a.dir.z) : new Vector3(target.x - eye.x, target.y - eye.y, target.z - eye.z);
    if (dir.lengthSquared() < 1e-8) dir.set(0, -1, 0);
    dir.normalize();
    // ray along the swing line through the target; the first surface of the wanted assembly wins
    const from = new Vector3(target.x - dir.x * 1.5, target.y - dir.y * 1.5, target.z - dir.z * 1.5);
    const to = new Vector3(target.x + dir.x * 0.6, target.y + dir.y * 0.6, target.z + dir.z * 0.6);
    const mask = Layer.STATIC | Layer.DYNAMIC | Layer.DEBRIS;
    const hits = c.physics.raycastAll ? c.physics.raycastAll(from, to, mask) : [c.physics.raycast(from, to, mask)].filter((h) => !!h);
    let hit = null as (typeof hits)[number] | null;
    for (const h of hits) {
      if (!h) continue;
      if (a.id === undefined) {
        hit = h;
        break;
      }
      const info = c.destruction.target(h.body, h.point, h.childIndex);
      if (info && info.assemblyId === a.id) {
        hit = h;
        break;
      }
    }
    if (!hit) {
      // no surface of the assembly on the line (inside / degenerate): strike its body at the target point
      const body = a.id !== undefined ? this.bodyOf(a.id) : null;
      if (!body) throw new Error("hit: nothing to strike on that line");
      hit = { body, point: new Vector3(target.x, target.y, target.z), normal: dir.scale(-1), distance: 0, childIndex: -1 };
    }
    const mat = c.destruction.materialAt(hit.body, hit.point, hit.childIndex);
    const speed = def.speed * (1 + (def.chargeSpeedMul - 1) * power);
    const res: StrikeResult = c.destruction.strike({
      point: hit.point,
      dir,
      body: hit.body,
      childIndex: hit.childIndex,
      mass: def.mass,
      speed,
      sharpness: sharpnessFor(tool, mat),
      contactRadius: def.contactRadius,
      strikerMat: def.strikerMat,
      source: tool === "hands" ? "fist" : "tool",
      tool,
    });
    const p = hit.point,
      n = hit.normal;
    c.events.emit("toolHit", { tool, pos: { x: p.x, y: p.y, z: p.z }, normal: { x: n.x, y: n.y, z: n.z }, mat, energy: res.energy, hard: res.hardness >= 0.6 });
    return { ...res, energy: r3(res.energy), impulse: r3(res.impulse), point: v3(p), tool, speed: r3(speed), mass: def.mass };
  }

  /** Body of an assembly's lowest-id island (dynamic preferred). */
  private bodyOf(id: number): PhysicsBody | null {
    const d = this.ctx.destruction as unknown as { assembly?: (id: number) => { islands: Set<{ id: number; body: PhysicsBody | null; isStatic: boolean }> } | undefined };
    const asm = d.assembly?.(id);
    if (!asm) return null;
    let best: { id: number; body: PhysicsBody | null; isStatic: boolean } | null = null;
    for (const isl of asm.islands) {
      if (!isl.body) continue;
      if (!best || (best.isStatic && !isl.isStatic) || (best.isStatic === isl.isStatic && isl.id < best.id)) best = isl;
    }
    return best?.body ?? null;
  }

  /** Spawn `type` 0.6 m in front of the camera and launch it at assembly `id` with `speed` m/s. */
  private throwAt(id: number, speed: number, type: string): Json {
    const c = this.ctx;
    const target = c.destruction.positionOf(id);
    if (!target) throw new Error(`throwAt: no assembly ${id}`);
    const eye = c.player.position;
    const d = new Vector3(target.x - eye.x, target.y - eye.y, target.z - eye.z);
    const dist = d.length();
    if (dist < 1e-3) throw new Error("throwAt: target at the eye");
    d.scaleInPlace(1 / dist);
    const start = { x: eye.x + d.x * 0.6, y: eye.y + d.y * 0.6, z: eye.z + d.z * 0.6 };
    const def = buildObject(type);
    def.startAsleep = false;
    const pid = c.destruction.spawn(def, { p: start, q: qeuler(0, Math.atan2(d.x, d.z), 0) });
    const body = this.bodyOf(pid);
    const v = Number.isFinite(speed) ? speed : 10;
    // ballistic aim: compensate gravity drop over the flight time (flat-ish throws)
    const tFlight = dist / Math.max(v, 0.1);
    const vel = new Vector3(d.x * v, d.y * v + 0.5 * 9.81 * tFlight, d.z * v);
    if (body) {
      body.setLinearVelocity(vel);
      body.setAngularVelocity(new Vector3(3, 1, 0));
    }
    return { id: pid, from: v3(start), vel: v3(vel) };
  }

  private spawn(type: string, pos: Vec3, yaw: number): Json {
    if (!finiteV(pos)) throw new Error("spawn: bad position");
    const def = buildObject(type);
    def.startAsleep = false;
    const id = this.ctx.destruction.spawn(def, { p: { x: pos.x, y: pos.y, z: pos.z }, q: qeuler(0, Number.isFinite(yaw) ? yaw : 0, 0) });
    return { id, type, parts: def.parts.length };
  }

  private teleport(pos: Vec3, yaw: number, pitch: number): Json {
    if (!finiteV(pos)) throw new Error("teleport: bad position");
    this.ctx.player.teleport(pos, Number.isFinite(yaw) ? yaw : 0, Number.isFinite(pitch) ? pitch : 0);
    return { ok: true, room: this.world?.roomAt(pos)?.id ?? null };
  }

  private setTool(t: ToolId): Json {
    if (!(TOOL_ORDER as readonly string[]).includes(t)) throw new Error(`setTool: unknown tool ${t} (${TOOL_ORDER.join(", ")})`);
    this.ctx.player.setTool(t);
    return { ok: true, tool: this.ctx.player.tool };
  }

  private setQuality(q: QualityLevel): Json {
    const preset = QUALITY[q];
    if (!preset) throw new Error(`setQuality: unknown level ${q}`);
    this.ctx.settings.set("quality", q);
    this.ctx.render.applyQuality(preset);
    return { ok: true, quality: q };
  }

  /** Show a named pose (or a custom one) instead of the player view; null returns to the player. */
  private setPose(name: string | CameraPose | null): Json {
    if (!this.game) throw new Error("game not started");
    if (name === null || name === undefined) {
      this.game.cameraOverride = null;
      this.poseName = null;
      return { ok: true };
    }
    let p: { pos: Vec3; yaw: number; pitch: number } | undefined;
    if (typeof name === "string") p = SCREENSHOT_POSES[name];
    else if (finiteV(name.pos)) {
      p = finiteV(name.target) ? { pos: name.pos, ...lookAngles(name.pos, name.target) } : { pos: name.pos, yaw: name.yaw ?? 0, pitch: name.pitch ?? 0 };
    }
    if (!p) throw new Error(`setPose: unknown pose ${String(name)} (${Object.keys(SCREENSHOT_POSES).join(", ")})`);
    this.game.cameraOverride = { pos: { ...p.pos }, yaw: p.yaw, pitch: p.pitch };
    this.poseName = typeof name === "string" ? name : "custom";
    this.game.renderOnce();
    return { ok: true, pose: this.poseName, room: this.world?.roomAt(p.pos)?.id ?? null };
  }

  private record(type: keyof GameEvents, ev: unknown): void {
    const rec: EventRecord = { i: this.evCount++, t: r3(this.ctx.time.simTime), type, ev };
    if (this.ring.length < RING) this.ring.push(rec);
    else this.ring[rec.i % RING] = rec;
  }

  /** Events with index ≥ since (oldest first; at most the last RING events are kept). */
  private events(since: number): EventRecord[] {
    const lo = Math.max(Number.isFinite(since) ? since : 0, this.evCount - this.ring.length);
    const out: EventRecord[] = [];
    for (let i = lo; i < this.evCount; i++) {
      const r = this.ring[i % RING];
      if (r && r.i === i) out.push(r);
    }
    return out;
  }
}
