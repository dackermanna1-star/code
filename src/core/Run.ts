/**
 * One run: builds the level, car, zombies, effects, camera, audio, weapons
 * and HUD, steps them each frame, and decides when the run ends.
 */
import { Vector3 } from "@babylonjs/core";
import { getCar } from "../data/cars";
import { computeStats } from "../data/parts";
import { LEVELS } from "../data/levels";
import { ZOMBIES, type ZombieType } from "../data/zombies";
import { CameraRig } from "../camera/CameraRig";
import { FX } from "../fx/FX";
import { HUD } from "../ui/HUD";
import { Level } from "../world/Level";
import { Vehicle } from "../vehicles/Vehicle";
import { Weapons } from "../weapons/Weapons";
import { ZombieManager } from "../zombies/ZombieManager";
import { audio } from "../audio/Audio";
import { Debug } from "./Debug";
import { emptyRunStats } from "./Economy";
import { Time } from "./Time";
import type { RunEndReason } from "./Events";
import type { GameContext, ISystem, RunStats } from "./types";

export class Run {
  readonly stats: RunStats = emptyRunStats();
  readonly level: Level;
  readonly vehicle: Vehicle;
  readonly zombies: ZombieManager;
  readonly camera: CameraRig;
  readonly fx: FX;
  readonly weapons: Weapons;
  readonly hud: HUD;
  ended: RunEndReason | null = null;
  private endTimer = 0;
  private stallTimer = 0;
  private pendingEnd: RunEndReason | null = null;
  private unsubs: (() => void)[] = [];
  private systems: ISystem[] = [];
  private beforePhysics: () => void;

  constructor(
    private ctx: GameContext,
    levelIndex: number,
    private onEnd: (reason: RunEndReason, stats: RunStats) => void,
  ) {
    const save = ctx.save.data;
    const levelDef = LEVELS[levelIndex];
    const carDef = getCar(save.currentCar);
    const stats = computeStats(carDef, ctx.save.loadout());

    this.level = new Level(ctx, levelDef);
    this.vehicle = new Vehicle(ctx, carDef, ctx.save.loadout(), stats, this.level.spawn);
    this.camera = new CameraRig(ctx, this.vehicle);
    this.zombies = new ZombieManager(ctx, this.level, this.vehicle);
    this.fx = new FX(ctx, this.vehicle, this.camera.camera);
    this.weapons = new Weapons(ctx, this.vehicle, this.zombies);
    this.hud = new HUD(ctx, this.vehicle, this.level, this.stats, ctx.save.data.bestDistance[levelIndex] ?? 0);
    audio.attachVehicle(this.vehicle);
    this.systems = [this.zombies, this.weapons, this.fx, this.camera, this.hud];

    // Vehicle forces must be applied right before each physics step.
    this.beforePhysics = () => this.vehicle.update(Time.dt);
    ctx.scene.onBeforePhysicsObservable.add(this.beforePhysics);

    const ev = ctx.events;
    this.unsubs.push(
      ev.on("zombieHit", (e) => {
        if (!e.killed) return;
        this.stats.kills++;
        this.stats.killCash += ZOMBIES[e.type as ZombieType]?.cash ?? 5;
      }),
      ev.on("landed", (e) => {
        this.stats.airTime += e.airTime;
        this.stats.flips += e.flips;
        this.awardLanding(e.airTime, e.flips, e.clean);
      }),
      ev.on("survivor", (e) => this.stats.survivors.push(e.id)),
      ev.on("slowmo", (e) => Time.slowmo(e.scale, e.duration)),
      ev.on("explosion", (e) => this.zombies.explode(e.position, e.radius, e.power)),
    );
  }

  private awardLanding(airTime: number, flips: number, clean: boolean): void {
    const award = (name: string, bonus: number) => {
      this.stats.stunts.push(name);
      this.stats.stuntCash += bonus;
      this.ctx.events.emit("stunt", { name, bonus });
    };
    if (flips > 0) award(flips > 1 ? `${flips}× Flip!` : "Flip!", 60 * flips * flips);
    if (airTime > 2.5) award("Huge Air", Math.round(airTime * 30));
    else if (airTime > 1.4) award("Big Air", Math.round(airTime * 15));
    if (clean && (flips > 0 || airTime > 1.4)) award("Clean Landing", 40);
  }

  update(dt: number): void {
    const v = this.vehicle;
    this.level.update(dt, v.position);
    for (const s of this.systems) s.update(dt);
    audio.update(dt);

    const st = this.stats;
    st.distance = Math.max(st.distance, v.position.z - this.level.spawn.position.z);
    st.topSpeed = Math.max(st.topSpeed, v.velocity.length());
    Debug.watch("speed km/h", v.forwardSpeed * 3.6);
    Debug.watch("fuel", v.fuel);
    Debug.watch("z", v.position.z);

    if (this.ended) return;
    if (this.pendingEnd) {
      this.endTimer -= Time.realDt;
      if (this.endTimer <= 0) this.finish(this.pendingEnd);
      return;
    }
    if (st.distance >= this.level.def.length) {
      st.reachedEvac = true;
      this.queueEnd("evac", 2.5);
    } else if (v.wrecked) {
      this.queueEnd("wrecked", 2.2);
    } else if (v.fuel <= 0) {
      // Let the car coast; end once it has (nearly) stopped.
      if (v.velocity.length() < 1.2) this.stallTimer += dt;
      else this.stallTimer = 0;
      if (this.stallTimer > 1.0) this.queueEnd("fuel", 1.2);
    } else if (v.position.y < -30) {
      this.queueEnd("wrecked", 0.5);
    }
  }

  private queueEnd(reason: RunEndReason, delay: number): void {
    this.pendingEnd = reason;
    this.endTimer = delay;
    this.ctx.input.enabled = reason !== "evac" ? this.ctx.input.enabled : false;
  }

  private finish(reason: RunEndReason): void {
    this.ended = reason;
    this.ctx.events.emit("runEnd", { reason });
    this.onEnd(reason, this.stats);
  }

  dispose(): void {
    this.ctx.scene.onBeforePhysicsObservable.removeCallback(this.beforePhysics);
    for (const u of this.unsubs) u();
    audio.detachVehicle();
    for (const s of this.systems) s.dispose();
    this.vehicle.dispose();
    this.level.dispose();
    Debug.reset();
  }

  /** Debug helper: teleport ahead. */
  warp(dz: number): void {
    const p = this.vehicle.position.clone();
    p.z += dz;
    p.y = this.level.heightAt(this.level.roadCenterX(p.z), p.z) + 2;
    this.vehicle.chassis.position.copyFrom(p);
    this.vehicle.chassis.physicsBody?.setTargetTransform(p, this.vehicle.chassis.rotationQuaternion!);
    this.vehicle.chassis.physicsBody?.setLinearVelocity(new Vector3(0, 0, 10));
  }
}
