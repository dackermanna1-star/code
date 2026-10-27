/**
 * Universe-scale state: which galaxy the camera is in, which galaxies are
 * around, and which star system is "active" (fully simulated). Systems are
 * generated lazily from a star's catalogue reference the moment the camera
 * comes within reach, and dropped (with hysteresis) when it leaves.
 */
import { Vector3 } from 'three';
import { Universe } from '../astro/universe';
import { galaxyToUPos, uposToGalaxy, type GalaxyParams } from '../astro/galaxy';
import { starDesignation, starSeed, generateSector, type Exclusion } from '../astro/starsectors';
import type { StarRef } from '../render/starfield';
import type { StarField } from '../render/starfield';
import { generateSystem } from '../astro/systemgen';
import type { StarSystem } from '../astro/body';
import { UPos } from '../core/upos';
import { LY, MPC } from '../core/constants';
import type { World } from './world';
import { KNOWN_STARS } from '../astro/known/stars';
import { buildKnownSystem } from '../astro/known/knownsystems';
import { buildSolarSystem, SOLAR_SYSTEM_ID } from '../astro/known/solarsystem';
import { eclipticToGalaxyQuat, radecToGalaxyDir } from '../astro/known/coords';
import { blackbodyRGB } from '../astro/stellar';
import { visualEfficacy } from '../astro/photometry';

export interface SystemRef {
  id: string;
  name: string;
  galaxyId: string;
  upos: UPos;
  /** galaxy-local ly */
  local: Vector3;
  build: () => StarSystem;
  /** for rendering unresolved known stars */
  lumV?: number;
  color?: [number, number, number];
  known?: boolean;
  /** stellar parameters of the primary (procedural stars, before the system is generated) */
  star?: { lum: number; temp: number; mass: number; age: number; remnant: number };
}

export class Cosmos {
  readonly universe: Universe;
  galaxies: GalaxyParams[] = [];
  current: GalaxyParams | null = null;
  readonly camG = new Vector3();
  private lastGalaxyQuery = new Vector3(1e30, 0, 0);
  activeRef: SystemRef | null = null;
  /** known (catalogued) systems in galaxy-local ly: Solar System, nearby stars */
  knownSystems: SystemRef[] = [];
  lifeFrequency = 1;
  onSystemChange: (sys: StarSystem | null) => void = () => {};

  constructor(seed: number, knownLocalGroup: boolean) {
    this.universe = new Universe({ seed, knownLocalGroup });
    if (knownLocalGroup) this.addKnownSystems();
  }

  private addKnownSystems() {
    const mw = this.universe.home;
    const sun = this.universe.sunLocal;
    const sunU = galaxyToUPos(mw, sun.x, sun.y, sun.z);
    const qEcl = eclipticToGalaxyQuat();
    this.knownSystems.push({
      id: SOLAR_SYSTEM_ID, name: 'Solar System', galaxyId: mw.id, upos: sunU, local: sun.clone(), known: true,
      lumV: 1, color: blackbodyRGB(5772),
      build: () => buildSolarSystem(sunU, qEcl),
    });
    for (const e of KNOWN_STARS) {
      const dir = radecToGalaxyDir(e.ra, e.dec);
      const local = sun.clone().addScaledVector(dir, e.dist);
      const upos = galaxyToUPos(mw, local.x, local.y, local.z);
      const id = `MW/known/${e.id}`;
      const lumV = e.temp > 0 ? (e.lum + (e.companion?.lum ?? 0)) * visualEfficacy(e.temp) : 0;
      this.knownSystems.push({
        id, name: e.name, galaxyId: mw.id, upos, local, known: true, lumV, color: e.temp > 0 ? blackbodyRGB(e.temp) : [0, 0, 0],
        build: () => buildKnownSystem(e, id, upos, this.lifeFrequency),
      });
    }
  }

  refFromStar(s: StarRef): SystemRef {
    const g = s.galaxy;
    const name = starDesignation(g, s.level, s.ix, s.iy, s.iz, s.index);
    const id = `${g.id}/${s.level}:${s.ix}:${s.iy}:${s.iz}:${s.index}`;
    const upos = galaxyToUPos(g, s.x, s.y, s.z);
    const seed = starSeed(g, s.level, s.ix, s.iy, s.iz, s.index);
    return {
      id, name, galaxyId: g.id, upos, local: new Vector3(s.x, s.y, s.z),
      lumV: s.lumV, color: blackbodyRGB(Math.max(s.temp, 1000)),
      star: { lum: s.lum, temp: s.temp, mass: s.mass, age: s.age, remnant: s.remnant },
      build: () => generateSystem({
        id, name, seed, upos,
        primaryMass: s.mass, age: s.age * 1e9, metallicity: g.metallicity, lifeFrequency: this.lifeFrequency,
      }),
    };
  }

  /** Regions where procedural stars are suppressed (the catalogued solar neighbourhood). */
  exclusionsFor(g: GalaxyParams): Exclusion[] {
    if (!(g.known && g.id === 'MW') || !this.knownSystems.length) return [];
    const s = this.universe.sunLocal;
    return [{ x: s.x, y: s.y, z: s.z, r: 20 }];
  }

  /** Rebuild a system reference from its id (catalogued or procedural star). */
  refById(id: string): SystemRef | null {
    const k = this.knownSystems.find((r) => r.id === id);
    if (k) return k;
    const slash = id.indexOf('/');
    if (slash < 0) return null;
    const g = this.universe.galaxyById(id.slice(0, slash));
    const m = /^(\d+):(-?\d+):(-?\d+):(-?\d+):(\d+)$/.exec(id.slice(slash + 1));
    if (!g || !m) return null;
    const [level, ix, iy, iz, index] = m.slice(1).map(Number);
    const sec = generateSector(g, level, ix, iy, iz, this.exclusionsFor(g));
    if (index >= sec.count) return null;
    return this.refFromStar({
      galaxy: g, level, ix, iy, iz, index,
      x: sec.cx + sec.pos[index * 3], y: sec.cy + sec.pos[index * 3 + 1], z: sec.cz + sec.pos[index * 3 + 2],
      lum: sec.lum[index], lumV: sec.lumV[index], temp: sec.temp[index], mass: sec.mass[index], age: sec.age[index], remnant: sec.remnant[index],
    });
  }

  update(world: World, cam: UPos, field: StarField, frame: number) {
    // galaxies around (refresh when moved > 0.25 Mpc)
    const cm = cam.toApproxMeters(new Vector3()).multiplyScalar(1 / MPC);
    if (cm.distanceTo(this.lastGalaxyQuery) > 0.25 || frame % 600 === 0) {
      this.galaxies = this.universe.galaxiesAround(cm.x, cm.y, cm.z);
      this.lastGalaxyQuery.copy(cm);
    }
    // current galaxy: the one whose body contains us (largest if overlapping)
    let cur: GalaxyParams | null = null;
    let best = Infinity;
    for (const g of this.galaxies) {
      const d = g.upos.distanceTo(cam) / LY;
      const rr = d / (g.radius * 1.25);
      if (rr < 1 && rr < best) {
        best = rr;
        cur = g;
      }
    }
    if (cur !== this.current) {
      this.current = cur;
      field.setGalaxy(cur, cur ? this.exclusionsFor(cur) : []);
    }
    if (cur) uposToGalaxy(cur, cam, this.camG);
    // active system
    if (cur && frame % 10 === 0) {
      let cand: SystemRef | null = null;
      let cd = Infinity;
      for (const k of this.knownSystems) {
        if (k.galaxyId !== cur.id) continue;
        const d = k.local.distanceTo(this.camG);
        if (d < cd) { cd = d; cand = k; }
      }
      const n = field.nearest(this.camG, 0.6);
      if (n && n.dist < cd) {
        cd = n.dist;
        const sfx = `${n.star.level}:${n.star.ix}:${n.star.iy}:${n.star.iz}:${n.star.index}`;
        cand = this.activeRef && this.activeRef.id.endsWith('/' + sfx) ? this.activeRef : this.refFromStar(n.star);
      }
      const act = this.activeRef;
      const actDist = act ? act.local.distanceTo(this.camG) : Infinity;
      if (act && actDist < 1.0 && (!cand || cand.id === act.id || cd > actDist * 0.5)) {
        // keep the current system (hysteresis)
      } else if (cand && cd < 0.5) {
        this.activate(world, cand);
      } else if (act && actDist >= 1.0) {
        this.activate(world, null);
      }
    } else if (!cur && this.activeRef && frame % 10 === 0) {
      this.activate(world, null);
    }
  }

  activate(world: World, ref: SystemRef | null) {
    if (ref?.id === this.activeRef?.id) return;
    this.activeRef = ref;
    const sys = ref ? ref.build() : null;
    if (sys) sys.update(world.time);
    // keep the view continuous: re-express it in the universe frame before swapping
    world.view.rebase('universe', null);
    world.system = sys;
    this.onSystemChange(sys);
  }

  /** Distance (m) to the nearest star or galaxy, used to scale free-flight speed. */
  speedReference(cam: UPos, field: StarField): number {
    if (this.current) {
      const n = field.nearest(this.camG, 200);
      const dStar = n ? n.dist * LY : 50 * LY;
      return Math.max(dStar, 1e9);
    }
    let best = Infinity;
    for (const g of this.galaxies) {
      const d = g.upos.distanceTo(cam) - g.radius * LY;
      if (d < best) best = d;
    }
    return Math.max(best, 1e18);
  }
}
