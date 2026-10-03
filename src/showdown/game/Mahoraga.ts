import * as THREE from 'three';
import { SD } from '../core/SD';
import { Animator, Clip } from '../char/Anim';
import { buildMahoraga } from '../char/Characters';
import type { CharModel } from '../char/Model';
import { KNEEL, LAUNCHED, MH_IDLE, MH_PUNCH, MH_ROAR, MH_SLAM, MH_SLASH, airPose, runCycle, walkCycle } from '../char/Poses';
import type { Difficulty } from './Boss';
import { Combatant, Hit, HitKind, HitResult, makeHit } from './Combat';
import { Fighter } from './Fighter';
import type { Player } from './Player';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Swing {
  clip: Clip;
  dmg: number;
  reach: number;
  knock: number;
  lift: number;
  kind: HitKind;
  slam?: boolean;
}
const SWINGS: Swing[] = [
  { clip: MH_SLASH, dmg: 110, reach: 6.2, knock: 22, lift: 5, kind: 'sword' },
  { clip: MH_SLAM, dmg: 140, reach: 5.5, knock: 10, lift: 8, kind: 'sword', slam: true },
  { clip: MH_PUNCH, dmg: 85, reach: 4.6, knock: 26, lift: 3, kind: 'punch' },
];

type State = 'rise' | 'idle' | 'move' | 'swing' | 'hit' | 'launched' | 'down' | 'stunned' | 'dead' | 'cine';

/**
 * 八握剣異戒神将魔虚羅: the General. Every phenomenon it suffers turns the
 * wheel; four turns against Infinity and its blows pass straight through.
 */
export class Mahoraga implements Combatant {
  readonly name = '魔虚羅';
  readonly f: Fighter;
  readonly model: CharModel;
  readonly anim: Animator;
  readonly wheel: THREE.Group;
  hp: number;
  readonly maxHp: number;
  alive = true;
  state: State = 'rise';
  stateT = 0;
  yaw = 0;
  /** wheel turns per phenomenon */
  readonly adapt: Record<string, number> = {};
  private wheelAngle = 0;
  private wheelTarget = 0;
  private swing: Swing | null = null;
  private struck = false;
  private think = 1;
  private stunT = 0;
  private wish = new THREE.Vector3();
  /** wheel turns waiting a beat after the hit */
  private pending: { kind: string; t: number }[] = [];
  onEvent: ((name: string, data?: any) => void) | null = null;

  constructor(
    x: number,
    z: number,
    readonly player: Player,
    readonly diff: Difficulty,
  ) {
    this.maxHp = this.hp = Math.round(diff.hp * 0.55);
    this.f = new Fighter(0.95, 4.7, x, z);
    this.f.gravity = 30;
    const m = buildMahoraga();
    this.model = m.model;
    this.wheel = m.wheel;
    SD.scene.add(this.model.group);
    this.anim = new Animator(this.model, MH_IDLE, { walk: (p) => walkCycle(p, 0.6), run: runCycle, air: airPose });
    this.anim.ikScale = 2.55 / 0.92;
    this.anim.breath = 1.6;
    this.yaw = Math.atan2(player.f.pos.x - x, player.f.pos.z - z);
    this.f.onCrash = (c) => {
      SD.fx.crater(c.point, c.normal, 5 + c.speed * 0.2);
      SD.audio?.play('crash', { x: c.point.x, y: c.point.y, z: c.point.z, volume: 1.5 });
      this.player.cam.shake(0.6);
      SD.world?.crash(c.point, c.normal, c.speed, c.collider);
    };
    this.f.onLand = (s) => {
      if (s > 6) {
        SD.fx.dustRing(this.f.pos.x, this.f.pos.y, this.f.pos.z, 3, 18, 6);
        this.player.cam.shake(0.25);
      }
    };
  }

  aim(out: THREE.Vector3) {
    return out.set(this.f.pos.x, this.f.pos.y + 3.2, this.f.pos.z);
  }

  /** Infinity is no obstacle once the wheel has turned four times for it. */
  get adaptedToInfinity() {
    return (this.adapt.infinity ?? 0) >= 4;
  }

  /** One turn of the wheel: a heavy clunk, and the phenomenon matters less. */
  turnWheel(kind: string) {
    const n = (this.adapt[kind] ?? 0) + 1;
    this.adapt[kind] = n;
    this.wheelTarget += Math.PI / 4;
    const p = this.wheel.getWorldPosition(new THREE.Vector3());
    SD.audio?.play('wheelTurn', { x: p.x, y: p.y, z: p.z, volume: 1.3 });
    SD.fx.burst(p, _v.set(0, 1, 0), 30, 2.5, 2.0, 0.8, 8);
    SD.fx.shell(p, 0.4, 3, 0.4, 0xffd890, 1.5);
    SD.onomato?.('ガコン', p, 1.4);
    this.onEvent?.('wheel', { kind, n });
    if (kind === 'infinity' && n === 4) {
      SD.hud?.callout('適応', 'ADAPTED TO INFINITY', 'sukuna', 2.4);
      this.onEvent?.('adapted');
    }
  }

  private set(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  stunFor(t: number) {
    this.stunT = Math.max(this.stunT, t);
    this.set('stunned');
    this.anim.stop();
    this.swing = null;
  }

  cine(on: boolean) {
    if (on) this.set('cine');
    else if (this.state === 'cine') this.set('idle');
  }

  update(dt: number) {
    this.stateT += dt;
    // the wheel turns with weight, overshoots and settles
    this.wheelAngle += (this.wheelTarget - this.wheelAngle) * (1 - Math.exp(-dt * 9));
    this.wheel.rotation.z = this.wheelAngle;
    this.wheel.rotation.x = -0.25 + Math.sin(SD.time * 1.3) * 0.03;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        if (this.alive) this.turnWheel(p.kind);
      }
    }
    if (this.alive) this.brain(dt);
    const f = this.f;
    f.step(dt, this.state === 'move' || this.state === 'idle' || this.state === 'swing' ? this.wish : null, 8, 3);
    if (this.state === 'launched' && f.grounded && !f.launched) {
      this.set('down');
      this.anim.stance = KNEEL;
    }
    const d = _v.subVectors(this.player.f.pos, f.pos);
    if (this.state !== 'launched' && this.state !== 'down' && this.state !== 'stunned' && this.state !== 'dead' && !(this.state === 'swing' && this.stateT > 0.4)) {
      const want = Math.atan2(d.x, d.z);
      let diff = want - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * (1 - Math.exp(-dt * 4));
    }
    this.model.group.position.copy(f.pos);
    this.model.group.rotation.y = this.yaw;
    this.anim.speed = this.state === 'move' ? Math.hypot(f.vel.x, f.vel.z) : 0;
    this.anim.grounded = f.grounded;
    this.anim.vy = f.vel.y;
    this.anim.look = this.alive && this.state !== 'down' ? this.player.eye : null;
    this.anim.update(dt);
  }

  private brain(dt: number) {
    const st = this.state;
    if (st === 'cine') return;
    if (st === 'rise') {
      if (this.stateT > 0.2 && this.anim.action === null) this.set('idle');
      return;
    }
    if (st === 'stunned') {
      this.stunT -= dt;
      if (this.stunT <= 0) this.set('idle');
      return;
    }
    if (st === 'hit') {
      if (this.stateT > 0.5) this.set('idle');
      return;
    }
    if (st === 'launched') {
      this.anim.stance = LAUNCHED;
      return;
    }
    if (st === 'down') {
      if (this.stateT > 1.2) {
        this.anim.stance = MH_IDLE;
        this.set('idle');
      }
      return;
    }
    if (st === 'swing') return this.runSwing();
    const d = _v.subVectors(this.player.f.pos, this.f.pos);
    d.y = 0;
    const dist = d.length();
    d.normalize();
    this.think -= dt;
    if (dist > 5) {
      this.wish.copy(d).multiplyScalar(dist > 18 ? 11 : 7);
      this.state = 'move';
    } else {
      this.wish.set(0, 0, 0);
      this.state = 'idle';
    }
    if (this.think <= 0 && dist < 7.5) {
      this.think = this.diff.think * rnd(1.4, 2.4);
      const pick = dist > 5.6 ? SWINGS[0] : SWINGS[Math.floor(Math.random() * SWINGS.length)];
      this.swing = pick;
      this.struck = false;
      this.set('swing');
      this.anim.play(pick.clip);
      SD.audio?.play('swingHeavy', { x: this.f.pos.x, y: this.f.pos.y + 2, z: this.f.pos.z, volume: 1, pitch: 0.6 });
    }
    // leaps across the street to close the gap
    if (this.think <= 0 && dist > 22 && this.f.grounded) {
      this.think = 3;
      this.f.vel.set(d.x * 16, 13, d.z * 16);
      this.f.grounded = false;
    }
  }

  private runSwing() {
    const s = this.swing!;
    const hitT = s.clip.events?.[0]?.[0] ?? 0.5;
    // lean into the blow
    if (this.stateT < hitT) {
      const d = _v.subVectors(this.player.f.pos, this.f.pos).setY(0);
      const dist = d.length();
      this.wish.copy(d.normalize()).multiplyScalar(dist > s.reach - 1 ? 7 : 0);
    } else this.wish.set(0, 0, 0);
    if (!this.struck && this.anim.actionT >= hitT) {
      this.struck = true;
      this.resolve(s);
    }
    if (this.anim.action === null) {
      this.set('idle');
      this.swing = null;
    }
  }

  private resolve(s: Swing) {
    const p = this.player;
    const d = _v.subVectors(p.f.pos, this.f.pos);
    const dist = Math.hypot(d.x, d.z);
    const fwd = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const dir = d.clone().setY(0).normalize();
    if (s.slam) {
      const at = this.f.pos.clone().addScaledVector(fwd, 3.5);
      SD.fx.crater(at, new THREE.Vector3(0, 1, 0), 6);
      SD.fx.dustRing(at.x, at.y, at.z, 4, 24, 12);
      SD.audio?.play('slam', { x: at.x, y: at.y, z: at.z, volume: 1.4 });
      p.cam.shake(Math.max(0.2, 0.9 - dist * 0.03));
    }
    if (s.kind === 'sword') {
      // the Sword of Extermination leaves a bright arc
      const c = this.aim(new THREE.Vector3()).addScaledVector(fwd, 3);
      SD.fx.slashes.flash({ pos: c, fwd: fwd.clone(), axis: s.slam ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-fwd.z, 0.2, fwd.x).normalize(), len: 9, thick: 0.25, bulge: 1.2, color: [1.6, 1.6, 1.7] }, 0.3);
    }
    if (dist > s.reach || dir.dot(fwd) < 0.2 || Math.abs(p.f.pos.y - this.f.pos.y) > 4) return;
    const point = p.aim(new THREE.Vector3()).addScaledVector(dir, -0.5);
    const hit = makeHit(s.kind, s.dmg * this.diff.dmg, point, dir, { knock: s.knock, lift: s.lift, stun: 0.5, launch: true, da: this.adaptedToInfinity, source: this });
    const r = p.receive(hit);
    if (r === 'blocked') this.turnWheel('infinity');
    else if (r === 'hit') {
      SD.fx.impact(point, dir.clone().negate(), 1, 0xfff0d0);
      SD.timing.hitstop(0.1);
      SD.onomato?.('ズドン', point, 1.4);
      SD.audio?.play('hitHeavy', { volume: 1.2 });
    }
  }

  receive(hit: Hit): HitResult {
    if (!this.alive) return 'immune';
    const kind = hit.kind === 'kick' ? 'punch' : hit.kind;
    const turns = this.adapt[kind] ?? 0;
    // adapted phenomena barely scratch it; Black Flash and Purple always matter
    const resist = kind === 'blackflash' || kind === 'purple' ? 1 : Math.max(0.2, 1 - turns * 0.22);
    this.hp -= hit.dmg * resist;
    if (hit.kind === 'red' || hit.kind === 'blue' || hit.kind === 'blackflash' || (hit.kind === 'punch' && Math.random() < 0.12)) {
      if ((this.adapt[kind] ?? 0) < 4 && !this.pending.some((p) => p.kind === kind)) this.pending.push({ kind, t: 0.45 });
    }
    if (this.state !== 'stunned') {
      if (hit.launch && hit.knock > 18) {
        this.f.launch(hit.dir.x * hit.knock * 0.5, Math.max(4, hit.lift * 0.6), hit.dir.z * hit.knock * 0.5);
        this.set('launched');
        this.anim.stop();
      } else {
        this.anim.kick('chest', -90, rnd(-40, 40), 0);
        this.anim.kick('head', -140, rnd(-60, 60), 0);
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.set('dead');
      this.anim.stop();
      this.anim.stance = KNEEL;
      this.onEvent?.('dead');
    }
    return 'hit';
  }

  roar() {
    this.anim.play(MH_ROAR);
    SD.audio?.play('roar', { x: this.f.pos.x, y: this.f.pos.y + 4, z: this.f.pos.z, volume: 1.4 });
  }

  dispose() {
    this.model.group.removeFromParent();
    this.f.dispose();
  }
}
