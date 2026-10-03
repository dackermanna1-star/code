import * as THREE from 'three';
import { ORB_BLUE, ORB_PURPLE, ORB_RED, Orb, setLens } from '../../gojo/GojoFX';
import { SD } from '../core/SD';
import { Animator } from '../char/Anim';
import { buildGojo } from '../char/Characters';
import type { CharModel } from '../char/Model';
import { GJ_POCKETS, airPose, runCycle, walkCycle } from '../char/Poses';
import { CameraRig } from './CameraRig';
import { Combatant, Hit, HitResult, makeHit } from './Combat';
import { FP, FPArms } from './FPArms';
import { Fighter } from './Fighter';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export const GOJO_COST = { red: 20, blue: 18, purple: 50, domain: 60, rct: 14 };
export const GOJO_CD = { red: 2.2, blue: 6, purple: 16, domain: 40 };
/** Infinity's cursed-energy cost to stop each kind of attack. */
const BLOCK_COST: Record<string, number> = { punch: 5, kick: 7, dismantle: 9, cleave: 22, fuga: 34, sword: 12, crash: 0 };

type Act = 'none' | 'melee' | 'charge' | 'bf' | 'red' | 'blue' | 'purple' | 'domain' | 'rct' | 'recover';

interface Shot {
  orb: Orb;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

/**
 * Satoru Gojo, first person: Infinity, Blue, Red, Hollow Purple, Domain
 * Expansion, Reverse Cursed Technique, a fast melee game and the Black Flash.
 */
export class Player implements Combatant {
  readonly name = '五条悟';
  readonly f: Fighter;
  hp = 1000;
  readonly maxHp = 1000;
  ce = 100;
  readonly maxCe = 100;
  alive = true;
  yaw = Math.PI;
  pitch = 0;
  readonly arms: FPArms;
  readonly model: CharModel;
  readonly anim: Animator;
  readonly cam = new CameraRig();
  readonly eye = new THREE.Vector3();
  /** player input enabled (cinematics turn it off) */
  control = true;
  act: Act = 'none';
  actT = 0;
  combo = 0;
  private comboT = 10;
  private hitDone = false;
  private lunge: Combatant | null = null;
  private heldT = 0;
  dash = { charges: 2, t: 0, active: 0, dir: new THREE.Vector3() };
  /** Black Flash: ring 0..1 while charging, zone timer, streak count */
  bf = { ring: 0, zone: 0, streak: 0, perfect: false, lastResult: '' as '' | 'perfect' | 'early' | 'late' };
  readonly cd = { red: 0, blue: 0, purple: 0, domain: 0 };
  burnout = 0;
  invuln = 0;
  stun = 0;
  /** seconds since last hurt (regen delay) */
  private sinceHurt = 10;
  private sinceTech = 10;
  infinity = true;
  /** callbacks for the HUD / director */
  onEvent: ((name: string, data?: any) => void) | null = null;
  private orbR: Orb;
  private orbL: Orb;
  private orbP: Orb;
  private shots: Shot[] = [];
  private blue: { orb: Orb; pos: THREE.Vector3; t: number; life: number; held: Combatant | null } | null = null;
  private purple: { orb: Orb; pos: THREE.Vector3; dir: THREE.Vector3; t: number; hit: Set<Combatant>; big: boolean } | null = null;
  /** the 200% Purple with its full incantation (final phase) */
  private p200 = false;
  private chantLit = 0;
  private purpleCharge = 0;
  private fired = false;
  private recoverDur = 0;
  private buffer: { k: 'red' | 'blue' | 'purple' | 'domain'; t: number } | null = null;
  private moving = 0;
  private mdx = 0;
  private mdy = 0;

  constructor(x: number, z: number) {
    this.f = new Fighter(0.36, 1.86, x, z);
    this.f.onLand = (s) => {
      if (s > 8) {
        this.cam.jolt(0.04 * Math.min(2, s / 10), 0);
        SD.fx.dustRing(this.f.pos.x, this.f.pos.y, this.f.pos.z, 1.5, 10, 3);
        SD.audio?.play('land', { volume: Math.min(1, s / 14) });
      }
    };
    this.f.onCrash = (c) => {
      SD.fx.crater(c.point, c.normal, 2 + c.speed * 0.12);
      this.cam.shake(0.7);
      this.hurtRaw(Math.min(120, c.speed * 4), c.point);
      SD.audio?.play('crash', { volume: 1 });
    };
    this.arms = new FPArms(SD.vmScene);
    this.model = buildGojo();
    this.model.setShadowOnly(true);
    SD.scene.add(this.model.group);
    this.anim = new Animator(this.model, GJ_POCKETS, { walk: (p) => walkCycle(p, 0.5), run: runCycle, air: airPose });
    this.orbR = new Orb(ORB_RED);
    this.orbL = new Orb(ORB_BLUE);
    this.orbP = new Orb(ORB_PURPLE);
    for (const o of [this.orbR, this.orbL, this.orbP]) SD.vmScene.add(o.group);
  }

  aim(out: THREE.Vector3) {
    return out.set(this.f.pos.x, this.f.pos.y + 1.45, this.f.pos.z);
  }

  /** Camera-forward in the world. */
  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** Best enemy near the crosshair within range. */
  private pickTarget(range: number, cone: number): Combatant | null {
    const fwd = this.forward(_v3);
    let best: Combatant | null = null;
    let bestScore = Infinity;
    for (const e of SD.enemies as Combatant[]) {
      if (!e.alive) continue;
      const d = e.aim(_v).sub(this.eye);
      const dist = d.length();
      if (dist > range) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(d.dot(fwd) / Math.max(1e-4, dist), -1, 1));
      if (ang > cone) continue;
      const score = ang * 3 + dist * 0.05;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  get busy() {
    // a landed punch can be cancelled straight into a technique
    if (this.act === 'melee' && this.actT > 0.1) return false;
    if (this.act === 'recover' && this.actT > 0.2) return false;
    return this.act !== 'none' && this.act !== 'rct';
  }

  techReady(t: 'red' | 'blue' | 'purple' | 'domain') {
    return this.cd[t] <= 0 && this.ce >= GOJO_COST[t] && this.burnout <= 0;
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const inp = SD.input;
    const [mdx, mdy] = this.control ? inp.consumeMouse() : (inp.consumeMouse(), [0, 0]);
    this.mdx = mdx;
    this.mdy = mdy;
    if (this.alive && this.control && this.stun <= 0) {
      const sens = SD.settings?.sens ?? 0.0022;
      this.yaw -= mdx * sens;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mdy * sens, -1.45, 1.45);
    }
    // timers
    for (const k of Object.keys(this.cd) as (keyof typeof this.cd)[]) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.burnout = Math.max(0, this.burnout - dt * (this.act === 'rct' ? 3 : 1));
    this.invuln = Math.max(0, this.invuln - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.bf.zone = Math.max(0, this.bf.zone - dt);
    this.comboT += dt;
    this.sinceHurt += dt;
    this.sinceTech += dt;
    this.dash.t += dt;
    if (this.dash.charges < 2 && this.dash.t > 1.35) {
      this.dash.charges++;
      this.dash.t = 0;
    }
    // cursed energy recovers, faster when not spending
    if (this.act !== 'rct') this.ce = Math.min(this.maxCe, this.ce + dt * (this.sinceTech > 2 ? 7 : 3.5));
    this.actT += dt;

    const ctl = this.alive && this.control && this.stun <= 0;
    this.move(dt, ctl);
    if (ctl) this.actions(dt);
    else if (this.act === 'charge' || this.act === 'purple') this.cancelAct();
    this.updateAct(dt);
    this.updateShots(dt);
    this.updateBlue(dt);
    this.updatePurple(dt);

    // body follows the fighter (for its shadow and the cut-ins)
    this.model.group.position.copy(this.f.pos);
    this.model.group.rotation.y = this.yaw + Math.PI;
    this.anim.speed = Math.hypot(this.f.vel.x, this.f.vel.z);
    this.anim.grounded = this.f.grounded;
    this.anim.vy = this.f.vel.y;
    this.anim.update(dt);

    this.eye.set(this.f.pos.x, this.f.pos.y + 1.76, this.f.pos.z);
    this.cam.update(dt, this.eye, this.yaw, this.pitch);
    this.arms.update(dt, SD.camera, this.mdx, this.mdy, this.moving, this.f.grounded);
  }

  private move(dt: number, ctl: boolean) {
    const inp = SD.input;
    const f = this.f;
    let ix = 0;
    let iz = 0;
    if (ctl) {
      ix = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0);
      iz = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0);
    }
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // forward (-sin, -cos), right (cos, -sin)
    const wish = _v.set(-sy * iz + cy * ix, 0, -cy * iz - sy * ix);
    if (wish.lengthSq() > 1) wish.normalize();
    const slow = this.act === 'charge' ? 0.45 : this.act === 'purple' || this.act === 'domain' ? 0.2 : this.act === 'rct' ? 0.5 : 1;
    const speed = 10.5 * slow;
    wish.multiplyScalar(speed);
    this.moving = Math.min(1, Math.hypot(ix, iz)) * (f.grounded ? 1 : 0.3);
    this.cam.leanTo(-ix * 0.018);
    // dash
    if (this.dash.active > 0) {
      this.dash.active -= dt;
      f.vel.x = this.dash.dir.x * 34;
      f.vel.z = this.dash.dir.z * 34;
      if (!f.grounded) f.vel.y = Math.max(f.vel.y, 0);
      SD.renderer.post.speed = Math.max(SD.renderer.post.speed, 0.55);
      for (let i = 0; i < 3; i++) {
        const p = _v2.set(f.pos.x + rnd(-1, 1), f.pos.y + rnd(0.2, 1.8), f.pos.z + rnd(-1, 1));
        SD.fx.streaks.emit(p.x, p.y, p.z, -this.dash.dir.x * 20, 0, -this.dash.dir.z * 20, 0.12, 0.02, 0.4, 0.9, 1.6, { stretch: 0.03 });
      }
    } else if (ctl && inp.pressed('ShiftLeft') && this.dash.charges > 0 && this.act !== 'purple' && this.act !== 'domain') {
      const d = wish.lengthSq() > 0.01 ? wish.clone().normalize() : _v2.set(-sy, 0, -cy).clone();
      this.dash.dir.copy(d);
      this.dash.active = 0.17;
      this.dash.charges--;
      this.dash.t = 0;
      this.invuln = Math.max(this.invuln, 0.24);
      this.cam.kick(10);
      SD.audio?.play('dash', { volume: 0.8 });
      this.onEvent?.('dash');
    }
    // jump and float
    if (ctl && inp.pressed('Space') && f.grounded) {
      f.vel.y = 10;
      f.grounded = false;
      SD.audio?.play('jump', { volume: 0.5 });
    }
    f.hover = ctl && inp.down('Space') && !f.grounded && f.airTime > 0.2 && this.ce > 1;
    if (f.hover) {
      // rise while held, hold altitude near the top
      f.vel.y += (5 - f.vel.y) * (1 - Math.exp(-4 * dt));
      this.ce -= dt * 1.5;
    }
    // lunge into a punch
    if (this.lunge && (this.act === 'melee' || this.act === 'bf') && this.actT < 0.12) {
      const t = this.lunge.aim(_v2).sub(f.pos);
      t.y = 0;
      const dist = t.length();
      if (dist > 1.5) {
        const sp = Math.min(42, (dist - 1.4) / 0.1);
        t.normalize().multiplyScalar(sp);
        f.vel.x = t.x;
        f.vel.z = t.z;
      } else {
        f.vel.x *= 0.5;
        f.vel.z *= 0.5;
      }
      f.step(dt, null, 0);
      return;
    }
    f.step(dt, this.dash.active > 0 ? null : wish, 14, 6);
  }

  private actions(dt: number) {
    const inp = SD.input;
    // melee and the Black Flash charge
    if (inp.mousePress(0)) {
      if (this.act === 'none' || (this.act === 'melee' && this.actT > 0.13) || this.act === 'rct') this.startMelee();
      this.heldT = 0;
    }
    if (inp.mouse(0)) {
      this.heldT += dt;
      if (this.heldT > 0.3 && this.act === 'melee' && this.actT > 0.2) this.startCharge();
      if (this.act === 'none' && this.heldT > 0.3) this.startCharge();
    }
    if (this.act === 'charge' && !inp.mouse(0)) this.releaseCharge();
    // technique presses are buffered briefly so they come out right after a punch
    if (inp.mousePress(2)) this.buffer = { k: 'red', t: 0.3 };
    if (inp.pressed('KeyQ')) this.buffer = { k: 'blue', t: 0.3 };
    if (inp.pressed('KeyR')) this.buffer = { k: 'purple', t: 0.3 };
    if (inp.pressed('KeyZ')) this.buffer = { k: 'domain', t: 0.3 };
    if (this.buffer) {
      this.buffer.t -= dt;
      const k = this.buffer.k;
      if (this.buffer.t <= 0) this.buffer = null;
      else if (!this.busy && this.techReady(k)) {
        this.buffer = null;
        if (k === 'red') this.startRed();
        else if (k === 'blue') this.startBlue();
        else if (k === 'purple') this.startPurple();
        else this.startDomain();
      }
    }
    if (this.act === 'purple' && !inp.down('KeyR') && this.purpleCharge >= 1) this.firePurple();
    if (inp.down('KeyF') && (this.act === 'none' || this.act === 'rct') && this.ce > 2 && this.hp < this.maxHp) {
      if (this.act !== 'rct') {
        this.act = 'rct';
        this.actT = 0;
        this.arms.R.set(FP.palmUp);
        this.arms.L.set(FP.palmUp);
        this.onEvent?.('rct');
      }
    } else if (this.act === 'rct') this.endAct();
  }

  private cancelAct() {
    if (this.act === 'purple') {
      this.purpleCharge = 0;
      this.p200 = false;
      SD.hud?.chant([], 0);
    }
    this.endAct();
  }

  private endAct() {
    this.act = 'none';
    this.actT = 0;
    this.lunge = null;
    this.arms.R.set(FP.idle, 160, 22);
    this.arms.L.set(FP.idle, 160, 22);
  }

  // ------------------------------------------------------------------ melee
  private startMelee() {
    if (this.comboT > 0.7) this.combo = 0;
    else this.combo = (this.combo + 1) % 4;
    this.comboT = 0;
    this.act = 'melee';
    this.actT = 0;
    this.hitDone = false;
    this.lunge = this.pickTarget(9, 0.7);
    const right = this.combo % 2 === 1;
    const strike = this.combo === 2 ? FP.hook : FP.punch;
    (right ? this.arms.R : this.arms.L).set(strike, 900, 50, 40);
    (right ? this.arms.L : this.arms.R).set(FP.guard, 300, 30);
    this.cam.jolt(-0.01, right ? -0.012 : 0.012);
    SD.audio?.play('swing', { volume: 0.6, pitch: rnd(0.9, 1.1) });
  }

  private startCharge() {
    this.act = 'charge';
    this.actT = 0;
    this.bf.ring = 0;
    this.arms.R.set(FP.bfPull, 260, 26);
    this.arms.L.set(FP.guard, 260, 26);
    this.onEvent?.('bfCharge');
    SD.audio?.play('bfCharge', { volume: 0.6 });
  }

  /** The ring closes over 0.8 s; the sweet spot is at 0.78 of the way in. */
  static readonly BF_SWEET = 0.78;
  get bfWindow() {
    return this.bf.zone > 0 ? 0.11 : 0.065;
  }

  private releaseCharge() {
    const k = this.bf.ring;
    const err = (k - Player.BF_SWEET) * 0.8;
    this.bf.perfect = Math.abs(err) <= this.bfWindow;
    this.bf.lastResult = this.bf.perfect ? 'perfect' : err < 0 ? 'early' : 'late';
    this.act = 'bf';
    this.actT = 0;
    this.hitDone = false;
    this.lunge = this.pickTarget(9, 0.7);
    this.arms.R.set(FP.bfStrike, 1100, 55, 50);
    this.arms.L.set(FP.guard, 300, 30);
    this.cam.jolt(-0.015, -0.01);
    this.onEvent?.('bfRelease', this.bf.lastResult);
    SD.audio?.play('swingHeavy', { volume: 0.8 });
  }

  private meleeHit(power: number, bf: boolean) {
    const tgt = this.lunge ?? this.pickTarget(3.4, 1.1);
    if (!tgt) return false;
    const d = tgt.aim(_v).sub(this.eye);
    if (d.length() > 3.6) return false;
    const fwd = this.forward(_v2);
    const dir = _v3.set(fwd.x, 0, fwd.z).normalize();
    const point = tgt.aim(new THREE.Vector3()).addScaledVector(dir, -0.35);
    const finisher = this.combo === 3 && !bf;
    const hit = makeHit(bf ? 'blackflash' : 'punch', bf ? 260 : power, point, dir, {
      knock: bf ? 34 : finisher ? 16 : 3,
      lift: bf ? 7 : finisher ? 4 : 0,
      stun: bf ? 1.1 : finisher ? 0.7 : 0.35,
      launch: bf || finisher,
      source: this,
    });
    const r = tgt.receive(hit);
    if (r === 'hit') {
      if (bf) this.onBlackFlash(point, dir);
      else {
        SD.fx.impact(point, dir.clone().negate(), finisher ? 0.9 : 0.45);
        SD.timing.hitstop(finisher ? 0.09 : 0.045);
        this.cam.shake(finisher ? 0.45 : 0.22);
        this.cam.kick(finisher ? -5 : -2);
        SD.renderer.post.speed = Math.max(SD.renderer.post.speed, finisher ? 0.7 : 0.25);
        SD.onomato?.(finisher ? 'ドゴォ' : rnd(0, 1) < 0.5 ? 'ドッ' : 'バキッ', point, finisher ? 1.2 : 0.8);
        SD.audio?.play(finisher ? 'hitHeavy' : 'hitPunch', { volume: 1, pitch: rnd(0.9, 1.1) });
        this.ce = Math.min(this.maxCe, this.ce + 2);
      }
      this.onEvent?.('hit', { bf, finisher });
    } else if (r === 'blocked') {
      SD.fx.burst(point, dir.clone().negate(), 16, 2, 2, 2.2, 8);
      SD.audio?.play('block', { volume: 0.9 });
      this.cam.shake(0.15);
    } else if (r === 'dodged') {
      SD.audio?.play('whiff', { volume: 0.5 });
    }
    return r === 'hit';
  }

  private onBlackFlash(point: THREE.Vector3, dir: THREE.Vector3) {
    this.bf.streak++;
    this.bf.zone = 10;
    this.ce = Math.min(this.maxCe, this.ce + 40);
    SD.fx.blackFlash(point, dir.clone().negate());
    SD.timing.hitstop(0.2, 0.02);
    const post = SD.renderer.post;
    post.impact = 1.3;
    post.impactColor.setRGB(1.0, 0.04, 0.08);
    post.manga = Math.max(post.manga, 1);
    post.speed = 1;
    post.speedFocus.set(0.5, 0.5);
    post.aberration = 2.5;
    this.cam.shake(1.0);
    this.cam.kick(-12);
    SD.onomato?.('黒閃', point, 2.2, 'bf');
    SD.audio?.play('blackFlash', { volume: 1.2 });
    this.onEvent?.('blackFlash', this.bf.streak);
  }

  // ------------------------------------------------------------------ techniques
  private startRed() {
    this.act = 'red';
    this.actT = 0;
    this.fired = false;
    this.ce -= GOJO_COST.red;
    this.cd.red = GOJO_CD.red;
    this.sinceTech = 0;
    this.arms.R.set(FP.point, 500, 40);
    this.arms.L.set(FP.guard, 200, 26);
    this.onEvent?.('red');
    SD.audio?.play('redCharge', { volume: 0.7 });
  }

  private fireRed() {
    const fwd = this.forward(new THREE.Vector3());
    // a little aim assist toward the nearest enemy in the cone
    const tgt = this.pickTarget(80, 0.2);
    if (tgt) fwd.copy(tgt.aim(_v).sub(this.eye).normalize());
    const orb = new Orb(ORB_RED);
    orb.radius = 0.45;
    orb.haloScale = 4;
    SD.scene.add(orb.group);
    const start = this.eye.clone().addScaledVector(fwd, 1.2).add(_v2.set(0, -0.15, 0));
    this.shots.push({ orb, pos: start, vel: fwd.multiplyScalar(70), life: 1.6 });
    this.arms.R.off.set(0, 0.05, 0.12);
    this.cam.jolt(0.03, 0);
    this.cam.shake(0.25);
    SD.renderer.post.bloomBoost += 0.8;
    SD.audio?.play('redFire', { volume: 1 });
  }

  private updateShots(dt: number) {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      const step = s.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().normalize();
      let boom = s.life <= 0;
      // enemies
      for (const e of SD.enemies as Combatant[]) {
        if (!e.alive) continue;
        const c = e.aim(_v);
        const rel = c.clone().sub(s.pos);
        const t = THREE.MathUtils.clamp(rel.dot(dir), 0, len);
        if (rel.addScaledVector(dir, -t).length() < 1.2) {
          s.pos.addScaledVector(dir, t);
          boom = true;
          break;
        }
      }
      // world
      if (!boom) {
        const h = SD.physics.castRay(s.pos.x, s.pos.y, s.pos.z, dir.x, dir.y, dir.z, len, SD.rayGroups);
        if (h) {
          s.pos.addScaledVector(dir, h.t);
          boom = true;
        } else s.pos.add(step);
      }
      s.orb.group.position.copy(s.pos);
      s.orb.update(SD.time, SD.camera);
      s.orb.group.visible = true;
      SD.fx.streaks.emit(s.pos.x, s.pos.y, s.pos.z, -dir.x * 8 + rnd(-2, 2), rnd(-2, 2), -dir.z * 8 + rnd(-2, 2), 0.25, 0.04, 2.2, 0.15, 0.1, { stretch: 0.03 });
      setLens(2, s.pos, 0.9, 0.35, SD.camera, 1, 0.8);
      if (boom) {
        this.detonateRed(s.pos, dir);
        s.orb.group.removeFromParent();
        this.shots.splice(i, 1);
      }
    }
  }

  private detonateRed(p: THREE.Vector3, dir: THREE.Vector3) {
    const R = 9;
    SD.fx.explosion(p, 7, new THREE.Color(1.8, 0.15, 0.18));
    SD.fx.shell(p, 0.5, R * 1.4, 0.4, 0xff2030, 4);
    SD.fx.burst(p, _v.set(0, 1, 0), 80, 3, 0.4, 0.4, 26);
    const post = SD.renderer.post;
    post.impact = Math.max(post.impact, 0.9);
    post.impactColor.setRGB(1, 0.12, 0.16);
    post.flash = Math.max(post.flash, 0.25);
    this.cam.shake(Math.max(0.2, 0.9 - p.distanceTo(this.eye) * 0.01));
    SD.timing.hitstop(0.06);
    SD.onomato?.('ドンッ', p, 1.4);
    SD.audio?.play('redBlast', { volume: 1.2, x: p.x, y: p.y, z: p.z });
    for (const e of SD.enemies as Combatant[]) {
      if (!e.alive) continue;
      const c = e.aim(_v);
      const d = c.clone().sub(p);
      const dist = d.length();
      if (dist > R) continue;
      const k = 1 - dist / R;
      const push = d.lengthSq() > 1e-4 ? d.normalize() : dir.clone();
      push.y = 0.35;
      e.receive(makeHit('red', 60 + 110 * k, c, push, { knock: 22 + 26 * k, lift: 6 + 8 * k, stun: 0.9, launch: true, source: this }));
    }
    SD.world?.blast(p, R * 1.6, 26);
  }

  private startBlue() {
    this.act = 'blue';
    this.actT = 0;
    this.ce -= GOJO_COST.blue;
    this.cd.blue = GOJO_CD.blue;
    this.sinceTech = 0;
    this.arms.L.set(FP.claw, 500, 40);
    this.arms.R.set(FP.guard, 200, 26);
    // the gravity well opens on the target, or a little ahead
    const tgt = this.pickTarget(45, 0.35);
    const pos = tgt ? tgt.aim(new THREE.Vector3()).add(_v.set(0, 0.3, 0)) : this.eye.clone().addScaledVector(this.forward(_v), 12);
    // the well opens just past the target so it drags them away from Gojo, never in his face
    if (tgt) pos.addScaledVector(pos.clone().sub(this.eye).setY(0).normalize(), 0.8);
    const orb = new Orb(ORB_BLUE);
    orb.radius = 0.1;
    orb.haloScale = 5;
    SD.scene.add(orb.group);
    this.blue = { orb, pos, t: 0, life: 1.6, held: tgt };
    this.onEvent?.('blue');
    SD.audio?.play('blueStart', { volume: 1, x: pos.x, y: pos.y, z: pos.z });
  }

  private updateBlue(dt: number) {
    const b = this.blue;
    if (!b) return;
    b.t += dt;
    const k = Math.min(1, b.t / 0.25);
    b.orb.radius = 0.25 + 0.55 * k + Math.sin(b.t * 30) * 0.03;
    b.orb.intensity = 1.2;
    // keep the halo from washing out the screen up close
    b.orb.haloScale = THREE.MathUtils.clamp(b.pos.distanceTo(this.eye) * 0.5, 1.6, 5);
    b.orb.group.position.copy(b.pos);
    b.orb.update(SD.time, SD.camera);
    b.orb.group.visible = true;
    setLens(1, b.pos, 1.4, 1.2 * k, SD.camera, 0);
    // space collapses inward: streaks pulled to the core
    for (let i = 0; i < 6; i++) {
      const a = rnd(0, Math.PI * 2);
      const r = rnd(3, 9);
      const p = _v.set(b.pos.x + Math.cos(a) * r, b.pos.y + rnd(-3, 3), b.pos.z + Math.sin(a) * r);
      SD.fx.streaks.emit(p.x, p.y, p.z, 0, 0, 0, 0.7, 0.03, 0.5, 1.1, 2.4, { center: b.pos, pull: 260, stretch: 0.04 });
    }
    for (const e of SD.enemies as Combatant[]) {
      if (!e.alive) continue;
      const c = e.aim(_v);
      const d = b.pos.clone().sub(c);
      const dist = d.length();
      if (dist > 14) continue;
      // dragged into the core and held there
      e.f.launched = false;
      const pull = d.normalize().multiplyScalar(Math.min(30, dist * 9));
      e.f.vel.lerp(pull, 1 - Math.exp(-dt * 10));
      e.f.vel.y += 24 * dt;
      if (Math.floor((b.t - dt) * 8) !== Math.floor(b.t * 8)) e.receive(makeHit('blue', 9, c, d, { knock: 0, stun: 0.3, source: this }));
    }
    SD.world?.pull(b.pos, 22, 16 * dt);
    if (b.t >= b.life) {
      // implode
      SD.fx.shell(b.pos, 4, 0.2, 0.25, 0x4aa8ff, 3);
      SD.fx.burst(b.pos, _v.set(0, 1, 0), 60, 0.5, 1.2, 3, 18);
      for (const e of SD.enemies as Combatant[]) {
        if (!e.alive) continue;
        const c = e.aim(_v);
        if (c.distanceTo(b.pos) < 4) e.receive(makeHit('blue', 60, c, c.clone().sub(this.eye).setY(0), { knock: 3, lift: 2, stun: 0.6, source: this }));
      }
      SD.audio?.play('blueCollapse', { volume: 1, x: b.pos.x, y: b.pos.y, z: b.pos.z });
      b.orb.group.removeFromParent();
      this.blue = null;
    }
  }

  private startPurple() {
    this.act = 'purple';
    this.actT = 0;
    this.purpleCharge = 0;
    this.p200 = SD.director?.phase === 4;
    this.chantLit = 0;
    this.ce -= GOJO_COST.purple;
    this.cd.purple = GOJO_CD.purple;
    this.sinceTech = 0;
    this.arms.R.set(FP.purpleSide, 220, 26);
    this.arms.L.set(FP.purpleSide, 220, 26);
    this.onEvent?.('purpleCharge');
    SD.audio?.play('purpleCharge', { volume: 1 });
  }

  private firePurple() {
    const fwd = this.forward(new THREE.Vector3());
    const tgt = this.pickTarget(120, 0.15);
    if (tgt) fwd.copy(tgt.aim(_v).sub(this.eye).normalize());
    const big = this.p200;
    const orb = new Orb(ORB_PURPLE);
    orb.radius = big ? 4.5 : 2.4;
    orb.haloScale = big ? 2.6 : 3.2;
    SD.scene.add(orb.group);
    const pos = this.eye.clone().addScaledVector(fwd, big ? 6 : 3);
    this.purple = { orb, pos, dir: fwd, t: 0, hit: new Set(), big };
    SD.hud?.chant([], 0);
    this.p200 = false;
    this.act = 'recover';
    this.actT = 0;
    this.recoverDur = 0.45;
    this.purpleCharge = 0;
    this.arms.R.set(FP.purpleThrust, 900, 50);
    this.arms.L.set(FP.guard, 200, 26);
    this.orbP.group.visible = false;
    this.orbR.group.visible = false;
    this.orbL.group.visible = false;
    const post = SD.renderer.post;
    post.impact = 1.25;
    post.impactColor.setRGB(0.7, 0.3, 1.0);
    post.flash = 0.35;
    post.speed = 1;
    post.speedFocus.set(0.5, 0.5);
    this.cam.shake(1);
    this.cam.kick(14);
    SD.timing.hitstop(0.12);
    SD.onomato?.('虚式「茈」', null, 2.4, 'purple');
    SD.audio?.play('purpleFire', { volume: 1.3 });
    if (big) {
      SD.audio?.play('wcs', { volume: 0.8 });
      SD.renderer.post.manga = 1;
      SD.timing.hitstop(0.25, 0.02);
      this.cam.shake(1.2);
    }
    this.onEvent?.(big ? 'purple200' : 'purpleFire');
  }

  private updatePurple(dt: number) {
    const p = this.purple;
    if (!p) return;
    p.t += dt;
    const step = (p.big ? 38 : 46) * dt;
    p.pos.addScaledVector(p.dir, step);
    p.orb.group.position.copy(p.pos);
    const R = p.big ? Math.min(9, 4.5 + p.t * 2.2) : 2.4;
    p.orb.radius = R + Math.sin(p.t * 20) * 0.08 * R;
    p.orb.intensity = 1.6;
    p.orb.update(SD.time, SD.camera);
    p.orb.group.visible = true;
    setLens(3, p.pos, R * 1.3, 1.0, SD.camera, 0);
    for (let i = 0; i < (p.big ? 24 : 10); i++) {
      const a = rnd(0, Math.PI * 2);
      const q = p.pos.clone().add(_v.set(Math.cos(a) * R * 1.1, Math.sin(a) * R * 1.1, rnd(-1, 1)));
      SD.fx.streaks.emit(q.x, q.y, q.z, -p.dir.x * 30 + rnd(-3, 3), rnd(-3, 3), -p.dir.z * 30 + rnd(-3, 3), 0.35, 0.05, 1.6, 0.6, 2.6, { stretch: 0.03 });
    }
    // everything in the path is erased
    SD.world?.erase(p.pos, R * 1.15);
    if (p.big) {
      // the ground boils away under it
      const g = p.pos.clone().setY(SD.city.groundY(p.pos.x, p.pos.z));
      if (p.pos.y - R < g.y + 1 && Math.random() < 0.6) SD.fx.crater(g, _v2.set(0, 1, 0), R * 1.4);
    }
    for (const e of SD.enemies as Combatant[]) {
      if (!e.alive || p.hit.has(e)) continue;
      const c = e.aim(_v);
      if (c.distanceTo(p.pos) < R + 0.8) {
        p.hit.add(e);
        e.receive(makeHit('purple', p.big ? 1500 : 520, c, p.dir.clone().setY(0.2), { knock: p.big ? 40 : 30, lift: p.big ? 14 : 10, stun: 1.6, launch: true, source: this }));
        SD.timing.hitstop(0.15, 0.03);
        SD.renderer.post.impact = 1.2;
        this.cam.shake(0.8);
      }
    }
    if (p.t > 5 || p.pos.length() > 600) {
      p.orb.group.removeFromParent();
      this.purple = null;
    }
  }

  private startDomain() {
    this.act = 'domain';
    this.actT = 0;
    this.ce -= GOJO_COST.domain;
    this.cd.domain = GOJO_CD.domain;
    this.sinceTech = 0;
    this.arms.R.set(FP.sign, 300, 30);
    this.arms.L.set(FP.low, 160, 22);
    this.onEvent?.('domainStart');
  }

  // ------------------------------------------------------------------ action timelines
  private updateAct(dt: number) {
    const t = this.actT;
    switch (this.act) {
      case 'melee':
        if (!this.hitDone && t >= 0.085) {
          this.hitDone = true;
          this.meleeHit([34, 38, 44, 70][this.combo], false);
        }
        if (t > 0.3) this.endAct();
        break;
      case 'charge': {
        this.bf.ring = Math.min(1.25, t / 0.8);
        // the arm trembles harder as the moment nears
        const k = Math.min(1, t / 0.8);
        this.arms.R.off.set(rnd(-1, 1) * 0.006 * k, rnd(-1, 1) * 0.006 * k, 0);
        SD.renderer.post.speed = Math.max(SD.renderer.post.speed, 0.15 * k);
        if (t > 1.25) this.releaseCharge();
        break;
      }
      case 'bf':
        if (!this.hitDone && t >= 0.07) {
          this.hitDone = true;
          this.arms.R.off.set(0, 0, 0);
          const ok = this.meleeHit(95, this.bf.perfect);
          if (!ok && this.bf.perfect) this.onEvent?.('bfWhiff');
          if (!this.bf.perfect || !ok) this.bf.streak = 0;
        }
        if (t > 0.42) this.endAct();
        break;
      case 'red':
        this.orbR.radius = 0.004 + Math.min(1, t / 0.18) * 0.012;
        this.orbR.intensity = 1.5;
        this.orbR.group.visible = t < 0.2;
        this.arms.R.root.localToWorld(this.orbR.group.position.set(0, 0.01, -0.12));
        this.orbR.update(SD.time, SD.vmCamera);
        this.arms.glow(0xff3030, 3, this.orbR.group.position);
        if (!this.fired && t >= 0.2) {
          this.fired = true;
          this.fireRed();
        }
        if (t > 0.42) {
          this.arms.R.off.set(0, 0, 0);
          this.endAct();
        }
        break;
      case 'blue':
        if (t > 0.5) this.endAct();
        break;
      case 'purple': {
        const full = this.p200 ? 3.6 : 1.1;
        if (this.p200) {
          // 九綱　偏光　烏と声明　表裏の間
          const lines = ['九綱', '偏光', '烏と声明', '表裏の間'];
          const lit = Math.min(4, Math.floor(t / 0.9) + 1);
          if (lit !== this.chantLit) {
            this.chantLit = lit;
            SD.hud?.chant(lines, lit);
            SD.audio?.play('chant', { volume: 1 });
            this.cam.shake(0.2);
            SD.renderer.post.speed = 0.6;
            SD.renderer.post.manga = Math.max(SD.renderer.post.manga, 0.7);
          }
        }
        this.purpleCharge = Math.min(1, t / full);
        const k = this.purpleCharge;
        if (t > 0.45) {
          this.arms.R.set(FP.purpleMeet, 160, 22);
          this.arms.L.set(FP.purpleMeet, 160, 22);
        }
        // blue in the left hand, red in the right, then they fuse
        const merge = THREE.MathUtils.smoothstep(t, full * 0.5, full * 0.9);
        this.arms.R.root.localToWorld(this.orbR.group.position.set(0, 0.03, -0.1));
        this.arms.L.root.localToWorld(this.orbL.group.position.set(0, 0.03, -0.1));
        const mid = _v.addVectors(this.orbR.group.position, this.orbL.group.position).multiplyScalar(0.5).add(_v2.set(0, 0.02, -0.06));
        this.orbR.group.position.lerp(mid, merge);
        this.orbL.group.position.lerp(mid, merge);
        this.orbR.radius = this.orbL.radius = 0.012 * (1 - merge) * Math.min(1, t * 4);
        this.orbR.intensity = this.orbL.intensity = 1.4;
        this.orbR.group.visible = this.orbL.group.visible = merge < 0.98;
        this.orbP.group.position.copy(mid);
        this.orbP.radius = 0.02 + 0.025 * merge + (k >= 1 ? Math.sin(t * 25) * 0.003 : 0);
        this.orbP.intensity = 1.5;
        this.orbP.group.visible = merge > 0.05;
        for (const o of [this.orbR, this.orbL, this.orbP]) o.update(SD.time, SD.vmCamera);
        this.arms.glow(merge > 0.5 ? 0xb040ff : 0x8080ff, 4, mid);
        SD.renderer.post.bloomBoost = Math.max(SD.renderer.post.bloomBoost, merge * 0.8);
        this.cam.shake(0.02 * k);
        if (t > full + 2) this.firePurple();
        break;
      }
      case 'domain':
        if (t > 1.0 && t - dt <= 1.0) this.onEvent?.('domainOpen');
        if (t > 1.6) this.endAct();
        break;
      case 'recover':
        if (t > this.recoverDur) this.endAct();
        break;
      case 'rct':
        if (this.ce > 0 && this.hp < this.maxHp) {
          this.hp = Math.min(this.maxHp, this.hp + dt * 75);
          this.ce -= dt * GOJO_COST.rct;
          SD.renderer.post.heal = Math.max(SD.renderer.post.heal, 0.5);
          this.arms.glow(0xd8fff0, 2.5, _v.set(0, -0.2, -0.38));
        } else this.endAct();
        break;
    }
  }

  // ------------------------------------------------------------------ getting hit
  receive(hit: Hit): HitResult {
    if (!this.alive) return 'immune';
    if (this.invuln > 0 && !hit.sure) return 'dodged';
    const cost = BLOCK_COST[hit.kind] ?? 10;
    if (this.infinity && !hit.da && !hit.sure && hit.kind !== 'crash' && this.ce >= cost) {
      this.ce -= cost;
      this.infinityRipple(hit.point);
      this.onEvent?.('infinity', hit.kind);
      // the blast still shoves a little
      this.f.vel.addScaledVector(hit.dir, Math.min(4, hit.knock * 0.15));
      return 'blocked';
    }
    this.hurtRaw(hit.dmg, hit.point);
    if (hit.launch || hit.knock > 8) {
      this.f.launch(hit.dir.x * hit.knock * 0.7, Math.max(3, hit.lift), hit.dir.z * hit.knock * 0.7);
      this.stun = Math.max(this.stun, Math.min(0.8, hit.stun));
    } else this.f.vel.addScaledVector(hit.dir, hit.knock);
    this.stun = Math.max(this.stun, hit.stun * 0.5);
    if (this.act === 'charge' || this.act === 'purple' || this.act === 'domain') this.cancelAct();
    return 'hit';
  }

  hurtRaw(dmg: number, from: THREE.Vector3) {
    this.hp -= dmg;
    this.sinceHurt = 0;
    const post = SD.renderer.post;
    post.damage = Math.min(1, post.damage + dmg / 140);
    this.cam.shake(Math.min(1, dmg / 120));
    const d = from.clone().sub(this.eye);
    const right = d.x * Math.cos(this.yaw) - d.z * Math.sin(this.yaw);
    this.cam.jolt(0.03 + dmg * 0.0004, right > 0 ? -0.03 : 0.03);
    SD.audio?.play('playerHurt', { volume: Math.min(1, 0.4 + dmg / 150) });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.onEvent?.('dead');
    }
  }

  private infinityRipple(p: THREE.Vector3) {
    // the attack stops a hand's breadth away: a ripple in space
    const toward = p.clone().sub(this.eye).normalize();
    const at = this.eye.clone().addScaledVector(toward, 1.1);
    setLens(0, at, 0.5, 0.7, SD.camera, 1, 0.35);
    SD.fx.burst(at, toward.clone().negate(), 10, 1.2, 1.8, 3, 6);
    SD.audio?.play('infinityBlock', { volume: 0.8 });
    this.cam.shake(0.08);
  }

  /** Post-frame visuals that need the camera (lens slots are re-set each frame). */
  get chargeK() {
    return this.act === 'charge' ? this.bf.ring : 0;
  }
}
