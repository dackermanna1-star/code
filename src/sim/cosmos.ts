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
import { knownNebulae, nebulaeAround, type Nebula } from '../astro/nebulae';
import { buildRogueSystem, cellRogues, roguesAround, type Rogue } from '../astro/rogues';

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
  /** free-floating planet (no star) */
  rogue?: Rogue;
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
  /** catalogued nebulae (Milky Way) */
  readonly knownNebulae: Nebula[] = [];
  /** nebulae (catalogued + procedural) around the camera in the current galaxy */
  nebulae: Nebula[] = [];
  private nebQuery = new Vector3(1e30, 0, 0);
  /** rogue planets within a few light-years */
  rogues: Rogue[] = [];
  private rogueQuery = new Vector3(1e30, 0, 0);
  private rogueGalaxy: string | null = null;
  private nebGalaxy: string | null = null;

  constructor(seed: number, knownLocalGroup: boolean) {
    this.universe = new Universe({ seed, knownLocalGroup });
    if (knownLocalGroup) {
      this.addKnownSystems();
      this.knownNebulae.push(...knownNebulae(this.universe.home, this.universe.sunLocal));
    }
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

  refFromRogue(r: Rogue): SystemRef {
    const g = this.universe.galaxyById(r.galaxyId)!;
    const upos = galaxyToUPos(g, r.local.x, r.local.y, r.local.z);
    return { id: r.id, name: r.name, galaxyId: r.galaxyId, upos, local: r.local.clone(), lumV: 0, color: [0, 0, 0], rogue: r, build: () => buildRogueSystem(r, upos, this.lifeFrequency) };
  }

  /** Rebuild a system reference from its id (catalogued or procedural star, or rogue planet). */
  refById(id: string): SystemRef | null {
    const k = this.knownSystems.find((r) => r.id === id);
    if (k) return k;
    const rm = /^(.+)\/rogue\/(-?\d+):(-?\d+):(-?\d+):(\d+)$/.exec(id);
    if (rm) {
      const g = this.universe.galaxyById(rm[1]);
      if (!g) return null;
      const r = cellRogues(g, +rm[2], +rm[3], +rm[4], this.exclusionsFor(g)).find((x) => x.id === id);
      return r ? this.refFromRogue(r) : null;
    }
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
    // rogue planets near the camera (re-queried after moving half a light-year)
    if (!cur) {
      this.rogues = [];
      this.rogueGalaxy = null;
    } else if (cur.id !== this.rogueGalaxy || this.camG.distanceTo(this.rogueQuery) > 0.5) {
      this.rogues = roguesAround(cur, this.camG, 6, this.exclusionsFor(cur));
      this.rogueQuery.copy(this.camG);
      this.rogueGalaxy = cur.id;
    }
    // nebulae near the camera (re-queried after moving a few hundred ly)
    if (!cur) {
      this.nebulae = [];
      this.nebGalaxy = null;
    } else if (cur.id !== this.nebGalaxy || this.camG.distanceTo(this.nebQuery) > 250) {
      this.nebulae = nebulaeAround(cur, this.camG, 3500, this.knownNebulae);
      this.nebQuery.copy(this.camG);
      this.nebGalaxy = cur.id;
    }
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
      // a rogue planet takes over very close to it (~600 AU), and is kept within ~1900 AU
      let rogue: Rogue | null = null, rd = Infinity;
      for (const r of this.rogues) {
        const d = r.local.distanceTo(this.camG);
        if (d < rd) { rd = d; rogue = r; }
      }
      const act = this.activeRef;
      const actDist = act ? act.local.distanceTo(this.camG) : Infinity;
      if (act?.rogue) {
        if (actDist > 0.03) this.activate(world, null);
        return;
      }
      if (rogue && rd < 0.01) {
        this.activate(world, this.refFromRogue(rogue));
        return;
      }
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
