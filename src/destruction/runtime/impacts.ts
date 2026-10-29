// Impacts → energy → part responses (docs/ARCHITECTURE.md §4.2–4.4).
//
// Collision reports from the physics system are copied into a pooled buffer during the step
// and processed in afterPhysics (never inside Havok callbacks): bodies are mapped to islands
// (bodies we don't own — the player, the building — are the rigid "world" side), the hit part
// is located geometrically (collision events carry no child index), the dissipated energy is
// split by stiffness, and each side's part gets `respond(...)` from the damage model. The
// outcome is applied here: dents/cracks (render dirty), fatigue points, direct + inertial bond
// damage, chips → micro-debris, fracture plans → the budgeted queue. Tool/fist/kick/stomp
// strikes use the same path with the striker as the other side. Passive collisions are
// handled most energetic first and their damage planning is time-budgeted per step (fragment
// showers after a big break make hundreds of contacts); every impact still emits its event.
// The hot path reuses pooled scratch (RNG, inertial-loading arrays); respond() itself and the
// small point/direction objects handed to it allocate (its outputs may keep references).

import { PhysicsMotionType, Vector3 } from "@babylonjs/core";
import type { RawImpact, StrikeInput, StrikeResult } from "../../core/context.ts";
import { Rng, seedFrom } from "../../core/rng.ts";
import type { Vec3 } from "../../geom/vec.ts";
import { S } from "../../render/surfaces.ts";
import { hardness, impactEnergy, inertialBondDamage, respond, type ImpactOnPart, type PartOutcome } from "../model/damage.ts";
import { MATERIALS } from "../model/materials.ts";
import type { BondKind } from "../model/types.ts";
import { FarMassScratch, farMasses, type GraphBond } from "./graph.ts";
import { mergeDents, nearestFace } from "./polyUtil.ts";
import type { Bond, Island, Part } from "./types.ts";
import type { World } from "./world.ts";

/** Below this energy share (J) a part is not asked to respond (no measurable damage). */
export const RESPOND_MIN_ENERGY = 0.04;
/** Impacts below this dissipated energy (J) make no event (no sound). */
export const IMPACT_EVENT_MIN_ENERGY = 0.004;
/** Minimum time between impact events of the same island pair (s). */
export const IMPACT_PAIR_INTERVAL = 0.04;
/** Contacts between fresh siblings of one split are ignored this long (s). */
export const SIBLING_GRACE = 0.15;
/** Fatigue memory decay time constant (s). */
export const DAMAGE_DECAY_TAU = 120;
/** Inertial bond loading is skipped when the island's kinetic energy change is below this (J). */
const INERTIAL_MIN_ENERGY = 0.05;
/**
 * Damage planning budget for passive collisions per step (ms; at least RESPOND_MIN_COUNT
 * impacts): after a big break, fragment showers produce hundreds of contacts per step. Impacts
 * are handled most energetic first; once the budget is spent the rest still make their sound
 * (impact events) but cause no damage this step. The minimum is small because one response
 * that breaks a big part plans its whole fracture (Voronoi cells) right away: 8 forced
 * responses cost 100–450 ms in single steps of a heavy wreck (≈ 25 ms each on this VM).
 */
export const RESPOND_BUDGET_MS = 2.5;
const RESPOND_MIN_COUNT = 3;
/** Below this many buffered impacts they are processed in arrival order (no sorting). */
const SORT_MIN = 16;
const MAX_DENTS = 48;
const MAX_CRACKS = 64;

interface ImpactRec {
  a: RawImpact["bodyA"];
  b: RawImpact["bodyB"];
  px: number;
  py: number;
  pz: number;
  nx: number;
  ny: number;
  nz: number;
  impulse: number;
  started: boolean;
}

/** Services the impact system needs from the other subsystems. */
export interface ImpactDeps {
  enqueueFracture(part: Part, plan: NonNullable<PartOutcome["fracture"]>, energy: number, pos: Vec3, dir: Vec3, strike: boolean): void;
  /** Apply queued fractures now (strikes) and settle topology. */
  settleNow(): void;
  restore(island: Island): void;
  onDamage(part: Part, info: { absorbed: number; energy: number; pos: Vec3; normal: Vec3; crack: number; dent: number; strike: boolean; sharpness: number }): void;
  markDamage(part: Part): void;
  /** Collider refresh for a crumpled sheet part. */
  crumpled(part: Part): void;
}

const tmpVec = new Vector3();
const tmpPos = new Vector3();

export class ImpactSystem {
  private readonly w: World;
  private readonly deps: ImpactDeps;
  private buf: ImpactRec[] = [];
  private count = 0;
  private pairTime = new Map<number, number>();
  private lastPrune = 0;
  private readonly lp: Vec3 = { x: 0, y: 0, z: 0 };
  /** Impacts processed in the last step (debug). */
  processed = 0;
  /** Impacts whose damage was skipped in the last step (respond budget spent; debug). */
  skipped = 0;
  // respond budget of the current process() call
  private respondMs = 0;
  private responds = 0;
  private budgeted = false;
  // processing order (pooled)
  private order: number[] = [];
  private keys = new Float64Array(64);
  private readonly byKey = (a: number, b: number): number => this.keys[b] - this.keys[a];
  /** Damage-model RNG, re-seeded per hit (deterministic per part/point/energy, no allocation). */
  private readonly rng = new Rng(1);
  // inertial loading scratch
  private readonly gbs: GraphBond[] = [];
  private gbsUsed = 0;
  private readonly iBonds: Bond[] = [];
  private readonly iJoints: Bond[] = [];
  private readonly iPool: Array<{ id: number; farMass: number; kind: BondKind }> = [];
  private readonly iList: Array<{ id: number; farMass: number; kind: BondKind }> = [];
  private iListUsed = 0;
  private iMasses = new Float64Array(64);
  private readonly farScratch = new FarMassScratch();

  constructor(w: World, deps: ImpactDeps) {
    this.w = w;
    this.deps = deps;
  }

  /** Physics callback: copy the report (no processing, no allocation in steady state). */
  onRaw(e: RawImpact): void {
    if (!(e.impulse > 0) || !Number.isFinite(e.impulse)) return;
    let r = this.buf[this.count];
    if (!r) {
      r = { a: e.bodyA, b: e.bodyB, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0, impulse: 0, started: false };
      this.buf.push(r);
    }
    r.a = e.bodyA;
    r.b = e.bodyB;
    r.px = e.point.x;
    r.py = e.point.y;
    r.pz = e.point.z;
    r.nx = e.normal.x;
    r.ny = e.normal.y;
    r.nz = e.normal.z;
    r.impulse = e.impulse;
    r.started = e.started;
    this.count++;
  }

  /**
   * Process every buffered impact of the last physics step: most energetic first when there
   * are many (cheap J²/2μ estimate), damage planning under RESPOND_BUDGET_MS.
   */
  process(): void {
    const n = this.count;
    this.processed = n;
    this.skipped = 0;
    this.respondMs = 0;
    this.responds = 0;
    this.budgeted = true;
    const order = this.order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    if (n > SORT_MIN) {
      if (this.keys.length < n) this.keys = new Float64Array(Math.max(n, this.keys.length * 2));
      for (let i = 0; i < n; i++) this.keys[i] = this.priority(this.buf[i]);
      order.sort(this.byKey);
    }
    for (let k = 0; k < n; k++) {
      const r = this.buf[order[k]];
      try {
        this.processOne(r);
      } catch (e) {
        this.w.warnOnce(`impact:${(e as Error).message}`, `impact processing failed: ${(e as Error).stack ?? e}`);
      }
    }
    for (let i = 0; i < n; i++) {
      // drop body references so disposed bodies can be collected
      const r = this.buf[i];
      r.a = null as unknown as ImpactRec["a"];
      r.b = null as unknown as ImpactRec["b"];
    }
    this.budgeted = false;
    this.count = 0;
    const now = this.w.now;
    if (now - this.lastPrune > 2) {
      this.lastPrune = now;
      for (const [k, t] of this.pairTime) if (now - t > 1) this.pairTime.delete(k);
    }
  }

  /** Cheap ordering key: kinetic energy J²/(2μ) the contact can dissipate (no part lookup). */
  private priority(r: ImpactRec): number {
    const A = this.w.islandOf(r.a),
      B = this.w.islandOf(r.b);
    const mA = A && A.alive ? this.w.physMass(A) : Infinity;
    const mB = B && B.alive ? this.w.physMass(B) : Infinity;
    const mu = Number.isFinite(mA) && Number.isFinite(mB) ? (mA * mB) / (mA + mB) : Math.min(mA, mB);
    return Number.isFinite(mu) && mu > 0 ? (r.impulse * r.impulse) / (2 * mu) : 0;
  }

  /** May the next passive impact still be given damage this step? */
  private damageAllowed(): boolean {
    return !this.budgeted || this.responds < RESPOND_MIN_COUNT || this.respondMs < RESPOND_BUDGET_MS;
  }

  private processOne(r: ImpactRec): void {
    const w = this.w;
    let A = w.islandOf(r.a);
    let B = w.islandOf(r.b);
    if (A && !A.alive) A = undefined;
    if (B && !B.alive) B = undefined;
    if (!A && !B) return;
    if (A === B) return;
    // keep A = one of ours
    let nx = r.nx,
      ny = r.ny,
      nz = r.nz;
    /** Body on the B side that the destruction system doesn't own (player, props), if any. */
    let foreign = B ? null : r.b;
    if (!A) {
      A = B;
      B = undefined;
      foreign = r.a;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const islA = A!;
    // pieces of the same split spawn touching each other: ignore their mutual contacts briefly
    if (B && islA.birth !== 0 && islA.birth === B.birth && w.now - Math.max(islA.birthTime, B.birthTime) < SIBLING_GRACE) return;
    if (islA.consolidated) this.deps.restore(islA);
    if (B && B.consolidated) this.deps.restore(B);
    const P = { x: r.px, y: r.py, z: r.pz };
    const pA = w.locatePart(islA, w.toLocal(islA, P, this.lp));
    if (!pA) return;
    const pB = B ? w.locatePart(B, w.toLocal(B, P, this.lp)) : null;
    // the masses Havok used to produce J (tiny shards are clamped)
    const mA = w.physMass(islA);
    const mB = B && pB ? w.physMass(B) : Infinity;
    if (!Number.isFinite(mA) && !Number.isFinite(mB)) return;
    const J = r.impulse;
    const ie = impactEnergy(J, mA, mB, pA.mat, pB ? pB.mat : null);
    const E = ie.E;
    if (!(E > 0) || !Number.isFinite(E)) return;
    const shareA = Math.min(1, Math.max(0, ie.shareA));
    islA.lastHit = w.now;
    if (B) B.lastHit = w.now;
    // A is pushed along -n (into A), B along +n
    const eA = E * shareA,
      eB = E * (1 - shareA);
    const wantsDamage = eA >= RESPOND_MIN_ENERGY || eB >= RESPOND_MIN_ENERGY || (J * J) / (2 * Math.min(mA, mB)) >= INERTIAL_MIN_ENERGY;
    if (wantsDamage && this.damageAllowed()) {
      const t0 = performance.now();
      if (eA >= RESPOND_MIN_ENERGY) this.hitPart(islA, pA, P, { x: -nx, y: -ny, z: -nz }, eA, J, mA, 0, 1, false);
      if (B && pB && pB.alive && B.alive && eB >= RESPOND_MIN_ENERGY) this.hitPart(B, pB, P, { x: nx, y: ny, z: nz }, eB, J, mB, 0, 1, false);
      if (islA.alive) this.inertial(islA, pA, J);
      if (B && pB && B.alive) this.inertial(B, pB, J);
      this.respondMs += performance.now() - t0;
      this.responds++;
    } else if (wantsDamage) this.skipped++;
    if (E >= IMPACT_EVENT_MIN_ENERGY && this.pairOk(islA.id, B ? B.id : -1)) {
      const mu = ie.mu > 0 && Number.isFinite(ie.mu) ? ie.mu : Math.min(mA, mB);
      this.w.events.emit("impact", {
        pos: P,
        normal: { x: nx, y: ny, z: nz },
        energy: E,
        impulse: J,
        speed: Number.isFinite(mu) && mu > 0 ? J / mu : 0,
        matA: pA.matId,
        matB: pB ? pB.matId : null,
        sizeA: pA.ext[0],
        sizeB: pB ? pB.ext[0] : 0,
        massA: islA.isStatic ? pA.mass : islA.mass,
        massB: B && pB ? (B.isStatic ? pB.mass : B.mass) : 0,
        idA: islA.id,
        idB: B ? B.id : -1,
        staticA: islA.isStatic,
        staticB: B ? B.isStatic : isStaticBody(foreign),
      });
    }
  }

  private pairOk(a: number, b: number): boolean {
    const lo = Math.min(a, b) + 1,
      hi = Math.max(a, b) + 1;
    const key = lo * 67108864 + hi;
    const now = this.w.now;
    const t = this.pairTime.get(key);
    if (t !== undefined && now - t < IMPACT_PAIR_INTERVAL) return false;
    this.pairTime.set(key, now);
    return true;
  }

  /**
   * Ask the damage model how `part` responds to `energy` delivered at world point P along the
   * world direction `dirIn` (into the part), and apply the outcome. Returns the outcome (null
   * when skipped because a fracture of this part is already queued).
   */
  hitPart(island: Island, part: Part, P: Vec3, dirIn: Vec3, energy: number, J: number, islandMass: number, contactRadius: number, sharpness: number, strike: boolean): PartOutcome | null {
    if (part.pendingFracture || !part.alive) return null;
    const w = this.w;
    const point = w.toLocal(island, P, { x: 0, y: 0, z: 0 });
    const dir = w.dirToLocal(island, dirIn, { x: 0, y: 0, z: 0 });
    this.decay(part);
    this.prepareBondMasses(island, part);
    const imp: ImpactOnPart = {
      point,
      dir,
      energy,
      impulse: J,
      islandMass,
      contactRadius: contactRadius > 0 ? contactRadius : 0,
      sharpness: sharpness > 0 ? sharpness : 1,
      strike,
    };
    const seed = seedFrom(part.id, point.x, point.y, point.z, energy);
    const out = respond(part, imp, RESEEDABLE ? reseed(this.rng, seed) : new Rng(seed));
    this.apply(island, part, out, imp, P, dirIn);
    return out;
  }

  /** Lazy exponential decay of a part's fatigue memory. */
  private decay(part: Part): void {
    const now = this.w.now;
    const dt = now - part.dmgTime;
    part.dmgTime = now;
    if (!part.dmg.length || dt <= 0) return;
    const k = Math.exp(-dt / DAMAGE_DECAY_TAU);
    let j = 0;
    for (let i = 0; i < part.dmg.length; i++) {
      const d = part.dmg[i];
      d.e *= k;
      if (d.e > 1e-3) part.dmg[j++] = d;
    }
    part.dmg.length = j;
  }

  /** farMass of the struck part's bonds (BondState contract). */
  private prepareBondMasses(island: Island, part: Part): void {
    for (const b of part.bonds) {
      const o = b.other(part);
      if (!o) b.farMass = island.isStatic ? part.mass : island.mass;
      else if (o.island !== island) b.farMass = o.island && !o.island.isStatic ? o.island.mass : part.mass;
      else b.farMass = o.mass;
    }
  }

  private apply(island: Island, part: Part, out: PartOutcome, imp: ImpactOnPart, P: Vec3, dirIn: Vec3): void {
    const w = this.w;
    if (Number.isFinite(out.absorbed) && out.absorbed > 0) part.absorbed += out.absorbed;
    if (Array.isArray(out.dmg)) part.dmg = out.dmg;
    let geom = false;
    if (out.addDents && out.addDents.length) {
      for (const d of out.addDents) {
        if (!isFiniteVec(d.p) || !(d.r > 0) || !(d.depth > 0)) continue;
        part.dents.push(d);
        part.asm.dentVolume += 0.5 * Math.PI * d.r * d.r * d.depth;
      }
      if (part.dents.length > MAX_DENTS) mergeDents(part.dents, MAX_DENTS);
      geom = true;
    }
    if (out.dentDepth > 0) geom = true;
    if (out.addCracks && out.addCracks.length) {
      for (const c of out.addCracks) if (c.points.length >= 2) part.cracks.push(c);
      if (part.cracks.length > MAX_CRACKS) part.cracks.splice(0, part.cracks.length - MAX_CRACKS);
      geom = true;
    }
    if (geom) w.markGeom(part);
    const normal = { x: -dirIn.x, y: -dirIn.y, z: -dirIn.z };
    if (out.dentDepth > 0) {
      w.events.emit("dent", { pos: { ...P }, normal, mat: part.matId, depth: out.dentDepth, energy: imp.energy, size: part.ext[0] });
    }
    if (out.crackSeverity > 0) {
      w.events.emit("crack", { pos: { ...P }, normal, mat: part.matId, severity: out.crackSeverity, size: part.ext[0] });
    }
    if (geom || out.addDents.length) this.deps.markDamage(part);
    // direct bond damage
    if (out.bondDamage && out.bondDamage.length) {
      for (const bd of out.bondDamage) {
        const b = findBond(part, bd.bondId);
        if (b) w.damageBond(b, bd.amount);
      }
    }
    if (out.chips && out.chips.length && part.alive && part.island) this.spawnChips(part.island, part, out.chips, P, normal, imp.energy);
    if (out.fracture && part.alive && !part.pendingFracture && out.fracture.cells.length) {
      part.pendingFracture = true;
      this.deps.enqueueFracture(part, out.fracture, imp.energy, { ...P }, { ...dirIn }, imp.strike);
    }
    if (out.crumpled) this.deps.crumpled(part);
    this.deps.onDamage(part, {
      absorbed: out.absorbed,
      energy: imp.energy,
      pos: P,
      normal,
      crack: out.crackSeverity,
      dent: out.dentDepth,
      strike: imp.strike,
      sharpness: imp.sharpness,
    });
  }

  private spawnChips(island: Island, part: Part, chips: PartOutcome["chips"], P: Vec3, normal: Vec3, energy: number): void {
    const w = this.w;
    const kind = part.mat.micro;
    if (kind === "none") return;
    const density = w.settings.quality.microDebris;
    const interior = S[part.mat.interiorSurf];
    let spawned = 0;
    const vel = { x: 0, y: 0, z: 0 };
    for (const c of chips) {
      if (density < 1 && w.rng.next() > density) continue;
      if (!isFiniteVec(c.p) || !isFiniteVec(c.v) || !(c.size > 0)) continue;
      const pos = w.toWorldVec(island, c.p);
      const v = w.dirToWorldVec(island, c.v);
      w.pointVelocity(island, pos, vel);
      const f = part.poly.faces[nearestFace(part.poly, c.p)];
      const surf = w.rng.chance(0.4) && interior !== undefined ? interior : f.attr.surf;
      w.vfx.micro(kind, pos, { x: v.x + vel.x, y: v.y + vel.y, z: v.z + vel.z }, c.size, surf, f.attr.tint);
      spawned++;
    }
    if (spawned > 0) w.events.emit("chip", { pos: { ...P }, normal, mat: part.matId, energy });
  }

  /**
   * Inertial bond loading of the rest of a dynamic island that received impulse J on `hit`:
   * E_b = J² m_far / (2 M²) × kind factor (damage model). Joint bonds to other islands carry
   * the part of the island the joint must stop, shared among the group's live bonds.
   */
  inertial(island: Island, hit: Part, J: number): void {
    if (island.isStatic || !(J > 0)) return;
    const M = this.w.physMass(island);
    if (!(M > 0) || (J * J) / (2 * M) < INERTIAL_MIN_ENERGY) return;
    const parts = island.parts;
    const n = parts.length;
    // a lone part with no joint bonds has nothing to load (respond did its own bonds)
    if (n === 1 && parts[0].bonds.length === 0) return;
    for (let i = 0; i < n; i++) parts[i].tmp = i;
    const bonds = this.iBonds;
    const joints = this.iJoints;
    bonds.length = 0;
    joints.length = 0;
    this.gbsUsed = 0;
    this.iListUsed = 0;
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      for (const b of p.bonds) {
        if (!b.alive) continue;
        const o = b.other(p);
        if (!b.rigid) {
          // joints only transmit load when they connect to another island (or the world anchor)
          if (o && o.island === island) continue;
          if (!joints.includes(b)) joints.push(b);
          continue;
        }
        if (!o || o.island !== island) continue;
        if (o.id < p.id) continue;
        const g = this.gbs[this.gbsUsed] ?? (this.gbs[this.gbsUsed] = { a: 0, b: 0, rigid: true, alive: true });
        g.a = i;
        g.b = o.tmp;
        this.gbsUsed++;
        bonds.push(b);
      }
    }
    if (bonds.length) {
      if (this.iMasses.length < n) this.iMasses = new Float64Array(Math.max(n, this.iMasses.length * 2));
      const masses = this.iMasses;
      for (let i = 0; i < n; i++) masses[i] = parts[i].mass;
      const fm = farMasses(n, masses, this.gbs, hit.tmp, this.farScratch, this.gbsUsed);
      for (let k = 0; k < bonds.length; k++) {
        const b = bonds[k];
        if (b.a === hit || b.b === hit) continue; // direct damage already applied by respond
        b.farMass = fm[k];
        this.pushLoad(b);
      }
    }
    for (const b of joints) {
      if (b.a === hit || b.b === hit) continue;
      const o = b.a.island === island ? b.b : b.a;
      const otherDyn = o && o.island && o.island !== island && !o.island.isStatic;
      let share = 0;
      if (b.group) for (const x of b.group.bonds) if (x.alive) share++;
      b.farMass = (otherDyn ? Math.min(M, o!.island!.mass) : M) / Math.max(1, share);
      this.pushLoad(b);
    }
    if (!this.iListUsed) return;
    const list = this.iList;
    list.length = 0;
    for (let i = 0; i < this.iListUsed; i++) list.push(this.iPool[i]);
    const dmg = inertialBondDamage(J, M, list);
    for (const d of dmg) {
      if (!(d.amount > 0)) continue;
      const b = findIn(bonds, d.bondId) ?? findIn(joints, d.bondId);
      if (b) this.w.damageBond(b, d.amount);
    }
  }

  private pushLoad(b: Bond): void {
    let e = this.iPool[this.iListUsed];
    if (!e) {
      e = { id: 0, farMass: 0, kind: b.kind };
      this.iPool[this.iListUsed] = e;
    }
    e.id = b.id;
    e.farMass = b.farMass;
    e.kind = b.kind;
    this.iListUsed++;
  }

  // ================================================================================ strike

  strike(s: StrikeInput): StrikeResult {
    const w = this.w;
    const res: StrikeResult = { energy: 0, impulse: 0, hardness: 0.85, targetMat: null, partName: null, assemblyName: null, broke: false };
    const island = w.islandOf(s.body);
    if (!island || !island.alive) return res;
    if (island.consolidated) this.deps.restore(island);
    const P = { x: s.point.x, y: s.point.y, z: s.point.z };
    const dl = Math.hypot(s.dir.x, s.dir.y, s.dir.z);
    const dir = dl > 1e-9 ? { x: s.dir.x / dl, y: s.dir.y / dl, z: s.dir.z / dl } : { x: 0, y: -1, z: 0 };
    const part = w.locatePart(island, w.toLocal(island, P, this.lp), s.childIndex);
    if (!part) return res;
    res.targetMat = part.matId;
    res.partName = part.name;
    res.assemblyName = island.asm.name;
    res.hardness = safeHardness(part);
    const M = w.physMass(island);
    const ms = Math.max(Number.isFinite(s.mass) ? s.mass : 1, 0.05);
    const mu = Number.isFinite(M) ? (ms * M) / (ms + M) : ms;
    const sm = MATERIALS[s.strikerMat] ?? MATERIALS.steel;
    const e = Math.min(0.8, Math.sqrt(Math.max(0, sm.restitution) * Math.max(0, part.mat.restitution)));
    const speed = Math.max(0, Number.isFinite(s.speed) ? s.speed : 0);
    const J = (1 + e) * mu * speed;
    if (!(J > 0)) return res;
    res.impulse = J;
    // momentum transfer to dynamic targets first, so fragments inherit the post-hit velocity
    if (!island.isStatic && island.body) {
      tmpVec.set(dir.x * J, dir.y * J, dir.z * J);
      tmpPos.set(P.x, P.y, P.z);
      island.body.applyImpulse(tmpVec, tmpPos);
      w.physics.wake(island.body);
    }
    const ie = impactEnergy(J, ms, M, sm, part.mat);
    const E = Number.isFinite(ie.E) && ie.E > 0 ? ie.E : 0;
    const eT = E * (1 - Math.min(1, Math.max(0, ie.shareA)));
    res.energy = eT;
    island.lastHit = w.now;
    const broken0 = w.bondsBroken;
    const frac0 = part.pendingFracture;
    let out: PartOutcome | null = null;
    if (eT >= RESPOND_MIN_ENERGY * 0.25) out = this.hitPart(island, part, P, dir, eT, J, M, s.contactRadius, s.sharpness, true);
    if (island.alive) this.inertial(island, part, J);
    res.broke = (!!out && !!out.fracture && !frac0) || w.bondsBroken > broken0;
    this.deps.settleNow();
    if (E >= IMPACT_EVENT_MIN_ENERGY) {
      w.events.emit("impact", {
        pos: P,
        normal: { x: -dir.x, y: -dir.y, z: -dir.z },
        energy: E,
        impulse: J,
        speed,
        matA: part.matId,
        matB: sm.id,
        sizeA: part.ext[0],
        sizeB: Math.max(0.02, 2 * (s.contactRadius || 0.02)),
        massA: island.isStatic ? part.mass : island.mass,
        massB: ms,
        idA: island.id,
        idB: -1,
        staticA: island.isStatic,
        staticB: false,
      });
    }
    return res;
  }
}

// =============================================================================== helpers

function findIn(list: readonly Bond[], id: number): Bond | undefined {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return undefined;
}

/**
 * Re-seed a pooled Rng in place. Rng keeps its mulberry32 state in a (TypeScript-)private
 * field `s`; this mirrors its constructor so the damage model sees exactly `new Rng(seed)`.
 * RESEEDABLE verifies that layout once (falls back to a fresh Rng per hit if it ever changes).
 */
function reseed(rng: Rng, seed: number): Rng {
  (rng as unknown as { s: number }).s = seed >>> 0;
  return rng;
}

const RESEEDABLE = ((): boolean => {
  const a = new Rng(0x1234567);
  const b = reseed(new Rng(1), 0x1234567);
  return a.next() === b.next() && a.next() === b.next();
})();

function findBond(part: Part, id: number): Bond | undefined {
  for (const b of part.bonds) if (b.id === id) return b;
  return undefined;
}

function isFiniteVec(v: Vec3 | undefined): v is Vec3 {
  return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** A body we don't own counts as static structure only when Havok says it is static. */
function isStaticBody(body: RawImpact["bodyA"] | null | undefined): boolean {
  if (!body) return true; // contact with the world itself
  try {
    return body.getMotionType() === PhysicsMotionType.STATIC;
  } catch {
    return false;
  }
}

function safeHardness(part: Part): number {
  const h = hardness(part.matId);
  return Number.isFinite(h) ? Math.min(1, Math.max(0, h)) : 0.5;
}

