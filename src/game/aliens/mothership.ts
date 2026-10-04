/**
 * The mothership ("Harbinger", 1.1 km across).
 *
 * descend (slowly sinks out of the sky over a minute, through the clouds) → hover (bobs, outer
 * ring turning) → charge (the core orb brightens, energy streams converge on it) → fire (a
 * colossal beam to the ground) → hover ... When its hull is destroyed: dying (chain explosions
 * across the hull, lights failing, the core detonates) → falling (it tips and drops) → crashed
 * (a smoking wreck half-buried in the land). The core is a weak point: hits there count ×4, and
 * ×12 while it is charging.
 */
import * as THREE from 'three';
import { mothershipGeometry, MOTHER_RADIUS } from './shipDesigns';
import { hullMaterial } from './alienRender';
import type { Renderer } from '../../render/renderer';

export type MotherState = 'waiting' | 'descend' | 'hover' | 'charge' | 'fire' | 'dying' | 'falling' | 'crashed';

export const MOTHER_HP = 45000;
const CORE_Y = -236;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

export class Mothership {
  readonly root = new THREE.Group();
  private hull: THREE.Mesh;
  private core: THREE.Mesh;
  private ring: THREE.Mesh;
  private hullMat: THREE.RawShaderMaterial;
  private coreMat: THREE.RawShaderMaterial;
  state: MotherState = 'waiting';
  hp = MOTHER_HP;
  t = 0;
  /** seconds in the current state */
  st = 0;
  readonly pos = new THREE.Vector3();
  readonly start = new THREE.Vector3();
  readonly hover = new THREE.Vector3();
  /** current beam target on the ground (fire state) */
  readonly beamTarget = new THREE.Vector3();
  charge = 0;
  /** tilt while falling (radians) and its axis */
  private tilt = 0;
  private readonly tiltAxis = new THREE.Vector3(1, 0, 0);
  fallV = 0;
  /** 0..1 lights (fail while dying) */
  lights = 1;
  ringSpin = 0;

  constructor(r: Renderer, hover: THREE.Vector3) {
    const g = mothershipGeometry();
    this.hullMat = hullMaterial(r, false, 6);
    this.coreMat = hullMaterial(r, false, 10);
    this.hull = new THREE.Mesh(g.hull, this.hullMat);
    this.core = new THREE.Mesh(g.core, this.coreMat);
    this.ring = new THREE.Mesh(g.ring, this.hullMat);
    for (const m of [this.hull, this.core, this.ring]) { m.frustumCulled = false; this.root.add(m); }
    this.hover.copy(hover);
    this.start.set(hover.x - 900, hover.y + 2600, hover.z - 400);
    this.pos.copy(this.start);
    this.root.visible = false;
    this.place();
  }

  get alive() {
    return this.hp > 0;
  }
  /** World position of the weapon core. */
  corePos(out = new THREE.Vector3()) {
    return out.set(0, CORE_Y, 0).applyMatrix4(this.root.matrix);
  }

  arrive() {
    this.state = 'descend';
    this.st = 0;
    this.root.visible = true;
  }

  startCharge(target: THREE.Vector3) {
    this.beamTarget.copy(target);
    this.state = 'charge';
    this.st = 0;
  }

  /** Damage at a world point; returns the damage actually dealt. */
  hit(dmg: number, at?: THREE.Vector3): number {
    if (!this.alive || this.state === 'waiting') return 0;
    let k = 1;
    if (at && at.distanceTo(this.corePos(_w)) < 70) k = this.state === 'charge' ? 12 : 4;
    const d = dmg * k;
    this.hp -= d;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      this.st = 0;
    }
    return d;
  }

  /** Ray vs the hull (an ellipsoid) and the core; returns the distance or null. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxT: number): { t: number; core: boolean } | null {
    if (this.state === 'waiting' || this.state === 'crashed') return null;
    _inv.copy(this.root.matrix).invert();
    const lo = _v.copy(o).applyMatrix4(_inv);
    const ld = _w.copy(d).transformDirection(_inv);
    let best: { t: number; core: boolean } | null = null;
    // hull ellipsoid (x/z radius 560, y half-height 105, centred 20 above the origin)
    {
      const sx = 1 / MOTHER_RADIUS, sy = 1 / 105;
      const ox = lo.x * sx, oy = (lo.y - 20) * sy, oz = lo.z * sx;
      const dx = ld.x * sx, dy = ld.y * sy, dz = ld.z * sx;
      const a = dx * dx + dy * dy + dz * dz, b = 2 * (ox * dx + oy * dy + oz * dz), c = ox * ox + oy * oy + oz * oz - 1;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t <= maxT) best = { t, core: false };
      }
    }
    // core sphere + inverted spire (sphere approximation)
    for (const [cy, R, core] of [[CORE_Y, 34, true], [-160, 70, false]] as const) {
      const ox = -lo.x, oy = cy - lo.y, oz = -lo.z;
      const tc = ox * ld.x + oy * ld.y + oz * ld.z;
      const d2 = ox * ox + oy * oy + oz * oz - tc * tc;
      if (tc > 0 && d2 < R * R) {
        const t = tc - Math.sqrt(R * R - d2);
        if (t >= 0 && t <= maxT && (!best || t < best.t)) best = { t, core };
      }
    }
    return best;
  }

  /** Lowest point (the tip of the core) in world space. */
  lowest(out = new THREE.Vector3()) {
    return out.set(0, CORE_Y - 26, 0).applyMatrix4(this.root.matrix);
  }

  update(dt: number, ground: (x: number, z: number) => number | null): 'crash' | null {
    this.t += dt;
    this.st += dt;
    let ev: 'crash' | null = null;
    switch (this.state) {
      case 'descend': {
        const k = Math.min(1, this.st / 70);
        const e = 1 - Math.pow(1 - k, 3);
        this.pos.lerpVectors(this.start, this.hover, e);
        if (k >= 1) { this.state = 'hover'; this.st = 0; }
        break;
      }
      case 'hover':
        this.pos.copy(this.hover).setY(this.hover.y + Math.sin(this.t * 0.15) * 4);
        this.charge = Math.max(0, this.charge - dt * 0.5);
        break;
      case 'charge':
        this.charge = Math.min(1, this.st / 6);
        if (this.st >= 6) { this.state = 'fire'; this.st = 0; }
        break;
      case 'fire':
        this.charge = 1;
        if (this.st >= 3.5) { this.state = 'hover'; this.st = 0; }
        break;
      case 'dying':
        this.lights = Math.max(0, 1 - this.st / 7) * (0.5 + 0.5 * Math.sin(this.t * 40));
        this.charge = Math.max(0, 1 - this.st);
        if (this.st >= 7) {
          this.state = 'falling';
          this.st = 0;
          this.tiltAxis.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        }
        break;
      case 'falling': {
        this.lights = 0;
        this.fallV += 2.2 * dt;
        this.pos.y -= this.fallV * dt;
        this.pos.x += this.tiltAxis.z * this.fallV * dt * 0.25;
        this.pos.z -= this.tiltAxis.x * this.fallV * dt * 0.25;
        this.tilt = Math.min(0.32, this.tilt + dt * 0.012);
        const low = this.lowest(_v);
        const gy = ground(low.x, low.z);
        // the rim on the down-tilted side touching the ground counts too
        const rim = _w.set(this.tiltAxis.z, 0, -this.tiltAxis.x).multiplyScalar(MOTHER_RADIUS).applyMatrix4(this.root.matrix);
        const gr = ground(rim.x, rim.z);
        if ((gy !== null && low.y <= gy) || (gr !== null && rim.y <= gr + 10) || this.pos.y < this.hover.y - 600) {
          this.state = 'crashed';
          this.st = 0;
          ev = 'crash';
        }
        break;
      }
      default:
        break;
    }
    this.ringSpin += dt * (this.state === 'falling' || this.state === 'crashed' ? 0.002 : 0.025);
    this.place();
    // materials: failing lights, core charge
    const lightsOn = this.state === 'dying' || this.state === 'falling' || this.state === 'crashed' ? this.lights : 1;
    this.hullMat.uniforms.u_glowGain.value = 6 * lightsOn;
    const pulse = 0.85 + 0.15 * Math.sin(this.t * 2.2);
    this.coreMat.uniforms.u_glowGain.value = (this.state === 'crashed' ? 0 : 8 * pulse + this.charge * this.charge * 90) * (this.alive || this.state === 'dying' ? 1 : 0.2);
    return ev;
  }

  private place() {
    _m.makeRotationAxis(this.tiltAxis, this.tilt);
    this.root.matrixAutoUpdate = false;
    this.root.matrix.makeRotationY(0).multiply(_m);
    this.root.matrix.setPosition(this.pos);
    this.root.matrixWorldNeedsUpdate = true;
    this.ring.rotation.y = this.ringSpin;
  }

  /** How much of the sun the disc blocks for an observer at `p` looking along `sun` (0..1). */
  occlusion(p: THREE.Vector3, sun: THREE.Vector3): number {
    if (this.state === 'waiting' || sun.y < 0.02) return 0;
    const t = (this.pos.y - p.y) / sun.y;
    if (t <= 0) return 0;
    const x = p.x + sun.x * t - this.pos.x, z = p.z + sun.z * t - this.pos.z;
    const r = Math.hypot(x, z);
    return 1 - THREE.MathUtils.smoothstep(r, MOTHER_RADIUS * 0.82, MOTHER_RADIUS * 1.02);
  }

  dispose() {
    this.root.removeFromParent();
    this.hull.geometry.dispose();
    this.core.geometry.dispose();
    this.ring.geometry.dispose();
    this.hullMat.dispose();
    this.coreMat.dispose();
  }
}
