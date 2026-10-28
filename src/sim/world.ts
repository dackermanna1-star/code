/**
 * Simulation state shared by every subsystem: clock, the active star system,
 * the viewpoint, and main-thread surface queries (collision, altitude).
 */
import { Vector3 } from 'three';
import type { Body, StarSystem } from '../astro/body';
import { SurfaceGenerator } from '../terrain/surface';
import { CaveIndex, type Tunnel, type TunnelLocal } from './caves';
import { FramedPosition } from './frame';
import { UPos } from '../core/upos';
import { unixMsToJ2000Seconds } from '../core/constants';

const _v = new Vector3();
const _u = new UPos();
const _u2 = new UPos();

export class World {
  time = unixMsToJ2000Seconds(Date.now());
  timeScale = 1;
  paused = false;
  system: StarSystem | null = null;
  readonly view = new FramedPosition();
  private gens = new Map<string, SurfaceGenerator>();
  private caveIdx = new Map<string, CaveIndex>();

  advance(dt: number) {
    if (!this.paused) this.time += dt * this.timeScale;
    this.system?.update(this.time);
  }

  generator(b: Body): SurfaceGenerator | null {
    const sp = b.planet?.surface;
    if (!sp) return null;
    let g = this.gens.get(b.id);
    if (!g) {
      g = new SurfaceGenerator(sp);
      this.gens.set(b.id, g);
    }
    return g;
  }

  /** Surface radius (m from centre) under a body-fixed direction, including liquid surface. */
  surfaceRadius(b: Body, dirBody: Vector3, lambda = 0.25): number {
    const g = this.generator(b);
    if (!g) return b.radius * (b.planet?.type === 'gas-giant' || b.planet?.type === 'ice-giant' ? 1 : 1);
    const d = _v.copy(dirBody).normalize();
    const smp = g.sample(d.x, d.y, d.z, lambda);
    const sea = g.liquidLevel();
    return b.radius + Math.max(smp.height, sea, smp.water);
  }

  /** Cave tunnels of a body (traced lazily), or null on worlds without a solid surface. */
  caves(b: Body): CaveIndex | null {
    const g = this.generator(b);
    if (!g) return null;
    let c = this.caveIdx.get(b.id);
    if (!c) { c = new CaveIndex(g); this.caveIdx.set(b.id, c); }
    return c;
  }

  /**
   * Ground under a body-fixed point, aware of caves: inside a tunnel the floor
   * and ceiling are the tunnel's; elsewhere the terrain's (and liquid level).
   */
  groundAt(b: Body, posBody: Vector3, lambda = 0.25): { ground: number; liquid: number; cave: { tunnel: Tunnel; local: TunnelLocal } | null } {
    const c = this.caves(b);
    const inCave = c ? c.locate(posBody.x, posBody.y, posBody.z) : null;
    if (inCave) return { ground: inCave.local.floorR, liquid: -Infinity, cave: inCave };
    const gi = this.groundInfo(b, posBody, lambda);
    return { ground: gi.ground, liquid: gi.liquid, cave: null };
  }

  /** Ground height (solid, ignoring liquid) and liquid level under a direction. */
  groundInfo(b: Body, dirBody: Vector3, lambda = 0.25): { ground: number; liquid: number } {
    const g = this.generator(b);
    if (!g) return { ground: b.radius, liquid: -Infinity };
    const d = _v.copy(dirBody).normalize();
    const smp = g.sample(d.x, d.y, d.z, lambda);
    const liq = Math.max(g.liquidLevel(), smp.water);
    return { ground: b.radius + smp.height, liquid: liq > -Infinity ? b.radius + liq : -Infinity };
  }

  /** Distance (m) from a universe position to a body's centre. */
  distanceToBody(p: UPos, b: Body): number {
    return b.system.bodyUPos(b, _u).distanceTo(p);
  }

  /**
   * Nearest body by distance to its surface. Returns altitude above the
   * surface (approximate for non-anchor bodies).
   */
  nearest(p: UPos): { body: Body | null; altitude: number; distance: number } {
    let best: Body | null = null;
    let bestAlt = Infinity, bestDist = Infinity;
    if (!this.system) return { body: null, altitude: Infinity, distance: Infinity };
    for (const b of this.system.bodies) {
      if (b.kind === 'barycenter') continue;
      const d = this.system.bodyUPos(b, _u2).distanceTo(p);
      const alt = d - b.radius;
      if (alt < bestAlt) {
        bestAlt = alt;
        bestDist = d;
        best = b;
      }
    }
    return { body: best, altitude: bestAlt, distance: bestDist };
  }

  /** Precise altitude above terrain for a framed position anchored to a body. */
  altitudeAbove(fp: FramedPosition, b: Body): number {
    const local = fp.body === b ? fp.offsetBodyFixed(_v) : (() => {
      fp.toUPos(_u);
      b.system.bodyUPos(b, _u2);
      _u.sub(_u2, _v);
      return _v.applyQuaternion(b.system.bodyRotation(b).invert());
    })();
    const r = local.length();
    return r - this.surfaceRadius(b, local);
  }
}
