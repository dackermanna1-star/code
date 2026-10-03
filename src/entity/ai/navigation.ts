/**
 * Mob movement controls + path navigation.
 *  - MoveControl: steers toward a wanted position (sets the mob's target yaw, forward intent,
 *    speed multiplier and jumps), or strafes. Physics (LivingEntity.travel) does the rest.
 *  - LookControl: turns the head toward a point with yaw/pitch rate limits.
 *  - Navigation: A* paths (budgeted per tick across all mobs), waypoint following, recompute
 *    throttling for moving targets, stuck detection.
 */
import * as THREE from 'three';
import type { Entity } from '../entity';
import type { Mob } from '../mobs/mob';
import { Pathfinder, nodeCenter, type Path, type PathOptions } from './pathfinder';
import { wrapAngle } from '../living';

/** Global per-tick pathfinding budget shared by every mob. */
export const PATH_BUDGET = { tick: -1, searches: 0, nodes: 0, maxSearches: 10, maxNodes: 6000 };
function budgetOk(tick: number): boolean {
  if (PATH_BUDGET.tick !== tick) { PATH_BUDGET.tick = tick; PATH_BUDGET.searches = 0; PATH_BUDGET.nodes = 0; }
  return PATH_BUDGET.searches < PATH_BUDGET.maxSearches && PATH_BUDGET.nodes < PATH_BUDGET.maxNodes;
}

export class MoveControl {
  readonly wanted = new THREE.Vector3();
  speed = 0;
  op: 'wait' | 'move' | 'strafe' = 'wait';
  strafeF = 0;
  strafeS = 0;
  constructor(readonly mob: Mob) {}

  setWanted(x: number, y: number, z: number, speed: number) {
    this.wanted.set(x, y, z);
    this.speed = speed;
    this.op = 'move';
  }
  strafe(forward: number, side: number, speed = 1) {
    this.op = 'strafe';
    this.strafeF = forward;
    this.strafeS = side;
    this.speed = speed;
  }
  get hasWanted() {
    return this.op === 'move';
  }

  tick() {
    const m = this.mob;
    m.intent.forward = 0;
    m.intent.strafe = 0;
    if (this.op === 'strafe') {
      m.moveMul = this.speed;
      m.intent.forward = this.strafeF;
      m.intent.strafe = this.strafeS;
      this.op = 'wait';
      return;
    }
    if (this.op !== 'move') { m.moveMul = 0; return; }
    this.op = 'wait';
    const dx = this.wanted.x - m.pos.x, dz = this.wanted.z - m.pos.z, dy = this.wanted.y - m.pos.y;
    const d2 = dx * dx + dz * dz;
    if (d2 + dy * dy < 2.5e-7) { m.moveMul = 0; return; }
    m.targetYaw = Math.atan2(-dx, -dz);
    m.moveMul = this.speed;
    // walk forward once roughly facing the target (turning happens in physics)
    const off = Math.abs(wrapAngle(m.targetYaw - m.yaw));
    m.intent.forward = off < 1.2 ? 1 : 0.25;
    if ((dy > m.stepHeight + 0.05 && d2 < Math.max(1, m.width) * 1.2) || (m.collidedH && m.onGround && dy > -0.5)) m.jumping = true;
  }
}

export class LookControl {
  readonly at = new THREE.Vector3();
  private has = false;
  yawSpeed = 10; // degrees per tick
  pitchSpeed = 40;
  constructor(readonly mob: Mob) {}

  lookAt(x: number, y: number, z: number, yawSpeed = 10, pitchSpeed = 40) {
    this.at.set(x, y, z);
    this.has = true;
    this.yawSpeed = yawSpeed;
    this.pitchSpeed = pitchSpeed;
  }
  lookAtEntity(e: Entity, yawSpeed = 10, pitchSpeed = 40) {
    const h = (e as any).eyeHeight ?? e.height * 0.85;
    this.lookAt(e.pos.x, e.pos.y + h, e.pos.z, yawSpeed, pitchSpeed);
  }
  get active() {
    return this.has;
  }

  tick() {
    const m = this.mob;
    const ys = (this.yawSpeed * Math.PI) / 180, ps = (this.pitchSpeed * Math.PI) / 180;
    if (this.has) {
      this.has = false;
      const ex = m.pos.x, ey = m.pos.y + m.eyeHeight, ez = m.pos.z;
      const dx = this.at.x - ex, dy = this.at.y - ey, dz = this.at.z - ez;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      m.headYawW += Math.max(-ys, Math.min(ys, wrapAngle(yaw - m.headYawW)));
      m.pitch += Math.max(-ps, Math.min(ps, pitch - m.pitch));
    } else {
      // relax toward the body direction
      m.headYawW += Math.max(-ys, Math.min(ys, wrapAngle(m.yaw - m.headYawW)));
      m.pitch *= 0.8;
    }
    // neck limit relative to the body
    const rel = wrapAngle(m.headYawW - m.bodyYaw);
    const lim = m.maxHeadYaw;
    if (Math.abs(rel) > lim) m.headYawW = m.bodyYaw + Math.sign(rel) * lim;
  }
}

export class Navigation {
  path: Path | null = null;
  speed = 1;
  private target: { x: number; y: number; z: number; reach: number } | null = null;
  private targetEntity: Entity | null = null;
  private lastCompute = -1000;
  private progressTick = 0;
  private readonly progressPos = new THREE.Vector3();
  private stuck = 0;
  /** Pathing options tweaks (spiders climb, mobs that open doors ...). */
  canOpenDoors = false;
  climb = 0;
  waterMalus = 8;
  canSwim = true;
  maxDrop = 3;
  maxNodes = 500;
  constructor(readonly mob: Mob) {}

  options(): PathOptions {
    const m = this.mob;
    return {
      width: m.width, height: m.height, maxDrop: this.maxDrop, canSwim: this.canSwim, waterMalus: this.waterMalus,
      canOpenDoors: this.canOpenDoors, climb: this.climb, fireImmune: m.fireImmune, maxNodes: this.maxNodes,
      maxDist: Math.max(16, m.followRange + 8), aquatic: m.aquatic,
    };
  }

  private compute(x: number, y: number, z: number, reach: number): boolean {
    const m = this.mob;
    const tick = (m.game as any)?.ticks ?? m.age;
    if (!budgetOk(tick)) return false;
    PATH_BUDGET.searches++;
    const pf = new Pathfinder(m.world, this.options());
    const p = pf.find(m.pos.x, m.pos.y, m.pos.z, x, y, z, reach);
    PATH_BUDGET.nodes += p?.expanded ?? 50;
    this.lastCompute = m.age;
    this.path = p && p.nodes.length ? p : null;
    this.stuck = 0;
    this.progressTick = m.age;
    this.progressPos.copy(m.pos);
    return !!this.path;
  }

  /** Path to a position. Returns false if no path (or no budget this tick). */
  moveTo(x: number, y: number, z: number, speed: number, reach = 1): boolean {
    this.speed = speed;
    this.targetEntity = null;
    const t = this.target;
    if (this.path && t && Math.abs(t.x - x) < 0.5 && Math.abs(t.y - y) < 0.5 && Math.abs(t.z - z) < 0.5) return true;
    this.target = { x, y, z, reach };
    return this.compute(x, y, z, reach);
  }

  /** Path to an entity (recomputed when it moves, throttled). */
  moveToEntity(e: Entity, speed: number, reach = 1): boolean {
    this.speed = speed;
    const m = this.mob;
    const t = this.target;
    const moved = !t || Math.abs(t.x - e.pos.x) + Math.abs(t.y - e.pos.y) + Math.abs(t.z - e.pos.z) > 1;
    if (this.targetEntity === e && this.path && (!moved || m.age - this.lastCompute < 10)) return true;
    this.targetEntity = e;
    this.target = { x: e.pos.x, y: e.pos.y, z: e.pos.z, reach };
    return this.compute(e.pos.x, e.pos.y, e.pos.z, reach);
  }

  stop() {
    this.path = null;
    this.target = null;
    this.targetEntity = null;
  }

  isDone(): boolean {
    return !this.path || this.path.done;
  }
  isInProgress(): boolean {
    return !this.isDone();
  }

  tick() {
    const m = this.mob;
    const p = this.path;
    if (!p) return;
    if (p.done) { this.path = null; return; }
    // follow waypoints
    const reachD = m.width > 0.75 ? m.width / 2 + 0.1 : 0.75 - m.width / 2;
    for (;;) {
      const n = p.current;
      if (!n) break;
      const [cx, cy, cz] = nodeCenter(n, m.width);
      const hd = Math.hypot(cx - m.pos.x, cz - m.pos.z);
      const last = p.index === p.nodes.length - 1;
      if (hd < (last ? Math.min(reachD, 0.35) : reachD) && Math.abs(cy - m.pos.y) < 1.1) { p.index++; continue; }
      // skip ahead if the next waypoint is closer on the same level
      const nx = p.nodes[p.index + 1];
      if (nx && Math.abs(nx.floor - n.floor) < 0.01 && Math.abs(n.floor - m.pos.y) < 0.2) {
        const [ax, , az] = nodeCenter(nx, m.width);
        if (Math.hypot(ax - m.pos.x, az - m.pos.z) < hd * 0.6) { p.index++; continue; }
      }
      break;
    }
    if (p.done) { this.path = null; return; }
    const n = p.current!;
    const [cx, cy, cz] = nodeCenter(n, m.width);
    m.moveControl.setWanted(cx, cy, cz, this.speed);
    // stuck detection
    if (m.age - this.progressTick >= 40) {
      if (m.pos.distanceToSquared(this.progressPos) < 0.6 * 0.6) this.stuck++;
      else this.stuck = 0;
      this.progressTick = m.age;
      this.progressPos.copy(m.pos);
      if (this.stuck >= 2) {
        const t = this.target;
        this.path = null;
        if (t) this.compute(t.x, t.y, t.z, t.reach);
        if (this.stuck >= 2 && !this.path) this.stop();
      }
    }
    // a moving target entity refreshes the path occasionally
    const te = this.targetEntity;
    if (te && this.target && m.age - this.lastCompute > 20 && te.pos.distanceToSquared(new THREE.Vector3(this.target.x, this.target.y, this.target.z)) > 2.25) {
      this.target.x = te.pos.x; this.target.y = te.pos.y; this.target.z = te.pos.z;
      this.compute(te.pos.x, te.pos.y, te.pos.z, this.target.reach);
    }
  }
}
