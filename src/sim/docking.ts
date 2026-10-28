/**
 * Docking: ports on stations and ships, relative geometry in the target
 * port's frame, soft-capture conditions and an automatic docking guidance
 * law (fly to a point on the port axis, align, then a slow final approach
 * along the axis with lateral corrections, like real crewed vehicles).
 *
 * All vectors are expressed relative to the active ship's frame body
 * (non-rotating, world axes). Targets: crewed stations (Body.station) and
 * the player's parked vessels that carry a berth.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Body, DockPortDef } from '../astro/body';
import type { Ship, ShipClass } from './ship';
import type { World } from './world';

export interface ShipPorts {
  /** the vessel's own docking adapter */
  probe: DockPortDef;
  /** a port that receives a shuttle (motherships) */
  berth?: DockPortDef;
  /** class of the shuttle carried in the berth */
  shuttle?: ShipClass;
}

/** Docking adapters per ship class (ship axes: nose −Z, up +Y). */
export const SHIP_PORTS: Record<ShipClass, ShipPorts> = {
  scout: { probe: { name: 'nose adapter', pos: [0, 0, -11.3], dir: [0, 0, -1], up: [0, 1, 0] } },
  lander: { probe: { name: 'top hatch', pos: [0, 2.95, 0], dir: [0, 1, 0], up: [0, 0, -1] } },
  cruiser: {
    probe: { name: 'nose adapter', pos: [0, 0, -48.4], dir: [0, 0, -1], up: [0, 1, 0] },
    berth: { name: 'dorsal berth', pos: [0, 1.4, -5], dir: [0, 1, 0], up: [0, 0, -1] },
    shuttle: 'scout',
  },
  heavy: {
    probe: { name: 'prow adapter', pos: [0, 0, -115.4], dir: [0, 0, -1], up: [0, 1, 0] },
    berth: { name: 'dorsal hangar berth', pos: [0, 9.3, 22], dir: [0, 1, 0], up: [0, 0, -1] },
    shuttle: 'lander',
  },
  experimental: { probe: { name: 'nose adapter', pos: [0, 0, -22.3], dir: [0, 0, -1], up: [0, 1, 0] } },
};

export interface DockTarget {
  id: string;
  name: string;
  ports: DockPortDef[];
  /** keep-out radius around the target centre (m) */
  radius: number;
  station?: Body;
  ship?: Ship;
}

export interface TargetState {
  pos: Vector3;    // centre, relative to the frame body (world axes)
  vel: Vector3;
  q: Quaternion;   // target axes → world
  omega: Vector3;  // angular velocity (world)
}

export interface DockGeometry {
  target: DockTarget;
  port: number;
  portPos: Vector3;
  portAxis: Vector3;
  portUp: Vector3;
  portVel: Vector3;
  probePos: Vector3;
  /** probe − port */
  r: Vector3;
  range: number;
  axial: number;
  lateral: Vector3;
  lateralDist: number;
  /** ship − port velocity */
  relVel: Vector3;
  closing: number;
  /** misalignment of the probe axis with the port axis (rad) */
  angle: number;
  roll: number;
  /** target angular velocity (world) */
  omega: Vector3;
  /** ship orientation and position (frame-body offset) when docked */
  dockQ: Quaternion;
  dockPos: Vector3;
  centre: Vector3;
}

/** Soft-capture envelope (typical of crewed docking systems, slightly relaxed). */
export const CAPTURE = { axial: 0.35, lateral: 0.3, maxClosing: 0.6, angle: (6 * Math.PI) / 180, roll: (12 * Math.PI) / 180 };

const v3 = (a: [number, number, number], out = new Vector3()) => out.set(a[0], a[1], a[2]);
const _m1 = new Matrix4(), _m2 = new Matrix4();

/** Orientation that maps (dir, up) in vessel axes onto (dirW, upW) in world axes. */
export function alignQ(dir: Vector3, up: Vector3, dirW: Vector3, upW: Vector3, out = new Quaternion()): Quaternion {
  const ox = up.clone().addScaledVector(dir, -up.dot(dir)).normalize();
  const wx = upW.clone().addScaledVector(dirW, -upW.dot(dirW)).normalize();
  _m1.makeBasis(dir, ox, new Vector3().crossVectors(dir, ox));
  _m2.makeBasis(dirW, wx, new Vector3().crossVectors(dirW, wx));
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}

/** State of a docking target relative to `frameBody` (world axes). */
export function targetState(t: DockTarget, frameBody: Body, world: World, out: TargetState): boolean {
  const sys = world.system;
  if (!sys) return false;
  if (t.station) {
    const b = t.station;
    if (b.system !== sys) return false;
    sys.relative(frameBody, b, out.pos);
    out.vel.copy(b.velSys).sub(frameBody.velSys).applyQuaternion(sys.q);
    sys.bodyRotation(b, out.q);
    // LVLH rotates once per orbit about the orbit normal
    const rp = b.posSys.clone().sub(b.parent!.posSys), vp = b.velSys.clone().sub(b.parent!.velSys);
    out.omega.crossVectors(rp, vp).divideScalar(rp.lengthSq()).applyQuaternion(sys.q);
    return true;
  }
  const s = t.ship;
  if (!s || !s.frame.body || s.frame.body.system !== sys) return false;
  const sb = s.frame.body;
  out.pos.copy(s.frame.offsetWorld(new Vector3()));
  if (sb !== frameBody) out.pos.add(sys.relative(frameBody, sb, new Vector3()));
  if (s.landed && s.frame.body) out.vel.copy(s.surfaceVelocity(sb, s.frame.offsetWorld(new Vector3()), world));
  else out.vel.copy(s.velocity);
  if (sb !== frameBody) out.vel.add(new Vector3().copy(sb.velSys).sub(frameBody.velSys).applyQuaternion(sys.q));
  out.q.copy(s.orient);
  out.omega.set(0, 0, 0);
  return true;
}

export function newTargetState(): TargetState {
  return { pos: new Vector3(), vel: new Vector3(), q: new Quaternion(), omega: new Vector3() };
}

/**
 * Port-frame geometry of `ship` (its probe) against port `port` of target
 * `t`. `lag`: seconds by which the ship's state trails world time (during
 * the ship's own update), so the target is taken back to the same instant.
 */
export function dockGeometry(ship: Ship, t: DockTarget, port: number, world: World, ts: TargetState, lag = 0): DockGeometry | null {
  const fb = ship.frame.body;
  if (!fb || ship.frame.kind === 'universe') return null;
  if (!targetState(t, fb, world, ts)) return null;
  if (lag > 0) {
    // back along its free-fall trajectory in the frame body's field
    const r = ts.pos.length();
    const acc = ts.pos.clone().multiplyScalar(-fb.mu / (r * r * r));
    ts.pos.addScaledVector(ts.vel, -lag).addScaledVector(acc, 0.5 * lag * lag);
    ts.vel.addScaledVector(acc, -lag);
  }
  const pd = t.ports[port];
  const probe = SHIP_PORTS[ship.spec.cls].probe;
  const portOff = v3(pd.pos).applyQuaternion(ts.q);
  const portPos = portOff.clone().add(ts.pos);
  const portAxis = v3(pd.dir).applyQuaternion(ts.q);
  const portUp = v3(pd.up).applyQuaternion(ts.q);
  const portVel = new Vector3().crossVectors(ts.omega, portOff).add(ts.vel);
  const shipPos = ship.frame.offsetWorld(new Vector3());
  const probePos = v3(probe.pos).applyQuaternion(ship.orient).add(shipPos);
  const r = probePos.clone().sub(portPos);
  const axial = r.dot(portAxis);
  const lateral = r.clone().addScaledVector(portAxis, -axial);
  const shipVel = ship.landed ? ship.surfaceVelocity(fb, shipPos, world) : ship.velocity;
  const relVel = shipVel.clone().sub(portVel);
  const pdir = v3(probe.dir).applyQuaternion(ship.orient);
  const angle = Math.acos(Math.max(-1, Math.min(1, -pdir.dot(portAxis))));
  const pup = v3(probe.up).applyQuaternion(ship.orient);
  pup.addScaledVector(portAxis, -pup.dot(portAxis));
  const up0 = portUp.clone().addScaledVector(portAxis, -portUp.dot(portAxis));
  const roll = pup.lengthSq() > 1e-8 && up0.lengthSq() > 1e-8 ? pup.angleTo(up0) : Math.PI;
  const dockQ = alignQ(v3(probe.dir), v3(probe.up), portAxis.clone().negate(), portUp);
  const dockPos = portPos.clone().sub(v3(probe.pos).applyQuaternion(dockQ));
  return {
    target: t, port, portPos, portAxis, portUp, portVel, probePos, r, range: r.length(), axial, lateral, lateralDist: lateral.length(),
    relVel, closing: -relVel.dot(portAxis), angle, roll, omega: ts.omega.clone(), dockQ, dockPos, centre: ts.pos.clone(),
  };
}

/** Within the soft-capture envelope? */
export function canCapture(g: DockGeometry): boolean {
  return g.axial < CAPTURE.axial && g.axial > -0.5 && g.lateralDist < CAPTURE.lateral && g.closing < CAPTURE.maxClosing && g.closing > -0.1
    && g.angle < CAPTURE.angle && g.roll < CAPTURE.roll;
}

/** Nearest free port of any target within `maxRange` of the ship. */
export function nearestPort(ship: Ship, targets: DockTarget[], world: World, maxRange: number): { target: DockTarget; port: number; range: number } | null {
  const ts = newTargetState();
  let best: { target: DockTarget; port: number; range: number } | null = null;
  for (const t of targets) {
    for (let i = 0; i < t.ports.length; i++) {
      const g = dockGeometry(ship, t, i, world, ts);
      if (!g || g.range > maxRange) continue;
      if (!best || g.range < best.range) best = { target: t, port: i, range: g.range };
    }
  }
  return best;
}

export type DockPhase = 'approach' | 'align' | 'final';

/**
 * Automatic docking guidance. Returns the commanded acceleration (world
 * axes, relative to free fall) and updates `phase`. The ship should turn
 * toward `g.dockQ` meanwhile.
 */
export function dockingGuidance(ship: Ship, g: DockGeometry, phase: DockPhase, out: Vector3): DockPhase {
  const L = ship.spec.length;
  const rcsA = (ship.spec.rcsThrust / ship.mass) * 0.8;
  const mainA = (ship.spec.thrust + ship.spec.rcsThrust) / ship.mass * 0.6;
  const standoff = Math.max(18, L * 1.2);
  const keep = g.target.radius + L * 0.6 + 5;
  // points fixed to the target co-rotate with it (LVLH stations turn once per orbit)
  const corot = (p: Vector3) => new Vector3().crossVectors(g.omega, p.clone().sub(g.portPos));
  let vDes: Vector3;
  let maxA = rcsA;
  if (phase === 'final') {
    // slow along the axis, closing speed ∝ distance; null the lateral offset
    const sp = Math.min(1.2, 0.04 + 0.22 * Math.sqrt(Math.max(g.axial, 0)));
    vDes = g.portAxis.clone().multiplyScalar(-sp).addScaledVector(g.lateral, -0.25).add(corot(g.probePos));
    if (g.lateralDist > 1.5 + 0.15 * Math.max(g.axial, 0) || g.angle > 0.15 || g.axial < -1) phase = 'approach';
  } else {
    // inside the approach corridor (a cone in front of the port) fly to the
    // approach point on the axis; elsewhere first to a far point on the axis,
    // detouring around the target's keep-out sphere
    const corridor = g.axial > 0 && g.lateralDist < g.axial * 0.6 + 3;
    const portFromC = g.portPos.distanceTo(g.centre);
    const Q = g.portPos.clone().addScaledVector(g.portAxis, corridor ? standoff : Math.max(standoff, keep + portFromC));
    let aim = Q;
    if (!corridor) {
      const fromC = g.probePos.clone().sub(g.centre), toC = Q.clone().sub(g.centre);
      const seg = toC.clone().sub(fromC);
      const tMin = Math.max(0, Math.min(1, -fromC.dot(seg) / Math.max(seg.lengthSq(), 1e-9)));
      const closest = fromC.clone().addScaledVector(seg, tMin);
      if (closest.length() < keep) {
        const mid = fromC.clone().normalize().add(toC.clone().normalize());
        if (mid.lengthSq() < 1e-6) mid.copy(g.portUp);
        aim = g.centre.clone().addScaledVector(mid.normalize(), Math.max(keep * 1.25, fromC.length()));
      }
    }
    const err = aim.clone().sub(g.probePos);
    const d = err.length();
    maxA = d > 60 ? mainA : rcsA;
    const vmax = d > 2000 ? 60 : d > 300 ? 12 : 3;
    const sp = Math.min(vmax, Math.sqrt(2 * maxA * 0.35 * d), 0.3 * d + 0.02);
    vDes = (d > 1e-6 ? err.multiplyScalar(sp / d) : new Vector3()).add(corot(aim));
    const settled = d < 1.5 && g.relVel.clone().sub(corot(g.probePos)).length() < 0.15;
    if (corridor && settled && phase === 'approach') phase = 'align';
    // already lined up on the axis: no need to back out to the hold point
    if (corridor && g.axial < standoff * 1.5 && g.lateralDist < 0.3 + 0.05 * g.axial && g.angle < 0.05 && g.roll < 0.08) phase = 'final';
    if (phase === 'align' && g.angle < 0.03 && g.roll < 0.05) phase = 'final';
  }
  out.copy(vDes).sub(g.relVel).multiplyScalar(0.9);
  if (out.length() > maxA) out.setLength(maxA);
  return phase;
}
