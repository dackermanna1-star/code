import { Quaternion, Vector3 } from 'three';
import { G } from '../core/constants';
import { orbitState, type OrbitElements } from './orbit';
import type { BodyKind, PlanetPhysics, StarPhysics } from './types';
import { UPos } from '../core/upos';

const Y = new Vector3(0, 1, 0);
const _q = new Quaternion();

export interface RotationInfo {
  period: number;      // sidereal period (s); negative → retrograde
  tilt: number;        // obliquity (rad)
  tiltAzimuth: number; // direction of the tilt (rad)
  phase0: number;      // rotation angle at J2000
  locked: boolean;     // synchronous with orbit (spin follows mean longitude)
}

export class Body {
  readonly children: Body[] = [];
  readonly mu: number;
  /** pole orientation without spin: body frame (Y = spin axis) → system frame */
  readonly poleQ = new Quaternion();
  // runtime state (system frame, relative to system barycentre)
  readonly posSys = new Vector3();
  readonly velSys = new Vector3();
  readonly rot = new Quaternion();
  /** sphere of influence radius (m) */
  soi = Infinity;
  /** discovered by the player */
  discovered = false;
  customName: string | null = null;
  system!: StarSystem;

  constructor(
    readonly id: string,
    public name: string,
    readonly kind: BodyKind,
    readonly parent: Body | null,
    readonly mass: number,
    readonly radius: number,
    readonly orbit: OrbitElements | null,
    readonly rotation: RotationInfo,
    readonly star?: StarPhysics,
    readonly planet?: PlanetPhysics,
    readonly known = false,
  ) {
    this.mu = G * mass;
    if (parent) parent.children.push(this);
    _q.setFromAxisAngle(new Vector3(Math.cos(rotation.tiltAzimuth), 0, Math.sin(rotation.tiltAzimuth)), rotation.tilt);
    this.poleQ.copy(_q);
  }

  get displayName() {
    return this.customName ?? this.name;
  }

  get isStarLike() {
    return this.kind === 'star' || this.kind === 'white-dwarf' || this.kind === 'neutron-star' || this.kind === 'black-hole' || this.kind === 'brown-dwarf';
  }

  get hasSurface() {
    return !!this.planet?.surface;
  }

  /** Spin angle at time t. */
  spinAngle(t: number): number {
    const r = this.rotation;
    if (r.locked && this.orbit) {
      const o = this.orbit;
      const n = Math.sqrt(o.mu / Math.abs(o.a * o.a * o.a));
      return o.node + o.peri + o.M0 + n * (t - o.epoch) + Math.PI;
    }
    if (!isFinite(r.period) || r.period === 0) return r.phase0;
    return r.phase0 + (2 * Math.PI * t) / r.period;
  }

  updateState(t: number) {
    if (this.orbit && this.parent) {
      orbitState(this.orbit, t, this.posSys, this.velSys);
      this.posSys.add(this.parent.posSys);
      this.velSys.add(this.parent.velSys);
    } else {
      this.posSys.set(0, 0, 0);
      this.velSys.set(0, 0, 0);
    }
    _q.setFromAxisAngle(Y, this.spinAngle(t));
    this.rot.copy(this.poleQ).multiply(_q);
  }
}

export interface BeltInfo {
  name: string;
  parent: Body;          // body the belt orbits
  inner: number;         // m
  outer: number;         // m
  thickness: number;     // rad (inclination spread)
  count: number;         // particles to render
  icy: boolean;
  seed: number;
  /** Trojan swarms: co-orbital with this planet, librating around its L4/L5 points */
  trojanOf?: Body;
}

/** A gravitationally bound system of bodies around a barycentre. */
export class StarSystem {
  readonly bodies: Body[] = [];
  belts: BeltInfo[] = [];
  /** free-form provenance / notes for the info panel */
  notes = '';
  readonly byId = new Map<string, Body>();
  /** system frame → universe frame */
  readonly q = new Quaternion();
  lastUpdate = NaN;

  constructor(
    readonly id: string,
    public name: string,
    readonly upos: UPos,
    readonly root: Body,
    readonly known = false,
  ) {
    const walk = (b: Body) => {
      b.system = this;
      this.bodies.push(b);
      this.byId.set(b.id, b);
      for (const c of b.children) walk(c);
    };
    walk(root);
    this.computeSOI();
  }

  get stars(): Body[] {
    return this.bodies.filter((b) => b.isStarLike);
  }

  private computeSOI() {
    for (const b of this.bodies) {
      if (!b.parent || !b.orbit) {
        b.soi = Infinity;
        continue;
      }
      const a = Math.abs(b.orbit.a);
      b.soi = a * Math.pow(b.mass / Math.max(b.parent.mass, 1), 0.4);
    }
  }

  update(t: number) {
    if (t === this.lastUpdate) return;
    this.lastUpdate = t;
    for (const b of this.bodies) b.updateState(t); // parents precede children (DFS order)
  }

  /** Universe position of a body. */
  bodyUPos(b: Body, out = new UPos()): UPos {
    const v = _v.copy(b.posSys).applyQuaternion(this.q);
    return out.copy(this.upos).add(v);
  }

  /** Body orientation in universe axes (body-fixed → universe). */
  bodyRotation(b: Body, out = new Quaternion()): Quaternion {
    return out.copy(this.q).multiply(b.rot);
  }

  /** Vector from body a to body b (universe axes, m), precise for nearby bodies. */
  relative(a: Body, b: Body, out = new Vector3()): Vector3 {
    return out.copy(b.posSys).sub(a.posSys).applyQuaternion(this.q);
  }
}

const _v = new Vector3();
