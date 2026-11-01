import * as THREE from 'three';
import type { Game } from '../game';
import type { Enemy } from './enemy';
import { ENEMY_ATTACKS, EnemyAttack } from '../combat/moves';
import { chance, pick, rand } from '../core/math';
import { Projectiles } from '../combat/projectiles';
import { makeHit } from '../combat/types';
import { DIFFICULTY } from '../core/settings';
import { B } from '../anim/skeleton';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * What makes a boss a boss rather than a thug with more health:
 *  - scripted combos that mix counterable (gold) and dodge-only (red) strikes, by phase;
 *  - early counters don't work on them: only a perfect counter lands (and stuns them for a
 *    punish window), anything sooner is read and punished;
 *  - poise: a flurry gets them to break away instead of eating hit after hit;
 *  - signature moves with their own telegraphs (Viper's thrown knives and vanishing strike,
 *    Kael's flying knee and chi shockwave), phases that change the fight.
 */
export abstract class BossBrain {
  /** Tallies for tuning (test=waves&boss=1 prints them). */
  stats: Record<string, number> = {};
  count(k: string, n = 1) {
    this.stats[k] = (this.stats[k] ?? 0) + n;
  }
  /** Game times of recent hits taken (poise). */
  protected hurt: number[] = [];
  /** A perfect counter landed: stun the boss as the paired move lets go of it. */
  stunAfterPaired = 0;
  protected cd: Record<string, number> = {};
  constructor(public e: Enemy, public game: Game) {}

  get phase() {
    return this.e.phase;
  }
  protected ready(k: string) {
    return (this.cd[k] ?? 0) <= 0;
  }
  protected busy() {
    const s = this.e.state;
    return s !== 'circle' && s !== 'approach' && s !== 'taunt' && s !== 'retreat';
  }
  update(dt: number) {
    for (const k in this.cd) this.cd[k] -= dt;
    this.aura(dt);
  }
  /** While circling: start a signature move instead (true = took over this frame). */
  circle(_dt: number): boolean {
    return false;
  }
  abstract combos(): string[][];
  /** The director allowed an attack: pick this phase's combo. */
  beginCombo() {
    const c = pick(this.combos());
    this.e.attackDef = ENEMY_ATTACKS[c[0]];
    this.e.comboQueue = c.slice(1);
    this.e.attackCombo = c.length;
  }
  /** A combo of `n` strikes just finished. */
  comboEnded(_n: number) {}
  /** The boss just slipped one of the player's strikes. */
  onEvaded() {}
  /** Hit by the player (damage already applied): true = the brain handles the reaction. */
  onHurt(): boolean {
    const now = this.game.time;
    this.hurt.push(now);
    this.hurt = this.hurt.filter((t) => now - t < 1.6);
    return false;
  }
  /** The player countered too early: punish it. */
  abstract onBadCounter(): void;
  /** The player landed a perfect counter. */
  onCountered() {
    this.count('perfectCounter');
    this.stunAfterPaired = 1.25;
  }
  /** Contact of a special attack (instead of a melee hit). */
  special(_a: EnemyAttack) {}
  phaseChange(_next: number) {}
  protected aura(_dt: number) {}

  /** Hand position (world) for throws / effects. */
  protected hand(out: THREE.Vector3) {
    return this.e.anim.boneWorld(B.handR, out);
  }
  /** Shout a line on the HUD. */
  protected say(text: string, color = '#ff5040', dur = 1.2) {
    this.game.hud?.toast(text, color, dur);
  }
}

// =========================================================================== VIPER
/**
 * Viper: never where you hit. She slips half your strikes and slashes back out of the dodge,
 * throws knives from range (red: dodge them, a raised guard eats one), and from phase two
 * vanishes in a puff of smoke to strike from behind. Her blade is poisoned.
 */
export class ViperBrain extends BossBrain {
  private vanishT = -1;
  constructor(e: Enemy, game: Game) {
    super(e, game);
    this.cd.throw = 3.5;
    this.cd.vanish = 6;
  }
  combos() {
    if (this.phase === 1)
      return [
        ['viper_slash', 'viper_slash', 'viper_stab_r'],
        ['lunge', 'viper_slash'],
        ['viper_slash', 'elite_round'],
        ['viper_slash', 'viper_slash', 'viper_slash'],
      ];
    return [
      ['viper_slash', 'viper_slash', 'viper_slash', 'viper_stab_r'],
      ['elite_round', 'viper_slash', 'viper_stab_r'],
      ['lunge', 'viper_slash', 'viper_slash', 'elite_spin'],
      ['viper_slash', 'viper_stab_r', 'viper_slash'],
    ];
  }
  circle(dt: number) {
    const e = this.e, g = this.game, p = g.player;
    if (this.vanishT >= 0) {
      this.vanishT -= dt;
      e.vx = e.vz = 0;
      if (this.vanishT < 0) this.reappear();
      return true;
    }
    if (!p.alive) return false;
    const d = e.distTo(p);
    if (this.ready('throw') && d < 10) {
      this.cd.throw = this.phase === 1 ? rand(4, 6.5) : rand(2.8, 4.5);
      const n = this.phase === 1 ? (chance(0.35) ? 2 : 1) : chance(0.5) ? 3 : 2;
      const volley = () => {
        if (!e.alive || this.busy()) return;
        e.bossAttack('viper_throw', { queue: Array(n - 1).fill('viper_throw') });
        this.count('throwVolleys');
      };
      if (d > 3.4) volley();
      else {
        // too close to throw: a backflip out of reach first
        e.bossPlay('r_dodge_back', 'dodge');
        e.invuln = 0.45;
        this.game.later(0.42, volley);
      }
      return true;
    }
    if (this.phase >= 2 && this.ready('vanish') && d < 9) {
      this.cd.vanish = rand(7, 10);
      this.vanish();
      return true;
    }
    return false;
  }
  private vanish() {
    const e = this.e, g = this.game;
    this.count('vanish');
    g.director.cancel(e);
    _v.set(e.x, 0.9, e.z);
    g.fx.dust(_v, 4);
    g.fx.dust(_v.setY(0.3), 3);
    g.audio.play('whoosh_heavy', { pos: _v, vol: 0.9, pitch: 0.7 });
    e.model.group.visible = false;
    e.invuln = 1.2;
    this.vanishT = 0.6;
  }
  private reappear() {
    const e = this.e, g = this.game, p = g.player;
    // behind the player (relative to the way they face), a stride away
    const a = p.yaw + Math.PI + rand(-0.6, 0.6);
    let x = p.x + Math.sin(a) * 1.7, z = p.z + Math.cos(a) * 1.7;
    [x, z] = g.arena.collide(x, z, e.radius, false);
    e.x = x;
    e.z = z;
    e.yaw = Math.atan2(p.x - x, p.z - z);
    e.anim.initAt(x, z, e.yaw);
    e.model.group.visible = true;
    e.invuln = 0;
    _v.set(x, 0.9, z);
    g.fx.dust(_v, 4);
    g.audio.play('whoosh_heavy', { pos: _v, vol: 1, pitch: 1.3 });
    e.bossAttack('viper_stab_r', { tell: 0.62 });
  }
  onEvaded() {
    this.count('evaded');
    // out of the dodge, straight back in
    if (chance(0.6)) this.game.later(0.3, () => this.e.alive && !this.busy() && this.e.bossAttack('viper_slash', { tell: 0.42 }));
  }
  onHurt() {
    super.onHurt();
    const e = this.e;
    if (e.state === 'stunned' || this.hurt.length < 2) return false;
    this.hurt.length = 0;
    this.count('breakaway');
    // two in a row is enough: she's gone
    if (this.phase >= 2 && chance(0.5)) this.vanish();
    else {
      e.bossPlay('r_dodge_back', 'dodge');
      e.invuln = 0.45;
      this.game.later(0.4, () => e.alive && !this.busy() && e.bossAttack('viper_throw', { tell: 0.45 }));
    }
    return true;
  }
  onBadCounter() {
    const e = this.e;
    this.count('badCounter');
    this.say('VIPER SLIPS IT — PERFECT COUNTERS ONLY', '#7dffa8');
    e.bossPlay('r_dodge_back', 'dodge');
    e.invuln = 0.45;
    this.game.later(0.42, () => e.alive && !this.busy() && e.bossAttack('viper_throw', { tell: 0.5 }));
  }
  special(a: EnemyAttack) {
    if (a.special !== 'knife_throw') return;
    const g = this.game, p = g.player, e = this.e;
    this.hand(_v);
    p.bodyPoint('chest', _w);
    const speed = 17;
    const t = Projectiles.flightTime(_v, _w, speed);
    // lead the target a little (not perfectly: sidestepping works)
    _w.x += p.vx * t * 0.5;
    _w.z += p.vz * t * 0.5;
    g.projectiles.throwKnife(e, _v.clone(), _w.clone(), speed, a.damage * (1 + Math.min(0.36, (g.director.wave - 1) * 0.04)), a.bleed ?? 0.6, !!a.venom);
  }
  phaseChange(next: number) {
    if (next === 2) this.say('VIPER — PHASE 2: NOWHERE IS SAFE', '#7dffa8', 1.8);
    this.cd.vanish = 2.5;
  }
  protected aura() {
    this.e.model.uniforms.uRim.value.set(0.25, 1, 0.45, this.phase === 1 ? 0.4 : 0.7);
  }
}

// =========================================================================== KAEL
/**
 * Grandmaster Kael: a wall. He guards most strikes, reverses early counters with a palm you
 * must dodge, and answers a flurry by breaking away. His combos mix gold and red; the second
 * phase brings a sword and a flying knee from across the floor, the third his fury: five-strike
 * strings and a chi shockwave that blasts everyone near him, minions included. Only after the
 * shockwave or a full fury string does he run out of breath - that's your window.
 */
export class KaelBrain extends BossBrain {
  private emberT = 0;
  constructor(e: Enemy, game: Game) {
    super(e, game);
    this.cd.fly = 5;
    this.cd.shock = 3;
  }
  combos() {
    if (this.phase === 1)
      return [
        ['elite_jab', 'elite_cross', 'kael_round_r'],
        ['elite_hook', 'elite_jab', 'kael_side_r'],
        ['elite_cross', 'elite_round', 'elite_jab'],
        ['elite_jab', 'elite_jab', 'elite_cross', 'kael_palm_r'],
      ];
    if (this.phase === 2)
      return [
        ['sword_slash', 'sword_slash', 'sword_spin'],
        ['elite_jab', 'sword_slash', 'kael_round_r'],
        ['sword_slash', 'elite_cross', 'sword_slash', 'kael_side_r'],
        ['elite_hook', 'sword_slash', 'sword_slash', 'kael_palm_r'],
      ];
    return [
      ['elite_jab', 'elite_cross', 'elite_hook', 'kael_side_r', 'sword_spin'],
      ['sword_slash', 'sword_slash', 'elite_round', 'sword_slash', 'kael_round_r'],
      ['elite_jab', 'sword_slash', 'elite_cross', 'sword_slash', 'kael_palm_r'],
    ];
  }
  circle() {
    const e = this.e, p = this.game.player;
    if (!p.alive) return false;
    const d = e.distTo(p);
    if (this.phase >= 2 && this.ready('fly') && d > 4.2 && d < 8.5) {
      this.cd.fly = rand(6, 9);
      e.bossAttack('elite_fly', { tell: 0.6 });
      return true;
    }
    if (this.phase === 3 && this.ready('shock') && d < 3.8) {
      this.cd.shock = rand(10, 14);
      this.say('KAEL GATHERS HIS CHI — GET CLEAR', '#ffb040', 1.2);
      e.bossAttack('kael_shockwave');
      return true;
    }
    return false;
  }
  comboEnded(n: number) {
    if (n >= 5 && chance(0.6)) this.exhausted(1.8);
  }
  private exhausted(sec: number) {
    this.count('exhausted');
    this.game.later(0.15, () => {
      if (!this.e.alive || this.e.paired) return;
      this.e.stunNow(sec);
      this.say('KAEL IS EXHAUSTED — PUNISH HIM', '#ffd24a', 1.0);
    });
  }
  onHurt() {
    super.onHurt();
    const e = this.e;
    if (e.state === 'stunned' || this.hurt.length < 3) return false;
    this.hurt.length = 0;
    this.count('breakaway');
    // a flurry: he breaks away - a palm to push you off, or a step out of range
    if (chance(0.55)) e.bossAttack('kael_palm_r', { tell: 0.4 });
    else {
      e.bossPlay('r_dodge_back', 'dodge');
      e.invuln = 0.4;
    }
    return true;
  }
  onBadCounter() {
    const e = this.e;
    this.count('badCounter');
    this.say('KAEL REVERSES — PERFECT COUNTERS ONLY', '#ffb040');
    e.bossPlay('r_block', 'block');
    this.game.later(0.22, () => e.alive && !e.paired && e.state === 'block' && e.bossAttack('kael_palm_r', { tell: 0.42 }));
  }
  special(a: EnemyAttack) {
    if (a.special !== 'shockwave') return;
    const g = this.game, e = this.e, p = g.player;
    const R = 3.6;
    const c = new THREE.Vector3(e.x, 0.15, e.z);
    // the blast: dust ring, light, sound
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      g.fx.dust(new THREE.Vector3(e.x + Math.sin(ang) * 1.2, 0.1, e.z + Math.cos(ang) * 1.2), 2);
    }
    g.fx.impactFlash(c.clone().setY(1.0), 2.2, [1, 0.75, 0.4]);
    g.cam.addTrauma(0.75);
    g.cam.fovKick = -6;
    g.audio.thump(1.5, c);
    g.audio.play('body_fall', { pos: c, vol: 1 });
    g.arena.shakeLamps(e.x, e.z, 2.5);
    g.renderer.fx.chroma = Math.max(g.renderer.fx.chroma, 1.2);
    const mods = DIFFICULTY[g.settings.difficulty] ?? DIFFICULTY.fighter;
    // the player
    const dp = Math.hypot(p.x - e.x, p.z - e.z);
    if (p.alive && dp < R) {
      const dir = new THREE.Vector3(p.x - e.x, 0, p.z - e.z).normalize();
      p.bodyPoint('chest', _v);
      const h = makeHit({ dir, point: _v.clone(), damage: a.damage * mods.damage * (1 - (dp / R) * 0.4), strength: 1.5, kind: 'palm', region: 'chest', unblockable: true, knockdown: true, attacker: e, bleed: 0.2 });
      const res = p.takeHit(h);
      if (res !== 'dodged' && res !== 'ignored') g.combat.feedback(e, p, h, res);
    }
    // anyone else near him goes flying too
    for (const o of g.enemies()) {
      if (o === e || !o.alive || o.down || o.paired) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d > R) continue;
      const dir = new THREE.Vector3(o.x - e.x, 0, o.z - e.z).normalize();
      o.bodyPoint('chest', _v);
      o.takeHit(makeHit({ dir, point: _v.clone(), damage: 18, strength: 1.4, kind: 'palm', region: 'chest', knockdown: true, launch: 4, attacker: e }));
    }
    this.exhausted(2.3);
  }
  phaseChange(next: number) {
    if (next === 2) this.say('KAEL DRAWS HIS BLADE', '#ffb040', 1.8);
    else this.say('KAEL — FURY', '#ff3020', 2.0);
    this.cd.fly = 2;
    this.cd.shock = 2.5;
  }
  protected aura(dt: number) {
    const u = this.e.model.uniforms.uRim.value;
    if (this.phase < 3) u.set(1, 0.8, 0.25, this.phase === 1 ? 0.35 : 0.6);
    else {
      // fury: a red glow and embers coming off him
      u.set(1, 0.22, 0.08, 0.85 + Math.sin(this.game.time * 9) * 0.12);
      this.emberT -= dt;
      if (this.emberT <= 0 && this.e.model.group.visible) {
        this.emberT = 0.12;
        this.e.anim.boneWorld(chance(0.5) ? B.chest : B.hips, _v);
        _v.x += rand(-0.25, 0.25);
        _v.z += rand(-0.25, 0.25);
        this.game.fx.sparks(_v, new THREE.Vector3(0, 1, 0), 2);
      }
    }
  }
}

/** Brain for a boss archetype (the Butcher keeps his brute's instincts). */
export function brainFor(e: Enemy, game: Game): BossBrain | null {
  if (e.cfg.key === 'viper') return new ViperBrain(e, game);
  if (e.cfg.key === 'master') return new KaelBrain(e, game);
  return null;
}
