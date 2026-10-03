import * as THREE from 'three';
import { FlameArrow } from '../../sukuna/SukunaFX';
import { SD } from '../core/SD';
import { Animator, Clip } from '../char/Anim';
import { buildSukuna } from '../char/Characters';
import type { CharModel } from '../char/Model';
import { BLOCK, DODGE, DOWN, GET_UP, HIT_HEAVY, HIT_LIGHT, KNEEL, LAUNCHED, SK_AXE, SK_CLEAVE, SK_DISMANTLE, SK_DISMANTLE_L, SK_FUGA, SK_GUARD, SK_HOOK, SK_IDLE, SK_JAB, SK_KICK, SK_LAUGH, SK_UPPER, SK_WCS, airPose, runCycle, walkCycle } from '../char/Poses';
import { Combatant, Hit, HitKind, HitResult, makeHit } from './Combat';
import { Fighter } from './Fighter';
import type { Player } from './Player';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const chance = (p: number) => Math.random() < p;

interface Strike {
  clip: Clip;
  dmg: number;
  reach: number;
  /** forward rush speed during windup */
  lunge: number;
  knock: number;
  lift: number;
  stun: number;
  kind: HitKind;
  launch?: boolean;
  /** Domain Amplification on this blow (Infinity can't stop it) */
  da?: number;
  /** ground slam: shockwave around the impact */
  slam?: boolean;
}

const STRIKES: Record<string, Strike> = {
  jab: { clip: SK_JAB, dmg: 38, reach: 2.4, lunge: 7, knock: 4, lift: 0, stun: 0.25, kind: 'punch' },
  hook: { clip: SK_HOOK, dmg: 52, reach: 2.3, lunge: 6, knock: 8, lift: 1, stun: 0.35, kind: 'punch' },
  upper: { clip: SK_UPPER, dmg: 78, reach: 2.2, lunge: 5, knock: 3, lift: 15, stun: 0.6, kind: 'punch', launch: true, da: 0.6 },
  kick: { clip: SK_KICK, dmg: 72, reach: 2.7, lunge: 6, knock: 20, lift: 4, stun: 0.5, kind: 'kick', launch: true, da: 0.3 },
  axe: { clip: SK_AXE, dmg: 96, reach: 2.6, lunge: 8, knock: 6, lift: 2, stun: 0.6, kind: 'kick', da: 0.7, slam: true },
  cleave: { clip: SK_CLEAVE, dmg: 130, reach: 2.6, lunge: 9, knock: 10, lift: 2, stun: 0.6, kind: 'cleave' },
};
const COMBOS: string[][] = [
  ['jab', 'hook', 'kick'],
  ['jab', 'jab', 'upper'],
  ['hook', 'axe'],
  ['jab', 'hook', 'cleave'],
  ['kick'],
  ['jab', 'upper'],
];

type State = 'cine' | 'idle' | 'move' | 'dash' | 'strike' | 'cast' | 'hit' | 'launched' | 'down' | 'getup' | 'dodge' | 'stunned' | 'dead';

interface Slash {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  axis: THREE.Vector3;
  len: number;
  life: number;
  dmg: number;
  hit: boolean;
}

export interface Difficulty {
  name: string;
  hp: number;
  dmg: number;
  /** delay before reacting / between actions */
  think: number;
  aggression: number;
  dodge: number;
  /** Domain Amplification chance multiplier */
  da: number;
}
export const DIFFICULTY: Record<string, Difficulty> = {
  normal: { name: 'NORMAL', hp: 3200, dmg: 0.75, think: 0.55, aggression: 0.6, dodge: 0.15, da: 0.6 },
  hard: { name: 'HARD', hp: 4200, dmg: 1.0, think: 0.38, aggression: 0.8, dodge: 0.28, da: 1 },
  strongest: { name: 'THE STRONGEST', hp: 5200, dmg: 1.3, think: 0.24, aggression: 1, dodge: 0.42, da: 1.3 },
};

/**
 * Ryomen Sukuna in Megumi's body: arrogant footwork, Domain-Amplified
 * blows, Dismantle volleys, Cleave and Fuga, dodges, hit reactions.
 */
export class Boss implements Combatant {
  readonly name = '両面宿儺';
  readonly f: Fighter;
  readonly model: CharModel;
  readonly anim: Animator;
  hp: number;
  readonly maxHp: number;
  alive = true;
  state: State = 'idle';
  stateT = 0;
  private think = 0.6;
  private combo: string[] = [];
  private strike: Strike | null = null;
  private struck = false;
  private castName = '';
  poise = 100;
  /** cooldowns */
  readonly cd = { dismantle: 2, cleave: 3, fuga: 14, dash: 0, dodge: 0, laugh: 8, wcs: 4 };
  /** world-cutting slash in progress: plane, damage taken during the chant */
  private wcs: { vertical: boolean; n: THREE.Vector3; d: number; taken: number; locked: boolean } | null = null;
  /** set-piece hooks: return true to take over (domain, Mahoraga, World-Cutting Slash) */
  onThreshold: ((hpFrac: number) => boolean) | null = null;
  onEvent: ((name: string, data?: any) => void) | null = null;
  private slashes: Slash[] = [];
  private arrow: FlameArrow;
  private arrowFlight: { pos: THREE.Vector3; vel: THREE.Vector3; life: number } | null = null;
  private wish = new THREE.Vector3();
  private moveGoal = new THREE.Vector3();
  private moveSpeed = 0;
  private daGlow = 0;
  private strafeDir = 1;
  /** current yaw (model faces +Z at yaw 0) */
  yaw = 0;
  /** can't be hurt (cinematics) */
  invulnerable = false;
  /** take no knockback (big casts) */
  armor = 0;
  readonly diff: Difficulty;
  /** cursed energy for techniques (phase gating handled outside) */
  phase = 1;
  private volley = 0;
  private volleyT = 0;
  private stunT = 0;
  /** seconds until the face relaxes */
  private exprT = 0;

  constructor(
    x: number,
    z: number,
    readonly player: Player,
    diff: Difficulty,
  ) {
    this.diff = diff;
    this.maxHp = this.hp = diff.hp;
    this.f = new Fighter(0.36, 1.72, x, z);
    this.f.gravity = 26;
    this.model = buildSukuna();
    SD.scene.add(this.model.group);
    this.anim = new Animator(this.model, SK_IDLE, { walk: (p) => walkCycle(p, 1.4), run: runCycle, air: airPose });
    this.anim.walkSpeed = 3.6;
    this.arrow = new FlameArrow(SD.fx.glowTex);
    SD.scene.add(this.arrow.group);
    this.f.onCrash = (c) => {
      SD.fx.crater(c.point, c.normal, 2.5 + c.speed * 0.15);
      SD.audio?.play('crash', { x: c.point.x, y: c.point.y, z: c.point.z, volume: 1.2 });
      SD.onomato?.('ドガァ', c.point, 1.3);
      this.player.cam.shake(Math.max(0.15, 0.7 - c.point.distanceTo(this.player.eye) * 0.01));
      if (!this.invulnerable) this.hp -= Math.min(70, c.speed * 2.2);
      SD.world?.crash(c.point, c.normal, c.speed, c.collider);
      if (c.kind === 'wall') {
        this.f.vel.multiplyScalar(0.25);
        this.f.vel.y = Math.min(this.f.vel.y, 2);
      }
      this.onEvent?.('crash', c);
    };
    this.f.onLand = (s) => {
      if (s > 9) SD.fx.dustRing(this.f.pos.x, this.f.pos.y, this.f.pos.z, 1.6, 12, 4);
    };
    this.yaw = Math.atan2(player.f.pos.x - x, player.f.pos.z - z);
  }

  aim(out: THREE.Vector3) {
    return out.set(this.f.pos.x, this.f.pos.y + 1.25, this.f.pos.z);
  }

  /** world position of a hand (for effects) */
  handPos(side: 'L' | 'R', out: THREE.Vector3) {
    this.model.group.updateMatrixWorld(true);
    return this.model.bone(side === 'L' ? 'handL' : 'handR').getWorldPosition(out);
  }

  private toPlayer(out: THREE.Vector3) {
    return out.subVectors(this.player.f.pos, this.f.pos);
  }

  private dist() {
    const d = this.toPlayer(_v);
    return Math.hypot(d.x, d.z);
  }

  private set(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  /** Freeze (Infinite Void, cinematics) */
  stunFor(t: number) {
    this.stunT = Math.max(this.stunT, t);
    this.set('stunned');
    this.anim.stop();
    this.combo = [];
    this.strike = null;
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.stateT += dt;
    for (const k of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.poise = Math.min(100, this.poise + dt * 22);
    this.armor = Math.max(0, this.armor - dt);
    this.daGlow = Math.max(0, this.daGlow - dt * 3);
    if (this.exprT > 0) {
      this.exprT -= dt;
      if (this.exprT <= 0 && this.alive && this.model.expr === 'hurt') this.model.setExpr('neutral');
    }
    if (this.alive && this.state !== 'cine' && this.state !== 'dead') this.brain(dt);
    // movement
    const f = this.f;
    let accel = 12;
    if (this.state === 'move' || this.state === 'idle') {
      // already set this.wish
    } else if (this.state === 'strike' && this.strike && this.stateT < 0.12) {
      // lunge toward the player during windup
      const d = this.toPlayer(_v);
      d.y = 0;
      const dist = d.length();
      const want = Math.max(0, dist - (this.strike.reach - 0.6));
      this.wish.copy(d.normalize()).multiplyScalar(Math.min(this.strike.lunge * 3, want / 0.12));
      accel = 30;
    } else if (this.state === 'dash') {
      accel = 40;
    } else if (this.state !== 'launched') this.wish.set(0, 0, 0);
    f.step(dt, this.state === 'launched' || this.state === 'stunned' ? null : this.wish, accel, accel * 0.3);
    if (this.state === 'launched' && !f.launched && f.grounded) {
      this.set('down');
      this.anim.stop(false);
      this.anim.stance = DOWN;
    }
    // facing: turn toward the player unless committed
    const committed = this.state === 'launched' || this.state === 'down' || this.state === 'stunned' || (this.state === 'strike' && this.stateT > 0.12) || this.state === 'dead';
    if (!committed) {
      const d = this.toPlayer(_v);
      const want = Math.atan2(d.x, d.z);
      let diff = want - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * (1 - Math.exp(-dt * (this.state === 'strike' ? 18 : 9)));
    }
    this.model.group.position.copy(f.pos);
    this.model.group.rotation.y = this.yaw;
    // animation inputs: local move direction
    const hs = Math.hypot(f.vel.x, f.vel.z);
    this.anim.speed = this.state === 'launched' || this.state === 'down' || this.state === 'stunned' ? 0 : hs;
    this.anim.grounded = f.grounded || this.state === 'down';
    this.anim.vy = f.vel.y;
    this.anim.look = this.state === 'down' || this.state === 'launched' || this.state === 'dead' ? null : this.player.eye;
    this.anim.update(dt);
    this.updateSlashes(dt);
    this.updateArrow(dt);
    // Domain Amplification: a dark aura round the striking limbs
    if (this.daGlow > 0) {
      for (const side of ['L', 'R'] as const) {
        const p = this.handPos(side, _v2);
        for (let i = 0; i < 2; i++) SD.fx.ink.emit(p.x + rnd(-0.1, 0.1), p.y + rnd(-0.1, 0.1), p.z + rnd(-0.1, 0.1), rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1), rnd(0.2, 0.4), rnd(0.08, 0.16), 0.02, 0.02, 0.0, 0.02, 0.8 * this.daGlow, 0.15, 0, 0.02, 0, 1, -0.2);
      }
    }
  }

  // ------------------------------------------------------------------ AI
  private brain(dt: number) {
    const st = this.state;
    if (st === 'stunned') {
      this.stunT -= dt;
      if (this.stunT <= 0) this.set('idle');
      return;
    }
    if (st === 'hit') {
      if (this.stateT > 0.42) this.set('idle');
      return;
    }
    if (st === 'launched') {
      this.anim.stance = LAUNCHED;
      return;
    }
    if (st === 'down') {
      if (this.stateT > 0.7) {
        this.set('getup');
        this.anim.stance = SK_GUARD;
        this.anim.play(GET_UP);
      }
      return;
    }
    if (st === 'getup') {
      if (this.stateT > 0.45) {
        this.set('idle');
        this.think = 0.15;
      }
      return;
    }
    if (st === 'dodge') {
      if (this.stateT > 0.32) {
        this.set('idle');
        this.think = 0.05;
      }
      return;
    }
    if (st === 'strike') return this.runStrike();
    if (st === 'cast') return this.runCast(dt);
    if (st === 'dash') {
      if (this.stateT > 0.26 || this.dist() < 2.6) {
        this.f.vel.multiplyScalar(0.3);
        this.set('idle');
        this.think = 0;
        if (this.dist() < 4) this.beginCombo();
      }
      return;
    }
    // idle / move: footwork and decisions
    const dist = this.dist();
    this.anim.stance = dist < 7 ? SK_GUARD : SK_IDLE;
    this.react();
    if (this.state !== 'idle' && this.state !== 'move') return;
    this.think -= dt;
    this.footwork(dist, dt);
    if (this.think > 0) return;
    if (this.onThreshold?.(this.hp / this.maxHp)) return;
    this.decide(dist);
  }

  /** Reacting to what Gojo is doing. */
  private react() {
    const p = this.player;
    const dist = this.dist();
    // Hollow Purple charging: break it up or get out of the line
    if (p.act === 'purple' && this.cd.dash <= 0) {
      if (dist < 25 && chance(0.6 * this.diff.aggression)) {
        this.dashTo(p.f.pos, 0);
        return;
      }
      if (this.cd.dismantle <= 0) this.startDismantle(3);
      return;
    }
    // a Black Flash winding up in his face: hit first or step out
    if (p.act === 'charge' && dist < 4 && this.cd.dodge <= 0 && chance(this.diff.dodge * 0.08)) {
      this.dodge();
      return;
    }
    // incoming Red
    if (p.act === 'red' && dist > 6 && this.cd.dodge <= 0 && chance(this.diff.dodge * 0.06)) this.dodge();
  }

  private footwork(dist: number, dt: number) {
    const d = this.toPlayer(_v2);
    d.y = 0;
    d.normalize();
    const side = _v3.set(-d.z, 0, d.x).multiplyScalar(this.strafeDir);
    if (dist > 16) {
      // walk in like he owns the place
      this.wish.copy(d).multiplyScalar(this.phase >= 3 ? 7 : 3.2);
    } else if (dist > 5) {
      this.wish.copy(d).multiplyScalar(4).addScaledVector(side, 5);
    } else if (dist < 1.6) {
      this.wish.copy(d).multiplyScalar(-4);
    } else this.wish.copy(side).multiplyScalar(2.5).addScaledVector(d, 1.5);
    if (chance(dt * 0.4)) this.strafeDir *= -1;
    this.state = 'move';
  }

  private decide(dist: number) {
    const a = this.diff.aggression * (1 + (this.phase - 1) * 0.12);
    this.think = this.diff.think * rnd(0.6, 1.5) * (1.4 - a * 0.5);
    if (this.phase >= 4 && this.cd.wcs <= 0 && dist > 5) return this.startWCS();
    if (dist < 3.4) {
      if (this.cd.cleave <= 0 && chance(0.18)) return this.beginCombo(['cleave']);
      return this.beginCombo();
    }
    if (dist < 14) {
      const r = Math.random();
      if (r < 0.45 * a && this.cd.dash <= 0) return this.dashTo(this.player.f.pos, 1.6);
      if (r < 0.8 && this.cd.dismantle <= 0) return this.startDismantle(1 + Math.floor(rnd(0, 3)));
      return;
    }
    // far
    if (this.cd.fuga <= 0 && this.phase >= 1 && chance(0.25)) return this.startFuga();
    if (this.cd.dismantle <= 0 && chance(0.6)) return this.startDismantle(2 + Math.floor(rnd(0, 4)));
    if (this.cd.laugh <= 0 && chance(0.15)) return this.taunt();
    if (this.cd.dash <= 0 && chance(0.5 * a)) return this.dashTo(this.player.f.pos, 1.8);
  }

  private dashTo(p: THREE.Vector3, stopShort: number) {
    const d = _v.subVectors(p, this.f.pos);
    d.y = 0;
    const dist = d.length();
    d.normalize();
    this.moveGoal.copy(p).addScaledVector(d, -stopShort);
    this.wish.copy(d).multiplyScalar(Math.min(40, (dist - stopShort) / 0.24));
    this.f.vel.x = this.wish.x;
    this.f.vel.z = this.wish.z;
    this.set('dash');
    this.cd.dash = 1.2;
    SD.fx.dustRing(this.f.pos.x, this.f.pos.y, this.f.pos.z, 1, 10, 6);
    SD.audio?.play('dash', { x: this.f.pos.x, y: this.f.pos.y + 1, z: this.f.pos.z, volume: 0.9 });
    this.onEvent?.('dash');
  }

  private dodge() {
    const d = this.toPlayer(_v);
    d.y = 0;
    d.normalize();
    const side = _v2.set(-d.z, 0, d.x).multiplyScalar(chance(0.5) ? 1 : -1);
    this.f.vel.x = side.x * 22 - d.x * 6;
    this.f.vel.z = side.z * 22 - d.z * 6;
    this.wish.set(0, 0, 0);
    this.set('dodge');
    this.cd.dodge = 2.2 / Math.max(0.3, this.diff.dodge * 2);
    this.anim.play(DODGE);
    for (let i = 0; i < 20; i++) {
      const p = this.aim(_v3).add(_v.set(rnd(-0.4, 0.4), rnd(-0.8, 0.6), rnd(-0.4, 0.4)));
      SD.fx.streaks.emit(p.x, p.y, p.z, -side.x * 12, 0, -side.z * 12, 0.25, 0.02, 1.4, 1.2, 1.3, { stretch: 0.04 });
    }
    SD.audio?.play('whoosh', { x: this.f.pos.x, y: this.f.pos.y + 1, z: this.f.pos.z, volume: 0.8 });
  }

  private taunt() {
    this.castName = 'laugh';
    this.set('cast');
    this.anim.play(SK_LAUGH);
    this.model.setExpr('grin');
    this.cd.laugh = 14;
    this.think = 0.6;
    SD.subtitle?.('ケヒッ', 'Heh.', 'sukuna');
    SD.audio?.play('laugh', { x: this.f.pos.x, y: this.f.pos.y + 1.5, z: this.f.pos.z, volume: 1 });
  }

  // ------------------------------------------------------------------ strikes
  private beginCombo(list?: string[]) {
    this.combo = [...(list ?? COMBOS[Math.floor(Math.random() * COMBOS.length)])];
    this.nextStrike();
  }

  private nextStrike(): void {
    const name = this.combo.shift();
    if (!name) {
      this.set('idle');
      this.think = this.diff.think * rnd(0.5, 1.2);
      return;
    }
    const s = STRIKES[name];
    if (name === 'cleave') {
      if (this.cd.cleave > 0) return this.nextStrike();
      this.cd.cleave = 6;
    }
    this.strike = s;
    this.struck = false;
    this.set('strike');
    this.anim.play(s.clip, name === 'jab' ? 1.15 : 1);
    if (s.da && chance(s.da * this.diff.da * (0.6 + this.phase * 0.2))) {
      this.daGlow = 1.6;
      (this.strike as Strike & { useDa?: boolean }).useDa = true;
    } else (this.strike as Strike & { useDa?: boolean }).useDa = false;
    SD.audio?.play('swing', { x: this.f.pos.x, y: this.f.pos.y + 1, z: this.f.pos.z, volume: 0.7, pitch: rnd(0.85, 1) });
  }

  private runStrike() {
    const s = this.strike!;
    const hitT = s.clip.events?.[0]?.[0] ?? 0.15;
    if (!this.struck && this.anim.actionT >= hitT) {
      this.struck = true;
      this.resolveStrike(s);
    }
    const len = s.clip.keys[s.clip.keys.length - 1].t;
    // chain into the next blow early, like a real combo
    if (this.anim.actionT >= len * 0.72 || this.anim.action === null) this.nextStrike();
  }

  private resolveStrike(s: Strike) {
    const p = this.player;
    const d = this.toPlayer(_v);
    const dist = Math.hypot(d.x, d.z);
    const fwd = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dir = _v3.set(d.x, 0, d.z).normalize();
    const facing = dir.dot(fwd);
    const dy = p.f.pos.y - this.f.pos.y;
    const da = (s as Strike & { useDa?: boolean }).useDa ?? false;
    if (s.slam) {
      const at = this.f.pos.clone().addScaledVector(fwd, 1.2);
      SD.fx.crater(at, new THREE.Vector3(0, 1, 0), 3.5);
      SD.fx.dustRing(at.x, at.y, at.z, 3, 18, 9);
      p.cam.shake(Math.max(0.1, 0.6 - dist * 0.03));
      SD.audio?.play('slam', { x: at.x, y: at.y, z: at.z, volume: 1.1 });
    }
    if (dist > s.reach + 0.4 || facing < 0.35 || Math.abs(dy) > 2.2) {
      SD.audio?.play('whiff', { x: this.f.pos.x, y: this.f.pos.y + 1, z: this.f.pos.z, volume: 0.5 });
      return;
    }
    const point = p.aim(new THREE.Vector3()).addScaledVector(dir, -0.4);
    const hit = makeHit(s.kind, s.dmg * this.diff.dmg, point, dir, { knock: s.knock, lift: s.lift, stun: s.stun, launch: s.launch, da, source: this });
    const r = p.receive(hit);
    if (r === 'hit') {
      SD.fx.impact(point, dir.clone().negate(), da ? 0.9 : 0.6, da ? 0xff5050 : 0xfff0e0);
      SD.timing.hitstop(da ? 0.08 : 0.05);
      SD.onomato?.(s.kind === 'kick' ? 'ドゴッ' : 'ゴッ', point, 1);
      SD.audio?.play(da ? 'hitHeavy' : 'hitPunch', { volume: 1 });
      if (s.kind === 'cleave') this.cleaveWeb(point);
    } else if (r === 'blocked') {
      SD.timing.hitstop(0.03);
    }
  }

  /** Cleave's crisscross of cuts on the target. */
  private cleaveWeb(p: THREE.Vector3) {
    for (let i = 0; i < 9; i++) {
      const fwd = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      const axis = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).cross(fwd).normalize();
      SD.fx.slashes.flash({ pos: p.clone().add(_v.set(rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(-0.3, 0.3))), fwd, axis, len: rnd(0.8, 1.6), thick: 0.05, bulge: 0.1, color: [1.6, 1.4, 1.5] }, 0.25, i * 0.025);
    }
    SD.audio?.play('cleave', { volume: 1 });
  }

  // ------------------------------------------------------------------ techniques
  private startDismantle(n: number) {
    this.castName = 'dismantle';
    this.volley = n;
    this.volleyT = 0;
    this.set('cast');
    this.cd.dismantle = 1.4 + n * 0.4;
    this.anim.play(SK_DISMANTLE, 1.1, (e) => e === 'release' && this.fireSlash());
  }

  private startFuga() {
    this.castName = 'fuga';
    this.set('cast');
    this.cd.fuga = 22;
    this.armor = 2.2;
    this.anim.play(SK_FUGA, 1, (e) => {
      if (e === 'flame') {
        this.arrow.group.visible = true;
        SD.subtitle?.('■「開」', 'Furnace, open.', 'sukuna');
        SD.audio?.play('fugaDraw', { x: this.f.pos.x, y: this.f.pos.y + 1.5, z: this.f.pos.z, volume: 1.2 });
      }
      if (e === 'release') this.fireArrow();
    });
    this.model.setExpr('focus');
    this.onEvent?.('fuga');
  }

  /** 龍鱗　反発　番いの流星: three signs, then a cut through the world itself. */
  private startWCS() {
    this.castName = 'wcs';
    this.set('cast');
    this.cd.wcs = 13 + rnd(0, 4);
    this.armor = 4;
    this.wcs = { vertical: Math.random() < 0.55, n: new THREE.Vector3(), d: 0, taken: 0, locked: false };
    this.model.setExpr('focus');
    const line = (jp: string, en: string) => {
      SD.hud?.callout(jp, en, 'sukuna', 1.1);
      SD.audio?.play('chant', { volume: 1.1 });
      this.player.cam.shake(0.15);
    };
    this.anim.play(SK_WCS, 1, (e) => {
      if (e === 'chant1') line('龍鱗', 'Dragon scales.');
      if (e === 'chant2') line('反発', 'Recoil.');
      if (e === 'chant3') line('番いの流星', 'Twin meteors.');
      if (e === 'release') this.releaseWCS();
    });
    this.onEvent?.('wcs');
  }

  private aimWCS() {
    const w = this.wcs!;
    if (w.locked) return;
    const p = this.player;
    const to = new THREE.Vector3().subVectors(p.f.pos, this.f.pos).setY(0).normalize();
    if (w.vertical) {
      // a standing sheet through Gojo: step out of it
      w.n.set(-to.z, 0, to.x);
      w.d = w.n.dot(p.f.pos);
    } else {
      // a level sheet through his chest: get above it
      w.n.set(0, 1, 0).applyAxisAngle(to, 0.06);
      w.d = w.n.dot(new THREE.Vector3(p.f.pos.x, p.f.pos.y + 1.3, p.f.pos.z));
    }
    SD.director?.telegraphWCS(w.n.clone(), w.d, this.f.pos.clone(), to);
  }

  private releaseWCS() {
    const w = this.wcs;
    if (!w) return;
    SD.director?.clearWCS();
    const p = this.player;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const c = p.aim(new THREE.Vector3());
    const inPlane = Math.abs(w.n.dot(c) - w.d) < (w.vertical ? 0.9 : 1.0);
    const ahead = new THREE.Vector3().subVectors(c, this.f.pos).dot(fwd) > 0;
    SD.audio?.play('wcs', { volume: 1.6 });
    const post = SD.renderer.post;
    post.impact = 1.4;
    post.impactColor.setRGB(1, 1, 1);
    post.flash = 0.5;
    p.cam.shake(1.1);
    SD.timing.hitstop(0.12);
    // everything in front of him on that sheet comes apart
    const bounds = new THREE.Box3().setFromCenterAndSize(this.f.pos.clone().addScaledVector(fwd, 220), new THREE.Vector3(460, 400, 460));
    SD.world?.slice(w.n, w.d, bounds, fwd, 'wcs', 0.45);
    if (inPlane && ahead && p.alive) {
      const dmg = this.diff.name === 'THE STRONGEST' ? 99999 : this.diff.name === 'HARD' ? 650 : 420;
      p.receive(makeHit('wcs', dmg, c, fwd, { knock: 6, lift: 2, stun: 0.8, sure: true, source: this }));
      SD.fx.slashes.flash({ pos: c.clone(), fwd: fwd.clone(), axis: new THREE.Vector3().crossVectors(w.n, fwd).normalize(), len: 6, thick: 0.15, bulge: 0.1, color: [2, 2, 2] }, 0.5);
      SD.onomato?.('ザンッ', c, 2.2);
    } else SD.onomato?.('ズッ', this.f.pos.clone().addScaledVector(fwd, 12).setY(3), 1.6);
    this.model.setExpr(inPlane && ahead ? 'grin' : 'neutral');
    this.wcs = null;
  }

  private runCast(dt: number) {
    if (this.castName === 'wcs') {
      if (this.wcs) {
        // locks on a beat before the cut
        if (this.anim.actionT > 2.65) this.wcs.locked = true;
        this.aimWCS();
      }
      if (this.anim.action === null) {
        this.wcs = null;
        SD.director?.clearWCS();
        this.set('idle');
        this.think = 0.6;
      }
      return;
    }
    if (this.castName === 'dismantle') {
      if (this.anim.action === null || this.anim.actionK > 0.85) {
        this.volley--;
        if (this.volley > 0) {
          const clip = this.volley % 2 ? SK_DISMANTLE_L : SK_DISMANTLE;
          this.anim.play(clip, 1.3, (e) => e === 'release' && this.fireSlash(clip === SK_DISMANTLE_L ? 'L' : 'R'));
        } else {
          this.set('idle');
          this.think = this.diff.think;
        }
      }
      return;
    }
    if (this.castName === 'fuga') {
      // the flaming arrow drawn between his hands
      if (this.arrow.group.visible && !this.arrowFlight) {
        const l = this.handPos('L', new THREE.Vector3());
        const r = this.handPos('R', new THREE.Vector3());
        const tip = l.clone().addScaledVector(l.clone().sub(r).normalize(), 0.5);
        this.arrow.aim(r, tip);
        this.arrow.radius = 0.06 + Math.min(1, this.stateT / 1.2) * 0.06;
        this.arrow.intensity = 1.2;
        this.arrow.update(SD.time, SD.camera);
        for (let i = 0; i < 3; i++) SD.fx.fire.emit(l.x + rnd(-0.2, 0.2), l.y + rnd(-0.1, 0.2), l.z + rnd(-0.2, 0.2), rnd(-0.5, 0.5), rnd(1, 3), rnd(-0.5, 0.5), rnd(0.2, 0.5), rnd(0.15, 0.35), 0.05, 2.4, 0.9, 0.2, 1, 0.8, 0.1, 0, 0, 1, -0.5);
      }
      if (this.anim.action === null) {
        this.set('idle');
        this.model.setExpr('neutral');
        this.think = 0.4;
      }
      return;
    }
    if (this.castName === 'laugh') {
      if (this.anim.action === null) {
        this.model.setExpr('neutral');
        this.set('idle');
      }
    }
    void dt;
  }

  private fireSlash(side: 'L' | 'R' = 'R') {
    const from = this.handPos(side, new THREE.Vector3());
    const target = this.player.aim(new THREE.Vector3());
    // lead the target a little
    target.addScaledVector(this.player.f.vel, from.distanceTo(target) / 95 * 0.6);
    const fwd = target.clone().sub(from).normalize();
    // the blade lies across the throw: flat, or tilted
    const tilt = rnd(-0.9, 0.9);
    const across = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
    const axis = across.clone().applyAxisAngle(fwd, tilt).normalize();
    this.slashes.push({ pos: from.clone(), prev: from.clone(), vel: fwd.multiplyScalar(95), axis, len: rnd(2.6, 4.2), life: 1.6, dmg: 46 * this.diff.dmg, hit: false });
    SD.fx.slashes.flash({ pos: from.clone(), fwd: fwd.clone().normalize(), axis, len: 1.2, thick: 0.06, bulge: 0.2, color: [1.5, 1.3, 1.4] }, 0.12);
    SD.audio?.play('dismantle', { x: from.x, y: from.y, z: from.z, volume: 1 });
    this.onEvent?.('dismantle');
  }

  private updateSlashes(dt: number) {
    const p = this.player;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.life -= dt;
      s.prev.copy(s.pos);
      s.pos.addScaledVector(s.vel, dt);
      const fwd = _v.copy(s.vel).normalize();
      SD.fx.slashes.draw({ pos: s.pos.clone(), fwd: fwd.clone(), axis: s.axis.clone(), len: s.len, thick: 0.07, bulge: 0.35, color: [1.35, 1.2, 1.3] });
      // did the cut pass through Gojo this frame?
      if (!s.hit && p.alive) {
        const c = p.aim(_v2);
        const a = c.clone().sub(s.prev).dot(fwd);
        const b = c.clone().sub(s.pos).dot(fwd);
        if (a > 0 && b <= 0) {
          const rel = c.clone().sub(s.pos);
          const along = Math.abs(rel.dot(s.axis));
          const n = _v3.crossVectors(fwd, s.axis).normalize();
          const out = Math.abs(rel.dot(n));
          if (along < s.len * 0.5 + 0.35 && out < 1.0) {
            s.hit = true;
            const r = p.receive(makeHit('dismantle', s.dmg, c, fwd.clone().setY(0), { knock: 3, stun: 0.2, source: this }));
            if (r === 'hit') {
              SD.fx.slashes.flash({ pos: c.clone(), fwd: fwd.clone(), axis: s.axis.clone(), len: 1.4, thick: 0.08, bulge: 0.1, color: [2, 0.3, 0.3] }, 0.3);
              SD.audio?.play('slashFlesh', { volume: 1 });
            }
            if (r !== 'dodged') {
              this.slashes.splice(i, 1);
              continue;
            }
          }
        }
      }
      // the street and the buildings take what Gojo doesn't
      const h = SD.physics.castRay(s.prev.x, s.prev.y, s.prev.z, fwd.x, fwd.y, fwd.z, s.pos.distanceTo(s.prev), SD.rayGroups);
      if (h || s.life <= 0) {
        if (h) {
          const at = s.prev.clone().addScaledVector(fwd, h.t);
          if (h.ny > 0.6) {
            const a0 = at.clone().addScaledVector(s.axis, -s.len * 0.5);
            const a1 = at.clone().addScaledVector(s.axis, s.len * 0.5);
            SD.fx.cuts.add(a0.x, a0.z, a1.x, a1.z, 0.08, 30);
          }
          SD.fx.burst(at, _v3.set(h.nx, h.ny, h.nz), 20, 1.6, 1.5, 1.4, 10);
          SD.fx.debris(at, _v3.set(h.nx, h.ny, h.nz), 0.4);
          SD.world?.slashMark(at, _v3.set(h.nx, h.ny, h.nz), s.axis, s.len, h.collider);
          SD.audio?.play('slashStone', { x: at.x, y: at.y, z: at.z, volume: 0.8 });
        }
        this.slashes.splice(i, 1);
      }
    }
  }

  private fireArrow() {
    const r = this.handPos('R', new THREE.Vector3());
    const target = this.player.aim(new THREE.Vector3());
    const dir = target.clone().sub(r).normalize();
    this.arrowFlight = { pos: this.handPos('L', new THREE.Vector3()), vel: dir.multiplyScalar(62), life: 3 };
    this.player.cam.shake(0.3);
    SD.audio?.play('fugaFire', { x: r.x, y: r.y, z: r.z, volume: 1.3 });
    SD.renderer.post.bloomBoost += 0.6;
  }

  private updateArrow(dt: number) {
    const a = this.arrowFlight;
    if (!a) {
      if (this.state !== 'cast' || this.castName !== 'fuga') this.arrow.group.visible = false;
      return;
    }
    a.life -= dt;
    const prev = a.pos.clone();
    a.pos.addScaledVector(a.vel, dt);
    const dir = a.vel.clone().normalize();
    this.arrow.aim(a.pos.clone().addScaledVector(dir, -2.2), a.pos);
    this.arrow.radius = 0.16;
    this.arrow.intensity = 1.5;
    this.arrow.group.visible = true;
    this.arrow.update(SD.time, SD.camera);
    for (let i = 0; i < 6; i++) SD.fx.fire.emit(a.pos.x + rnd(-0.2, 0.2), a.pos.y + rnd(-0.2, 0.2), a.pos.z + rnd(-0.2, 0.2), rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(0.2, 0.5), rnd(0.3, 0.6), 0.1, 2.6, 1.0, 0.25, 1, 0.8, 0.1, 0, 0, 1, -0.4);
    // hit Gojo, the street or a building
    const p = this.player;
    const c = p.aim(_v2);
    const rel = c.clone().sub(prev);
    const t = THREE.MathUtils.clamp(rel.dot(dir), 0, a.pos.distanceTo(prev));
    let boom = rel.addScaledVector(dir, -t).length() < 1.3;
    const h = boom ? null : SD.physics.castRay(prev.x, prev.y, prev.z, dir.x, dir.y, dir.z, a.pos.distanceTo(prev), SD.rayGroups);
    if (h) a.pos.copy(prev).addScaledVector(dir, h.t);
    if (h || boom || a.life <= 0 || a.pos.y < SD.city.groundY(a.pos.x, a.pos.z)) {
      this.fugaBlast(a.pos);
      this.arrowFlight = null;
      this.arrow.group.visible = false;
    }
  }

  private fugaBlast(at: THREE.Vector3) {
    const R = 13;
    SD.fx.explosion(at, R);
    SD.fx.crater(at.clone().setY(SD.city.groundY(at.x, at.z)), new THREE.Vector3(0, 1, 0), 6);
    const post = SD.renderer.post;
    post.flash = Math.max(post.flash, 0.6);
    post.impact = Math.max(post.impact, 0.8);
    post.impactColor.setRGB(1.0, 0.45, 0.1);
    this.player.cam.shake(1);
    SD.timing.hitstop(0.08);
    SD.onomato?.('ドォォン', at, 2);
    SD.audio?.play('fugaBlast', { x: at.x, y: at.y, z: at.z, volume: 1.5 });
    const p = this.player;
    const c = p.aim(_v2);
    const dist = c.distanceTo(at);
    if (dist < R) {
      const k = 1 - dist / R;
      const dir = c.clone().sub(at).setY(0.4).normalize();
      p.receive(makeHit('fuga', (90 + 160 * k) * this.diff.dmg, c, dir, { knock: 16 * k + 4, lift: 6 * k, stun: 0.4, launch: k > 0.5, source: this }));
    }
    SD.world?.blast(at, R * 1.4, 22);
    SD.world?.fire(at, R);
  }

  // ------------------------------------------------------------------ getting hit
  receive(hit: Hit): HitResult {
    if (!this.alive || this.invulnerable) return 'immune';
    if (this.state === 'cine') {
      this.hp -= hit.dmg;
      this.anim.kick('head', -200, 0, 0);
      this.checkDeath();
      return 'hit';
    }
    if (this.state === 'dodge' && this.stateT < 0.22) return 'dodged';
    if (this.state === 'stunned') {
      // free hits while his mind drowns in the void
      this.hp -= hit.dmg * 1.15;
      this.anim.kick('chest', -200, 0, 0);
      this.checkDeath();
      return 'hit';
    }
    // a guard sometimes comes up against plain punches
    if (hit.kind === 'punch' && (this.state === 'idle' || this.state === 'move') && chance(this.diff.dodge * 0.5)) {
      this.anim.play(BLOCK);
      this.hp -= hit.dmg * 0.15;
      return 'blocked';
    }
    this.hp -= hit.dmg;
    this.poise -= hit.dmg * (hit.kind === 'punch' ? 1.6 : 1);
    this.onEvent?.('hurt', hit);
    if (this.wcs) {
      this.wcs.taken += hit.dmg;
      // a heavy enough blow breaks the incantation
      if (this.wcs.taken > 200 || hit.kind === 'red' || hit.kind === 'blackflash' || hit.kind === 'purple') {
        this.wcs = null;
        SD.director?.clearWCS();
        this.armor = 0;
        SD.hud?.callout('詠唱中断', 'Chant broken!', '', 1.4);
        this.poise = 0;
      }
    }
    const big = hit.launch || this.poise <= 0;
    if (this.armor > 0 && !hit.launch && hit.kind !== 'purple') {
      this.anim.kick('chest', -120, rnd(-60, 60), 0);
      this.anim.kick('head', -200, rnd(-100, 100), 0);
    } else if (big) {
      // cancel whatever he was doing
      this.combo = [];
      this.strike = null;
      this.slashesCancelCast();
      if (hit.launch || hit.knock > 10) {
        const k = hit.knock;
        this.f.launch(hit.dir.x * k, Math.max(3, hit.lift + (k > 20 ? 3 : 0)), hit.dir.z * k);
        this.set('launched');
        this.anim.stop();
        this.anim.stance = LAUNCHED;
        this.yaw = Math.atan2(-hit.dir.x, -hit.dir.z);
      } else {
        this.set('hit');
        this.anim.play(HIT_HEAVY);
        this.f.vel.addScaledVector(hit.dir, hit.knock);
      }
      this.poise = 100;
      this.model.setExpr('hurt');
      this.exprT = 0.9;
    } else {
      this.anim.play(HIT_LIGHT);
      this.anim.kick('head', -260, rnd(-120, 120), 0);
      this.f.vel.addScaledVector(hit.dir, hit.knock);
      if (this.state === 'strike' || this.state === 'idle' || this.state === 'move') {
        this.set('hit');
        this.combo = [];
      }
    }
    this.checkDeath();
    return 'hit';
  }

  private slashesCancelCast() {
    if (this.state === 'cast') {
      this.arrow.group.visible = false;
      this.model.setExpr('neutral');
    }
  }

  private checkDeath() {
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.set('dead');
      this.anim.stop();
      this.anim.stance = KNEEL;
      this.onEvent?.('dead');
    }
  }

  /** Scripted control (cinematics). */
  cine(on: boolean) {
    if (on) {
      this.set('cine');
      this.combo = [];
      this.strike = null;
      this.wish.set(0, 0, 0);
    } else if (this.state === 'cine') this.set('idle');
  }
}

