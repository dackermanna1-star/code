import type { Fighter } from '../sim/fighter';
import type { Simulation } from '../sim/simulation';
import type { ActionDef, AttackHeight, FState, Projectile, Zone } from '../sim/types';
import { DT } from '../sim/types';

/**
 * Perception with human-like reaction delay. Each brain records snapshots of its opponent and
 * reasons about the past (what it has had time to see), extrapolating motion forward. Fast
 * attacks therefore cannot be reacted to — they must be anticipated, which is what makes reads,
 * feints and mix-ups meaningful.
 */
export interface Snap {
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: FState;
  stateT: number;
  grounded: boolean;
  facing: number;
  action: ActionDef | null;
  actionFrame: number;
  blocking: boolean;
  blockLow: boolean;
  hp: number;
  energy: number;
  wrath: number;
  guard: number;
  counter: boolean;
  reflect: boolean;
  shield: boolean;
  phase: boolean;
  ascended: boolean;
  vanished: boolean;
  intangible: boolean;
  stun: number;
}

export function snapshot(sim: Simulation, f: Fighter): Snap {
  return {
    tick: sim.tick, x: f.x, y: f.y, vx: f.vx, vy: f.vy, state: f.state, stateT: f.stateT, grounded: f.grounded,
    facing: f.facing, action: f.action?.def ?? null, actionFrame: f.action?.frame ?? 0, blocking: f.state === 'block',
    blockLow: f.blockLow, hp: f.hp, energy: f.energy, wrath: f.wrath, guard: f.guard, counter: f.hasBuff('counter'),
    reflect: f.hasBuff('reflect'), shield: f.hasBuff('shield'), phase: f.hasBuff('phase'), ascended: f.hasBuff('ascended'),
    vanished: f.state === 'vanish', intangible: f.intangible, stun: f.stun,
  };
}

export class Perception {
  private buf: Snap[] = [];
  push(s: Snap): void {
    this.buf.push(s);
    if (this.buf.length > 48) this.buf.shift();
  }
  /** Snapshot from `delay` ticks ago (or the oldest available). */
  view(delay: number): Snap {
    const i = Math.max(0, this.buf.length - 1 - delay);
    return this.buf[i];
  }
  latest(): Snap {
    return this.buf[this.buf.length - 1];
  }
  /** Did the opponent transition into `state` within the last n perceivable ticks? */
  recent(delay: number, n: number, pred: (s: Snap) => boolean): boolean {
    for (let k = 0; k < n; k++) {
      const i = this.buf.length - 1 - delay - k;
      if (i < 0) break;
      if (pred(this.buf[i])) return true;
    }
    return false;
  }
}

export type ThreatKind = 'melee' | 'throw' | 'projectile' | 'beam' | 'beamCharge' | 'zone' | 'burst' | 'dash' | 'timestop';

export interface Threat {
  kind: ThreatKind;
  /** Ticks until it connects (0 = now). */
  eta: number;
  height: AttackHeight;
  unblockable: boolean;
  damage: number;
  source: string;
  /** Direction the threat comes from relative to me (+1 = from my right). */
  fromDir: number;
  slashable: boolean;
  /** Can be jumped over (ground-level). */
  low: boolean;
  /** For zones: direction to move to escape and the distance needed. */
  escapeDir: number;
  escapeDist: number;
  chargeable: boolean;
  projectile?: Projectile;
  zone?: Zone;
  def?: ActionDef;
}

/** Analyse incoming danger from the (delayed) opponent and from live projectiles / zones. */
export function assessThreats(sim: Simulation, me: Fighter, ov: Snap, delay: number): Threat[] {
  const out: Threat[] = [];
  const myCy = me.y - 60;
  const dist = Math.abs(ov.x - me.x);
  const dy = ov.y - me.y;

  // 1. Opponent melee / ability startup as perceived.
  const a = ov.action;
  if (a && !ov.vanished) {
    const frame = ov.actionFrame + delay;
    const facingMe = Math.sign(me.x - ov.x) === ov.facing || dist < 30;
    const eta = a.startup - frame;
    const stillLive = eta > -a.active;
    if (stillLive && a.hitbox && a.hit) {
      const reach = a.range[1] + (a.kind === 'dashAttack' ? 40 : 24);
      const yOk = !a.yRange || (-dy >= a.yRange[0] - 50 && -dy <= a.yRange[1] + 50);
      const bothSides = a.hitbox.ax < 0;
      if ((facingMe || bothSides) && dist <= reach && yOk) {
        out.push({
          kind: a.kind === 'throw' ? 'throw' : 'melee', eta: Math.max(0, eta), height: a.height, unblockable: !!a.hit.unblockable,
          damage: a.hit.damage, source: a.id, fromDir: Math.sign(ov.x - me.x) || 1, slashable: false, low: a.height === 'low',
          escapeDir: Math.sign(me.x - ov.x) || 1, escapeDist: reach - dist + 40, chargeable: !!a.chargeable, def: a,
        });
      }
    }
    if (a.abilityId === 'annihilationBeam' && frame < a.startup + 8) {
      out.push({
        kind: 'beamCharge', eta: Math.max(0, a.startup - frame), height: 'mid', unblockable: false, damage: 380, source: a.id,
        fromDir: Math.sign(ov.x - me.x) || 1, slashable: false, low: false, escapeDir: 0, escapeDist: 0, chargeable: true, def: a,
      });
    }
    if (a.abilityId === 'supernova' && frame < a.startup && Math.hypot(ov.x - me.x, ov.y - me.y) < 480) {
      out.push({
        kind: 'zone', eta: Math.max(0, a.startup - frame), height: 'mid', unblockable: false, damage: 265, source: a.id,
        fromDir: Math.sign(ov.x - me.x) || 1, slashable: false, low: false, escapeDir: Math.sign(me.x - ov.x) || 1,
        escapeDist: 470 - dist, chargeable: false, def: a,
      });
    }
    if ((a.abilityId === 'thousandCuts' || a.abilityId === 'flashCut') && frame < a.startup + 6 && dist < a.range[1] + 60 && facingMe) {
      out.push({
        kind: 'dash', eta: Math.max(0, a.startup - frame), height: 'mid', unblockable: false, damage: a.abilityId === 'thousandCuts' ? 300 : 80,
        source: a.id, fromDir: Math.sign(ov.x - me.x) || 1, slashable: false, low: false, escapeDir: 0, escapeDist: 0, chargeable: false, def: a,
      });
    }
    if (a.abilityId === 'chronoStop' && frame < a.startup) {
      out.push({
        kind: 'timestop', eta: Math.max(0, a.startup - frame), height: 'mid', unblockable: true, damage: 200, source: a.id,
        fromDir: Math.sign(ov.x - me.x) || 1, slashable: false, low: false, escapeDir: 0, escapeDist: 0, chargeable: false, def: a,
      });
    }
  }

  // 2. Projectiles (visible objects, perceived with half the delay).
  for (const p of sim.projectiles) {
    if (p.owner === me.side || p.dead || p.age < Math.floor(delay / 2) || p.frozen) continue;
    if (p.orbitR > 0) continue;
    // First-contact time against my (vertical capsule) hurtbox over the next ~50 ticks.
    let hitT = -1;
    let px = p.x, py = p.y, vx = p.vx * DT, vy = p.vy * DT;
    const top = me.y - 100, bot = me.y - 14;
    for (let t = 0; t <= 50; t++) {
      const ex = me.x + me.vx * DT * t * 0.4;
      const cy = Math.max(top, Math.min(bot, py));
      if (Math.hypot(px - ex, py - cy) < p.r + 19) {
        hitT = t;
        break;
      }
      if (p.homing > 0) {
        const want = Math.atan2(myCy - py, ex - px);
        const cur = Math.atan2(vy, vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const turn = Math.max(-p.homing * DT, Math.min(p.homing * DT, d));
        const sp = Math.hypot(vx, vy);
        vx = Math.cos(cur + turn) * sp;
        vy = Math.sin(cur + turn) * sp;
      }
      px += vx;
      py += vy;
    }
    if (hitT >= 0) {
      out.push({
        kind: 'projectile', eta: hitT, height: 'mid', unblockable: !!p.hit.unblockable, damage: p.hit.damage, source: p.source,
        fromDir: Math.sign(p.x - me.x) || 1, slashable: p.slashable, low: p.grounded || p.y > -50, escapeDir: 0, escapeDist: 0,
        chargeable: false, projectile: p,
      });
    }
  }

  // 3. Beams already firing.
  for (const b of sim.beams) {
    if (b.owner === me.side || b.dead || b.struggling) continue;
    const ex = b.ox + b.dirX * (b.length + 400), ey = b.oy + b.dirY * (b.length + 400);
    const t = Math.max(0, Math.min(1, ((me.x - b.ox) * (ex - b.ox) + (myCy - b.oy) * (ey - b.oy)) / ((ex - b.ox) ** 2 + (ey - b.oy) ** 2 || 1)));
    const cx = b.ox + (ex - b.ox) * t, cy = b.oy + (ey - b.oy) * t;
    const d = Math.hypot(me.x - cx, myCy - cy);
    if (d < b.width / 2 + 40) {
      const along = Math.hypot(cx - b.ox, cy - b.oy);
      const eta = Math.max(0, Math.round((along - b.length) / (4600 * DT)));
      out.push({
        kind: 'beam', eta, height: 'mid', unblockable: false, damage: b.dps * Math.max(1, b.life - b.age), source: b.source,
        fromDir: Math.sign(b.ox - me.x) || 1, slashable: false, low: false, escapeDir: 0, escapeDist: 0, chargeable: false,
      });
    }
  }

  // 4. Zones (telegraphed strikes) that will catch me.
  for (const z of sim.zones) {
    if (z.owner === me.side) continue;
    if (z.age < Math.min(z.warn, Math.floor(delay / 2))) continue;
    const endsAt = z.warn + z.active;
    if (z.age >= endsAt) continue;
    if (z.interval === 0 && z.hitSides & (1 << me.side)) continue;
    let eta = Math.max(0, z.warn - z.age);
    let inside: boolean;
    let margin: number;
    if (z.kind === 'colossus') {
      const t = z.vx !== 0 ? (me.x - z.x) / z.vx : 999;
      inside = t > -0.05 && t < 1.5 && me.y > -200;
      eta = Math.max(0, Math.round(t / DT) - 2);
      margin = 200 + me.y;
    } else if (z.fullHeight) {
      margin = z.r + 22 - Math.abs(me.x - z.x);
      inside = margin > 0 && me.y > -z.maxHeight;
    } else {
      const d = Math.hypot(me.x - z.x, myCy - z.y);
      margin = z.r + 24 - d;
      inside = margin > 0;
    }
    // Tracking zones will follow: treat as threat if close.
    if (!inside && z.age < z.trackUntil && Math.abs(me.x - z.x) < z.r + 140) {
      inside = true;
      margin = z.r + 60;
    }
    if (!inside) continue;
    const escapeDir = z.kind === 'colossus' ? 0 : Math.sign(me.x - z.x) || (me.x > 0 ? -1 : 1);
    out.push({
      kind: 'zone', eta, height: 'mid', unblockable: !!z.hit.unblockable, damage: z.hit.damage * (z.interval > 0 ? 3 : 1),
      source: z.source, fromDir: Math.sign(z.x - me.x) || 1, slashable: false, low: z.kind === 'spike' || z.kind === 'colossus',
      escapeDir, escapeDist: margin + 30, chargeable: false, zone: z,
    });
  }

  out.sort((p, q) => p.eta - q.eta || q.damage - p.damage);
  return out;
}
