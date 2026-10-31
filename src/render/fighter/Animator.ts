import { clamp, ease, lerp } from '../../core/math';
import type { Fighter } from '../../sim/fighter';
import type { Simulation } from '../../sim/simulation';
import { C } from '../../sim/constants';
import type { ClipSet } from '../../sim/weapons';
import { actionClip, GRIP, POSES, seqClip, STANCES, type Clip, type Mark } from './clips';
import { copyPose, emptyJoints, ikArm, lerpPose, makePose, NEUTRAL, solve, type Joints, type Pose } from './skeleton';

/**
 * Turns a fighter's simulation state into a fluid, expressive pose every render frame:
 * phase-aligned keyframe clips, cross-fade blending, procedural locomotion, hit-reaction springs,
 * tumbling, breathing, foot planting, two-handed grip IK, afterimages, weapon-trail sampling and
 * a verlet-simulated accessory (scarf / hair / cape).
 */

export interface Ghost {
  joints: Joints;
  age: number;
  life: number;
  alpha: number;
}

export interface TrailPoint {
  bx: number;
  by: number;
  tx: number;
  ty: number;
  age: number;
}

interface SpringState {
  x: number;
  v: number;
}

const D2R = Math.PI / 180;

export class Animator {
  readonly set: ClipSet;
  readonly stance: Pose;
  /** Displayed pose (after blending + procedural layers). */
  pose: Pose = makePose({});
  joints: Joints = emptyJoints();
  /** World position the skeleton was solved at. */
  x = 0;
  y = 0;
  facing = 1;
  /** 0..1 opacity (vanish fades, dissolve). */
  opacity = 1;
  /** Is a strike currently snapping (for smear rendering)? */
  smear = 0;
  ghosts: Ghost[] = [];
  trail: TrailPoint[] = [];
  trail2: TrailPoint[] = [];
  /** Accessory chain points (world). */
  chain: { x: number; y: number; px: number; py: number }[] = [];
  /** Eye glow trail (head positions). */
  eyeTrail: { x: number; y: number; age: number }[] = [];
  /** Ground shadow scale (0..1 by height). */
  shadow = 1;

  private target: Pose = makePose({});
  private from: Pose = makePose({});
  private blended: Pose = makePose({});
  private blend = 1;
  private blendDur = 0.1;
  private lastKey = '';
  private springs: Record<'torso' | 'head' | 'arm1' | 'arm2' | 'dy', SpringState> = {
    torso: { x: 0, v: 0 }, head: { x: 0, v: 0 }, arm1: { x: 0, v: 0 }, arm2: { x: 0, v: 0 }, dy: { x: 0, v: 0 },
  };
  private lastHitTick = -999;
  private lastBlockTick = -999;
  private walkPhase = 0;
  private tumble = 0;
  private time = 0;
  private ghostTimer = 0;
  private lastWpnAngle = 0;
  private lastWpn2Angle = 0;
  private hasLastWpn = false;
  private lastFacing = 1;
  private lastState = '';
  readonly weaponLength: number;
  readonly twoHanded: boolean;
  readonly accessory: string;
  private styleBob: number;

  constructor(set: ClipSet, weaponLength: number, accessory: string, styleSeed: number) {
    this.set = set;
    this.stance = makePose(STANCES[set]);
    copyPose(this.stance, this.pose);
    copyPose(this.stance, this.target);
    copyPose(this.stance, this.from);
    this.weaponLength = weaponLength;
    this.twoHanded = GRIP[set] !== 0;
    this.accessory = accessory;
    this.styleBob = 0.8 + ((styleSeed % 1000) / 1000) * 0.5;
  }

  /* ------------------------------------------------------------------ */

  update(f: Fighter, sim: Simulation, dt: number, rx: number, ry: number, frac: number, override: { clip: string; t: number } | null = null): void {
    this.time += dt;
    const { key, pose, blendDur } = this.computeTarget(f, sim, frac, override);
    if (key !== this.lastKey) {
      copyPose(this.pose, this.from);
      this.blend = 0;
      this.blendDur = blendDur;
      this.lastKey = key;
    }
    copyPose(pose, this.target);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + (this.blendDur > 0 ? dt / this.blendDur : 1));
      lerpPose(this.from, this.target, ease.outCubic(this.blend), this.blended);
    } else {
      copyPose(this.target, this.blended);
    }

    // Hit reaction springs.
    if (f.lastHitTick !== this.lastHitTick) {
      this.lastHitTick = f.lastHitTick;
      const local = -f.lastHitDir * f.facing; // +1 = pushed forward, -1 = pushed back
      const lv = f.lastHitLevel;
      this.springs.torso.v += local * 380 * lv;
      this.springs.head.v += local * 520 * lv;
      this.springs.arm1.v += (Math.random() - 0.3) * 700 * lv;
      this.springs.arm2.v += (Math.random() - 0.7) * 700 * lv;
      this.springs.dy.v += 90 * lv;
    }
    if (f.lastBlockTick !== this.lastBlockTick) {
      this.lastBlockTick = f.lastBlockTick;
      this.springs.torso.v -= 160;
      this.springs.arm1.v += 260;
      this.springs.dy.v += 60;
    }
    for (const s of Object.values(this.springs)) {
      const k = 260, c = 18;
      s.v += (-k * s.x - c * s.v) * dt;
      s.x += s.v * dt;
    }

    const p = this.pose;
    copyPose(this.blended, p);
    p.torso += clamp(this.springs.torso.x, -40, 40);
    p.head += clamp(this.springs.head.x, -50, 50);
    p.ua1 += clamp(this.springs.arm1.x, -60, 60);
    p.ua2 += clamp(this.springs.arm2.x, -60, 60);
    p.dy += clamp(this.springs.dy.x, -10, 20);

    // Shake (power-ups, struggles).
    const clip = this.currentClipShake;
    if (clip > 0) {
      p.dx += (Math.random() - 0.5) * clip * 3;
      p.dy += (Math.random() - 0.5) * clip * 2;
      p.torso += (Math.random() - 0.5) * clip * 2;
    }

    // Solve.
    this.x = rx;
    this.y = ry;
    this.facing = f.facing;
    solve(p, rx, ry, f.facing, this.joints);

    // Foot planting for grounded states.
    if (this.grounded(f)) {
      const low = Math.max(this.joints.foot1[1], this.joints.foot2[1]);
      const off = ry - low;
      if (Math.abs(off) > 0.01 && Math.abs(off) < 60) this.offsetJoints(0, off);
    }

    // Two-handed grip IK.
    if (this.twoHanded && this.gripActive(f)) {
      const j = this.joints;
      const g = GRIP[this.set];
      const target: [number, number] = [j.hand1[0] + Math.cos(j.wpnAngle) * g, j.hand1[1] + Math.sin(j.wpnAngle) * g];
      ikArm(j.shoulder, target, f.facing > 0 ? 1 : -1, j.elbow2, j.hand2);
    }

    // Shadow (height-based).
    const height = Math.max(0, -ry);
    this.shadow = clamp(1 - height / 600, 0.15, 1);

    // Opacity.
    this.opacity = this.computeOpacity(f);

    // Facing flip bookkeeping.
    if (f.facing !== this.lastFacing) {
      this.lastFacing = f.facing;
      this.hasLastWpn = false;
      this.trail.length = 0;
      this.trail2.length = 0;
    }
    if (f.state !== this.lastState) {
      if (f.state === 'appear' || this.lastState === 'vanish') this.resetChain();
      this.lastState = f.state;
    }

    this.updateTrails(f, dt);
    this.updateGhosts(f, dt);
    this.updateChain(f, dt);
    this.updateEyes(dt);
  }

  private currentClipShake = 0;

  private offsetJoints(dx: number, dy: number): void {
    const j = this.joints;
    for (const k of ['hip', 'neck', 'head', 'shoulder', 'elbow1', 'hand1', 'elbow2', 'hand2', 'knee1', 'foot1', 'knee2', 'foot2'] as const) {
      j[k][0] += dx;
      j[k][1] += dy;
    }
  }

  private grounded(f: Fighter): boolean {
    if (!f.grounded) return false;
    switch (f.state) {
      case 'knockdown': case 'getup': case 'dead': case 'locked': case 'vanish': case 'wallsplat': case 'bound':
        return false;
      case 'action':
        return !(f.action?.def.slot !== undefined && f.action.data.float === 1);
      default:
        return true;
    }
  }

  private gripActive(f: Fighter): boolean {
    switch (f.state) {
      case 'idle': case 'walk': case 'crouch': case 'block': case 'land': case 'appear': case 'parry': case 'dash': case 'backdash': case 'air': case 'intro':
        return true;
      case 'action': {
        const k = f.action?.def.kind;
        return k === 'light' || k === 'heavy' || k === 'launcher' || k === 'sweep' || k === 'dashAttack' || k === 'air' || k === 'airSlam';
      }
      case 'locked':
        return f.anim?.clip === 'lock.push' || f.anim?.clip === 'counter.ready' || f.anim?.clip === 'fin.sheathReady';
      default:
        return false;
    }
  }

  private computeOpacity(f: Fighter): number {
    if (f.state === 'vanish') return 0;
    if (f.state === 'dead') return 0;
    if (f.anim?.clip === 'fin.dissolve') return clamp(1 - f.anim.t / 34, 0, 1);
    if (f.anim?.clip === 'blitz.vanish') return 0.18;
    if (f.anim?.clip === 'counter.vanish') return 0;
    if (f.hasBuff('phase')) return 0.38 + Math.sin(this.time * 30) * 0.08;
    if (f.state === 'appear' && f.stateT < 3) return 0.5;
    return 1;
  }

  /* ------------------------------------------------------------------ */
  /* Target pose selection                                              */
  /* ------------------------------------------------------------------ */

  private tmp: Pose = makePose({});

  private computeTarget(f: Fighter, sim: Simulation, frac: number, override: { clip: string; t: number } | null): { key: string; pose: Pose; blendDur: number } {
    const out = this.tmp;
    this.currentClipShake = 0;
    const st = this.stance;
    // Sequence override (simulation) or presentation override (intro choreography).
    const anim = override ?? f.anim;
    if (anim) {
      const clip = seqClip(anim.clip, this.set);
      if (clip) {
        this.sampleTicks(clip, anim.t + frac, out);
        this.currentClipShake = clip.shake ?? 0;
        if (anim.clip === 'fin.walk') this.locomotion(out, f, 0.6, false, override ? 260 : undefined);
        return { key: `seq:${anim.clip}`, pose: out, blendDur: anim.clip.startsWith('blitz') || anim.clip.startsWith('tc.') ? 0.02 : 0.09 };
      }
      if (anim.clip === 'appear') {
        copyPose(st, out);
        Object.assign(out, POSES.appear);
        return { key: 'ov:appear', pose: out, blendDur: 0.01 };
      }
    }
    switch (f.state) {
      case 'action': {
        const a = f.action!;
        const clip = actionClip(a.def.clip, this.set);
        if (clip) {
          this.sampleAction(clip, f, frac, out);
          this.currentClipShake = clip.shake ?? 0;
          return { key: `act:${a.uid}`, pose: out, blendDur: 0.035 };
        }
        copyPose(st, out);
        return { key: 'act:none', pose: out, blendDur: 0.05 };
      }
      case 'idle': case 'intro': {
        copyPose(st, out);
        const b = Math.sin(this.time * 3.2 * this.styleBob);
        out.dy += b * 1.6 + 1;
        out.torso += b * 1.4;
        out.head -= b * 1.2;
        if (f.hp < f.maxHp * 0.25) {
          // Exhausted: hunched, heavier breathing.
          out.torso += 10 + Math.sin(this.time * 6) * 3;
          out.head += 10;
          out.dy += 4;
        }
        return { key: 'idle', pose: out, blendDur: 0.14 };
      }
      case 'walk':
        copyPose(st, out);
        this.locomotion(out, f, 1, false);
        return { key: 'walk', pose: out, blendDur: 0.12 };
      case 'run':
        copyPose(st, out);
        Object.assign(out, this.set === 'fist' ? POSES.runFist : POSES.run);
        this.locomotion(out, f, 1.6, true);
        return { key: 'run', pose: out, blendDur: 0.1 };
      case 'dash':
        copyPose(st, out);
        Object.assign(out, POSES.dash);
        return { key: 'dash', pose: out, blendDur: 0.04 };
      case 'backdash':
        copyPose(st, out);
        Object.assign(out, POSES.backdash);
        return { key: 'backdash', pose: out, blendDur: 0.05 };
      case 'crouch':
        copyPose(st, out);
        Object.assign(out, POSES.crouch);
        return { key: 'crouch', pose: out, blendDur: 0.08 };
      case 'block': {
        copyPose(st, out);
        const p = f.blockLow ? POSES.crouchBlock : this.set === 'fist' ? POSES.blockFist : this.set === 'pole' ? POSES.blockPole : POSES.blockBlade;
        Object.assign(out, p);
        return { key: f.blockLow ? 'blockLow' : 'block', pose: out, blendDur: 0.05 };
      }
      case 'parry': {
        copyPose(st, out);
        Object.assign(out, POSES.parry);
        const k = clamp(f.parryT / C.PARRY_WINDOW, 0, 1);
        out.ua1 += (1 - k) * 30;
        return { key: 'parry', pose: out, blendDur: 0.025 };
      }
      case 'dodge': {
        copyPose(st, out);
        if (f.moveDir !== 0) {
          Object.assign(out, POSES.roll);
          const k = clamp(f.stateT / C.ROLL_T, 0, 1);
          out.spin = 360 * ease.inOutQuad(k) * (f.moveDir === f.facing ? 1 : -1);
          if (k > 0.85) out.spin = 0;
        } else {
          Object.assign(out, POSES.dodge);
        }
        return { key: `dodge${f.moveDir}`, pose: out, blendDur: 0.04 };
      }
      case 'jumpsquat': case 'land':
        copyPose(st, out);
        Object.assign(out, POSES.land);
        return { key: 'land', pose: out, blendDur: 0.04 };
      case 'air': {
        copyPose(st, out);
        const up = f.vy < -150;
        Object.assign(out, up ? POSES.airUp : POSES.airDown);
        // Double-jump flip.
        if (f.airJumps === 0 && f.vy < 200) out.spin = (f.stateT * 22) % 360;
        if (f.canFly) {
          out.th1 = 14 + Math.sin(this.time * 4) * 6;
          out.th2 = -10 + Math.sin(this.time * 4 + 1) * 6;
          out.spin = 0;
        }
        return { key: up ? 'airUp' : 'airDown', pose: out, blendDur: 0.12 };
      }
      case 'airdash':
        copyPose(st, out);
        Object.assign(out, POSES.airdash);
        return { key: 'airdash', pose: out, blendDur: 0.04 };
      case 'hitstun': {
        copyPose(st, out);
        const p = f.lastHitLevel >= 3 ? POSES.hitHeavy : f.blockLow ? POSES.hitLow : POSES.hitLight;
        Object.assign(out, p);
        return { key: `hit${f.lastHitTick}`, pose: out, blendDur: 0.02 };
      }
      case 'launched': {
        copyPose(st, out);
        Object.assign(out, POSES.launched);
        const spinRate = clamp(Math.abs(f.vx) / 900 + Math.abs(f.vy) / 1500, 0.3, 1.6);
        this.tumble += spinRate * 9 * (f.lastHitDir * f.facing > 0 ? 1 : -1);
        out.spin = this.tumble;
        return { key: 'launched', pose: out, blendDur: 0.03 };
      }
      case 'wallsplat':
        copyPose(st, out);
        Object.assign(out, POSES.wallsplat);
        return { key: 'wallsplat', pose: out, blendDur: 0.02 };
      case 'knockdown':
        this.tumble = 0;
        copyPose(st, out);
        Object.assign(out, POSES.knockdown);
        return { key: 'knockdown', pose: out, blendDur: 0.06 };
      case 'getup': case 'tech': {
        copyPose(st, out);
        const k = clamp(f.stateT / (f.state === 'tech' ? C.TECH_T : C.GETUP_T), 0, 1);
        if (f.state === 'tech') {
          Object.assign(out, POSES.roll);
          out.spin = -360 * ease.outQuad(k) * Math.sign(f.vx * f.facing || 1);
          if (k > 0.8) copyPose(lerpPose(out, st, (k - 0.8) / 0.2, this.tmp2), out);
        } else {
          const lying = makePose(POSES.knockdown, st);
          const crouched = makePose(POSES.appear, st);
          if (k < 0.5) lerpPose(lying, crouched, ease.outCubic(k / 0.5), out);
          else lerpPose(crouched, st, ease.inOutQuad((k - 0.5) / 0.5), out);
        }
        return { key: f.state, pose: out, blendDur: 0.02 };
      }
      case 'guardbreak': case 'parried': case 'stagger': {
        copyPose(st, out);
        Object.assign(out, POSES.stagger);
        out.torso += Math.sin(this.time * 9) * 4;
        return { key: 'stagger', pose: out, blendDur: 0.03 };
      }
      case 'charge':
        copyPose(st, out);
        Object.assign(out, POSES.charge);
        this.currentClipShake = 1.6;
        return { key: 'charge', pose: out, blendDur: 0.1 };
      case 'burst':
        copyPose(st, out);
        Object.assign(out, POSES.burst);
        return { key: 'burst', pose: out, blendDur: 0.02 };
      case 'vanish':
        copyPose(st, out);
        Object.assign(out, POSES.vanish);
        return { key: 'vanish', pose: out, blendDur: 0.02 };
      case 'appear':
        copyPose(st, out);
        Object.assign(out, POSES.appear);
        return { key: 'appear', pose: out, blendDur: 0.01 };
      case 'bound':
        copyPose(st, out);
        Object.assign(out, POSES.bound);
        this.currentClipShake = 1.0;
        return { key: 'bound', pose: out, blendDur: 0.05 };
      case 'victory': {
        const clip = seqClip(`victory.${f.def.personality}`, this.set);
        if (clip) {
          this.sampleTicks(clip, f.stateT + frac, out);
          this.currentClipShake = clip.shake ?? 0;
          out.dy += Math.sin(this.time * 2) * 1.2;
        } else copyPose(st, out);
        return { key: 'victory', pose: out, blendDur: 0.35 };
      }
      case 'dead':
        copyPose(st, out);
        Object.assign(out, POSES.knockdown);
        return { key: 'dead', pose: out, blendDur: 0.2 };
      default:
        copyPose(st, out);
        return { key: f.state, pose: out, blendDur: 0.1 };
    }
  }

  private tmp2: Pose = makePose({});

  /** Procedural walk / run cycle layered on top of a base pose. */
  private locomotion(out: Pose, f: Fighter, amp: number, run: boolean, forcedSpeed?: number): void {
    const speed = forcedSpeed ?? Math.abs(f.vx);
    const stride = run ? 120 : 70;
    this.walkPhase += (speed / stride) * (1 / 60) * Math.PI * 2 * 0.9 + 0.001;
    const ph = this.walkPhase;
    const dir = forcedSpeed !== undefined ? 1 : Math.sign(f.vx) * f.facing || 1; // +1 walking forward
    const A = (run ? 46 : 26) * amp * clamp(speed / (run ? 600 : 260), 0.25, 1.2);
    const s = Math.sin(ph) * dir;
    out.th1 = (run ? 10 : 6) + A * s;
    out.th2 = (run ? -4 : -6) - A * s;
    out.sh1 = -14 - (run ? 70 : 32) * Math.max(0, Math.cos(ph)) * amp;
    out.sh2 = -14 - (run ? 70 : 32) * Math.max(0, -Math.cos(ph)) * amp;
    out.dy += Math.abs(Math.sin(ph)) * (run ? -5 : -2.5) + (run ? 6 : 3);
    if (this.set === 'fist' || run) {
      out.ua1 += -A * 0.6 * s;
      out.ua2 += A * 0.6 * s;
    } else {
      out.ua1 += Math.sin(ph * 2) * 3;
    }
    out.torso += run ? 4 : 2;
  }

  private sampleAction(clip: Clip, f: Fighter, frac: number, out: Pose): void {
    const a = f.action!;
    const s = a.def.startup + a.hold;
    const act = a.def.active;
    const total = s + act + a.def.recovery + (a.whiffed ? 4 : 0);
    const marks: Record<Mark, number> = { start: 0, wind: Math.max(1, s - 1), hit: s + Math.min(2, act), follow: s + act, end: total };
    const t = Math.min(total, a.frame + frac);
    const st = this.stance;
    // Build key list on the fly.
    let prevT = 0;
    let prevPose = st;
    let hasExplicitStart = false;
    this.smear = 0;
    for (let i = 0; i <= clip.keys.length; i++) {
      const key = i < clip.keys.length ? clip.keys[i] : null;
      const kt = key ? (typeof key.at === 'number' ? key.at : marks[key.at]) : total;
      if (key && key.at === 'start') hasExplicitStart = true;
      const kp = key ? makePose(key.pose, st) : st;
      if (i === 0 && hasExplicitStart && kt === 0) {
        prevPose = kp;
        prevT = 0;
        continue;
      }
      if (t <= kt || !key) {
        const span = Math.max(0.0001, kt - prevT);
        const k = clamp((t - prevT) / span, 0, 1);
        const e = key?.ease ? ease[key.ease](k) : ease.inOutQuad(k);
        lerpPose(prevPose, kp, e, out);
        if (key && key.at === 'hit' && k < 1) this.smear = 1;
        return;
      }
      prevT = kt;
      prevPose = kp;
    }
    copyPose(prevPose, out);
  }

  private sampleTicks(clip: Clip, t: number, out: Pose): void {
    const st = this.stance;
    const keys = clip.keys;
    if (clip.loop && clip.loop > 0) t = t % clip.loop;
    if (keys.length === 1 || t <= (keys[0].at as number)) {
      copyPose(makePose(keys[0].pose, st), out);
      return;
    }
    for (let i = 1; i < keys.length; i++) {
      const k0 = keys[i - 1], k1 = keys[i];
      const t0 = k0.at as number, t1 = k1.at as number;
      if (t <= t1) {
        const k = clamp((t - t0) / Math.max(0.0001, t1 - t0), 0, 1);
        const e = k1.ease ? ease[k1.ease](k) : ease.inOutQuad(k);
        lerpPose(makePose(k0.pose, st), makePose(k1.pose, st), e, out);
        return;
      }
    }
    copyPose(makePose(keys[keys.length - 1].pose, st), out);
  }

  /* ------------------------------------------------------------------ */
  /* Secondary motion                                                   */
  /* ------------------------------------------------------------------ */

  /** Weapon base/tip in world for weapon 1 or 2. */
  weaponSegment(which: 1 | 2): { bx: number; by: number; tx: number; ty: number } {
    const j = this.joints;
    const h = which === 1 ? j.hand1 : j.hand2;
    const a = which === 1 ? j.wpnAngle : j.wpn2Angle;
    const L = this.weaponLength;
    const back = this.set === 'pole' ? L * 0.35 : 6;
    return {
      bx: h[0] - Math.cos(a) * back, by: h[1] - Math.sin(a) * back,
      tx: h[0] + Math.cos(a) * (L - back), ty: h[1] + Math.sin(a) * (L - back),
    };
  }

  private updateTrails(f: Fighter, dt: number): void {
    for (const t of this.trail) t.age += dt;
    for (const t of this.trail2) t.age += dt;
    while (this.trail.length && this.trail[0].age > 0.11) this.trail.shift();
    while (this.trail2.length && this.trail2[0].age > 0.11) this.trail2.shift();
    if (this.opacity <= 0.05) {
      this.hasLastWpn = false;
      return;
    }
    const j = this.joints;
    const attacking = f.state === 'action' || f.state === 'locked' || f.state === 'parry';
    const a1 = j.wpnAngle, a2 = j.wpn2Angle;
    if (this.hasLastWpn && attacking) {
      const push = (trail: TrailPoint[], which: 1 | 2, from: number, to: number) => {
        let d = to - from;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const steps = Math.min(8, Math.ceil(Math.abs(d) / (12 * D2R)));
        if (Math.abs(d) < 4 * D2R && trail.length === 0) return;
        const h = which === 1 ? j.hand1 : j.hand2;
        const L = this.weaponLength;
        const back = this.set === 'pole' ? L * 0.35 : 6;
        for (let s = 1; s <= steps; s++) {
          const ang = from + (d * s) / steps;
          trail.push({
            bx: h[0] + Math.cos(ang) * (L * 0.25), by: h[1] + Math.sin(ang) * (L * 0.25),
            tx: h[0] + Math.cos(ang) * (L - back), ty: h[1] + Math.sin(ang) * (L - back),
            age: (dt * (steps - s)) / steps,
          });
        }
      };
      push(this.trail, 1, this.lastWpnAngle, a1);
      if (this.set === 'dual') push(this.trail2, 2, this.lastWpn2Angle, a2);
    }
    this.lastWpnAngle = a1;
    this.lastWpn2Angle = a2;
    this.hasLastWpn = true;
    if (this.trail.length > 40) this.trail.splice(0, this.trail.length - 40);
    if (this.trail2.length > 40) this.trail2.splice(0, this.trail2.length - 40);
  }

  private updateGhosts(f: Fighter, dt: number): void {
    for (const g of this.ghosts) g.age += dt;
    this.ghosts = this.ghosts.filter((g) => g.age < g.life);
    if (this.opacity < 0.3) return;
    const fast = Math.abs(f.vx) > 760 || Math.abs(f.vy) > 1300 || f.state === 'dash' || f.state === 'airdash' ||
      (f.state === 'action' && (f.action?.def.kind === 'dashAttack' || f.action?.data.noPush === 1)) || f.anim?.clip === 'tc.cut' || f.anim?.clip === 'blitz.strike' ||
      f.anim?.clip === 'fin.dash' || f.anim?.clip === 'fin.slashThrough' || f.anim?.clip === 'final.dash' || f.hasBuff('ascended') && Math.abs(f.vx) > 400;
    this.ghostTimer -= dt;
    if (fast && this.ghostTimer <= 0) {
      this.ghostTimer = 0.028;
      this.ghosts.push({ joints: cloneJoints(this.joints), age: 0, life: 0.24, alpha: 0.55 });
      if (this.ghosts.length > 10) this.ghosts.shift();
    }
  }

  private resetChain(): void {
    this.chain.length = 0;
  }

  private chainAnchor(): [number, number] {
    const j = this.joints;
    const back = -this.facing;
    switch (this.accessory) {
      case 'ponytail': case 'longhair':
        return [j.head[0] + back * 6, j.head[1] - 4];
      case 'headband':
        return [j.head[0] + back * 9, j.head[1] - 2];
      case 'cape':
        return [j.neck[0] + back * 3, j.neck[1] + 2];
      default:
        return [j.neck[0] + back * 4, j.neck[1] + 1];
    }
  }

  private updateChain(f: Fighter, dt: number): void {
    const acc = this.accessory;
    if (acc === 'halo' || acc === 'horns') return;
    const N = acc === 'cape' ? 7 : acc === 'longhair' ? 8 : acc === 'headband' ? 5 : acc === 'ponytail' ? 6 : 8;
    const seg = acc === 'cape' ? 10 : acc === 'scarf' ? 8 : acc === 'headband' ? 6 : 7;
    const [ax, ay] = this.chainAnchor();
    if (this.chain.length !== N) {
      this.chain = Array.from({ length: N }, (_, i) => ({ x: ax - this.facing * seg * i, y: ay + i * 2, px: ax - this.facing * seg * i, py: ay + i * 2 }));
    }
    const step = Math.min(dt, 1 / 30);
    const g = acc === 'cape' ? 700 : 900;
    const drag = 0.9;
    const wind = Math.sin(this.time * 7.3) * 30 - this.facing * 60;
    for (let i = 1; i < N; i++) {
      const p = this.chain[i];
      const vx = (p.x - p.px) * drag, vy = (p.y - p.py) * drag;
      p.px = p.x;
      p.py = p.y;
      p.x += vx + (wind * step * step) * (i / N) * 12;
      p.y += vy + g * step * step;
    }
    const c0 = this.chain[0];
    c0.px = c0.x;
    c0.py = c0.y;
    c0.x = ax;
    c0.y = ay;
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < N; i++) {
        const a = this.chain[i - 1], b = this.chain[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - seg) / d;
        if (i === 1) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
      // Keep above ground.
      for (const p of this.chain) if (p.y > this.y + 2 && this.grounded(f)) p.y = this.y + 2;
    }
  }

  private updateEyes(dt: number): void {
    for (const e of this.eyeTrail) e.age += dt;
    while (this.eyeTrail.length && this.eyeTrail[0].age > 0.16) this.eyeTrail.shift();
    const h = this.joints.head;
    const last = this.eyeTrail[this.eyeTrail.length - 1];
    if (!last || Math.hypot(last.x - h[0], last.y - h[1]) > 3) this.eyeTrail.push({ x: h[0], y: h[1], age: 0 });
    if (this.eyeTrail.length > 24) this.eyeTrail.shift();
  }
}

export function cloneJoints(j: Joints): Joints {
  const c = (p: [number, number]): [number, number] => [p[0], p[1]];
  return {
    hip: c(j.hip), neck: c(j.neck), head: c(j.head), shoulder: c(j.shoulder), elbow1: c(j.elbow1), hand1: c(j.hand1),
    elbow2: c(j.elbow2), hand2: c(j.hand2), knee1: c(j.knee1), foot1: c(j.foot1), knee2: c(j.knee2), foot2: c(j.foot2),
    wpnAngle: j.wpnAngle, wpn2Angle: j.wpn2Angle, fore1Angle: j.fore1Angle, fore2Angle: j.fore2Angle, spineDirX: j.spineDirX, spineDirY: j.spineDirY,
  };
}

/** Exposed for the portrait renderer / tests. */
export function stancePose(set: ClipSet): Pose {
  return makePose(STANCES[set], NEUTRAL);
}

export { lerp };
