import * as THREE from 'three';
import { G } from '../core/G';
import { clamp } from '../core/math';
import { GROUPS } from '../physics/Physics';
import type { HitKind, ZombieHit } from '../zombies/ZombieManager';
import { woundKindFor } from '../fx/Wounds';
import type { PartHit } from '../zombies/Ragdolls';
import type { Zombie } from '../zombies/Zombie';
import { P } from '../zombies/skeleton';

export interface ShotParams {
  damage: number;
  pen: number;
  stopping: number;
  range: number;
  kind: HitKind;
  weapon: string;
  headMul?: number;
  eliteMul?: number;
  gore?: number;
  falloffStart?: number;
  falloffMin?: number;
  tracer?: boolean;
  tracerColor?: number;
  tracerWidth?: number;
  from?: THREE.Vector3;
  /** Ignite zombies that are hit (sunstrike/laser). */
  ignite?: number;
  /** Visual: laser/particle beams draw their own beam. */
  noImpactFx?: boolean;
}

interface Agg {
  z: Zombie;
  dmg: number;
  stopping: number;
  part: number;
  partDmg: number;
  x: number;
  y: number;
  zz: number;
  armored: boolean;
  count: number;
}

type AnyHit = { t: number; zh?: ZombieHit; ph?: PartHit };

const zHits: ZombieHit[] = [];
const pHits: PartHit[] = [];
const all: AnyHit[] = [];

/**
 * Hitscan bullets with penetration: a round keeps going through bodies until
 * its penetration budget (weapon penetration) is spent on zombie toughness.
 */
export class Ballistics {
  shots = 0;
  hitsThisShot = 0;
  onHitZombie: ((z: Zombie, killed: boolean, head: boolean) => void) | null = null;

  /** Single ray. If `agg` is given, zombie damage is accumulated (pellets). Returns end distance. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, p: ShotParams, agg?: Map<Zombie, Agg>) {
    this.shots++;
    const maxT = p.range;
    zHits.length = 0;
    pHits.length = 0;
    all.length = 0;
    G.zombies.rayHits(ox, oy, oz, dx, dy, dz, maxT, zHits);
    G.ragdolls.rayTest(ox, oy, oz, dx, dy, dz, maxT, pHits);
    const wh = G.physics.castRay(ox, oy, oz, dx, dy, dz, maxT, GROUPS.rayWorldOnly);
    const worldT = wh ? wh.t : maxT;
    for (const h of zHits) if (h.t < worldT) all.push({ t: h.t, zh: h });
    for (const h of pHits) if (h.t < worldT) all.push({ t: h.t, ph: h });
    all.sort((a, b) => a.t - b.t);
    let budget = p.pen;
    let dmgMul = 1;
    let endT = worldT;
    let passedThrough = 0;
    let stopped = false;
    const seenCorpse = new Set<any>();
    for (const h of all) {
      if (budget <= 0) {
        endT = h.t;
        stopped = true;
        break;
      }
      const hx = ox + dx * h.t;
      const hy = oy + dy * h.t;
      const hz = oz + dz * h.t;
      let fall = 1;
      if (p.falloffStart !== undefined && h.t > p.falloffStart) {
        fall = clamp(1 - ((h.t - p.falloffStart) / Math.max(1, maxT - p.falloffStart)) * (1 - (p.falloffMin ?? 0.3)), p.falloffMin ?? 0.3, 1);
      }
      if (h.zh) {
        const z = h.zh.z;
        if (!z.alive) continue;
        if (h.zh.shield) {
          // riot shield: only high-penetration rounds punch through, and lose a lot doing it
          const left = G.zombies.hitShield(z, p.damage * dmgMul * fall, budget, hx, hy, hz, dx, dz);
          if (left <= 0) {
            endT = h.t;
            stopped = true;
            break;
          }
          budget = left;
          dmgMul *= 0.6;
        }
        const pf = G.zombies.partFactor(z, h.zh.part, p.kind, budget, p.headMul, p.eliteMul);
        const dmg = p.damage * dmgMul * fall * pf.mul;
        const stop = p.stopping * dmgMul * fall;
        if (agg) {
          let a = agg.get(z);
          if (!a) {
            a = { z, dmg: 0, stopping: 0, part: h.zh.part, partDmg: 0, x: hx, y: hy, zz: hz, armored: false, count: 0 };
            agg.set(z, a);
          }
          a.dmg += dmg;
          a.stopping += stop;
          a.count++;
          a.armored = a.armored || pf.armored;
          if (dmg > a.partDmg) {
            a.partDmg = dmg;
            a.part = h.zh.part;
            a.x = hx;
            a.y = hy;
            a.zz = hz;
          }
          if (!pf.armored) {
            G.fx.bloodHit(hx, hy, hz, dx, dy, dz, 0.35, 'pellet');
            G.zombies.addWound(z, { damage: dmg, part: h.zh.part, x: hx, y: hy, z: hz, dx, dy, dz, stopping: stop, pen: budget, kind: p.kind }, dmg);
          } else G.fx.sparks(hx, hy, hz, -dx, -dy, -dz, 4);
        } else {
          const wasAlive = z.alive;
          const killed = G.zombies.damage(z, {
            damage: dmg, part: h.zh.part, x: hx, y: hy, z: hz, dx, dy, dz, stopping: stop, pen: budget, kind: p.kind, weapon: p.weapon,
            premult: true, armoredHit: pf.armored, gore: p.gore,
          });
          if (wasAlive) this.onHitZombie?.(z, killed, h.zh.part === P.Head);
          if (p.ignite && z.alive) G.zombies.ignite(z, p.ignite, 4, p.weapon);
        }
        this.hitsThisShot++;
        budget -= z.type.toughness;
        dmgMul *= 0.85;
        passedThrough++;
        if (pf.armored) budget -= z.type.armor * 0.5;
        // the round punched through: ragged exit wound on the far side
        if (budget > 0 && !pf.armored && p.kind === 'bullet') {
          G.zombies.addWound(z, { damage: dmg, part: h.zh.part, x: hx, y: hy, z: hz, dx, dy, dz, stopping: stop, pen: budget, kind: p.kind }, dmg, true);
        }
        if (budget <= 0) {
          endT = h.t + 0.15;
          stopped = true;
          break;
        }
      } else if (h.ph) {
        const key = h.ph.ragdoll ?? h.ph.corpse;
        if (seenCorpse.has(key)) continue;
        seenCorpse.add(key);
        this.hitBody(h.ph, hx, hy, hz, dx, dy, dz, p);
        budget -= 18;
        passedThrough++;
        if (budget <= 0) {
          endT = h.t + 0.1;
          stopped = true;
          break;
        }
      }
    }
    if (!stopped && wh && worldT < maxT) {
      const ix = ox + dx * worldT;
      const iy = oy + dy * worldT;
      const iz = oz + dz * worldT;
      if (!p.noImpactFx) G.fx.impact(ix, iy + 0.01, iz, wh.nx, wh.ny, wh.nz, Math.abs(ix) < 5 ? 'asphalt' : 'dirt');
      if (passedThrough > 0 && iy < 0.2) G.fx.stains.blood(ix, iz, 0.2 + Math.random() * 0.2);
      endT = worldT;
    }
    if (p.tracer && p.from) {
      const ex = ox + dx * endT;
      const ey = oy + dy * endT;
      const ez = oz + dz * endT;
      G.fx.tracers.add(p.from.x, p.from.y, p.from.z, ex, ey, ez, G.time, p.tracerColor ?? 0xffd27a, p.tracerWidth ?? 0.02);
    }
    return endT;
  }

  /** Bullet hitting a ragdoll or corpse: blood + physical shove (wakes corpses). */
  private hitBody(h: PartHit, hx: number, hy: number, hz: number, dx: number, dy: number, dz: number, p: ShotParams) {
    G.fx.bloodHit(hx, hy, hz, dx, dy, dz, 0.5, p.kind);
    const imp = Math.min(260, p.stopping * 0.7);
    if (h.kind === 'ragdoll' && h.ragdoll) {
      const r = h.ragdoll;
      if (r.zombie) {
        const z = r.zombie as Zombie;
        const pf = G.zombies.partFactor(z, h.part, p.kind, p.pen, p.headMul, p.eliteMul);
        G.zombies.damage(z, { damage: p.damage * pf.mul, part: h.part, x: hx, y: hy, z: hz, dx, dy, dz, stopping: p.stopping, pen: p.pen, kind: p.kind, weapon: p.weapon, premult: true, armoredHit: pf.armored });
      }
      G.ragdolls.applyImpulse(r, h.part, dx * imp * 0.5, dy * imp * 0.5 + imp * 0.1, dz * imp * 0.5, hx, hy, hz);
      r.fx.blood = Math.min(1, r.fx.blood + 0.1);
      const wk = !r.zombie ? woundKindFor(p.kind, p.damage, p.stopping) : null;
      if (wk && r.has(h.part)) G.wounds?.add(r.wounds, r.type.body, r.partPos, r.partQuat, r.partScale, h.part, hx, hy, hz, dx, dy, dz, wk);
    } else if (h.corpse) {
      const c = h.corpse;
      c.fx.blood = Math.min(1, c.fx.blood + 0.1);
      if (imp > 40 && G.ragdolls.active.length < G.ragdolls.maxActive) {
        const r = G.ragdolls.unfreeze(c);
        if (r) G.ragdolls.applyImpulse(r, r.has(h.part) ? h.part : P.Torso, dx * imp * 0.5, imp * 0.15, dz * imp * 0.5, hx, hy, hz);
      } else {
        G.ragdolls.refreshCorpseFx(c);
      }
    }
  }

  /** Multiple pellets; damage aggregated per zombie for one big impact. */
  spread(ox: number, oy: number, oz: number, dir: THREE.Vector3, pellets: number, spreadDeg: number, p: ShotParams, tracerEvery = 2) {
    const agg = new Map<Zombie, Agg>();
    const d = new THREE.Vector3();
    const tmpFrom = p.from;
    for (let i = 0; i < pellets; i++) {
      randomCone(dir, spreadDeg, d, i, pellets);
      const withTracer = i % tracerEvery === 0;
      this.ray(ox, oy, oz, d.x, d.y, d.z, { ...p, tracer: p.tracer && withTracer, from: tmpFrom }, agg);
    }
    for (const a of agg.values()) {
      if (!a.z.alive) continue;
      const wasAlive = a.z.alive;
      const killed = G.zombies.damage(a.z, {
        damage: a.dmg, part: a.part, x: a.x, y: a.y, z: a.zz, dx: dir.x, dy: dir.y, dz: dir.z, stopping: Math.min(a.stopping, p.stopping * 1.4),
        pen: p.pen, kind: p.kind, weapon: p.weapon, premult: true, armoredHit: a.armored, gore: (p.gore ?? 0) + a.count * 0.06, noBlood: true, noWound: true,
      });
      if (wasAlive) this.onHitZombie?.(a.z, killed, a.part === P.Head);
    }
  }
}

const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
/** Direction within a cone; pellets use a stratified pattern for even spread. */
export function randomCone(dir: THREE.Vector3, deg: number, out: THREE.Vector3, i = 0, n = 1) {
  const ang = (deg * Math.PI) / 180;
  let r: number;
  let a: number;
  if (n > 1) {
    a = (i / n) * Math.PI * 2 + Math.random() * 0.9;
    r = ang * Math.sqrt((i + 0.5 + (Math.random() - 0.5) * 0.8) / n);
    if (i === 0) r = ang * 0.15 * Math.random();
  } else {
    a = Math.random() * Math.PI * 2;
    r = ang * Math.sqrt(Math.random());
  }
  const up = Math.abs(dir.y) < 0.99 ? _t1.set(0, 1, 0) : _t1.set(1, 0, 0);
  const right = _t2.crossVectors(dir, up).normalize();
  const upv = up.crossVectors(right, dir).normalize();
  out.copy(dir).addScaledVector(right, Math.cos(a) * Math.tan(r)).addScaledVector(upv, Math.sin(a) * Math.tan(r)).normalize();
  return out;
}
