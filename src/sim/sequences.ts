import { clamp, ease, lerp } from '../core/math';
import { C } from './constants';
import type { Fighter } from './fighter';
import type { Simulation } from './simulation';
import type { Beam, FState, HitDef } from './types';
import { applyHit, dealDamage } from './combat';

/**
 * Authored-but-reactive cinematic sequences that emerge from fight events (clashes, beam
 * collisions, grabs, counters, ultimates, last stands). They are part of the deterministic
 * simulation: their outcomes depend on fighter state, AI inputs and seeded randomness.
 */
export interface Sequence {
  readonly kind: string;
  done: boolean;
  update(sim: Simulation): void;
  abort?(sim: Simulation): void;
}

export function lockFighter(f: Fighter, clip: string): void {
  f.scripted = true;
  f.setState('locked');
  f.action = null;
  f.anim = { clip, t: 0 };
  f.vx = 0;
  f.vy = 0;
}

export function releaseFighter(f: Fighter, state: FState = 'idle'): void {
  f.scripted = false;
  f.anim = null;
  if (f.state === 'locked' || f.state === 'intro') f.setState(f.grounded ? state : 'air');
}

function setAnim(f: Fighter, clip: string): void {
  f.anim = { clip, t: 0 };
}

function tickAnim(...fs: Fighter[]): void {
  for (const f of fs) if (f.anim) f.anim.t++;
}

function H(p: Partial<HitDef> & { damage: number }): HitDef {
  return { guard: 0, hitstun: 30, blockstun: 0, kbx: 400, kby: -500, level: 3, ...p };
}

/* ======================================================================== */
/* Throw                                                                    */
/* ======================================================================== */

export class ThrowSeq implements Sequence {
  readonly kind = 'throw';
  done = false;
  private t = 0;
  private variant: 'slam' | 'toss' | 'kick';
  private startX: number;
  constructor(private sim: Simulation, private A: Fighter, private D: Fighter) {
    lockFighter(A, 'throw.grab');
    lockFighter(D, 'throw.grabbed');
    const w = A.def.weapon;
    this.variant = w === 'gauntlets' || w === 'greatsword' ? 'slam' : sim.rng.chance(0.5) ? 'toss' : 'kick';
    D.x = A.x + A.facing * 46;
    D.y = A.y;
    D.facing = (-A.facing) as 1 | -1;
    this.startX = A.x;
    sim.emit({ type: 'seq', kind: 'throw', beat: 'grab', a: A.side, b: D.side, x: (A.x + D.x) / 2, y: A.y - 70, text: this.variant });
  }
  update(sim: Simulation): void {
    const { A, D } = this;
    this.t++;
    tickAnim(A, D);
    if (this.t === 8) {
      const wantsBreak = D.cmd?.struggle === 'slip';
      const p = wantsBreak ? 0.5 + D.def.traits.precision * 0.15 : 0.08;
      if (sim.rng.chance(p)) {
        sim.emit({ type: 'seq', kind: 'throw', beat: 'break', a: A.side, b: D.side, x: (A.x + D.x) / 2, y: A.y - 70 });
        for (const f of [A, D]) {
          releaseFighter(f, 'stagger');
          f.setState('stagger');
          f.stun = 14;
          f.vx = (Math.sign(f.x - (f === A ? D.x : A.x)) || -f.facing) * 560;
        }
        this.done = true;
        return;
      }
      setAnim(A, `throw.${this.variant}`);
      setAnim(D, `thrown.${this.variant}`);
    }
    if (this.t > 8 && this.t < 30) {
      const k = (this.t - 8) / 22;
      if (this.variant === 'slam') {
        // Arc over the thrower's head to the other side.
        const ang = Math.PI * k;
        D.x = this.startX + A.facing * Math.cos(ang) * 50;
        D.y = A.y - Math.sin(ang) * 110;
      } else if (this.variant === 'toss') {
        D.x = A.x + A.facing * (46 + k * 20);
        D.y = A.y - Math.sin(k * Math.PI) * 40;
      } else {
        D.x = A.x + A.facing * (46 + k * 6);
      }
    }
    if (this.t === 30) {
      const hit = (A.actions.get(`${A.def.weapon}.throw`)?.hit) ?? H({ damage: 90 });
      const dirX = this.variant === 'slam' ? -A.facing : A.facing;
      releaseFighter(A);
      D.scripted = false;
      D.anim = null;
      D.setState('hitstun');
      if (this.variant === 'slam') {
        D.x = this.startX - A.facing * 50;
        D.y = -4;
        D.grounded = false;
      }
      const h = { ...hit, kbx: this.variant === 'slam' ? 260 : hit.kbx, kby: this.variant === 'slam' ? 600 : hit.kby, groundBounce: this.variant === 'slam' };
      applyHit(sim, A, D, { attacker: A.side, defender: D.side, hit: h, x: D.x, y: D.y - 50, dirX, source: `${A.def.weapon}.throw`, kind: 'throw', height: 'throw' });
      sim.emit({ type: 'seq', kind: 'throw', beat: 'impact', a: A.side, b: D.side, x: D.x, y: D.y - 30, text: this.variant });
      if (this.variant === 'slam') sim.emit({ type: 'crater', x: D.x, r: 70 });
      this.done = true;
    }
  }
  abort(): void {
    releaseFighter(this.A);
    releaseFighter(this.D);
    this.done = true;
  }
}

/* ======================================================================== */
/* Blade lock                                                               */
/* ======================================================================== */

export class BladeLockSeq implements Sequence {
  readonly kind = 'bladeLock';
  done = false;
  private t = 0;
  private s = 0;
  private pushHist: [number[], number[]] = [[], []];
  private mid: number;
  constructor(private sim: Simulation, private a: Fighter, private b: Fighter) {
    lockFighter(a, 'lock.push');
    lockFighter(b, 'lock.push');
    this.mid = (a.x + b.x) / 2;
    const dir = Math.sign(b.x - a.x) || 1;
    a.x = this.mid - dir * 44;
    b.x = this.mid + dir * 44;
    a.facing = dir as 1 | -1;
    b.facing = (-dir) as 1 | -1;
    sim.emit({ type: 'seq', kind: 'bladeLock', beat: 'start', a: a.side, b: b.side, x: this.mid, y: -80 });
  }
  private power(f: Fighter, input: string | null): number {
    const base = input === 'push' ? 1 : input === 'hold' ? 0.45 : input === 'slip' ? 0 : 0.8;
    return base * (0.8 + 0.4 * f.def.traits.precision) * (1 + f.momentum * 0.15) * (f.energy > 4 ? 1 : 0.65) * (f.hasBuff('ascended') ? 1.2 : 1);
  }
  update(sim: Simulation): void {
    const { a, b } = this;
    this.t++;
    tickAnim(a, b);
    if (this.t < 12) return;
    const ia = a.cmd?.struggle ?? 'push', ib = b.cmd?.struggle ?? 'push';
    this.pushHist[0].push(ia === 'push' ? 1 : 0);
    this.pushHist[1].push(ib === 'push' ? 1 : 0);
    if (this.pushHist[0].length > 8) this.pushHist[0].shift();
    if (this.pushHist[1].length > 8) this.pushHist[1].shift();
    if (ia === 'push') a.spendEnergy(0.22);
    if (ib === 'push') b.spendEnergy(0.22);
    // Slip attempts.
    for (const [me, other, idx] of [[a, b, 1], [b, a, 0]] as [Fighter, Fighter, number][]) {
      if (me.cmd?.struggle !== 'slip') continue;
      const otherPushes = this.pushHist[idx].reduce((x, y) => x + y, 0);
      if (otherPushes >= 6) {
        this.finish(sim, 'slip', me, other);
        return;
      }
      this.s += me === a ? -0.3 : 0.3;
      sim.emit({ type: 'seq', kind: 'bladeLock', beat: 'slipFail', a: me.side, b: other.side, x: this.mid, y: -80 });
    }
    const pa = this.power(a, ia), pb = this.power(b, ib);
    this.s += (pa - pb) * 0.02 + sim.rng.gaussian(0, 0.012);
    const dir = Math.sign(b.x - a.x) || 1;
    const shift = this.s * 26;
    a.x = this.mid - dir * 44 + dir * shift;
    b.x = this.mid + dir * 44 + dir * shift;
    if (this.t % 7 === 0) sim.emit({ type: 'seq', kind: 'bladeLock', beat: 'spark', a: a.side, b: b.side, x: (a.x + b.x) / 2, y: -82, v: this.s });
    if (this.s >= 1) this.finish(sim, 'overpower', a, b);
    else if (this.s <= -1) this.finish(sim, 'overpower', b, a);
    else if (this.t > 160) this.finish(sim, 'repel', a, b);
  }
  private finish(sim: Simulation, outcome: 'overpower' | 'slip' | 'repel', w: Fighter, l: Fighter): void {
    this.done = true;
    releaseFighter(w);
    releaseFighter(l);
    const dir = Math.sign(l.x - w.x) || w.facing;
    sim.emit({ type: 'seq', kind: 'bladeLock', beat: outcome, a: w.side, b: l.side, x: (w.x + l.x) / 2, y: -80 });
    if (outcome === 'overpower') {
      w.stats.clashesWon++;
      l.setState('guardbreak');
      l.stun = 44;
      l.vx = dir * 480;
      w.gainWrath(6);
    } else if (outcome === 'slip') {
      w.stats.clashesWon++;
      w.x = l.x + dir * 70;
      w.faceToward(l.x);
      l.setState('stagger');
      l.stun = 30;
      l.vx = -dir * 420;
      l.facing = (-dir) as 1 | -1;
    } else {
      for (const f of [w, l]) {
        f.setState('stagger');
        f.stun = 16;
        f.vx = (f === w ? -dir : dir) * 760;
      }
    }
  }
  abort(): void {
    releaseFighter(this.a);
    releaseFighter(this.b);
    this.done = true;
  }
}

/* ======================================================================== */
/* Beam struggle                                                            */
/* ======================================================================== */

export class BeamStruggleSeq implements Sequence {
  readonly kind = 'beamStruggle';
  done = false;
  private t = 0;
  /** Fraction of the distance from fighter0's origin to fighter1's origin where the beams meet. */
  private k: number;
  private owners: [Fighter, Fighter];
  private beams: [Beam, Beam];
  constructor(private sim: Simulation, b0: Beam, b1: Beam) {
    const f0 = sim.fighters[b0.owner], f1 = sim.fighters[b1.owner];
    this.owners = b0.owner === 0 ? [f0, f1] : [f1, f0];
    this.beams = b0.owner === 0 ? [b0, b1] : [b1, b0];
    for (const b of this.beams) b.struggling = true;
    const [o0, o1] = this.owners;
    lockFighter(o0, 'beam.struggle');
    lockFighter(o1, 'beam.struggle');
    // Keep them in the air if they were.
    const total = Math.hypot(o1.x - o0.x, (o1.y - o0.y)) || 1;
    this.k = clamp(this.beams[0].length / total, 0.25, 0.75);
    sim.emit({ type: 'seq', kind: 'beamStruggle', beat: 'start', a: 0, b: 1, x: lerp(o0.x, o1.x, this.k), y: lerp(o0.y, o1.y, this.k) - 84 });
  }
  private power(f: Fighter, input: string | null): number {
    const base = input === 'push' ? 1 : input === 'hold' ? 0.5 : 0.8;
    return base * (0.85 + f.wrath / 260) * (f.energy > 1 ? 1 : 0.55) * (f.hasBuff('ascended') ? 1.18 : 1) * (0.9 + f.def.traits.precision * 0.2);
  }
  update(sim: Simulation): void {
    const [o0, o1] = this.owners;
    this.t++;
    tickAnim(o0, o1);
    const i0 = o0.cmd?.struggle ?? 'push', i1 = o1.cmd?.struggle ?? 'push';
    // Vanish out of the struggle: risky escape.
    for (const [me, other, mi] of [[o0, o1, 0], [o1, o0, 1]] as [Fighter, Fighter, number][]) {
      if ((mi === 0 ? i0 : i1) === 'vanish' && me.energy >= 20 && this.t > 20) {
        me.spendEnergy(20);
        this.endBeams(sim);
        this.done = true;
        releaseFighter(me);
        releaseFighter(other);
        // The other's beam keeps firing briefly where the vanisher stood.
        other.setState('stagger');
        other.stun = 24;
        const p = sim.teleportTarget(me, 'behind');
        me.beginVanish(sim, p.x, p.y, 'struggleEscape', 10);
        me.addBuff('haste', 60, 1);
        sim.emit({ type: 'seq', kind: 'beamStruggle', beat: 'escape', a: me.side, b: other.side, x: me.x, y: me.y - 60 });
        return;
      }
    }
    if (i0 === 'push') o0.spendEnergy(0.3);
    if (i1 === 'push') o1.spendEnergy(0.3);
    const p0 = this.power(o0, i0), p1 = this.power(o1, i1);
    this.k += (p0 - p1) * 0.0065 + sim.rng.gaussian(0, 0.0045);
    const cx = lerp(this.beams[0].ox, this.beams[1].ox, this.k);
    const cy = lerp(this.beams[0].oy, this.beams[1].oy, this.k);
    this.beams[0].length = Math.hypot(cx - this.beams[0].ox, cy - this.beams[0].oy);
    this.beams[1].length = Math.hypot(cx - this.beams[1].ox, cy - this.beams[1].oy);
    // Point the beams at the clash point.
    for (const b of this.beams) {
      const d = Math.hypot(cx - b.ox, cy - b.oy) || 1;
      b.dirX = (cx - b.ox) / d;
      b.dirY = (cy - b.oy) / d;
    }
    if (this.t % 9 === 0) sim.emit({ type: 'seq', kind: 'beamStruggle', beat: 'surge', a: 0, b: 1, x: cx, y: cy, v: this.k });
    if (this.k >= 0.93) this.overwhelm(sim, o0, o1);
    else if (this.k <= 0.07) this.overwhelm(sim, o1, o0);
    else if (this.t > 240) this.mutual(sim, cx, cy);
  }
  private endBeams(sim: Simulation): void {
    for (const b of this.beams) {
      b.struggling = false;
      b.dead = true;
      sim.emit({ type: 'beamEnd', side: b.owner, id: b.id });
    }
  }
  private overwhelm(sim: Simulation, w: Fighter, l: Fighter): void {
    this.done = true;
    sim.emit({ type: 'seq', kind: 'beamStruggle', beat: 'overwhelm', a: w.side, b: l.side, x: l.x, y: l.y - 60 });
    this.endBeams(sim);
    releaseFighter(w);
    l.scripted = false;
    l.anim = null;
    l.setState('hitstun');
    sim.explode(null, l.x, l.y - 60, 60, H({ damage: 0 }), 'beamStruggle');
    sim.pendingHits = [];
    w.stats.clashesWon++;
    applyHit(sim, w, l, {
      attacker: w.side, defender: l.side, hit: H({ damage: 185, hitstun: 44, kbx: 1100, kby: -650, launch: true, level: 4, wallBounce: true }),
      x: l.x, y: l.y - 60, dirX: Math.sign(l.x - w.x) || 1, source: 'beamStruggle', kind: 'sequence', height: 'unblockable',
    });
  }
  private mutual(sim: Simulation, x: number, y: number): void {
    this.done = true;
    sim.emit({ type: 'seq', kind: 'beamStruggle', beat: 'mutual', a: 0, b: 1, x, y });
    this.endBeams(sim);
    for (const f of this.owners) {
      releaseFighter(f);
      const other = sim.opponentOf(f);
      dealDamage(sim, other, f, Math.min(f.hp - 1, 100 * sim.damageScale), { kind: 'sequence', source: 'beamStruggle', counter: false, level: 3, x, y });
      f.setState('launched');
      f.stun = 24;
      f.grounded = false;
      f.y = Math.min(f.y, -2);
      f.vx = (Math.sign(f.x - x) || 1) * 900;
      f.vy = -500;
      f.pendingKnockdown = true;
    }
  }
  abort(sim: Simulation): void {
    this.endBeams(sim);
    for (const f of this.owners) releaseFighter(f);
    this.done = true;
  }
}

/* ======================================================================== */
/* Speed blitz                                                              */
/* ======================================================================== */

export class BlitzSeq implements Sequence {
  readonly kind = 'blitz';
  done = false;
  private t = 0;
  private exchanges: number;
  private wins: [number, number] = [0, 0];
  private lastWinner = 0;
  private readonly EX = 15;
  constructor(private sim: Simulation, private a: Fighter, private b: Fighter) {
    this.exchanges = 4 + sim.rng.int(0, 4);
    lockFighter(a, 'blitz.vanish');
    lockFighter(b, 'blitz.vanish');
    a.stats.teleports++;
    b.stats.teleports++;
    sim.emit({ type: 'seq', kind: 'blitz', beat: 'start', a: a.side, b: b.side, x: (a.x + b.x) / 2, y: -100 });
  }
  private edge(f: Fighter, o: Fighter): number {
    return 0.12 * (f.def.traits.precision - o.def.traits.precision) + 0.1 * (f.momentum - o.momentum) + 0.0008 * (f.energy - o.energy) + 0.0006 * (f.wrath - o.wrath) + (f.hasBuff('ascended') ? 0.08 : 0) - (o.hasBuff('ascended') ? 0.08 : 0);
  }
  update(sim: Simulation): void {
    const { a, b } = this;
    this.t++;
    tickAnim(a, b);
    const idx = Math.floor((this.t - 1) / this.EX);
    const local = (this.t - 1) % this.EX;
    if (idx < this.exchanges) {
      if (local === 0) {
        const half = sim.arena.halfWidth - 160;
        const x = sim.rng.range(-half, half);
        const y = -sim.rng.range(60, 560);
        const dir = sim.rng.sign();
        a.x = x - dir * 38;
        b.x = x + dir * 38;
        a.y = b.y = y;
        a.grounded = b.grounded = false;
        a.facing = dir as 1 | -1;
        b.facing = (-dir) as 1 | -1;
        const pa = clamp(0.5 + this.edge(a, b), 0.2, 0.8);
        const winner = sim.rng.chance(pa) ? a : b;
        this.wins[winner === a ? 0 : 1]++;
        this.lastWinner = winner === a ? 0 : 1;
        setAnim(a, winner === a ? 'blitz.strike' : 'blitz.guard');
        setAnim(b, winner === b ? 'blitz.strike' : 'blitz.guard');
        sim.emit({ type: 'seq', kind: 'blitz', beat: 'exchange', a: winner.side, b: (winner === a ? b : a).side, x, y: y - 70, v: idx });
      }
      if (local === 9) {
        setAnim(a, 'blitz.vanish');
        setAnim(b, 'blitz.vanish');
      }
      return;
    }
    // Decisive blow.
    const wi = this.wins[0] === this.wins[1] ? this.lastWinner : this.wins[0] > this.wins[1] ? 0 : 1;
    const w = wi === 0 ? a : b, l = wi === 0 ? b : a;
    const margin = Math.abs(this.wins[0] - this.wins[1]);
    this.done = true;
    const slam = sim.rng.chance(0.55);
    w.x = l.x + (slam ? 0 : -l.facing * 40);
    w.y = l.y - (slam ? 90 : 0);
    releaseFighter(w);
    w.stats.clashesWon++;
    l.scripted = false;
    l.anim = null;
    l.setState('hitstun');
    l.grounded = false;
    sim.emit({ type: 'seq', kind: 'blitz', beat: 'decisive', a: w.side, b: l.side, x: l.x, y: l.y - 60, text: slam ? 'slam' : 'launch' });
    applyHit(sim, w, l, {
      attacker: w.side, defender: l.side,
      hit: slam ? H({ damage: 90 + margin * 12, hitstun: 40, kbx: 120, kby: 1700, groundBounce: true, level: 4 }) : H({ damage: 85 + margin * 12, hitstun: 40, kbx: 1050, kby: -300, launch: true, wallBounce: true, level: 4 }),
      x: l.x, y: l.y - 60, dirX: Math.sign(l.x - w.x) || w.facing, source: 'blitz', kind: 'sequence', height: 'unblockable',
    });
  }
  abort(): void {
    releaseFighter(this.a);
    releaseFighter(this.b);
    this.done = true;
  }
}

/* ======================================================================== */
/* Iai counter                                                              */
/* ======================================================================== */

export class CounterSlashSeq implements Sequence {
  readonly kind = 'counter';
  done = false;
  private t = 0;
  constructor(private sim: Simulation, private D: Fighter, private A: Fighter) {
    const clip = A.action?.def.clip ?? 'hit.light';
    const frame = A.action?.frame ?? 0;
    lockFighter(A, clip);
    A.anim = { clip, t: frame };
    lockFighter(D, 'counter.ready');
    sim.emit({ type: 'seq', kind: 'counter', beat: 'trigger', a: D.side, b: A.side, x: (A.x + D.x) / 2, y: A.y - 70 });
  }
  update(sim: Simulation): void {
    const { A, D } = this;
    this.t++;
    if (D.anim) D.anim.t++;
    if (this.t === 6) {
      sim.emit({ type: 'vanish', side: D.side, x: D.x, y: D.y, source: 'counter' });
      setAnim(D, 'counter.vanish');
    }
    if (this.t === 12) {
      const dir = A.facing;
      D.x = clamp(A.x + dir * 86, -sim.arena.halfWidth + 30, sim.arena.halfWidth - 30);
      D.y = A.y;
      D.faceToward(A.x);
      setAnim(D, 'counter.slash');
      sim.emit({ type: 'appear', side: D.side, x: D.x, y: D.y, source: 'counter' });
      sim.emit({ type: 'seq', kind: 'counter', beat: 'slash', a: D.side, b: A.side, x: A.x, y: A.y - 70 });
    }
    if (this.t === 22) {
      this.done = true;
      releaseFighter(D);
      D.addBuff('empowered', 90, 1);
      A.scripted = false;
      A.anim = null;
      A.setState('hitstun');
      sim.emit({ type: 'seq', kind: 'counter', beat: 'impact', a: D.side, b: A.side, x: A.x, y: A.y - 70 });
      applyHit(sim, D, A, {
        attacker: D.side, defender: A.side, hit: H({ damage: 205, hitstun: 44, kbx: 520, kby: -760, launch: true, level: 4 }),
        x: A.x, y: A.y - 70, dirX: Math.sign(A.x - D.x) || 1, source: 'counterSlash', kind: 'sequence', height: 'unblockable',
      });
      D.stats.reads++;
    }
  }
  abort(): void {
    releaseFighter(this.A);
    releaseFighter(this.D);
    this.done = true;
  }
}

/* ======================================================================== */
/* Thousand Cuts                                                            */
/* ======================================================================== */

export class ThousandCutsSeq implements Sequence {
  readonly kind = 'thousandCuts';
  done = false;
  private t = 0;
  private cx: number;
  private cy: number;
  constructor(private sim: Simulation, private A: Fighter, private D: Fighter) {
    lockFighter(A, 'tc.flurry');
    lockFighter(D, 'hit.suspended');
    this.cx = D.x;
    this.cy = Math.min(D.y, -40);
    D.y = this.cy;
    D.grounded = false;
    sim.emit({ type: 'seq', kind: 'thousandCuts', beat: 'start', a: A.side, b: D.side, x: D.x, y: D.y - 60 });
  }
  update(sim: Simulation): void {
    const { A, D } = this;
    this.t++;
    tickAnim(A, D);
    D.x = this.cx;
    D.y = this.cy - Math.min(40, this.t * 0.6);
    if (this.t >= 6 && this.t <= 58 && this.t % 5 === 1) {
      const ang = sim.rng.range(0, Math.PI * 2);
      A.x = clamp(D.x + Math.cos(ang) * 120, -sim.arena.halfWidth + 30, sim.arena.halfWidth - 30);
      A.y = Math.min(0, D.y + Math.sin(ang) * 90);
      A.faceToward(D.x);
      setAnim(A, 'tc.cut');
      sim.emit({ type: 'seq', kind: 'thousandCuts', beat: 'cut', a: A.side, b: D.side, x: D.x, y: D.y - 60, v: ang });
      dealDamage(sim, A, D, Math.min(D.hp, 22 * sim.damageScale * A.damageMult), { kind: 'sequence', source: 'thousandCuts', counter: false, level: 2, x: D.x, y: D.y - 60 });
      D.comboHits++;
    }
    if (this.t === 62) {
      A.x = clamp(D.x - D.facing * 140, -sim.arena.halfWidth + 30, sim.arena.halfWidth - 30);
      A.y = 0;
      A.faceToward(D.x);
      setAnim(A, 'tc.sheath');
      sim.emit({ type: 'seq', kind: 'thousandCuts', beat: 'sheath', a: A.side, b: D.side, x: A.x, y: A.y - 60 });
    }
    if (this.t === 78) {
      this.done = true;
      releaseFighter(A);
      D.scripted = false;
      D.anim = null;
      D.setState('hitstun');
      sim.emit({ type: 'seq', kind: 'thousandCuts', beat: 'release', a: A.side, b: D.side, x: D.x, y: D.y - 60 });
      applyHit(sim, A, D, {
        attacker: A.side, defender: D.side, hit: H({ damage: 100, hitstun: 50, kbx: 300, kby: -900, launch: true, level: 4 }),
        x: D.x, y: D.y - 60, dirX: Math.sign(D.x - A.x) || 1, source: 'thousandCuts', kind: 'sequence', height: 'unblockable',
      });
    }
  }
  abort(): void {
    releaseFighter(this.A);
    releaseFighter(this.D);
    this.done = true;
  }
}

/* ======================================================================== */
/* Transformation (Ascension)                                               */
/* ======================================================================== */

export class TransformSeq implements Sequence {
  readonly kind = 'transform';
  done = false;
  private t = 0;
  constructor(private sim: Simulation, private f: Fighter) {
    lockFighter(f, 'transform');
    f.invuln = 60;
    sim.emit({ type: 'seq', kind: 'transform', beat: 'gather', a: f.side, b: sim.opponentOf(f).side, x: f.x, y: f.y - 60 });
  }
  update(sim: Simulation): void {
    const f = this.f;
    this.t++;
    tickAnim(f);
    f.invuln = Math.max(f.invuln, 2);
    if (!f.grounded) f.vy = 0;
    if (this.t === 26) sim.emit({ type: 'seq', kind: 'transform', beat: 'surge', a: f.side, b: sim.opponentOf(f).side, x: f.x, y: f.y - 60 });
    if (this.t === 48) {
      f.addBuff('ascended', 640, 1);
      f.gainEnergy(50);
      f.guard = C.GUARD;
      sim.emit({ type: 'transform', side: f.side, on: true });
      sim.emit({ type: 'seq', kind: 'transform', beat: 'explode', a: f.side, b: sim.opponentOf(f).side, x: f.x, y: f.y - 60 });
      const opp = sim.opponentOf(f);
      if (!opp.intangible && !opp.scripted && Math.abs(opp.x - f.x) < 250 && Math.abs(opp.y - f.y) < 200) {
        opp.action = null;
        opp.setState('launched');
        opp.stun = 20;
        opp.grounded = false;
        opp.y = Math.min(opp.y, -2);
        opp.vx = (Math.sign(opp.x - f.x) || 1) * 900;
        opp.vy = -380;
        opp.pendingKnockdown = true;
      }
    }
    if (this.t >= 54) {
      this.done = true;
      releaseFighter(f);
      f.invuln = 8;
    }
  }
  abort(): void {
    releaseFighter(this.f);
    this.done = true;
  }
}

/* ======================================================================== */
/* Last Stand                                                               */
/* ======================================================================== */

export class LastStandSeq implements Sequence {
  readonly kind = 'lastStand';
  done = false;
  private t = 0;
  constructor(private sim: Simulation, private L: Fighter, private W: Fighter) {
    const wClip = W.action?.def.clip ?? (W.state === 'action' ? 'idle' : 'idle');
    lockFighter(W, wClip);
    lockFighter(L, 'laststand.kneel');
    L.grounded = L.y >= -1;
    if (!L.grounded) L.vy = 0;
    sim.emit({ type: 'lastStand', side: L.side, x: L.x, y: L.y - 60 });
    sim.emit({ type: 'seq', kind: 'lastStand', beat: 'freeze', a: L.side, b: W.side, x: L.x, y: L.y - 60 });
  }
  update(sim: Simulation): void {
    const { L, W } = this;
    this.t++;
    tickAnim(L);
    // Float the survivor down if airborne.
    if (L.y < 0) L.y = Math.min(0, L.y + 6);
    if (this.t === 22 || this.t === 44) sim.emit({ type: 'seq', kind: 'lastStand', beat: 'heartbeat', a: L.side, b: W.side, x: L.x, y: L.y - 60 });
    if (this.t === 60) {
      setAnim(L, 'laststand.rise');
      sim.emit({ type: 'seq', kind: 'lastStand', beat: 'rise', a: L.side, b: W.side, x: L.x, y: L.y - 60 });
    }
    if (this.t === 82) {
      this.done = true;
      L.y = 0;
      L.grounded = true;
      releaseFighter(L);
      releaseFighter(W);
      L.wrath = C.WRATH;
      L.energy = C.ENERGY;
      L.guard = C.GUARD;
      L.invuln = 50;
      L.addBuff('lastStand', 600, 1);
      L.addBuff('empowered', 480, 1);
      L.endCombo();
      sim.emit({ type: 'seq', kind: 'lastStand', beat: 'burst', a: L.side, b: W.side, x: L.x, y: L.y - 60 });
      sim.emit({ type: 'burst', side: L.side, x: L.x, y: L.y - 60 });
      const dir = Math.sign(W.x - L.x) || 1;
      W.setState('launched');
      W.stun = 30;
      W.grounded = false;
      W.y = Math.min(W.y, -2);
      W.vx = dir * 1050;
      W.vy = -520;
      W.pendingKnockdown = true;
      dealDamage(sim, L, W, Math.min(W.hp - 1, 40), { kind: 'sequence', source: 'lastStand', counter: false, level: 3, x: W.x, y: W.y - 60 });
    }
  }
  abort(): void {
    releaseFighter(this.L);
    releaseFighter(this.W);
    this.done = true;
  }
}

/* ======================================================================== */
/* Final clash (time limit or simultaneous knockout)                        */
/* ======================================================================== */

export class FinalClashSeq implements Sequence {
  readonly kind = 'finalClash';
  done = false;
  private t = 0;
  private s = 0;
  private ax0: number;
  constructor(private sim: Simulation, private reason: 'time' | 'double') {
    const [a, b] = sim.fighters;
    for (const f of sim.fighters) {
      lockFighter(f, 'final.charge');
      f.y = 0;
      f.grounded = true;
    }
    const aLeft = a.x <= b.x;
    a.x = aLeft ? -380 : 380;
    b.x = aLeft ? 380 : -380;
    this.ax0 = a.x;
    a.faceToward(b.x);
    b.faceToward(a.x);
    sim.emit({ type: 'seq', kind: 'finalClash', beat: 'start', a: 0, b: 1, x: 0, y: -80, text: reason });
  }
  private power(f: Fighter): number {
    const input = f.cmd?.struggle ?? 'push';
    return (input === 'push' ? 1 : 0.6) * (0.55 + (f.hp / f.maxHp) * 0.9 + f.wrath / 400 + f.energy / 800);
  }
  update(sim: Simulation): void {
    const [a, b] = sim.fighters;
    this.t++;
    tickAnim(a, b);
    if (this.t === 70) {
      for (const f of [a, b]) setAnim(f, 'final.dash');
      sim.emit({ type: 'seq', kind: 'finalClash', beat: 'dash', a: 0, b: 1, x: 0, y: -80 });
    }
    if (this.t > 70 && this.t <= 90) {
      const k = ease.inQuad((this.t - 70) / 20);
      const ax = this.ax0;
      a.x = lerp(ax, Math.sign(ax) * 40, k);
      b.x = lerp(-ax, -Math.sign(ax) * 40, k);
    }
    if (this.t === 92) {
      for (const f of [a, b]) setAnim(f, 'lock.push');
      sim.emit({ type: 'seq', kind: 'finalClash', beat: 'clash', a: 0, b: 1, x: 0, y: -80 });
    }
    if (this.t > 92) {
      const pa = this.power(a), pb = this.power(b);
      this.s += (pa - pb) * 0.012 + sim.rng.gaussian(0, 0.02);
      if (this.t % 8 === 0) sim.emit({ type: 'seq', kind: 'finalClash', beat: 'surge', a: 0, b: 1, x: this.s * 30, y: -80, v: this.s });
      if (Math.abs(this.s) >= 1 || this.t > 200) {
        let w: Fighter;
        if (Math.abs(this.s) >= 1) w = this.s > 0 ? a : b;
        else w = sim.rng.chance(1 / (1 + Math.exp(-4 * this.s))) ? a : b;
        const l = sim.opponentOf(w);
        this.done = true;
        releaseFighter(w);
        releaseFighter(l);
        sim.emit({ type: 'seq', kind: 'finalClash', beat: 'resolve', a: w.side, b: l.side, x: 0, y: -80 });
        sim.declareWinner(w, l, 'finalClash', 'finalClash');
      }
    }
  }
  abort(): void {
    for (const f of this.sim.fighters) releaseFighter(f);
    this.done = true;
  }
}
