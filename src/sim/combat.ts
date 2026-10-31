import { capsuleCircle, capsuleOverlap, clamp, segSegDistSq, type Capsule } from '../core/math';
import { C } from './constants';
import type { Fighter } from './fighter';
import type { Simulation } from './simulation';
import type { AttackHeight, Beam, HitDef, Projectile, Side } from './types';
import { BeamStruggleSeq, BladeLockSeq, CounterSlashSeq, ThousandCutsSeq, ThrowSeq } from './sequences';

/**
 * Combat resolution. All contacts for a tick are gathered first from a single snapshot, then
 * resolved — so neither fighter ever gets an advantage from being processed first.
 *
 * Priority of outcomes for a contact: intangible (whiff/dodge) > shield > reflect > counter stance >
 * parry > block > armor > hit. Melee-vs-melee contacts become clashes instead of hits.
 */

export interface PendingHit {
  attacker: Side | null;
  defender: Side;
  hit: HitDef;
  x: number;
  y: number;
  /** Knockback direction (+1 pushes right). The attacker is at -dirX relative to the defender. */
  dirX: number;
  source: string;
  kind: 'melee' | 'projectile' | 'beam' | 'zone' | 'explosion' | 'throw' | 'sequence' | 'env';
  height: AttackHeight;
  projectile?: Projectile;
  beam?: Beam;
  /** Damage multiplier from charged attacks. */
  holdBonus?: number;
  /** Beam/zone ticks don't each count as a combo hit. */
  countsForCombo?: boolean;
}

function canDeliver(f: Fighter): boolean {
  const a = f.action;
  if (!a || !a.def.hit || !a.def.hitbox) return false;
  if (f.actionPhase !== 'active') return false;
  const n = a.def.hits ?? 1;
  if (a.hitCount >= n) return false;
  const activeFrame = a.frame - (a.def.startup + a.hold);
  const nextAt = Math.floor((a.hitCount * a.def.active) / n);
  return activeFrame >= nextAt;
}

function isThrow(f: Fighter): boolean {
  return f.action?.def.kind === 'throw';
}

function holdBonus(f: Fighter): number {
  const a = f.action;
  if (!a || !a.def.chargeable || a.hold <= 0) return 1;
  return 1 + 0.55 * (a.hold / a.def.chargeable);
}

export function runCombat(sim: Simulation): void {
  const hits: PendingHit[] = sim.pendingHits;
  sim.pendingHits = [];
  const [a, b] = sim.fighters;
  const hbA = a.timeFrozen || a.scripted ? null : a.hitbox();
  const hbB = b.timeFrozen || b.scripted ? null : b.hitbox();

  /* ---------------- melee vs melee: clash ---------------- */
  let clashed = false;
  if (hbA && hbB && !isThrow(a) && !isThrow(b) && canDeliver(a) && canDeliver(b) && capsuleOverlap(hbA, hbB)) {
    resolveClash(sim, a, b);
    clashed = true;
  }

  /* ---------------- melee vs fighters ---------------- */
  if (!clashed) {
    let throwA = false, throwB = false;
    const pairs: [Fighter, Fighter, Capsule | null][] = [[a, b, hbA], [b, a, hbB]];
    for (const [att, def, hb] of pairs) {
      if (!hb || !canDeliver(att)) continue;
      if (def.scripted || def.state === 'dead') continue;
      const hurt = def.hurtbox();
      if (!hurt || !capsuleOverlap(hb, hurt)) continue;
      const act = att.action!;
      act.hitCount++;
      const cx = (Math.max(hb.ax, hb.bx) + Math.min(hb.ax, hb.bx)) / 2 * 0.3 + def.x * 0.7;
      const cy = clamp((hb.ay + hb.by) / 2, def.y - 105, def.y - 10);
      if (act.def.kind === 'throw') {
        if (!def.grounded || def.intangible || def.inHitstun || def.state === 'knockdown') continue;
        if (att === a) throwA = true; else throwB = true;
        hits.push({ attacker: att.side, defender: def.side, hit: act.def.hit!, x: cx, y: cy, dirX: att.facing, source: act.def.id, kind: 'throw', height: 'throw' });
        continue;
      }
      hits.push({
        attacker: att.side, defender: def.side, hit: act.def.hit!, x: cx, y: cy, dirX: att.facing, source: act.def.id,
        kind: 'melee', height: act.def.height, holdBonus: holdBonus(att),
      });
    }
    if (throwA && throwB) {
      // Simultaneous throws: break.
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].kind === 'throw') hits.splice(i, 1);
      throwBreak(sim, a, b);
    }
    // Strikes that land on an opponent who is swinging at the same instant meet in a clash.
    const mA = hits.findIndex((h) => h.kind === 'melee' && h.attacker === a.side);
    const mB = hits.findIndex((h) => h.kind === 'melee' && h.attacker === b.side);
    const swingingSoon = (f: Fighter) => f.state === 'action' && !!f.action?.def.hitbox && f.action.def.kind !== 'throw' && (f.actionPhase === 'active' || (f.actionPhase === 'startup' && f.ticksToActive <= 4));
    let clashNow = false;
    if (mA >= 0 && mB >= 0) clashNow = sim.rng.chance(0.85);
    else if (mA >= 0 && swingingSoon(b) && Math.abs(a.x - b.x) < (b.action!.def.range[1] + 30)) clashNow = sim.rng.chance(0.7);
    else if (mB >= 0 && swingingSoon(a) && Math.abs(a.x - b.x) < (a.action!.def.range[1] + 30)) clashNow = sim.rng.chance(0.7);
    if (clashNow) {
      for (let i = hits.length - 1; i >= 0; i--) if (hits[i].kind === 'melee') hits.splice(i, 1);
      resolveClash(sim, a, b);
    }
  }

  /* ---------------- melee cuts projectiles ---------------- */
  for (const [att, hb] of [[a, hbA], [b, hbB]] as [Fighter, Capsule | null][]) {
    if (!hb) continue;
    for (const p of sim.projectiles) {
      if (p.dead || p.owner === att.side || !p.slashable || p.orbitR > 0) continue;
      if (capsuleCircle(hb, p.x, p.y, p.r)) {
        p.dead = true;
        sim.emit({ type: 'projectileCut', side: att.side, x: p.x, y: p.y, aspect: p.aspect });
        if (p.explode > 0) sim.explode(sim.fighters[p.owner], p.x, p.y, p.explode * 0.6, p.hit, p.source);
      }
    }
  }

  /* ---------------- projectile vs projectile ---------------- */
  const ps = sim.projectiles;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p.dead || p.frozen) continue;
    for (let j = i + 1; j < ps.length; j++) {
      const q = ps[j];
      if (q.dead || q.owner === p.owner || q.frozen) continue;
      const rr = p.r + q.r;
      if ((p.x - q.x) ** 2 + (p.y - q.y) ** 2 > rr * rr) continue;
      sim.emit({ type: 'projectileClash', x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, aspectA: p.aspect, aspectB: q.aspect });
      const diff = p.power - q.power;
      if (Math.abs(diff) < 0.35) {
        p.dead = q.dead = true;
      } else if (diff > 0) {
        q.dead = true;
        p.power -= q.power * 0.6;
      } else {
        p.dead = true;
        q.power -= p.power * 0.6;
      }
      if (p.dead && p.explode > 0) sim.explode(sim.fighters[p.owner], p.x, p.y, p.explode, p.hit, p.source);
      if (q.dead && q.explode > 0) sim.explode(sim.fighters[q.owner], q.x, q.y, q.explode, q.hit, q.source);
      if (p.dead) break;
    }
  }

  /* ---------------- projectiles vs fighters ---------------- */
  for (const p of sim.projectiles) {
    if (p.dead || p.frozen || p.armedIn > 0 || p.orbitR > 0) continue;
    const target = sim.fighters[p.owner === 0 ? 1 : 0];
    if (target.scripted || target.state === 'dead') continue;
    const hurt = target.hurtbox();
    if (!hurt || !capsuleCircle(hurt, p.x, p.y, p.r)) continue;
    if (target.intangible) {
      maybeDodge(sim, target, 'projectile');
      continue;
    }
    if (target.hasBuff('reflect') && p.reflectable) {
      reflectProjectile(sim, p, target);
      continue;
    }
    const dirX = Math.sign(p.vx) || (target.x > p.x ? 1 : -1);
    hits.push({ attacker: p.owner, defender: target.side, hit: p.hit, x: p.x, y: p.y, dirX, source: p.source, kind: 'projectile', height: p.hit.unblockable ? 'unblockable' : 'mid', projectile: p });
    p.dead = true;
    if (p.explode > 0) sim.explode(sim.fighters[p.owner], p.x, p.y, p.explode, p.hit, p.source);
  }
  // Explosions spawned above.
  if (sim.pendingHits.length) {
    for (const h of sim.pendingHits) if (!hits.some((x) => x.kind === 'projectile' && x.defender === h.defender && x.source === h.source)) hits.push(h);
    sim.pendingHits = [];
  }

  /* ---------------- beams ---------------- */
  const live = sim.beams.filter((bm) => !bm.dead && bm.firing);
  if (live.length === 2 && live[0].owner !== live[1].owner && !live[0].struggling) {
    const [b0, b1] = live;
    const d2 = segSegDistSq(
      b0.ox, b0.oy, b0.ox + b0.dirX * b0.length, b0.oy + b0.dirY * b0.length,
      b1.ox, b1.oy, b1.ox + b1.dirX * b1.length, b1.oy + b1.dirY * b1.length,
    );
    const rr = (b0.width + b1.width) / 2;
    if (d2 < rr * rr && !sim.sequences.some((s) => s.kind === 'beamStruggle')) {
      sim.startSequence(new BeamStruggleSeq(sim, b0, b1));
    }
  }
  for (const bm of live) {
    if (bm.struggling) continue;
    const target = sim.fighters[bm.owner === 0 ? 1 : 0];
    if (target.scripted || target.state === 'dead') continue;
    const hurt = target.hurtbox();
    if (!hurt) continue;
    const seg: Capsule = { ax: bm.ox, ay: bm.oy, bx: bm.ox + bm.dirX * bm.length, by: bm.oy + bm.dirY * bm.length, r: bm.width / 2 };
    if (!capsuleOverlap(seg, hurt)) {
      // Beams vaporise projectiles in their path.
      for (const p of sim.projectiles) if (!p.dead && p.owner !== bm.owner && capsuleCircle(seg, p.x, p.y, p.r)) p.dead = true;
      continue;
    }
    if (target.intangible) {
      maybeDodge(sim, target, 'beam');
      continue;
    }
    const dist = Math.hypot(target.x - bm.ox, target.centerY() - bm.oy);
    if (target.hasBuff('reflect') || target.hasBuff('shield')) {
      bm.length = Math.min(bm.length, Math.max(0, dist - 40));
      if (target.hasBuff('shield')) absorbShield(sim, target, bm.dps * 0.8);
      continue;
    }
    const tickIdx = bm.age;
    hits.push({
      attacker: bm.owner, defender: target.side,
      hit: { damage: bm.dps, guard: 2.2, hitstun: 10, blockstun: 8, kbx: 120, kby: target.grounded ? 0 : -60, level: tickIdx % 8 === 0 ? 2 : 1 },
      x: target.x - Math.sign(bm.dirX) * 20, y: target.centerY(), dirX: Math.sign(bm.dirX) || 1, source: bm.source, kind: 'beam', height: 'mid', beam: bm,
      countsForCombo: tickIdx % 10 === 0,
    });
    if (target.state === 'block') bm.length = Math.min(bm.length, Math.max(0, dist - 30));
  }

  /* ---------------- zones ---------------- */
  for (const z of sim.zones) {
    if (z.dead || z.age < z.warn || z.age >= z.warn + z.active) continue;
    if (z.interval > 0 && (z.age - z.warn) % z.interval !== 0) continue;
    for (const t of sim.fighters) {
      if (z.owner !== null && t.side === z.owner) continue;
      if (t.scripted || t.state === 'dead') continue;
      if (z.interval === 0 && z.hitSides & (1 << t.side)) continue;
      const hurt = t.hurtbox();
      if (!hurt) continue;
      let overlap: boolean;
      if (z.fullHeight) {
        overlap = Math.abs(t.x - z.x) < z.r + 16 && t.y - 100 < 0 && t.y > -z.maxHeight;
      } else {
        overlap = capsuleCircle(hurt, z.x, z.y, z.r);
      }
      if (!overlap) continue;
      if (t.intangible) {
        maybeDodge(sim, t, 'zone');
        continue;
      }
      z.hitSides |= 1 << t.side;
      let hit = z.hit;
      if (z.kind === 'rend') {
        z.hitCount++;
        if (z.hitCount >= 6) hit = { ...z.hit, damage: z.hit.damage * 1.6, kbx: 260, kby: -820, launch: true, level: 3 };
      }
      const dirX = z.vx !== 0 ? Math.sign(z.vx) : Math.sign(t.x - z.x) || (z.owner !== null ? sim.fighters[z.owner].facing : 1);
      hits.push({
        attacker: z.owner, defender: t.side, hit, x: t.x, y: t.centerY(), dirX, source: z.source, kind: 'zone',
        height: hit.unblockable ? 'unblockable' : 'mid', countsForCombo: z.interval === 0 || z.hitCount % 2 === 0,
      });
    }
  }

  for (const h of hits) resolveHit(sim, h);
}

/* ======================================================================== */

function maybeDodge(sim: Simulation, f: Fighter, what: string): void {
  if (f.state === 'dodge' || f.state === 'backdash' || f.state === 'vanish' || f.hasBuff('phase') || (f.state === 'action' && f.action?.def.iframes)) {
    // Throttle events: only once per few ticks.
    if (sim.tick - f.lastDodgeEventTick < 20) return;
    f.lastDodgeEventTick = sim.tick;
    const perfect = f.stateT <= 6;
    f.stats.dodges++;
    sim.emit({ type: 'dodge', side: f.side, x: f.x, y: f.y - 60, perfect, what });
    if (perfect) f.gainEnergy(6);
  }
}

function reflectProjectile(sim: Simulation, p: Projectile, by: Fighter): void {
  const newTarget = sim.fighters[p.owner];
  p.owner = by.side;
  const sp = Math.hypot(p.vx, p.vy) * 1.2 + 80;
  const ang = Math.atan2(newTarget.centerY() - p.y, newTarget.x - p.x);
  p.vx = Math.cos(ang) * sp;
  p.vy = Math.sin(ang) * sp;
  p.homing = 0;
  p.grounded = false;
  p.life = Math.max(p.life, 90);
  p.power += 0.5;
  sim.emit({ type: 'reflect', side: by.side, x: p.x, y: p.y });
}

function absorbShield(sim: Simulation, f: Fighter, amount: number): boolean {
  const s = f.buff('shield');
  if (!s) return false;
  s.v -= amount;
  if (s.v <= 0) {
    sim.domeBurst(f);
  }
  return true;
}

function resolveClash(sim: Simulation, a: Fighter, b: Fighter): void {
  if (!a.action || !b.action) return;
  const la = a.action.def, lb = b.action.def;
  a.action.hitCount = 99;
  b.action.hitCount = 99;
  const heavy = (la.hit?.level ?? 1) >= 3 || (lb.hit?.level ?? 1) >= 3 || la.kind === 'heavy' || lb.kind === 'heavy' || la.kind === 'launcher' || lb.kind === 'launcher' || la.kind === 'dashAttack' || lb.kind === 'dashAttack';
  const x = (a.x + b.x) / 2;
  const y = Math.min(a.y, b.y) - 75;
  const bothBlades = a.weapon.blade && b.weapon.blade;
  const lockable = heavy && bothBlades && a.grounded && b.grounded && !sim.sequences.length;
  const lock = lockable && sim.rng.chance(0.45);
  sim.emit({ type: 'clash', x, y, heavy, lock, a: a.side, b: b.side });
  a.gainEnergy(4);
  b.gainEnergy(4);
  a.gainWrath(2);
  b.gainWrath(2);
  if (lock) {
    sim.startSequence(new BladeLockSeq(sim, a, b));
    return;
  }
  for (const f of [a, b]) {
    const other = f === a ? b : a;
    const dir = Math.sign(f.x - other.x) || -f.facing;
    f.setState('stagger');
    f.stun = heavy ? 18 : 11;
    f.vx = dir * (heavy ? 620 : 360);
    if (!f.grounded) f.vy = -260;
  }
}

function throwBreak(sim: Simulation, a: Fighter, b: Fighter): void {
  sim.emit({ type: 'seq', kind: 'throw', beat: 'break', a: a.side, b: b.side, x: (a.x + b.x) / 2, y: -70 });
  for (const f of [a, b]) {
    const other = f === a ? b : a;
    f.setState('stagger');
    f.stun = 14;
    f.vx = (Math.sign(f.x - other.x) || -f.facing) * 520;
  }
}

function heightBlocked(h: AttackHeight, low: boolean): boolean {
  switch (h) {
    case 'mid': return true;
    case 'low': return low;
    case 'overhead': return !low;
    default: return false;
  }
}

function comboScale(hits: number): number {
  const table = [1, 1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.53, 0.47, 0.42];
  return hits < table.length ? table[hits] : 0.38;
}

/** Apply raw damage with bookkeeping. Returns damage dealt. */
export function dealDamage(sim: Simulation, attacker: Fighter | null, def: Fighter, amount: number, info: { kind: PendingHit['kind']; source: string; counter: boolean; level: number; x: number; y: number }): number {
  const dmg = Math.max(0, Math.min(def.hp, amount));
  def.hp -= dmg;
  def.stats.damageTaken += dmg;
  if (attacker) {
    attacker.stats.damageDealt += dmg;
    if (attacker.def.aspect === 'verdant' && dmg > 0) {
      const heal = Math.min(attacker.maxHp - attacker.hp, dmg * 0.12);
      attacker.hp += heal;
      attacker.stats.healing += heal;
    }
  }
  sim.lastKill[def.side] = { attacker: attacker ? attacker.side : null, kind: info.kind, source: info.source, counter: info.counter, level: info.level, x: info.x, y: info.y, tick: sim.tick };
  return dmg;
}

export function resolveHit(sim: Simulation, h: PendingHit): void {
  const D = sim.fighters[h.defender];
  const A = h.attacker !== null ? sim.fighters[h.attacker] : null;
  if (D.state === 'dead' || D.scripted) return;
  if (sim.decided) return;
  const hit = h.hit;

  if (D.intangible) {
    maybeDodge(sim, D, h.kind);
    return;
  }

  // --- Divine shield absorbs everything except throws.
  if (D.hasBuff('shield') && h.kind !== 'throw' && h.kind !== 'sequence') {
    absorbShield(sim, D, hit.damage * (h.kind === 'melee' ? 0.7 : 1));
    sim.emit({ type: 'block', attacker: h.attacker ?? D.side, defender: D.side, x: h.x, y: h.y, damage: 0, level: hit.level, guardLeft: D.guard, aspect: D.def.aspect });
    if (A && h.kind === 'melee' && A.action) A.action.wasBlocked = true;
    return;
  }

  const facingAttacker = D.facing === -h.dirX;

  // --- Mirror ward: melee is repelled like a perfect parry.
  if (D.hasBuff('reflect') && A && h.kind === 'melee') {
    doParry(sim, D, A, h, true);
    return;
  }

  // --- Counter stance: melee strikes trigger the iai counter.
  if (D.hasBuff('counter') && A && h.kind === 'melee' && !hit.unblockable) {
    D.removeBuff('counter');
    sim.startSequence(new CounterSlashSeq(sim, D, A));
    return;
  }

  // --- Throws: unblockable, unparryable.
  if (h.kind === 'throw' && A) {
    if (D.state === 'action' && D.actionPhase === 'startup' && D.action?.def.kind !== 'throw') {
      // Throws beat attacks still winding up too (they are grabbed out of startup).
    }
    sim.startSequence(new ThrowSeq(sim, A, D));
    return;
  }

  // --- Parry.
  if (D.state === 'parry' && D.parryT <= C.PARRY_WINDOW && (facingAttacker || h.kind !== 'melee') && (h.kind === 'melee' || h.kind === 'projectile') && !hit.unblockable && h.height !== 'throw') {
    doParry(sim, D, A, h, D.parryT <= C.PERFECT_WINDOW);
    return;
  }

  // --- Block.
  const blocking = D.state === 'block' && facingAttacker && heightBlocked(h.height, D.blockLow) && !hit.unblockable && !D.timeFrozen;
  if (blocking) {
    const chipMult = h.kind === 'beam' ? 0.22 : h.kind === 'zone' || h.kind === 'explosion' ? 0.18 : C.CHIP;
    let chip = hit.damage * chipMult * sim.damageScale * (A ? A.damageMult : 1);
    if (sim.phase !== 'judgment') chip = Math.min(chip, D.hp - 1);
    if (chip > 0) dealDamage(sim, A, D, chip, { kind: h.kind, source: h.source, counter: false, level: hit.level, x: h.x, y: h.y });
    D.guard -= hit.guard * (A?.hasBuff('ascended') ? 1.25 : 1);
    D.guardDelay = C.GUARD_REGEN_DELAY;
    D.stun = Math.max(D.stun, hit.blockstun);
    D.vx = h.dirX * Math.max(140, hit.kbx * 0.45);
    D.lastBlockTick = sim.tick;
    D.stats.blocks += h.kind === 'beam' ? 0 : 1;
    D.gainEnergy(1.5);
    if (A) {
      A.gainEnergy(2);
      if (h.kind === 'melee' && A.action) {
        A.action.wasBlocked = true;
        A.vx -= h.dirX * 90;
      }
    }
    if (h.kind !== 'beam' || sim.tick % 6 === 0) {
      sim.emit({ type: 'block', attacker: h.attacker ?? D.side, defender: D.side, x: h.x, y: h.y, damage: chip, level: hit.level, guardLeft: D.guard, aspect: A ? A.def.aspect : D.def.aspect });
    }
    if (D.guard <= 0) {
      D.guard = 0;
      D.setState('guardbreak');
      D.stun = C.GUARDBREAK_T;
      D.vx = h.dirX * 260;
      sim.emit({ type: 'guardBreak', attacker: h.attacker ?? D.side, defender: D.side, x: D.x, y: D.y - 70 });
      if (A) {
        A.stats.guardBreaks++;
        A.gainWrath(8);
      }
    }
    return;
  }

  // --- Super armor.
  if (D.state === 'action' && D.action && D.action.def.armor && D.action.frame < D.action.def.armor + D.action.hold && hit.level < 4 && !hit.crush) {
    const dmg = dealDamage(sim, A, D, hit.damage * 0.5 * (A ? A.damageMult : 1) * sim.damageScale, { kind: h.kind, source: h.source, counter: false, level: hit.level, x: h.x, y: h.y });
    D.gainWrath((dmg / D.maxHp) * C.WRATH_TAKEN);
    if (A && h.kind === 'melee' && A.action) A.action.hasHit = true;
    sim.emit({
      type: 'hit', attacker: h.attacker ?? D.side, defender: D.side, x: h.x, y: h.y, damage: dmg, level: hit.level, counter: false, punish: false,
      combo: D.comboHits, comboDamage: D.comboDamage, source: h.source, dirX: h.dirX, launch: false, knockdown: false, aspect: A ? A.def.aspect : D.def.aspect,
      lethal: D.hp <= 0, armored: true,
    });
    return;
  }

  // --- Thousand Cuts connects: cinematic.
  if (hit.tag === 'thousandCuts' && A) {
    sim.startSequence(new ThousandCutsSeq(sim, A, D));
    return;
  }

  applyHit(sim, A, D, h);
}

function doParry(sim: Simulation, D: Fighter, A: Fighter | null, h: PendingHit, perfect: boolean): void {
  if (h.kind === 'projectile' && h.projectile) {
    if (perfect && h.projectile.reflectable) {
      h.projectile.dead = false;
      reflectProjectile(sim, h.projectile, D);
    }
  } else if (A) {
    const heavy = h.hit.level >= 3;
    A.setState('parried');
    A.stun = (heavy ? 34 : 22) + (perfect ? 12 : 0);
    A.vx = h.dirX * 220;
    if (!A.grounded) A.vy = -200;
  }
  D.gainEnergy(perfect ? 14 : 8);
  D.gainWrath(perfect ? 10 : 5);
  D.stats.parries++;
  if (perfect) D.stats.perfectParries++;
  if (perfect && D.def.aspect === 'radiance') {
    const heal = Math.min(D.maxHp - D.hp, 24);
    D.hp += heal;
    D.stats.healing += heal;
    if (A) A.addBuff('blind', 60, 1, D.side);
  }
  if (D.state === 'parry') D.setState(D.grounded ? 'idle' : 'air');
  sim.emit({ type: 'parry', parrier: D.side, attacker: A ? A.side : D.side, x: h.x, y: h.y, perfect, projectile: h.kind === 'projectile' });
}

export function applyHit(sim: Simulation, A: Fighter | null, D: Fighter, h: PendingHit): void {
  const hit = h.hit;
  const counter = D.state === 'action' && D.actionPhase === 'startup';
  const punish =
    (D.state === 'action' && D.actionPhase === 'recovery') || D.state === 'parried' || D.state === 'guardbreak' || D.state === 'charge';
  const whiffPunish = D.state === 'action' && D.actionPhase === 'recovery' && !!D.action?.whiffed;
  const countsForCombo = h.countsForCombo ?? true;

  let dmg = hit.damage * (A ? A.damageMult : 1) * comboScale(D.comboHits) * (counter ? 1.2 : 1) * (h.holdBonus ?? 1) * sim.damageScale;
  if (punish && h.kind === 'melee') dmg *= 1.08;
  if (hit.tag === 'bind' || h.kind === 'beam') dmg = hit.damage * (A ? A.damageMult : 1) * sim.damageScale * Math.max(0.55, comboScale(Math.floor(D.comboHits / 2)));
  const dealt = dealDamage(sim, A, D, dmg, { kind: h.kind, source: h.source, counter, level: hit.level, x: h.x, y: h.y });

  if (countsForCombo) D.comboHits++;
  D.comboDamage += dealt;
  D.lastHitTick = sim.tick;
  D.lastHitDir = h.dirX;
  D.lastHitLevel = hit.level;
  if (A) {
    A.stats.hitsLanded += countsForCombo ? 1 : 0;
    if (counter) A.stats.counterHits++;
    if (whiffPunish) {
      A.stats.whiffPunishes++;
      sim.emit({ type: 'whiffPunish', side: A.side });
    }
    if (D.comboHits > A.stats.longestCombo) A.stats.longestCombo = D.comboHits;
    if (D.comboDamage > A.stats.biggestCombo) A.stats.biggestCombo = D.comboDamage;
  }

  // Interrupt whatever the defender was doing.
  if (D.state === 'charge') sim.emit({ type: 'charge', side: D.side, on: false });

  const decay = Math.max(0.5, 1 - 0.045 * Math.max(0, D.comboHits - 1));
  let stun = Math.round(hit.hitstun * decay) + (counter ? 8 : 0);
  const kbScale = 1 + Math.min(0.3, D.comboHits * 0.02);

  if (hit.tag === 'bind') {
    D.setState('bound');
    D.stun = hit.hitstun;
    D.vx = 0;
    sim.emit({ type: 'stun', side: D.side, ticks: hit.hitstun, what: 'bind' });
  } else {
    const airborneHit = !D.grounded || hit.launch || hit.knockdown;
    D.vx = h.dirX * hit.kbx * kbScale;
    if (airborneHit) {
      let vy = hit.kby;
      if (!hit.launch && !hit.knockdown && vy > -200 && !D.grounded) vy = Math.min(vy, -300);
      if (D.juggle > 3 && vy < 0) vy *= 0.85;
      D.vy = vy;
      if (vy < 0) {
        D.grounded = false;
        D.y = Math.min(D.y, -2);
      }
      D.setState('launched');
      D.stun = stun;
      D.juggle++;
      if (D.juggle > C.JUGGLE_LIMIT) {
        D.juggleImmune = true;
        D.stun = Math.min(D.stun, 8);
      }
      if (hit.knockdown || hit.launch) D.pendingKnockdown = true;
      if (hit.groundBounce) {
        D.pendingGroundBounce = true;
        D.pendingKnockdown = true;
      }
      if (hit.launch) sim.emit({ type: 'launch', side: D.side, x: D.x, y: D.y });
    } else {
      D.setState('hitstun');
      D.stun = stun;
    }
    if (hit.wallBounce) D.pendingWallBounce = true;
    if (hit.tag === 'stun') {
      stun += 10;
      D.stun = Math.max(D.stun, stun);
    }
  }

  // Elemental aspects.
  if (A) {
    switch (A.def.aspect) {
      case 'inferno':
        if (h.kind !== 'beam' || sim.tick % 12 === 0) D.addBuff('burn', 90, Math.min(2, (D.buff('burn')?.v ?? 0) + 1), A.side);
        break;
      case 'frost':
        if (h.kind !== 'beam' || sim.tick % 12 === 0) D.addBuff('chill', 90, Math.min(3, (D.buff('chill')?.v ?? 0) + 1), A.side);
        break;
      default:
        break;
    }
    A.gainEnergy(h.kind === 'beam' ? 0.25 : 3.5);
    A.gainWrath((dealt / D.maxHp) * C.WRATH_DEALT * sim.wrathScale);
    A.momentum = Math.min(1, A.momentum + (h.kind === 'beam' ? 0.005 : 0.07));
    if (h.kind === 'melee' && A.action) A.action.hasHit = true;
  }
  D.gainEnergy(h.kind === 'beam' ? 0.15 : 2);
  D.gainWrath((dealt / D.maxHp) * C.WRATH_TAKEN * sim.wrathScale * (D.hp < 350 ? 1.5 : 1));
  D.momentum = Math.max(-1, D.momentum - (h.kind === 'beam' ? 0.004 : 0.06));

  const emitIt = h.kind !== 'beam' || countsForCombo;
  if (emitIt) {
    sim.emit({
      type: 'hit', attacker: h.attacker ?? D.side, defender: D.side, x: h.x, y: h.y, damage: h.kind === 'beam' ? dealt * 10 : dealt,
      level: hit.level, counter, punish, combo: D.comboHits, comboDamage: D.comboDamage, source: h.source, dirX: h.dirX,
      launch: !!hit.launch, knockdown: !!hit.knockdown, tag: hit.tag, aspect: A ? A.def.aspect : D.def.aspect, lethal: D.hp <= 0, armored: false,
    });
  }
}
