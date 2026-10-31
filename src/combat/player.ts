import * as THREE from 'three';
import { Fighter } from './fighter';
import { ClipEvent, getClip } from '../anim/clip';
import { HitInfo, HitResult } from './types';
import { MoveDef, PLAYER_STRIKES } from './moves';
import { angleDiff, chance, clamp, damp, dampAngle, pick, rand, weightedPick, yawFromDir } from '../core/math';
import { PAIRS, PairedClip } from '../anim/lib/paired';
import type { Enemy } from '../ai/enemy';
import { Weapon } from './weapons';
import { B } from '../anim/skeleton';

export type PlayerAction = 'free' | 'attack' | 'counter' | 'finisher' | 'dodge' | 'vault' | 'hit' | 'down' | 'grab' | 'takedown' | 'stun' | 'throwing' | 'dead';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _hp = new THREE.Vector3();

const WEAPON_MOVES: Record<string, { clip: string; reach: number; damage: number; strength: number; kind: 'blunt' | 'blade'; region: 'head' | 'chest' | 'gut'; bleed: number; speed: number }[]> = {
  club: [
    { clip: 'e_club_swing', reach: 1.0, damage: 28, strength: 1.0, kind: 'blunt', region: 'head', bleed: 0.7, speed: 1.7 },
    { clip: 'e_club_swing_m', reach: 1.0, damage: 28, strength: 1.0, kind: 'blunt', region: 'head', bleed: 0.7, speed: 1.7 },
    { clip: 'e_club_overhead', reach: 0.95, damage: 38, strength: 1.3, kind: 'blunt', region: 'head', bleed: 1.0, speed: 1.55 },
  ],
  knife: [
    { clip: 'e_knife_slash', reach: 0.85, damage: 24, strength: 0.7, kind: 'blade', region: 'chest', bleed: 1.2, speed: 1.9 },
    { clip: 'e_knife_slash_m', reach: 0.85, damage: 24, strength: 0.7, kind: 'blade', region: 'chest', bleed: 1.2, speed: 1.9 },
    { clip: 'e_knife_stab', reach: 0.85, damage: 34, strength: 0.8, kind: 'blade', region: 'gut', bleed: 1.5, speed: 1.7 },
  ],
  sword: [
    { clip: 'e_sword_slash', reach: 1.05, damage: 32, strength: 0.9, kind: 'blade', region: 'chest', bleed: 1.4, speed: 1.75 },
    { clip: 'e_sword_slash_m', reach: 1.05, damage: 32, strength: 0.9, kind: 'blade', region: 'chest', bleed: 1.4, speed: 1.75 },
    { clip: 'e_sword_spin', reach: 1.1, damage: 42, strength: 1.2, kind: 'blade', region: 'gut', bleed: 1.6, speed: 1.6 },
  ],
};

export class Player extends Fighter {
  team = 'player' as const;
  speed = 5.6;
  action: PlayerAction = 'free';
  target: Enemy | null = null;
  partner: Enemy | null = null;
  combo = 0;
  comboTimer = 0;
  bestCombo = 0;
  charges = 0;
  chargeProgress = 0;
  guard = 100;
  curMove: MoveDef | null = null;
  weaponMove: (typeof WEAPON_MOVES)['club'][number] | null = null;
  history: string[] = [];
  pendingPair: PairedClip | null = null;
  counterPerfect = false;
  grabT = 0;
  hitLanded = false;
  whiffT = 0;
  score = 0;
  multiplier = 1;
  variety = new Set<string>();
  stats = { hits: 0, counters: 0, perfectCounters: 0, dodges: 0, perfectDodges: 0, finishers: 0, kills: 0, damageTaken: 0, blocks: 0, takedowns: 0, envKills: 0, weaponKills: 0, disarms: 0, boneBreaks: 0 };
  regenDelay = 0;
  lastFinisher = '';
  onComboBreak: ((c: number) => void) | null = null;

  // ------------------------------------------------------------------ helpers
  isLocked() {
    return this.action === 'counter' || this.action === 'finisher' || this.action === 'takedown' || this.action === 'vault' || (this.action === 'dodge' && this.invuln > 0);
  }
  /** 0..1 how exposed the player is (enemies get more aggressive). */
  vulnerability() {
    if (this.action === 'takedown' || this.action === 'grab') return 1;
    if (this.action === 'attack' && this.clip && this.clip.time > this.clip.clip.hitT) return 0.6;
    if (this.action === 'hit' || this.action === 'down') return 0.8;
    return 0;
  }
  enemies(): Enemy[] {
    return this.game.enemies();
  }

  private inputDir(): THREE.Vector3 | null {
    const inp = this.game.input;
    if (Math.hypot(inp.moveX, inp.moveY) < 0.3) return null;
    const [wx, wz] = this.game.cam.moveBasis(inp.moveX, inp.moveY);
    return new THREE.Vector3(wx, 0, wz).normalize();
  }

  /** Free-flow target selection (direction biased). */
  selectTarget(maxDist = 8.5, filter?: (e: Enemy) => boolean): Enemy | null {
    const dir = this.inputDir();
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies()) {
      if (!e.alive || e.paired || e.state === 'enter') continue;
      if (filter && !filter(e)) continue;
      const d = this.distTo(e);
      if (d > maxDist) continue;
      let score: number;
      if (dir) {
        const ang = Math.abs(angleDiff(yawFromDir(dir.x, dir.z), yawFromDir(e.x - this.x, e.z - this.z)));
        if (ang > 1.2) continue;
        score = ang * 3.2 + d * 0.28;
      } else {
        const keep = e === this.target && d < 4.5 ? -1.5 : 0;
        const ang = Math.abs(this.angleTo(e));
        score = d + ang * 0.6 + keep + (e.down ? 2 : 0);
      }
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ main update
  think(dt: number) {
    const g = this.game;
    const inp = g.input;
    this.stateTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.whiffT = Math.max(0, this.whiffT - dt);
    // combo timeout
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }
    this.guard = Math.min(100, this.guard + dt * (inp.isHeld('block') ? 6 : 18));
    this.regenDelay -= dt;
    if (this.regenDelay < 0 && this.hp < this.maxHp && this.game.waves.betweenWaves) this.hp = Math.min(this.maxHp, this.hp + dt * 6);
    this.anim.locoIn.block = 0;
    if (this.weapon && this.weapon.broken) this.weapon = null;

    switch (this.action) {
      case 'free':
        this.freeMove(dt);
        this.readActions();
        break;
      case 'attack':
      case 'stun':
      case 'throwing': {
        const c = this.clip;
        if (!c) {
          this.toFree();
          break;
        }
        // cancel windows
        const t = c.time;
        const hitT = c.clip.hitT;
        if (inp.peek('counter', 0.2) && g.director.findCounterable()) {
          this.tryCounter();
          break;
        }
        if (t > hitT + 0.02 && inp.peek('dodge', 0.2)) {
          inp.consume('dodge');
          this.doDodge();
          break;
        }
        if (t >= c.clip.comboT && (inp.peek('attack', 0.35) || inp.peek('stun', 0.3) || inp.peek('finisher', 0.3) || inp.peek('grab', 0.3))) {
          this.readActions();
          break;
        }
        if (c.done || t >= c.clip.recoverT) this.toFree(0.14);
        break;
      }
      case 'dodge':
      case 'vault':
        if (!this.clip || this.clip.done || this.clip.time >= this.clip.clip.recoverT) this.toFree(0.12);
        else if (this.clip.time > this.clip.clip.recoverT * 0.55) this.readActions(true);
        break;
      case 'hit':
        if (!this.clip || this.clip.done || this.clip.time >= this.clip.clip.recoverT) this.toFree(0.15);
        else if (this.clip.time > 0.18 && inp.peek('dodge', 0.2)) {
          inp.consume('dodge');
          this.doDodge();
        }
        break;
      case 'down':
        if (!this.clip || this.clip.done || this.clip.time >= this.clip.clip.recoverT) this.toFree(0.2);
        break;
      case 'counter':
      case 'finisher':
      case 'takedown': {
        const c = this.clip;
        if (!c || c.done || c.time >= c.clip.recoverT) {
          this.endPaired();
          this.toFree(0.12);
          break;
        }
        // chain counters while locked
        if (this.action === 'counter' && c.time > c.clip.hitT && inp.peek('counter', 0.25) && g.director.findCounterable()) {
          this.endPaired();
          this.tryCounter();
          break;
        }
        if (c.time > c.clip.hitT + 0.08 && inp.peek('attack', 0.3)) {
          this.endPaired();
          this.readActions();
        }
        break;
      }
      case 'grab':
        this.doGrab(dt);
        break;
      case 'dead':
        break;
    }
  }

  private toFree(hl = 0.12) {
    this.action = 'free';
    this.anim.toLoco(hl);
    this.stateTime = 0;
    this.curMove = null;
  }

  private freeMove(dt: number) {
    const inp = this.game.input;
    const [wx, wz] = this.game.cam.moveBasis(inp.moveX, inp.moveY);
    const mag = Math.min(1, Math.hypot(wx, wz));
    const blocking = inp.isHeld('block') && this.guard > 5;
    const sp = blocking ? 1.6 : this.speed;
    const tvx = wx * sp, tvz = wz * sp;
    const acc = mag > 0.05 ? 11 : 9;
    this.vx = damp(this.vx, tvx, acc, dt);
    this.vz = damp(this.vz, tvz, acc, dt);
    const near = this.selectTarget(5);
    if (mag > 0.1 && !blocking) this.yaw = dampAngle(this.yaw, yawFromDir(wx, wz), 11, dt);
    else if (near) {
      // idle: turn to face nearest threat (Arkham-style awareness)
      const want = yawFromDir(near.x - this.x, near.z - this.z);
      this.yaw = dampAngle(this.yaw, want, blocking ? 8 : 3, dt);
    }
    const li = this.anim.locoIn;
    li.style = this.weapon ? 'weapon1h' : 'fight';
    li.guard = 1;
    li.block = blocking ? 1 : 0;
    li.breath = this.hp < 35 ? 1 : 0.4;
    li.hunch = this.hp < 25 ? 0.3 : 0;
    li.look = near ? clamp(this.angleTo(near), -1.1, 1.1) : 0;
  }

  /** Consume buffered inputs and start actions. */
  private readActions(dodgeOnly = false) {
    const inp = this.game.input;
    if (inp.consume('dodge', 0.22)) {
      this.doDodge();
      return;
    }
    if (dodgeOnly) return;
    if (inp.consume('counter', 0.22)) {
      if (!this.tryCounter()) this.game.director.note('whiffedCounters');
      return;
    }
    if (inp.consume('finisher', 0.3)) {
      this.tryFinisher();
      return;
    }
    if (inp.consume('throw', 0.3)) {
      this.throwWeapon();
      return;
    }
    if (inp.consume('grab', 0.3)) {
      this.tryGrabOrPickup();
      return;
    }
    if (inp.consume('stun', 0.3)) {
      this.doStun();
      return;
    }
    if (inp.consume('attack', 0.35)) {
      this.doAttack();
      return;
    }
  }

  // ------------------------------------------------------------------ attacks
  private chooseStrike(target: Enemy): { move: MoveDef; back: boolean } {
    const d = this.distTo(target);
    const ang = Math.abs(this.angleTo(target));
    const back = ang > 2.1 && d < 2.3 && this.action === 'attack';
    let pool: MoveDef[];
    if (back) pool = PLAYER_STRIKES.filter((m) => m.range === 'back');
    else if (d > 4.2) pool = PLAYER_STRIKES.filter((m) => m.range === 'far');
    else if (d < 1.15) pool = PLAYER_STRIKES.filter((m) => m.range === 'close' || m.name === 'hook' || m.name === 'cross');
    else pool = PLAYER_STRIKES.filter((m) => m.range === 'mid' || (m.range === 'close' && d < 1.8));
    pool = pool.filter((m) => (m.minCombo ?? 0) <= this.combo);
    if (pool.length === 0) pool = PLAYER_STRIKES.filter((m) => m.range === 'mid');
    const recent = this.history.slice(-3);
    const stunned = target.state === 'stunned';
    const move =
      weightedPick(pool, (m) => {
        let w = m.weight;
        if (recent.includes(m.name)) w *= recent[recent.length - 1] === m.name ? 0.05 : 0.3;
        if (stunned && (m.kind === 'punch' || m.kind === 'elbow')) w *= 1.8; // beatdown flurry
        if (this.combo >= 6 && m.kind === 'kick') w *= 1.6;
        if (target.cfg.block > 0.5 && m.kind === 'kick' && m.strength >= 1) w *= 2.5; // guard breakers
        return w;
      }) ?? pool[0];
    return { move, back };
  }

  doAttack() {
    const g = this.game;
    const target = this.selectTarget(8.5);
    this.vx = this.vz = 0;
    if (this.weapon) {
      this.weaponAttack(target);
      return;
    }
    if (!target) {
      // shadow strike into the air
      const m = pick(PLAYER_STRIKES.filter((x) => x.range === 'mid' && x.kind === 'punch'));
      const side = chance(0.5) ? '' : '_m';
      this.play(m.clip + side, { halflife: 0.08 });
      this.action = 'attack';
      this.curMove = null;
      this.stateTime = 0;
      return;
    }
    this.target = target;
    const { move, back } = this.chooseStrike(target);
    // mirror based on target side for lateral moves
    const side = this.angleTo(target) > 0.25 ? '_m' : chance(0.3) ? '_m' : '';
    const clipName = (getClip(move.clip + side) ? move.clip + side : move.clip);
    // agile/elite may evade (decided now so the whiff reads naturally)
    const evaded = target.stun <= 0 && target.state !== 'stunned' && target.tryEvade(this);
    const speed = target.state === 'stunned' ? 1.25 : 1.05 + Math.min(0.25, this.combo * 0.015);
    this.play(clipName, { target, reach: move.reach * (evaded ? 1.0 : 1), maxWarp: move.range === 'far' ? 7.5 : 4.2, back, halflife: 0.07, speed, entryHalflife: 0.06 });
    this.curMove = move;
    this.hitLanded = false;
    this.action = 'attack';
    this.stateTime = 0;
    this.history.push(move.name);
    if (this.history.length > 8) this.history.shift();
    g.director.note('strikes');
    if (chance(0.25)) g.audio.play('grunt_attack', { pos: _v.set(this.x, 1.6, this.z), vol: 0.45 });
  }

  private weaponAttack(target: Enemy | null) {
    const w = this.weapon!;
    const list = WEAPON_MOVES[w.kind];
    const recent = this.history.slice(-2);
    const m = weightedPick(list, (x) => (recent.includes(x.clip) ? 0.2 : 1)) ?? list[0];
    this.target = target;
    this.play(m.clip, { target, reach: m.reach, maxWarp: 4, speed: m.speed, halflife: 0.08 });
    this.weaponMove = m;
    this.curMove = null;
    this.action = 'attack';
    this.stateTime = 0;
    this.history.push(m.clip);
    this.hitLanded = false;
  }

  doStun() {
    const target = this.selectTarget(6);
    this.vx = this.vz = 0;
    this.play('stun_palm', { target, reach: 0.78, maxWarp: 4, halflife: 0.07, speed: 1.15 });
    this.target = target;
    this.curMove = { name: 'stun', clip: 'stun_palm', kind: 'palm', region: 'chest', reach: 0.78, damage: 3, strength: 0.5, bleed: 0, range: 'mid', weight: 0 };
    this.action = 'stun';
    this.stateTime = 0;
  }

  // ------------------------------------------------------------------ events from own clips
  onEvent(ev: ClipEvent) {
    const g = this.game;
    switch (ev.type) {
      case 'sfx':
        if (ev.name === 'whoosh_heavy') g.audio.swoosh(0.3, 0.8);
        g.audio.play(String(ev.name), { pos: _v.set(this.x, 1.2, this.z), vol: 0.8 });
        return;
      case 'hit':
        this.onStrikeContact(ev);
        return;
      case 'throw':
        this.onThrowEvent(ev);
        return;
      case 'sweep':
        this.onSweep();
        return;
      case 'slam':
        this.onSlam();
        return;
      case 'disarm':
        this.onDisarm();
        return;
    }
  }

  private onStrikeContact(ev: ClipEvent) {
    const g = this.game;
    const paired = this.action === 'counter' || this.action === 'finisher' || this.action === 'takedown' || this.action === 'grab';
    const victim = (paired ? this.partner : this.target) as Enemy | null;
    if (!victim || !victim.alive) return;
    // ---- range check for free strikes
    if (!paired) {
      const reach = this.curMove?.reach ?? this.weaponMove?.reach ?? 1;
      if (this.distTo(victim) > reach + 0.7 || (victim.state === 'dodge' && victim.invuln > 0)) {
        this.whiff();
        return;
      }
    }
    let p: Partial<HitInfo> & { limb?: string };
    if (paired) {
      p = {
        limb: String(ev.limb ?? 'rh'),
        region: (ev.region as HitInfo['region']) ?? 'head',
        damage: Number(ev.damage ?? 20) * (this.counterPerfect ? 1.4 : 1),
        strength: Number(ev.strength ?? 1),
        bleed: Number(ev.bleed ?? 0.5),
        kind: (ev.kind as HitInfo['kind']) ?? 'punch',
        finisher: !!ev.finisher,
        boneBreak: !!ev.boneBreak || (this.counterPerfect && chance(0.5)),
        launch: Number(ev.launch ?? 0),
      };
      if (ev.breakArm) (p as HitInfo & { breakArm: number }).breakArm = Number(ev.breakArm);
      if (ev.noKill && victim.hp - (p.damage ?? 0) <= 0) p.damage = Math.max(1, victim.hp - 1);
    } else if (this.weaponMove) {
      const m = this.weaponMove;
      p = { limb: 'rh', region: m.region, damage: m.damage, strength: m.strength, bleed: m.bleed, kind: m.kind };
    } else if (this.curMove) {
      const m = this.curMove;
      const comboMul = 1 + Math.min(0.6, this.combo * 0.03);
      p = { limb: String(ev.limb ?? 'rh'), region: m.region, damage: m.damage * comboMul, strength: m.strength, bleed: m.bleed, kind: m.kind, launch: m.launch ?? 0 };
      if (m.name === 'stun') p.stun = victim.cfg.needsStun ? 2.6 : 2.0;
    } else return;
    const hit = g.combat.makeStrike(this, victim, p);
    // stun strike: stuns instead of hurting
    if (this.action === 'stun') {
      g.combat.feedback(this, victim, { ...hit, bleed: 0, strength: 0.6 }, 'hit');
      victim.hp -= 3;
      victim.stunNow(p.stun ?? 2);
      this.addCombo(1, 'stun');
      return;
    }
    const res = victim.takeHit(hit);
    g.combat.feedback(this, victim, hit, res);
    if (res === 'blocked') {
      this.hitLanded = true;
      this.comboTimer = Math.max(this.comboTimer, 1.0);
      return;
    }
    if (res === 'hit' || res === 'killed') {
      this.hitLanded = true;
      this.addCombo(1, this.curMove?.name ?? this.weaponMove?.clip ?? 'paired');
      if (hit.boneBreak) this.stats.boneBreaks++;
      if (this.weapon && this.weaponMove) {
        this.weapon.bloody = Math.min(1, this.weapon.bloody + 0.25);
        this.weapon.wear(1);
      }
      if (res === 'killed') {
        this.stats.kills++;
        if (hit.finisher) this.hp = Math.min(this.maxHp, this.hp + 8);
        if (this.weaponMove) this.stats.weaponKills++;
      }
      if (hit.finisher) {
        g.slowMo(0.22, 0.75);
        g.renderer.fx.flash = 0.35;
        g.audio.duck(0.6, 0.8);
      } else if (this.counterPerfect && paired) {
        g.slowMo(0.35, 0.4);
      }
    }
  }

  private whiff() {
    this.whiffT = 0.35;
    // whiffing reduces combo timer (Arkham: misses break flow)
    this.comboTimer = Math.min(this.comboTimer, 0.6);
  }

  addCombo(n: number, tag: string) {
    this.combo += n;
    this.comboTimer = 2.6;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.stats.hits += n;
    this.variety.add(tag);
    this.chargeProgress += n;
    const need = this.charges === 0 ? 6 : 8;
    if (this.chargeProgress >= need && this.charges < 3) {
      this.chargeProgress -= need;
      this.charges++;
      this.game.hud?.flashFinisherReady();
    }
    this.multiplier = 1 + Math.floor(this.combo / 5) * 0.25 + Math.min(1, this.variety.size * 0.05);
    this.score += Math.round(10 * n * this.multiplier);
  }

  breakCombo() {
    if (this.combo > 0) this.onComboBreak?.(this.combo);
    this.combo = 0;
    this.comboTimer = 0;
    this.variety.clear();
    this.multiplier = 1;
  }

  // ------------------------------------------------------------------ counters
  tryCounter(): boolean {
    const g = this.game;
    const inp = g.input;
    inp.consume('counter', 0.3);
    const inc = g.director.findCounterable();
    if (!inc) {
      // nothing to counter: brief guard
      return false;
    }
    if (inc.feint) {
      // countering a feint: whiff, vulnerable
      g.director.note('whiffedCounters');
      g.director.cancel(inc.enemy);
      this.play('p_block_hit', { halflife: 0.06 });
      this.action = 'hit';
      this.stateTime = 0;
      return true;
    }
    const e = inc.enemy;
    const remain = inc.hitTime - g.time;
    this.counterPerfect = remain < 0.17;
    g.director.cancel(e);
    g.director.note('counters');
    this.stats.counters++;
    if (this.counterPerfect) {
      this.stats.perfectCounters++;
      this.hp = Math.min(this.maxHp, this.hp + 3);
      g.hud?.toast('PERFECT COUNTER', '#ffd24a');
    }
    // choose counter by enemy's attack
    let name: string;
    const atk = e.attackDef;
    if (e.weapon || atk?.weapon) name = 'ctr_disarm';
    else if (atk?.kind === 'kick') name = pick(['ctr_palm', 'ctr_elbow']);
    else {
      const opts = ['ctr_elbow', 'ctr_palm', 'ctr_armbreak', 'ctr_throw'];
      const recent = this.history.slice(-2);
      name = weightedPick(opts, (o) => (recent.includes(o) ? 0.15 : 1) * (o === 'ctr_armbreak' ? (this.counterPerfect ? 2.5 : 0.6) : 1) * (o === 'ctr_throw' ? 0.8 : 1)) ?? 'ctr_elbow';
      if (e.cfg.needsStun && name === 'ctr_throw') name = 'ctr_elbow';
    }
    this.history.push(name);
    this.startPaired(e, PAIRS.get(name)!, 'counter', 1.0 + (this.counterPerfect ? 0.0 : 0.1));
    this.addCombo(1, name);
    g.audio.play('parry', { pos: _v.set(e.x, 1.4, e.z), vol: 0.8 });
    g.fx.impactFlash(_v.set((e.x + this.x) / 2, 1.45, (e.z + this.z) / 2), 0.7, [0.75, 0.85, 1]);
    return true;
  }

  // ------------------------------------------------------------------ paired helper
  startPaired(e: Enemy, pair: PairedClip, action: PlayerAction, speed = 1) {
    const g = this.game;
    e.releaseStagger();
    let dx = e.x - this.x, dz = e.z - this.z;
    let dist = Math.hypot(dx, dz) || 1;
    let yaw = yawFromDir(dx, dz);
    // split the distance mismatch between both characters
    const mis = (dist - pair.dist * e.scale) * 0.5;
    let ox = this.x + (dx / dist) * mis, oz = this.z + (dz / dist) * mis;
    if (e.downRag) {
      // a body on the floor can't move: the attacker covers the whole gap, lining up on the head
      const head = e.downRag.headPos(new THREE.Vector3());
      dx = head.x - this.x;
      dz = head.z - this.z;
      dist = Math.hypot(dx, dz) || 1;
      yaw = yawFromDir(dx, dz);
      ox = head.x - (dx / dist) * pair.dist;
      oz = head.z - (dz / dist) * pair.dist;
    }
    this.partner = e;
    this.paired = e;
    e.enterPaired(this);
    this.vx = this.vz = 0;
    const ap = this.play(pair.a.name, { originX: ox, originZ: oz, originYaw: yaw, halflife: 0.07, speed, entryHalflife: 0.09, aim: this.aimAt(e) });
    if (!e.downRag) {
      e.play(pair.b.name, { originX: ox, originZ: oz, originYaw: yaw, halflife: 0.07, speed, entryHalflife: 0.09, aim: e.aimAt(this) });
    }
    this.action = action;
    this.stateTime = 0;
    this.invuln = Math.max(this.invuln, (pair.a.recoverT / speed) * 0.9);
    // cinematic camera for finishers
    if ((action === 'finisher' || action === 'takedown') && pair.camera) {
      const c = pair.camera;
      const focus = new THREE.Vector3((this.x + e.x) / 2, 1.1, (this.z + e.z) / 2);
      const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
      const perp = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(c.side);
      const pos = focus.clone().addScaledVector(perp, c.dist).addScaledVector(dir, -0.6).setY(c.height);
      g.cam.playShot({ focus, pos, fov: c.fov, duration: (pair.a.hitT / speed) + 0.55, blendIn: 0.22, blendOut: 0.5, orbit: c.orbit });
    }
    void ap;
  }

  private endPaired() {
    const e = this.partner;
    this.partner = null;
    this.paired = null;
    if (e) e.exitPaired('circle');
    this.counterPerfect = false;
  }

  // ------------------------------------------------------------------ finishers & takedowns
  tryFinisher() {
    const g = this.game;
    // ground takedown on a downed enemy nearby (free)
    // (a body that is already kneeling / rising on its own is not a ground target any more)
    const downed = this.selectTarget(2.6, (e) => e.state === 'down' && !!e.downRag && e.downRag.headPos(_hp).y < 0.55);
    if (downed) {
      this.startPaired(downed, PAIRS.get('gt_stomp')!, 'takedown');
      this.stats.takedowns++;
      return;
    }
    if (this.charges <= 0) {
      g.hud?.toast('BUILD COMBO FOR FINISHER', '#aaaaaa', 0.8);
      return;
    }
    const e = this.selectTarget(4.0);
    if (!e) return;
    this.charges--;
    this.stats.finishers++;
    // environmental: victim close to a wall/pillar/crates behind it (relative to player)
    const away = new THREE.Vector3(e.x - this.x, 0, e.z - this.z).normalize();
    const surf = g.arena.nearestSurface(e.x, e.z, 1.9);
    let name: string;
    if (surf && surf.normal.dot(away) < -0.35) {
      name = 'env_slam';
      this.envSurface = surf;
    } else if (this.weapon) {
      name = this.weapon.kind === 'club' ? 'fin_weapon_club' : 'fin_weapon_blade';
      if (!PAIRS.get(name)) name = 'fin_roundhouse';
    } else {
      const opts = ['fin_roundhouse', 'fin_armknee', 'fin_palm', 'fin_sweep', 'fin_flyknee'];
      name = pick(opts.filter((o) => o !== this.lastFinisher));
    }
    this.lastFinisher = name;
    const pair = PAIRS.get(name)!;
    this.startPaired(e, pair, 'finisher');
    g.hud?.toast(e.cfg.boss ? 'BRUTAL STRIKE' : 'FINISHER', '#ff5040', 0.9);
  }
  envSurface: ReturnType<Game['arena']['nearestSurface']> = null;

  private onSlam() {
    const g = this.game;
    const e = this.partner;
    if (!e) return;
    const head = new THREE.Vector3();
    e.bodyPoint('head', head);
    const surf = this.envSurface ?? g.arena.nearestSurface(e.x, e.z, 2.5);
    const kind = surf?.obstacle.kind ?? 'wall';
    const hit = g.combat.makeStrike(this, e, { region: 'head', damage: 999, strength: 1.5, bleed: 1.5, kind: 'slam', finisher: true, boneBreak: true });
    if (surf) {
      // blood on the surface where the head hit
      const p = surf.point.clone().setY(head.y);
      hit.point.copy(p).addScaledVector(surf.normal, 0.05);
      g.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.28, 1, 1, surf.normal, null, 0);
      g.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.2, 6, 1, surf.normal, null, 2.5);
      g.blood.splat(p.clone().addScaledVector(surf.normal, 0.02), 0.16, 6, 0.8, surf.normal, null, 1.2);
      g.fx.bloodSpray(hit.point, surf.normal.clone().add(new THREE.Vector3(0, 0.4, 0)).normalize(), 1.6, 3);
      g.fx.dust(p, 1.5);
      if (kind === 'pillar' || kind === 'wall') g.audio.play('metal_hit', { pos: p, vol: 0.5 });
      if (kind === 'crate') {
        g.audio.play('wood_break', { pos: p });
        g.fx.woodBurst(p, 16);
      }
      g.arena.shakeLamps(p.x, p.z, 2);
    }
    const res = e.takeHit(hit);
    g.combat.feedback(this, e, hit, res);
    this.stats.envKills++;
    this.addCombo(1, 'env');
    g.slowMo(0.22, 0.8);
    g.renderer.fx.flash = 0.3;
  }

  private onSweep() {
    const g = this.game;
    const e = this.partner;
    if (!e || !e.alive) return;
    const hit = g.combat.makeStrike(this, e, { region: 'legs', damage: 5, strength: 1.2, bleed: 0, kind: 'kick', knockdown: true, launch: 0.5 });
    hit.dir.set(0, 0, 0).add(new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2)));
    g.audio.play('kick', { pos: hit.point });
    e.hp -= 5;
    e.knockdown(hit);
    e.state = 'paired';
    e.paired = this;
  }

  private onThrowEvent(ev: ClipEvent) {
    const g = this.game;
    const e = this.partner;
    if (!e || !e.alive) return;
    const d = (ev.dir as number[]) ?? [0, 0.5, 1];
    const power = Number(ev.power ?? 7);
    // throw direction: clip-space -> world using player's yaw
    let dirW = new THREE.Vector3(d[0], 0, d[2]);
    const yaw = this.yaw;
    dirW = new THREE.Vector3(dirW.x * Math.cos(yaw) + dirW.z * Math.sin(yaw), 0, -dirW.x * Math.sin(yaw) + dirW.z * Math.cos(yaw));
    // grab throws use input direction if given
    const inDir = this.inputDir();
    if (this.action === 'grab' && inDir) dirW.copy(inDir);
    dirW.normalize();
    const hit = g.combat.makeStrike(this, e, { region: 'chest', damage: e.cfg.needsStun ? 25 : 30, strength: 1.2, bleed: 0.2, kind: 'throw', knockdown: true, launch: power * 0.5 });
    hit.dir.copy(dirW);
    this.endPaired();
    e.hp -= hit.damage;
    if (e.hp <= 0) {
      e.die(hit);
    } else {
      e.knockdown({ ...hit, launch: 0 });
      e.downRag?.launch(dirW.clone().multiplyScalar(power).setY(d[1] * power * 0.6), 4);
      g.thrown.push({ e, t: 0, dir: dirW.clone() });
    }
    g.audio.play('grunt_attack', { pos: _v.set(this.x, 1.5, this.z), vol: 0.6 });
    g.audio.swoosh(0.35, 0.7);
    this.addCombo(1, 'throw');
  }

  private onDisarm() {
    const g = this.game;
    const e = this.partner;
    if (!e) return;
    if (e.weapon) {
      const w = e.weapon;
      w.drop(new THREE.Vector3(Math.sin(this.yaw + 1.2) * 3, 3.5, Math.cos(this.yaw + 1.2) * 3), 14);
      g.audio.play('sword_clash', { pos: _v.set(e.x, 1.2, e.z) });
      g.fx.sparks(_v.set(e.x, 1.2, e.z), new THREE.Vector3(0, 1, 0), 16);
      this.stats.disarms++;
      g.hud?.toast('DISARMED', '#9fd0ff', 0.8);
    }
  }

  // ------------------------------------------------------------------ grab / pickup / throw weapon
  private tryGrabOrPickup() {
    const g = this.game;
    // pick up a weapon at our feet if no enemy is right in front
    const front = this.selectTarget(1.8, (e) => !e.down && !e.cfg.boss);
    const w = g.weapons.find((x) => x.pickable && x.worldPos(_v).distanceTo(_v2.set(this.x, _v.y, this.z)) < 1.4);
    if (w && (!front || this.distTo(front) > 1.4)) {
      if (this.weapon) this.weapon.drop(new THREE.Vector3(0, 1, 0));
      w.attach(this);
      this.weapon = w;
      g.audio.play('block', { pos: _v.set(this.x, 1, this.z), vol: 0.5 });
      g.hud?.toast(`${w.kind.toUpperCase()} EQUIPPED`, '#cfcfcf', 0.8);
      return;
    }
    if (!front) return;
    if (front.cfg.needsStun && front.state !== 'stunned') {
      g.hud?.toast('TOO STRONG - STUN FIRST', '#ff9050', 0.8);
      return;
    }
    if (front.weapon && front.state === 'attack') return;
    this.grabT = 0;
    this.startPaired(front, PAIRS.get('grab_hold')!, 'grab');
    front.state = 'grabbed';
  }

  private doGrab(dt: number) {
    const g = this.game;
    const inp = g.input;
    this.grabT += dt;
    const e = this.partner;
    if (!e || !e.alive) {
      this.endPaired();
      this.toFree();
      return;
    }
    const c = this.clip;
    const holding = c?.clip.name === 'grab_hold_a';
    if (!holding && c && (c.done || c.time >= c.clip.recoverT)) {
      // back to holding
      this.startPaired(e, PAIRS.get('grab_hold')!, 'grab');
      e.state = 'grabbed';
      return;
    }
    if (holding) {
      if (inp.consume('attack', 0.3)) {
        this.startPaired(e, PAIRS.get('grab_knee')!, 'grab');
        e.state = 'grabbed';
        return;
      }
      if (inp.consume('grab', 0.3) || inp.consume('throw', 0.3) || this.grabT > 3.2) {
        // aim throw: face input direction first
        const dir = this.inputDir();
        if (dir) this.yaw = yawFromDir(dir.x, dir.z);
        this.startPaired(e, PAIRS.get('grab_throw')!, 'grab');
        e.state = 'grabbed';
        return;
      }
      if (inp.consume('dodge', 0.3)) {
        this.endPaired();
        this.doDodge();
        return;
      }
    }
  }

  private throwWeapon() {
    const g = this.game;
    if (!this.weapon) return;
    const t = this.selectTarget(12);
    const w = this.weapon;
    const dir = t ? new THREE.Vector3(t.x - this.x, 0, t.z - this.z).normalize() : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    if (t) this.yaw = yawFromDir(dir.x, dir.z);
    this.play('cross', { halflife: 0.06, speed: 1.2 });
    this.action = 'throwing';
    this.curMove = null;
    this.weaponMove = null;
    setTimeout(() => {
      if (w.holder !== this) return;
      w.drop(dir.clone().multiplyScalar(16).setY(2.2), 25);
      w.thrown = { target: t, t: 0 };
      this.weapon = null;
      g.audio.swoosh(0.3, 1.2);
    }, 110);
  }

  // ------------------------------------------------------------------ dodge / vault
  doDodge() {
    const g = this.game;
    const dir = this.inputDir();
    this.vx = this.vz = 0;
    // perfect dodge: an attack about to land
    const imminent = g.director.imminent(0.28);
    // vault over an enemy in the input direction (or directly in front)
    const vaultT = this.selectTarget(2.4, (e) => !e.down && e.state !== 'attack');
    if (vaultT && dir && Math.abs(angleDiff(yawFromDir(dir.x, dir.z), yawFromDir(vaultT.x - this.x, vaultT.z - this.z))) < 0.6 && this.distTo(vaultT) < 2.3) {
      const yaw = yawFromDir(vaultT.x - this.x, vaultT.z - this.z);
      this.paired = vaultT;
      this.play('p_vault', { originYaw: yaw, halflife: 0.06, aim: this.aimAt(vaultT), speed: 1.1 });
      this.action = 'vault';
      this.invuln = 0.6;
      vaultT.vaultedOver();
      setTimeout(() => {
        if (this.paired === vaultT && this.action !== 'counter') this.paired = null;
      }, 400);
      this.stateTime = 0;
      this.stats.dodges++;
      g.director.note('dodges');
      return;
    }
    let clip = 'p_dodge_back';
    let yaw = this.yaw;
    if (dir) {
      // pick side/back relative to current facing (keep facing towards threats)
      const rel = angleDiff(this.yaw, yawFromDir(dir.x, dir.z));
      if (Math.abs(rel) < 0.7) {
        // forward input: dodge sideways relative to camera to avoid running into attacks
        clip = chance(0.5) ? 'p_dodge_side' : 'p_dodge_side_m';
      } else if (Math.abs(rel) > 2.3) clip = 'p_dodge_back';
      else clip = rel > 0 ? 'p_dodge_side' : 'p_dodge_side_m';
    }
    if (imminent) {
      const att = imminent.enemy;
      yaw = yawFromDir(att.x - this.x, att.z - this.z);
    }
    this.play(clip, { originYaw: yaw, halflife: 0.05, speed: 1.1 });
    this.action = 'dodge';
    this.invuln = 0.36;
    this.stateTime = 0;
    this.stats.dodges++;
    g.director.note('dodges');
    if (imminent) {
      this.stats.perfectDodges++;
      g.slowMo(0.3, 0.45);
      g.hud?.toast('PERFECT DODGE', '#8fe8ff', 0.7);
      imminent.enemy.stun = Math.max(imminent.enemy.stun, 0.8);
      this.addCombo(0, 'pdodge');
      this.comboTimer = Math.max(this.comboTimer, 2.0);
    }
  }

  // ------------------------------------------------------------------ getting hit
  takeHit(h: HitInfo): HitResult {
    const g = this.game;
    if (!this.alive) return 'ignored';
    if (this.invuln > 0 || this.isLocked()) return 'dodged';
    const inp = g.input;
    const blocking = (this.action === 'free' && inp.isHeld('block') && this.guard > 5) || (this.action === 'hit' && inp.isHeld('block'));
    const attacker = h.attacker as Fighter | null;
    const facing = attacker ? Math.abs(this.angleTo(attacker)) < 1.6 : true;
    if (blocking && !h.unblockable && facing) {
      this.guard -= 18 + h.damage * 1.8;
      this.hp -= h.damage * 0.15;
      this.stats.blocks++;
      g.director.note('blocks');
      if (this.guard <= 0) {
        // guard break
        this.guard = 0;
        this.play('p_hit', { halflife: 0.05, originYaw: attacker ? yawFromDir(attacker.x - this.x, attacker.z - this.z) : this.yaw });
        this.action = 'hit';
        g.hud?.toast('GUARD BROKEN', '#ff6a40', 0.8);
        return 'hit';
      }
      this.play('p_block_hit', { halflife: 0.05, originYaw: attacker ? yawFromDir(attacker.x - this.x, attacker.z - this.z) : this.yaw });
      this.action = 'hit';
      this.stateTime = 0;
      return 'blocked';
    }
    this.hp -= h.damage;
    this.stats.damageTaken += h.damage;
    this.regenDelay = 4;
    g.director.note('hitsTaken');
    this.breakCombo();
    g.renderer.fx.red = Math.min(1, g.renderer.fx.red + 0.5);
    if (this.grabT > 0 && this.action === 'grab') this.endPaired();
    if (this.partner) this.endPaired();
    if (this.hp <= 0) {
      this.hp = 0;
      this.playerDeath(h);
      return 'killed';
    }
    const yaw = attacker ? yawFromDir(attacker.x - this.x, attacker.z - this.z) : this.yaw;
    if (h.knockdown || h.strength >= 1.3) {
      this.play('p_knockdown', { halflife: 0.05, originYaw: yaw });
      this.action = 'down';
      this.invuln = 1.6;
    } else {
      this.play(h.region === 'gut' || h.region === 'chest' ? 'p_hit_gut' : 'p_hit', { halflife: 0.05, originYaw: yaw });
      this.action = 'hit';
    }
    this.stateTime = 0;
    return 'hit';
  }

  private playerDeath(h: HitInfo) {
    const g = this.game;
    this.action = 'dead';
    if (this.weapon) this.weapon.drop(new THREE.Vector3(0, 2, 0));
    const imp = g.combat.impulseFor(h, 70);
    g.death.kill(this, 'player', imp, h.point, h.dir.clone().multiplyScalar(2).setY(1));
    g.onPlayerDeath();
  }

  /** Vulnerable, bleeding/bruised appearance as health drops. */
  postAnimate() {
    if (this.weapon && this.weapon.holder !== this) this.weapon = null;
    void B;
    void rand;
  }
}

import type { Game } from '../game';
